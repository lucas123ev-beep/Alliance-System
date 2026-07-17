const { wrapDocument } = require("./layout");
const { escapeHtml, fmtDateLong, fmtNumber } = require("./helpers");

// Packing List — generated alongside the Commercial Invoice. Items carry
// physical shipment data (Roll / Gross / Net weight / CBM) that has no
// other home in the system.
//
// Same category split used in the Proforma/Commercial Invoice PDFs:
// Textile/DTF Film rolls are measured by the meter and get a Total Length
// column; everything else (machines, chemicals, accessories...) is counted
// by unit/drum/crate and gets a Quantity column instead — mixing both
// meanings into one column was misleading.
//
// Older Packing Lists saved before this split may not carry `isTextile` on
// their items — fall back to `category`, and if that's missing too, infer
// from whether a Total Length value was ever recorded.
function isTextileItem(item) {
  if (typeof item.isTextile === "boolean") return item.isTextile;
  const category = item.category || "";
  if (category === "Textile" || category === "DTF Film") return true;
  if (category) return false;
  return !!(item.totalLength && parseFloat(item.totalLength) > 0);
}

function renderPackingList(params) {
  const {
    number, date, wayOfShipment, countryOfOrigin, portOfOrigin, portOfDestination,
    incoterm, acq, manufacturer, items, totals, importer,
  } = params;

  const textileItems = items.filter(isTextileItem);
  const otherItems = items.filter(i => !isTextileItem(i));

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
      <td class="num">${fmtNumber(item.roll, 0)}</td>
      <td class="num">${fmtNumber(item.grossWeight, 3)}</td>
      <td class="num">${fmtNumber(item.netWeight, 3)}</td>
      <td class="num">${fmtNumber(item.cbm, 2)}</td>
    </tr>
  `).join("");

  const otherRows = otherItems.map(item => `
    <tr>
      ${descCell(item)}
      <td>${escapeHtml(item.color || "—")}</td>
      <td>${escapeHtml(item.width || "—")}</td>
      <td>${item.quantity != null ? escapeHtml(`${item.quantity} ${item.unit || ""}`.trim()) : "—"}</td>
      <td class="num">${fmtNumber(item.roll, 0)}</td>
      <td class="num">${fmtNumber(item.grossWeight, 3)}</td>
      <td class="num">${fmtNumber(item.netWeight, 3)}</td>
      <td class="num">${fmtNumber(item.cbm, 2)}</td>
    </tr>
  `).join("");

  const sumOf = (arr, key) => arr.reduce((s, i) => s + (parseFloat(i[key]) || 0), 0);

  let sectionsHtml = "";

  if (textileItems.length > 0) {
    sectionsHtml += `
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
        ${textileRows}
        <tr class="totals-row">
          <td colspan="4">SUBTOTAL:</td>
          <td class="num">${fmtNumber(sumOf(textileItems, "totalLength"), 3)}</td>
          <td class="num">${fmtNumber(sumOf(textileItems, "roll"), 0)}</td>
          <td class="num">${fmtNumber(sumOf(textileItems, "grossWeight"), 3)}</td>
          <td class="num">${fmtNumber(sumOf(textileItems, "netWeight"), 3)}</td>
          <td class="num">${fmtNumber(sumOf(textileItems, "cbm"), 2)}</td>
        </tr>
      </tbody>
    </table>
  `;
  }

  if (otherItems.length > 0) {
    sectionsHtml += `
    <table class="items-table" style="margin-top:6px;">
      <thead>
        <tr>
          <th style="width:22%">Descriptions of Goods</th>
          <th>Color</th>
          <th>Width</th>
          <th>Quantity</th>
          <th>Packages</th>
          <th>Gross Weight</th>
          <th>Net Weight</th>
          <th>CBM</th>
        </tr>
      </thead>
      <tbody>
        ${otherRows}
        <tr class="totals-row">
          <td colspan="3">SUBTOTAL:</td>
          <td></td>
          <td class="num">${fmtNumber(sumOf(otherItems, "roll"), 0)}</td>
          <td class="num">${fmtNumber(sumOf(otherItems, "grossWeight"), 3)}</td>
          <td class="num">${fmtNumber(sumOf(otherItems, "netWeight"), 3)}</td>
          <td class="num">${fmtNumber(sumOf(otherItems, "cbm"), 2)}</td>
        </tr>
      </tbody>
    </table>
  `;
  }

  sectionsHtml += `
    <table class="items-table" style="margin-top:6px;">
      <tbody>
        <tr class="totals-row">
          <td>GRAND TOTAL:</td>
          <td class="num">Length: ${fmtNumber(totals.totalLength, 3)}</td>
          <td class="num">Roll: ${fmtNumber(totals.totalRoll, 0)}</td>
          <td class="num">Gross Weight: ${fmtNumber(totals.totalGrossWeight, 3)}</td>
          <td class="num">Net Weight: ${fmtNumber(totals.totalNetWeight, 3)}</td>
          <td class="num">CBM: ${fmtNumber(totals.totalCbm, 2)}</td>
        </tr>
      </tbody>
    </table>
  `;

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

    ${sectionsHtml}

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
