CREATE TABLE IF NOT EXISTS email_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'yahoo',
  email_address TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, email_address)
);
ALTER TABLE email_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own integrations" ON email_integrations USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS monitored_senders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, email)
);
ALTER TABLE monitored_senders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own senders" ON monitored_senders USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS email_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES email_integrations(id) ON DELETE SET NULL,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  email_subject TEXT,
  email_body TEXT,
  attachment_name TEXT,
  attachment_url TEXT,
  storage_path TEXT,
  received_at TIMESTAMPTZ,
  status TEXT DEFAULT 'new' CHECK (status IN ('new','reviewed','processed','ignored')),
  is_duplicate BOOLEAN DEFAULT false,
  email_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE email_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own documents" ON email_documents USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE INDEX IF NOT EXISTS idx_email_docs_user_status ON email_documents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_email_docs_received ON email_documents(user_id, received_at DESC);
