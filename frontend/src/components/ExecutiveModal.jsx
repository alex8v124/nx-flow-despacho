import { useMemo, useState } from 'react';
import { soles } from '../lib/money.js';
import { store } from '../lib/storage.js';
import { triggerCustomerWebhook } from '../lib/api.js';
import { IconCheck, IconX } from './icons.jsx';

export default function ExecutiveModal({
  open,
  onClose,
  onResetStock,
  onUpdateCatalog,
  onResetCatalog,
  catalog = [],
  sedeId = 'ate',
}) {
  const [tab, setTab] = useState('demanda'); // 'demanda' | 'vendedores' | 'ingestor' | 'webhook'
  const [copied, setCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState(() => store.get('nf.webhook_url', ''));
  const [webhookStatus, setWebhookStatus] = useState(null);
  const [uploadFeedback, setUploadFeedback] = useState(null);
  const [parsedPreview, setParsedPreview] = useState(null);

  const unmetDemand = useMemo(() => {
    return store.get('nf.unmet_demand', []);
  }, [open, tab]);

  const zeroSearches = useMemo(() => {
    return store.get('nf.zero_searches', []);
  }, [open, tab]);

  const ordersHistory = useMemo(() => {
    return store.get('nf.orders_history', []);
  }, [open, tab]);

  // Cálculo de fuga de ventas por quiebre de stock
  const lostSalesCents = useMemo(() => {
    return unmetDemand.reduce((acc, item) => acc + item.priceCents * item.requestedQty, 0);
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
    return Array.from(map.values())
      .sort((a, b) => b.totalLostCents - a.totalLostCents)
      .slice(0, 5);
  }, [unmetDemand]);

  // Auditoría por Vendedor (Rendimiento Comercial)
  const sellerMetrics = useMemo(() => {
    const map = new Map();
    for (const ord of ordersHistory) {
      const s = ord.seller || 'Mostrador General';
      const cur = map.get(s) || { seller: s, orders: 0, totalCents: 0, lastDate: ord.date };
      cur.orders += 1;
      cur.totalCents += ord.totals?.totalCents || 0;
      map.set(s, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.totalCents - a.totalCents);
  }, [ordersHistory]);

  const handleExportAccountingCsv = () => {
    if (!ordersHistory.length) {
      alert('Aún no hay pedidos despachados para exportar en este turno.');
      return;
    }
    const headers = [
      'ID_PEDIDO',
      'FECHA',
      'TIPO_DOC',
      'NUM_DOC',
      'CLIENTE',
      'VENDEDOR',
      'SKU',
      'DESCRIPCION',
      'CANTIDAD',
      'PU_SOLES',
      'TOTAL_SOLES',
    ];
    const rows = [];
    for (const ord of ordersHistory) {
      for (const line of ord.lines || []) {
        rows.push(
          [
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
          ].join(',')
        );
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
      date: new Date().toISOString(),
      sede: 'Ate - Vitarte',
      customer: { docType: 'RUC', docNumber: '20524854521', name: 'VMWARE SISTEMA INTEGRAL S.A.C.' },
      lines: [{ sku: 'TUB-PVC-110', name: 'Tubo PVC SAP 110mm x 3m', qty: 10, unitPriceCents: 3850, lineTotalCents: 38500 }],
      totals: { gravadaCents: 32627, igvCents: 5873, totalCents: 38500 },
      sync: { erpStatus: 'PENDING_STARSOFT_INTEGRATION', sunatSync: 'READY_FOR_NUBEFACT' },
    };
    return JSON.stringify(sample, null, 2);
  }, [ordersHistory]);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(sampleJsonWebhook);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveWebhook = (url) => {
    setWebhookUrl(url);
    store.set('nf.webhook_url', url.trim());
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      setWebhookStatus({ ok: false, message: 'Ingrese una URL válida (http/https)' });
      return;
    }
    if (webhookUrl.includes('docs.google.com/spreadsheets/')) {
      setWebhookStatus({
        ok: false,
        message: '⚠️ Has pegado el enlace de visualización web de Google Sheets (error 405). Para enviar datos a Sheets debes usar la URL de Apps Script (/exec) o un conector Make/Zapier/Webhook.site.',
      });
      return;
    }
    setWebhookStatus({ ok: null, message: 'Enviando payload de prueba…' });
    const dummyPayload = {
      event: 'ORDER_DISPATCH_TEST',
      orderId: 'TEST-' + Date.now().toString(36),
      sede: sedeId,
      timestamp: new Date().toISOString(),
      customer: { name: 'PRUEBA INTEGRACION NODUX FLOW', docType: 'RUC', docNumber: '20524854521' },
      totals: { totalCents: 15000, totalSoles: '150.00' },
    };
    const ok = await triggerCustomerWebhook(webhookUrl.trim(), dummyPayload);
    if (ok) {
      setWebhookStatus({ ok: true, message: '✓ Conexión exitosa: Webhook respondió correctamente.' });
    } else {
      setWebhookStatus({ ok: false, message: '⚠️ Error al enviar o bloqueo de red en destino.' });
    }
  };

  // Parser simple de CSV para Ingestor de Catálogo
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = String(evt.target?.result || '');
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          setUploadFeedback({ error: 'El archivo CSV debe tener al menos una fila de encabezados y un producto.' });
          return;
        }

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const skuIdx = headers.findIndex((h) => h.includes('sku') || h.includes('codigo'));
        const nameIdx = headers.findIndex((h) => h.includes('name') || h.includes('nombre') || h.includes('descripcion'));
        const priceIdx = headers.findIndex((h) => h.includes('precio') || h.includes('price'));
        const catIdx = headers.findIndex((h) => h.includes('cat') || h.includes('categoria'));

        if (skuIdx === -1 || nameIdx === -1 || priceIdx === -1) {
          setUploadFeedback({
            error: 'No se encontraron las columnas obligatorias: SKU, Nombre/Descripción, Precio.',
          });
          return;
        }

        const parsed = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
          const sku = cols[skuIdx];
          const name = cols[nameIdx];
          const priceRaw = parseFloat(cols[priceIdx]) || 0;
          if (!sku || !name) continue;

          parsed.push({
            sku,
            name,
            category: catIdx !== -1 && cols[catIdx] ? cols[catIdx] : 'General',
            unit: 'und',
            priceCents: Math.round(priceRaw * 100),
            stock: { ate: 20, collique: 15, surquillo: 10 },
          });
        }

        if (parsed.length === 0) {
          setUploadFeedback({ error: 'No se pudieron procesar filas válidas en el CSV.' });
          return;
        }

        setParsedPreview(parsed);
        setUploadFeedback({ success: `✓ Detectados ${parsed.length} productos listos para sincronizar en la nube.` });
      } catch (err) {
        setUploadFeedback({ error: `Fallo al procesar CSV: ${err.message}` });
      }
    };
    reader.readAsText(file);
  };

  const handleApplyCatalog = () => {
    if (!parsedPreview || parsedPreview.length === 0) return;
    onUpdateCatalog?.(parsedPreview);
    setUploadFeedback({ success: `✓ ¡Catálogo actualizado con éxito! (${parsedPreview.length} SKUs activos)` });
    setParsedPreview(null);
  };

  const handleDownloadTemplate = () => {
    const csvHeader = 'sku,nombre,categoria,precio_soles,unidad\n';
    const csvExample = [
      'TUB-PVC-110,Tubo PVC SAP 110mm x 3m Pavco,Tuberías y PVC,38.50,und',
      'CAB-THW-12,Cable Eléctrico 12 AWG Indeco x 100m,Cables y Electricidad,185.00,rollo',
      'TAL-IMP-20V,Taladro Percutor Inalámbrico 20V DeWalt,Herramientas,420.00,und',
      'DIS-COR-4.5,Disco de Corte Metal 4.5 pulg Norton,Abrasivos,4.50,und',
    ].join('\n');

    const blob = new Blob([csvHeader + csvExample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_catalogo_nodux.csv';
    a.click();
    URL.revokeObjectURL(a);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-ink-600 bg-ink-900 p-5 text-slate-100 shadow-2xl">
        {/* Header del Panel */}
        <div className="flex items-center justify-between border-b border-ink-700 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                Commercial OS
              </span>
              <h2 className="text-xl font-black text-white">Panel de Control Gerencial B2B</h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Desacople administrativo: telemetría de demanda, auditoría de asesores y sincronización ERP.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-10 w-10 place-items-center rounded-xl bg-ink-800 text-slate-300 hover:bg-ink-700"
          >
            <IconX width={20} height={20} />
          </button>
        </div>

        {/* Pestañas de Navegación del Gerente */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto border-b border-ink-800 pb-2 text-xs font-bold no-scrollbar">
          <button
            type="button"
            onClick={() => setTab('demanda')}
            className={`rounded-xl px-3 py-1.5 transition-all ${
              tab === 'demanda' ? 'bg-cyan-400 text-ink-950' : 'bg-ink-800 text-slate-400 hover:text-white'
            }`}
          >
            📊 Fuga & Demanda Oculta
          </button>
          <button
            type="button"
            onClick={() => setTab('vendedores')}
            className={`rounded-xl px-3 py-1.5 transition-all ${
              tab === 'vendedores' ? 'bg-cyan-400 text-ink-950' : 'bg-ink-800 text-slate-400 hover:text-white'
            }`}
          >
            👥 Rendimiento Asesores
          </button>
          <button
            type="button"
            onClick={() => setTab('ingestor')}
            className={`rounded-xl px-3 py-1.5 transition-all ${
              tab === 'ingestor' ? 'bg-cyan-400 text-ink-950' : 'bg-ink-800 text-slate-400 hover:text-white'
            }`}
          >
            📥 Ingestor Catálogo (Sync)
          </button>
          <button
            type="button"
            onClick={() => setTab('webhook')}
            className={`rounded-xl px-3 py-1.5 transition-all ${
              tab === 'webhook' ? 'bg-cyan-400 text-ink-950' : 'bg-ink-800 text-slate-400 hover:text-white'
            }`}
          >
            🔗 Conector ERP & Webhook
          </button>
        </div>

        {/* TAB 1: FUGA Y DEMANDA OCULTA */}
        {tab === 'demanda' && (
          <div className="mt-3 space-y-4">
            {/* Métricas macro */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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

              <div className="col-span-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 sm:col-span-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Búsquedas sin Stock</span>
                <p className="mt-1 text-2xl font-black text-amber-400">{zeroSearches.length}</p>
                <span className="text-[10px] text-slate-400">Demanda de productos faltantes</span>
              </div>
            </div>

            {/* Top Fuga de Ventas (Quiebre de Stock) */}
            <div className="rounded-2xl border border-ink-700 bg-ink-800/60 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Top Fuga de Ventas (Quiebre de Stock Físico)</h3>
                <span className="text-xs text-slate-400">Inventario en cero</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Productos que los clientes intentaron cotizar pero la sede no contaba con existencias:
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

            {/* Telemetría de Demanda Oculta (Búsquedas sin Resultado) */}
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">🔍 Telemetría de Demanda Oculta (Productos no existentes)</h3>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">Insumo de Compras</span>
              </div>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                Términos que los asesores o clientes escribieron en la barra de búsqueda y que arrojaron <strong>0 resultados</strong> en catálogo. Señal directa de demanda desatendida para ampliar inventario o importaciones:
              </p>

              {zeroSearches.length === 0 ? (
                <p className="mt-3 rounded-xl bg-ink-800 p-3 text-center text-xs text-slate-500">
                  No se han registrado búsquedas con cero resultados aún.
                </p>
              ) : (
                <div className="mt-2.5 overflow-hidden rounded-xl border border-ink-700 bg-ink-800/80">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-ink-800/90 text-[10px] font-bold uppercase text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Término Buscado</th>
                        <th className="px-3 py-2 text-right">Intentos</th>
                        <th className="px-3 py-2 text-right">Último Intento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-700/60">
                      {zeroSearches.map((zs, idx) => (
                        <tr key={idx} className="hover:bg-ink-700/30">
                          <td className="px-3 py-2 font-mono font-medium text-amber-300">"{zs.term}"</td>
                          <td className="px-3 py-2 text-right font-bold text-white tabular-nums">{zs.count || 1}</td>
                          <td className="px-3 py-2 text-right text-[11px] text-slate-400">
                            {zs.lastSearchedAt ? new Date(zs.lastSearchedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: RENDIMIENTO ASESORES / AUDITORIA */}
        {tab === 'vendedores' && (
          <div className="mt-3 space-y-4">
            <div className="rounded-2xl border border-ink-700 bg-ink-800/60 p-4">
              <h3 className="text-sm font-bold text-white">Auditoría de Despachos por Asesor Comercial</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Monitoreo en tiempo real de velocidad de cierre y volumen cotizado por vendedor en sala:
              </p>

              {sellerMetrics.length === 0 ? (
                <p className="mt-3 rounded-xl bg-ink-800 p-3 text-center text-xs text-slate-500">
                  Aún no se han despachado pedidos en este turno para auditar asesores.
                </p>
              ) : (
                <div className="mt-3 overflow-hidden rounded-xl border border-ink-700">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-ink-800 text-[10px] font-bold uppercase text-slate-400">
                      <tr>
                        <th className="px-3 py-2.5">Asesor</th>
                        <th className="px-3 py-2.5 text-center">Despachos</th>
                        <th className="px-3 py-2.5 text-right">Total Facturado</th>
                        <th className="px-3 py-2.5 text-right">Ticket Prom.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-700/60">
                      {sellerMetrics.map((sm) => (
                        <tr key={sm.seller} className="hover:bg-ink-800/40">
                          <td className="px-3 py-3 font-semibold text-white">{sm.seller}</td>
                          <td className="px-3 py-3 text-center font-bold text-cyan-300 tabular-nums">{sm.orders}</td>
                          <td className="px-3 py-3 text-right font-bold text-emerald-400 tabular-nums">{soles(sm.totalCents)}</td>
                          <td className="px-3 py-3 text-right text-slate-300 tabular-nums">{soles(Math.round(sm.totalCents / sm.orders))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: INGESTOR DE CATALOGO (DATA SYNC WORKER) */}
        {tab === 'ingestor' && (
          <div className="mt-3 space-y-4">
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Pipeline de Ingesta Continua (Data Sync Worker)</h3>
                <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300">Retención MRR</span>
              </div>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                El componente que justifica el mantenimiento mensual: actualiza listas de precios, nuevos SKUs y existencias arrastrando el archivo CSV o Excel sin tocar código ni reiniciar la terminal.
              </p>

              {/* Zona Drag & Drop */}
              <div className="mt-3 rounded-2xl border-2 border-dashed border-ink-600 bg-ink-800/60 p-5 text-center">
                <label className="flex cursor-pointer flex-col items-center justify-center">
                  <span className="text-2xl">📄</span>
                  <span className="mt-2 text-xs font-bold text-cyan-300 hover:underline">
                    Seleccionar o arrastrar archivo CSV de Inventario
                  </span>
                  <span className="text-[10px] text-slate-400">Columnas mínimas: sku, nombre, precio, categoría</span>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>

              {uploadFeedback?.error && (
                <div className="mt-2 rounded-xl bg-rose-500/20 p-2.5 text-xs text-rose-300 border border-rose-500/40">
                  {uploadFeedback.error}
                </div>
              )}
              {uploadFeedback?.success && (
                <div className="mt-2 rounded-xl bg-emerald-500/20 p-2.5 text-xs text-emerald-300 border border-emerald-500/40">
                  {uploadFeedback.success}
                </div>
              )}

              {/* Previsualización del CSV parseado */}
              {parsedPreview && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">Vista previa ({parsedPreview.length} items detectados):</span>
                    <button
                      type="button"
                      onClick={handleApplyCatalog}
                      className="rounded-xl bg-emerald-500 px-3 py-1.5 font-bold text-ink-950 hover:bg-emerald-400 active:scale-95 transition-all shadow-md shadow-emerald-500/20"
                    >
                      ⚡ Aplicar Catálogo en Vivo
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-ink-700 text-[11px]">
                    <table className="w-full text-left">
                      <thead className="bg-ink-800 text-slate-400">
                        <tr>
                          <th className="p-1.5">SKU</th>
                          <th className="p-1.5">Nombre</th>
                          <th className="p-1.5 text-right">Precio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-700/60">
                        {parsedPreview.slice(0, 5).map((p) => (
                          <tr key={p.sku}>
                            <td className="p-1.5 font-mono text-cyan-300">{p.sku}</td>
                            <td className="p-1.5 text-slate-200 truncate max-w-[200px]">{p.name}</td>
                            <td className="p-1.5 text-right font-bold text-white">{soles(p.priceCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Botones de acción */}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-ink-700 active:scale-95"
                >
                  📥 Descargar Plantilla CSV
                </button>
                <button
                  type="button"
                  onClick={onResetCatalog}
                  className="flex items-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-ink-700 active:scale-95"
                >
                  🔄 Revertir a Catálogo Original
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CONECTOR ERP & WEBHOOK */}
        {tab === 'webhook' && (
          <div className="mt-3 space-y-4">
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <h3 className="text-sm font-bold text-white">Puente Contable y Cierre Transaccional (Lead to ERP)</h3>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                Nodux Flow no obliga al asistente a transcribir desde WhatsApp. Los pedidos quedan pre-registrados en estructura contable para StarSoft, Concar, SAP B1 o inyección directa a Nubefact:
              </p>

              {/* Configuración de Webhook en Vivo */}
              <div className="mt-3 space-y-2 rounded-xl border border-ink-700 bg-ink-800/80 p-3">
                <label className="text-[11px] font-bold text-slate-300">
                  Webhook de Despacho (Google Sheets / Make / Zapier / ERP):
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://hook.eu2.make.com/... o https://webhook.site/..."
                    value={webhookUrl}
                    onChange={(e) => handleSaveWebhook(e.target.value)}
                    className="h-10 flex-1 rounded-xl border border-ink-600 bg-ink-900 px-3 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    className="shrink-0 rounded-xl bg-cyan-400 px-3 py-2 text-xs font-bold text-ink-950 hover:bg-cyan-300 active:scale-95"
                  >
                    🧪 Probar Webhook
                  </button>
                </div>
                {webhookStatus && (
                  <p className={`text-[11px] font-semibold ${webhookStatus.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {webhookStatus.message}
                  </p>
                )}

                {webhookUrl.includes('docs.google.com/spreadsheets') && (
                  <div className="rounded-xl border border-rose-500/50 bg-rose-500/15 p-2.5 text-xs text-rose-200">
                    <p className="font-bold">⚠️ Has pegado el enlace web de Google Sheets (genera error 405 Method Not Allowed).</p>
                    <p className="mt-1 text-[11px] text-slate-300">
                      Google Sheets no acepta llamadas POST a su interfaz web. Debes usar la URL de <strong>Apps Script (/exec)</strong> o una plataforma como <strong>Make.com / Webhook.site</strong>.
                    </p>
                  </div>
                )}

                <details className="mt-1 text-xs text-slate-400">
                  <summary className="cursor-pointer font-semibold text-cyan-300 hover:underline">
                    💡 ¿Cómo conectar tu Google Sheets gratis en 2 minutos? (Ver código)
                  </summary>
                  <div className="mt-2 space-y-1.5 rounded-xl bg-ink-950/90 p-3 text-[11px] text-slate-300 border border-ink-700">
                    <p>1. En tu Google Sheet ve al menú: <strong>Extensiones &gt; Apps Script</strong>.</p>
                    <p>2. Borra el código existente y pega esto:</p>
                    <pre className="overflow-x-auto rounded bg-ink-900 p-2 text-cyan-300 font-mono text-[10px]">
{`function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var d = JSON.parse(e.postData.contents);
  sheet.appendRow([
    new Date(),
    d.orderId,
    d.customer ? d.customer.name : 'Varios',
    d.customer ? (d.customer.docNumber || '-') : '-',
    d.totals ? (d.totals.totalCents / 100).toFixed(2) : 0
  ]);
  return ContentService.createTextOutput("OK");
}`}
                    </pre>
                    <p>3. Arriba a la derecha: <strong>Implementar &gt; Nueva implementación</strong>.</p>
                    <p>4. Tipo: <em>Aplicación web</em> | Acceso: <strong>Cualquiera (Anyone)</strong>.</p>
                    <p>5. Copia la URL que termina en <code>/exec</code> y pégala aquí.</p>
                  </div>
                </details>
              </div>

              {/* Acciones de exportación */}
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
          </div>
        )}

        {/* Footer con Acciones Globales */}
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
