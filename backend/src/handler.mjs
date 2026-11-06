// Punto de entrada AWS Lambda (API Gateway HTTP API, payload v2).
// Un solo microservicio ligero, enrutado internamente: cold start mínimo y sin frameworks.
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config.mjs';
import { AppError } from './errors.mjs';
import { createDocClient, createRepository } from './repository.mjs';
import { createService } from './service.mjs';
import { createWebhookProcessor } from './integrations/webhooks.mjs';
import { culqiAdapter } from './integrations/culqi.mjs';
import { createNubefactInvoicing, nubefactAdapter } from './integrations/nubefact.mjs';

const SECURITY_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
};

const json = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { ...SECURITY_HEADERS, ...extra },
  body: JSON.stringify(body),
});

const defaultLog = (entry) => console.log(JSON.stringify(entry));

export function createHandler({ config = loadConfig(), repo, service, processWebhook, log = defaultLog } = {}) {
  if (!service) {
    repo ||= createRepository({ doc: createDocClient(config), tableName: config.tableName });
    const invoicing = createNubefactInvoicing({ config, repo });
    service = createService({ repo, config, integrations: { invoicing } });
  }
  processWebhook ||= createWebhookProcessor({
    repo,
    service,
    config,
    adapters: { culqi: culqiAdapter, nubefact: nubefactAdapter },
    log,
  });

  const routes = [
    { method: 'GET', re: /^\/health$/, run: async () => ({ status: 200, body: { ok: true, service: 'nodux-flow' } }) },
    {
      method: 'GET',
      re: /^\/sedes\/([^/]+)\/stock$/,
      run: async ({ params }) => ({ status: 200, body: await service.getStock(params[0]) }),
    },
    {
      method: 'POST',
      re: /^\/orders$/,
      run: async ({ body }) => {
        const res = await service.createOrder(body);
        return { status: res.status, body: { order: res.order, replay: !!res.replay } };
      },
    },
    {
      method: 'GET',
      re: /^\/sedes\/([^/]+)\/orders\/([^/]+)$/,
      run: async ({ params }) => ({ status: 200, body: { order: await service.getOrder(params[0], params[1]) } }),
    },
    {
      method: 'POST',
      re: /^\/sedes\/([^/]+)\/orders\/([^/]+)\/(confirm|cancel)$/,
      run: async ({ params }) => ({
        status: 200,
        body: { order: await service.transition(params[0], params[1], params[2]) },
      }),
    },
    {
      method: 'POST',
      re: /^\/webhooks\/([a-z]+)$/,
      raw: true,
      run: async ({ params, rawBody, headers }) => ({
        status: 200,
        body: await processWebhook(params[0], rawBody, headers),
      }),
    },
  ];

  return async function handler(event) {
    const started = Date.now();
    const requestId = event?.requestContext?.requestId || randomUUID();
    const method = event?.requestContext?.http?.method || 'GET';
    const path = event?.rawPath || '/';
    let status = 500;

    try {
      const route = routes.find((r) => r.method === method && r.re.test(path));
      if (!route) throw new AppError(404, 'NOT_FOUND', 'Ruta no encontrada');
      const params = path.match(route.re).slice(1).map(decodeURIComponent);

      const rawBody = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
      if (Buffer.byteLength(rawBody) > config.maxBodyBytes) throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Cuerpo demasiado grande');

      let body;
      if (!route.raw && rawBody) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          throw new AppError(400, 'VALIDATION_ERROR', 'JSON inválido');
        }
      }

      const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      const result = await route.run({ params, body, rawBody, headers });
      status = result.status;
      return json(result.status, result.body, { 'x-request-id': requestId });
    } catch (err) {
      if (err instanceof AppError) {
        status = err.status;
        return json(err.status, { error: { code: err.code, message: err.message, details: err.details } }, { 'x-request-id': requestId });
      }
      status = 500;
      // No se filtran detalles internos al cliente; sí al log estructurado.
      log({ level: 'error', requestId, msg: err?.message, name: err?.name, stack: err?.stack });
      return json(500, { error: { code: 'INTERNAL', message: 'Error interno', requestId } }, { 'x-request-id': requestId });
    } finally {
      // Log de acceso sin PII (no se registra el cuerpo).
      log({ level: 'info', requestId, method, path, status, ms: Date.now() - started });
    }
  };
}

let cached;
export const handler = (event, context) => {
  cached ||= createHandler();
  return cached(event, context);
};
