const express = require('express');
const cors = require('cors');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const app = express();
const PORT = process.env.PORT || 3000;
const POLLINATIONS_KEY = process.env.POLLINATIONS_KEY;

// CORREGIDO: nombre completo real de Wan, no el alias 'wan'
const MODEL = 'alibaba/wan-2.2-fast';
const ALLOWED_DURATIONS = new Set([5]);
const ALLOWED_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1']);

app.set('trust proxy', 1);
app.use(cors({
  origin: process.env.APP_ORIGIN || '*',
  methods: ['GET'],
  maxAge: 600
}));

const requestsByIp = new Map();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 4;
app.use('/video', (req, res, next) => {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const recent = (requestsByIp.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    return res.status(429).send('Límite temporal alcanzado: espera una hora antes de generar más videos.');
  }
  recent.push(now);
  requestsByIp.set(ip, recent);
  next();
});

app.get('/', (_req, res) => {
  res.type('text/plain').send('Servidor de video activo.');
});

app.get('/video', async (req, res) => {
  if (!POLLINATIONS_KEY) {
    return res.status(500).type('text/plain').send('Falta configurar POLLINATIONS_KEY en Render.');
  }

  const prompt = String(req.query.prompt || '').trim();
  if (!prompt) return res.status(400).type('text/plain').send('Falta el parámetro prompt.');
  if (prompt.length > 1800) return res.status(413).type('text/plain').send('El prompt supera el máximo de 1800 caracteres.');

  const duration = Number(req.query.duration || 5);
  const aspectRatio = String(req.query.aspectRatio || '16:9');
  if (!ALLOWED_DURATIONS.has(duration)) return res.status(400).type('text/plain').send('Wan solo admite 5 segundos.');
  if (!ALLOWED_ASPECT_RATIOS.has(aspectRatio)) return res.status(400).type('text/plain').send('Formato admitido: 16:9, 9:16 o 1:1.');

  const upstreamQuery = new URLSearchParams({
    model: MODEL,
    duration: String(duration),
    aspectRatio,
    key: POLLINATIONS_KEY
  });
  const upstreamUrl = `https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?${upstreamQuery}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  try {
    const upstream = await fetch(upstreamUrl, { signal: controller.signal });
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 1200);
      return res.status(upstream.status).type('text/plain').send(detail || `Pollinations respondió ${upstream.status}.`);
    }
    if (!upstream.body) return res.status(502).type('text/plain').send('Pollinations no devolvió un archivo de video.');

    res.status(200);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
    res.setHeader('Cache-Control', 'no-store');
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (res.headersSent) return res.destroy(error);
    const message = error.name === 'AbortError' ? 'Pollinations tardó más de 10 minutos y se canceló.' : 'No se pudo conectar con Pollinations.';
    res.status(502).type('text/plain').send(message);
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(PORT, () => console.log(`Servidor listo en el puerto ${PORT}`));
