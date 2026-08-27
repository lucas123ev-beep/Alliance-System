const { wrapDocument, icon } = require("./layout");
const { escapeHtml, fmtDateLong, fmtNumber, fmtMoney, amountToWords, currencyLabel } = require("./helpers");
const { renderItemSections } = require("./itemSections");

// production_days/delivery_days are usually a plain day-count ("28"), auto-
// wrapped into "28 days after TT payment." — but some deals need a full
// note there instead (e.g. "Depending on booking, please book at least 7
// days after production finish date."), which would read wrong with that
// suffix glued onto the end of it. Only append the suffix when the value
// actually looks like a bare number; anything else prints as-is, already a
// complete sentence on its own.
function daysOrNote(value, fallback) {
  const v = (value === undefined || value === null || value === "") ? fallback : value;
  return /^\d+$/.test(String(v).trim()) ? `${v} days after TT payment.` : String(v);
}

// One "party" card (Importer / Consignee / Notify Party / the combined
// fallback) — style is passed in explicitly since only the last card in the
// stack should get flex:1 (fills the column's remaining height, matching
// the sig-box below it), the rest get flex:none + margin-bottom.
function partyCard(heading, party, style) {
  return `
        <div class="card" style="${style}">
          <div class="card-title">${icon("user")}${heading}</div>
          <p><strong>${escapeHtml(party.name || "—")}</strong></p>
          <p>${escapeHtml(party.address || "—")}</p>
          ${party.taxId ? `<p>Tax ID / CNPJ: ${escapeHtml(party.taxId)}</p>` : ""}
          ${party.tel ? `<p>Tel.: ${escapeHtml(party.tel)}</p>` : ""}
        </div>`;
}

