import { memo } from 'react';
import { soles } from '../lib/money.js';
import { IconMinus, IconPlus } from './icons.jsx';

function StockBadge({ stock }) {
  if (stock <= 0) return <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">Agotado</span>;
  if (stock <= 5) return <span className="rounded-md bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-300">Quedan {stock}</span>;
  return <span className="rounded-md bg-ink-700 px-2 py-0.5 text-xs font-medium text-slate-400">Stock {stock}</span>;
}

/** Fila de producto: toda la ergonomía pensada para el pulgar del vendedor de mostrador. */
function ProductRow({ product, qty, stock, priceCents, onChange, onMissedDemand }) {
  const { sku, name, category, unit } = product;
  const max = Math.max(0, stock);
  const soldOut = max === 0;

  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition-colors ${
        qty > 0 ? 'border-cyan-400/60 bg-cyan-400/[0.06]' : 'border-ink-700 bg-ink-800/70'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
          <span className="font-mono font-semibold text-cyan-300/90">{sku}</span>
          <span className="truncate">· {category}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-slate-100">{name}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-base font-bold tabular-nums text-white">{soles(priceCents)}</span>
          <span className="text-xs text-slate-500">/ {unit}</span>
          <StockBadge stock={stock} />
        </div>
      </div>

      {qty === 0 ? (
        soldOut ? (
          <button
            type="button"
            onClick={() => onMissedDemand?.(product, 1)}
            aria-label={`Registrar demanda de ${name}`}
            className="flex flex-col items-center justify-center h-16 w-16 shrink-0 rounded-2xl border border-rose-500/50 bg-rose-500/10 text-rose-300 active:scale-95 active:bg-rose-500/20 transition-all"
            title="Producto agotado. Toca para registrar venta perdida."
          >
            <span className="text-base">⚠️</span>
            <span className="text-[10px] font-bold leading-tight mt-0.5">Agotado</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onChange(sku, 1)}
            aria-label={`Agregar ${name}`}
            className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border-2 border-cyan-400/70 text-cyan-300 active:scale-95 active:bg-cyan-400/20 transition-all"
          >
            <IconPlus width={28} height={28} />
          </button>
        )
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(sku, qty - 1)}
            aria-label={`Quitar uno de ${name}`}
            className="grid h-16 w-14 place-items-center rounded-2xl bg-ink-700 text-slate-200 active:scale-95 active:bg-ink-600"
          >
            <IconMinus width={26} height={26} />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            value={qty}
            aria-label={`Cantidad de ${name}`}
            onFocus={(e) => e.target.select()}
            onChange={(e) => onChange(sku, Number.parseInt(e.target.value || '0', 10) || 0)}
            className="h-16 w-12 rounded-xl bg-transparent text-center text-xl font-bold tabular-nums text-white outline-none focus:bg-ink-700"
          />
          <button
            type="button"
            onClick={() => {
              if (qty >= max) {
                onMissedDemand?.(product, 1);
              } else {
                onChange(sku, qty + 1);
              }
            }}
            aria-label={`Agregar uno de ${name}`}
            className={`grid h-16 w-14 place-items-center rounded-2xl active:scale-95 transition-all ${
              qty >= max
                ? 'border border-rose-500/50 bg-rose-500/15 text-rose-300'
                : 'bg-cyan-400 text-ink-950 active:bg-cyan-300'
            }`}
            title={qty >= max ? 'Stock máximo alcanzado. Toca para registrar intento sin stock.' : undefined}
          >
            <IconPlus width={26} height={26} />
          </button>
        </div>
      )}
    </li>
  );
}

export default memo(ProductRow);
