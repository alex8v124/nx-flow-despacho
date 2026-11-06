import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.mjs';
import { createService } from '../src/service.mjs';
import { loadConfig } from '../src/config.mjs';
import { sign } from '../src/integrations/webhooks.mjs';

// Repositorio en memoria con la misma semántica "todo o nada" que la transacción DynamoDB.
function memoryRepo() {
  const stock = new Map([
    ['LIMA-01#TUB-PVC-110', { sku: 'TUB-PVC-110', name: 'Tubo PVC 4"', category: 'Tuberías PVC', unit: 'UND', priceCents: 3850, stock: 5, reserved: 0 }],
    ['LIMA-01#CDO-PVC-110', { sku: 'CDO-PVC-110', name: 'Codo PVC 4"', category: 'Tuberías PVC', unit: 'UND', priceCents: 650, stock: 1, reserved: 0 }],
  ]);
  const orders = new Map();
  const events = new Set();
  return {
    stock,
    orders,
    async listStock(sedeId) {
      return [...stock].filter(([k]) => k.startsWith(`${sedeId}#`)).map(([, v]) => v);
    },
    async getStockItems(sedeId, skus) {
      return new Map(skus.filter((s) => stock.has(`${sedeId}#${s}`)).map((s) => [s, { ...stock.get(`${sedeId}#${s}`) }]));
    },
    async getOrder(sedeId, orderId) {
      return orders.get(`${sedeId}#${orderId}`);
    },
    async reserveOrder(order) {
      if (orders.has(`${order.sedeId}#${order.orderId}`)) return { ok: false, kind: 'DUPLICATE' };
      const failures = order.lines
        .map((l) => ({ l, s: stock.get(`${order.sedeId}#${l.sku}`) }))
        .filter(({ l, s }) => !s || s.stock < l.qty)
        .map(({ l, s }) => ({ sku: l.sku, requested: l.qty, available: s?.stock ?? 0, reason: 'OUT_OF_STOCK' }));
      if (failures.length) return { ok: false, kind: 'CONDITION', failures };
      for (const l of order.lines) {
        const s = stock.get(`${order.sedeId}#${l.sku}`);
        s.stock -= l.qty;
        s.reserved += l.qty;
      }
      orders.set(`${order.sedeId}#${order.orderId}`, structuredClone(order));
      return { ok: true };
    },
    async transitionOrder(order, action) {
      const o = orders.get(`${order.sedeId}#${order.orderId}`);
      if (o.status !== 'RESERVED') return { ok: false, kind: 'STATE' };
      for (const l of o.lines) {
        const s = stock.get(`${order.sedeId}#${l.sku}`);
        s.reserved -= l.qty;
        if (action === 'cancel') s.stock += l.qty;
      }
      o.status = action === 'confirm' ? 'CONFIRMED' : 'CANCELLED';
      return { ok: true, status: o.status, updatedAt: new Date().toISOString() };
    },
    async patchOrder(sedeId, orderId, field, value) {
      const o = orders.get(`${sedeId}#${orderId}`);
      if (!o) return false;
      o[field] = value;
      return true;
    },
    async putWebhookEvent(provider, id) {
      const k = `${provider}#${id}`;
      if (events.has(k)) return { duplicate: true };
      events.add(k);
      return { duplicate: false };
    },
  };
}

const setup = (env = {}) => {
  const config = loadConfig({ ...env });
  const repo = memoryRepo();
  const service = createService({ repo, config });
  const handler = createHandler({ config, repo, service, log: () => {} });
  const call = (method, path, body, headers = {}) =>
    handler({
      rawPath: path,
      headers,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      requestContext: { requestId: 'test', http: { method } },
    }).then((r) => ({ ...r, json: JSON.parse(r.body) }));
  return { repo, call };
};

const ORDER_ID = '0b6f8a52-1c2d-4e3f-8a9b-0c1d2e3f4a5b';

test('GET /health', async () => {
  const { call } = setup();
  const r = await call('GET', '/health');
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
});

test('POST /orders reserva stock con precio del servidor y desglose IGV', async () => {
  const { call, repo } = setup();
  const r = await call('POST', '/orders', { orderId: ORDER_ID, sedeId: 'LIMA-01', items: [{ sku: 'TUB-PVC-110', qty: 2 }] });
  assert.equal(r.statusCode, 201);
  assert.equal(r.json.order.totals.totalCents, 7700);
  assert.equal(r.json.order.totals.gravadaCents + r.json.order.totals.igvCents, 7700);
  assert.equal(r.json.order.requestHash, undefined, 'no expone campos internos');
  assert.equal(repo.stock.get('LIMA-01#TUB-PVC-110').stock, 3);
});

