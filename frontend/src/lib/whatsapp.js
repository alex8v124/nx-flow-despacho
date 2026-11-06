// Construcción del pedido consolidado para WhatsApp (formato *negrita* / _cursiva_ nativo).
import { soles } from './money.js';
import { shortId } from './storage.js';

const dateFmt = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function buildWhatsAppText({ orderId, sede, seller, customer, notes, lines, totals, reservation, condicionPago }) {
  const out = [];
  out.push(`*PEDIDO ${shortId(orderId)}*`);
  out.push(`Sede: ${sede.name}`);
  out.push(`Fecha: ${dateFmt.format(new Date())}`);
  if (seller) out.push(`Vendedor: ${seller}`);
  if (condicionPago) out.push(`Condición: *${condicionPago}*`);
  if (customer?.name) out.push(`Cliente: ${customer.name}`);
  if (customer?.docType && customer?.docNumber) out.push(`${customer.docType}: ${customer.docNumber}`);
  out.push('');
  for (const l of lines) {
    const pactado = l.isCustomPrice ? ' _(precio pactado especial)_' : '';
    out.push(`*${l.qty} x* ${l.name}${pactado}`);
    out.push(`    ${l.sku} · ${l.unit} · ${soles(l.unitPriceCents)} c/u → ${soles(l.lineTotalCents)}`);
  }
  out.push('');
  out.push(`Op. gravada: ${soles(totals.gravadaCents)}`);
  out.push(`IGV 18%: ${soles(totals.igvCents)}`);
  out.push(`*TOTAL: ${soles(totals.totalCents)}*`);
  out.push('');
  out.push(
    reservation === 'RESERVED'
      ? '✅ Stock reservado en sistema'
      : reservation === 'PENDING'
        ? '⏳ Reserva pendiente de sincronizar'
        : '🧪 Modo demo (stock local)',
  );
  if (notes) out.push(`Nota: ${notes}`);
  out.push('_Despachado con Nodux Flow_');
  return out.join('\n');
}

export function buildWhatsAppUrl(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  // Números peruanos de 9 dígitos → se antepone el código de país 51.
  const intl = digits.length === 9 ? `51${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}
