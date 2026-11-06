// Lógica de negocio: pricing del lado servidor, idempotencia y transiciones de pedido.
import { createHash } from 'node:crypto';
import { AppError, conflict, notFound } from './errors.mjs';
import { lineTotal, splitIgv } from './money.mjs';
import { validateOrderInput, assertSede, assertOrderId } from './validation.mjs';

// Huella del contenido del pedido: si un cliente reintenta con el mismo orderId pero
// distinto contenido, se rechaza (protección de idempotencia estilo pasarela bancaria).
const fingerprint = (input) =>
  createHash('sha256')
    .update(JSON.stringify({ s: input.sedeId, i: input.items }))
    .digest('hex');

const publicOrder = (o) => {
  if (!o) return o;
  const { PK, SK, entity, requestHash, ...rest } = o;
  return rest;
};

export function createService({ repo, config, integrations = {}, now = () => new Date() }) {
  return {
    async getStock(sedeId) {
      assertSede(sedeId);
      const items = await repo.listStock(sedeId);
      return {
        sedeId,
        generatedAt: now().toISOString(),
        items: items
          .map(({ sku, name, category, unit, priceCents, stock }) => ({ sku, name, category, unit, priceCents, stock }))
          .sort((a, b) => a.sku.localeCompare(b.sku)),
      };
    },

    async createOrder(body) {
      const input = validateOrderInput(body);
      const requestHash = fingerprint(input);

      // 1) Precios y existencia leídos del servidor (el cliente nunca fija precios).
      const stock = await repo.getStockItems(input.sedeId, input.items.map((i) => i.sku));
      const unknown = input.items.filter((i) => !stock.has(i.sku)).map((i) => i.sku);
      if (unknown.length) {
        throw new AppError(422, 'UNKNOWN_SKU', 'SKU no registrado en la sede', unknown.map((sku) => ({ sku })));
      }

      const lines = input.items.map(({ sku, qty }) => {
        const p = stock.get(sku);
        return {
          sku,
          name: p.name,
          unit: p.unit,
          qty,
          unitPriceCents: p.priceCents,
          lineTotalCents: lineTotal(p.priceCents, qty),
        };
      });
      const total = lines.reduce((acc, l) => acc + l.lineTotalCents, 0);
      const createdAt = now();

      const order = {
        orderId: input.orderId,
        sedeId: input.sedeId,
        status: 'RESERVED',
        lines,
        totals: { currency: 'PEN', igvRate: config.igvRate, ...splitIgv(total, config.igvRate) },
        customer: input.customer,
        seller: input.seller,
        notes: input.notes,
        requestHash,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
        reservationExpiresAt: new Date(createdAt.getTime() + config.reservationTtlMinutes * 60_000).toISOString(),
      };

      // 2) Reserva atómica con Conditional Writes.
      const res = await repo.reserveOrder(order);
      if (res.ok) return { status: 201, order: publicOrder(order) };

      if (res.kind === 'DUPLICATE') {
        const existing = await repo.getOrder(input.sedeId, input.orderId);
        if (existing && existing.requestHash === requestHash) return { status: 200, order: publicOrder(existing), replay: true };
        throw conflict('IDEMPOTENCY_MISMATCH', 'orderId ya usado con un contenido distinto');
      }
      if (res.kind === 'CONTENTION') {
        throw new AppError(503, 'CONTENTION', 'Alta concurrencia sobre el stock, reintente');
      }
      throw conflict('STOCK_CONFLICT', 'No se pudo reservar el pedido completo', res.failures);
    },

    async getOrder(sedeId, orderId) {
      assertSede(sedeId);
      assertOrderId(orderId);
      const order = await repo.getOrder(sedeId, orderId);
      if (!order) throw notFound('Pedido no encontrado');
      return publicOrder(order);
    },

    async transition(sedeId, orderId, action) {
      assertSede(sedeId);
      assertOrderId(orderId);
      const order = await repo.getOrder(sedeId, orderId);
      if (!order) throw notFound('Pedido no encontrado');

      const res = await repo.transitionOrder(order, action);
      if (!res.ok) {
        if (res.kind === 'CONTENTION') throw new AppError(503, 'CONTENTION', 'Alta concurrencia, reintente');
        throw conflict('INVALID_STATE', `El pedido está en estado ${order.status}`);
      }
      const updated = { ...order, status: res.status, updatedAt: res.updatedAt };

      // Al confirmar, se emite el comprobante si el conector SUNAT está habilitado (setup up-sell).
      if (action === 'confirm' && integrations.invoicing) {
        const invoice = await integrations.invoicing.emit(updated).catch((err) => ({
          status: 'ERROR',
          message: err.message,
        }));
        if (invoice.status !== 'NOT_CONFIGURED') await repo.patchOrder(sedeId, orderId, 'invoice', invoice);
        updated.invoice = invoice;
      }
      return publicOrder(updated);
    },

    async markPayment(sedeId, orderId, payment) {
      assertSede(sedeId);
      assertOrderId(orderId);
      return repo.patchOrder(sedeId, orderId, 'payment', payment);
    },

    async markInvoice(sedeId, orderId, invoice) {
      assertSede(sedeId);
      assertOrderId(orderId);
      return repo.patchOrder(sedeId, orderId, 'invoice', invoice);
    },

    async recordMissedDemand(sedeId, data) {
      assertSede(sedeId);
      return repo.recordMissedDemand(sedeId, data);
    },

    async getMissedDemand(sedeId) {
      assertSede(sedeId);
      return repo.listMissedDemand(sedeId);
    },

    async recordZeroSearch(sedeId, term) {
      assertSede(sedeId);
      return repo.recordZeroSearch(sedeId, term);
    },

    async getZeroSearches(sedeId) {
      assertSede(sedeId);
      return repo.listZeroSearches(sedeId);
    },
  };
}
