const express = require('express');
const User    = require('../models/User');
const Group   = require('../models/Group');
const { protect } = require('../middleware/auth');

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

module.exports = router;
