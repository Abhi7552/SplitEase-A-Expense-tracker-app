// backend/services/gmail.js
// Gmail notifications via Nodemailer
// Sends email notifications for invites, expenses, settlements, and monthly reports

const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

let transporter = null;

const configured = () => !!(GMAIL_USER && GMAIL_APP_PASSWORD);

// Initialize transporter
function initTransporter() {
  if (!transporter && configured()) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

// Generic email sender
async function sendEmail(to, subject, htmlContent) {
  const mail = initTransporter();
  if (!mail) {
    console.log('[Gmail] Skipped (Gmail not configured)');
    return false;
  }
  if (!to) return false;

  try {
    await mail.sendMail({
      from: GMAIL_USER,
      to,
      subject,
      html: htmlContent,
    });
    console.log(`[Gmail] ✅ Email sent to ${to} — Subject: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[Gmail] ❌ Failed to send email to ${to}:`, err.message);
    return false;
  }
}

// ── Notification helpers ──────────────────────────────

function notifyGroupInvite(invitee, invitedBy, group) {
  if (!invitee?.email) return;
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You're Invited to a Group on SplitEase! 👋</h2>
      <p>Hi ${invitee.name},</p>
      <p><strong>${invitedBy.name}</strong> has invited you to join the group <strong>"${group.name}"</strong> on SplitEase.</p>
      <p>Open <a href="https://splitease-a-expense-tracker-app.onrender.com/">SplitEase</a> to view and accept or decline this invitation.</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">— SplitEase Team</p>
    </div>
  `;
  
  return sendEmail(invitee.email, `${invitedBy.name} invited you to "${group.name}"`, htmlContent);
}

function notifyExpenseAdded(members, paidBy, expense, group, perPerson) {
  members.forEach((m) => {
    if (!m?.email) return;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Expense Added 💸</h2>
        <p>Hi ${m.name},</p>
        <p><strong>${paidBy.name}</strong> added a new expense in <strong>"${group.name}"</strong>:</p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <p><strong>Expense:</strong> ${expense.title}</p>
          <p><strong>Amount:</strong> ₹${Number(expense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p><strong>Category:</strong> ${expense.category}</p>
          <p><strong>Your Share:</strong> ₹${Number(perPerson).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <p>Log in to <a href="https://splitease-a-expense-tracker-app.onrender.com/login">SplitEase</a> to view the complete breakdown.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="font-size: 12px; color: #666;">— SplitEase Team</p>
      </div>
    `;
    
    sendEmail(m.email, `New expense in "${group.name}": ${expense.title}`, htmlContent);
  });
}

function notifySettlement(toUser, fromUser, amount, group) {
  if (!toUser?.email) return;
  
  const formattedAmount = Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Settlement Received ✅</h2>
      <p>Hi ${toUser.name},</p>
      <p><strong>${fromUser.name}</strong> has settled with you in <strong>"${group.name}"</strong>:</p>
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Amount:</strong> ₹${formattedAmount}</p>
      </div>
      <p>Your balance has been updated. Log in to <a href="https://splitease-a-expense-tracker-app.onrender.com/login">SplitEase</a> to view details.</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">— SplitEase Team</p>
    </div>
  `;
  
  return sendEmail(toUser.email, `${fromUser.name} settled ₹${formattedAmount} with you`, htmlContent);
}

function notifyInviteAccepted(owner, invitee, group) {
  if (!owner?.email) return;
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${invitee.name} Joined Your Group 🎉</h2>
      <p>Hi ${owner.name},</p>
      <p><strong>${invitee.name}</strong> has accepted your invitation and joined <strong>"${group.name}"</strong>!</p>
      <p>Log in to <a href="https://splitease-a-expense-tracker-app.onrender.com/login">SplitEase</a> to view the updated group members.</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">— SplitEase Team</p>
    </div>
  `;
  
  return sendEmail(owner.email, `${invitee.name} joined "${group.name}"`, htmlContent);
}

// Monthly report email
function sendMonthlyReport(user, reportData, reportType = 'both') {
  if (!user?.email) return;
  
  let tableHTML = '';
  
  // Personal expenses
  if ((reportType === 'personal' || reportType === 'both') && reportData.personal.expenses.length > 0) {
    tableHTML += `
      <h3>📊 Personal Expenses Summary</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
        <tr style="background-color: #f0f0f0;">
          <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Category</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">Amount</th>
          <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">Count</th>
        </tr>
        ${reportData.personal.expenses.map(exp => `
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;">${exp.category}</td>
            <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">₹${Number(exp.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${exp.count}</td>
          </tr>
        `).join('')}
      </table>
      <p><strong>Total Personal Expenses:</strong> ₹${Number(reportData.personal.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
    `;
  }
  
  // Group expenses
  if ((reportType === 'group' || reportType === 'both') && reportData.groups.length > 0) {
    tableHTML += `<h3>👥 Group Expenses Summary</h3>`;
    reportData.groups.forEach(group => {
      tableHTML += `
        <div style="background-color: #f9f9f9; padding: 15px; margin: 10px 0; border-radius: 5px;">
          <h4>${group.name}</h4>
          <p><strong>Total Spent:</strong> ₹${Number(group.totalSpent).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
          <p><strong>Your Share:</strong> ₹${Number(group.yourShare).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
          <p><strong>Amount Paid:</strong> ₹${Number(group.amountPaid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
          <p><strong>Net Balance:</strong> ${group.netBalance > 0 ? '⬆️ +' : '⬇️ '}₹${Number(Math.abs(group.netBalance)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
      `;
    });
  }
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>📈 Monthly Report — ${new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</h2>
      <p>Hi ${user.name},</p>
      <p>Here's your monthly expense summary on SplitEase:</p>
      ${tableHTML}
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">— SplitEase Team</p>
    </div>
  `;
  
  const month = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  return sendEmail(user.email, `SplitEase Monthly Report — ${month}`, htmlContent);
}

module.exports = {
  sendEmail,
  notifyGroupInvite,
  notifyExpenseAdded,
  notifySettlement,
  notifyInviteAccepted,
  sendMonthlyReport,
};
