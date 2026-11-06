import { useEffect, useState } from 'react';
import { isValidRuc, soles } from '../lib/money.js';
import { shortId } from '../lib/storage.js';
import { IconCheck, IconWhatsApp, IconX } from './icons.jsx';

const field =
  'h-14 w-full rounded-xl border border-ink-600 bg-ink-800 px-4 text-base text-white placeholder:text-slate-500 outline-none focus:border-cyan-400';

const RESERVATION_LABEL = {
  RESERVED: { text: 'Stock reservado en DynamoDB', cls: 'text-emerald-300' },
  PENDING: { text: 'Sin señal: reserva en cola, se sincroniza sola', cls: 'text-amber-300' },
  DEMO: { text: 'Modo demo · stock local', cls: 'text-slate-400' },
};

function Success({ result, onNewOrder }) {
  const r = RESERVATION_LABEL[result.reservation];
  return (
    <div className="flex flex-col items-center px-2 pb-2 pt-4 text-center">
      <div className="animate-pop grid h-20 w-20 place-items-center rounded-full bg-emerald-500 text-ink-950">
        <IconCheck width={44} height={44} />
      </div>
      <h2 className="mt-4 text-2xl font-extrabold text-white">Pedido despachado</h2>
      <p className="mt-1 font-mono text-cyan-300">{shortId(result.orderId)}</p>
      <p className="mt-4 text-5xl font-black tabular-nums text-white">
        {result.seconds.toFixed(1)}
        <span className="ml-1 text-xl font-bold text-slate-400">s</span>
      </p>
      <p className="text-sm text-slate-400">del primer producto al WhatsApp</p>
      <p className={`mt-4 text-sm font-medium ${r.cls}`}>{r.text}</p>

      <div className="mt-6 grid w-full gap-3">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-16 items-center justify-center gap-2 rounded-2xl border-2 border-emerald-500 text-lg font-bold text-emerald-300 active:bg-emerald-500/10"
        >
          <IconWhatsApp /> Abrir WhatsApp otra vez
        </a>
        <button
          type="button"
          onClick={onNewOrder}
          className="h-16 rounded-2xl bg-cyan-400 text-lg font-bold text-ink-950 active:bg-cyan-300"
        >
          Nuevo pedido
        </button>
      </div>
    </div>
  );
}

export default function CheckoutSheet({ open, sede, lines, totals, defaults, busy, error, result, onClose, onSubmit, onNewOrder }) {
  const [kind, setKind] = useState('BOLETA');
  const [name, setName] = useState('');
  const [doc, setDoc] = useState('');
  const [seller, setSeller] = useState(defaults.seller);
  const [phone, setPhone] = useState(defaults.phone);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const docClean = doc.replace(/\D/g, '');
  let docError = '';
  if (kind === 'FACTURA') {
    if (!isValidRuc(docClean)) docError = docClean.length === 11 ? 'RUC inválido (dígito verificador)' : 'RUC de 11 dígitos';
    else if (!name.trim()) docError = 'Ingrese la razón social';
  } else if (docClean && docClean.length !== 8) docError = 'DNI de 8 dígitos';

  const submit = (e) => {
    e.preventDefault();
    if (docError || busy) return;
    const customer =
      kind === 'FACTURA'
        ? { name: name.trim(), docType: 'RUC', docNumber: docClean }
        : docClean
          ? { name: name.trim() || undefined, docType: 'DNI', docNumber: docClean }
          : name.trim()
            ? { name: name.trim() }
            : undefined;
    onSubmit({ customer, seller: seller.trim(), phone: phone.trim(), notes: notes.trim() });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="animate-sheet pb-safe max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border-t border-ink-600 bg-ink-900 px-4 pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink-600" />
        {result ? (
          <Success result={result} onNewOrder={onNewOrder} />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-white">Confirmar despacho</h2>
                <p className="text-sm text-slate-400">{sede.name}</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-12 w-12 place-items-center rounded-xl bg-ink-800 text-slate-300">
                <IconX />
              </button>
            </div>

            <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-800/60">
              {lines.map((l) => (
                <li key={l.sku} className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="w-10 shrink-0 text-right font-bold tabular-nums text-cyan-300">{l.qty}×</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{l.name}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{soles(l.lineTotalCents)}</span>
                </li>
              ))}
              <li className="space-y-0.5 px-4 py-3 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Op. gravada</span>
                  <span className="tabular-nums">{soles(totals.gravadaCents)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>IGV 18%</span>
                  <span className="tabular-nums">{soles(totals.igvCents)}</span>
                </div>
                <div className="flex justify-between pt-1 text-lg font-extrabold text-white">
                  <span>Total</span>
                  <span className="tabular-nums">{soles(totals.totalCents)}</span>
                </div>
              </li>
            </ul>

            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-ink-800 p-1">
              {['BOLETA', 'FACTURA'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`h-12 rounded-xl text-sm font-bold tracking-wide ${kind === k ? 'bg-cyan-400 text-ink-950' : 'text-slate-400'}`}
                >
                  {k === 'BOLETA' ? 'Boleta' : 'Factura'}
                </button>
              ))}
            </div>

            <div className="grid gap-3">
              <input
                className={field}
                inputMode="numeric"
                autoComplete="off"
                placeholder={kind === 'FACTURA' ? 'RUC del cliente *' : 'DNI (opcional)'}
                value={doc}
                maxLength={kind === 'FACTURA' ? 11 : 8}
                onChange={(e) => setDoc(e.target.value)}
              />
              <input
                className={field}
                placeholder={kind === 'FACTURA' ? 'Razón social *' : 'Nombre del cliente (opcional)'}
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <input className={field} placeholder="Vendedor" value={seller} maxLength={60} onChange={(e) => setSeller(e.target.value)} />
                <input
                  className={field}
                  inputMode="tel"
                  placeholder="WhatsApp destino"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <input className={field} placeholder="Nota de despacho (opcional)" value={notes} maxLength={280} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {docError && doc && <p className="text-sm font-medium text-amber-300">{docError}</p>}

            {error && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                <p className="font-bold">{error.message || 'No se pudo reservar el pedido'}</p>
                {Array.isArray(error.details) && (
                  <ul className="mt-2 space-y-1">
                    {error.details.map((d) => (
                      <li key={d.sku} className="font-mono text-xs">
                        {d.sku}: pidió {d.requested ?? '-'}, disponible {d.available ?? 0}
                        {d.reason === 'PRICE_CHANGED' ? ' (precio actualizado)' : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-red-300/80">Ajustamos las cantidades al stock real. Revise y vuelva a enviar.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || Boolean(docError && (kind === 'FACTURA' || doc))}
              className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-lg font-extrabold text-ink-950 shadow-lg shadow-emerald-500/20 active:scale-[0.99] active:bg-emerald-400 disabled:bg-ink-700 disabled:text-ink-500 disabled:shadow-none"
            >
              <IconWhatsApp />
              {busy ? 'Reservando stock…' : 'Enviar pedido por WhatsApp'}
            </button>
            <p className="pb-2 text-center text-xs text-slate-500">
              {phone ? 'Se abrirá el chat con el número indicado' : 'Sin número: WhatsApp le pedirá elegir el contacto'}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
