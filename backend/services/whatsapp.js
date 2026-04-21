// backend/services/whatsapp.js
// WhatsApp notifications via Twilio API
// Uses Node built-in https — zero extra dependencies

const https = require('https');

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const FROM        = process.env.TWILIO_WA_FROM; // e.g. whatsapp:+14155238886

const configured = () => !!(ACCOUNT_SID && AUTH_TOKEN && FROM);

const fmt = (n) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Core sender ───────────────────────────────────────────
function sendWhatsApp(toPhone, message) {
  if (!configured()) {
    console.log('[WA] Skipped (Twilio not configured)');
    return;
  }
  if (!toPhone) return;

  // Normalise: strip non-digits, prepend whatsapp:+
  const digits   = toPhone.replace(/\D/g, '');
  const toFormed = `whatsapp:+${digits}`;

  // Build form body using URLSearchParams (no deprecated querystring)
  const body = new URLSearchParams({ From: FROM, To: toFormed, Body: message }).toString();

  const opts = {
    hostname: 'api.twilio.com',
    port:     443,
    path:     `/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    method:   'POST',
    headers:  {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      Authorization:    'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
    },
  };

  const req = https.request(opts, (res) => {
    let raw = '';
    res.on('data', (c) => { raw += c; });
    res.on('end', () => {
      try {
        const data = JSON.parse(raw);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[WA] ✅ Sent to ${toFormed} — SID: ${data.sid}`);
        } else {
          console.error(`[WA] ❌ Twilio error ${res.statusCode}:`, data.message);
        }
      } catch { /* ignore parse errors */ }
    });
  });

  req.on('error', (e) => console.error('[WA] Request failed:', e.message));
  req.write(body);
  req.end();
  // Returns immediately — fire-and-forget, never blocks API response
}

// ── Notification helpers ──────────────────────────────────

function notifyGroupInvite(invitee, invitedBy, group) {
  if (!invitee?.phone || invitee.whatsappEnabled === false) return;
  sendWhatsApp(invitee.phone,
    `👋 *SplitEase — Group Invite*\n\n` +
    `Hi ${invitee.name}! *${invitedBy.name}* invited you to join *"${group.name}"*.\n\n` +
    `Open SplitEase to accept or decline.\n_— SplitEase_`
  );
}

function notifyExpenseAdded(members, paidBy, expense, group, perPerson) {
  members.forEach((m) => {
    if (!m?.phone || m.whatsappEnabled === false) return;
    sendWhatsApp(m.phone,
      `💸 *SplitEase — New Expense*\n\n` +
      `*${paidBy.name}* paid *${fmt(expense.amount)}* for *"${expense.title}"* in *${group.name}*.\n\n` +
      `📂 Category : ${expense.category}\n` +
      `👤 Your share : *${fmt(perPerson)}*\n\n` +
      `Open SplitEase to view the breakdown.\n_— SplitEase_`
    );
  });
}

function notifySettlement(toUser, fromUser, amount, group) {
  if (!toUser?.phone || toUser.whatsappEnabled === false) return;
  sendWhatsApp(toUser.phone,
    `✅ *SplitEase — Settlement Received*\n\n` +
    `*${fromUser.name}* settled *${fmt(amount)}* with you in *${group.name}*.\n\n` +
    `Your balance has been updated. Open SplitEase to view.\n_— SplitEase_`
  );
}

function notifyInviteAccepted(owner, invitee, group) {
  if (!owner?.phone || owner.whatsappEnabled === false) return;
  sendWhatsApp(owner.phone,
    `🎉 *SplitEase — Member Joined*\n\n` +
    `*${invitee.name}* accepted your invite and joined *"${group.name}"*!\n_— SplitEase_`
  );
}

module.exports = { sendWhatsApp, notifyGroupInvite, notifyExpenseAdded, notifySettlement, notifyInviteAccepted };
