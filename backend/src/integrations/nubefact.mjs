// Conector de facturación electrónica SUNAT vía Nubefact (PSE/OSE).
//  - Salida: al confirmar un pedido se arma el JSON "generar_comprobante" y se envía a la ruta
//    del cliente en Nubefact. Si no hay URL/token configurados, se devuelve NOT_CONFIGURED
//    y el flujo de mostrador sigue intacto (desacople total).
//  - Entrada: /webhooks/nubefact recibe callbacks de estado (aceptado/rechazado por SUNAT).
//
// Referencia de campos: documentación JSON de Nubefact. Validar contra la versión vigente
// del API al activar el conector en producción.

const limaDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Lima',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
// Fecha de emisión en zona horaria de Lima, formato dd-mm-aaaa.
const fechaPe = (iso) => {
  const p = Object.fromEntries(limaDate.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year}`;
};
const soles = (cents) => Number((cents / 100).toFixed(2));
const r10 = (n) => Number(n.toFixed(10));

/** Construye el payload Nubefact a partir de un pedido confirmado. */
export function buildNubefactPayload(order, { serie, numero, igvRate = 0.18 }) {
  const isFactura = order.customer?.docType === 'RUC';
  const items = order.lines.map((l) => {
    const total = l.lineTotalCents;
    const subtotal = Math.round(total / (1 + igvRate));
    return {
      unidad_de_medida: 'NIU',
      codigo: l.sku,
      descripcion: `${l.name} (${l.unit})`,
      cantidad: l.qty,
      valor_unitario: r10(l.unitPriceCents / 100 / (1 + igvRate)),
      precio_unitario: soles(l.unitPriceCents),
      subtotal: soles(subtotal),
      tipo_de_igv: 1, // Gravado - Operación onerosa
      igv: soles(total - subtotal),
      total: soles(total),
      anticipo_regularizacion: false,
    };
  });

  return {
    operacion: 'generar_comprobante',
    tipo_de_comprobante: isFactura ? 1 : 2,
    serie,
    numero,
    sunat_transaction: 1,
    cliente_tipo_de_documento: isFactura ? 6 : order.customer?.docType === 'DNI' ? 1 : '-',
    cliente_numero_de_documento: order.customer?.docNumber || '-',
    cliente_denominacion: order.customer?.name || 'CLIENTES VARIOS',
    cliente_direccion: '',
    fecha_de_emision: fechaPe(order.updatedAt || order.createdAt),
    moneda: 1, // Soles
    porcentaje_de_igv: igvRate * 100,
    total_gravada: soles(order.totals.gravadaCents),
    total_igv: soles(order.totals.igvCents),
    total: soles(order.totals.totalCents),
    enviar_automaticamente_a_la_sunat: true,
    enviar_automaticamente_al_cliente: false,
    observaciones: `Pedido Nodux Flow ${order.orderId}`,
    items,
  };
}

export function createNubefactInvoicing({ config, repo, fetchImpl = globalThis.fetch }) {
  const { url, token, serieFactura, serieBoleta } = config.nubefact;
  return {
    async emit(order) {
      if (!url || !token) return { status: 'NOT_CONFIGURED', provider: 'nubefact' };
      const isFactura = order.customer?.docType === 'RUC';
      if (isFactura && !order.customer?.name) return { status: 'SKIPPED', reason: 'Factura requiere razón social' };

      const serie = isFactura ? serieFactura : serieBoleta;
      const numero = await repo.nextSequence(order.sedeId, serie);
      const payload = buildNubefactPayload(order, { serie, numero, igvRate: config.igvRate });

      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Token token="${token}"` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { status: 'REJECTED', provider: 'nubefact', serie, numero, errors: body.errors || res.status };
      return {
        status: 'ISSUED',
        provider: 'nubefact',
        serie,
        numero,
        pdfUrl: body.enlace_del_pdf,
        sunatAccepted: body.aceptada_por_sunat,
      };
    },
  };
}

export const nubefactAdapter = {
  signatureHeader: 'x-nubefact-signature',
  async handle(event, { service }) {
    const { sedeId, orderId } = event.metadata || {};
    if (!sedeId || !orderId) return { action: 'STORED' };
    const ok = await service.markInvoice(sedeId, orderId, {
      provider: 'nubefact',
      status: event.aceptada_por_sunat ? 'ACCEPTED' : 'PENDING',
      serie: event.serie,
      numero: event.numero,
      pdfUrl: event.enlace_del_pdf,
    });
    return { action: ok ? 'ORDER_INVOICE_UPDATED' : 'ORDER_NOT_FOUND' };
  },
};
