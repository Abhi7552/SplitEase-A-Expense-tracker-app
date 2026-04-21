# SplitEase — Full Stack Expense Tracker
### Node.js + Express + MongoDB Atlas + Vanilla JS Frontend

---

## Table of Contents
1. [Project Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [MongoDB Atlas Setup](#mongodb-atlas-setup)
5. [Local Development Setup](#local-development-setup)
6. [Environment Variables](#environment-variables)
7. [API Reference](#api-reference)
8. [Data Models](#data-models)
9. [Balance Algorithm](#balance-algorithm)
10. [Scalability for 100 Users](#scalability)
11. [Deployment Guide](#deployment-guide)
12. [Security Features](#security-features)

---

## Overview

SplitEase is a production-ready multi-user expense tracking web app. Users can:
- Track **personal expenses** with categories and date filtering
- Create **groups** and invite other registered users
- Add **shared group expenses** split equally among selected members
- View **live balance computations** — who owes whom and how much
- Record **settlements** to clear debts
- Accept or decline **group invites** from the dashboard

All data is stored in **MongoDB Atlas** (cloud-hosted MongoDB). The backend is a REST API built with Express.js, served alongside the frontend as a single Node.js process.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js 4 |
| Database | MongoDB Atlas (Mongoose ODM) |
| Auth | JWT (httpOnly cookie) + bcryptjs |
| Validation | express-validator |
| Security | helmet, cors, express-rate-limit |
| Frontend | Vanilla HTML + CSS + JavaScript |
| Fonts | Google Fonts (Syne + DM Sans) |

---

## Project Structure

```
splitease-mongo/
├── server.js                    # Express entry point
├── package.json
├── .env.example                 # Copy to .env and fill in values
│
├── backend/
│   ├── config/
│   │   ├── db.js                # MongoDB Atlas connection
│   │   └── seed.js              # Demo data seeder
│   │
│   ├── middleware/
│   │   └── auth.js              # JWT protect middleware
│   │
│   ├── models/
│   │   ├── User.js              # User schema + password hashing
│   │   ├── Group.js             # Group + members + invites
│   │   ├── Expense.js           # Personal & group expenses
│   │   └── Settlement.js        # Debt settlement records
│   │
│   └── routes/
│       ├── auth.js              # /api/auth/*
│       ├── groups.js            # /api/groups/*
│       ├── expenses.js          # /api/expenses/*
│       ├── settlements.js       # /api/settlements/*
│       └── users.js             # /api/users/*
│
└── frontend/
    ├── index.html               # App shell
    ├── css/
    │   └── style.css            # Full responsive dark theme
    └── js/
        ├── api.js               # Centralized fetch client
        └── app.js               # All UI logic
```

---

## MongoDB Atlas Setup

### Step 1 — Create a free cluster
1. Go to [https://cloud.mongodb.com](https://cloud.mongodb.com)
2. Sign up / log in → Click **"Build a Database"**
3. Choose **M0 Free Tier** → Select your region → Click **"Create"**

### Step 2 — Create a database user
1. In the sidebar click **Database Access** → **Add New Database User**
2. Choose **Password** authentication
3. Enter a username (e.g. `splitease_user`) and a strong password
4. Under "Database User Privileges" select **Read and write to any database**
5. Click **Add User**

### Step 3 — Whitelist your IP
1. In the sidebar click **Network Access** → **Add IP Address**
2. For development: click **"Allow Access from Anywhere"** (0.0.0.0/0)
3. For production: add your server's specific IP address
4. Click **Confirm**

### Step 4 — Get your connection string
1. Go to **Database** → Click **Connect** on your cluster
2. Choose **Connect your application**
3. Select **Node.js** driver, version **5.5 or later**
4. Copy the connection string — it looks like:
   ```
   mongodb+srv://splitease_user:<password>@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<password>` with your actual password
6. Add your database name before the `?`:
   ```
   mongodb+srv://splitease_user:yourpassword@cluster0.abc123.mongodb.net/splitease?retryWrites=true&w=majority
   ```

---

## Local Development Setup

### Prerequisites
- Node.js 18 or higher (`node --version`)
- npm 8 or higher (`npm --version`)
- A MongoDB Atlas account (free tier is enough)

### Steps

```bash
# 1. Navigate into the project
cd splitease-mongo

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Now edit .env with your MongoDB URI and JWT secrets

# 4. (Optional) Seed demo data
npm run seed

# 5. Start the development server
npm run dev

# App is now running at http://localhost:5000
```

### Demo accounts after seeding
| Email | Password |
|-------|----------|
| alice@demo.com | password |
| bob@demo.com | password |
| carol@demo.com | password |

> Open the app in two different browser profiles to simulate two users simultaneously.

---

## Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```env
# MongoDB Atlas URI — required
MONGO_URI=mongodb+srv://user:pass@cluster0.abc.mongodb.net/splitease?retryWrites=true&w=majority

# JWT secret — use a long random string (32+ chars)
JWT_SECRET=replace_with_long_random_string_at_least_32_chars

# JWT expiry
JWT_EXPIRES_IN=7d

# Server port
PORT=5000

# Environment
NODE_ENV=development

# Frontend URL (used for CORS)
CLIENT_URL=http://localhost:5000
```

**Generating secure JWT secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## API Reference

All routes (except auth) require a valid JWT sent as an `httpOnly` cookie named `token`, set automatically on login.

### Auth

| Method | Endpoint | Description | Body |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Create account | `{ name, email, password }` |
| POST | `/api/auth/login` | Sign in | `{ email, password }` |
| POST | `/api/auth/logout` | Sign out | — |
| GET | `/api/auth/me` | Get current user | — |

### Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/groups` | List my groups (with expense counts) |
| POST | `/api/groups` | Create a group |
| GET | `/api/groups/:id` | Get group detail (members, invites) |
| DELETE | `/api/groups/:id` | Delete group (owner only) |
| POST | `/api/groups/:id/invite` | Invite user by email |
| POST | `/api/groups/:id/invite/:inviteId/respond` | Accept/reject invite |
| GET | `/api/groups/:id/balances` | Compute balances & settlement transactions |

### Expenses

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses` | List expenses (supports `?type`, `?groupId`, `?category`, `?page`, `?limit`) |
| POST | `/api/expenses` | Add expense (personal or group) |
| GET | `/api/expenses/summary` | Aggregated stats for dashboard |
| GET | `/api/expenses/:id` | Get single expense |
| DELETE | `/api/expenses/:id` | Delete expense (payer/owner only) |

**POST /api/expenses body (group):**
```json
{
  "type": "group",
  "groupId": "...",
  "title": "Hotel Booking",
  "amount": 4500,
  "category": "Bills",
  "expenseDate": "2025-04-18",
  "note": "Sea-view room",
  "splitAmong": ["userId1", "userId2", "userId3"]
}
```

**POST /api/expenses body (personal):**
```json
{
  "type": "personal",
  "title": "Grocery Shopping",
  "amount": 650,
  "category": "Shopping",
  "expenseDate": "2025-04-18",
  "note": ""
}
```

### Settlements

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/settlements` | Record a settlement |
| GET | `/api/settlements?groupId=` | List settlements for a group |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/search?email=` | Find user by email |
| GET | `/api/users/invites` | Get my pending group invites |

---

## Data Models

### User
```js
{
  _id: ObjectId,
  name: String,          // max 100 chars
  email: String,         // unique, lowercase
  password: String,      // bcrypt hash (never returned in responses)
  avatar: String,        // hex color for avatar background
  createdAt: Date,
  updatedAt: Date
}
```

### Group
```js
{
  _id: ObjectId,
  name: String,
  description: String,
  color: String,         // hex color
  owner: ObjectId,       // ref: User
  members: [
    { user: ObjectId, role: 'owner'|'member', joinedAt: Date }
  ],
  invites: [
    { invitee: ObjectId, invitedBy: ObjectId, status: 'pending'|'accepted'|'rejected', createdAt: Date }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

### Expense
```js
{
  _id: ObjectId,
  type: 'personal'|'group',
  group: ObjectId,         // ref: Group (group expenses only)
  owner: ObjectId,         // ref: User (who created it)
  paidBy: ObjectId,        // ref: User (who paid, group expenses)
  title: String,
  amount: Number,
  category: 'Food'|'Transport'|'Shopping'|'Entertainment'|'Health'|'Bills'|'Other',
  expenseDate: Date,
  note: String,
  splits: [
    { user: ObjectId, shareAmount: Number }  // pre-computed equal shares
  ],
  createdAt: Date,
  updatedAt: Date
}
```

### Settlement
```js
{
  _id: ObjectId,
  group: ObjectId,       // ref: Group
  fromUser: ObjectId,    // ref: User (who paid)
  toUser: ObjectId,      // ref: User (who received)
  amount: Number,
  note: String,
  createdAt: Date
}
```

---

## Balance Algorithm

Balances are computed on-the-fly in `/api/groups/:id/balances` using this approach:

**Step 1 — Net balance per member:**
```
net = total_paid - total_share_owed + settlements_sent - settlements_received
```

**Step 2 — Minimum transactions algorithm:**
1. Separate members into **creditors** (net > 0) and **debtors** (net < 0)
2. Sort creditors descending, debtors ascending
3. Greedily match the largest creditor with the largest debtor
4. Record a transaction for `min(creditor.net, abs(debtor.net))`
5. Reduce both balances and advance pointer if one reaches zero
6. Repeat until all balanced

This minimizes the number of payments needed across a group. For N members, worst case is N-1 transactions.

---

## Scalability

### For ~100 users: Absolutely ready. Here's why:

| Concern | Solution in this app |
|---------|---------------------|
| **Concurrent connections** | MongoDB Atlas M0 supports 500 connections; connection pool set to 20 |
| **Query performance** | All foreign key fields indexed (`owner`, `group`, `paidBy`, `splits.user`) |
| **Auth overhead** | JWT is stateless — no DB lookup on every request |
| **Rate limiting** | 200 req/15min per IP for API; 20 req/15min for auth endpoints |
| **Payload size** | JSON body limited to 10kb |
| **Balance computation** | In-memory algorithm, O(N log N) — fast even for 50-member groups |

### MongoDB Atlas tier guide for your user count:

| Users | Recommended Tier | Monthly Cost |
|-------|-----------------|-------------|
| Up to ~100 | **M0 Free** or M2 | $0–$9 |
| 100–500 | **M10** | ~$57 |
| 500–2000 | **M20** | ~$114 |
| 2000+ | M30+ with sharding | $200+ |

**M0 Free is sufficient for 100 users** if activity is moderate (a few hundred expenses/day).

### To scale further:
1. Add **Redis** for caching balance computations
2. Add **indexes** on `expenseDate` range queries
3. Move balance computation to a **background job** for very large groups
4. Use MongoDB Atlas **auto-scaling** on M10+

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| **Password hashing** | bcryptjs with 10 salt rounds |
| **Auth tokens** | JWT in `httpOnly` cookie (not accessible to JS) |
| **Input validation** | express-validator on all POST routes |
| **Rate limiting** | 200 req/15min API; 20 req/15min auth |
| **Security headers** | helmet.js (XSS, clickjacking, MIME sniffing protection) |
| **CORS** | Restricted to `CLIENT_URL` origin with credentials |
| **Authorization** | Every route checks group membership before data access |
| **Body size limit** | 10kb max JSON payload |
| **SQL injection** | N/A — MongoDB with Mongoose ODM |
| **NoSQL injection** | Mongoose sanitizes query input |

---

## Common Issues

**"MongoServerError: bad auth"**
→ Check your Atlas username/password in `MONGO_URI`. Make sure the password doesn't contain special characters that need URL-encoding (use `encodeURIComponent()` if needed).

**"MongooseServerSelectionError: connect ECONNREFUSED"**
→ Your IP is not whitelisted in Atlas Network Access. Add `0.0.0.0/0` for development.

**JWT token not being sent**
→ Ensure `credentials: 'include'` is set in all fetch calls (already handled in `api.js`). In production, `NODE_ENV=production` must be set for the `Secure` cookie flag.

**Cannot find module 'dotenv'**
→ Run `npm install` first.

---

*Built as a production-ready client deliverable. MIT licensed — modify and deploy freely.*
