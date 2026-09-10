// In-app Calendar (see the 📅 button under the notification bell in
// App.jsx) — aggregates every meaningful date already sitting on other
// records (shipment/arrival, quotation deadlines, proforma price validity,
// contract delivery, packing list loading, inspections, sample feedback,
// supplier payments due, plus the two restricted kinds below) into one
// list the frontend groups by day. This never creates its own data — it's
// a read-only view over dates that already exist on other tables, so
// editing e.g. an Order's Shipment Date is still done on the Order itself,
// not here.
//
// Two kinds are marked `restricted: true` — Commercial Invoice payment
// status (client payments) and Swift HKAG transfers — per the client's
// explicit request that only Lucas/Martiello/Gabriel/Juliana (the same
// four people who already have the "swift-hkag" screen — see
// permissions.js) can see those two in the calendar. Every other kind is
// visible to everyone regardless of their own screen permissions (the
// client's own words: "Todos conseguem ver tudo, menos..." — so someone
// without the Contracts screen still sees a contract's delivery date here;
// clicking it just won't be able to open a screen they don't have access
// to, same as typing that URL by hand would behave).
const { PAYMENT_SCHEDULES } = require('./paymentSchedules');

function buildCalendarEvents(db) {
  const events = [];
  const push = (kind, date, screen, number, extra, restricted = false) => {
    if (!date) return;
    // Normalize to YYYY-MM-DD — some date columns carry a full
    // datetime ("2026-09-07 00:00:00"), most are already plain dates.
    const day = String(date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    events.push({ id: `${kind}-${extra?.id ?? number}`, date: day, kind, screen, number: number || '', restricted, ...extra });
  };

  for (const o of db.prepare('SELECT id, order_number, client, shipment_date, arrival_date FROM orders').all()) {
    push('order_shipment', o.shipment_date, 'orders', o.order_number, { id: o.id, client: o.client });
    push('order_arrival', o.arrival_date, 'orders', o.order_number, { id: o.id, client: o.client });
  }

  for (const q of db.prepare('SELECT id, number, client, deadline FROM quotations').all()) {
    push('quotation_deadline', q.deadline, 'quotations', q.number, { id: q.id, client: q.client });
  }

  for (const pf of db.prepare('SELECT id, number, client, validity FROM proformas').all()) {
    push('proforma_validity', pf.validity, 'proformas', pf.number, { id: pf.id, client: pf.client });
  }

  for (const c of db.prepare('SELECT id, contract_number, supplier, delivery_date FROM supplier_contracts').all()) {
    push('contract_delivery', c.delivery_date, 'contracts', c.contract_number, { id: c.id, client: c.supplier });
  }

  for (const pl of db.prepare('SELECT id, number, loading_date FROM packing_lists').all()) {
    push('packing_loading', pl.loading_date, 'packing-lists', pl.number, { id: pl.id });
  }

  for (const i of db.prepare('SELECT id, number, product_name, inspection_date FROM inspections').all()) {
    push('inspection', i.inspection_date, 'inspections', i.number || i.product_name || '', { id: i.id, client: i.product_name });
  }

  for (const s of db.prepare('SELECT id, code, product_name, feedback_date FROM samples').all()) {
    push('sample_feedback', s.feedback_date, 'samples', s.code || s.product_name || '', { id: s.id, client: s.product_name });
  }

  // A split Payment Schedule (e.g. 30% Deposit / 70% Balance) has two due
  // dates on the same record (due_date, due_date_2 — see FinForm), each
  // its own separate payment — shown here as two separate Calendar events,
  // labeled with the installment name/percentage (via `part`) so it's
  // clear which payment a given date is for. A plain 100% schedule (or a
  // record with no schedule at all) still shows as the single event it
  // always did.
  for (const f of db.prepare("SELECT id, supplier, due_date, due_date_2, payment_schedule, status FROM financial_suppliers WHERE status IN ('Pending','Partial')").all()) {
    const schedule = PAYMENT_SCHEDULES[f.payment_schedule || '100'] || PAYMENT_SCHEDULES['100'];
    if (schedule.parts.length > 1) {
      const [first, second] = schedule.parts;
      push('supplier_payment_due', f.due_date, 'fin-suppliers', f.supplier, { id: `${f.id}-1`, client: f.supplier, part: `${first.label} (${first.pct}%)` });
      push('supplier_payment_due', f.due_date_2, 'fin-suppliers', f.supplier, { id: `${f.id}-2`, client: f.supplier, part: `${second.label} (${second.pct}%)` });
    } else {
      push('supplier_payment_due', f.due_date, 'fin-suppliers', f.supplier, { id: f.id, client: f.supplier });
    }
  }

  // Restricted — client payment (tracked via the Commercial Invoice's own
  // Pending/Paid status, per the client — there's no separate due-date
  // field for this, so it's pegged to the CI's issue date) and Swift HKAG
  // transfers still pending. Both only for the four named people.
  for (const ci of db.prepare("SELECT id, number, client, issue_date FROM commercial_invoices WHERE status = 'Pending'").all()) {
    push('commercial_payment_pending', ci.issue_date, 'commercial', ci.number, { id: ci.id, client: ci.client }, true);
  }
  for (const sw of db.prepare("SELECT id, number, date, status FROM swift_transfers WHERE status = 'Pending'").all()) {
    push('swift_pending', sw.date, 'swift-hkag', sw.number, { id: sw.id }, true);
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

module.exports = { buildCalendarEvents };
