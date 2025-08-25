// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import authRouter from './src/routes/auth.js';
import adminRouter from './src/routes/admin.js';
import adminUsersRouter from './src/routes/adminUsers.js';
import adminRegionsRouter from './src/routes/adminRegions.js';
import regionsRouter from './src/routes/regions.js';
import newsRouter from './src/routes/news.js';
import translateRouter from './src/routes/translate.js';
import { authRequired, adminRequired } from './src/middleware/auth.js';
import { ensureSeedAdmin } from './src/utils/seedAdmin.js';
import readLaterRouter from './src/routes/readLater.js';


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// logging
app.use(morgan('dev'));

// middleware
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/account/readlater', readLaterRouter);


// Mongo
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/live_news_map';
await mongoose.connect(MONGODB_URI);

// Seed admin if missing
await ensureSeedAdmin();

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ---- APIs ----
// Config for map key
app.get('/api/config', (req, res) => {
  res.json({ mapsKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

app.use('/api/translate', translateRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin/regions', adminRegionsRouter);
app.use('/api/regions', regionsRouter);
app.use('/api/news', newsRouter);

// ---- UI routes ----
app.get('/admin', adminRequired, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/admin/users', adminRequired, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-users.html'));
});
app.get('/account', authRequired, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'account.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  const hostShown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Live News Map running on http://${hostShown}:${PORT}`);
});
