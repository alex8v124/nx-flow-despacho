// Aritmética monetaria en céntimos (enteros). Nunca flotantes para dinero.
// Los precios del catálogo incluyen IGV (práctica estándar de mostrador en Perú).

export function lineTotal(unitPriceCents, qty) {
  return unitPriceCents * qty;
}

/**
 * Desglosa un total con IGV incluido en base imponible (op. gravada) + IGV.
 * Se redondea la base y el IGV se obtiene por diferencia, así gravada + igv === total siempre.
 */
export function splitIgv(totalCents, igvRate = 0.18) {
  const gravada = Math.round(totalCents / (1 + igvRate));
  return { gravadaCents: gravada, igvCents: totalCents - gravada, totalCents };
}

export const toSoles = (cents) => Number((cents / 100).toFixed(2));
