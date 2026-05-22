# Vaultr — Setup Guide

Welcome! Follow these steps to get Vaultr running on your Mac and iPhone.
This is a one-time setup that takes about 15 minutes.

---

## Step 1 — Install Node.js (if not already)

1. Go to https://nodejs.org
2. Download the **LTS** version
3. Install it (just click through the installer)
4. Open **Terminal** on your Mac and type:
   ```
   node --version
   ```
   You should see something like `v22.x.x` — that means it worked.

---

## Step 2 — Set up Supabase (your database)

Supabase is free and gives you a database + login system in the cloud.

1. Go to **https://supabase.com** and click **Start your project**
2. Sign up with your GitHub or email
3. Click **New Project**
   - Name it: `vaultr`
   - Set a strong database password (save it somewhere safe)
   - Choose the region closest to you (e.g. Singapore for India)
4. Wait 2 minutes for it to spin up

**Copy your keys:**
5. Go to your project → **Settings** → **API**
6. You'll need:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon / public** key (a long string starting with `eyJ...`)

**Create the database tables:**
7. In Supabase, go to **SQL Editor** (left sidebar)
8. Click **New query**
9. Open the file `supabase/schema.sql` from your Vaultr folder
10. Copy ALL the text and paste it into the SQL editor
11. Click **Run** (green button) — you should see "Success. No rows returned."

**Run the V2 migration (adds family sharing, file uploads, customers, bills improvements):**
12. Click **New query** again
13. Open the file `supabase/schema_v2.sql` from your Vaultr folder
14. Copy ALL the text and paste it into the SQL editor
15. Click **Run** — you should see "Success. No rows returned."

**Set up file storage (for receipt and invoice uploads):**
16. In Supabase, go to **Storage** (left sidebar)
17. Click **New bucket**
    - Name: `vaultr-attachments`
    - Toggle: **Public bucket → OFF** (keep it private)
    - Click Create
18. Click **New bucket** again
    - Name: `vaultr-avatars`
    - Toggle: **Public bucket → ON**
    - Click Create

**Disable email confirmation (recommended for personal use):**
19. Go to **Authentication** → **Providers** → **Email**
20. Toggle **"Confirm email"** → OFF
21. Click Save

> Without this step, after signup the app will show "Check your email" and you'll need to click a confirmation link before you can log in.

---

## Step 3 — Configure your environment

1. In your Vaultr folder, find the file `.env.local.example`
2. **Duplicate** it and rename the copy to `.env.local`
3. Open `.env.local` in any text editor (TextEdit works)
4. Replace the placeholder values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Step 4 — Install dependencies and run the app

1. Open **Terminal**
2. Navigate to your Vaultr folder:
   ```
   cd ~/Documents/Claude/Projects/Finance\ Software/Vaultr
   ```
3. Install packages (one time only):
   ```
   npm install
   ```
   This downloads all the libraries. Takes 1-2 minutes.

4. Start the app:
   ```
   npm run dev
   ```

5. Open your browser and go to: **http://localhost:3000**

You should see the Vaultr login screen!

---

## Step 5 — Create your account

1. Go to http://localhost:3000/signup
2. Enter your name, email, and a password
3. You're in! Default expense and income categories are created automatically.

---

## Step 6 — Access from your iPhone (optional, same WiFi)

While the app is running on your Mac:

1. On your Mac, open Terminal and type:
   ```
   ipconfig getifaddr en0
   ```
   This gives you your local IP, like `192.168.1.5`

2. On your iPhone, open Safari and go to:
   ```
   http://192.168.1.5:3000
   ```
3. Tap the **Share** button → **Add to Home Screen** to get an app-like icon!

---

## Stopping and starting the app

- **Stop:** Press `Ctrl+C` in Terminal
- **Start again:** `npm run dev` from the Vaultr folder

---

## What's built in v2

| Feature | Status |
|---|---|
| Login / Signup | ✅ |
| Multiple accounts (checking, savings, credit, cash, investment, loan) | ✅ |
| Add expense / income / transfer | ✅ |
| 21 default categories (expense + income) | ✅ |
| Custom categories with icons and colors | ✅ |
| Dashboard — income/spent/leftover, net worth, debts & liabilities, cash flow chart | ✅ |
| Bills — received & sent tabs, payment terms, invoice number, follow-up reminders | ✅ |
| Mark bills as paid (auto-creates transaction) | ✅ |
| In-app + browser push notifications for bills due soon | ✅ |
| Customers module — name, email, phone, GST, linked invoices | ✅ |
| File uploads (receipts, invoices, PDFs up to 10MB) | ✅ |
| Activity / comment feed on transactions (Monday.com-style) | ✅ |
| Account deletion protection (blocked if transactions exist) | ✅ |
| Family sharing — invite family via link, shared household view | ✅ |
| Profile pictures + nicknames | ✅ |
| Collapsible sidebar (state saved) | ✅ |
| Search and filter transactions | ✅ |
| Mobile-first UI | ✅ |
| Cloud sync (Supabase) | ✅ |

## Family sharing — how to invite your family

1. Sign up normally at `/signup`
2. Go to **Settings** → scroll to **Family Sharing**
3. Tap **Copy Invite Link** — share that link with your wife or family member
4. They open the link on their phone, sign up, and they're automatically added to your shared household
5. All accounts, transactions, and bills are shared between household members

## Coming next (tell Claude what you want!)

- Budget planning per category
- Monthly reports and data export (CSV / PDF)
- Net worth tracker over time
- iOS app (React Native / Expo)
- Gold / real estate / asset tracking
- Multi-currency support

---

## Troubleshooting

**"Cannot find module" error:**
Run `npm install` again in the Vaultr folder.

**"Invalid API key" or blank screen:**
Check that your `.env.local` file has the correct Supabase URL and key (no extra spaces).

**Database errors:**
Make sure you ran both `supabase/schema.sql` AND `supabase/schema_v2.sql` in the Supabase SQL editor (in that order).

**File uploads not working:**
Check that you created both storage buckets (`vaultr-attachments` and `vaultr-avatars`) in Supabase → Storage. The `schema_v2.sql` migration also sets up storage policies — make sure it ran successfully.

**Port already in use:**
Stop any other running `npm run dev` instances, or use `npm run dev -- -p 3001` to use a different port.
