// src/routes/auth.js
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const COOKIE_NAME = 'token';
const isProd = process.env.NODE_ENV === 'production';

const COOKIE_OPTS_BASE = { httpOnly: true, sameSite: 'lax', secure: isProd };
function setAuthCookie(res, token) { res.cookie(COOKIE_NAME, token, { ...COOKIE_OPTS_BASE, maxAge: 1000*60*60*24*7 }); }
function clearAuthCookie(res) { res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTS_BASE }); }

router.post('/signup', async (req, res) => {
  try {
    let { name = '', email = '', phone = '', password = '' } = req.body || {};
    name = String(name).trim();
    email = String(email).toLowerCase().trim();
    phone = String(phone || '').trim();
    password = String(password || '');

    if (!email || !password || !name) return res.status(400).json({ error: 'name, email, password required' });
    if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 chars' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, phone, passwordHash, role: 'user' });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, token);
    res.json({ user: user.toJSON() });
  } catch (e) {
    console.error('signup error', e);
    res.status(500).json({ error: 'Failed to sign up' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user || typeof user.passwordHash !== 'string' || !user.passwordHash.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let ok = false;
    try { ok = await bcrypt.compare(String(password), user.passwordHash); } catch {}
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, token);
    res.json({ user: user.toJSON() });
  } catch (e) {
    console.error('login error', e);
    res.status(500).json({ error: 'Failed to login' });
  }
});

router.post('/logout', async (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user.toJSON() });
  } catch (e) {
    console.error('me error', e);
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;
