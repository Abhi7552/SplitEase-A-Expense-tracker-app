const express    = require('express');
const { body, validationResult } = require('express-validator');
const Group      = require('../models/Group');
const User       = require('../models/User');
const Expense    = require('../models/Expense');
const Settlement = require('../models/Settlement');
const { protect } = require('../middleware/auth');
const wa         = require('../services/whatsapp');
const gmail      = require('../services/gmail');

const router = express.Router();
router.use(protect);

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ message: errors.array()[0].msg }); return false; }
  return true;
};

// Minimum-transactions settlement algorithm
function computeSettlements(balances) {
  const creditors = balances.filter(b => b.net > 0.01).sort((a, b) => b.net - a.net);
  const debtors   = balances.filter(b => b.net < -0.01).sort((a, b) => a.net - b.net);
  const txns = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const cred = creditors[ci], debt = debtors[di];
    const amount = Math.min(cred.net, Math.abs(debt.net));
    txns.push({ from: debt.userId, fromName: debt.name, fromAvatar: debt.avatar,
                to: cred.userId,  toName: cred.name,   toAvatar: cred.avatar, amount: Math.round(amount * 100) / 100 });
    cred.net -= amount; debt.net += amount;
    if (cred.net < 0.01) ci++;
    if (debt.net > -0.01) di++;
  }
  return txns;
}

