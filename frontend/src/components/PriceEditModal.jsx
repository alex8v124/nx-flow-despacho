import { useEffect, useState } from 'react';
import { soles } from '../lib/money.js';
import { IconX } from './icons.jsx';

/**
 * Modal ligero para acordar y modificar precios unitarios de venta en caliente.
 * Soporta ventas masivas, licitaciones de obra y acuerdos de mostrador.
 */
export default function PriceEditModal({
  open,
  product,
  currentPriceCents,
  basePriceCents,
  isCustom,
  onSave,
  onReset,
  onClose,
}) {
  const [inputVal, setInputVal] = useState('');

  useEffect(() => {
    if (open && currentPriceCents) {
      setInputVal((currentPriceCents / 100).toFixed(2));
    }
  }, [open, currentPriceCents]);

  if (!open || !product) return null;

  const basePriceSoles = (basePriceCents || product.priceCents) / 100;
  const currentSoles = (currentPriceCents || product.priceCents) / 100;

  const handleApplyDiscount = (pct) => {
    const discounted = basePriceSoles * (1 - pct / 100);
    setInputVal(discounted.toFixed(2));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsed = parseFloat(inputVal.replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) {
      onSave(parsed);
      onClose();
    }
  };

  const handleResetToStandard = () => {
    onReset();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-800 pb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-base">🏷️</span>
            <h3 className="text-sm font-bold text-white">Acuerdo de Precio Especial</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg bg-ink-800 text-slate-400 hover:text-white"
            aria-label="Cerrar"
          >
            <IconX width={15} height={15} />
          </button>
        </div>

        <div className="mt-3">
          <p className="font-mono text-[10px] text-cyan-400 font-semibold">{product.sku}</p>
          <h4 className="mt-0.5 text-xs font-medium text-slate-100 line-clamp-2">{product.name}</h4>

          <div className="mt-2 flex items-center justify-between rounded-lg bg-ink-950/60 p-2 text-xs">
            <span className="text-slate-400">Precio de lista base:</span>
            <span className="font-bold text-slate-200">
              {soles(basePriceCents || product.priceCents)} <span className="text-[10px] font-normal text-slate-400">/{product.unit}</span>
            </span>
          </div>

          <form onSubmit={handleSubmit} className="mt-3">
            <label className="block text-[11px] font-semibold text-slate-300">
              Nuevo precio pactado por unidad:
            </label>
            <div className="relative mt-1 flex items-center">
              <span className="pointer-events-none absolute left-3 text-sm font-bold text-cyan-400">
                S/
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                autoFocus
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="0.00"
                className="h-11 w-full rounded-xl border border-cyan-500/50 bg-ink-950 pl-9 pr-3 text-lg font-black tabular-nums text-white outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              />
            </div>

            {/* Accesos rápidos de descuento pactado por volumen */}
            <div className="mt-2.5">
              <span className="text-[10px] text-slate-400 font-medium">Acuerdos rápidos por volumen:</span>
              <div className="mt-1 grid grid-cols-4 gap-1.5">
                {[
                  { label: '-5%', val: 5 },
                  { label: '-10%', val: 10 },
                  { label: '-15%', val: 15 },
                  { label: '-20%', val: 20 },
                ].map((d) => (
                  <button
                    key={d.val}
                    type="button"
                    onClick={() => handleApplyDiscount(d.val)}
                    className="rounded-lg border border-ink-700/80 bg-ink-800/80 py-1 text-center text-[11px] font-semibold text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 active:scale-95 transition-all"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-2.5 text-[10px] leading-relaxed text-slate-400">
              💡 Este precio pactado se aplicará a la cotización activa y saldrá registrado en la proforma formal y en el mensaje de WhatsApp.
            </p>

            <div className="mt-4 flex gap-2">
              {isCustom ? (
                <button
                  type="button"
                  onClick={handleResetToStandard}
                  className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 active:scale-95"
                >
                  Restablecer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-ink-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-ink-700"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                className="flex-1 rounded-xl bg-cyan-400 py-2 text-xs font-bold text-ink-950 shadow-md shadow-cyan-400/20 hover:bg-cyan-300 active:scale-95 transition-all"
              >
                ✓ Aplicar Precio Pactado
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
