// Carga el catálogo demo (40 SKUs x 3 sedes) en DynamoDB.
//   Local : node scripts/seed.mjs --local --create-table
//   AWS   : TABLE_NAME=nodux-flow-prod AWS_REGION=us-east-1 node scripts/seed.mjs
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { CreateTableCommand, DeleteTableCommand, waitUntilTableExists, waitUntilTableNotExists } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { createDocClient, createRawClient, keys } from '../src/repository.mjs';
import { loadConfig } from '../src/config.mjs';

const args = new Set(process.argv.slice(2));
const local = args.has('--local');
const config = loadConfig({
  ...process.env,
  ...(local ? { DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000' } : {}),
});

export async function createTable(client, tableName, { reset = true } = {}) {
  if (reset) {
    try {
      await client.send(new DeleteTableCommand({ TableName: tableName }));
      await waitUntilTableNotExists({ client, maxWaitTime: 30 }, { TableName: tableName });
    } catch (err) {
      if (err.name !== 'ResourceNotFoundException') throw err;
    }
  }
  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
    }),
  );
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: tableName });
}

export async function seed(doc, tableName, catalog) {
  const ts = new Date().toISOString();
  const items = [];
  for (const sede of catalog.sedes) {
    items.push({ PK: keys.sede(sede.id), SK: keys.meta(), entity: 'SEDE', sedeId: sede.id, name: sede.name, whatsapp: sede.whatsapp });
    for (const p of catalog.products) {
      items.push({
        PK: keys.sede(sede.id),
        SK: keys.stock(p.sku),
        entity: 'STOCK',
        sedeId: sede.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        priceCents: p.priceCents,
        stock: p.stock[sede.id] ?? 0,
        reserved: 0,
        version: 1,
        updatedAt: ts,
      });
    }
  }
  for (let i = 0; i < items.length; i += 25) {
    let request = { [tableName]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) };
    while (request && Object.keys(request).length) {
      const res = await doc.send(new BatchWriteCommand({ RequestItems: request }));
      request = res.UnprocessedItems;
    }
  }
  return items.length;
}

export async function loadCatalog() {
  return JSON.parse(await readFile(new URL('../../shared/catalog.json', import.meta.url), 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const doc = createDocClient(config);
  if (args.has('--create-table')) {
    await createTable(createRawClient(config), config.tableName);
    console.log(`✔ Tabla ${config.tableName} creada`);
  }
  const catalog = await loadCatalog();
  const n = await seed(doc, config.tableName, catalog);
  console.log(`✔ ${n} ítems cargados en ${config.tableName} (${catalog.products.length} SKUs x ${catalog.sedes.length} sedes)`);
}
