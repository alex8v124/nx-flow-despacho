// Cliente del microservicio Lambda. Si VITE_API_URL no está definido, la terminal corre en
// modo demo 100% local (ideal para mostrar en reuniones sin depender de la red).
import { store } from './storage.js';

export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const apiEnabled = Boolean(API_URL);

const OUTBOX = 'nf.outbox';

async function request(path, { method = 'GET', body, timeoutMs = 5000 } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export async function fetchStock(sedeId) {
  const { status, data } = await request(`/sedes/${encodeURIComponent(sedeId)}/stock`);
  if (status !== 200) throw new Error(`stock ${status}`);
  return data.items;
}

/** Envía telemetría de demanda insatisfecha a la BD central en AWS en segundo plano */
export async function sendMissedDemandBeacon(sedeId, item) {
  try {
    if (apiEnabled) {
      await request(`/sedes/${encodeURIComponent(sedeId)}/metrics/missed-demand`, {
        method: 'POST',
        body: item,
      });
    }
  } catch {
    // No bloquea la UI ni interrumpe al vendedor si está offline
  }
}

/** Envía telemetría silenciosa de búsquedas sin resultado (Demanda Oculta para compras/importación) */
export async function sendZeroSearchBeacon(sedeId, term) {
  try {
    if (apiEnabled) {
      await request(`/sedes/${encodeURIComponent(sedeId)}/metrics/zero-search`, {
        method: 'POST',
        body: { term },
      });
    }
  } catch {
    // Silencioso
  }
}

/** Dispara webhook seguro hacia CRM, ERP o Google Sheets del cliente si está configurado */
export async function triggerCustomerWebhook(webhookUrl, orderPayload) {
  if (!webhookUrl || !webhookUrl.startsWith('http')) return false;

  // Si pegaron la URL de visualización web de Google Sheets en vez de la URL del Web App de Apps Script (/exec)
  if (webhookUrl.includes('docs.google.com/spreadsheets/')) {
    console.warn(
      'Webhook no enviado: se ingresó la URL de visualización de Google Sheets (/edit) en lugar de la URL de Apps Script (/exec).',
    );
    return false;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });
      return true;
    } catch {
      return false;
    }
  }
}

const LOCAL_DIRECTORY = {
  RUC: {
    '20524854521': { name: 'VMWARE SISTEMA INTEGRAL DE SEGURIDAD S.A.C.-VMWARESIS S.A.C.', estado: 'ACTIVO', condicion: 'HABIDO', direccion: 'CAL. MATEO ALONSO NRO 153 URB. PRIMAVERA' },
    '20100070970': { name: "SUPERMERCADOS PERUANOS SOCIEDAD ANONIMA 'O ' S.P.S.A.", estado: 'ACTIVO', condicion: 'HABIDO', direccion: 'CAL. MORELLI NRO 181 SAN BORJA' },
    '20131312955': { name: 'SUNAT - SUPERINTENDENCIA NACIONAL DE ADUANAS Y DE ADMINISTRACION TRIBUTARIA', estado: 'ACTIVO', condicion: 'HABIDO', direccion: 'AV. GARCILASO DE LA VEGA NRO 1472' },
    '20100128056': { name: 'SEDAPAL S.A. - SERVICIO DE AGUA POTABLE Y ALCANTARILLADO DE LIMA', estado: 'ACTIVO', condicion: 'HABIDO', direccion: 'AUTOPISTA RAMIRO PRIALE NRO 210 EL AGUSTINO' },
    '20100055237': { name: 'COMPAÑIA DE MINAS BUENAVENTURA S.A.A.', estado: 'ACTIVO', condicion: 'HABIDO', direccion: 'CAL. LAS BEGONIAS NRO 415 SAN ISIDRO' },
    '20100017491': { name: 'TELEFONICA DEL PERU S.A.A.', estado: 'ACTIVO', condicion: 'HABIDO', direccion: 'AV. ENRIQUE CANAVAL Y MOREYRA NRO 480 SAN ISIDRO' },
    '20100130204': { name: 'FERREYROS S.A.', estado: 'ACTIVO', condicion: 'HABIDO', direccion: 'JR. CRISTOBAL DE PERALTA NORTE NRO 820 SANTIAGO DE SURCO' },
    '20512002090': { name: 'SODIMAC PERU S.A.', estado: 'ACTIVO', condicion: 'HABIDO', direccion: 'AV. JAVIER PRADO ESTE NRO 4055 SANTIAGO DE SURCO' },
    '20337054099': { name: 'MAESTRO PERU S.A.', estado: 'ACTIVO', condicion: 'HABIDO', direccion: 'AV. ANGAMOS ESTE NRO 1805 SURQUILLO' },
    '20508565771': { name: 'CORPORACION ACEROS AREQUIPA S.A.', estado: 'ACTIVO', condicion: 'HABIDO', direccion: 'AV. ANTONIO MIRO QUESADA NRO 425 MAGDALENA DEL MAR' },
  },
  DNI: {
    '72407570': { name: 'JUAN ALEXANDER MIRANDA QUISPE' },
    '60942914': { name: 'CESAR AUGUSTO MENDOZA TORRES' },
    '47854125': { name: 'MARICELA GOMEZ PAIMA' },
    '10203040': { name: 'CARLOS ALBERTO SANCHEZ MENDOZA' },
    '87654321': { name: 'VERONICA CAMPOS BALDEON' },
    '41234567': { name: 'LUIS EDUARDO RAMIREZ PAREDES' },
    '45678901': { name: 'JORGE LUIS CHAVEZ PINTO' },
  },
};

