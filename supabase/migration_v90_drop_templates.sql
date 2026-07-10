-- ── Migration v90: retire editable document templates ───────────────────────
-- Every downloadable document now uses the single built-in design (accent per
-- company). The block-based template editor and its storage are removed.
--
-- NOTE: this drops the template tables. The issued-document tables
-- (`documents`, `document_lines`) are NOT touched — those hold real credit
-- notes, debit notes, proformas, POs and challans and must remain.

DROP TABLE IF EXISTS document_template_assignments CASCADE;
DROP TABLE IF EXISTS document_templates CASCADE;
