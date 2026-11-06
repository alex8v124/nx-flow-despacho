// Configuración centralizada. Todo sale de variables de entorno: nada de secretos en el código.
// En AWS, los secretos (webhooks, tokens de Nubefact/Culqi) se inyectan desde SSM Parameter Store
// o Secrets Manager vía la plantilla SAM.

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function loadConfig(env = process.env) {
  return {
    tableName: env.TABLE_NAME || 'nodux-flow-local',
    region: env.AWS_REGION || env.AWS_DEFAULT_REGION || 'us-east-1',
    dynamoEndpoint: env.DYNAMODB_ENDPOINT || undefined,
    igvRate: num(env.IGV_RATE, 0.18),
    reservationTtlMinutes: num(env.RESERVATION_TTL_MINUTES, 30),
    maxBodyBytes: num(env.MAX_BODY_BYTES, 32 * 1024),
    webhooks: {
      culqi: env.CULQI_WEBHOOK_SECRET || '',
      nubefact: env.NUBEFACT_WEBHOOK_SECRET || '',
    },
    nubefact: {
      url: env.NUBEFACT_API_URL || '',
      token: env.NUBEFACT_API_TOKEN || '',
      serieFactura: env.NUBEFACT_SERIE_FACTURA || 'FFF1',
      serieBoleta: env.NUBEFACT_SERIE_BOLETA || 'BBB1',
    },
  };
}
