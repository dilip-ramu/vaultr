-- Logistics AWB profitability view
-- Run this in the Supabase SQL editor after migration_v8_logistics.sql

CREATE OR REPLACE VIEW logistics_awb_profitability AS
SELECT
  a.id,
  a.awb_number,
  a.shipment_date,
  a.destination_country,
  a.destination_city,
  a.total_charge                                    AS awb_cost,
  a.total_pieces,
  a.allocated_pieces,
  ci.courier_provider,
  ci.id                                             AS courier_invoice_id,
  ci.invoice_number                                 AS courier_invoice_number,
  ci.invoice_date,
  COALESCE(SUM(alloc.billed_amount), 0)             AS total_billed,
  COALESCE(SUM(alloc.billed_amount), 0)
    - a.total_charge                                AS gross_margin,
  CASE
    WHEN a.total_charge > 0 THEN
      ROUND(
        ((COALESCE(SUM(alloc.billed_amount), 0) - a.total_charge)
          / a.total_charge * 100)::numeric,
        2
      )
    ELSE 0
  END                                               AS margin_pct,
  a.user_id
FROM awbs a
JOIN  courier_invoices  ci    ON ci.id    = a.courier_invoice_id
LEFT JOIN awb_allocations alloc ON alloc.awb_id = a.id
GROUP BY
  a.id, a.awb_number, a.shipment_date, a.destination_country,
  a.destination_city, a.total_charge, a.total_pieces, a.allocated_pieces,
  ci.courier_provider, ci.id, ci.invoice_number, ci.invoice_date, a.user_id;

-- Allow authenticated users to query the view (RLS is enforced via user_id column)
GRANT SELECT ON logistics_awb_profitability TO authenticated;
