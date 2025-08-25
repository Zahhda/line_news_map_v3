// src/routes/adminUsers.js
import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { adminRequired } from '../middleware/auth.js';

const router = express.Router();

router.get('/', adminRequired, async (req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 }).lean();
  res.json({ users: users.map(u => ({ ...u, id: u._id })) });
});

router.post('/', adminRequired, async (req, res) => {
  try {
    const { name, email, phone = '', password, role = 'user' } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Email already exists' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), phone, passwordHash, role: role === 'admin' ? 'admin' : 'user' });
    res.json({ user: user.toJSON() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.patch('/:id', adminRequired, async (req, res) => {
  try {
    const { role, isActive } = req.body || {};
    const updates = {};
    if (role) updates.role = role === 'admin' ? 'admin' : 'user';
    if (typeof isActive === 'boolean') updates.isActive = isActive;
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ user: user.toJSON() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', adminRequired, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
