const express = require('express');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User    = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const sendToken = (res, user, statusCode = 200) => {
  const token  = signToken(user._id);
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true, secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.status(statusCode).json({ token, user });
};

// POST /api/auth/register
router.post('/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('phone').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const name     = req.body.name.trim();
    const email    = req.body.email.trim().toLowerCase();
    const password = req.body.password;
    // Strip non-digits from phone, keep country code
    const phone    = req.body.phone ? req.body.phone.replace(/\D/g, '') : null;

    try {
      if (await User.findOne({ email })) return res.status(409).json({ message: 'Email already registered.' });

      const COLORS = ['#7c6ef5','#3dd68c','#f5697c','#f5c842','#64a0ff','#a855f7','#fb923c','#22d3ee'];
      const count  = await User.countDocuments();
      const avatar = COLORS[count % COLORS.length];

      const user = await User.create({ name, email, password, avatar, phone });
      sendToken(res, user, 201);
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ message: 'Server error. Please try again.' });
    }
  }
);

// POST /api/auth/login
router.post('/login',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const email    = req.body.email.trim().toLowerCase();
    const password = req.body.password;
    try {
      const user = await User.findOne({ email }).select('+password');
      if (!user || !(await user.matchPassword(password)))
        return res.status(401).json({ message: 'Invalid email or password.' });
      user.password = undefined;
      sendToken(res, user);
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ message: 'Server error. Please try again.' });
    }
  }
);

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.cookie('token', '', { httpOnly: true, expires: new Date(0) });
  res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => res.json({ user: req.user }));

// PATCH /api/auth/profile — update phone number & WhatsApp opt-in/out
router.patch('/profile', protect,
  [
    body('phone').optional().trim(),
    body('whatsappEnabled').optional().isBoolean().withMessage('whatsappEnabled must be boolean'),
    body('name').optional().trim().isLength({ max: 100 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    try {
      const updates = {};
      if (req.body.name !== undefined)             updates.name             = req.body.name.trim();
      if (req.body.phone !== undefined)            updates.phone            = req.body.phone.replace(/\D/g, '') || null;
      if (req.body.whatsappEnabled !== undefined)  updates.whatsappEnabled  = req.body.whatsappEnabled;

      const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
      res.json({ user, message: 'Profile updated.' });
    } catch (err) {
      console.error('Profile update error:', err);
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

module.exports = router;
