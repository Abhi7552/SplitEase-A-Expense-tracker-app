// backend/services/monthlyReport.js
// Generates and sends monthly reports to users

const User = require('../models/User');
const Expense = require('../models/Expense');
const Group = require('../models/Group');
const gmail = require('./gmail');

const fmt = (n) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Generate report data for a user
async function generateUserReport(userId) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.emailNotifications.monthlyReport) return null;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const endOfMonth = new Date();
    endOfMonth.setHours(23, 59, 59, 999);

    // Get personal expenses
    const personalExpenses = await Expense.find({
      type: 'personal',
      owner: userId,
      expenseDate: { $gte: startOfMonth, $lte: endOfMonth },
    });

    // Group personal expenses by category
    const personalByCategory = {};
    let personalTotal = 0;
    personalExpenses.forEach(exp => {
      personalTotal += exp.amount;
      if (!personalByCategory[exp.category]) {
        personalByCategory[exp.category] = { total: 0, count: 0 };
      }
      personalByCategory[exp.category].total += exp.amount;
      personalByCategory[exp.category].count += 1;
    });

    const personalSummary = Object.entries(personalByCategory).map(([category, data]) => ({
      category,
      total: data.total,
      count: data.count,
    }));

    // Get user's groups
    const userGroups = await Group.find({ 'members.user': userId }).select('_id name');
    const groupIds = userGroups.map(g => g._id);

    // Get group expenses for this month
    const groupExpenses = await Expense.find({
      type: 'group',
      group: { $in: groupIds },
      expenseDate: { $gte: startOfMonth, $lte: endOfMonth },
    }).populate('group', 'name').populate('paidBy', 'name');

    // Calculate group summaries
    const groupSummaries = {};
    groupExpenses.forEach(exp => {
      const groupId = exp.group._id.toString();
      if (!groupSummaries[groupId]) {
        groupSummaries[groupId] = {
          name: exp.group.name,
          totalSpent: 0,
          yourShare: 0,
          amountPaid: 0,
        };
      }
      
      groupSummaries[groupId].totalSpent += exp.amount;
      
      // Calculate user's share
      const userShare = exp.splits.find(s => s.user.toString() === userId.toString());
      if (userShare) {
        groupSummaries[groupId].yourShare += userShare.shareAmount;
      }
      
      // Calculate amount paid by user
      if (exp.paidBy._id.toString() === userId.toString()) {
        groupSummaries[groupId].amountPaid += exp.amount;
      }
    });

    // Calculate net balance for each group
    const groupReports = Object.values(groupSummaries).map(group => ({
      ...group,
      netBalance: group.amountPaid - group.yourShare,
    }));

    return {
      personal: {
        expenses: personalSummary,
        totalAmount: personalTotal,
      },
      groups: groupReports,
    };
  } catch (err) {
    console.error('[MonthlyReport] Error generating report:', err.message);
    return null;
  }
}

// Send report to a user
async function sendReportToUser(userId, reportType = 'both') {
  try {
    const user = await User.findById(userId);
    if (!user || !user.email) return false;

    const reportData = await generateUserReport(userId);
    if (!reportData) return false;

    const result = await gmail.sendMonthlyReport(user, reportData, reportType);
    
    if (result) {
      // Update lastMonthlyReportSent
      const now = new Date();
      user.lastMonthlyReportSent = now;
      await user.save();
      console.log(`[MonthlyReport] ✅ Report sent to ${user.email}`);
    }

    return result;
  } catch (err) {
    console.error('[MonthlyReport] Error sending report:', err.message);
    return false;
  }
}

// Batch send reports to all users who haven't received one this month
async function sendMonthlyReportsToAll() {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Find users who have email notifications enabled and haven't received a report this month
    const users = await User.find({
      $or: [
        { 'lastMonthlyReportSent': null },
        { 'lastMonthlyReportSent': { $lt: startOfMonth } },
      ],
      'emailNotifications.monthlyReport': true,
    });

    let sent = 0;
    for (const user of users) {
      const result = await sendReportToUser(user._id);
      if (result) sent += 1;
    }

    console.log(`[MonthlyReport] Sent ${sent}/${users.length} reports`);
    return { sent, total: users.length };
  } catch (err) {
    console.error('[MonthlyReport] Error in batch send:', err.message);
    return { sent: 0, total: 0 };
  }
}

module.exports = {
  generateUserReport,
  sendReportToUser,
  sendMonthlyReportsToAll,
};
