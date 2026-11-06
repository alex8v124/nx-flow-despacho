import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNubefactPayload } from '../src/integrations/nubefact.mjs';

test('payload Nubefact: factura con RUC, totales cuadrados en soles', () => {
  const order = {
    orderId: 'x',
    createdAt: '2026-11-06T15:00:00.000Z',
    customer: { name: 'FERRETERÍA EL PERNO SAC', docType: 'RUC', docNumber: '20100070970' },
    lines: [{ sku: 'TUB-PVC-110', name: 'Tubo PVC 4"', unit: 'UND', qty: 2, unitPriceCents: 3850, lineTotalCents: 7700 }],
    totals: { gravadaCents: 6525, igvCents: 1175, totalCents: 7700 },
  };
  const p = buildNubefactPayload(order, { serie: 'FFF1', numero: 7 });
  assert.equal(p.tipo_de_comprobante, 1);
  assert.equal(p.cliente_tipo_de_documento, 6);
  assert.equal(p.total, 77);
  assert.equal(p.fecha_de_emision, '06-11-2026');
  assert.equal(p.items[0].subtotal + p.items[0].igv, p.items[0].total);
});

test('payload Nubefact: boleta para cliente sin documento', () => {
  const p = buildNubefactPayload(
    { orderId: 'y', createdAt: '2026-11-06T15:00:00Z', lines: [], totals: { gravadaCents: 0, igvCents: 0, totalCents: 0 } },
    { serie: 'BBB1', numero: 1 },
  );
  assert.equal(p.tipo_de_comprobante, 2);
  assert.equal(p.cliente_denominacion, 'CLIENTES VARIOS');
});
