import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrderInput, isValidRuc } from '../src/validation.mjs';
import { splitIgv } from '../src/money.mjs';

const base = () => ({
  orderId: '3f1c2b9e-4d5a-4c3b-9a1e-2b3c4d5e6f70',
  sedeId: 'LIMA-01',
  items: [{ sku: 'TUB-PVC-110', qty: 2 }],
});

test('acepta un pedido válido y consolida SKUs repetidos', () => {
  const out = validateOrderInput({ ...base(), items: [{ sku: 'TUB-PVC-110', qty: 2 }, { sku: 'TUB-PVC-110', qty: 3 }] });
  assert.deepEqual(out.items, [{ sku: 'TUB-PVC-110', qty: 5 }]);
});

test('rechaza campos no permitidos (p. ej. precio enviado por el cliente)', () => {
  assert.throws(() => validateOrderInput({ ...base(), priceCents: 1 }), /no permitido/);
  assert.throws(() => validateOrderInput({ ...base(), items: [{ sku: 'TUB-PVC-110', qty: 1, priceCents: 1 }] }), /no permitido/);
});

test('rechaza cantidades no enteras, negativas o excesivas', () => {
  for (const qty of [0, -1, 1.5, '2', 10000]) {
    assert.throws(() => validateOrderInput({ ...base(), items: [{ sku: 'TUB-PVC-110', qty }] }), /qty/);
  }
});

test('rechaza orderId que no es UUID y SKU con caracteres inválidos', () => {
  assert.throws(() => validateOrderInput({ ...base(), orderId: '123' }), /UUID/);
  assert.throws(() => validateOrderInput({ ...base(), items: [{ sku: 'tub;DROP', qty: 1 }] }), /sku/);
});

test('valida RUC con dígito verificador SUNAT', () => {
  assert.equal(isValidRuc('20100070970'), true);
  assert.equal(isValidRuc('20100070971'), false);
  assert.equal(isValidRuc('99999999999'), false);
  assert.throws(() => validateOrderInput({ ...base(), customer: { docType: 'RUC', docNumber: '20100070971' } }), /RUC/);
});

test('limpia caracteres de control en textos libres', () => {
  const out = validateOrderInput({ ...base(), notes: 'Entregar\u0000 en\u001b puerta 3' });
  assert.equal(out.notes.includes('\u0000'), false);
});

test('IGV: gravada + igv == total siempre (céntimos)', () => {
  for (const total of [1, 99, 3850, 123457, 999999]) {
    const s = splitIgv(total, 0.18);
    assert.equal(s.gravadaCents + s.igvCents, total);
  }
  assert.deepEqual(splitIgv(11800, 0.18), { gravadaCents: 10000, igvCents: 1800, totalCents: 11800 });
});
