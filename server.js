const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const app = express();
const PORT = process.env.PORT || 3000;
const POLLINATIONS_KEY = process.env.POLLINATIONS_KEY;
const MODEL = 'x-ai/grok-imagine-video-1.5-lite';
const ALLOWED_DURATIONS = new Set([5, 6, 7]);
const ALLOWED_RESOLUTIONS = new Set(['720p', '1080p']);
const ALLOWED_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1']);
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const referenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_REFERENCE_IMAGE_BYTES, files: 1 } });

app.set('trust proxy', 1);
app.use(cors({
  origin: process.env.APP_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 600
}));

// Límite sencillo para reducir abuso accidental de un endpoint que consume saldo.
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

async function generateVideo(req, res) {
  if (!POLLINATIONS_KEY) {
    return res.status(500).type('text/plain').send('Falta configurar POLLINATIONS_KEY en las variables de entorno de Render.');
  }

  const fields = req.body || {};
  const prompt = String(fields.prompt || req.query.prompt || '').trim();
  if (!prompt) return res.status(400).type('text/plain').send('Falta el parámetro prompt.');
  if (prompt.length > 1800) return res.status(413).type('text/plain').send('El prompt supera el máximo de 1800 caracteres.');

  const duration = Number(fields.duration || req.query.duration || 5);
  const resolution = String(fields.resolution || req.query.resolution || '720p');
  const aspectRatio = String(fields.aspectRatio || req.query.aspectRatio || '16:9');
  if (!ALLOWED_DURATIONS.has(duration)) return res.status(400).type('text/plain').send('Duración admitida: 5, 6 o 7 segundos.');
  if (!ALLOWED_RESOLUTIONS.has(resolution)) return res.status(400).type('text/plain').send('Resolución admitida: 720p o 1080p.');
  if (!ALLOWED_ASPECT_RATIOS.has(aspectRatio)) return res.status(400).type('text/plain').send('Formato admitido: 16:9, 9:16 o 1:1.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  try {
    let referenceImageUrl = null;
    if (req.file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
        return res.status(415).type('text/plain').send('La imagen debe ser JPG, PNG o WebP.');
      }
      const uploadForm = new FormData();
      uploadForm.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'referencia.jpg');
      const mediaResponse = await fetch('https://media.pollinations.ai/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${POLLINATIONS_KEY}` },
        body: uploadForm,
        signal: controller.signal
      });
      if (!mediaResponse.ok) {
        const detail = (await mediaResponse.text()).slice(0, 1000);
        return res.status(mediaResponse.status).type('text/plain').send(`No se pudo subir la imagen de referencia: ${detail || mediaResponse.status}`);
      }
      const uploadedMedia = await mediaResponse.json();
      referenceImageUrl = uploadedMedia.url || uploadedMedia.data?.url || uploadedMedia.file?.url || null;
      if (!referenceImageUrl || !referenceImageUrl.startsWith('https://media.pollinations.ai/')) {
        return res.status(502).type('text/plain').send('Pollinations no devolvió una URL válida para la imagen de referencia.');
      }
    }

    const upstreamUrl = new URL(`https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}`);
    upstreamUrl.searchParams.set('model', MODEL);
    upstreamUrl.searchParams.set('duration', String(duration));
    upstreamUrl.searchParams.set('resolution', resolution);
    upstreamUrl.searchParams.set('aspectRatio', aspectRatio);
    upstreamUrl.searchParams.set('key', POLLINATIONS_KEY);
    if (referenceImageUrl) upstreamUrl.searchParams.set('image[0]', referenceImageUrl);

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
}

app.get('/video', (req, res, next) => generateVideo(req, res).catch(next));
app.post('/video', (req, res, next) => {
  referenceUpload.single('referenceImage')(req, res, (error) => {
    if (error) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).type('text/plain').send(tooLarge ? 'La imagen supera el límite de 10 MB.' : 'No se pudo leer la imagen enviada.');
    }
    generateVideo(req, res).catch(next);
  });
});

app.listen(PORT, () => console.log(`Servidor listo en el puerto ${PORT}`));
