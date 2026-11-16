-- v132 — an invoice line knows which order it belongs to
--
-- WHY
--
-- One invoice often covers two customer POs, and one PO is often invoiced in
-- two goes. The order lived on the invoice HEADER, so neither was possible:
-- an invoice belonged to one order or to none, and a shared invoice would
-- have counted in full against whichever order it was tied to.
--
-- The line is where the money actually is, so the line carries the order.
-- A shared invoice needs no hand-entered split: the amounts follow the lines.
--
-- The header's order_id stays. It still records which order the invoice was
-- RAISED from, which is what the attach picker and the older screens read.
-- The totals now come from the lines.
--
-- Re-runnable.

ALTER TABLE recoverable_invoice_lines
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  -- Which ORDER LINE it bills, so a second invoice on a part shipment knows
  -- how many pieces of that line are already billed and offers only the rest.
  ADD COLUMN IF NOT EXISTS order_line_id UUID REFERENCES order_lines(id) ON DELETE SET NULL;

-- The order sheet asks 'what has been invoiced against me', so the index is
-- on the order.
CREATE INDEX IF NOT EXISTS idx_ril_order ON recoverable_invoice_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_ril_order_line ON recoverable_invoice_lines(order_line_id);

-- Backfill: every line of an invoice that was raised from an order belongs to
-- that order. Without this, every invoice already raised would read as
-- untagged and the orders would show nothing invoiced.
UPDATE recoverable_invoice_lines l
   SET order_id = i.order_id
  FROM recoverable_invoices i
 WHERE l.invoice_id = i.id
   AND i.order_id IS NOT NULL
   AND l.order_id IS NULL;

NOTIFY pgrst, 'reload schema';
