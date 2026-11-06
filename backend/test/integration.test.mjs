// Test de integración contra DynamoDB Local (se omite si no está levantado).
//   npm run db:up && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const endpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const reachable = await fetch(endpoint, { signal: AbortSignal.timeout(800) }).then(() => true, () => false);

test('Conditional Writes: cero sobreventa con 40 vendedores concurrentes', { skip: !reachable && 'DynamoDB Local no disponible' }, async () => {
  const { runConcurrencyScenario } = await import('../scripts/concurrency-demo.mjs');
  const { checks } = await runConcurrencyScenario({ sellers: 40, tableName: 'nodux-flow-it', quiet: true });
  for (const [name, pass] of Object.entries(checks)) assert.ok(pass, name);
});
