// Servicio de consulta de documentos peruanos (RUC ante SUNAT y DNI ante RENIEC).
import { isValidRuc } from './validation.mjs';
import { badRequest } from './errors.mjs';

const DEMO_DIRECTORY = {
  RUC: {
    '20100070970': { name: 'SUPERMERCADOS PERUANOS S.A.', estado: 'ACTIVO', condicion: 'HABIDO' },
    '20131312955': { name: 'SUNAT - SUPERINTENDENCIA NACIONAL DE ADUANAS Y DE ADMINISTRACION TRIBUTARIA', estado: 'ACTIVO', condicion: 'HABIDO' },
    '20100128056': { name: 'SEDAPAL S.A.', estado: 'ACTIVO', condicion: 'HABIDO' },
    '20512345678': { name: 'CONSTRUCTORA & FERRETERÍA INDUSTRIAL S.A.C.', estado: 'ACTIVO', condicion: 'HABIDO' },
  },
  DNI: {
    '47854125': { name: 'MARICELA GOMEZ PAIMA' },
    '10203040': { name: 'JUAN CARLOS MIRANDA QUISPE' },
    '87654321': { name: 'VERONICA CAMPOS BALDEON' },
  },
};

export function createLookupService({ fetchImpl = globalThis.fetch, apiUrl = 'https://api.apis.net.pe/v1' } = {}) {
  return {
    async lookupDni(dniRaw) {
      const dni = String(dniRaw || '').trim();
      if (!/^\d{8}$/.test(dni)) {
        throw badRequest('DNI debe tener 8 dígitos numéricos');
      }

      try {
        const res = await fetchImpl(`${apiUrl}/dni?numero=${dni}`, {
          headers: { 'User-Agent': 'NoduxFlow/0.1.0' },
          signal: AbortSignal.timeout(4000),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.nombre) {
            return {
              found: true,
              docType: 'DNI',
              docNumber: dni,
              name: data.nombre.trim(),
            };
          }
        }
      } catch {
        // Fallback a demo local si el servicio externo no responde o no hay red
      }

      if (DEMO_DIRECTORY.DNI[dni]) {
        return {
          found: true,
          docType: 'DNI',
          docNumber: dni,
          name: DEMO_DIRECTORY.DNI[dni].name,
          mock: true,
        };
      }

      return { found: false, docType: 'DNI', docNumber: dni, message: 'DNI no encontrado en padrón' };
    },

    async lookupRuc(rucRaw) {
      const ruc = String(rucRaw || '').trim();
      if (!/^\d{11}$/.test(ruc)) {
        throw badRequest('RUC debe tener 11 dígitos numéricos');
      }
      if (!isValidRuc(ruc)) {
        throw badRequest('RUC inválido (dígito verificador módulo 11)');
      }

      try {
        const res = await fetchImpl(`${apiUrl}/ruc?numero=${ruc}`, {
          headers: { 'User-Agent': 'NoduxFlow/0.1.0' },
          signal: AbortSignal.timeout(4000),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.nombre) {
            return {
              found: true,
              docType: 'RUC',
              docNumber: ruc,
              name: data.nombre.trim(),
              estado: data.estado || 'ACTIVO',
              condicion: data.condicion || 'HABIDO',
              direccion: data.direccion || undefined,
            };
          }
        }
      } catch {
        // Fallback a demo local si el servicio externo no responde o no hay red
      }

      if (DEMO_DIRECTORY.RUC[ruc]) {
        const mock = DEMO_DIRECTORY.RUC[ruc];
        return {
          found: true,
          docType: 'RUC',
          docNumber: ruc,
          name: mock.name,
          estado: mock.estado,
          condicion: mock.condicion,
          mock: true,
        };
      }

      return { found: false, docType: 'RUC', docNumber: ruc, message: 'RUC no encontrado en padrón SUNAT' };
    },
  };
}
