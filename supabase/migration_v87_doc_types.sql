-- v87 — New GST-compliant document types (credit note, proforma invoice,
-- purchase order, delivery challan). They reuse the existing template engine, so
-- this only widens the doc_type check constraints; nothing else changes and no
-- existing template/assignment is affected. To revert, narrow the checks back
-- to the original three types.

alter table document_templates drop constraint if exists document_templates_doc_type_check;
alter table document_templates add constraint document_templates_doc_type_check
  check (doc_type in ('gst_invoice','reimbursable_invoice','salary_slip','credit_note','proforma_gst','purchase_order','delivery_challan'));

alter table document_template_assignments drop constraint if exists document_template_assignments_doc_type_check;
alter table document_template_assignments add constraint document_template_assignments_doc_type_check
  check (doc_type in ('gst_invoice','reimbursable_invoice','salary_slip','credit_note','proforma_gst','purchase_order','delivery_challan'));

notify pgrst, 'reload schema';
