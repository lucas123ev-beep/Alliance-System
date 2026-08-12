# Alliance Flow — Video Tutorial Script

**Format:** screen recording + live narration. Everything in *italics* is a stage
direction (what to click/show on screen); everything in plain text is what to
say out loud, written the way you'd actually talk, not read stiffly.

**Before you record:** log into a real (or test) account that has access to
every tab, so you can walk through the whole system in one take. If you end up
recording separate videos per role later, you can just cut this script down to
the sections that role actually has.

**Suggested runtime:** 18–25 minutes for the full walkthrough. If that's too
long for one email, you can split it after the Intro into "Part 1: Sales Flow"
(Quotations → Orders → documents) and "Part 2: Registries & Reports"
(Products/Clients/Suppliers/Freight Agents/Reports).

---

## Intro (30–45 sec)

*Show the login screen.*

"Hi everyone — this is a walkthrough of Alliance Flow, the system we're now
using to manage our whole order pipeline: quotations, proformas, orders,
contracts, inspections, commercial invoices, packing lists, supplier
payments, samples, and all of our product/client/supplier records in one
place.

Quick note before we start: depending on your role, your sidebar might not
show every tab I'm about to click through — that's intentional, not a bug.
Just skip ahead to the sections that match what you'll actually be using."

---

## 1. Logging In & Getting Around

*Log in on screen. If it's a first-time login, show the forced password
change screen.*

"Log in with the username and temporary password I sent you. First time
you log in, the system will make you set your own password before it lets
you in anywhere else — that's a one-time thing.

*Point at the sidebar.*

This is the main menu — every screen you have access to lives here. Click
any tab and it loads instantly, no page reloads.

*Point at the language toggle, top right.*

Up here you've got English and Chinese — the interface switches instantly,
labels, buttons, everything. This doesn't touch the PDFs we send clients or
suppliers, just the app itself.

One more thing that'll save you time: anywhere in the system, if you've got
a window or a form open and you want to close it, just hit **Escape** on
your keyboard instead of hunting for the X button."

---

## 2. Dashboard

*Click into Dashboard.*

"This is home base — a quick snapshot of what's going on: active orders,
what's pending on the client side, what commercial invoices are still
outstanding. If you land here when you log in, this is basically your
'what needs my attention today' screen. Not every role sees every card
here — for example, some of you won't see client payment info, that's on
purpose."

---

## 3. The Sales Flow: Quotation → Proforma → Order

*This is the core workflow — spend the most time here.*

### 3a. Quotations

*Click Quotations → New Quotation.*

"Everything starts here. When a client asks for pricing, you build a
Quotation: pick the client, then add products one by one.

*Click "Add Product," walk through the item modal.*

For each item you can set quantity, unit price, and — this is
Quotations-only — a Target Price, which is separate from what we'd
actually sell at, just for negotiation reference.

The Quotation gets a number automatically, sequential, so you never have
to think about numbering. Status starts at Draft, and moves to Sent,
Accepted, or Rejected as the deal progresses.

*Open an existing Accepted quotation.*

Once a client accepts, this is where a Proforma gets generated from it —
I'll show that next."

### 3b. Proformas

*Click Proformas → New Proforma (or generate from the Quotation).*

"The Proforma is the formal document we send the client before the order
is locked in — it's what actually gets exported as a PDF.

*Walk through the fields.*

Client, currency, the items — same as the quotation, but this is its own
record. Down here: Incoterm, Way of Shipment, Port of Loading, Port of
Discharge, Payment Terms, and a Validity date — that's how long the
pricing is good for, and it prints right on the PDF.

*Point at Acquisition Company.*

This one's important: Acquisition Company decides which of our two
entities — Hong Kong or Ningbo — issues the document, which changes the
letterhead, address, and bank info on the PDF. If this Proforma is linked
to an Order, this field locks and just follows whatever the Order has set
— that keeps every document for the same deal consistent. You'd only set
it manually here if there's no linked Order yet.

*Click Download PDF.*

And this generates the actual PDF — file name always includes the Order
Number so nobody's guessing which file is which in their downloads
folder."

### 3c. Orders

*Click Orders → open an existing one, or create new.*

"The Order is the central record — once something's confirmed, this is
where production, shipment, and every related document all tie back to.

*Walk through the status bar.*

Status moves through Pending, In Production, Inspection, Shipment,
Completed — this is the one field everyone on the team should be keeping
current, since a lot of reporting depends on it.

*Point at fields: production lead time, delivery days, shipment/arrival
dates, incoterm, container info.*

Below that: production lead time, delivery days, container details, and
the Acquisition Company again — remember, whatever's set here is the
source of truth for every linked Proforma, Commercial Invoice, and Packing
List.

*Scroll to the buttons for generating Contract / Inspection / Commercial
Invoice.*

And right here from the Order, you can generate a Supplier Contract, an
Inspection record, or a Commercial Invoice — no need to jump to those
tabs and start from scratch, it carries the order's info over
automatically."

---

## 4. Documents Generated From an Order

### 4a. Contracts

*Click Contracts, open one.*

