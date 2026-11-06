import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const distDir = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

function walk(dir) {
  let files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files = files.concat(walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

try {
  const files = walk(distDir);
  console.log('\n📦 Nodux Flow · Reporte de Bundle (Vite + React + Tailwind):');
  console.log('------------------------------------------------------------');

  let criticalRaw = 0;
  let criticalGzip = 0;
  let totalRaw = 0;
  let totalGzip = 0;

  for (const file of files) {
    const rel = file.replace(distDir, '').replace(/^[\\/]/, '');
    const buf = readFileSync(file);
    const rawSize = buf.length;
    const gzSize = gzipSync(buf).length;

    totalRaw += rawSize;
    totalGzip += gzSize;

    const isCritical = rel.endsWith('.js') || rel.endsWith('.css') || rel.endsWith('.html');
    if (isCritical) {
      criticalRaw += rawSize;
      criticalGzip += gzSize;
    }

    const rawKb = (rawSize / 1024).toFixed(2);
    const gzKb = (gzSize / 1024).toFixed(2);
    const tag = isCritical ? ' [CRÍTICO]' : '';

    console.log(`  ${(rel + tag).padEnd(42)} | raw: ${rawKb.padStart(8)} KB | gzip: ${gzKb.padStart(7)} KB`);
  }

  console.log('------------------------------------------------------------');
  const criticalGzKb = criticalGzip / 1024;
  console.log(`  BUNDLE CRÍTICO (HTML + JS + CSS): ${criticalGzKb.toFixed(2)} KB gzip`);
  console.log(`  TOTAL ASSETS: ${(totalGzip / 1024).toFixed(2)} KB gzip`);

  const MAX_KB = 150;
  if (criticalGzKb < MAX_KB) {
    console.log(`  ✔ ÉXITO: Bundle crítico en ${criticalGzKb.toFixed(2)} KB (< ${MAX_KB} KB). Cumple especificación B2B.\n`);
  } else {
    console.warn(`  ⚠ ALERTA: Bundle crítico excede ${MAX_KB} KB. Optimizar chunks.\n`);
  }
} catch (err) {
  console.error('Error calculando bundle size:', err.message);
}