// GET /api/groups
router.get('/', async (req, res) => {
  try {
    const groups = await Group.find({ 'members.user': req.user._id })
      .populate('members.user', 'name email avatar')
      .populate('owner', 'name email avatar')
      .sort({ updatedAt: -1 });

    const groupIds = groups.map(g => g._id);
    const counts = await Expense.aggregate([
      { $match: { group: { $in: groupIds }, type: 'group' } },
      { $group: { _id: '$group', count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]);
    const countMap = Object.fromEntries(counts.map(c => [c._id.toString(), c]));
    const result = groups.map(g => ({
      ...g.toJSON(),
      expenseCount: countMap[g._id.toString()]?.count || 0,
      totalSpent:   countMap[g._id.toString()]?.total || 0,
    }));
    res.json({ groups: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/groups
router.post('/',
  [
    body('name').trim().notEmpty().withMessage('Group name is required').isLength({ max: 100 }),
    body('description').optional().trim().isLength({ max: 300 }),
    body('color').optional().trim(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    const { name, description = '', color = '#7c6ef5' } = req.body;
    try {
      const group = await Group.create({
        name, description, color,
        owner: req.user._id,
        members: [{ user: req.user._id, role: 'owner' }],
      });
      await group.populate('members.user', 'name email avatar');
      res.status(201).json({ group });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// GET /api/groups/:id
router.get('/:id', async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('members.user', 'name email avatar')
      .populate('invites.invitee', 'name email avatar')
      .populate('invites.invitedBy', 'name')
      .populate('owner', 'name email avatar');
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    if (!group.hasMember(req.user._id)) return res.status(403).json({ message: 'Not a member.' });
    res.json({ group });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/groups/:id/invite
router.post('/:id/invite',
  [body('email').isEmail().withMessage('Valid email required')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const group = await Group.findById(req.params.id);
      if (!group) return res.status(404).json({ message: 'Group not found.' });
      if (!group.hasMember(req.user._id)) return res.status(403).json({ message: 'Not a group member.' });

      const inviteeEmail = req.body.email.trim().toLowerCase();
      const invitee = await User.findOne({ email: inviteeEmail }).select('name email phone whatsappEnabled emailNotifications isPro whatsappProEnabled whatsappMessageCount');
      if (!invitee) return res.status(404).json({ message: 'No account found with that email.' });
      if (group.hasMember(invitee._id)) return res.status(409).json({ message: 'User is already in the group.' });

      const existing = group.invites.find(
        i => i.invitee.toString() === invitee._id.toString() && i.status === 'pending'
      );
      if (existing) return res.status(409).json({ message: 'Invite already sent.' });

      group.invites.push({ invitee: invitee._id, invitedBy: req.user._id });
      await group.save();

      // ── Notifications for the invitee ──────────────────────
      // WhatsApp notification
      if (invitee.whatsappEnabled !== false) {
        wa.notifyGroupInvite(
          { name: invitee.name, phone: invitee.phone, whatsappEnabled: invitee.whatsappEnabled, isPro: invitee.isPro, whatsappProEnabled: invitee.whatsappProEnabled, whatsappMessageCount: invitee.whatsappMessageCount },
          { name: req.user.name },
          { name: group.name }
        );
      }

      // Gmail notification
      if (invitee.emailNotifications.inviteReceived) {
        gmail.notifyGroupInvite(
          { name: invitee.name, email: invitee.email },
          { name: req.user.name },
          { name: group.name }
        );
      }

      res.json({ message: `Invite sent to ${invitee.name}.`, invitee: { name: invitee.name, email: invitee.email } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// POST /api/groups/:id/invite/:inviteId/respond
router.post('/:id/invite/:inviteId/respond',
  [body('action').isIn(['accepted','rejected']).withMessage('Action must be accepted or rejected')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const group = await Group.findById(req.params.id).populate('owner', 'name phone email emailNotifications whatsappEnabled isPro whatsappProEnabled whatsappMessageCount');
      if (!group) return res.status(404).json({ message: 'Group not found.' });

      const invite = group.invites.id(req.params.inviteId);
      if (!invite) return res.status(404).json({ message: 'Invite not found.' });
      if (invite.invitee.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Not your invite.' });
      if (invite.status !== 'pending') return res.status(400).json({ message: 'Invite already responded to.' });

      invite.status      = req.body.action;
      invite.respondedAt = new Date();

      if (req.body.action === 'accepted') {
        group.members.push({ user: req.user._id, role: 'member' });

        // ── Notifications for the group owner ───────────────
        if (group.owner) {
          // WhatsApp notification
          if (group.owner.whatsappEnabled !== false) {
            wa.notifyInviteAccepted(
              { name: group.owner.name, phone: group.owner.phone, whatsappEnabled: group.owner.whatsappEnabled, isPro: group.owner.isPro, whatsappProEnabled: group.owner.whatsappProEnabled, whatsappMessageCount: group.owner.whatsappMessageCount },
              { name: req.user.name },
              { name: group.name }
            );
          }

          // Gmail notification
          if (group.owner.emailNotifications.inviteReceived) {
            gmail.notifyInviteAccepted(
              { name: group.owner.name, email: group.owner.email },
              { name: req.user.name },
              { name: group.name }
            );
          }
        }
      }

      await group.save();
      res.json({ message: req.body.action === 'accepted' ? 'Joined group!' : 'Invite declined.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// GET /api/groups/:id/balances
router.get('/:id/balances', async (req, res) => {
  try {
    const group = await Group.findById(req.params.id).populate('members.user', 'name email avatar');
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    if (!group.hasMember(req.user._id)) return res.status(403).json({ message: 'Not a group member.' });

    const [expenses, settlements] = await Promise.all([
      Expense.find({ group: group._id, type: 'group' }),
      Settlement.find({ group: group._id }),
    ]);

    const balanceMap = {};
    group.members.forEach(m => {
      const uid = m.user._id.toString();
      balanceMap[uid] = { userId: uid, name: m.user.name, avatar: m.user.avatar, net: 0 };
    });
    expenses.forEach(e => {
      const payerId = e.paidBy?.toString();
      if (payerId && balanceMap[payerId]) balanceMap[payerId].net += e.amount;
      e.splits.forEach(s => {
        const uid = s.user.toString();
        if (balanceMap[uid]) balanceMap[uid].net -= s.shareAmount;
      });
    });
    settlements.forEach(s => {
      const from = s.fromUser.toString(), to = s.toUser.toString();
      if (balanceMap[from]) balanceMap[from].net += s.amount;
      if (balanceMap[to])   balanceMap[to].net   -= s.amount;
    });

    const balances = Object.values(balanceMap).map(b => ({ ...b, net: Math.round(b.net * 100) / 100 }));
    const transactions = computeSettlements(balances.map(b => ({ ...b })));
    res.json({ balances, transactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    if (group.owner.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Only the owner can delete the group.' });
    await Promise.all([Expense.deleteMany({ group: group._id }), Settlement.deleteMany({ group: group._id }), group.deleteOne()]);
    res.json({ message: 'Group deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
