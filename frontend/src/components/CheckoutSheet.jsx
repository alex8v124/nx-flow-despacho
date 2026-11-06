import { useEffect, useState } from 'react';
import { isValidRuc, soles } from '../lib/money.js';
import { shortId } from '../lib/storage.js';
import { lookupDocument } from '../lib/api.js';
import { IconCheck, IconWhatsApp, IconX } from './icons.jsx';

const field =
  'h-11 w-full rounded-xl border border-ink-700/80 bg-ink-800/70 px-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-cyan-400 focus:bg-ink-800 disabled:opacity-85 disabled:cursor-not-allowed disabled:border-emerald-500/40 disabled:bg-ink-800/90 transition-colors';

const RESERVATION_LABEL = {
  RESERVED: { text: 'Stock reservado en DynamoDB', cls: 'text-emerald-300' },
  PENDING: { text: 'Sin señal: reserva en cola, se sincroniza sola', cls: 'text-amber-300' },
  DEMO: { text: 'Modo demo · stock local', cls: 'text-slate-400' },
};

function Success({ result, onNewOrder, onViewProforma }) {
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

      <div className="mt-5 grid w-full gap-2">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-emerald-500 text-sm font-bold text-emerald-300 active:bg-emerald-500/10 transition-all"
        >
          <IconWhatsApp /> Abrir WhatsApp
        </a>
        {onViewProforma && (
          <button
            type="button"
            onClick={onViewProforma}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-cyan-400/60 bg-cyan-400/10 text-sm font-bold text-cyan-300 active:bg-cyan-400/20 transition-all"
          >
            📄 Ver Proforma Formal B2B
          </button>
        )}
        <button
          type="button"
          onClick={onNewOrder}
          className="h-11 rounded-xl bg-cyan-400 text-sm font-bold text-ink-950 active:bg-cyan-300 transition-all"
        >
          Nuevo pedido
        </button>
      </div>
    </div>
  );
}

