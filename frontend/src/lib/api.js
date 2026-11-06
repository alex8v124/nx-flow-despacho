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

const LOCAL_DIRECTORY = {
  RUC: {
    '20100070970': { name: "SUPERMERCADOS PERUANOS SOCIEDAD ANONIMA 'O ' S.P.S.A.", estado: 'ACTIVO', condicion: 'HABIDO' },
    '20131312955': { name: 'SUNAT - SUPERINTENDENCIA NACIONAL DE ADUANAS Y DE ADMINISTRACION TRIBUTARIA', estado: 'ACTIVO', condicion: 'HABIDO' },
    '20100128056': { name: 'SEDAPAL S.A.', estado: 'ACTIVO', condicion: 'HABIDO' },
  },
  DNI: {
    '47854125': { name: 'MARICELA GOMEZ PAIMA' },
    '10203040': { name: 'JUAN CARLOS MIRANDA QUISPE' },
    '87654321': { name: 'VERONICA CAMPOS BALDEON' },
  },
};

/**
 * Consulta de documento peruano (RUC ante SUNAT / DNI ante RENIEC).
 * Prioriza backend de Nodux Flow, con fallback a gateway público y directorio demo offline.
 */
export async function lookupDocument(type, number) {
  const t = type.toUpperCase();
  const num = String(number || '').trim();

  // 1. Backend Nodux Flow (si está configurado)
  if (apiEnabled) {
    try {
      const { status, data } = await request(`/lookup/${t.toLowerCase()}/${num}`);
      if (status === 200 && data.found) return data;
    } catch {
      // continuar a fallback
    }
  }

  // 2. Gateway público directo (v1 apis.net.pe)
  try {
    const res = await fetch(`https://api.apis.net.pe/v1/${t.toLowerCase()}?numero=${num}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.nombre) {
        return {
          found: true,
          name: data.nombre.trim(),
          estado: data.estado || 'ACTIVO',
          condicion: data.condicion || 'HABIDO',
        };
      }
    }
  } catch {
    // continuar a directorio local
  }

  // 3. Directorio demo local offline
  if (LOCAL_DIRECTORY[t]?.[num]) {
    return {
      found: true,
      name: LOCAL_DIRECTORY[t][num].name,
      estado: LOCAL_DIRECTORY[t][num].estado || 'ACTIVO',
      condicion: LOCAL_DIRECTORY[t][num].condicion || 'HABIDO',
    };
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
