// src/models/User.js
import mongoose from 'mongoose';

const SavedNewsSchema = new mongoose.Schema({
  key:   { type: String, required: true, index: true },
  title: String,
  summary: String,
  link:  String,
  isoDate: String,
  image: String,
  source: String,
  category: { type: String, default: 'others' }
}, { _id: false });

// NEW: per-user visibility controls
const AccessSchema = new mongoose.Schema({
  // If empty => no country restriction.
  allowedCountries: { type: [String], default: [] },
  // Explicitly allowed regions (ObjectId of Region). If empty => no region restriction.
  allowedRegionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Region', default: [] }],
  // Optional cap per country; null/undefined => unlimited.
  perCountryRegionLimit: { type: Number, min: 0, default: null },
}, { _id: false });

const UserSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true },
    email:       { type: String, required: true, unique: true, index: true },
    phone:       { type: String, default: '' },
    passwordHash:{ type: String, required: true },
    role:        { type: String, enum: ['user', 'admin'], default: 'user', index: true },

    // NEW
    access:      { type: AccessSchema, default: () => ({}) },

    savedNews:   { type: [SavedNewsSchema], default: [] },
  },
  { timestamps: true }
);

// Hide internals client-side
UserSchema.set('toJSON', {
  transform: function (_doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  }
});

export default mongoose.model('User', UserSchema);
