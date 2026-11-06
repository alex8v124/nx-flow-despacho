// Búsqueda en memoria local: sin llamadas HTTP, respuesta sub-milisegundo para cientos de SKUs.
// Cruza SKU + descripción técnica + categoría + unidad, tolera tildes, guiones y "pulgadas".

export const normalize = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // 2 pulgadas | 2 pulg | 2in  → 2"
    .replace(/(\d)\s*(pulgadas?|pulg|in)\b/g, '$1"')
    .replace(/\s+/g, ' ')
    .trim();

const compact = (s) => s.replace(/[^a-z0-9]/g, '');

export function buildIndex(products) {
  return products.map((p, i) => {
    const sku = normalize(p.sku);
    const name = normalize(p.name);
    return {
      p,
      i,
      sku,
      skuCompact: compact(sku),
      name,
      hay: ` ${sku} ${compact(sku)} ${name} ${normalize(p.category)} ${normalize(p.unit)}`,
    };
  });
}

/** Devuelve los productos que contienen TODOS los términos, ordenados por relevancia. */
export function search(index, query, category) {
  const q = normalize(query);
  const tokens = q ? q.split(' ') : [];
  const qc = compact(q);
  const out = [];

  for (const e of index) {
    if (category && e.p.category !== category) continue;
    if (!tokens.length) {
      out.push([e, 0]);
      continue;
    }
    const allTokens = tokens.every((t) => e.hay.includes(t));
    const skuHit = qc.length >= 3 && e.skuCompact.includes(qc);
    if (!allTokens && !skuHit) continue;

    let score = 0;
    if (e.skuCompact === qc) score += 1000;
    else if (e.skuCompact.startsWith(qc)) score += 200;
    else if (skuHit) score += 80;
    if (e.name.startsWith(tokens[0])) score += 40;
    for (const t of tokens) if (e.hay.includes(` ${t}`)) score += 10; // inicio de palabra
    out.push([e, score]);
  }
  return out.sort((a, b) => b[1] - a[1] || a[0].i - b[0].i).map(([e]) => e.p);
}
