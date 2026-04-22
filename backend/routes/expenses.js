const express  = require('express');
const { body, validationResult } = require('express-validator');
const Expense  = require('../models/Expense');
const Group    = require('../models/Group');
const User     = require('../models/User');
const { protect } = require('../middleware/auth');
const wa       = require('../services/whatsapp');
const gmail    = require('../services/gmail');

const router = express.Router();
router.use(protect);

const CATEGORIES = ['Food','Transport','Shopping','Entertainment','Health','Bills','Other'];

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ message: errors.array()[0].msg }); return false; }
  return true;
};

// GET /api/expenses
router.get('/', async (req, res) => {
  try {
    const { type, groupId, category, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};

    if (type === 'personal') {
      filter.type = 'personal'; filter.owner = req.user._id;
    } else if (type === 'group' && groupId) {
      const group = await Group.findById(groupId);
      if (!group || !group.hasMember(req.user._id)) return res.status(403).json({ message: 'Not a group member.' });
      filter.type = 'group'; filter.group = groupId;
    } else {
      const myGroups = await Group.find({ 'members.user': req.user._id }).select('_id');
      const groupIds = myGroups.map(g => g._id);
      filter.$or = [{ type: 'personal', owner: req.user._id }, { type: 'group', group: { $in: groupIds } }];
    }
    if (category && CATEGORIES.includes(category)) filter.category = category;

    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .populate('owner', 'name email avatar')
        .populate('paidBy', 'name email avatar')
        .populate('splits.user', 'name email avatar')
        .sort({ expenseDate: -1, createdAt: -1 })
        .skip(skip).limit(parseInt(limit)),
      Expense.countDocuments(filter),
    ]);
    res.json({ expenses, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/expenses
router.post('/',
  [
    body('type').isIn(['personal','group']).withMessage('Type must be personal or group'),
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('category').isIn(CATEGORIES).withMessage('Invalid category'),
    body('expenseDate').isISO8601().withMessage('Valid date required'),
    body('note').optional().trim().isLength({ max: 500 }),
    body('groupId').if(body('type').equals('group')).notEmpty().withMessage('groupId required for group expense'),
    body('splitAmong').if(body('type').equals('group')).isArray({ min: 1 }).withMessage('Must split among at least one member'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    const { type, title, amount, category, expenseDate, note = '', groupId, splitAmong } = req.body;

    try {
      if (type === 'group') {
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ message: 'Group not found.' });
        if (!group.hasMember(req.user._id)) return res.status(403).json({ message: 'Not a group member.' });

        const memberIds = group.members.map(m => m.user.toString());
        const invalid   = splitAmong.filter(id => !memberIds.includes(id));
        if (invalid.length > 0) return res.status(400).json({ message: 'Some split members are not in the group.' });

        const shareAmount = Math.round((amount / splitAmong.length) * 100) / 100;
        const splits      = splitAmong.map(uid => ({ user: uid, shareAmount }));

        const expense = await Expense.create({
          type: 'group', group: groupId, owner: req.user._id,
          paidBy: req.user._id, title, amount, category,
          expenseDate: new Date(expenseDate), note, splits,
        });

        await expense.populate([
          { path: 'paidBy',       select: 'name email avatar' },
          { path: 'splits.user',  select: 'name email avatar' },
          { path: 'owner',        select: 'name email avatar' },
        ]);

        await Group.findByIdAndUpdate(groupId, { updatedAt: new Date() });

        // ── Notifications for split members ────────
        // Fetch full user docs (with phone, email) for the split members
        const otherMemberIds = splitAmong.filter(id => id !== req.user._id.toString());
        if (otherMemberIds.length > 0) {
          const otherUsers = await User.find({ _id: { $in: otherMemberIds } })
                                       .select('name phone email whatsappEnabled emailNotifications isPro whatsappProEnabled whatsappMessageCount');
          
          // Send WhatsApp notifications
          otherUsers.forEach(u => {
            if (u.whatsappEnabled !== false) {
              wa.notifyExpenseAdded(
                [{ name: u.name, phone: u.phone, whatsappEnabled: u.whatsappEnabled, isPro: u.isPro, whatsappProEnabled: u.whatsappProEnabled, whatsappMessageCount: u.whatsappMessageCount }],
                { name: req.user.name },
                { title, amount, category },
                { name: group.name },
                shareAmount
              );
            }
          });

          // Send Gmail notifications
          otherUsers.forEach(u => {
            if (u.emailNotifications.expenseAdded) {
              gmail.notifyExpenseAdded(
                [{ name: u.name, email: u.email }],
                { name: req.user.name },
                { title, amount, category },
                { name: group.name },
                shareAmount
              );
            }
          });
        }

        return res.status(201).json({ expense });
      }

      // Personal expense — no notification needed
      const expense = await Expense.create({
        type: 'personal', owner: req.user._id,
        title, amount, category,
        expenseDate: new Date(expenseDate), note,
      });
      await expense.populate('owner', 'name email avatar');
      res.status(201).json({ expense });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// GET /api/expenses/summary
router.get('/summary', async (req, res) => {
  try {
    const myGroups = await Group.find({ 'members.user': req.user._id }).select('_id');
    const groupIds = myGroups.map(g => g._id);

    const [personalStats, groupStats] = await Promise.all([
      Expense.aggregate([
        { $match: { type: 'personal', owner: req.user._id } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Expense.aggregate([
        { $match: { type: 'group', group: { $in: groupIds } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    const startOfMonth = new Date();
    startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);

    const thisMonthPersonal = await Expense.aggregate([
      { $match: { type: 'personal', owner: req.user._id, expenseDate: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.json({
      personalByCategory: personalStats,
      groupTotal: groupStats[0]?.total || 0,
      groupCount: groupStats[0]?.count || 0,
      thisMonthPersonal: thisMonthPersonal[0]?.total || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/expenses/:id
router.get('/:id', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('owner paidBy', 'name email avatar')
      .populate('splits.user', 'name email avatar')
      .populate('group', 'name color');
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });

    if (expense.type === 'personal' && expense.owner._id.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Access denied.' });
    if (expense.type === 'group') {
      const group = await Group.findById(expense.group);
      if (!group || !group.hasMember(req.user._id)) return res.status(403).json({ message: 'Access denied.' });
    }
    res.json({ expense });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });
    const isOwner = expense.owner.toString() === req.user._id.toString();
    const isPayer = expense.paidBy?.toString() === req.user._id.toString();
    if (!isOwner && !isPayer) return res.status(403).json({ message: 'Only the payer can delete this expense.' });
    await expense.deleteOne();
    res.json({ message: 'Expense deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
