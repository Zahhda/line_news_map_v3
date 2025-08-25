// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import morgan from 'morgan';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Healthcheck (useful for platforms)
app.get('/health', (_req, res) => res.status(200).send('ok'));

// Logging
try { app.use(morgan('dev')); } catch {}

// Basic middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Mongo (require env var in prod; fail fast if missing/unreachable) ----
const isProd = process.env.NODE_ENV === 'production';
let MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  if (isProd) {
    console.error('❌ Missing MONGODB_URI env var (required in production).');
    process.exit(1);
  } else {
    // local dev fallback only
    MONGODB_URI = 'mongodb://127.0.0.1:27017/live_news_map';
  }
}

await mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000, // fail fast if DB is unreachable
});
console.log('✅ MongoDB connected');

// Routes
import regionsRouter from './src/routes/regions.js';
import newsRouter from './src/routes/news.js';
import translateRouter from './src/routes/translate.js';
import adminRouter from './src/routes/admin.js';

app.use('/api/regions', regionsRouter);
app.use('/api/news', newsRouter);
app.use('/api/translate', translateRouter);
app.use('/api/admin', adminRouter);

// Config for client (maps key, other flags)
app.get('/api/config', (req, res) => {
  res.json({ mapsKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Pages
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ---- Networking: bind 0.0.0.0 and Railway PORT ----
const PORT = process.env.PORT || 8080; // Railway injects PORT
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Live News Map running on http://0.0.0.0:${PORT}`);
});

// Crash on unhandled promise rejections so platform restarts the app
process.on('unhandledRejection', (err) => {
  console.error('UnhandledRejection:', err);
  process.exit(1);
});
