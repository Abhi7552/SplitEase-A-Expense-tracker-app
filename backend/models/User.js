const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true, maxlength: 100 },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8, select: false },
  avatar:   { type: String, default: '#7c6ef5' },

  // WhatsApp notifications — stored as plain digits with country code e.g. "919876543210"
  // Optional: users can add/update this from their profile
  phone:              { type: String, default: null, trim: true },
  whatsappEnabled:    { type: Boolean, default: true }, // user can opt-out per account

  // WhatsApp feature — Pro version gate
  whatsappMessageCount: { type: Number, default: 0 },  // Track free messages
  whatsappProEnabled:   { type: Boolean, default: false }, // Pro subscription status
  whatsappResetDate:    { type: Date, default: () => new Date() }, // When monthly limit resets

  // Subscription & Premium features
  isPro:              { type: Boolean, default: false }, // Pro/Premium subscription status
  proExpireAt:        { type: Date, default: null },
  
  // Email notification preferences
  emailNotifications: {
    expenseAdded:     { type: Boolean, default: true },
    inviteReceived:   { type: Boolean, default: true },
    settlementUpdate: { type: Boolean, default: true },
    monthlyReport:    { type: Boolean, default: true },
  },

  // Last report sent dates (per group + personal)
  lastMonthlyReportSent: {
    personal: { type: Date, default: null },
    // groups: { groupId: Date } — handled dynamically
  },

}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// Check if user can send WhatsApp messages (free tier limit: 5 messages/month)
userSchema.methods.canSendWhatsApp = function () {
  if (this.whatsappProEnabled || this.isPro) return true; // Pro users can send unlimited
  return this.whatsappMessageCount < 5;
};

// Increment WhatsApp message count
userSchema.methods.incrementWhatsAppCount = function () {
  if (!this.whatsappProEnabled && !this.isPro) {
    this.whatsappMessageCount += 1;
  }
};

// Strip sensitive fields from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ isPro: 1 });
userSchema.index({ whatsappProEnabled: 1 });

module.exports = mongoose.model('User', userSchema);
