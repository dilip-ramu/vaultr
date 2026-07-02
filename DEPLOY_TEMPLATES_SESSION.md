# Deploy checklist — invoice/slip customisation session

Everything built this session: per-line GST, per-company template+accent, contracts,
and the full block-based template engine (GST invoice + reimbursable invoice + salary slip).

All migrations are **idempotent** (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`), so re-running
one you've already applied is safe.

## 1. Run migrations in Supabase (SQL editor), in order

Run each file's contents once, in this order. Skip any you've already run.

- [ ] `supabase/migration_v69_company_invoice_template.sql`
      → adds `companies.invoice_template` + `companies.invoice_accent`
- [ ] `supabase/migration_v70_contracts.sql`
      → `contract_templates`, `contract_template_versions`, `generated_contracts`
- [ ] `supabase/migration_v71_document_templates.sql`
      → `document_templates` (block-template library) + `document_template_assignments`
- [ ] `supabase/migration_v72_job_descriptions.sql`
      → `job_descriptions` (per designation, optional company override) for `{{job_description}}`
- [ ] `supabase/migration_v73_employee_employment_fields.sql`
      → `employees.reporting_manager`, `employment_country`, `employment_city`
        (`{{employee.reporting_manager}}`, `{{employee.employment_country}}`, `{{employee.employment_city}}`)

## 2. Storage buckets — nothing new to create

- Uses the existing **`vaultr-avatars`** (public) bucket for company logos.
- Uses the existing **`vaultr-attachments`** (private) bucket for contract templates,
  generated contracts, and signed branding files.
- If `vaultr-attachments` doesn't exist yet in your project, create it (private) with the
  same per-user-folder RLS pattern as your other buckets (`(storage.foldername(name))[1] = auth.uid()::text`).

## 3. Dependencies — already in package.json

- `docxtemplater` + `pizzip` (contracts). Committed in `package.json` + `package-lock.json`;
  Vercel installs them on build. No manual step if the lockfile is committed.

## 4. Ship

```
cd "<project root>"
npx tsc --noEmit          # must be clean
npm test                  # calculator + payroll suites
git add -A
git commit -m "Invoice/slip customisation: per-line GST, per-company templates, contracts, block template engine"
git push                  # Vercel auto-deploys
```

## 5. Post-deploy visual checks (do each once)

- [ ] **Per-line GST** — create a tax invoice; edit a line's HSN/CGST/SGST; confirm totals sum per line and the PDF shows per-line rates.
- [ ] **Company template + accent** — Company details → Templates: pick a layout + accent; print a tax invoice for that company.
- [ ] **Contracts** — Organization → Contracts: upload a `.docx` with `{{employee.name}}` etc. for a company + designation; on an employee row click **Contract**; confirm the downloaded doc is filled.
- [ ] **Block engine — GST invoice** — Templates hub → GST tab: create from a preset, tweak blocks, assign to a company, open that company's invoice print page; confirm the custom layout renders.
- [ ] **Block engine — reimbursable** — Templates hub → Reimbursable tab: create + assign; in the reimbursable builder click **Template PDF**.
- [ ] **Block engine — salary slip** — Templates hub → Salary slip tab: create + assign; open a slip → **Template PDF**.

## Known cosmetic limits (not blockers)

- `fontScalePct` exists in the theme but the renderer doesn't apply it yet (accent/font/margin do).
- Reimbursable print shows "—" in the INR-source column (that value isn't stored per line — same as the existing history download).
- Bulk salary-slip download + email still use the React-PDF layout (with per-company accent); the block template applies to the individual "Template PDF" view.
