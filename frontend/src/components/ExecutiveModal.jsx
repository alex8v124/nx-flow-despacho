import { useMemo, useState } from 'react';
import { soles } from '../lib/money.js';
import { store } from '../lib/storage.js';
import { IconCheck, IconX } from './icons.jsx';

export default function ExecutiveModal({ open, onClose, onResetStock }) {
  const [copied, setCopied] = useState(false);

  const unmetDemand = useMemo(() => {
    return store.get('nf.unmet_demand', []);
  }, [open]);

  const ordersHistory = useMemo(() => {
    return store.get('nf.orders_history', []);
  }, [open]);

  // Cálculo de fuga de ventas por quiebre de stock
  const lostSalesCents = useMemo(() => {
    return unmetDemand.reduce((acc, item) => acc + (item.priceCents * item.requestedQty), 0);
  }, [unmetDemand]);

  // Agrupar demanda insatisfecha por SKU
  const topMissedSkus = useMemo(() => {
    const map = new Map();
    for (const item of unmetDemand) {
      const current = map.get(item.sku) || { sku: item.sku, name: item.name, count: 0, totalLostCents: 0 };
      current.count += item.requestedQty;
      current.totalLostCents += item.priceCents * item.requestedQty;
      map.set(item.sku, current);
    }
    return Array.from(map.values()).sort((a, b) => b.totalLostCents - a.totalLostCents).slice(0, 5);
  }, [unmetDemand]);

  const handleExportAccountingCsv = () => {
    if (!ordersHistory.length) {
      alert('Aún no hay pedidos despachados para exportar en este turno.');
      return;
    }
    const headers = ['ID_PEDIDO', 'FECHA', 'TIPO_DOC', 'NUM_DOC', 'CLIENTE', 'VENDEDOR', 'SKU', 'DESCRIPCION', 'CANTIDAD', 'PU_SOLES', 'TOTAL_SOLES'];
    const rows = [];
    for (const ord of ordersHistory) {
      for (const line of ord.lines || []) {
        rows.push([
          ord.orderId,
          ord.date,
          ord.customer?.docType || 'BOLETA',
          ord.customer?.docNumber || '-',
          `"${(ord.customer?.name || 'CLIENTES VARIOS').replace(/"/g, '""')}"`,
          ord.seller || 'MOSTRADOR',
          line.sku,
          `"${line.name.replace(/"/g, '""')}"`,
          line.qty,
          (line.unitPriceCents / 100).toFixed(2),
          (line.lineTotalCents / 100).toFixed(2),
        ].join(','));
      }
    }
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nodux_lote_contable_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sampleJsonWebhook = useMemo(() => {
    const sample = ordersHistory[ordersHistory.length - 1] || {
      orderId: 'NF-A1B2C3D4',
      status: 'RESERVED',
      customer: { docType: 'RUC', docNumber: '20524854521', name: 'VMWARE SISTEMA INTEGRAL S.A.C.' },
      lines: [{ sku: 'TUB-PVC-110', qty: 10, unitPriceCents: 3850, lineTotalCents: 38500 }],
      totals: { gravadaCents: 32627, igvCents: 5873, totalCents: 38500 },
      sync: { erpStatus: 'PENDING_STARSOFT_INTEGRATION', sunatSync: 'READY_FOR_NUBEFACT' }
    };
    return JSON.stringify(sample, null, 2);
  }, [ordersHistory]);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(sampleJsonWebhook);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-ink-600 bg-ink-900 p-5 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-700 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                Moat Operativo
              </span>
              <h2 className="text-xl font-black text-white">Panel de Control Gerencial B2B</h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">Analítica de flujo de caja, demanda insatisfecha e inyección contable.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-xl bg-ink-800 text-slate-300 hover:bg-ink-700">
            <IconX width={20} height={20} />
          </button>
        </div>

        {/* 1. Métricas de Valor Recurrente (El Moat que retiene el MRR) */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink-700 bg-ink-800/80 p-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cotizaciones Turno</span>
            <p className="mt-1 text-2xl font-black text-white">{ordersHistory.length}</p>
            <span className="text-[10px] text-cyan-300">Despachos registrados</span>
          </div>

          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-300">Fuga por Quiebre Stock</span>
            <p className="mt-1 text-2xl font-black text-rose-400">{soles(lostSalesCents)}</p>
            <span className="text-[10px] text-rose-200/80">{unmetDemand.length} intentos sin stock</span>
          </div>

          <div className="col-span-2 rounded-2xl border border-ink-700 bg-ink-800/80 p-3.5 sm:col-span-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Velocidad Promedio</span>
            <p className="mt-1 text-2xl font-black text-emerald-400">8.4s</p>
            <span className="text-[10px] text-slate-400">vs. 5 min tradicionales</span>
          </div>
        </div>

        {/* 2. Top Demanda Insatisfecha (Datos que ningún ERP tradicional captura) */}
        <div className="mt-4 rounded-2xl border border-ink-700 bg-ink-800/60 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Top Fuga de Ventas (Quiebre de Stock Detectado)</h3>
            <span className="text-xs text-slate-400">Demanda no atendida</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Productos que los clientes intentaron cotizar pero almacén no tenía inventario físico:
          </p>

          {topMissedSkus.length === 0 ? (
            <p className="mt-3 rounded-xl bg-ink-800 p-3 text-center text-xs text-slate-500">
              No se han registrado quiebres de stock en la sesión actual.
            </p>
          ) : (
            <ul className="mt-2.5 divide-y divide-ink-700/60 text-xs">
              {topMissedSkus.map((item) => (
                <li key={item.sku} className="flex items-center justify-between py-2">
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="font-mono font-semibold text-cyan-300">{item.sku}</span>
                    <p className="truncate text-slate-200">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-rose-400">{soles(item.totalLostCents)}</span>
                    <p className="text-[10px] text-slate-400">{item.count} unidades perdidas</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 3. Inyección Contable / ERP (Matar la transcripción manual) */}
        <div className="mt-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
          <h3 className="text-sm font-bold text-white">Puente Contable y Cierre Transaccional</h3>
          <p className="mt-1 text-xs text-slate-300 leading-relaxed">
            Nodux Flow no obliga al asistente a transcribir desde WhatsApp. Los pedidos quedan pre-registrados en estructura contable para StarSoft, Concar, SAP B1 o inyección directa a Nubefact:
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportAccountingCsv}
              className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-bold text-ink-950 hover:bg-cyan-300 active:scale-95 transition-all"
            >
              📊 Descargar Lote Contable (CSV / Excel)
            </button>
            <button
              type="button"
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-ink-700 active:scale-95"
            >
              {copied ? <IconCheck width={14} height={14} /> : null}
              {copied ? '¡Payload Copiado!' : 'Copiar Webhook JSON (Nubefact / ERP)'}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink-800 pt-3">
          <button
            type="button"
            onClick={onResetStock}
            className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 active:scale-95 transition-all"
            title="Restaura todo el stock a sus valores de fábrica y limpia la fuga de ventas registrada"
          >
            🔄 Restablecer Inventario Demo
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-ink-800 px-5 py-2.5 text-xs font-bold text-slate-300 hover:bg-ink-700"
          >
            Cerrar Panel
          </button>
        </div>
      </div>
    </div>
  );
}
