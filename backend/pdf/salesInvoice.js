const { wrapDocument } = require("./layout");
const { escapeHtml, fmtDateLong, fmtNumber, fmtMoney, amountToWords, currencyLabel } = require("./helpers");

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

  // Product name and description are two separate columns (matching the
  // client's own reference documents), not name-plus-paragraph stacked in
  // one cell — NCM and any extra facts (CAS number, etc.) sit under the
  // description as a small bulleted list.
  const nameCell = item => `<td class="center"><strong>${escapeHtml(item.description)}</strong></td>`;
  const descCell = item => `
    <td>
      ${item.descriptionText ? `<p class="desc-text">${escapeHtml(item.descriptionText)}</p>` : ""}
      ${(item.bullets && item.bullets.length) || item.ncm ? `<ul class="desc-bullets">
        ${(item.bullets || []).map(b => `<li>${escapeHtml(b)}</li>`).join("")}
        ${item.ncm ? `<li>NCM: ${escapeHtml(item.ncm)}</li>` : ""}
      </ul>` : ""}
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

  // Ton-priced Chemical items already show their weight as the Quantity
  // itself ("48 t (≈ 240 Drums)") — repeating it in Total Weight is
  // redundant, so that column is left fully empty (not even a "—") for
  // those rows. Every other category still shows its registered weight in
  // kg here, since nothing else on the row carries that information.
  const otherRows = otherItems.map(item => `
    <tr>
      ${nameCell(item)}
      ${descCell(item)}
      <td class="center">${escapeHtml(item.color || "—")}</td>
      <td class="center">${escapeHtml(item.priceUnitLabel || item.width || "—")}</td>
      <td class="center">${item.quantityLabel
        ? escapeHtml(item.quantityLabel)
        : item.quantity != null ? escapeHtml(`${item.quantity} ${item.unit || ""}`.trim()) : "—"}</td>
      <td class="num">${item.priceBasis === "ton"
        ? ""
        : (item.totalWeight ? `${fmtNumber(item.totalWeight, 1)} kg` : "—")}</td>
      <td class="num">${fmtMoney(item.unitPrice, currency)}</td>
      <td class="num">${fmtMoney(item.total, currency)}</td>
    </tr>
  `).join("");

  // Each category group renders as its own clearly separated table block —
  // Textile/DTF Film with the Total Length column, everything else with
  // Quantity + Total Weight instead.
  let sectionsHtml = "";

  if (textileItems.length > 0) {
    sectionsHtml += `
    <table class="items-table" style="margin-top:6px;">
      <thead>
        <tr>
          <th style="width:13%">Product</th>
          <th style="width:22%">Description</th>
          <th>Color</th>
          <th>Width</th>
          <th>Weight</th>
          <th>Meters/Roll</th>
          <th>Total Length</th>
          <th>Unit Price</th>
          <th>Total Amount (${escapeHtml(currencyLabel(currency))} ${escapeHtml(incoterm || "")})</th>
        </tr>
      </thead>
      <tbody>
        ${textileRows}
      </tbody>
    </table>
  `;
  }

  if (otherItems.length > 0) {
    sectionsHtml += `
    <table class="items-table" style="margin-top:6px;">
      <thead>
        <tr>
          <th style="width:14%">Product</th>
          <th style="width:24%">Description</th>
          <th>Color</th>
          <th>Unit</th>
          <th>Quantity</th>
          <th>Total Weight</th>
          <th>Unit Price</th>
          <th>Total Amount (${escapeHtml(currencyLabel(currency))} ${escapeHtml(incoterm || "")})</th>
        </tr>
      </thead>
      <tbody>
        ${otherRows}
      </tbody>
    </table>
  `;
  }

  // Total Length (Textile/DTF Film) or Total Quantity (everything else) now
  // shares the same row as Grand Total Amount instead of living in its own
  // separate table below — when the order mixes both kinds of goods, Total
  // Length takes priority since it's the primary quoted measure.
  const summaryLabel = textileItems.length > 0
    ? `Total Length: ${fmtNumber(totalLength, 3)} m`
    : `Total Quantity: ${fmtNumber(totalQuantity, 2)}`;

  // Label and value share one cell (not split across two stretched-apart
  // <td>s) so "Grand Total Amount: $X" reads as one unit instead of leaving
  // a wide empty gap between the label and the number.
  sectionsHtml += `
    <table class="items-table" style="margin-top:6px;">
      <tbody>
        <tr class="totals-row">
          <td>${escapeHtml(summaryLabel)}</td>
          <td class="num">Grand Total Amount: ${fmtMoney(totalAmount, currency)}</td>
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
        <p><strong>2. End date of production:</strong> ${escapeHtml(productionDays || "28")} days after TT payment.</p>
        <p><strong>3. Goods delivered:</strong> ${escapeHtml(portOfOrigin || "—")}.</p>
        <p><strong>4. Delivery date at ${escapeHtml((portOfOrigin || "origin port").split(",")[0])}:</strong> ${escapeHtml(deliveryDays || "33")} days after TT payment.</p>
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
