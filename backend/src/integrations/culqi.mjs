// Adaptador Culqi (pasarela de pago). Se activa como up-sell de setup.
// Convención: al crear el cargo/orden en Culqi se envía metadata { sedeId, orderId } del pedido
// Nodux Flow; cuando Culqi notifica el pago, se marca el pedido como PAGADO.
//
// Nota: el mecanismo de firma exacto se ajusta a la configuración de la cuenta Culqi del cliente
// (firma HMAC en cabecera / credenciales básicas). Aquí se usa HMAC en `x-nodux-signature`.

const PAID_EVENTS = new Set(['charge.creation.succeeded', 'order.status.changed']);

export const culqiAdapter = {
  signatureHeader: 'x-culqi-signature',

  async handle(event, { service, log }) {
    const type = event.type || event.object;
    if (!PAID_EVENTS.has(type)) return { action: 'IGNORED', type };

    const data = typeof event.data === 'string' ? safeParse(event.data) : event.data || {};
    if (type === 'order.status.changed' && data.state && data.state !== 'paid') {
      return { action: 'IGNORED', type, state: data.state };
    }

    const { sedeId, orderId } = data.metadata || {};
    if (!sedeId || !orderId) return { action: 'IGNORED', reason: 'metadata sin sedeId/orderId' };

    const updated = await service.markPayment(sedeId, orderId, {
      provider: 'culqi',
      status: 'PAID',
      reference: String(data.id || event.id || ''),
      amountCents: Number.isInteger(data.amount) ? data.amount : undefined,
      paidAt: new Date().toISOString(),
    });
    log({ msg: 'culqi.payment', sedeId, orderId, updated });
    return { action: updated ? 'ORDER_MARKED_PAID' : 'ORDER_NOT_FOUND' };
  },
};

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
