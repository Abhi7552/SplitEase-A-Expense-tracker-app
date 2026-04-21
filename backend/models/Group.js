const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const inviteSchema = new mongoose.Schema({
  invitee:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status:    { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date },
}, { _id: true });

const groupSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 300, default: '' },
  color:       { type: String, default: '#7c6ef5' },
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members:     [memberSchema],
  invites:     [inviteSchema],
}, { timestamps: true });

// Virtual: array of member user IDs for quick lookup
groupSchema.virtual('memberIds').get(function () {
  return this.members.map(m => m.user.toString());
});

// Check if a userId is a member
groupSchema.methods.hasMember = function (userId) {
  return this.members.some(m => {
    const memberUserId = m.user._id || m.user;
    const userIdStr = userId.toString ? userId.toString() : userId;
    const memberUserIdStr = memberUserId.toString ? memberUserId.toString() : memberUserId;
    return memberUserIdStr === userIdStr;
  });
};

// Indexes
groupSchema.index({ owner: 1 });
groupSchema.index({ 'members.user': 1 });
groupSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Group', groupSchema);