/**
 * Consulta de documento peruano (RUC ante SUNAT / DNI ante RENIEC).
 * Prioriza resolución inmediata de padrón demo y consulta en paralelo APIs en vivo de SUNAT/RENIEC.
 */
export async function lookupDocument(type, number) {
  const t = type.toUpperCase();
  const num = String(number || '').trim();

  // 1. Verificación instantánea en padrón local en memoria (garantía de cero fallas en demo)
  if (LOCAL_DIRECTORY[t]?.[num]) {
    const item = LOCAL_DIRECTORY[t][num];
    return {
      found: true,
      name: item.name,
      estado: item.estado || 'ACTIVO',
      condicion: item.condicion || 'HABIDO',
      direccion: item.direccion || undefined,
    };
  }

  // 2. Consulta en endpoints en vivo (Vercel rewrites, Serverless proxy y backend)
  const endpoints = [
    `/lookup/${t.toLowerCase()}/${num}`,
    `/api/lookup/${t.toLowerCase()}/${num}`,
    `/api/lookup?type=${t.toLowerCase()}&num=${num}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        const name = data && (data.name || data.nombre);
        if (name) {
          return {
            found: true,
            name: String(name).trim(),
            estado: data.estado || 'ACTIVO',
            condicion: data.condicion || 'HABIDO',
            direccion: data.direccion || undefined,
          };
        }
      }
    } catch {
      // continuar al siguiente endpoint
    }
  }

  // 3. Si hay backend API_URL explícita
  if (API_URL) {
    try {
      const { status, data } = await request(`/lookup/${t.toLowerCase()}/${num}`);
      const name = data && (data.name || data.nombre);
      if (status === 200 && name) {
        return {
          found: true,
          name: String(name).trim(),
          estado: data.estado || 'ACTIVO',
          condicion: data.condicion || 'HABIDO',
        };
      }
    } catch {
      // continuar a fallback
    }
  }

  return { found: false };
}

/**
 * Reserva el pedido en DynamoDB.
 * Devuelve { kind: 'RESERVED', order } | { kind: 'CONFLICT', details } | { kind: 'PENDING' }.
 * Ante caída de red o error 5xx el pedido se encola (outbox) y se reintenta al volver la señal;
 * el orderId actúa como clave de idempotencia, así que reintentar nunca duplica la reserva.
 */
export async function reserveOrder(payload) {
  try {
    const { status, data } = await request('/orders', { method: 'POST', body: payload });
    if (status === 200 || status === 201) return { kind: 'RESERVED', order: data.order };
    if (status === 409 || status === 422) return { kind: 'CONFLICT', error: data.error };
    if (status >= 500) throw new Error(`api ${status}`);
    return { kind: 'CONFLICT', error: data.error || { message: `Error ${status}` } };
  } catch {
    enqueue(payload);
    return { kind: 'PENDING' };
  }
}

export const outboxSize = () => store.get(OUTBOX, []).length;

function enqueue(payload) {
  const box = store.get(OUTBOX, []);
  if (!box.some((p) => p.orderId === payload.orderId)) box.push(payload);
  store.set(OUTBOX, box);
}

/** Sincroniza pedidos encolados. Devuelve { synced, conflicts: [{payload, error}] }. */
export async function flushOutbox() {
  const box = store.get(OUTBOX, []);
  if (!box.length || !apiEnabled) return { synced: 0, conflicts: [] };
  const remaining = [];
  const conflicts = [];
  let synced = 0;
  for (const payload of box) {
    try {
      const { status, data } = await request('/orders', { method: 'POST', body: payload });
      if (status === 200 || status === 201) synced++;
      else if (status >= 500) remaining.push(payload);
      else conflicts.push({ payload, error: data.error });
    } catch {
      remaining.push(payload);
    }
  }
  store.set(OUTBOX, remaining);
  return { synced, conflicts };
}
