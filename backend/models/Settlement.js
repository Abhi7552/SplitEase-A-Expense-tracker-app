const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema({
  group:    { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  toUser:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  amount:   { type: Number, required: true, min: 0 },
  note:     { type: String, trim: true, maxlength: 300, default: '' },
}, { timestamps: true });

settlementSchema.index({ group: 1 });
settlementSchema.index({ fromUser: 1 });
settlementSchema.index({ toUser: 1 });
settlementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Settlement', settlementSchema);
