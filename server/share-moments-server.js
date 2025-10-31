import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'assets');
const momentsDir = path.join(assetsDir, 'moments');

fs.mkdirSync(momentsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, momentsDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, `${ts}_${safe}`);
  }
});
const upload = multer({ storage });

const app = express();
app.use(cors());

// Serve assets (including uploaded moments)
app.use('/assets', express.static(assetsDir, { etag: true, maxAge: '1h' }));

// List existing moments
app.get('/api/moments', (_req, res) => {
  fs.readdir(momentsDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'failed_to_list' });
    const imgs = files
      .filter(f => /\.(png|jpe?g|gif|webp|bmp|heic|heif|svg)$/i.test(f))
      .sort((a, b) => b.localeCompare(a));
    res.json({ files: imgs.map(f => `/assets/moments/${encodeURIComponent(f)}`) });
  });
});

// Upload
app.post('/api/moments/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const url = `/assets/moments/${encodeURIComponent(req.file.filename)}`;
  // Broadcast to SSE subscribers
  broadcastNew(`${req.protocol}://${req.get('host')}${url}`);
  res.json({ ok: true, file: url });
});

// Simple ping
app.get('/api/moments/ping', (_req, res) => res.json({ ok: true }));

// SSE stream for realtime updates
const clients = new Set();
app.get('/api/moments/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(': connected\n\n');
  clients.add(res);
  req.on('close', () => { clients.delete(res); });
});

function broadcastNew(absoluteUrl) {
  const msg = JSON.stringify({ type: 'new', file: absoluteUrl });
  for (const res of clients) {
    try { res.write(`data: ${msg}\n\n`); } catch { /* ignore */ }
  }
}

const port = process.env.PORT || 5052;
app.listen(port, () => {
  console.log(`ShareMoments server running on http://localhost:${port}`);
});