// Shared layout for Proforma Invoice and Commercial Invoice — the two
// client-facing sales documents. Structurally identical in the models the
// client sent, differing only in title and a couple of payment-instruction
// lines.
//
// params:
//   title: "PROFORMA INVOICE" | "COMMERCIAL INVOICE"
//   number, date, wayOfShipment, portOfOrigin, portOfDestination, incoterm
//   acq: acquisition company object (see acquisitionCompanies.js)
//   manufacturer: { name, address, tel }
//   items: [{ description, bullets: [], color, width, weightSpec, category, isTextile,
//             quantity, unit, metersPerRoll, totalLength, totalWeight, unitPrice, total, currency, ncm }]
//   totalLength, totalWeight, totalQuantity, totalAmount, currency
//   paymentTerms, productionDays, deliveryDays
//   importer: { name, address, taxId, tel }
//   consignee, notifyParty: optional { name, address, taxId, tel } — when
//     BOTH are omitted (the common case), importer is also printed as the
//     Consignee and Notify Party in one combined box (heading reads
//     "Importer / Consignee / Notify Party"), same as the Packing List's
//     existing convention. Filling in either one switches to separate
//     stacked boxes instead, each with its own heading — Importer always
//     shown, Consignee/Notify Party only shown when that specific one is set
//     (so e.g. a Consignee-only Proforma shows two boxes, not three).
//   extraShipmentLine: optional extra line(s) for Shipment Details column (e.g. Packing List summary)
//   extraShipmentLineLabel: optional short suffix for the "Packing List Description" label (e.g. "2x 40' High Cube")
function renderSalesInvoice(params) {
  const {
    title, number, date, wayOfShipment, countryOfOrigin, portOfOrigin, portOfDestination,
    incoterm, acq, manufacturer, items, totalLength, totalWeight, totalQuantity, totalAmount, currency,
    paymentTerms, productionDays, deliveryDays, importer, consignee, notifyParty,
    extraShipmentLine, extraShipmentLineLabel, validity,
  } = params;

  // Blank consignee/notifyParty (the common case) -> one combined card, same
  // party for all three roles, exactly like before this field existed.
  // Filling either one in -> separate stacked cards, Importer always shown,
  // Consignee/Notify Party only when that specific one is actually set —
  // except when two (or all three) roles resolve to the same client by
  // name, in which case they're merged back into a single card with a
  // combined heading (e.g. "Importer / Notify Party") instead of printing
  // the same address twice.
  let partyBlocksHtml;
  if (consignee || notifyParty) {
    const roles = [["Importer", importer]];
    if (consignee) roles.push(["Consignee", consignee]);
    if (notifyParty) roles.push(["Notify Party", notifyParty]);
    const groups = [];
    roles.forEach(([role, party]) => {
      const key = (party.name || "").trim().toLowerCase();
      const existing = key && groups.find(g => g.key === key);
      if (existing) existing.roles.push(role);
      else groups.push({ key, roles: [role], party });
    });
    partyBlocksHtml = groups.map((g, i) =>
      partyCard(g.roles.join(" / "), g.party, i === groups.length - 1 ? "flex:1;" : "flex:none; margin-bottom:8px;")
    ).join("");
  } else {
    partyBlocksHtml = partyCard("Importer / Consignee / Notify Party", importer, "flex:1;");
  }

  // Category-aware item table(s) — Textile/DTF Film (Total Length column) vs
  // everything else, further split per category when more than one is mixed
  // in. Shared with the Quotation PDF — see itemSections.js for the actual
  // per-category logic/peculiarities (ton-priced Chemical, textile meterage,
  // units_per_package...).
  const textileItems = items.filter(i => i.isTextile);
  let sectionsHtml = renderItemSections(items, currency);

  // Total Length (Textile/DTF Film) or Total Quantity (everything else) now
  // shares the same row as Grand Total Amount instead of living in its own
  // separate table below — when the order mixes both kinds of goods, Total
  // Length takes priority since it's the primary quoted measure.
  const summaryLabel = textileItems.length > 0
    ? `Total Length: ${fmtNumber(totalLength, 0)} m`
    : `Total Quantity: ${fmtNumber(totalQuantity, 2)}`;

  // Both totals share ONE cell (not split across two stretched-apart
  // <td>s spanning the full table width, which left a wide empty gap
  // between them) — right-aligned together so "Total Quantity: X   Grand
  // Total Amount: $Y" reads as one adjacent pair instead of opposite ends
  // of the row.
  sectionsHtml += `
    <table class="items-table" style="margin-top:4px;">
      <tbody>
        <tr class="totals-row">
          <td class="num">${escapeHtml(summaryLabel)} &nbsp;&nbsp;|&nbsp;&nbsp; Grand Total Amount: ${fmtMoney(totalAmount, currency)}</td>
        </tr>
      </tbody>
    </table>
  `;

  const body = `
    <div class="doc-meta-row">
      <div><strong>Number:</strong> ${escapeHtml(number)}</div>
      <div><strong>Date:</strong> ${fmtDateLong(date)}</div>
    </div>
    <table class="meta-table">
      <tr><td>${icon("ship")}<strong>Way Of Shipment:</strong> ${escapeHtml(wayOfShipment || "By Sea")}.</td>
          <td>${icon("world")}<strong>Country Of Origin:</strong> ${escapeHtml(countryOfOrigin || "China")}.</td></tr>
      <tr><td>${icon("anchor")}<strong>Port Of Origin:</strong> ${escapeHtml(portOfOrigin || "—")}.</td>
          <td>${icon("file")}<strong>Incoterm:</strong> ${escapeHtml(incoterm || "—")}</td></tr>
      <tr><td>${icon("ship")}<strong>Port Of Destination:</strong> ${escapeHtml(portOfDestination || "—")}.</td>
          <td>${icon("building")}<strong>Manufacturer:</strong> ${escapeHtml(manufacturer.name || "—")}</td></tr>
      <tr><td colspan="2">${icon("building")}<strong>Manufacturer Address:</strong> ${escapeHtml(manufacturer.address || "—")}${manufacturer.tel ? ` | Tel.: ${escapeHtml(manufacturer.tel)}` : ""}</td></tr>
    </table>
    <div class="check-band">
      <div class="col">${icon("check")}<strong>Country of origin and provenance:</strong> ${escapeHtml(countryOfOrigin || "China")}.</div>
      <div class="col">${icon("check")}<strong>Country of acquisition:</strong> ${escapeHtml(acq.countryOfAcquisition)}.</div>
    </div>

    ${sectionsHtml}

    <div class="footer-grid">
      <div style="flex:1.2; display:flex; flex-direction:column;">
        <div class="card" style="flex:1;">
          <div class="card-title">${icon("file")}Order Information</div>
          <p><strong>1. Payment terms:</strong> ${escapeHtml(paymentTerms || "100% on BL copy")}.</p>
          <p><strong>2. End date of production:</strong> ${escapeHtml(daysOrNote(productionDays, "28"))}</p>
          <p><strong>3. Goods delivered:</strong> ${escapeHtml(portOfOrigin || "—")}.</p>
          <p><strong>4. Delivery date at ${escapeHtml((portOfOrigin || "origin port").split(",")[0])}:</strong> ${escapeHtml(daysOrNote(deliveryDays, "33"))}</p>
          ${extraShipmentLine ? `
          <p style="margin-bottom:2px;"><strong>5. Packing List Description${extraShipmentLineLabel ? `: ${escapeHtml(extraShipmentLineLabel)}` : ""}</strong></p>
          ${
            // Multi-container Packing Lists pass an array (one breakdown line
            // per container, e.g. "Container 01: OOCU7979442 — Tons: 26.928 |
            // ..."). Each container gets its own indented line instead of
            // being run together in one paragraph, so they read as a list
            // instead of a wall of text. Single-container/legacy callers
            // still just pass a plain string.
            Array.isArray(extraShipmentLine)
              ? extraShipmentLine.map(l => `<p style="margin:2px 0 2px 12px;">${escapeHtml(l)}.</p>`).join("")
              : `<p style="margin:2px 0 2px 12px;">${escapeHtml(extraShipmentLine)}.</p>`
          }` : ""}
        </div>
        <div class="total-box">
          <div class="label">Total Invoice Value</div>
          <div class="value">${escapeHtml(currencyLabel(currency))} ${fmtNumber(totalAmount, 2)}</div>
          <div class="words">${escapeHtml(amountToWords(totalAmount, currency))}</div>
        </div>
        ${title === "PROFORMA INVOICE" && validity ? `
        <div class="card" style="margin-top:8px; flex:none;">
          <div class="card-title">${icon("calendar")}Quotation Validity</div>
          <p>This Proforma Invoice is valid until <strong>${escapeHtml(fmtDateLong(validity))}</strong>.</p>
        </div>` : ""}
      </div>
      <div class="card bank-block">
        <div class="card-title">${icon("bank")}Bank Information</div>
        <p><strong>Beneficiary Name:</strong></p>
        <p>${escapeHtml(acq.bank.beneficiary)}</p>
        <p><strong>Address:</strong></p>
        <p>${escapeHtml(acq.bank.address)}</p>
        <p><strong>Account Number:</strong> ${escapeHtml(acq.bank.account)}</p>
        <p><strong>Bank Name:</strong> ${escapeHtml(acq.bank.bankName)}</p>
        <p><strong>Bank SWIFT:</strong> ${escapeHtml(acq.bank.swift)}</p>
      </div>
      <div style="flex:1; display:flex; flex-direction:column;">
        ${partyBlocksHtml}
        <div class="sig-box">
          <div class="label">Authorized by</div>
          <div class="name">${escapeHtml(acq.name)}</div>
          <div class="line">Authorized signature</div>
        </div>
      </div>
    </div>
    ${title === "PROFORMA INVOICE" ? `<div class="footer-note">This Proforma Invoice is issued for quote purpose only and does not constitute a sales contract.</div>` : ""}
  `;

  return wrapDocument({ title, acq, body });
}

module.exports = { renderSalesInvoice, partyCard };
