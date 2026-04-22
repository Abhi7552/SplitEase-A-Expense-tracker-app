const express = require('express');
const User    = require('../models/User');
const Group   = require('../models/Group');
const { protect } = require('../middleware/auth');
const monthlyReport = require('../services/monthlyReport');
const wa = require('../services/whatsapp');

const router = express.Router();
router.use(protect);

// ── GET /api/users/search?email= ────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'email query required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'No user found with that email.' });

    res.json({ user: { _id: user._id, name: user.name, email: user.email, avatar: user.avatar } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/users/invites — my pending invites ─────────────
router.get('/invites', async (req, res) => {
  try {
    const groups = await Group.find({
      'invites.invitee': req.user._id,
      'invites.status':  'pending',
    })
      .populate('invites.invitedBy', 'name email')
      .populate('owner', 'name');

    const invites = [];
    groups.forEach(g => {
      g.invites.forEach(inv => {
        if (
          inv.invitee.toString() === req.user._id.toString() &&
          inv.status === 'pending'
        ) {
          invites.push({
            inviteId: inv._id,
            groupId: g._id,
            groupName: g.name,
            groupColor: g.color,
            invitedBy: inv.invitedBy,
            createdAt: inv.createdAt,
          });
        }
      });
    });

    res.json({ invites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /api/users/report/monthly — send monthly report to user ─────────
router.post('/report/monthly', async (req, res) => {
  try {
    const result = await monthlyReport.sendReportToUser(req.user._id);
    if (!result) {
      return res.status(400).json({ message: 'Failed to send report. Ensure email notifications are enabled.' });
    }
    res.json({ message: 'Monthly report sent to your email!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/users/report/preview — preview monthly report ─────────
router.get('/report/preview', async (req, res) => {
  try {
    const reportData = await monthlyReport.generateUserReport(req.user._id);
    if (!reportData) {
      return res.status(400).json({ message: 'No report data available.' });
    }
    res.json({ report: reportData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/users/whatsapp/status — get WhatsApp usage status ─────────
router.get('/whatsapp/status', async (req, res) => {
  try {
    res.json({
      whatsappEnabled: req.user.whatsappEnabled,
      messageCount: req.user.whatsappMessageCount,
      freeLimit: wa.FREE_MESSAGE_LIMIT,
      canSend: wa.canSendWhatsApp(req.user),
      isPro: req.user.isPro,
      whatsappProEnabled: req.user.whatsappProEnabled,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── PUT /api/users/email-preferences — update email notification preferences ─────────
router.put('/email-preferences', async (req, res) => {
  try {
    const { expenseAdded, inviteReceived, settlementUpdate, monthlyReport } = req.body;
    
    if (typeof expenseAdded !== 'undefined') req.user.emailNotifications.expenseAdded = expenseAdded;
    if (typeof inviteReceived !== 'undefined') req.user.emailNotifications.inviteReceived = inviteReceived;
    if (typeof settlementUpdate !== 'undefined') req.user.emailNotifications.settlementUpdate = settlementUpdate;
    if (typeof monthlyReport !== 'undefined') req.user.emailNotifications.monthlyReport = monthlyReport;
    
    await req.user.save();
    res.json({ message: 'Email preferences updated.', preferences: req.user.emailNotifications });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── PUT /api/users/whatsapp-pro — upgrade WhatsApp to pro (in real app, this would verify payment) ─────────
router.put('/whatsapp-pro', async (req, res) => {
  try {
    // In a real implementation, verify payment here
    // For now, just mark as pro
    req.user.whatsappProEnabled = true;
    req.user.whatsappMessageCount = 0; // Reset counter
    await req.user.save();
    
    res.json({ 
      message: 'WhatsApp Pro activated! Enjoy unlimited WhatsApp notifications.',
      whatsappProEnabled: req.user.whatsappProEnabled,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/users/profile — get current user profile ─────────
router.get('/profile', async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── PUT /api/users/profile — update current user profile ─────────
router.put('/profile', async (req, res) => {
  try {
    const { name, phone, avatar, whatsappEnabled } = req.body;
    
    if (name) req.user.name = name;
    if (phone) req.user.phone = phone;
    if (avatar) req.user.avatar = avatar;
    if (typeof whatsappEnabled !== 'undefined') req.user.whatsappEnabled = whatsappEnabled;
    
    await req.user.save();
    res.json({ message: 'Profile updated.', user: req.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
