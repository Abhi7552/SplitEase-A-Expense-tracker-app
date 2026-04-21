# WhatsApp Setup Guide for SplitEase

This guide covers setting up WhatsApp notifications in the SplitEase app using Twilio's WhatsApp Business API.

---

## Overview

SplitEase sends WhatsApp notifications for:
- **Group Invites** — When a user is invited to join a group
- **New Expenses** — When an expense is added to a group
- **Settlements** — When a settlement is completed
- **Invite Acceptances** — When an invited member joins a group

All notifications are **fire-and-forget** (non-blocking) and only sent if the user has enabled them.

---

## Prerequisites

1. **Twilio Account** — Free or paid
   - Visit https://www.twilio.com/
   - Sign up and verify your account

2. **WhatsApp Business Account** — Linked to Twilio
   - Approved WhatsApp Business Account with Twilio
   - Active phone number for sending messages

3. **Environment Variables** — Required configuration

4. **User Phone Numbers** — Stored in the database

---

## Step 1: Create & Configure Twilio Account

### 1.1 Sign Up for Twilio
- Go to https://www.twilio.com/try-twilio
- Create an account
- Verify your email and phone number
- Complete the account setup questionnaire

### 1.2 Get Your Credentials
Once logged in:
1. Navigate to **Console Dashboard** (https://console.twilio.com/)
2. Note your:
   - **Account SID** (looks like: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
   - **Auth Token** (looks like: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

⚠️ **Security**: Never commit these credentials to Git. Use environment variables only.

---

## Step 2: Set Up WhatsApp Business Account

### 2.1 Enable WhatsApp API in Twilio
1. Go to **Messaging** → **Try it out** → **Send a WhatsApp message**
2. Follow Twilio's WhatsApp setup wizard
3. Link your WhatsApp Business Account if you have one, or Twilio will create a sandbox

### 2.2 Get Your WhatsApp Sender Number
- If using **Twilio Sandbox**: Default number provided (e.g., `whatsapp:+14155238886`)
- If using **Production**: Your approved WhatsApp Business number (e.g., `whatsapp:+91XXXXXXXXXX`)

For development/testing, Twilio provides a free sandbox number.

---

## Step 3: Configure Environment Variables

Create or update your `.env` file in the project root:

```bash
# Twilio WhatsApp Configuration
TWILIO_ACCOUNT_SID=AC...your_account_sid...
TWILIO_AUTH_TOKEN=...your_auth_token...
TWILIO_WA_FROM=whatsapp:+14155238886  # Your Twilio WhatsApp sender number

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/splitease

# Server
PORT=5000
NODE_ENV=development
```

### 3.1 Load Environment Variables in Code
The app uses `dotenv` to load `.env` automatically:
```javascript
require('dotenv').config();
```

Verify the variables are loaded in [backend/services/whatsapp.js](backend/services/whatsapp.js):
```javascript
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const FROM        = process.env.TWILIO_WA_FROM;
```

---

## Step 4: Collect User Phone Numbers

### 4.1 User Schema
Users can store their phone number in the database. The schema includes:

```javascript
{
  phone: String,              // E.g., "919876543210" (country code + number, digits only)
  whatsappEnabled: Boolean    // Opt-in/out flag (default: true)
}
```

### 4.2 Add Phone Number to User Profile
Users need to:
1. Log in to SplitEase
2. Go to **Settings/Profile**
3. Add their WhatsApp phone number (with country code, digits only)
   - Example: `919876543210` (India: +91 9876543210)
   - Example: `14155552671` (US: +1 415-555-2671)
4. Keep **WhatsApp Notifications** enabled (toggle)

---

## Step 5: Verify WhatsApp Setup (Sandbox Mode)

### 5.1 Add Receiver Numbers to Twilio Sandbox
For **Twilio Sandbox testing**, you must join the sandbox first:

1. Go to **Messaging** → **Settings** → **WhatsApp Sandbox Settings**
2. You'll see a join message format, e.g.:
   ```
   Send the message "join ANCIENT-TOWN" to +14155238886
   ```
3. Send this message from your WhatsApp account
4. You'll receive a confirmation: "You have joined the Twilio WhatsApp sandbox"
5. Now your number is registered in the sandbox

### 5.2 Add Teammate Numbers (Optional)
Repeat step 5.1 for any team members you want to test with.

---

## Step 6: Database Setup

### 6.1 Connect MongoDB
Ensure MongoDB connection is configured:
```javascript
// backend/config/db.js
const uri = process.env.MONGODB_URI;
mongoose.connect(uri, options);
```

### 6.2 Seed Sample Data (Optional)
Run the seeding script to create test users:
```bash
npm run seed
```

This populates the database with test groups, users, and expenses.

---

## Step 7: Test the WhatsApp Notifications

### 7.1 Start the Server
```bash
npm run dev  # Development with hot reload
# or
npm start   # Production
```

### 7.2 Create a Test Scenario

1. **User A invites User B to a Group**
   - Create a new group as User A
   - Click "Invite Members"
   - Select User B (ensure User B has WhatsApp enabled and phone number set)
   - User B receives WhatsApp notification:
     ```
     👋 *SplitEase — Group Invite*

     Hi [User B]! *[User A]* invited you to join *"[Group Name]"*.

     Open SplitEase to accept or decline.
     — SplitEase
     ```

2. **User A adds an Expense**
   - Add a new expense in the group
   - All group members (with WhatsApp enabled) receive:
     ```
     💸 *SplitEase — New Expense*

     *[User A]* paid *₹100.00* for *"Dinner"* in *[Group Name]*.

     📂 Category : Food
     👤 Your share : *₹25.00*

     Open SplitEase to view the breakdown.
     — SplitEase
     ```

3. **User B Accepts Invite**
   - User A receives:
     ```
     🎉 *SplitEase — Member Joined*

     *[User B]* accepted your invite and joined *"[Group Name]"*!
     — SplitEase
     ```

4. **User A Settles with User B**
   - Record a settlement
   - User B receives:
     ```
     ✅ *SplitEase — Settlement Received*

     *[User A]* settled *₹50.00* with you in *[Group Name]*.

     Your balance has been updated. Open SplitEase to view.
     — SplitEase
     ```

---

## Step 8: Production Deployment

### 8.1 Use Approved WhatsApp Business Account
1. Apply for WhatsApp Business Account with Meta/WhatsApp
2. Link it to your Twilio account
3. Replace sandbox number with your approved business number in `TWILIO_WA_FROM`

### 8.2 Environment Variables on Production Server
Set these on your hosting platform (e.g., Render, Heroku, AWS):
```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WA_FROM=whatsapp:+91...
MONGODB_URI=mongodb+srv://...
```

### 8.3 Monitor WhatsApp Delivery
- Check Twilio Console → **Messaging** → **Logs**
- View delivery status and error messages
- Monitor billing (WhatsApp messages are metered)

---

## Step 9: Troubleshooting

### Issue: "Skipped (Twilio not configured)"
**Solution**: Check that all three environment variables are set:
```bash
echo $TWILIO_ACCOUNT_SID
echo $TWILIO_AUTH_TOKEN
echo $TWILIO_WA_FROM
```
If empty, restart your server after updating `.env`.

### Issue: Messages not sent to user
**Possible causes**:
- User has `whatsappEnabled: false` in their profile
- User phone number is not set or invalid
- In sandbox mode: User's number not added to sandbox
- Invalid phone number format (should be digits only with country code)

**Solution**:
1. Check user profile: phone number and `whatsappEnabled` status
2. Verify in Twilio Sandbox: Is the number registered?
3. Check Twilio logs for error details

### Issue: "Twilio error 400" or "Invalid phone"
**Solution**: Ensure phone numbers include country code and are digits only:
- ✅ Correct: `919876543210` (India)
- ✅ Correct: `14155552671` (US)
- ❌ Wrong: `+91-9876543210` (has formatting)
- ❌ Wrong: `+1 415-555-2671` (has formatting)

### Issue: Sandbox expired
**Solution**: Twilio sandbox numbers expire after 72 hours of inactivity. Rejoin:
1. Send `join ANCIENT-TOWN` to the sandbox number again
2. Wait for confirmation

---

## Implementation Details

### Notification Triggers
These routes trigger WhatsApp notifications:

| Event | Route | Function |
|-------|-------|----------|
| Invite Group Member | `POST /api/groups/:id/invite` | `notifyGroupInvite()` |
| Add Expense | `POST /api/expenses` | `notifyExpenseAdded()` |
| Accept Invite | `PUT /api/groups/:id/accept` | `notifyInviteAccepted()` |
| Record Settlement | `POST /api/settlements` | `notifySettlement()` |

### WhatsApp Service Functions
Location: [backend/services/whatsapp.js](backend/services/whatsapp.js)

- `sendWhatsApp(toPhone, message)` — Core sender, validates config, normalizes phone
- `notifyGroupInvite(invitee, invitedBy, group)` — Invite notification
- `notifyExpenseAdded(members, paidBy, expense, group, perPerson)` — Expense notification
- `notifySettlement(toUser, fromUser, amount, group)` — Settlement notification
- `notifyInviteAccepted(owner, invitee, group)` — Acceptance notification

### User Opt-Out
Users can disable notifications via `whatsappEnabled` toggle in their profile. No messages are sent if `whatsappEnabled === false` or phone is not set.

---

## Security Best Practices

1. **Never commit credentials** to Git
   - Use `.env` files (add to `.gitignore`)
   - Use environment variables on production servers

2. **Protect Auth Token**
   - Rotate tokens periodically in Twilio console
   - Don't expose in logs or error messages

3. **Validate phone numbers** server-side
   - Strip non-digits before sending
   - Prevent injection attacks

4. **Rate limiting** (already configured)
   - Express rate limiter prevents abuse
   - Twilio has built-in rate limits

5. **Monitor costs**
   - Check Twilio billing regularly
   - Set up alerts for unexpected usage

---

## Support & Resources

- **Twilio WhatsApp API Docs**: https://www.twilio.com/docs/whatsapp
- **Twilio Console**: https://console.twilio.com/
- **WhatsApp Business Docs**: https://developers.facebook.com/docs/whatsapp/on-premises-api/

---

## Summary Checklist

- [ ] Create Twilio account
- [ ] Get Account SID and Auth Token
- [ ] Set up WhatsApp Sandbox or link Business Account
- [ ] Get WhatsApp sender number
- [ ] Configure `.env` with Twilio credentials
- [ ] Connect MongoDB Atlas
- [ ] Collect user phone numbers (with country codes)
- [ ] Test WhatsApp sandbox (join sandbox first)
- [ ] Create test scenario and verify notifications
- [ ] Deploy to production with business account
- [ ] Set up monitoring and error handling
- [ ] Document phone number format for users

---

**Created**: April 2026  
**Last Updated**: April 21, 2026
