// Recepción genérica de webhooks: verificación de firma HMAC-SHA256 (comparación en tiempo
// constante), deduplicación por eventId y despacho al adaptador del proveedor.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from '../errors.mjs';

export function sign(rawBody, secret) {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

export function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = Buffer.from(sign(rawBody, secret), 'hex');
  const given = Buffer.from(String(signature).replace(/^sha256=/, ''), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function createWebhookProcessor({ repo, service, config, adapters, log = () => {} }) {
  return async function processWebhook(provider, rawBody, headers) {
    const adapter = adapters[provider];
    const secret = config.webhooks[provider];
    if (!adapter) throw new AppError(404, 'NOT_FOUND', 'Proveedor desconocido');
    if (!secret) {
      // Conector listo pero no contratado: se activa al configurar el secreto en SSM.
      throw new AppError(501, 'INTEGRATION_NOT_CONFIGURED', `Integración ${provider} no habilitada para este cliente`);
    }
    const signature = headers['x-nodux-signature'] || headers[adapter.signatureHeader || ''];
    if (!verifySignature(rawBody, signature, secret)) {
      throw new AppError(401, 'INVALID_SIGNATURE', 'Firma inválida');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new AppError(400, 'VALIDATION_ERROR', 'JSON inválido');
    }

    const eventId = String(payload.id || createHash('sha256').update(rawBody).digest('hex')).slice(0, 128);
    const { duplicate } = await repo.putWebhookEvent(provider, eventId, payload);
    if (duplicate) return { received: true, duplicate: true, eventId };

    const result = await adapter.handle(payload, { service, log });
    return { received: true, duplicate: false, eventId, ...result };
  };
}
