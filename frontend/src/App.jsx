import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import catalogData from '../../shared/catalog.json';
import {
  fetchStock,
  reserveOrder,
  apiEnabled,
  flushOutbox,
  outboxSize,
  sendMissedDemandBeacon,
  sendZeroSearchBeacon,
  triggerCustomerWebhook,
} from './lib/api.js';
import { buildIndex, search } from './lib/search.js';
import { splitIgv } from './lib/money.js';
import { store, uuid } from './lib/storage.js';
import { buildWhatsAppText, buildWhatsAppUrl } from './lib/whatsapp.js';
import { useDebounce, useOnline } from './hooks.js';
import ProductRow from './components/ProductRow.jsx';
import CheckoutBar from './components/CheckoutBar.jsx';
import CheckoutSheet from './components/CheckoutSheet.jsx';
import ExecutiveModal from './components/ExecutiveModal.jsx';
import ProformaModal from './components/ProformaModal.jsx';
import { IconSearch, IconX, IconReset } from './components/icons.jsx';

const STORAGE_KEYS = {
  SEDE: 'nf.sede',
  CART: 'nf.cart',
  STARTED: 'nf.started',
  SELLER: 'nf.seller',
  PHONE: 'nf.phone',
  TARIFA: 'nf.tarifa',
};

const TARIFAS = {
  MOSTRADOR: { key: 'MOSTRADOR', label: 'Mostrador', factor: 1.0, badge: 'PVP' },
  TALLER: { key: 'TALLER', label: 'Taller', factor: 0.92, badge: '-8%' },
  MAYORISTA: { key: 'MAYORISTA', label: 'Mayorista', factor: 0.85, badge: '-15%' },
};

