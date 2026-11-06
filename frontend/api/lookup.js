export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const match = url.pathname.match(/\/lookup\/(ruc|dni)\/([0-9]+)/i);
  const type = match ? match[1].toLowerCase() : (url.searchParams.get('type') || '').toLowerCase();
  const num = match ? match[2] : (url.searchParams.get('num') || url.searchParams.get('numero') || '');

  if (!type || !num) {
    return res.status(400).json({ found: false, message: 'Parámetros requeridos: type y num' });
  }

  try {
    const apiRes = await fetch(`https://api.apis.net.pe/v1/${type}?numero=${num}`, {
      headers: { 'User-Agent': 'NoduxFlow/0.1.0' },
      signal: AbortSignal.timeout(6000),
    });
    const data = await apiRes.json().catch(() => ({}));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    const name = data && (data.nombre || data.name);
    if (apiRes.ok && name) {
      return res.status(200).json({
        found: true,
        docType: type.toUpperCase(),
        docNumber: num,
        name: String(name).trim(),
        estado: data.estado || 'ACTIVO',
        condicion: data.condicion || 'HABIDO',
        direccion: data.direccion || undefined,
      });
    }
    return res.status(200).json({ found: false, message: 'No encontrado en padrón' });
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ found: false, error: err.message });
  }
}
