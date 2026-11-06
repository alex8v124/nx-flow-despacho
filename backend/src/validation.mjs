// Validación estricta de entrada (allow-list). Se rechaza todo campo o formato no esperado
// antes de tocar la base de datos. Sin dependencias externas para mantener el cold start mínimo.
import { badRequest } from './errors.mjs';

export const SEDE_RE = /^[A-Z0-9-]{2,20}$/;
export const SKU_RE = /^[A-Z0-9-]{3,32}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const MAX_LINES = 50; // TransactWriteItems admite 100 operaciones: 1 pedido + N líneas.
export const MAX_QTY = 9999;

const ORDER_FIELDS = new Set(['orderId', 'sedeId', 'items', 'customer', 'seller', 'notes']);
const CUSTOMER_FIELDS = new Set(['name', 'docType', 'docNumber', 'phone']);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Elimina caracteres de control para evitar inyección en logs / mensajes de WhatsApp.
const cleanText = (v, max) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw badRequest('Se esperaba texto');
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (s.length > max) throw badRequest(`Texto excede ${max} caracteres`);
  return s || undefined;
};

/** Dígito verificador de RUC (módulo 11, SUNAT). */
export function isValidRuc(ruc) {
  if (!/^(10|15|17|20)\d{9}$/.test(ruc)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(ruc[i]), 0);
  let check = 11 - (sum % 11);
  if (check === 10) check = 0;
  if (check === 11) check = 1;
  return check === Number(ruc[10]);
}

function validateCustomer(c) {
  if (c === undefined || c === null) return undefined;
  if (!isPlainObject(c)) throw badRequest('customer inválido');
  for (const k of Object.keys(c)) if (!CUSTOMER_FIELDS.has(k)) throw badRequest(`Campo no permitido: customer.${k}`);

  const out = { name: cleanText(c.name, 80) };
  if (c.docType !== undefined && c.docType !== null && c.docType !== '') {
    if (c.docType !== 'RUC' && c.docType !== 'DNI') throw badRequest('docType debe ser RUC o DNI');
    const doc = typeof c.docNumber === 'string' ? c.docNumber.trim() : '';
    if (c.docType === 'RUC' && !isValidRuc(doc)) throw badRequest('RUC inválido');
    if (c.docType === 'DNI' && !/^\d{8}$/.test(doc)) throw badRequest('DNI inválido');
    out.docType = c.docType;
    out.docNumber = doc;
  }
  if (c.phone !== undefined && c.phone !== null && c.phone !== '') {
    const phone = String(c.phone).replace(/[\s-]/g, '');
    if (!/^\+?\d{9,15}$/.test(phone)) throw badRequest('Teléfono inválido');
    out.phone = phone;
  }
  return out;
}

/**
 * Valida y normaliza un pedido. Las líneas con el mismo SKU se consolidan.
 * Importante: el cliente NO envía precios. El precio lo fija el servidor desde DynamoDB.
 */
export function validateOrderInput(body) {
  if (!isPlainObject(body)) throw badRequest('Cuerpo JSON inválido');
  for (const k of Object.keys(body)) if (!ORDER_FIELDS.has(k)) throw badRequest(`Campo no permitido: ${k}`);

  const orderId = typeof body.orderId === 'string' ? body.orderId.toLowerCase() : '';
  if (!UUID_RE.test(orderId)) throw badRequest('orderId debe ser un UUID (clave de idempotencia)');

  if (typeof body.sedeId !== 'string' || !SEDE_RE.test(body.sedeId)) throw badRequest('sedeId inválido');

  if (!Array.isArray(body.items) || body.items.length === 0) throw badRequest('El pedido no tiene ítems');
  if (body.items.length > MAX_LINES) throw badRequest(`Máximo ${MAX_LINES} líneas por pedido`);

  const merged = new Map();
  for (const [i, item] of body.items.entries()) {
    if (!isPlainObject(item)) throw badRequest(`items[${i}] inválido`);
    for (const k of Object.keys(item)) if (k !== 'sku' && k !== 'qty') throw badRequest(`Campo no permitido: items[${i}].${k}`);
    const { sku, qty } = item;
    if (typeof sku !== 'string' || !SKU_RE.test(sku)) throw badRequest(`items[${i}].sku inválido`);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw badRequest(`items[${i}].qty debe ser entero entre 1 y ${MAX_QTY}`);
    merged.set(sku, (merged.get(sku) || 0) + qty);
  }
  for (const [sku, qty] of merged) if (qty > MAX_QTY) throw badRequest(`Cantidad total de ${sku} excede ${MAX_QTY}`);

  return {
    orderId,
    sedeId: body.sedeId,
    items: [...merged].map(([sku, qty]) => ({ sku, qty })).sort((a, b) => a.sku.localeCompare(b.sku)),
    customer: validateCustomer(body.customer),
    seller: cleanText(body.seller, 60),
    notes: cleanText(body.notes, 280),
  };
}

export function assertSede(sedeId) {
  if (!SEDE_RE.test(sedeId)) throw badRequest('sedeId inválido');
}

export function assertOrderId(orderId) {
  if (!UUID_RE.test(orderId)) throw badRequest('orderId inválido');
}
