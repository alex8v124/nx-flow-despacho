// Servidor HTTP local que envuelve la Lambda (mismo handler que en AWS) contra DynamoDB Local.
//   npm run db:up && npm run db:init && npm run api:local
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.DYNAMODB_ENDPOINT ||= 'http://localhost:8000';
process.env.TABLE_NAME ||= 'nodux-flow-local';

const { createHandler } = await import('../src/handler.mjs');
const handler = createHandler();
const PORT = Number(process.env.PORT || 3001);
const ORIGIN = process.env.CORS_ORIGIN || '*';

const cors = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,idempotency-key,x-nodux-signature',
  'access-control-max-age': '600',
};

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors).end();
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const event = {
    version: '2.0',
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers: req.headers,
    body: chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined,
    isBase64Encoded: false,
    requestContext: { requestId: randomUUID(), http: { method: req.method, path: url.pathname } },
  };
  const out = await handler(event);
  res.writeHead(out.statusCode, { ...out.headers, ...cors }).end(out.body);
}).listen(PORT, () => console.log(`Nodux Flow API local → http://localhost:${PORT}  (DynamoDB: ${process.env.DYNAMODB_ENDPOINT})`));