test('reintento con el mismo orderId es idempotente (no descuenta dos veces)', async () => {
  const { call, repo } = setup();
  const body = { orderId: ORDER_ID, sedeId: 'LIMA-01', items: [{ sku: 'TUB-PVC-110', qty: 2 }] };
  await call('POST', '/orders', body);
  const r2 = await call('POST', '/orders', body);
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.json.replay, true);
  assert.equal(repo.stock.get('LIMA-01#TUB-PVC-110').stock, 3);

  const r3 = await call('POST', '/orders', { ...body, items: [{ sku: 'TUB-PVC-110', qty: 1 }] });
  assert.equal(r3.statusCode, 409);
  assert.equal(r3.json.error.code, 'IDEMPOTENCY_MISMATCH');
});

test('sin stock suficiente → 409 con detalle por SKU y sin reservas parciales', async () => {
  const { call, repo } = setup();
  const r = await call('POST', '/orders', {
    orderId: ORDER_ID,
    sedeId: 'LIMA-01',
    items: [{ sku: 'TUB-PVC-110', qty: 1 }, { sku: 'CDO-PVC-110', qty: 2 }],
  });
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.json.error.details, [{ sku: 'CDO-PVC-110', requested: 2, available: 1, reason: 'OUT_OF_STOCK' }]);
  assert.equal(repo.stock.get('LIMA-01#TUB-PVC-110').stock, 5);
});

test('SKU inexistente → 422', async () => {
  const { call } = setup();
  const r = await call('POST', '/orders', { orderId: ORDER_ID, sedeId: 'LIMA-01', items: [{ sku: 'NO-EXISTE', qty: 1 }] });
  assert.equal(r.statusCode, 422);
});

test('cancelar libera stock; confirmar dos veces es inválido', async () => {
  const { call, repo } = setup();
  await call('POST', '/orders', { orderId: ORDER_ID, sedeId: 'LIMA-01', items: [{ sku: 'TUB-PVC-110', qty: 2 }] });
  const c = await call('POST', `/sedes/LIMA-01/orders/${ORDER_ID}/cancel`);
  assert.equal(c.statusCode, 200);
  assert.equal(repo.stock.get('LIMA-01#TUB-PVC-110').stock, 5);
  const again = await call('POST', `/sedes/LIMA-01/orders/${ORDER_ID}/confirm`);
  assert.equal(again.statusCode, 409);
});

test('JSON malformado → 400; ruta desconocida → 404; cuerpo gigante → 413', async () => {
  const { call } = setup();
  assert.equal((await call('POST', '/orders', '{nope')).statusCode, 400);
  assert.equal((await call('GET', '/admin')).statusCode, 404);
  assert.equal((await call('POST', '/orders', 'x'.repeat(40_000))).statusCode, 413);
});

test('webhook: 501 si la integración no está contratada', async () => {
  const { call } = setup();
  const r = await call('POST', '/webhooks/culqi', '{}');
  assert.equal(r.statusCode, 501);
  assert.equal(r.json.error.code, 'INTEGRATION_NOT_CONFIGURED');
});

test('webhook Culqi: firma inválida → 401; válida marca pedido pagado; duplicado se ignora', async () => {
  const secret = 'whsec_test';
  const { call, repo } = setup({ CULQI_WEBHOOK_SECRET: secret });
  await call('POST', '/orders', { orderId: ORDER_ID, sedeId: 'LIMA-01', items: [{ sku: 'TUB-PVC-110', qty: 1 }] });

  const payload = JSON.stringify({
    id: 'evt_1',
    type: 'charge.creation.succeeded',
    data: { id: 'chr_1', amount: 3850, metadata: { sedeId: 'LIMA-01', orderId: ORDER_ID } },
  });
  const bad = await call('POST', '/webhooks/culqi', payload, { 'x-nodux-signature': 'deadbeef' });
  assert.equal(bad.statusCode, 401);

  const ok = await call('POST', '/webhooks/culqi', payload, { 'x-nodux-signature': sign(payload, secret) });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json.action, 'ORDER_MARKED_PAID');
  assert.equal(repo.orders.get(`LIMA-01#${ORDER_ID}`).payment.status, 'PAID');

  const dup = await call('POST', '/webhooks/culqi', payload, { 'x-nodux-signature': sign(payload, secret) });
  assert.equal(dup.json.duplicate, true);
});
