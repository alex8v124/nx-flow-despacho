import { memo } from 'react';
import { soles } from '../lib/money.js';
import { IconMinus, IconPlus } from './icons.jsx';

/** Fila de producto ultraligera, clara y optimizada para pantallas móviles. */
function ProductRow({ product, qty, stock, priceCents, onChange, onMissedDemand, currentSedeId }) {
  const { sku, name, category, unit } = product;
  const max = Math.max(0, stock);
  const soldOut = max === 0;

  // Sedes alternativas con stock para información rápida del vendedor
  const otherSedes = Object.entries(product.stock || {})
    .filter(([sid, sQty]) => sid !== currentSedeId && sQty > 0)
    .map(([sid, sQty]) => {
      const sName = sid === 'ate' ? 'Ate' : sid === 'collique' ? 'Collique' : sid === 'surquillo' ? 'Surquillo' : sid;
      return `${sName}: ${sQty}`;
    });

  return (
    <li
      className={`group relative flex items-center justify-between gap-2.5 rounded-xl border px-3 py-2 transition-all ${
        qty > 0
          ? 'border-cyan-500/50 bg-cyan-950/20'
          : 'border-ink-800/70 bg-ink-900/50 hover:border-ink-700/80'
      }`}
    >
      {/* Información del Producto */}
      <div className="min-w-0 flex-1">
        {/* SKU y Categoría sutiles */}
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <span className="font-mono text-cyan-400/90 font-medium">{sku}</span>
          <span>·</span>
          <span className="truncate">{category}</span>
        </div>

        {/* Nombre del producto legible y nítido */}
        <h3 className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug text-slate-100">
          {name}
        </h3>

        {/* Precio y Disponibilidad en una sola línea clara */}
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          <span className="text-sm font-bold tabular-nums text-white">
            {soles(priceCents)}
          </span>
          <span className="text-[10px] text-slate-400">/{unit}</span>

          {/* Estado de Stock simplificado */}
          {soldOut ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              Agotado
              {otherSedes.length > 0 && (
                <span className="font-normal text-slate-400">({otherSedes.join(', ')})</span>
              )}
            </span>
          ) : stock <= 5 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Quedan {stock}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
              {stock} disp.
            </span>
          )}
        </div>
      </div>

      {/* Controles de Cantidad / Stepper móvil ergonómico */}
      <div className="shrink-0">
        {qty === 0 ? (
          soldOut ? (
            <button
              type="button"
              onClick={() => onMissedDemand?.(product, 1)}
              className="flex h-8 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 text-[10px] font-semibold text-rose-300 active:scale-95 transition-all"
              title="Agotado. Toca para registrar demanda perdida."
            >
              ⚠️ Agotado
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onChange(sku, 1)}
              aria-label={`Agregar ${name}`}
              className="flex h-8 min-w-[34px] items-center justify-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 text-xs font-bold text-cyan-300 active:scale-95 active:bg-cyan-500/25 transition-all"
            >
              <IconPlus width={14} height={14} />
              <span className="text-[11px]">Añadir</span>
            </button>
          )
        ) : (
          <div className="flex h-8 items-center rounded-lg border border-cyan-500/30 bg-ink-950/70 p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => onChange(sku, qty - 1)}
              aria-label={`Quitar uno de ${name}`}
              className="grid h-7 w-7 place-items-center rounded-md bg-ink-800 text-slate-300 hover:text-white active:scale-90 transition-all"
            >
              <IconMinus width={13} height={13} />
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
              className="w-8 bg-transparent text-center text-xs font-bold tabular-nums text-white outline-none"
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
              className={`grid h-7 w-7 place-items-center rounded-md transition-all active:scale-90 ${
                qty >= max
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'bg-cyan-400 text-ink-950 hover:bg-cyan-300'
              }`}
              title={qty >= max ? 'Stock máximo alcanzado.' : undefined}
            >
              <IconPlus width={13} height={13} />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export default memo(ProductRow);
