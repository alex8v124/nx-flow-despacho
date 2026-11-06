// Capa de acceso a DynamoDB — Single-Table Design.
//
//   PK                 SK                     Entidad
//   SEDE#<sedeId>      META                   Datos de la sede (nombre, WhatsApp)
//   SEDE#<sedeId>      STOCK#<sku>            Stock disponible + reservado + precio por sede
//   SEDE#<sedeId>      ORDER#<orderId>        Pedido (reserva) con líneas y totales
//   SEDE#<sedeId>      SEQ#<serie>            Correlativo atómico de comprobantes (SUNAT)
//   WEBHOOK#<provider> EVT#<eventId>          Evento entrante deduplicado (TTL 90 días)
//
// La reserva de stock usa TransactWriteItems + ConditionExpression `stock >= :qty`:
// o se reservan TODAS las líneas del pedido o ninguna. Dos vendedores no pueden vender
// la última unidad a la vez: DynamoDB serializa la condición a nivel de ítem.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchGetCommand,
  GetCommand,
  UpdateCommand,
  PutCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';

export const keys = {
  sede: (sedeId) => `SEDE#${sedeId}`,
  stock: (sku) => `STOCK#${sku}`,
  order: (orderId) => `ORDER#${orderId}`,
  seq: (serie) => `SEQ#${serie}`,
  meta: () => 'META',
};

