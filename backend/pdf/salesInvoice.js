const { wrapDocument } = require("./layout");
const { escapeHtml, fmtDateLong, fmtNumber, fmtMoney, amountToWords } = require("./helpers");

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
//             quantity, unit, totalLength, totalWeight, unitPrice, total, currency, ncm }]
//   totalLength, totalWeight, totalAmount, currency
//   paymentTerms, productionDays, deliveryDays
//   importer: { name, address, taxId, tel }
//   extraShipmentLine: optional extra line for Shipment Details column (e.g. Packing List summary)
function renderSalesInvoice(params) {
  const {
    title, number, date, wayOfShipment, countryOfOrigin, portOfOrigin, portOfDestination,
    incoterm, acq, manufacturer, items, totalLength, totalWeight, totalAmount, currency,
    paymentTerms, productionDays, deliveryDays, importer, extraShipmentLine,
  } = params;

  // Textile/DTF Film rolls are quoted and measured by the meter, so they get
  // the original Total Length column. Everything else (machines, chemicals,
  // accessories...) is quoted per drum/crate/unit, so they get a Quantity
  // column (e.g. "55 Steel Drums / Barrels") and a Total Weight column
  // instead — grouped into their own section with its own header, since
  // mixing both meanings into one "Total Length" column was misleading.
  const textileItems = items.filter(i => i.isTextile);
  const otherItems = items.filter(i => !i.isTextile);

  const descCell = item => `
    <td>
      <strong>${escapeHtml(item.description)}</strong>
      ${item.bullets && item.bullets.length ? `<ul class="desc-bullets">${item.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : ""}
      ${item.ncm ? `<div class="small">NCM: ${escapeHtml(item.ncm)}</div>` : ""}
    </td>
  `;

  const textileRows = textileItems.map(item => `
    <tr>
      ${descCell(item)}
      <td>${escapeHtml(item.color || "—")}</td>
      <td>${escapeHtml(item.width || "—")}</td>
      <td>${escapeHtml(item.weightSpec || "—")}</td>
      <td class="num">${fmtNumber(item.totalLength, 3)}</td>
      <td class="num">${fmtMoney(item.unitPrice, currency)}</td>
      <td class="num">${fmtMoney(item.total, currency)}</td>
    </tr>
  `).join("");

  const otherRows = otherItems.map(item => `
    <tr>
      ${descCell(item)}
      <td>${escapeHtml(item.color || "—")}</td>
      <td>${escapeHtml(item.width || "—")}</td>
      <td>${item.quantity != null ? escapeHtml(`${item.quantity} ${item.unit || ""}`.trim()) : "—"}</td>
      <td class="num">${item.totalWeight ? `${fmtNumber(item.totalWeight, 1)} kg` : "—"}</td>
      <td class="num">${fmtMoney(item.unitPrice, currency)}</td>
      <td class="num">${fmtMoney(item.total, currency)}</td>
    </tr>
  `).join("");

  const grandTotalRow = `
        <tr class="totals-row">
          <td colspan="5"></td>
          <td class="num">Grand Total Amount:</td>
          <td class="num">${fmtMoney(totalAmount, currency)}</td>
        </tr>
  `;

  // Both groups share the same 7-column width, so stacking their tables
  // with no gap between them (and only the very first one offset from the
  // meta-table above) reads as one continuous items table split into
  // sub-sections — matching how the single-table layout used to look —
  // rather than a series of visually separate boxes.
  let sectionsHtml = "";
  let isFirstSection = true;

  if (textileItems.length > 0) {
    const isLastSection = otherItems.length === 0;
    sectionsHtml += `
    <table class="items-table" style="margin-top:${isFirstSection ? "6px" : "0"};">
      <thead>
        <tr>
          <th style="width:28%">Descriptions of Goods</th>
          <th>Color</th>
          <th>Width</th>
          <th>Weight</th>
          <th>Total Length</th>
          <th>Unit Price</th>
          <th>Total Amount (${escapeHtml(currency)} ${escapeHtml(incoterm || "")})</th>
        </tr>
      </thead>
      <tbody>
        ${textileRows}
        <tr class="totals-row">
          <td colspan="4"></td>
          <td class="num">Total Meters: ${fmtNumber(totalLength, 3)}</td>
          <td colspan="2"></td>
        </tr>
        ${isLastSection ? grandTotalRow : ""}
      </tbody>
    </table>
  `;
    isFirstSection = false;
  }

  if (otherItems.length > 0) {
    sectionsHtml += `
    <table class="items-table" style="margin-top:${isFirstSection ? "6px" : "0"};">
      <thead>
        <tr>
          <th style="width:28%">Descriptions of Goods</th>
          <th>Color</th>
          <th>Width</th>
          <th>Quantity</th>
          <th>Total Weight</th>
          <th>Unit Price</th>
          <th>Total Amount (${escapeHtml(currency)} ${escapeHtml(incoterm || "")})</th>
        </tr>
      </thead>
      <tbody>
        ${otherRows}
        <tr class="totals-row">
          <td colspan="4"></td>
          <td class="num">Total Weight: ${fmtNumber(totalWeight, 1)} kg</td>
          <td colspan="2"></td>
        </tr>
        ${grandTotalRow}
      </tbody>
    </table>
  `;
    isFirstSection = false;
  }

  const body = `
    <table class="meta-table">
      <tr><td class="label">Number:</td><td>${escapeHtml(number)}</td>
          <td class="label">Date:</td><td>${fmtDateLong(date)}</td></tr>
      <tr><td class="label">Way Of Shipment:</td><td>${escapeHtml(wayOfShipment || "By Sea")}.</td>
          <td class="label">Country Of Origin:</td><td>${escapeHtml(countryOfOrigin || "China")}.</td></tr>
      <tr><td class="label">Port Of Origin:</td><td>${escapeHtml(portOfOrigin || "—")}.</td>
          <td class="label">Incoterm:</td><td>${escapeHtml(incoterm || "—")}</td></tr>
      <tr><td class="label">Port Of Destination:</td><td>${escapeHtml(portOfDestination || "—")}.</td>
          <td class="label">Manufacturer:</td><td>${escapeHtml(manufacturer.name || "—")}</td></tr>
      <tr><td class="label" colspan="1">Manufacturer Address:</td><td colspan="3">${escapeHtml(manufacturer.address || "—")}${manufacturer.tel ? ` | Tel.: ${escapeHtml(manufacturer.tel)}` : ""}</td></tr>
      <tr><td class="label">Country of origin and provenance:</td><td>${escapeHtml(countryOfOrigin || "China")}.</td>
          <td class="label">Country of acquisition:</td><td>${escapeHtml(acq.countryOfAcquisition)}.</td></tr>
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
        ${extraShipmentLine ? `<p><strong>5. Packing List Description:</strong> ${escapeHtml(extraShipmentLine)}.</p>` : ""}
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
