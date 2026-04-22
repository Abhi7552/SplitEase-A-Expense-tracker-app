const express    = require('express');
const { body, validationResult } = require('express-validator');
const Settlement = require('../models/Settlement');
const Group      = require('../models/Group');
const User       = require('../models/User');
const { protect } = require('../middleware/auth');
const wa         = require('../services/whatsapp');
const gmail      = require('../services/gmail');

const router = express.Router();
router.use(protect);

// POST /api/settlements
router.post('/',
  [
    body('groupId').notEmpty().withMessage('groupId required'),
    body('toUserId').notEmpty().withMessage('toUserId required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be > 0'),
    body('note').optional().trim().isLength({ max: 300 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const { groupId, toUserId, amount, note = '' } = req.body;

    try {
      const group = await Group.findById(groupId);
      if (!group) return res.status(404).json({ message: 'Group not found.' });
      if (!group.hasMember(req.user._id)) return res.status(403).json({ message: 'Not a group member.' });
      if (!group.hasMember(toUserId)) return res.status(400).json({ message: 'Recipient is not a group member.' });

      const settlement = await Settlement.create({
        group: groupId, fromUser: req.user._id, toUser: toUserId, amount, note,
      });
      await settlement.populate('fromUser toUser', 'name email avatar phone whatsappEnabled emailNotifications isPro whatsappProEnabled whatsappMessageCount');

      // ── Notifications for the recipient ─────────────────────
      const recipient = settlement.toUser;
      if (recipient) {
        // WhatsApp notification
        if (recipient.whatsappEnabled !== false) {
          wa.notifySettlement(
            { name: recipient.name, phone: recipient.phone, whatsappEnabled: recipient.whatsappEnabled, isPro: recipient.isPro, whatsappProEnabled: recipient.whatsappProEnabled, whatsappMessageCount: recipient.whatsappMessageCount },
            { name: settlement.fromUser.name },
            amount,
            { name: group.name }
          );
        }

        // Gmail notification
        if (recipient.emailNotifications.settlementUpdate) {
          gmail.notifySettlement(
            { name: recipient.name, email: recipient.email },
            { name: settlement.fromUser.name },
            amount,
            { name: group.name }
          );
        }
      }

      res.status(201).json({ settlement });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// GET /api/settlements?groupId=
router.get('/', async (req, res) => {
  try {
    const { groupId } = req.query;
    if (!groupId) return res.status(400).json({ message: 'groupId required.' });
    const group = await Group.findById(groupId);
    if (!group || !group.hasMember(req.user._id)) return res.status(403).json({ message: 'Access denied.' });
    const settlements = await Settlement.find({ group: groupId })
      .populate('fromUser toUser', 'name email avatar')
      .sort({ createdAt: -1 });
    res.json({ settlements });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
