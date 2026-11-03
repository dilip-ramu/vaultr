# Orders and per-order P/L — build plan

Written 3 Nov 2026, decisions settled 3 Nov. Phase 1 in progress.

**Decided:** the record is called an **Order**. One customer per order. Duty
drawback is a plain percentage, no per-unit cap. Only you can see any of it,
so no permission work.

Because "order" already means two documents, the app always writes those two
out in full — **Sales order** and **Purchase order**, never just "order". A
bare "Order" always means this record.

---

## 1. What is wrong today

Inex can already make every piece of paper in your trade: quotation, sales
order, proforma, delivery challan, customer invoice, purchase order, supplier
bill, credit and debit note. The pieces are good. The problem is that **they
never meet**.

Looking at the code:

- `document_links` chains documents, but it has a **sell chain** (quote → SO →
  proforma → challan → invoice) and a separate **buy chain** (PO → supplier
  bill → debit note). Nothing joins the two. The app has no idea that *this*
  purchase order was raised to fill *that* sales order.
- `Profitability` is a whole-business cashflow view — money expected against
  money received, across everything. It cannot tell you what you made on one
  order.
- There is nowhere to put the customer's PO at all. It is the document that
  starts the whole job, and today it lives in your email.
- There is no cost side: freight, clearing, inspection, bank charges, transport
  all land in Transactions as plain expenses, attached to nothing.
- Duty drawback does not exist anywhere in the app.

So the question "did I make money on the Pengvin order?" cannot be answered by
the software. That is the gap.

---

## 2. The one new idea: an Order

One record per customer PO. Everything else hangs off it.

An Order is not a new document. It is the **spine** that the documents you
already make get clipped to:

```
                 ┌─────────── ORDER ───────────┐
                 │  Customer PO  PNG/2026/118  │
                 │  Stage: Shipped             │
                 └──┬───────────────────────┬──┘
     sell side      │                       │     buy side
   ────────────────▼──                    ──▼──────────────────
   Sales order / confirmation             Purchase order(s)
   Proforma                               Supplier bill(s)
   Delivery challan(s)                    Debit note(s)
   Customer invoice(s)
                       │               │
                       └──► P/L sheet ◄┘
                            + costs
                            + duty drawback
                            + money in / money out dates
```

Why this and not something cleverer: it is **additive**. Three small new tables
and one new column on four existing ones. Nothing that works today changes.

### The naming clash, and how it is handled

"Order" already means two documents. So on every screen those two are written
out in full — "Sales order", "Purchase order" — and a bare "Order" always
means this record. In the code the table is `orders`; the documents stay
`doc_type = 'sales_order' | 'purchase_order'` as they are today.

---

## 3. The flow, matching how you actually work

| Your step | What the app does |
|---|---|
| Customer sends a PO | **New order.** Enter their PO number and date, attach the PDF, pick the customer, enter the styles/quantities/rates. Stage: *Confirmed*. |
| You make an SO / sales confirmation | One button on the order. The SO is pre-filled from the order's lines. Stage stays *Confirmed*. |
| You negotiate and confirm the supplier price | Enter the supplier's agreed rates on the order's **cost side**. This is the moment the P/L becomes real — before this it is a guess. |
| You raise a PO to the supplier | One button. Pre-filled from the cost side. Stage: *Ordered*. More than one supplier is fine — an order can hold several POs. |
| Goods ship | Delivery challan / shipping docs from the order. Stage: *Shipped*. The order now knows how much of the PO quantity is still to go. |
| Supplier invoices you | Supplier bill booked against the order. Planned cost becomes actual cost. |
| You invoice the customer | Customer invoice from the order. Stage: *Invoiced*. |
| Money moves | Supplier paid, customer pays, drawback lands. Each one recorded as it happens. |
| Done | **Close the order.** Stage: *Closed*, sheet locked. |

Stages: `Enquiry → Confirmed → Ordered → Shipped → Invoiced → Closed`, plus
`Cancelled`. Six stages, not twelve. You can always jump backwards.

---

## 4. The P/L sheet

Two columns side by side: **Planned** and **Actual**.

Planned is filled the moment you confirm the supplier price. Actual fills in as
real bills and real payments arrive. At close you can see whether you made what
you thought you would — which is the number that tells you whether you are
pricing right.

```
                                     Planned        Actual
  Customer value (FOB)             $ 48,000       $ 48,000
  Exchange rate                        88.50          89.20
  Customer value in INR            ₹42,48,000     ₹42,81,600

  Supplier cost                   −₹36,20,000    −₹36,44,500
  ─────────────────────────────────────────────────────────
  Gross margin                      ₹6,28,000      ₹6,37,100

  Duty drawback   (1.8% of FOB)       ₹76,464        ₹76,464
  Freight & clearing                 −₹85,000       −₹91,200
  Inspection                         −₹12,000       −₹12,000
  Bank charges                        −₹4,500        −₹5,100
  Commission to agent (1% of FOB)    −₹42,480       −₹42,816
  ─────────────────────────────────────────────────────────
  Net profit                        ₹5,60,484      ₹5,62,448
  Margin on sales                      13.19%        13.14%
```

**Cost and adjustment lines** are a free list. Each line has: a name, plus or
minus, and either a flat rupee amount **or** a percentage of one of — customer
value, supplier cost, or gross margin. That covers agent commission, discounts,
late penalties, and anything you have not thought of yet.

**Exchange rate.** Export orders carry a booked rate (what you costed at) and a
realised rate (what the bank actually gave you). The difference shows as its
own line, so an FX swing never quietly looks like a pricing mistake. Domestic
orders skip all of this.

**Part shipments.** Everything above is a sum over whatever is attached. Two
invoices and three supplier bills add up the same way one does. The order header
shows ordered quantity, shipped quantity and the balance still to go.

