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
//   items: [{ description, bullets: [], color, width, weightSpec, totalLength, unitPrice, total, currency, ncm }]
//   totalLength, totalAmount, currency
//   paymentTerms, productionDays, deliveryDays
//   importer: { name, address, taxId, tel }
//   extraShipmentLine: optional extra line for Shipment Details column (e.g. Packing List summary)
function renderSalesInvoice(params) {
  const {
    title, number, date, wayOfShipment, countryOfOrigin, portOfOrigin, portOfDestination,
    incoterm, acq, manufacturer, items, totalLength, totalAmount, currency,
    paymentTerms, productionDays, deliveryDays, importer, extraShipmentLine,
  } = params;

  const rows = items.map(item => `
    <tr>
      <td>
        <strong>${escapeHtml(item.description)}</strong>
        ${item.bullets && item.bullets.length ? `<ul class="desc-bullets">${item.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : ""}
        ${item.ncm ? `<div class="small">NCM: ${escapeHtml(item.ncm)}</div>` : ""}
      </td>
      <td>${escapeHtml(item.color || "—")}</td>
      <td>${escapeHtml(item.width || "—")}</td>
      <td>${escapeHtml(item.weightSpec || "—")}</td>
      <td class="num">${fmtNumber(item.totalLength, 3)}</td>
      <td class="num">${fmtMoney(item.unitPrice, item.currency || currency)}</td>
      <td class="num">${fmtMoney(item.total, item.currency || currency)}</td>
    </tr>
  `).join("");

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

    <table class="items-table" style="margin-top:6px;">
      <thead>
        <tr>
          <th style="width:30%">Descriptions of Goods</th>
          <th>Color</th>
          <th>Width</th>
          <th>Weight</th>
          <th>Total Length</th>
          <th>Unit Price</th>
          <th>Total Amount (${escapeHtml(currency)} ${escapeHtml(incoterm || "")})</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="totals-row">
          <td colspan="4"></td>
          <td class="num">Total Meters: ${fmtNumber(totalLength, 3)}</td>
          <td class="num">Total Amount:</td>
          <td class="num">${fmtMoney(totalAmount, currency)}</td>
        </tr>
      </tbody>
    </table>

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
