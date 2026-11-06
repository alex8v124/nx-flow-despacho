// Persistencia local tolerante a cortes de red y a modo privado (localStorage puede fallar).
export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* cuota llena o modo privado: la terminal sigue operando en memoria */
    }
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  },
};

// UUID v4. crypto.randomUUID sólo existe en contextos seguros (HTTPS); en LAN por HTTP
// se usa getRandomValues, que sí está disponible.
export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const shortId = (orderId) => `NF-${orderId.slice(0, 8).toUpperCase()}`;