---

## 5. Duty drawback

A small block on the order, only on export orders:

- **Basis**: percentage of FOB value, or a flat amount. Your choice per order.
  Plain percentage, no per-unit cap — you said you do not hit it.
- **Expected**: calculated when you ship, with the expected credit date.
- **Actual**: the amount and date it really landed. Sits in the pending-money
  list until then.
- No GST on it. It is income, and it belongs to the order that earned it.

If you later want RoDTEP or any other incentive, it is the same block with a
different name — the mechanism is built once.

---

## 6. Pending money, and when it arrives

The thing you asked for, and the reason the order is worth building even before
the close button exists. Every order, and a combined list across all open orders:

```
  Out   Bharathi Fab Tex      ₹18,22,250   due 18 Nov    unpaid
  Out   Bharathi Fab Tex      ₹18,22,250   due 03 Dec    unpaid
  In    Pengvin Clothing      $ 24,000     due 25 Nov    awaited
  In    Pengvin Clothing      $ 24,000     due 20 Dec    awaited
  In    Duty drawback         ₹76,464      ~ 10 Dec      awaited
  ─────────────────────────────────────────────────────────────
  Net expected by 31 Dec                   ₹6,13,000
```

Dates come from what is already there: supplier bill due dates, customer
invoice payment terms, and your drawback estimate. This should also feed the
existing Forecast page rather than being a second, disagreeing version of the
truth.

---

## 7. Closing an order, and undoing it

You chose: **the app creates the bank entries.** That is the right call for
speed, but it means a sheet now moves real money, so it needs guard rails.

How it works:

1. Payments can be recorded **as they happen**, per invoice and per bill. You do
   not have to wait for the order to finish. With part shipments you often get
   paid for the first shipment while the second is still in production.
2. **Close order** settles whatever is still open, in one step. Before anything
   is written you see the exact list:

   ```
   About to write 4 entries:
     − ₹18,22,250   Current A/c    Bharathi Fab Tex, final payment
     + ₹21,40,800   Export A/c     Pengvin Clothing, invoice PNG/26/118-2
     +    ₹76,464   Current A/c    Duty drawback, PNG/2026/118
     −    ₹91,200   Current A/c    Freight & clearing
   ```
3. Press close: the entries are written, the supplier bills are marked paid, the
   customer invoices marked received, the account balances move, the sheet
   locks.
4. **Reopen order** deletes exactly the entries the close created — they are
   tagged, so nothing you entered by hand is ever touched — and unlocks the
   sheet.

The code that *decides* what entries a close would write is a pure module with
no database in it. The code that *writes* them is separate and does only what
the pure module said. That way the preview and the real thing cannot disagree,
and the dangerous half is fully testable.

---

## 8. What gets built, in order

Each phase is useful on its own. Stop after any of them.

**Phase 1 — the spine.** `orders` table, order page, attach existing SOs, POs,
invoices and bills to an order, customer PO number and PDF, stage machine, gross
margin only. *You can now answer "what did I make on this order".*

**Phase 2 — the real P/L.** Cost and adjustment lines, duty drawback, planned
vs actual columns, FX line for export orders. *The sheet is complete.*

**Phase 3 — pending money.** Per-order and all-orders money schedule, feeding the
Forecast page. *You can see what is coming and when.*

**Phase 4 — close.** Preview, write bank entries, lock, reopen. *The order
finishes itself.*

**Phase 5 — glue.** Create SO and PO straight from the order with lines
pre-filled, shipment balance, order column on the documents lists. *Day-to-day
becomes quick.*

My advice: do 1 and 2 together, use them for a month on real orders, then
decide whether 4 is worth it. You may find that recording payments as they
happen is enough and the close button only needs to lock the sheet.

---

## 9. What this needs in the database

Small, and all additive:

- `orders` — customer, their PO number and date, currency, booked rate, stage,
  dates, drawback basis and amounts, notes.
- `order_lines` — the ordered styles: description, quantity, sell rate, cost
  rate. Drives both the SO and the PO.
- `order_costs` — the cost and adjustment lines: name, sign, flat amount or
  percentage-of-what, planned and actual.
- `order_id` column added to `documents`, `recoverable_invoices`,
  `supplier_invoices` and `transactions`. Nullable. Everything that exists
  today keeps working with it empty.
- One flag on `transactions` marking an entry as created by an order close, so
  reopen knows exactly what it may remove.

New pure modules, all tested before any screen is built:
`lib/orders/margin.ts`, `drawback.ts`, `schedule.ts`, `closePlan.ts`,
`stage.ts`.

---

## 10. What I would deliberately not do

- **Not touch the commission module.** That is a different business — you earn a
  commission on someone else's trade. This is your own trade. They should stay
  apart.
- **Not auto-post GST from orders.** The GST module reads invoices. It should go
  on reading invoices.
- **Not make the P/L an accounting ledger.** It is a one-page answer to one
  question. The moment it tries to be books, it stops being readable.
- **Not force every sale through an order.** A one-off courier invoice should stay
  a one-off courier invoice. The order is for the orders that are worth tracking.

---

## 11. Settled

1. **Name** — Order. Sales order and purchase order always written in full.
2. **One customer per order.** The customer is fixed when the order is created.
3. **Drawback** — plain percentage, no cap.
4. **Only you see it.** No sharing, no roles. Worth remembering that this is the
   one place in Inex that shows your margin: if anyone else ever gets a login,
   this is the first thing to put behind a permission.

## 12. Where it sits

**Orders is its own section in the sidebar**, not under Customers and not under
Suppliers — it spans both, and burying it under one side would make the other
half look like an afterthought.
