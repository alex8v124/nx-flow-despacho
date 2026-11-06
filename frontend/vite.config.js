import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function lookupDevPlugin() {
  const handler = async (req, res, next) => {
    const match = req.url.match(/^\/(?:api\/)?lookup\/(ruc|dni)\/([0-9]+)/i);
    if (!match) return next();
    const type = match[1].toLowerCase();
    const num = match[2];
    try {
      const apiRes = await fetch(`https://api.apis.net.pe/v1/${type}?numero=${num}`, {
        headers: { 'User-Agent': 'NoduxFlow/0.1.0' },
        signal: AbortSignal.timeout(6000),
      });
      const data = await apiRes.json().catch(() => ({}));
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (apiRes.ok && data && data.nombre) {
        res.end(
          JSON.stringify({
            found: true,
            docType: type.toUpperCase(),
            docNumber: num,
            name: data.nombre.trim(),
            estado: data.estado || 'ACTIVO',
            condicion: data.condicion || 'HABIDO',
            direccion: data.direccion || undefined,
          }),
        );
      } else {
        res.end(JSON.stringify({ found: false, docType: type.toUpperCase(), docNumber: num, message: 'No encontrado en padrón' }));
      }
    } catch (err) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ found: false, error: err.message }));
    }
  };

  return {
    name: 'nodux-lookup-dev-plugin',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), lookupDevPlugin()],
  build: {
    target: 'es2020',
    cssMinify: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
  },
  server: { port: 5173 },
});
