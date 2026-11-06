// DEMO DE CONCURRENCIA — la prueba que se muestra en la reunión técnica / con AWS.
// Simula N vendedores de distintas sedes/mostradores disparando pedidos al mismo tiempo
// sobre SKUs con poco stock y demuestra que NUNCA hay sobreventa ni reservas parciales.
//
//   npm run db:up && npm run test:concurrency
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createDocClient, createRawClient, createRepository, keys } from '../src/repository.mjs';
import { createService } from '../src/service.mjs';
import { loadConfig } from '../src/config.mjs';
import { createTable, seed, loadCatalog } from './seed.mjs';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

export async function runConcurrencyScenario({ sellers = 40, tableName = 'nodux-flow-concurrency', quiet = false } = {}) {
  const config = loadConfig({
    ...process.env,
    DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    TABLE_NAME: tableName,
  });
  const doc = createDocClient(config);
  await createTable(createRawClient(config), tableName);
  await seed(doc, tableName, await loadCatalog());

  const repo = createRepository({ doc, tableName });
  const service = createService({ repo, config });
  const say = (...a) => !quiet && console.log(...a);

  const readStock = async (sedeId, sku) =>
    (await doc.send(new GetCommand({ TableName: tableName, Key: { PK: keys.sede(sedeId), SK: keys.stock(sku) } }))).Item;

  const fire = (sedeId, items) =>
    service
      .createOrder({ orderId: randomUUID(), sedeId, items, seller: 'demo' })
      .then(() => 'OK')
      .catch((err) => err.code || err.name);

  // Escenario 1: N vendedores compiten por un taladro con 4 unidades en LIMA-01.
  const s1Before = await readStock('LIMA-01', 'TAL-PER-012');
  say(`\n▶ Escenario 1: ${sellers} pedidos simultáneos de 1 x TAL-PER-012 (stock inicial ${s1Before.stock})`);
  let t = performance.now();
  const r1 = await Promise.all(Array.from({ length: sellers }, () => fire('LIMA-01', [{ sku: 'TAL-PER-012', qty: 1 }])));
  const ms1 = performance.now() - t;
  const s1After = await readStock('LIMA-01', 'TAL-PER-012');
  const ok1 = r1.filter((r) => r === 'OK').length;
  say(`  aceptados=${ok1}  rechazados=${r1.length - ok1}  stock final=${s1After.stock}  reservado=${s1After.reserved}  (${ms1.toFixed(0)} ms)`);

  // Escenario 2: pedidos multi-línea (todo o nada) sobre dos SKUs escasos en LIMA-02.
  const a0 = await readStock('LIMA-02', 'AMO-ANG-412');
  const b0 = await readStock('LIMA-02', 'BOT-PUN-042');
  say(`\n▶ Escenario 2: ${sellers} pedidos simultáneos [1 x AMO-ANG-412 + 1 x BOT-PUN-042] (stock ${a0.stock} / ${b0.stock})`);
  t = performance.now();
  const r2 = await Promise.all(
    Array.from({ length: sellers }, () =>
      fire('LIMA-02', [
        { sku: 'AMO-ANG-412', qty: 1 },
        { sku: 'BOT-PUN-042', qty: 1 },
      ]),
    ),
  );
  const ms2 = performance.now() - t;
  const a1 = await readStock('LIMA-02', 'AMO-ANG-412');
  const b1 = await readStock('LIMA-02', 'BOT-PUN-042');
  const ok2 = r2.filter((r) => r === 'OK').length;
  say(`  aceptados=${ok2}  rechazados=${r2.length - ok2}  AMO stock=${a1.stock}  BOT stock=${b1.stock}  (${ms2.toFixed(0)} ms)`);

  const checks = {
    'Escenario 1: vendidos == stock inicial': ok1 === s1Before.stock,
    'Escenario 1: stock nunca negativo': s1After.stock === 0 && s1After.reserved === s1Before.stock,
    'Escenario 2: sin reservas parciales': a0.stock - a1.stock === ok2 && b0.stock - b1.stock === ok2,
    'Escenario 2: limitado por el SKU más escaso': ok2 === Math.min(a0.stock, b0.stock),
  };
  say('');
  for (const [name, pass] of Object.entries(checks)) say(`  ${pass ? '✔' : '✘'} ${name}`);
  return { checks, results: { r1, r2 } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { checks } = await runConcurrencyScenario();
  const failed = Object.values(checks).some((v) => !v);
  console.log(failed ? '\n✘ FALLÓ la garantía de no-sobreventa' : '\n✔ Cero sobreventa bajo concurrencia. Conditional Writes OK.');
  process.exit(failed ? 1 : 0);
}