"This is the legal contract with our supplier in Ningbo — it's always
bilingual, English and Chinese, side by side. Note this one's always
issued from our Ningbo entity regardless of which Acquisition Company is
on the Order — that's just how our supplier agreements work. Status here
tracks Draft, Signed, Completed, or Cancelled."

### 4b. Inspections

*Click Inspections, open one.*

"Quick record of quality inspection: who inspected, the result — Approved,
Rejected, or Conditional — the date, and any observations. Nothing fancy,
just a clean paper trail."

### 4c. Commercial Invoices

*Click Commercial, open one.*

"This is the actual invoice tied to the shipment — total, currency,
issue/shipment/arrival dates. Some of you won't see the Status field here,
that's an intentional restriction on certain roles. Download works the
same way as the Proforma — one click, filename includes the Order
Number."

### 4d. Packing Lists

*Click Packing Lists, open one.*

"Packing List covers the shipment details: rolls, quantities, gross and
net weight, CBM. Down here you'll also pick a Freight Agent and can log
their cost, freight cost, and loading cost — these are informational
only, they don't print on the Packing List PDF itself, but they do show
up in the Orders report so we can track shipping costs over time."

---

## 5. Supplier Flow (Payments)

*Click Supplier Flow.*

"This tracks what we owe suppliers and when — due date, amount, currency,
status: Pending, Partial, Paid, or Overdue. When a payment's ready to go
out, you generate a Payment Notice —

*Click Generate Payment Notice.*

— it's an Excel file now, bilingual, with the bank details the supplier
needs to receive the wire. Same naming convention: filename always
includes the Order Number."

---

## 6. Samples

*Click Samples.*

"Before a product goes into full production, a lot of clients want a
sample first. This tracks that whole mini-lifecycle: Requested, In
Production, Sent, Feedback Received, Approved — with dates logged at each
step."

---

## 7. The Registries: Products, Clients, Suppliers, Freight Agents

### 7a. Products

*Click Products, open one.*

"Every product we buy or sell lives here — code, name, category,
dimensions, weight, cost price and sale price each in their own currency,
and a live Real Margin calculation that converts currencies and factors
in VAT automatically. Some roles don't see this margin number — again,
intentional.

*Click Price History.*

This button shows the full history of cost and sale price changes over
time for that product — handy for spotting a supplier's price creep
before it becomes a problem."

### 7b. Clients

*Click Clients.*

"Straightforward company registry — contact info, address, payment terms.
This is what feeds the Client dropdown everywhere else in the system."

### 7c. Suppliers

*Click Suppliers.*

"Same idea for our suppliers — company info, product types, bank details
for contracts and payment notices.

*Point at the Rating column / open a supplier and point at the stars.*

New feature: every supplier now has a 5-star quality rating. They all
start at 5. When something goes wrong — wrong product, late delivery,
damaged goods, whatever — you log it here.

*Click the ⭐ Evaluation button, walk through the form.*

You pick what happened on the Problem side, and what we did about it on
the Solution side — each option already has points built in, so a
serious problem knocks off more than a small one, and a strong fix
recovers more than a weak one. There's also a generic Small/Medium/Severe
option on both sides if the specific situation isn't listed, and a 'not
resolved yet' option if you're logging the problem before there's a fix
in place.

*Scroll to history table.*

Every entry's saved here with the date and who logged it, and the rating
updates automatically — nobody types in a number by hand.

*Click 📊 Evaluation Report.*

And if you want the whole history exported, this generates an Excel
report — one sheet per supplier — either for everyone or just the ones
you pick."

### 7d. Freight Agents

*Click Freight Agents.*

"Lean registry, just contact info for the freight forwarders we work
with — this is what populates the picker on the Packing List screen."

---

## 8. Reports

*Click Reports.*

"Last stop. This pulls everything — Quotations, Proformas, Orders,
Commercial Invoices, Contracts, Inspections, Supplier Flow, Samples,
Shipment — into one Excel workbook, split into Open and Completed tabs
for each category, filtered from whatever start date you pick. You can
choose which categories to include or just pull everything.

There's also a separate report over on the Products screen —
'📊 Supplier Report' — that breaks down what we've bought from each
supplier, item by item, including their current rating."

---

## Wrap-Up (20–30 sec)

*Back to Dashboard or sidebar overview.*

"That's the full system. A few things worth remembering: hit Escape to
close anything fast, every downloaded file is named with the Order
Number so you're never guessing which one's which, and if a tab or a
field you'd expect to see isn't showing up for you, that's almost
certainly a permission thing, not a bug — just let me know and I'll
confirm what you should have access to.

If anything's unclear after watching this, just reply to this email and
I'll help you out. Thanks for watching."

---

## Notes for editing (not part of the narration)

- Consider adding on-screen text labels for each section title as a
  lower-third (Dashboard, Quotations, Orders, etc.) so people can
  screenshot/reference a specific part later.
- If you split this into two videos, end Part 1 right after Packing
  Lists (end of section 4) and start Part 2 at Supplier Flow (section 5).
- Worth a follow-up email/doc with written step-by-step instructions for
  anyone who prefers reading over re-watching a video.
