// Dinero en céntimos (enteros). Mismo criterio que el backend.
const fmt = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const soles = (cents) => `S/ ${fmt.format(cents / 100)}`;

export function splitIgv(totalCents, igvRate = 0.18) {
  const gravadaCents = Math.round(totalCents / (1 + igvRate));
  return { gravadaCents, igvCents: totalCents - gravadaCents, totalCents };
}

/** Dígito verificador de RUC (módulo 11, SUNAT). */
export function isValidRuc(ruc) {
  if (!/^(10|15|17|20)\d{9}$/.test(ruc)) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let check = 11 - (w.reduce((a, x, i) => a + x * Number(ruc[i]), 0) % 11);
  if (check === 10) check = 0;
  if (check === 11) check = 1;
  return check === Number(ruc[10]);
}
