// src/routes/adminUsers.js
import express from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Region from '../models/Region.js';
import { adminRequired } from '../middleware/auth.js';

const router = express.Router();
const dbg = (...args) => { if (process.env.DEBUG_ACCESS === '1') console.log('[adminUsers]', ...args); };

/* ===================== USERS LIST + CREATE ===================== */

router.get('/', adminRequired, async (req, res) => {
  // Prevent stale lists that would carry invalid ids in the UI
  res.set('Cache-Control', 'no-store');
  const users = await User.find({}).sort({ createdAt: -1 }).lean();
  const shaped = users.map(u => ({
    ...u,
    id: String(u._id), // always a string
  }));
  dbg('GET / → users:', shaped.length);
  res.json({ users: shaped });
});

router.post('/', adminRequired, async (req, res) => {
  try {
    const { name, email, phone = '', password, role = 'user', access } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, password required' });
    }
    const emailLower = String(email).toLowerCase();
    const existing = await User.findOne({ email: emailLower });
    if (existing) return res.status(409).json({ error: 'Email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);

    const payload = {
      name,
      email: emailLower,
      phone,
      passwordHash,
      role: role === 'admin' ? 'admin' : 'user',
    };

    // Optional access on create
    if (access && typeof access === 'object') {
      const countries = Array.isArray(access.allowedCountries) ? access.allowedCountries.filter(Boolean).map(String) : [];
      const regionIds = Array.isArray(access.allowedRegionIds) ? access.allowedRegionIds.filter(v => mongoose.isValidObjectId(v)).map(v => new mongoose.Types.ObjectId(v)) : [];
      let limit = access.perCountryRegionLimit;
      if (limit === '' || limit === null || limit === undefined) limit = null;
      else {
        limit = parseInt(limit, 10);
        if (!Number.isFinite(limit) || limit < 0) return res.status(400).json({ error: 'perCountryRegionLimit must be a non-negative integer or null' });
      }
      payload.access = {
        allowedCountries: countries,
        allowedRegionIds: regionIds,
        perCountryRegionLimit: limit
      };
    }

    const user = await User.create(payload);
    res.json({ user: user.toJSON() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/* ===================== ACCESS ROUTES (MUST COME BEFORE /:id) ===================== */

// GET user access + available countries/regions (for the modal)
router.get('/:id/access', adminRequired, async (req, res) => {
  const { id } = req.params;
  dbg('GET /:id/access', id);
  if (!mongoose.isValidObjectId(id)) {
    dbg('invalid ObjectId');
    return res.status(400).json({ error: 'Invalid user id' });
  }
  const user = await User.findById(id).lean();
  if (!user) {
    dbg('user not found for id', id);
    return res.status(404).json({ error: 'User not found' });
  }

  const [countries, regions] = await Promise.all([
    Region.distinct('country'),
    Region.find({}).select({ _id: 1, name: 1, country: 1 }).sort({ country: 1, name: 1 }).lean()
  ]);

  const access = user.access || {};
  const resp = {
    access: {
      allowedCountries: access.allowedCountries || [],
      allowedRegionIds: (access.allowedRegionIds || []).map(String),
      perCountryRegionLimit: access.perCountryRegionLimit ?? null,
    },
    countries: (countries || []).sort(),
    regions
  };
  dbg('returning access payload sizes', {
    countries: resp.countries.length,
    regions: resp.regions.length,
    allowedCountries: resp.access.allowedCountries.length,
    allowedRegionIds: resp.access.allowedRegionIds.length
  });
  res.json(resp);
});

// PATCH user access
router.patch('/:id/access', adminRequired, async (req, res) => {
  const { id } = req.params;
  dbg('PATCH /:id/access', id, req.body);
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const { allowedCountries, allowedRegionIds, perCountryRegionLimit } = req.body || {};
  const $set = {};

  if (allowedCountries !== undefined) {
    $set['access.allowedCountries'] = Array.isArray(allowedCountries)
      ? allowedCountries.filter(Boolean).map(String)
      : [];
  }

  if (allowedRegionIds !== undefined) {
    $set['access.allowedRegionIds'] = Array.isArray(allowedRegionIds)
      ? allowedRegionIds.filter(v => mongoose.isValidObjectId(v)).map(v => new mongoose.Types.ObjectId(v))
      : [];
  }

  if (perCountryRegionLimit !== undefined) {
    if (perCountryRegionLimit === null || perCountryRegionLimit === '') {
      $set['access.perCountryRegionLimit'] = null;
    } else {
      const n = parseInt(perCountryRegionLimit, 10);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: 'perCountryRegionLimit must be a non-negative integer or null' });
      }
      $set['access.perCountryRegionLimit'] = n;
    }
  }

  const user = await User.findByIdAndUpdate(id, { $set }, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    access: {
      allowedCountries: user.access?.allowedCountries || [],
      allowedRegionIds: (user.access?.allowedRegionIds || []).map(String),
      perCountryRegionLimit: user.access?.perCountryRegionLimit ?? null,
    }
  });
});

/* ===================== GENERIC USER EDIT/DELETE (KEEP THESE AFTER ACCESS) ===================== */

router.patch('/:id', adminRequired, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid user id' });

    const { name, email, phone, role, password } = req.body || {};
    const updates = {};
    if (name != null) updates.name = name;
    if (email != null) updates.email = String(email).toLowerCase();
    if (phone != null) updates.phone = phone;
    if (role != null) updates.role = role === 'admin' ? 'admin' : 'user';
    if (password) updates.passwordHash = await bcrypt.hash(password, 10);

    const user = await User.findByIdAndUpdate(id, updates, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user.toJSON() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', adminRequired, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid user id' });

    const result = await User.findByIdAndDelete(id);
    if (!result) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
