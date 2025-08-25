// server.js (edits)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

// ... your imports ...

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// honor X-Forwarded-* when behind Railway's proxy (needed for secure cookies)
app.set('trust proxy', 1);

// logging
app.use(morgan('dev'));

// middleware
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/account/readlater', readLaterRouter);

// Mongo (fail fast if missing or not reachable)
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI. Set it in Railway Variables.');
  process.exit(1);
}
try {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('Mongo connected');
} catch (err) {
  console.error('Mongo connect failed:', err?.message || err);
  process.exit(1);
}

// Seed admin if missing
await ensureSeedAdmin();

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ---- APIs ----
app.get('/api/config', (req, res) => {
  res.json({ mapsKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

// ... your routers ...

// Health check (optional but useful)
app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

const PORT = process.env.PORT || 8080;
// Do NOT bind to 127.0.0.1 on Railway; either use 0.0.0.0 or omit host
app.listen(PORT, () => {
  console.log(`Live News Map running on http://0.0.0.0:${PORT}`);
});
