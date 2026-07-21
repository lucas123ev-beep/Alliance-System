const { wrapDocument } = require("./layout");
const { escapeHtml, fmtDateLong, fmtNumber, fmtMoney, amountToWords, currencyLabel } = require("./helpers");

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
//   extraShipmentLine: optional extra line(s) for Shipment Details column (e.g. Packing List summary)
//   extraShipmentLineLabel: optional short suffix for the "Packing List Description" label (e.g. "2x 40' High Cube")
function renderSalesInvoice(params) {
  const {
    title, number, date, wayOfShipment, countryOfOrigin, portOfOrigin, portOfDestination,
    incoterm, acq, manufacturer, items, totalLength, totalWeight, totalQuantity, totalAmount, currency,
    paymentTerms, productionDays, deliveryDays, importer, extraShipmentLine, extraShipmentLineLabel,
  } = params;

  // Textile/DTF Film rolls are quoted and measured by the meter, so they get
  // the original Total Length column. Everything else (machines, chemicals,
  // accessories...) is quoted per drum/crate/unit, so they get a Quantity
  // column (e.g. "55 Steel Drums / Barrels") and a Total Weight column
  // instead — grouped into their own section with its own header, since
  // mixing both meanings into one "Total Length" column was misleading.
  const textileItems = items.filter(i => i.isTextile);
  const otherItems = items.filter(i => !i.isTextile);

  // Non-Textile items still get split into their own group per category
  // (e.g. Chemical vs Machine vs Other) when an order mixes more than one —
  // otherwise a Chemical item and an unrelated general-goods item (like LED
  // lights) would land in the same table with no visual separation, which
  // reads as confusing/ambiguous on a client-facing document. When every
  // non-Textile item shares one category, this collapses back to a single
  // plain table exactly like before (no redundant label for the common
  // single-category case).
  const otherGroups = [];
  otherItems.forEach(item => {
    const key = item.category || "Other";
    let group = otherGroups.find(g => g.key === key);
    if (!group) { group = { key, items: [] }; otherGroups.push(group); }
    group.items.push(item);
  });
  const separateOtherGroups = otherGroups.length > 1;

  // Product name and description are two separate columns (matching the
  // client's own reference documents), not name-plus-paragraph stacked in
  // one cell — NCM and any extra facts (CAS number, etc.) print as their
  // own plain lines under the description, same as the reference documents
  // (flush-left, no bullet marker/indent — see .desc-line in layout.js).
  const nameCell = item => `<td class="center"><strong>${escapeHtml(item.description)}</strong></td>`;
  const descCell = item => `
    <td>
      ${item.descriptionText ? `<p class="desc-text">${escapeHtml(item.descriptionText)}</p>` : ""}
      ${(item.bullets || []).map(b => `<p class="desc-line">${escapeHtml(b)}</p>`).join("")}
      ${item.ncm ? `<p class="desc-line"><strong>NCM: ${escapeHtml(item.ncm)}</strong></p>` : ""}
    </td>
  `;

  const textileRows = textileItems.map(item => `
    <tr>
      ${nameCell(item)}
      ${descCell(item)}
      <td class="center">${escapeHtml(item.color || "—")}</td>
      <td class="center">${escapeHtml(item.width || "—")}</td>
      <td class="center">${escapeHtml(item.weightSpec || "—")}</td>
      <td class="num">${item.metersPerRoll ? fmtNumber(item.metersPerRoll, 2) : "—"}</td>
      <td class="num">${fmtNumber(item.totalLength, 3)}</td>
      <td class="num">${fmtMoney(item.unitPrice, currency)}</td>
      <td class="num">${fmtMoney(item.total, currency)}</td>
    </tr>
  `).join("");

  // Total Weight only means something for Chemical (liter-priced — ton-
  // priced items already show their weight as the Quantity itself, "48 t
  // (≈ 240 Drums)", so repeating it here would be redundant). Every OTHER
  // category — Machine, Accessory, anything counted in Units/Pairs rather
  // than priced by weight — leaves this column fully empty instead of
  // printing a weight nobody quoted or cares about on this document.
  const otherRowsFor = groupItems => groupItems.map(item => `
    <tr>
      ${nameCell(item)}
      ${descCell(item)}
      <td class="center">${escapeHtml(item.color || "—")}</td>
      <td class="center">${escapeHtml(item.priceUnitLabel || item.width || "—")}</td>
      <td class="center">${item.quantityLabel
        ? escapeHtml(item.quantityLabel)
        : item.quantity != null ? escapeHtml(`${item.quantity} ${item.unit || ""}`.trim()) : "—"}</td>
      <td class="num">${(item.category === "Chemical" && item.priceBasis !== "ton")
        ? (item.totalWeight ? `${fmtNumber(item.totalWeight, 1)} kg` : "—")
        : ""}</td>
      <td class="num">${fmtMoney(item.unitPrice, currency)}</td>
      <td class="num">${fmtMoney(item.total, currency)}</td>
    </tr>
  `).join("");

  // Each category group renders as its own clearly separated table block —
  // Textile/DTF Film with the Total Length column, everything else with
  // Quantity + Total Weight instead.
  // Column widths are all explicit percentages (not left to auto-distribute)
  // so Description can take a noticeably wider share — the short columns
  // (Color, Unit, Weight...) hold single short values/numbers and don't
  // need much room, so that space is better spent letting more words fit
  // per description line before wrapping. Doesn't touch the page size
  // itself (still plain A4 from render.js) — just how the row's own width
  // is divided up.
  let sectionsHtml = "";

  if (textileItems.length > 0) {
    sectionsHtml += `
    <table class="items-table" style="margin-top:6px;">
      <thead>
        <tr>
          <th style="width:11%">Product</th>
          <th style="width:29%">Description</th>
          <th style="width:7%">Color</th>
          <th style="width:7%">Width</th>
          <th style="width:7%">Weight</th>
          <th style="width:8%">Meters/Roll</th>
          <th style="width:9%">Total Length</th>
          <th style="width:9%">Unit Price</th>
          <th style="width:13%">Total Amount (${escapeHtml(currencyLabel(currency))} ${escapeHtml(incoterm || "")})</th>
        </tr>
      </thead>
      <tbody>
        ${textileRows}
      </tbody>
    </table>
  `;
  }

  otherGroups.forEach((group, idx) => {
    // Later groups (2nd category onward) get extra top spacing plus a thick
    // rule matching the one already used above the Grand Total row —
    // enough to read as a clear break between categories without a filled
    // gray label bar, which the client found too heavy/intrusive.
    const isNewSection = separateOtherGroups && idx > 0;
    sectionsHtml += `
    <table class="items-table" style="margin-top:${isNewSection ? "18px" : "6px"};${isNewSection ? " border-top:1.5px solid #333;" : ""}">
      <thead>
        <tr>
          <th style="width:12%">Product</th>
          <th style="width:32%">Description</th>
          <th style="width:8%">Color</th>
          <th style="width:9%">Unit</th>
          <th style="width:10%">Quantity</th>
          <th style="width:10%">Total Weight</th>
          <th style="width:9%">Unit Price</th>
          <th style="width:10%">Total Amount (${escapeHtml(currencyLabel(currency))} ${escapeHtml(incoterm || "")})</th>
        </tr>
      </thead>
      <tbody>
        ${otherRowsFor(group.items)}
      </tbody>
    </table>
  `;
  });

  // Total Length (Textile/DTF Film) or Total Quantity (everything else) now
  // shares the same row as Grand Total Amount instead of living in its own
  // separate table below — when the order mixes both kinds of goods, Total
  // Length takes priority since it's the primary quoted measure.
  const summaryLabel = textileItems.length > 0
    ? `Total Length: ${fmtNumber(totalLength, 3)} m`
    : `Total Quantity: ${fmtNumber(totalQuantity, 2)}`;

  // Both totals share ONE cell (not split across two stretched-apart
  // <td>s spanning the full table width, which left a wide empty gap
  // between them) — right-aligned together so "Total Quantity: X   Grand
  // Total Amount: $Y" reads as one adjacent pair instead of opposite ends
  // of the row.
  sectionsHtml += `
    <table class="items-table" style="margin-top:6px;">
      <tbody>
        <tr class="totals-row">
          <td class="num">${escapeHtml(summaryLabel)} &nbsp;&nbsp;|&nbsp;&nbsp; Grand Total Amount: ${fmtMoney(totalAmount, currency)}</td>
        </tr>
      </tbody>
    </table>
  `;

  const body = `
    <table class="meta-table">
      <tr><td><strong>Number:</strong> ${escapeHtml(number)}</td>
          <td><strong>Date:</strong> ${fmtDateLong(date)}</td></tr>
      <tr><td><strong>Way Of Shipment:</strong> ${escapeHtml(wayOfShipment || "By Sea")}.</td>
          <td><strong>Country Of Origin:</strong> ${escapeHtml(countryOfOrigin || "China")}.</td></tr>
      <tr><td><strong>Port Of Origin:</strong> ${escapeHtml(portOfOrigin || "—")}.</td>
          <td><strong>Incoterm:</strong> ${escapeHtml(incoterm || "—")}</td></tr>
      <tr><td><strong>Port Of Destination:</strong> ${escapeHtml(portOfDestination || "—")}.</td>
          <td><strong>Manufacturer:</strong> ${escapeHtml(manufacturer.name || "—")}</td></tr>
      <tr><td colspan="2"><strong>Manufacturer Address:</strong> ${escapeHtml(manufacturer.address || "—")}${manufacturer.tel ? ` | Tel.: ${escapeHtml(manufacturer.tel)}` : ""}</td></tr>
      <tr><td><strong>Country of origin and provenance:</strong> ${escapeHtml(countryOfOrigin || "China")}.</td>
          <td><strong>Country of acquisition:</strong> ${escapeHtml(acq.countryOfAcquisition)}.</td></tr>
    </table>

    ${sectionsHtml}

    <div class="two-col">
      <div class="col">
        <div class="col-title">Payment Instructions</div>
        <p><strong>Total Value:</strong> ${escapeHtml(amountToWords(totalAmount, currency))}</p>
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
        <div class="bank-block" style="margin-top:8px;">
          <p><strong>Our bank information is as below:</strong></p>
          <p>Beneficiary Name: ${escapeHtml(acq.bank.beneficiary)}.</p>
          <p>Address: ${escapeHtml(acq.bank.address)}</p>
          <p>Account Number: ${escapeHtml(acq.bank.account)}</p>
          <p>Bank Name: ${escapeHtml(acq.bank.bankName)}.</p>
          <p>Bank SWIFT: ${escapeHtml(acq.bank.swift)}</p>
        </div>
      </div>
      <div class="col">
        <div class="col-title">Shipment Details</div>
        <p><strong>Importer | Consignee | Notify Part:</strong></p>
        <p><strong>${escapeHtml(importer.name || "—")}</strong></p>
        <p>${escapeHtml(importer.address || "—")}</p>
        ${importer.taxId ? `<p>Tax ID / CNPJ: ${escapeHtml(importer.taxId)}</p>` : ""}
        ${importer.tel ? `<p>Tel.: ${escapeHtml(importer.tel)}</p>` : ""}
      </div>
    </div>
  `;

  return wrapDocument({ title, acq, body });
}

module.exports = { renderSalesInvoice };
