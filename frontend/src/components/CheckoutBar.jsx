import { soles } from '../lib/money.js';
import { useNow } from '../hooks.js';
import { IconTimer, IconWhatsApp } from './icons.jsx';

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Barra inferior de checkout rápido: siempre visible, un toque para despachar. */
export default function CheckoutBar({ units, skus, totalCents, startedAt, onCheckout }) {
  const now = useNow(Boolean(startedAt));
  const empty = units === 0;

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-900/95 px-3 pt-3 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>
              {units} {units === 1 ? 'unidad' : 'unidades'} · {skus} SKU
            </span>
            {startedAt && (
              <span className="inline-flex items-center gap-1 rounded-md bg-ink-700 px-1.5 py-0.5 font-mono text-cyan-300">
                <IconTimer width={12} height={12} />
                {mmss(now - startedAt)}
              </span>
            )}
          </div>
          <div className="text-2xl font-extrabold tabular-nums tracking-tight text-white">{soles(totalCents)}</div>
        </div>
        <button
          type="button"
          disabled={empty}
          onClick={onCheckout}
          className="flex h-16 min-w-[44%] items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 text-lg font-bold text-ink-950 shadow-lg shadow-emerald-500/20 active:scale-[0.98] active:bg-emerald-400 disabled:bg-ink-700 disabled:text-ink-500 disabled:shadow-none"
        >
          <IconWhatsApp width={22} height={22} />
          Despachar
        </button>
      </div>
    </div>
  );
}
