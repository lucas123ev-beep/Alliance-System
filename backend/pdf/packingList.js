const { wrapDocument } = require("./layout");
const { escapeHtml, fmtDateLong, fmtNumber } = require("./helpers");

// Packing List — generated alongside the Commercial Invoice when an Order
// moves to Shipment. Items carry physical shipment data (Roll / Gross /
// Net weight / CBM) that has no other home in the system.
function renderPackingList(params) {
  const {
    number, date, wayOfShipment, countryOfOrigin, portOfOrigin, portOfDestination,
    incoterm, acq, manufacturer, items, totals, importer,
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
      <td class="num">${fmtNumber(item.roll, 0)}</td>
      <td class="num">${fmtNumber(item.grossWeight, 3)}</td>
      <td class="num">${fmtNumber(item.netWeight, 3)}</td>
      <td class="num">${fmtNumber(item.cbm, 2)}</td>
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
      <tr><td class="label">Manufacturer Address:</td><td colspan="3">${escapeHtml(manufacturer.address || "—")}${manufacturer.tel ? ` | Tel.: ${escapeHtml(manufacturer.tel)}` : ""}</td></tr>
      <tr><td class="label">Country of origin and provenance:</td><td>${escapeHtml(countryOfOrigin || "China")}.</td>
          <td class="label">Country of acquisition:</td><td>${escapeHtml(acq.countryOfAcquisition)}.</td></tr>
    </table>

    <table class="items-table" style="margin-top:6px;">
      <thead>
        <tr>
          <th style="width:22%">Descriptions of Goods</th>
          <th>Color</th>
          <th>Width</th>
          <th>Weight</th>
          <th>Total Length</th>
          <th>Roll</th>
          <th>Gross Weight</th>
          <th>Net Weight</th>
          <th>CBM</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="totals-row">
          <td colspan="4">TOTAL:</td>
          <td class="num">${fmtNumber(totals.totalLength, 3)}</td>
          <td class="num">${fmtNumber(totals.totalRoll, 0)}</td>
          <td class="num">${fmtNumber(totals.totalGrossWeight, 3)}</td>
          <td class="num">${fmtNumber(totals.totalNetWeight, 3)}</td>
          <td class="num">${fmtNumber(totals.totalCbm, 2)}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-bar" style="margin-top:6px;">Shipment Details</div>
    <div style="border:1px solid #999; border-top:none; padding:10px 14px;">
      <p style="text-align:center; font-weight:bold; margin:0 0 6px;">Importer | Consignee | Notify Part:</p>
      <p style="text-align:center; font-weight:bold; margin:0 0 2px;">${escapeHtml(importer.name || "—")}</p>
      <p style="text-align:center; margin:0 0 2px;">${escapeHtml(importer.address || "—")}</p>
      ${importer.taxId ? `<p style="text-align:center; margin:0 0 2px;">CNPJ: ${escapeHtml(importer.taxId)}</p>` : ""}
      ${importer.tel ? `<p style="text-align:center; margin:0;">Tel.: ${escapeHtml(importer.tel)}</p>` : ""}
    </div>
  `;

  return wrapDocument({ title: "PACKING LIST", acq, body });
}

module.exports = { renderPackingList };