export function createRawClient({ region, dynamoEndpoint }) {
  return new DynamoDBClient({
    region,
    ...(dynamoEndpoint
      ? { endpoint: dynamoEndpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
      : {}),
  });
}

export function createDocClient(config) {
  return DynamoDBDocumentClient.from(createRawClient(config), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Los CancellationReasons pueden venir en formato AttributeValue ({ N: "3" }) o ya deserializados.
const readNumber = (v) => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'N' in v) return Number(v.N);
  return Number(v);
};

const isTxCanceled = (err) => err?.name === 'TransactionCanceledException';

const reasonsOf = (err) => (err.CancellationReasons || []).map((r) => ({ code: r?.Code || 'None', item: r?.Item }));

export function createRepository({ doc, tableName, now = () => new Date() }) {
  /**
   * Ejecuta una transacción reintentando sólo ante TransactionConflict (contención entre
   * transacciones concurrentes sobre el mismo ítem). Los ConditionalCheckFailed NO se
   * reintentan: son una respuesta de negocio (sin stock, pedido duplicado, estado inválido).
   */
  async function transact(items, { maxAttempts = 8 } = {}) {
    for (let attempt = 1; ; attempt++) {
      try {
        await doc.send(new TransactWriteCommand({ TransactItems: items }));
        return { ok: true, attempts: attempt };
      } catch (err) {
        if (!isTxCanceled(err)) throw err;
        const reasons = reasonsOf(err);
        const businessFailure = reasons.some((r) => r.code === 'ConditionalCheckFailed');
        const conflictOnly = !businessFailure && reasons.some((r) => r.code === 'TransactionConflict');
        if (conflictOnly && attempt < maxAttempts) {
          const backoff = Math.min(400, 20 * 2 ** attempt);
          await sleep(backoff / 2 + Math.random() * backoff); // full jitter
          continue;
        }
        return { ok: false, reasons, attempts: attempt, conflict: conflictOnly };
      }
    }
  }

  return {
    async listStock(sedeId) {
      const items = [];
      let ExclusiveStartKey;
      do {
        const res = await doc.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: { ':pk': keys.sede(sedeId), ':sk': 'STOCK#' },
            ExclusiveStartKey,
          }),
        );
        items.push(...(res.Items || []));
        ExclusiveStartKey = res.LastEvaluatedKey;
      } while (ExclusiveStartKey);
      return items;
    },

    async getStockItems(sedeId, skus) {
      const out = new Map();
      for (let i = 0; i < skus.length; i += 100) {
        let request = {
          [tableName]: {
            Keys: skus.slice(i, i + 100).map((sku) => ({ PK: keys.sede(sedeId), SK: keys.stock(sku) })),
          },
        };
        for (let attempt = 0; request && Object.keys(request).length; attempt++) {
          if (attempt > 0) await sleep(Math.min(500, 25 * 2 ** attempt));
          const res = await doc.send(new BatchGetCommand({ RequestItems: request }));
          for (const item of res.Responses?.[tableName] || []) out.set(item.sku, item);
          request = res.UnprocessedKeys;
          if (attempt > 6) throw new Error('BatchGet: claves sin procesar tras reintentos');
        }
      }
      return out;
    },

    async getOrder(sedeId, orderId) {
      const res = await doc.send(
        new GetCommand({ TableName: tableName, Key: { PK: keys.sede(sedeId), SK: keys.order(orderId) } }),
      );
      return res.Item;
    },

    /** Reserva atómica: crea el pedido y descuenta stock de todas las líneas, o nada. */
    async reserveOrder(order) {
      const ts = now().toISOString();
      const pk = keys.sede(order.sedeId);
      const tx = [
        {
          Put: {
            TableName: tableName,
            Item: { PK: pk, SK: keys.order(order.orderId), entity: 'ORDER', ...order },
            ConditionExpression: 'attribute_not_exists(PK)', // idempotencia por orderId
          },
        },
        ...order.lines.map((line) => ({
          Update: {
            TableName: tableName,
            Key: { PK: pk, SK: keys.stock(line.sku) },
            UpdateExpression:
              'SET #stock = #stock - :qty, #reserved = if_not_exists(#reserved, :zero) + :qty, #updatedAt = :ts ADD #version :one',
            ConditionExpression: 'attribute_exists(PK) AND #stock >= :qty AND #price = :price',
            ExpressionAttributeNames: {
              '#stock': 'stock',
              '#reserved': 'reserved',
              '#updatedAt': 'updatedAt',
              '#version': 'version',
              '#price': 'priceCents',
            },
            ExpressionAttributeValues: { ':qty': line.qty, ':zero': 0, ':one': 1, ':ts': ts, ':price': line.unitPriceCents },
            ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
          },
        })),
      ];

      const res = await transact(tx);
      if (res.ok) return { ok: true, attempts: res.attempts };
      if (res.conflict) return { ok: false, kind: 'CONTENTION' };
      if (res.reasons[0]?.code === 'ConditionalCheckFailed') return { ok: false, kind: 'DUPLICATE' };

      const failures = [];
      res.reasons.slice(1).forEach((r, i) => {
        if (r.code !== 'ConditionalCheckFailed') return;
        const line = order.lines[i];
        const available = readNumber(r.item?.stock);
        const currentPrice = readNumber(r.item?.priceCents);
        let reason = 'OUT_OF_STOCK';
        if (!r.item) reason = 'UNKNOWN_SKU';
        else if (currentPrice !== line.unitPriceCents && available >= line.qty) reason = 'PRICE_CHANGED';
        failures.push({ sku: line.sku, requested: line.qty, available: available ?? 0, reason });
      });
      return { ok: false, kind: 'CONDITION', failures };
    },

    /**
     * Transición de estado del pedido con liberación/consumo atómico de la reserva.
     *   confirm: RESERVED -> CONFIRMED  (reserved -= qty; el stock ya fue descontado)
     *   cancel : RESERVED -> CANCELLED  (stock += qty, reserved -= qty)
     */
    async transitionOrder(order, action) {
      const ts = now().toISOString();
      const pk = keys.sede(order.sedeId);
      const to = action === 'confirm' ? 'CONFIRMED' : 'CANCELLED';
      const stockExpr =
        action === 'confirm'
          ? 'SET #reserved = #reserved - :qty, #updatedAt = :ts ADD #version :one'
          : 'SET #stock = #stock + :qty, #reserved = #reserved - :qty, #updatedAt = :ts ADD #version :one';

      const tx = [
        {
          Update: {
            TableName: tableName,
            Key: { PK: pk, SK: keys.order(order.orderId) },
            UpdateExpression: 'SET #status = :to, #updatedAt = :ts',
            ConditionExpression: '#status = :from',
            ExpressionAttributeNames: { '#status': 'status', '#updatedAt': 'updatedAt' },
            ExpressionAttributeValues: { ':to': to, ':from': 'RESERVED', ':ts': ts },
          },
        },
        ...order.lines.map((line) => ({
          Update: {
            TableName: tableName,
            Key: { PK: pk, SK: keys.stock(line.sku) },
            UpdateExpression: stockExpr,
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeNames: {
              ...(action === 'cancel' ? { '#stock': 'stock' } : {}),
              '#reserved': 'reserved',
              '#updatedAt': 'updatedAt',
              '#version': 'version',
            },
            ExpressionAttributeValues: { ':qty': line.qty, ':ts': ts, ':one': 1 },
          },
        })),
      ];
      const res = await transact(tx);
      if (res.ok) return { ok: true, status: to, updatedAt: ts };
      if (res.conflict) return { ok: false, kind: 'CONTENTION' };
      return { ok: false, kind: 'STATE' };
    },

    async patchOrder(sedeId, orderId, field, value) {
      try {
        await doc.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { PK: keys.sede(sedeId), SK: keys.order(orderId) },
            UpdateExpression: 'SET #f = :v, #updatedAt = :ts',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeNames: { '#f': field, '#updatedAt': 'updatedAt' },
            ExpressionAttributeValues: { ':v': value, ':ts': now().toISOString() },
          }),
        );
        return true;
      } catch (err) {
        if (err?.name === 'ConditionalCheckFailedException') return false;
        throw err;
      }
    },

    /** Correlativo atómico por sede/serie (numeración de comprobantes sin huecos por carrera). */
    async nextSequence(sedeId, serie) {
      const res = await doc.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: keys.sede(sedeId), SK: keys.seq(serie) },
          UpdateExpression: 'ADD #seq :one',
          ExpressionAttributeNames: { '#seq': 'seq' },
          ExpressionAttributeValues: { ':one': 1 },
          ReturnValues: 'UPDATED_NEW',
        }),
      );
      return res.Attributes.seq;
    },

    /** Guarda el evento del webhook una sola vez (deduplicación por eventId). */
    async putWebhookEvent(provider, eventId, payload) {
      const ttl = Math.floor(now().getTime() / 1000) + 90 * 24 * 3600;
      try {
        await doc.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              PK: `WEBHOOK#${provider}`,
              SK: `EVT#${eventId}`,
              entity: 'WEBHOOK_EVENT',
              receivedAt: now().toISOString(),
              payload,
              ttl,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          }),
        );
        return { duplicate: false };
      } catch (err) {
        if (err?.name === 'ConditionalCheckFailedException') return { duplicate: true };
        throw err;
      }
    },

    /** Contador atómico en DynamoDB para fuga de ventas por quiebre de stock */
    async recordMissedDemand(sedeId, { sku, name, priceCents, requestedQty = 1 }) {
      const lostCents = (priceCents || 0) * requestedQty;
      await doc.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: keys.sede(sedeId), SK: `MISSED#${sku}` },
          UpdateExpression: 'ADD #lost :lost, #count :qty SET #name = :name, #updatedAt = :ts',
          ExpressionAttributeNames: { '#lost': 'totalLostCents', '#count': 'missedCount', '#name': 'name', '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: { ':lost': lostCents, ':qty': requestedQty, ':name': name || sku, ':ts': now().toISOString() },
        })
      );
    },

    /** Consulta agregada de productos con quiebre de stock para el Gerente Comercial */
    async listMissedDemand(sedeId) {
      const res = await doc.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': keys.sede(sedeId), ':sk': 'MISSED#' },
        })
      );
      return (res.Items || []).map((item) => ({
        sku: item.SK.replace('MISSED#', ''),
        name: item.name,
        missedCount: item.missedCount || 0,
        totalLostCents: item.totalLostCents || 0,
        updatedAt: item.updatedAt,
      })).sort((a, b) => b.totalLostCents - a.totalLostCents);
    },

    /** Contador atómico en DynamoDB para búsquedas sin resultados (Telemetría de Demanda Oculta) */
    async recordZeroSearch(sedeId, term) {
      const cleanTerm = String(term || '').toLowerCase().trim().slice(0, 80);
      if (!cleanTerm) return;
      await doc.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: keys.sede(sedeId), SK: `SEARCH_ZERO#${cleanTerm}` },
          UpdateExpression: 'ADD #cnt :one SET #term = :term, #updatedAt = :ts',
          ExpressionAttributeNames: { '#cnt': 'searchCount', '#term': 'term', '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: { ':one': 1, ':term': cleanTerm, ':ts': now().toISOString() },
        }),
      );
    },

    /** Consulta de búsquedas con cero resultados para abastecimiento e importaciones */
    async listZeroSearches(sedeId) {
      const res = await doc.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': keys.sede(sedeId), ':sk': 'SEARCH_ZERO#' },
        }),
      );
      return (res.Items || []).map((item) => ({
        term: item.term,
        searchCount: item.searchCount || 0,
        updatedAt: item.updatedAt,
      })).sort((a, b) => b.searchCount - a.searchCount);
    },
  };
}
