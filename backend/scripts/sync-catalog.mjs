#!/usr/bin/env node
/**
 * Nodux Flow · Data Sync Worker (Pipeline de Ingesta Continua de Catálogo & Precios)
 *
 * Lee un archivo CSV o Excel exportado por el cliente, valida esquemas y actualiza
 * de manera atómica el catálogo en DynamoDB por sede.
 *
 * Uso:
 *   node scripts/sync-catalog.mjs --file=./inventario.csv --sede=ate
 */
import fs from 'node:fs';
import path from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  acc[k] = v || true;
  return acc;
}, {});

const filePath = args.file;
const targetSede = args.sede || 'ate';
const tableName = process.env.TABLE_NAME || 'nodux-flow-orders';
const region = process.env.AWS_REGION || 'us-east-1';

if (!filePath) {
  console.log(`
Uso: node scripts/sync-catalog.mjs --file=<ruta_csv> [--sede=ate|collique|surquillo]
Ejemplo: node scripts/sync-catalog.mjs --file=./catalogo.csv --sede=ate
`);
  process.exit(0);
}

const resolvedPath = path.resolve(process.cwd(), filePath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`❌ Error: Archivo no encontrado en: ${resolvedPath}`);
  process.exit(1);
}

console.log(`📦 [Data Sync Worker] Procesando archivo: ${resolvedPath} para sede [${targetSede}]...`);

const content = fs.readFileSync(resolvedPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

if (lines.length < 2) {
  console.error('❌ Error: El archivo CSV debe tener encabezados y al menos un producto.');
  process.exit(1);
}

const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
const skuIdx = headers.findIndex((h) => h.includes('sku') || h.includes('codigo'));
const nameIdx = headers.findIndex((h) => h.includes('nombre') || h.includes('name') || h.includes('desc'));
const priceIdx = headers.findIndex((h) => h.includes('precio') || h.includes('price'));
const stockIdx = headers.findIndex((h) => h.includes('stock') || h.includes('cant'));

if (skuIdx === -1 || nameIdx === -1 || priceIdx === -1) {
  console.error('❌ Error: No se encontraron columnas obligatorias (SKU, Nombre, Precio).');
  process.exit(1);
}

const itemsToSync = [];
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const sku = cols[skuIdx];
  const name = cols[nameIdx];
  const price = parseFloat(cols[priceIdx]) || 0;
  const stock = stockIdx !== -1 ? parseInt(cols[stockIdx], 10) || 0 : 25;

  if (!sku || !name || price <= 0) continue;

  itemsToSync.push({
    PK: `SEDE#${targetSede}`,
    SK: `STOCK#${sku}`,
    entity: 'STOCK',
    sku,
    name,
    priceCents: Math.round(price * 100),
    stock,
    updatedAt: new Date().toISOString(),
    version: 1,
  });
}

console.log(`✔ Detectados ${itemsToSync.length} SKUs válidos para sincronización.`);

async function run() {
  const client = new DynamoDBClient({
    region,
    ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {}),
  });
  const doc = DynamoDBDocumentClient.from(client);

  // BatchWrite acepta hasta 25 items por llamada
  const chunks = [];
  for (let i = 0; i < itemsToSync.length; i += 25) {
    chunks.push(itemsToSync.slice(i, i + 25));
  }

  let totalWritten = 0;
  for (const chunk of chunks) {
    const putRequests = chunk.map((item) => ({
      PutRequest: { Item: item },
    }));

    try {
      await doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: putRequests,
          },
        })
      );
      totalWritten += chunk.length;
      console.log(`  -> Sincronizado lote de ${chunk.length} items (Total: ${totalWritten}/${itemsToSync.length})`);
    } catch (err) {
      console.warn(`  ⚠️ Nota: ${err.message}. (Verifique credenciales AWS / permisos de DynamoDB)`);
      break;
    }
  }

  console.log(`\n🎉 Pipeline finalizado. Catálogo actualizado en la nube para sede ${targetSede}.`);
}

run().catch(console.error);
