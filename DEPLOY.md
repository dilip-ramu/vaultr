# Deploying Vaultr to Vercel

## Before you push to GitHub

### 1. Run all schema migrations in Supabase
Open your Supabase project → SQL Editor and run each file **in order**:
1. `supabase/schema.sql`
2. `supabase/schema_v2.sql`
3. `supabase/schema_v3.sql`
4. `supabase/schema_v4.sql`
5. `supabase/schema_v5.sql`  ← adds `transactions.name` + rebuilds account_balances view

### 2. Configure Supabase Storage
In Supabase → Storage, ensure the `vaultr-avatars` bucket exists and is **public**.

Add these RLS policies on the bucket if not already present (Storage → Policies):

```sql
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload own avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'vaultr-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read
CREATE POLICY "Public read avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'vaultr-avatars');

-- Allow users to update/delete their own files
CREATE POLICY "Users can update own avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'vaultr-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own avatars"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'vaultr-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
```

Also create the `attachments` bucket (public) with the same policy pattern if you use file uploads on transactions/bills.

### 3. Disable email confirmation (optional, for easy sign-up)
Supabase → Authentication → Email → disable "Enable email confirmations"

---

## Push to GitHub

```bash
cd /path/to/vaultr
git init
git add .
git commit -m "Initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/vaultr.git
git push -u origin main
```

> `.env.local` is in `.gitignore` — your keys will NOT be pushed.

---

## Deploy on Vercel

### 1. Import the project
1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Click **Deploy** — it will fail the first time (no env vars yet), that's fine

### 2. Add environment variables
In Vercel → Your Project → **Settings → Environment Variables**, add:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

Both values are in Supabase → **Settings → API**.

Then go to **Deployments** and click **Redeploy**.

### 3. Add your custom domain
In Vercel → Your Project → **Settings → Domains**:
1. Click **Add Domain**
2. Enter your domain (e.g. `vaultr.app` or `finance.yourdomain.com`)
3. Follow the DNS instructions Vercel shows — typically add an `A` record or `CNAME` at your registrar

Vercel issues a free SSL certificate automatically.

---

## Update Supabase Auth for production

After your domain is live, go to **Supabase → Authentication → URL Configuration**:

- **Site URL**: `https://yourdomain.com`
- **Redirect URLs**: add `https://yourdomain.com/**`

This ensures email magic links and OAuth redirects go to your live domain, not localhost.

---

## Checklist before sharing the URL

- [ ] All 5 schema migrations run in Supabase
- [ ] Storage bucket `vaultr-avatars` exists and is public
- [ ] Environment variables set in Vercel
- [ ] Vercel deployment shows **Ready** (green)
- [ ] Custom domain resolves and shows the login page
- [ ] Supabase Site URL updated to your domain
- [ ] Test: sign up, create an account, add a transaction, delete it

---

## Ongoing deployments

Every `git push` to `main` triggers an automatic redeploy on Vercel — no further steps needed.
