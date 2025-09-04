// src/routes/regions.js
import express from 'express';
import Region from '../models/Region.js';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const COOKIE_NAME = 'token';

function readToken(req) {
  const bearer = (req.headers.authorization || '').trim();
  if (bearer.toLowerCase().startsWith('bearer ')) return bearer.slice(7).trim();
  if (req.cookies && req.cookies[COOKIE_NAME]) return String(req.cookies[COOKIE_NAME]);
  return null;
}

async function getReqUser(req) {
  try {
    const token = readToken(req);
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id).lean();
    return user || null;
  } catch { return null; }
}

// List regions (optionally by country) and enforce per-user access if present
router.get('/', async (req, res) => {
  const { country } = req.query;
  const q = country ? { country } : {};
  const all = await Region.find(q).sort({ country: 1, name: 1 }).lean();

  const user = await getReqUser(req);
  if (!user || user.role === 'admin') {
    return res.json(all);
  }

  const access = user.access || {};
  const hasCountryWhitelist = Array.isArray(access.allowedCountries) && access.allowedCountries.length > 0;
  const hasRegionWhitelist  = Array.isArray(access.allowedRegionIds) && access.allowedRegionIds.length > 0;

  let filtered = all;

  if (hasCountryWhitelist) {
    const set = new Set(access.allowedCountries.map(String));
    filtered = filtered.filter(r => set.has(String(r.country)));
  }

  if (hasRegionWhitelist) {
    const set = new Set((access.allowedRegionIds || []).map(id => String(id)));
    filtered = filtered.filter(r => set.has(String(r._id)));
  }

  const limit = Number.isInteger(access.perCountryRegionLimit) ? access.perCountryRegionLimit : null;
  if (limit !== null) {
    const grouped = filtered.reduce((acc, r) => {
      (acc[r.country] ||= []).push(r);
      return acc;
    }, {});
    filtered = Object.values(grouped).flatMap(list => list.slice(0, Math.max(0, limit)));
  }

  res.json(filtered);
});

// Distinct countries — NOW filtered by per-user access
router.get('/countries', async (req, res) => {
  const user = await getReqUser(req);

  // Admins or no user: all countries
  if (!user || user.role === 'admin') {
    const all = await Region.distinct('country');
    all.sort();
    return res.json({ countries: all });
  }

  const access = user.access || {};
  const hasCountryWhitelist = Array.isArray(access.allowedCountries) && access.allowedCountries.length > 0;
  const hasRegionWhitelist  = Array.isArray(access.allowedRegionIds) && access.allowedRegionIds.length > 0;

  const query = {};
  if (hasCountryWhitelist) {
    query.country = { $in: access.allowedCountries.map(String) };
  }
  if (hasRegionWhitelist) {
    // If both are set, this naturally becomes the intersection.
    query._id = { $in: access.allowedRegionIds };
  }

  const countries = await Region.distinct('country', query);
  countries.sort();
  res.json({ countries });
});

export default router;