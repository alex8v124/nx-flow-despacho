import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import catalogData from '../../shared/catalog.json';
import { fetchStock, reserveOrder, apiEnabled, flushOutbox, outboxSize } from './lib/api.js';
import { buildIndex, search } from './lib/search.js';
import { splitIgv } from './lib/money.js';
import { store, uuid } from './lib/storage.js';
import { buildWhatsAppText, buildWhatsAppUrl } from './lib/whatsapp.js';
import { useDebounce, useOnline } from './hooks.js';
import ProductRow from './components/ProductRow.jsx';
import CheckoutBar from './components/CheckoutBar.jsx';
import CheckoutSheet from './components/CheckoutSheet.jsx';
import { IconSearch, IconX, IconReset } from './components/icons.jsx';

const STORAGE_KEYS = {
  SEDE: 'nf.sede',
  CART: 'nf.cart',
  STARTED: 'nf.started',
  SELLER: 'nf.seller',
  PHONE: 'nf.phone',
};

const searchIndex = buildIndex(catalogData.products);
const categories = ['Todas', ...new Set(catalogData.products.map((p) => p.category))];

export default function App() {
  const online = useOnline();
  const [sedeId, setSedeId] = useState(() => store.get(STORAGE_KEYS.SEDE, catalogData.sedes[0].id));
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

  const searchInputRef = useRef(null);

  const currentSede = useMemo(() => {
    return catalogData.sedes.find((s) => s.id === sedeId) || catalogData.sedes[0];
  }, [sedeId]);

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

  // Cantidad y stock por producto
  const getProductStock = useCallback(
    (product) => {
      if (serverStock && serverStock.has(product.sku)) {
        return serverStock.get(product.sku);
      }
      return product.stock[sedeId] ?? 0;
    },
    [serverStock, sedeId],
  );

  const handleQtyChange = useCallback(
    (sku, nextQty) => {
      setQuantities((prev) => {
        const product = catalogData.products.find((p) => p.sku === sku);
        const max = product ? getProductStock(product) : 9999;
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
    [getProductStock, startedAt],
  );

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
  }, [debouncedQuery, category]);

  // Líneas del carrito calculadas
  const cartLines = useMemo(() => {
    return Object.entries(quantities)
      .map(([sku, qty]) => {
        const p = catalogData.products.find((item) => item.sku === sku);
        if (!p || qty <= 0) return null;
        return {
          sku: p.sku,
          name: p.name,
          category: p.category,
          unit: p.unit,
          qty,
          unitPriceCents: p.priceCents,
          lineTotalCents: p.priceCents * qty,
        };
      })
      .filter(Boolean);
  }, [quantities]);

  const totalUnits = useMemo(() => cartLines.reduce((acc, l) => acc + l.qty, 0), [cartLines]);
  const totalCents = useMemo(() => cartLines.reduce((acc, l) => acc + l.lineTotalCents, 0), [cartLines]);
  const totals = useMemo(() => splitIgv(totalCents, catalogData.igvRate), [totalCents]);

  const handleOpenCheckout = () => {
    setCheckoutError(null);
    setCheckoutResult(null);
    setSheetOpen(true);
  };

  const handleCheckoutSubmit = async ({ customer, seller, phone, notes }) => {
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
    });
    const url = buildWhatsAppUrl(phone || currentSede.whatsapp, text);

    // Abrir WhatsApp en pestaña/app
    window.open(url, '_blank', 'noopener,noreferrer');

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
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            <img
              src="/logo-64.webp"
              alt="Nodux Logo"
              width="32"
              height="32"
              className="h-8 w-8 rounded-xl object-contain bg-ink-900 border border-ink-700/80 shadow-sm shadow-cyan-400/20"
            />
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-base font-black tracking-tight text-white">NODUX FLOW</span>
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
                  v0.1
                </span>
              </div>
              <span className="text-[10px] text-slate-400">Terminal Móvil de Despacho B2B</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Estado de conexión / Offline outbox */}
            {pendingSync > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                {pendingSync} en cola
              </span>
            )}
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {online ? 'Online' : 'Sin red'}
            </span>

            {/* Selector de Sede */}
            <select
              value={sedeId}
              onChange={handleSedeChange}
              aria-label="Seleccionar sede"
              className="h-9 rounded-xl border border-ink-700 bg-ink-800 px-2 text-xs font-semibold text-white outline-none focus:border-cyan-400"
            >
              {catalogData.sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Buscador reactivo ultraligero */}
        <div className="mx-auto max-w-2xl px-3 pb-2 pt-1">
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-3.5 text-slate-400">
              <IconSearch width={20} height={20} />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              inputMode="search"
              placeholder="Buscar SKU o nombre técnico (ej: 110, soldadura, cable)..."
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              className="h-12 w-full rounded-2xl border border-ink-700 bg-ink-800/80 pl-11 pr-10 text-sm text-white placeholder:text-slate-500 outline-none transition-colors focus:border-cyan-400 focus:bg-ink-800"
            />
            {rawQuery && (
              <button
                type="button"
                onClick={() => {
                  setRawQuery('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 grid h-7 w-7 place-items-center rounded-lg bg-ink-700 text-slate-300 active:bg-ink-600"
                aria-label="Limpiar búsqueda"
              >
                <IconX width={16} height={16} />
              </button>
            )}
          </div>

          {/* Chips de Categorías */}
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto py-1">
            {categories.map((c) => {
              const active = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? 'bg-cyan-400 text-ink-950 shadow-sm shadow-cyan-400/30'
                      : 'bg-ink-800 text-slate-400 hover:text-white active:bg-ink-700'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Catálogo de Productos */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-3 pb-32 pt-3">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span>
            Mostrando <strong className="text-white">{filteredProducts.length}</strong> de {catalogData.products.length} SKUs
          </span>
          {totalUnits > 0 && (
            <button
              type="button"
              onClick={resetCart}
              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 active:text-rose-300"
            >
              <IconReset width={14} height={14} />
              Vaciar pedido
            </button>
          )}
        </div>

        {filteredProducts.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-dashed border-ink-700 p-8 text-center text-slate-400">
            <p className="text-base font-semibold text-slate-300">No encontramos coincidencias para "{rawQuery}"</p>
            <p className="mt-1 text-xs text-slate-500">Prueba con palabras clave como PVC, 12 AWG, taladro o el SKU directo.</p>
            <button
              type="button"
              onClick={() => {
                setRawQuery('');
                setCategory('Todas');
              }}
              className="mt-4 rounded-xl bg-ink-800 px-4 py-2 text-xs font-bold text-cyan-300 active:bg-ink-700"
            >
              Ver todo el catálogo
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredProducts.map((p) => (
              <ProductRow
                key={p.sku}
                product={p}
                qty={quantities[p.sku] || 0}
                stock={getProductStock(p)}
                priceCents={p.priceCents}
                onChange={handleQtyChange}
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
      />
    </div>
  );
}
