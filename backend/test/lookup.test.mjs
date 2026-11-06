import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLookupService } from '../src/lookup.mjs';

test('lookupRuc: valida y devuelve datos de RUC válido', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      nombre: 'SUPERMERCADOS PERUANOS S.A.',
      estado: 'ACTIVO',
      condicion: 'HABIDO',
      direccion: 'CAL. MORELLI 181',
    }),
  });

  const service = createLookupService({ fetchImpl: mockFetch });
  const res = await service.lookupRuc('20100070970');
  assert.equal(res.found, true);
  assert.equal(res.name, 'SUPERMERCADOS PERUANOS S.A.');
  assert.equal(res.estado, 'ACTIVO');
});

test('lookupRuc: rechaza RUC con dígito verificador inválido', async () => {
  const service = createLookupService();
  await assert.rejects(() => service.lookupRuc('20100070971'), /dígito verificador/);
});

test('lookupDni: consulta y formatea DNI de 8 dígitos', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      nombre: 'MARICELA GOMEZ PAIMA',
    }),
  });

  const service = createLookupService({ fetchImpl: mockFetch });
  const res = await service.lookupDni('47854125');
  assert.equal(res.found, true);
  assert.equal(res.name, 'MARICELA GOMEZ PAIMA');
});

test('lookupDni: rechaza longitud distinta de 8', async () => {
  const service = createLookupService();
  await assert.rejects(() => service.lookupDni('12345'), /8 dígitos/);
});
