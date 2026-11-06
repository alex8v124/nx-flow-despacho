import { soles } from '../lib/money.js';
import { useNow } from '../hooks.js';
import { IconTimer, IconWhatsApp } from './icons.jsx';

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Barra inferior de checkout ultraligera: se activa con el pedido, sin saturar la pantalla. */
export default function CheckoutBar({ units, skus, totalCents, startedAt, onCheckout }) {
  const now = useNow(Boolean(startedAt));
  const empty = units === 0;

  // Si no hay productos en el pedido, no saturamos la vista móvil con una barra vacía
  if (empty) return null;

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-ink-800/80 bg-ink-950/90 px-3 py-2.5 backdrop-blur-md shadow-2xl animate-sheet">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>
              {units} {units === 1 ? 'unidad' : 'unidades'} ({skus} {skus === 1 ? 'ítem' : 'ítems'})
            </span>
            {startedAt && (
              <span className="inline-flex items-center gap-1 rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                <IconTimer width={11} height={11} />
                {mmss(now - startedAt)}
              </span>
            )}
          </div>
          <div className="text-xl font-black tabular-nums tracking-tight text-white">
            {soles(totalCents)}
          </div>
        </div>

        <button
          type="button"
          onClick={onCheckout}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-ink-950 shadow-md shadow-emerald-500/20 active:scale-95 active:bg-emerald-400 transition-all shrink-0"
        >
          <IconWhatsApp width={18} height={18} />
          <span>Despachar</span>
        </button>
      </div>
    </div>
  );
}
