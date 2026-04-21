// Run: npm run seed
require('dotenv').config();
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const connectDB = require('./db');
const User      = require('../models/User');
const Group     = require('../models/Group');
const Expense   = require('../models/Expense');
const Settlement = require('../models/Settlement');

async function seed() {
  await connectDB();

  await Promise.all([
    User.deleteMany({}),
    Group.deleteMany({}),
    Expense.deleteMany({}),
    Settlement.deleteMany({}),
  ]);
  console.log('🗑️  Cleared existing data');

  const hash = await bcrypt.hash('Password1', 10);
  const [alice, bob, carol] = await User.insertMany([
    { name: 'Alice Johnson', email: 'alice@demo.com', password: hash, avatar: '#7c6ef5' },
    { name: 'Bob Smith',     email: 'bob@demo.com',   password: hash, avatar: '#3dd68c' },
    { name: 'Carol White',   email: 'carol@demo.com', password: hash, avatar: '#f5697c' },
  ]);
  console.log('👤 Created 3 demo users');

  const group = await Group.create({
    name: 'Goa Trip 2025', description: 'Beach vacation with friends',
    color: '#7c6ef5', owner: alice._id,
    members: [
      { user: alice._id, role: 'owner' },
      { user: bob._id,   role: 'member' },
      { user: carol._id, role: 'member' },
    ],
  });
  console.log('👥 Created demo group');

  const d1 = new Date(Date.now() - 2 * 86400000);
  const d2 = new Date(Date.now() - 1 * 86400000);
  const d3 = new Date();

  await Expense.insertMany([
    {
      type: 'group', group: group._id, owner: alice._id, paidBy: alice._id,
      title: 'Hotel Booking', amount: 4500, category: 'Bills', expenseDate: d1,
      note: 'Sea-view room',
      splits: [
        { user: alice._id, shareAmount: 1500 },
        { user: bob._id,   shareAmount: 1500 },
        { user: carol._id, shareAmount: 1500 },
      ],
    },
    {
      type: 'group', group: group._id, owner: bob._id, paidBy: bob._id,
      title: 'Beach Dinner', amount: 1800, category: 'Food', expenseDate: d2,
      splits: [
        { user: alice._id, shareAmount: 600 },
        { user: bob._id,   shareAmount: 600 },
        { user: carol._id, shareAmount: 600 },
      ],
    },
    {
      type: 'personal', owner: alice._id,
      title: 'Grocery Shopping', amount: 650, category: 'Shopping', expenseDate: d3,
    },
    {
      type: 'personal', owner: alice._id,
      title: 'Metro Card', amount: 200, category: 'Transport', expenseDate: d3,
    },
  ]);
  console.log('🧾 Created demo expenses');

  console.log('\n✅ Seed complete!\n');
  console.log('  alice@demo.com  /  Password1');
  console.log('  bob@demo.com    /  Password1');
  console.log('  carol@demo.com  /  Password1\n');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
