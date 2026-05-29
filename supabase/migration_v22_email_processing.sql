-- ── Migration v22: Email Processing — AI extraction + auto supplier invoice creation ──

-- Update email_documents status to support new statuses
ALTER TABLE email_documents DROP CONSTRAINT IF EXISTS email_documents_status_check;
ALTER TABLE email_documents ADD CONSTRAINT email_documents_status_check
  CHECK (status IN ('new','reviewed','processed','ignored','processing','invoice_created','needs_review','duplicate_suspected'));

-- Add extraction fields to email_documents
ALTER TABLE email_documents
  ADD COLUMN IF NOT EXISTS extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS extracted_supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS extracted_invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS extracted_invoice_date TEXT,
  ADD COLUMN IF NOT EXISTS extracted_due_date TEXT,
  ADD COLUMN IF NOT EXISTS extracted_currency TEXT,
  ADD COLUMN IF NOT EXISTS extracted_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS extracted_gst_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS extracted_reference TEXT,
  ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS renamed_filename TEXT,
  ADD COLUMN IF NOT EXISTS supplier_invoice_id UUID REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processing_error TEXT;

-- Add auto-import tracking to supplier_invoices
ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS source_email_document_id UUID REFERENCES email_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_imported BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS import_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC;
