import { useState } from 'react';
import { soles } from '../lib/money.js';
import { shortId } from '../lib/storage.js';
import { IconCheck, IconX } from './icons.jsx';

export default function ProformaModal({ order, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!order) return null;

  const { orderId, date, sede, customer, seller, tarifa, lines, totals } = order;
  const proformaNumber = `COT-${shortId(orderId).toUpperCase()}`;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const textLines = [
      `PROFORMA COMERCIAL: ${proformaNumber}`,
      `Fecha: ${date || new Date().toLocaleString('es-PE')}`,
      `Sede: ${sede?.name || sede || 'Principal'}`,
      `Cliente: ${customer?.name || 'CLIENTE MOSTRADOR'}`,
      customer?.docNumber ? `${customer.docType || 'DOC'}: ${customer.docNumber}` : '',
      `Vendedor: ${seller || 'Mostrador'} | Tarifa: ${tarifa || 'Mostrador'}`,
      '----------------------------------------',
      ...(lines || []).map(
        (l) => `${l.qty}x ${l.name} (${l.sku}) - S/ ${(l.unitPriceCents / 100).toFixed(2)} = S/ ${(l.lineTotalCents / 100).toFixed(2)}`
      ),
      '----------------------------------------',
      `Op. Gravada: ${soles(totals?.gravadaCents || 0)}`,
      `IGV (18%): ${soles(totals?.igvCents || 0)}`,
      `TOTAL: ${soles(totals?.totalCents || 0)}`,
      '----------------------------------------',
      'Validez de la oferta: 3 días hábiles.',
      'Precios incluyen IGV. Entrega inmediata en almacén.',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(textLines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm print:p-0 print:bg-white"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-3xl border border-ink-600 bg-ink-900 p-6 text-slate-100 shadow-2xl print:border-none print:bg-white print:text-black print:max-h-none print:shadow-none">
        {/* Barra superior no imprimible */}
        <div className="flex items-center justify-between border-b border-ink-700 pb-3 print:hidden">
          <div className="flex items-center gap-2">
            <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs font-bold text-cyan-300 border border-cyan-500/30">
              Documento Formal B2B
            </span>
            <span className="text-sm font-semibold text-slate-300">Vista de Proforma</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-9 w-9 place-items-center rounded-xl bg-ink-800 text-slate-300 hover:bg-ink-700"
          >
            <IconX width={18} height={18} />
          </button>
        </div>

        {/* Encabezado Formal de la Empresa */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-ink-700/80 pb-4 print:border-slate-300">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-white print:text-black">NODUX FLOW</span>
              <span className="rounded bg-cyan-400/20 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300 print:text-slate-800 print:border print:border-slate-300">
                DISTRIBUIDORA
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 print:text-slate-600">
              Sede: <strong className="text-slate-200 print:text-black">{sede?.name || sede || 'Principal'}</strong>
            </p>
            <p className="text-xs text-slate-400 print:text-slate-600">Despacho de Materiales & Suministros Técnicos</p>
          </div>

          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-right print:border-slate-400 print:bg-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 print:text-slate-700">Cotización Formal</span>
            <p className="font-mono text-lg font-black text-white print:text-black">{proformaNumber}</p>
            <p className="text-[11px] text-slate-400 print:text-slate-600">{date || new Date().toLocaleDateString('es-PE')}</p>
          </div>
        </div>

        {/* Datos del Cliente y Asesor */}
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-ink-700 bg-ink-800/60 p-3.5 text-xs print:border-slate-300 print:bg-slate-50">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 print:text-slate-600">Cliente / Razón Social:</span>
            <p className="mt-0.5 font-bold text-white print:text-black">{customer?.name || 'CLIENTE MOSTRADOR'}</p>
            {customer?.docNumber && (
              <p className="font-mono text-cyan-300 print:text-slate-800">
                {customer.docType || 'DOC'}: {customer.docNumber}
              </p>
            )}
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 print:text-slate-600">Condiciones:</span>
            <p className="mt-0.5 text-slate-200 print:text-black">
              Vendedor: <strong>{seller || 'Mostrador'}</strong>
            </p>
            <p className="text-slate-300 print:text-slate-700">
              Escala: <strong>{tarifa || 'Mostrador'}</strong>
            </p>
          </div>
        </div>

        {/* Tabla de Productos Cotizados */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-ink-700 print:border-slate-300">
          <table className="w-full text-left text-xs">
            <thead className="bg-ink-800 text-[11px] font-bold uppercase tracking-wider text-slate-400 print:bg-slate-200 print:text-black">
              <tr>
                <th className="px-3 py-2">Cant</th>
                <th className="px-3 py-2">Descripción / SKU</th>
                <th className="px-3 py-2 text-right">P. Unit</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60 print:divide-slate-200">
              {(lines || []).map((l) => (
                <tr key={l.sku} className="hover:bg-ink-800/30 print:text-black">
                  <td className="px-3 py-2.5 font-bold tabular-nums text-cyan-300 print:text-black">{l.qty}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-200 print:text-black">{l.name}</p>
                    <span className="font-mono text-[10px] text-slate-400 print:text-slate-600">{l.sku}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-300 print:text-black">{soles(l.unitPriceCents)}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-white print:text-black">{soles(l.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Resumen de Totales e Impuestos */}
        <div className="mt-3 flex justify-end">
          <div className="w-64 space-y-1 text-xs">
            <div className="flex justify-between text-slate-400 print:text-slate-600">
              <span>Op. Gravada:</span>
              <span className="tabular-nums font-semibold text-slate-200 print:text-black">{soles(totals?.gravadaCents || 0)}</span>
            </div>
            <div className="flex justify-between text-slate-400 print:text-slate-600">
              <span>IGV (18%):</span>
              <span className="tabular-nums font-semibold text-slate-200 print:text-black">{soles(totals?.igvCents || 0)}</span>
            </div>
            <div className="flex justify-between border-t border-ink-700 pt-1 text-sm font-black text-white print:border-slate-400 print:text-black">
              <span>TOTAL A PAGAR:</span>
              <span className="tabular-nums text-cyan-300 print:text-black">{soles(totals?.totalCents || 0)}</span>
            </div>
          </div>
        </div>

        {/* Términos Comerciales */}
        <div className="mt-4 rounded-xl border border-ink-800 bg-ink-950/40 p-3 text-[11px] text-slate-400 print:border-slate-300 print:bg-slate-50 print:text-slate-600">
          <p className="font-semibold text-slate-300 print:text-black">Condiciones de Venta:</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            <li>Precios expresados en Soles (PEN), incluyen IGV.</li>
            <li>Validez de la oferta: 3 días hábiles sujeta a confirmación de stock.</li>
            <li>Cuentas corrientes para transferencias autorizadas BCP, BBVA e Interbank.</li>
          </ul>
        </div>

        {/* Acciones (Ocultas en impresión) */}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-ink-800 pt-3 print:hidden">
          <button
            type="button"
            onClick={handleCopyText}
            className="flex items-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-ink-700 active:scale-95 transition-all"
          >
            {copied ? <IconCheck width={14} height={14} /> : null}
            {copied ? '¡Texto Copiado!' : 'Copiar Texto Formal'}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-ink-950 hover:bg-cyan-300 active:scale-95 transition-all"
          >
            🖨️ Imprimir / Guardar PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-ink-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-ink-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
