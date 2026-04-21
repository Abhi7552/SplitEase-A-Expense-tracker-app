const mongoose = require('mongoose');

const splitSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  shareAmount: { type: Number, required: true, min: 0 },
}, { _id: false });

const expenseSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['personal', 'group'],
    required: true,
  },

  // For group expenses
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null,
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  splits: [splitSchema],

  // Common fields
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  amount:      { type: Number, required: true, min: 0 },
  category: {
    type: String,
    enum: ['Food','Transport','Shopping','Entertainment','Health','Bills','Other'],
    default: 'Other',
  },
  expenseDate: { type: Date, required: true },
  note:        { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true });

// Indexes for fast queries
expenseSchema.index({ owner: 1, type: 1 });
expenseSchema.index({ group: 1 });
expenseSchema.index({ paidBy: 1 });
expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ createdAt: -1 });
expenseSchema.index({ 'splits.user': 1 });

module.exports = mongoose.model('Expense', expenseSchema);