export default function CheckoutSheet({
  open,
  sede,
  lines,
  totals,
  defaults,
  busy,
  error,
  result,
  onClose,
  onSubmit,
  onNewOrder,
  onViewProforma,
}) {
  const [kind, setKind] = useState('BOLETA');
  // Formularios 100% independientes para Boleta y Factura con bloqueo automático
  const [boleta, setBoleta] = useState({ name: '', doc: '', locked: false, status: '' });
  const [factura, setFactura] = useState({ name: '', doc: '', locked: false, status: '' });
  const [condicionPago, setCondicionPago] = useState('CONTADO');
  const [lookingUp, setLookingUp] = useState(false);
  const [seller, setSeller] = useState(defaults.seller);
  const [phone, setPhone] = useState(defaults.phone);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const executeLookup = async (type, number) => {
    const clean = number.replace(/\D/g, '');
    if (!clean) return;
    setLookingUp(true);
    try {
      const res = await lookupDocument(type === 'FACTURA' ? 'RUC' : 'DNI', clean);
      if (res && res.found && res.name) {
        if (type === 'FACTURA') {
          setFactura((prev) => ({
            ...prev,
            name: res.name,
            locked: true,
            status: res.condicion ? `SUNAT: ${res.estado || 'ACTIVO'} / ${res.condicion}` : 'SUNAT verificado',
          }));
        } else {
          setBoleta((prev) => ({
            ...prev,
            name: res.name,
            locked: true,
            status: 'RENIEC verificado',
          }));
        }
      } else {
        const msg = type === 'FACTURA' ? 'RUC no encontrado en padrón SUNAT' : 'DNI no encontrado en padrón';
        if (type === 'FACTURA') {
          setFactura((prev) => ({ ...prev, locked: false, status: msg }));
        } else {
          setBoleta((prev) => ({ ...prev, locked: false, status: msg }));
        }
      }
    } catch {
      // fallo de red
    } finally {
      setLookingUp(false);
    }
  };

  // Consulta automática de DNI ante RENIEC
  useEffect(() => {
    if (!open) return;
    const docClean = boleta.doc.replace(/\D/g, '');
    if (docClean.length === 8 && !boleta.locked && !boleta.name) {
      executeLookup('BOLETA', docClean);
    }
  }, [open, boleta.doc, boleta.locked, boleta.name]);

  // Consulta automática de RUC ante SUNAT
  useEffect(() => {
    if (!open) return;
    const docClean = factura.doc.replace(/\D/g, '');
    if (docClean.length === 11 && isValidRuc(docClean) && !factura.locked && !factura.name) {
      executeLookup('FACTURA', docClean);
    }
  }, [open, factura.doc, factura.locked, factura.name]);

  if (!open) return null;

  const current = kind === 'FACTURA' ? factura : boleta;
  const docClean = current.doc.replace(/\D/g, '');

  let docError = '';
  if (kind === 'FACTURA') {
    if (docClean.length > 0 && !isValidRuc(docClean)) {
      docError = docClean.length === 11 ? 'RUC inválido (dígito verificador SUNAT)' : 'RUC debe tener 11 dígitos';
    } else if (docClean.length === 11 && !factura.name.trim() && !lookingUp) {
      docError = 'Ingrese la razón social de la empresa';
    }
  } else {
    if (docClean.length > 0 && docClean.length !== 8) {
      docError = 'DNI debe tener 8 dígitos';
    }
  }

  const isFacturaReady = kind !== 'FACTURA' || (isValidRuc(docClean) && factura.name.trim().length > 0);
  const isBoletaReady = kind !== 'BOLETA' || (docClean.length === 0 || docClean.length === 8);
  const canSubmit = !busy && !docError && isFacturaReady && isBoletaReady && !lookingUp;

  const handleDocChange = (val) => {
    if (kind === 'FACTURA') {
      const clean = val.replace(/\D/g, '');
      setFactura((prev) => ({
        ...prev,
        doc: val,
        locked: false,
        status: '',
        name: clean.length !== 11 ? '' : prev.name,
      }));
    } else {
      const clean = val.replace(/\D/g, '');
      setBoleta((prev) => ({
        ...prev,
        doc: val,
        locked: false,
        status: '',
        name: clean.length !== 8 ? '' : prev.name,
      }));
    }
  };

  const handleNameChange = (val) => {
    if (kind === 'FACTURA') {
      setFactura((prev) => ({ ...prev, name: val }));
    } else {
      setBoleta((prev) => ({ ...prev, name: val }));
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    const customer =
      kind === 'FACTURA'
        ? { name: factura.name.trim(), docType: 'RUC', docNumber: docClean }
        : docClean
          ? { name: boleta.name.trim() || undefined, docType: 'DNI', docNumber: docClean }
          : boleta.name.trim()
            ? { name: boleta.name.trim() }
            : undefined;

    const pagoLabel =
      condicionPago === 'CREDITO_30' ? 'Crédito 30 días' : condicionPago === 'CREDITO_15' ? 'Crédito 15 días' : 'Contado / Transf.';

    onSubmit({
      customer,
      seller: seller.trim(),
      phone: phone.trim(),
      notes: notes.trim(),
      condicionPago: pagoLabel,
    });
  };

  const handleResetAndNewOrder = () => {
    setBoleta({ name: '', doc: '', locked: false, status: '' });
    setFactura({ name: '', doc: '', locked: false, status: '' });
    onNewOrder();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="animate-sheet pb-safe max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border-t border-ink-600 bg-ink-900 px-4 pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink-600" />
        {result ? (
          <Success result={result} onNewOrder={handleResetAndNewOrder} onViewProforma={onViewProforma} />
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Confirmar despacho</h2>
                <p className="text-xs text-slate-400">{sede.name}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="grid h-8 w-8 place-items-center rounded-lg bg-ink-800 text-slate-300 hover:text-white"
              >
                <IconX width={16} height={16} />
              </button>
            </div>

            {/* Resumen compacto de ítems */}
            <div className="rounded-xl border border-ink-700/80 bg-ink-800/40 divide-y divide-ink-800/60 overflow-hidden">
              <div className="max-h-28 overflow-y-auto divide-y divide-ink-800/60">
                {lines.map((l) => (
                  <div key={l.sku} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <div className="min-w-0 flex-1 truncate text-slate-200">
                      <span className="font-bold tabular-nums text-cyan-300 mr-1.5">{l.qty}×</span>
                      <span>{l.name}</span>
                      {l.isCustomPrice && (
                        <span className="ml-1.5 rounded bg-amber-400/20 px-1 py-0.2 font-mono text-[9px] font-bold text-amber-300">
                          Pactado
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-white ml-2">
                      {soles(l.lineTotalCents)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-0.5 px-3 py-2 text-xs bg-ink-900/60">
                <div className="flex justify-between text-slate-400">
                  <span>Op. gravada</span>
                  <span className="tabular-nums">{soles(totals.gravadaCents)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>IGV (18%)</span>
                  <span className="tabular-nums">{soles(totals.igvCents)}</span>
                </div>
                <div className="flex justify-between pt-1 text-sm font-bold text-white border-t border-ink-800/60">
                  <span>Total</span>
                  <span className="tabular-nums text-cyan-300">{soles(totals.totalCents)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-ink-800/80 p-1">
              {['BOLETA', 'FACTURA'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`h-8 rounded-lg text-xs font-bold tracking-wide transition-all ${
                    kind === k ? 'bg-cyan-400 text-ink-950 shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {k === 'BOLETA' ? 'Boleta' : 'Factura'}
                </button>
              ))}
            </div>

            <div className="grid gap-3">
              <div>
                <div className="flex gap-2">
                  <input
                    className={`${field} flex-1`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={kind === 'FACTURA' ? 'RUC de la empresa * (11 dígitos)' : 'DNI del cliente (opcional, 8 dígitos)'}
                    value={current.doc}
                    maxLength={kind === 'FACTURA' ? 11 : 8}
                    onChange={(e) => handleDocChange(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => executeLookup(kind, current.doc)}
                    disabled={lookingUp || !docClean}
                    className="shrink-0 h-11 px-3 rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-300 font-bold text-xs hover:bg-cyan-400/20 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all"
                  >
                    {lookingUp ? 'Buscando…' : 'Consultar'}
                  </button>
                </div>
                {lookingUp && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                    <span className="inline-block h-2 w-2 animate-ping rounded-full bg-cyan-400" />
                    Consultando padrón {kind === 'FACTURA' ? 'SUNAT' : 'RENIEC'}…
                  </p>
                )}
                {current.status && !lookingUp && (
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className={current.locked ? 'font-semibold text-emerald-300' : 'text-amber-300 font-medium'}>
                      {current.locked ? '✓ ' : 'ℹ '} {current.status}
                    </span>
                    {current.locked && (
                      <button
                        type="button"
                        onClick={() => {
                          if (kind === 'FACTURA') setFactura((p) => ({ ...p, locked: false }));
                          else setBoleta((p) => ({ ...p, locked: false }));
                        }}
                        className="text-slate-400 underline hover:text-white"
                      >
                        Editar manual
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="relative">
                <input
                  className={`${field} ${current.locked ? 'text-emerald-100 bg-ink-800/90 border-emerald-500/60 cursor-not-allowed font-medium' : ''}`}
                  placeholder={kind === 'FACTURA' ? 'Razón social de la empresa *' : 'Nombre del cliente (opcional)'}
                  value={current.name}
                  disabled={current.locked}
                  readOnly={current.locked}
                  maxLength={80}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
                {current.locked && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 border border-emerald-500/20">
                      ✓ Verificado
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (kind === 'FACTURA') setFactura((p) => ({ ...p, locked: false }));
                        else setBoleta((p) => ({ ...p, locked: false }));
                      }}
                      className="rounded bg-ink-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-ink-600"
                    >
                      Editar
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input className={field} placeholder="Vendedor" value={seller} maxLength={60} onChange={(e) => setSeller(e.target.value)} />
                <input
                  className={field}
                  inputMode="tel"
                  placeholder="WhatsApp destino"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              {/* Condición de Pago B2B */}
              <div>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Condición de Pago:
                </span>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink-800/80 p-1 text-xs font-semibold">
                  {[
                    { key: 'CONTADO', label: 'Contado' },
                    { key: 'CREDITO_15', label: 'Crédito 15d' },
                    { key: 'CREDITO_30', label: 'Crédito 30d' },
                  ].map((cp) => (
                    <button
                      key={cp.key}
                      type="button"
                      onClick={() => setCondicionPago(cp.key)}
                      className={`h-8 rounded-lg text-xs transition-all ${
                        condicionPago === cp.key
                          ? 'bg-cyan-400 text-ink-950 font-bold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {cp.label}
                    </button>
                  ))}
                </div>
              </div>

              <input className={field} placeholder="Nota de despacho (opcional)" value={notes} maxLength={280} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {docError && <p className="text-xs font-medium text-amber-300">{docError}</p>}

            {error && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                <p className="font-bold">{error.message || 'No se pudo reservar el pedido'}</p>
                {Array.isArray(error.details) && (
                  <ul className="mt-1 space-y-0.5">
                    {error.details.map((d) => (
                      <li key={d.sku} className="font-mono text-[11px]">
                        {d.sku}: pidió {d.requested ?? '-'}, disponible {d.available ?? 0}
                        {d.reason === 'PRICE_CHANGED' ? ' (precio actualizado)' : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[11px] text-red-300/80">Ajustamos las cantidades al stock real. Revise y vuelva a enviar.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-base font-bold text-ink-950 shadow-md shadow-emerald-500/20 active:scale-[0.99] active:bg-emerald-400 disabled:bg-ink-800 disabled:text-slate-500 disabled:shadow-none transition-all"
            >
              <IconWhatsApp width={20} height={20} />
              {busy ? 'Reservando stock…' : 'Enviar pedido por WhatsApp'}
            </button>
            <p className="pb-1 text-center text-[11px] text-slate-500">
              {phone ? 'Se abrirá el chat con el número indicado' : 'Sin número: WhatsApp le pedirá elegir el contacto'}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