export default function App() {
  const online = useOnline();
  // Detección de Caso de Uso 2: Portal B2B de Autopedido para Clientes/Contratistas
  const isClientPortal = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'cliente' || params.get('portal') === 'b2b';
  }, []);

  // Catálogo dinámico: soporta el Data Sync Worker (actualización de precios vía CSV/Excel)
  const [products, setProducts] = useState(() => store.get('nf.custom_catalog', catalogData.products));
  const searchIndex = useMemo(() => buildIndex(products), [products]);
  const categories = useMemo(() => ['Todas', ...new Set(products.map((p) => p.category))], [products]);

  const [sedeId, setSedeId] = useState(() => store.get(STORAGE_KEYS.SEDE, catalogData.sedes[0].id));
  const [tarifaKey, setTarifaKey] = useState(() => store.get(STORAGE_KEYS.TARIFA, 'MOSTRADOR'));
  const [execOpen, setExecOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const logoTapRef = useRef({ count: 0, lastTime: 0 });

  const handleLogoClick = () => {
    const now = Date.now();
    if (now - logoTapRef.current.lastTime < 1500) {
      logoTapRef.current.count += 1;
    } else {
      logoTapRef.current.count = 1;
    }
    logoTapRef.current.lastTime = now;

    if (logoTapRef.current.count >= 3) {
      logoTapRef.current.count = 0;
      setPinInput('');
      setPinError(false);
      setPinModalOpen(true);
    }
  };

  const handleVerifyPin = (e) => {
    e?.preventDefault();
    if (pinInput.trim() === '1234') {
      setPinModalOpen(false);
      setPinInput('');
      setPinError(false);
      setExecOpen(true);
    } else {
      setPinError(true);
    }
  };

  // Acceso directo a administración vía URL (?admin=true o #admin)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true' || window.location.hash === '#admin') {
      setPinInput('');
      setPinError(false);
      setPinModalOpen(true);
    }
  }, []);
  const [proformaOrder, setProformaOrder] = useState(null);
  const [proformaOpen, setProformaOpen] = useState(false);
  const [rawQuery, setRawQuery] = useState('');
  const debouncedQuery = useDebounce(rawQuery, 150);
  const [category, setCategory] = useState('Todas');
  const [quantities, setQuantities] = useState(() => store.get(STORAGE_KEYS.CART, {}));
  const [startedAt, setStartedAt] = useState(() => store.get(STORAGE_KEYS.STARTED, null));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [checkoutResult, setCheckoutResult] = useState(null);
  const [pendingSync, setPendingSync] = useState(() => outboxSize());
  const [serverStock, setServerStock] = useState(null);
  // Control dinámico de inventario: resta compras reales para provocar quiebres de stock visibles
  const [stockDeltas, setStockDeltas] = useState(() => store.get('nf.stock_deltas', {}));
  const [toast, setToast] = useState(null);

  const searchInputRef = useRef(null);

  const currentSede = useMemo(() => {
    return catalogData.sedes.find((s) => s.id === sedeId) || catalogData.sedes[0];
  }, [sedeId]);

  // Auto-ocultar toast de alerta tras 3.5 segundos
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Persistir tarifa seleccionada
  useEffect(() => {
    store.set(STORAGE_KEYS.TARIFA, tarifaKey);
  }, [tarifaKey]);

  // Persistir sede seleccionada
  useEffect(() => {
    store.set(STORAGE_KEYS.SEDE, sedeId);
  }, [sedeId]);

  // Persistir carrito
  useEffect(() => {
    store.set(STORAGE_KEYS.CART, quantities);
  }, [quantities]);

  // Persistir cronómetro de cotización
  useEffect(() => {
    store.set(STORAGE_KEYS.STARTED, startedAt);
  }, [startedAt]);

  // Si hay API conectada, sincronizar stock remoto de la sede seleccionada
  useEffect(() => {
    if (!apiEnabled || !online) return;
    let cancel = false;
    fetchStock(sedeId)
      .then((items) => {
        if (cancel) return;
        const map = new Map(items.map((i) => [i.sku, i.stock]));
        setServerStock(map);
      })
      .catch(() => {
        // En caso de fallo o timeout, se mantiene stock de respaldo local
      });
    return () => {
      cancel = true;
    };
  }, [sedeId, online]);

  // Sincronización automática de cola fuera de línea al volver la red
  useEffect(() => {
    if (!online || !apiEnabled) return;
    flushOutbox().then(({ synced }) => {
      if (synced > 0) setPendingSync(outboxSize());
    });
  }, [online]);

  const handleSedeChange = (e) => {
    const next = e.target.value;
    setSedeId(next);
    setServerStock(null);
  };

  // Cálculo de precio según tarifa B2B segmentada (Mostrador, Taller, Mayorista)
  const getProductPriceCents = useCallback(
    (product) => {
      const factor = TARIFAS[tarifaKey]?.factor || 1.0;
      return Math.round(product.priceCents * factor);
    },
    [tarifaKey],
  );

  // Cantidad y stock por producto considerando los despachos efectuados
  const getProductStock = useCallback(
    (product) => {
      const base = serverStock && serverStock.has(product.sku)
        ? serverStock.get(product.sku)
        : (product.stock[sedeId] ?? 0);
      const delta = stockDeltas[`${sedeId}#${product.sku}`] || 0;
      return Math.max(0, base - delta);
    },
    [serverStock, sedeId, stockDeltas],
  );

  // Registrar demanda insatisfecha por quiebre de stock (Moat para el Gerente Comercial)
  const handleMissedDemand = useCallback(
    (product, qty = 1) => {
      const priceCents = getProductPriceCents(product);
      const missedItem = {
        sku: product.sku,
        name: product.name,
        category: product.category,
        priceCents,
        requestedQty: qty,
        sedeId,
        timestamp: new Date().toISOString(),
      };
      const unmetHistory = store.get('nf.unmet_demand', []);
      unmetHistory.push(missedItem);
      store.set('nf.unmet_demand', unmetHistory.slice(-100));

      // Envío asíncrono a DynamoDB
      sendMissedDemandBeacon(sedeId, missedItem);

      // Feedback visual inmediato en la terminal del vendedor
      setToast({
        id: Date.now(),
        message: `⚠️ Fuga de venta registrada: S/ ${(priceCents / 100).toFixed(2)} por stock agotado en "${product.name}". Contabilizado en Panel Gerencial.`,
      });
    },
    [getProductPriceCents, sedeId],
  );

  const handleQtyChange = useCallback(
    (sku, nextQty) => {
      setQuantities((prev) => {
        const product = products.find((p) => p.sku === sku);
        const max = product ? getProductStock(product) : 9999;

        // Registrar demanda insatisfecha si se supera el stock disponible
        if (product && (nextQty > max || max === 0)) {
          const missedQty = max === 0 ? 1 : nextQty - max;
          handleMissedDemand(product, missedQty);
        }

        const clamped = Math.max(0, Math.min(nextQty, max));

        const updated = { ...prev };
        if (clamped === 0) {
          delete updated[sku];
        } else {
          updated[sku] = clamped;
        }

        // Si es el primer producto añadido, arrancar el cronómetro de cotización
        const totalItems = Object.values(updated).reduce((a, b) => a + b, 0);
        if (totalItems > 0 && !startedAt) {
          setStartedAt(Date.now());
        } else if (totalItems === 0) {
          setStartedAt(null);
        }

        return updated;
      });
    },
    [getProductStock, startedAt, handleMissedDemand, products],
  );

  // Restablecer inventario de demostración a valores de fábrica
  const handleResetStockDemo = useCallback(() => {
    setStockDeltas({});
    store.remove('nf.stock_deltas');
    store.remove('nf.unmet_demand');
    store.remove('nf.zero_searches');
    setToast({
      id: Date.now(),
      message: '✓ Inventario restablecido al 100% y fuga de ventas reiniciada para demostración.',
    });
  }, []);

  // Actualización de Catálogo vía Data Sync Worker (Excel / CSV)
  const handleUpdateCatalog = useCallback((newProducts) => {
    setProducts(newProducts);
    store.set('nf.custom_catalog', newProducts);
    setToast({
      id: Date.now(),
      message: `✓ Catálogo sincronizado en caliente: ${newProducts.length} SKUs activos.`,
    });
  }, []);

  const handleResetCatalog = useCallback(() => {
    setProducts(catalogData.products);
    store.remove('nf.custom_catalog');
    setToast({
      id: Date.now(),
      message: '✓ Catálogo restaurado al inventario base original de demostración.',
    });
  }, []);

  const resetCart = () => {
    setQuantities({});
    setStartedAt(null);
    setCheckoutError(null);
    setCheckoutResult(null);
  };

  // Filtrado reactivo en memoria
  const filteredProducts = useMemo(() => {
    const cat = category === 'Todas' ? undefined : category;
    return search(searchIndex, debouncedQuery, cat);
  }, [debouncedQuery, category, searchIndex]);

  // Telemetría silenciosa de demanda oculta (búsquedas con 0 resultados)
  useEffect(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (q.length < 3) return;
    if (filteredProducts.length === 0) {
      const history = store.get('nf.zero_searches', []);
      const existing = history.find((h) => h.term === q);
      if (existing) {
        existing.count = (existing.count || 1) + 1;
        existing.lastSearchedAt = new Date().toISOString();
      } else {
        history.push({
          term: q,
          count: 1,
          sedeId,
          lastSearchedAt: new Date().toISOString(),
        });
      }
      store.set('nf.zero_searches', history.slice(-50));
      sendZeroSearchBeacon(sedeId, q);
    }
  }, [debouncedQuery, filteredProducts.length, sedeId]);

  // Líneas del carrito calculadas
  const cartLines = useMemo(() => {
    return Object.entries(quantities)
      .map(([sku, qty]) => {
        const p = products.find((item) => item.sku === sku);
        if (!p || qty <= 0) return null;
        const unitPriceCents = getProductPriceCents(p);
        return {
          sku: p.sku,
          name: p.name,
          category: p.category,
          unit: p.unit,
          qty,
          unitPriceCents,
          lineTotalCents: unitPriceCents * qty,
        };
      })
      .filter(Boolean);
  }, [quantities, getProductPriceCents, products]);

  const totalUnits = useMemo(() => cartLines.reduce((acc, l) => acc + l.qty, 0), [cartLines]);
  const totalCents = useMemo(() => cartLines.reduce((acc, l) => acc + l.lineTotalCents, 0), [cartLines]);
  const totals = useMemo(() => splitIgv(totalCents, catalogData.igvRate), [totalCents]);

  const handleOpenCheckout = () => {
    setCheckoutError(null);
    setCheckoutResult(null);
    setSheetOpen(true);
  };

  const handleCheckoutSubmit = async ({ customer, seller, phone, notes, condicionPago }) => {
    setBusy(true);
    setCheckoutError(null);

    const orderId = uuid();
    const payload = {
      orderId,
      sedeId,
      items: cartLines.map((l) => ({ sku: l.sku, qty: l.qty })),
      customer,
      seller: seller || undefined,
      notes: notes || undefined,
    };

    let reservation = 'DEMO';

    if (apiEnabled) {
      const res = await reserveOrder(payload);
      if (res.kind === 'CONFLICT') {
        setBusy(false);
        setCheckoutError(res.error);
        if (res.error?.details && Array.isArray(res.error.details)) {
          // Si hubo conflicto de stock, ajustar de inmediato las cantidades
          setQuantities((prev) => {
            const next = { ...prev };
            for (const d of res.error.details) {
              if (d.available === 0) delete next[d.sku];
              else if (typeof d.available === 'number') next[d.sku] = Math.min(next[d.sku] || 0, d.available);
            }
            return next;
          });
        }
        return;
      }
      reservation = res.kind; // 'RESERVED' o 'PENDING'
      setPendingSync(outboxSize());
    }

    const elapsedMs = startedAt ? Date.now() - startedAt : 10000;
    const text = buildWhatsAppText({
      orderId,
      sede: currentSede,
      seller,
      customer,
      notes,
      lines: cartLines,
      totals,
      reservation,
      condicionPago,
    });
    const url = buildWhatsAppUrl(phone || currentSede.whatsapp, text);

    // Guardar en historial de pedidos para exportación contable ERP
    const completedOrder = {
      orderId,
      date: new Date().toISOString().replace('T', ' ').slice(0, 19),
      sede: currentSede,
      customer,
      seller: seller || 'Mostrador',
      tarifa: TARIFAS[tarifaKey]?.label || 'Mostrador',
      condicionPago: condicionPago || 'Contado / Transf.',
      lines: cartLines,
      totals,
      reservation,
    };

    const ordersHistory = store.get('nf.orders_history', []);
    ordersHistory.push(completedOrder);
    store.set('nf.orders_history', ordersHistory.slice(-50));
    setProformaOrder(completedOrder);

    // Si el cliente configuró un webhook hacia su ERP, CRM o Google Sheets, dispararlo en segundo plano
    const webhookUrl = store.get('nf.webhook_url', '');
    if (webhookUrl) {
      triggerCustomerWebhook(webhookUrl, {
        event: 'ORDER_DISPATCHED',
        ...completedOrder,
      });
    }

    // Abrir WhatsApp en pestaña/app
    window.open(url, '_blank', 'noopener,noreferrer');

    // Descontar stock vendido en la sesión activa para reflejar quiebres de inventario reales
    setStockDeltas((prev) => {
      const next = { ...prev };
      for (const line of cartLines) {
        const key = `${sedeId}#${line.sku}`;
        next[key] = (next[key] || 0) + line.qty;
      }
      store.set('nf.stock_deltas', next);
      return next;
    });

    setBusy(false);
    setCheckoutResult({
      orderId,
      seconds: Math.max(1, elapsedMs / 1000),
      url,
      reservation,
    });
  };

  const handleNewOrder = () => {
    resetCart();
    setSheetOpen(false);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-ink-950 font-sans text-slate-100">
      {/* Top Header Compacto & Ligero */}
      <header className="sticky top-0 z-20 border-b border-ink-800/60 bg-ink-950/85 backdrop-blur-md">
        {/* Fila 1: Logo & Branding + Estado de Conexión + Selector de Sede */}
        <div className="mx-auto flex max-w-lg items-center justify-between px-3 py-1.5">
          <div
            onClick={handleLogoClick}
            className="flex items-center gap-1.5 cursor-pointer select-none active:opacity-75 transition-opacity"
            title="Nodux Flow"
          >
            <img
              src="/logo-64.webp"
              alt="Nodux"
              width="24"
              height="24"
              className="h-6 w-6 rounded-md object-contain bg-ink-900 border border-ink-700/60"
            />
            <span className="text-xs font-black tracking-tight text-white">NODUX FLOW</span>
            <span className="rounded bg-cyan-500/15 px-1 py-0.2 font-mono text-[8px] font-bold text-cyan-300">
              {isClientPortal ? 'B2B' : 'PRO'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {pendingSync > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-bold text-amber-300">
                {pendingSync} cola
              </span>
            )}
            <span
              className={`flex items-center gap-1 text-[10px] font-medium ${
                online ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              {online ? 'Online' : 'Offline'}
            </span>

            {/* Selector de Sede compacto */}
            <select
              value={sedeId}
              onChange={handleSedeChange}
              aria-label="Seleccionar sede"
              className="h-6 rounded-md border border-ink-700/70 bg-ink-800/90 px-1 text-[10px] font-semibold text-slate-200 outline-none focus:border-cyan-400"
            >
              {catalogData.sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Fila 2: Buscador reactivo ultraligero */}
        <div className="mx-auto max-w-lg px-3 pb-1.5">
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-3 text-slate-400">
              <IconSearch width={15} height={15} />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              inputMode="search"
              placeholder="Buscar producto, SKU o marca..."
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              className="h-8 w-full rounded-lg border border-ink-700/60 bg-ink-900/90 pl-8 pr-7 text-xs text-white placeholder:text-slate-400 outline-none transition-colors focus:border-cyan-400 focus:bg-ink-800"
            />
            {rawQuery && (
              <button
                type="button"
                onClick={() => {
                  setRawQuery('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2 grid h-5 w-5 place-items-center rounded bg-ink-700 text-slate-300 active:bg-ink-600"
                aria-label="Limpiar búsqueda"
              >
                <IconX width={11} height={11} />
              </button>
            )}
          </div>
        </div>

        {/* Fila 3: Filtro compacto de Categoría + Segmentación de Tarifas B2B */}
        <div className="mx-auto flex max-w-lg items-center justify-between border-t border-ink-800/40 bg-ink-950/40 px-3 py-1 gap-2">
          {/* Dropdown de Categoría */}
          <div className="flex items-center min-w-0 shrink">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filtrar por categoría"
              className="h-6 max-w-[130px] truncate rounded-md border border-ink-700/60 bg-ink-800/80 px-1.5 text-[10px] font-semibold text-slate-300 outline-none focus:border-cyan-400"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'Todas' ? '📂 Todas' : c}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Tarifas B2B */}
          <div className="flex items-center gap-1 shrink-0">
            {Object.values(TARIFAS).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTarifaKey(t.key)}
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-all ${
                  tarifaKey === t.key
                    ? 'bg-cyan-400 text-ink-950 shadow-sm shadow-cyan-400/20'
                    : 'bg-ink-800/70 text-slate-400 hover:text-white'
                }`}
              >
                {t.label} <span className="opacity-75 font-normal text-[9px]">{t.badge}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Toast de Demanda Insatisfecha / Alertas para el Vendedor */}
      {toast && (
        <aside aria-label="Notificaciones" className="fixed top-2.5 inset-x-3 z-50 mx-auto max-w-sm animate-pop">
          <div className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-ink-900/95 px-3 py-2 text-xs font-semibold text-amber-300 shadow-2xl backdrop-blur-md">
            <span className="leading-tight">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-slate-400 hover:text-white px-1 shrink-0"
              aria-label="Cerrar notificación"
            >
              ✕
            </button>
          </div>
        </aside>
      )}

      {/* Catálogo de Productos */}
      <main className={`mx-auto w-full max-w-lg flex-1 px-3 pt-2 ${totalUnits > 0 ? 'pb-24' : 'pb-6'}`}>
        <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            <strong className="text-white">{filteredProducts.length}</strong> de {products.length} SKUs
          </span>
          {totalUnits > 0 && (
            <button
              type="button"
              onClick={resetCart}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 active:text-rose-300"
            >
              <IconReset width={12} height={12} />
              Vaciar
            </button>
          )}
        </div>

        {filteredProducts.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-ink-800 p-6 text-center text-slate-400">
            <p className="text-sm font-semibold text-slate-300">Sin resultados para "{rawQuery}"</p>
            <p className="mt-1 text-xs text-slate-500">Prueba con palabras clave como PVC, cable o taladro.</p>
            <button
              type="button"
              onClick={() => {
                setRawQuery('');
                setCategory('Todas');
              }}
              className="mt-3 rounded-xl bg-ink-800 px-3 py-1.5 text-xs font-bold text-cyan-300 active:bg-ink-700"
            >
              Ver todo el catálogo
            </button>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filteredProducts.map((p) => (
              <ProductRow
                key={p.sku}
                product={p}
                qty={quantities[p.sku] || 0}
                stock={getProductStock(p)}
                priceCents={getProductPriceCents(p)}
                onChange={handleQtyChange}
                onMissedDemand={handleMissedDemand}
                currentSedeId={sedeId}
              />
            ))}
          </ul>
        )}
      </main>

      {/* Barra de Checkout fijada al inferior */}
      <CheckoutBar
        units={totalUnits}
        skus={cartLines.length}
        totalCents={totalCents}
        startedAt={startedAt}
        onCheckout={handleOpenCheckout}
      />

      {/* Modal / Bottom Sheet de Despacho */}
      <CheckoutSheet
        open={sheetOpen}
        sede={currentSede}
        lines={cartLines}
        totals={totals}
        defaults={{
          seller: store.get(STORAGE_KEYS.SELLER, 'Vendedor 01'),
          phone: store.get(STORAGE_KEYS.PHONE, currentSede.whatsapp),
        }}
        busy={busy}
        error={checkoutError}
        result={checkoutResult}
        onClose={() => setSheetOpen(false)}
        onSubmit={handleCheckoutSubmit}
        onNewOrder={handleNewOrder}
        onViewProforma={() => setProformaOpen(true)}
      />

      {/* Modal de Acceso Seguro por PIN al Centro de Control */}
      {pinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-lg">
                🔒
              </div>
              <h3 className="text-sm font-bold text-white">Centro de Control</h3>
              <p className="mt-1 text-xs text-slate-400">
                Ingrese el PIN de acceso gerencial.
              </p>
              <p className="text-[10px] text-cyan-400 font-mono mt-0.5">(PIN demo: 1234)</p>
            </div>

            <form onSubmit={handleVerifyPin} className="mt-4">
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                autoFocus
                placeholder="PIN (1234)"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
                className={`h-11 w-full text-center tracking-widest text-lg font-bold rounded-xl border bg-ink-950 px-3 text-white outline-none transition-colors ${
                  pinError ? 'border-rose-500 text-rose-300' : 'border-ink-700 focus:border-cyan-400'
                }`}
              />
              {pinError && (
                <p className="mt-1.5 text-center text-xs text-rose-400 font-semibold">
                  PIN incorrecto. Intente con 1234.
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPinModalOpen(false);
                    setPinInput('');
                    setPinError(false);
                  }}
                  className="flex-1 rounded-xl bg-ink-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-ink-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-cyan-400 py-2.5 text-xs font-bold text-ink-950 shadow-md shadow-cyan-400/20 active:scale-95"
                >
                  Ingresar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Control Gerencial B2B (Moat Operativo, Ingestor, Webhooks y Telemetría) */}
      <ExecutiveModal
        open={execOpen}
        onClose={() => setExecOpen(false)}
        onResetStock={handleResetStockDemo}
        onUpdateCatalog={handleUpdateCatalog}
        onResetCatalog={handleResetCatalog}
        catalog={products}
        sedeId={sedeId}
      />

      {/* Modal de Proforma Formal B2B (Cotización Imprimible / PDF Express) */}
      <ProformaModal
        order={proformaOpen ? proformaOrder : null}
        onClose={() => setProformaOpen(false)}
      />
    </div>
  );
}
