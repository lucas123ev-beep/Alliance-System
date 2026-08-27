const { escapeHtml, fmtNumber, fmtMoney } = require("./helpers");

// Splits a normalized item list into the same category-aware table groups
// used across every client-facing document: Textile/DTF Film rolls (quoted
// by the meter — Total Length column) versus everything else (Chemical,
// Machine, Accessory... quoted per drum/crate/unit — Quantity + Total
// Weight columns instead), with non-Textile items further split into their
// own group per category when an order/quotation mixes more than one, so a
// Chemical item and an unrelated general-goods item never land in the same
// table. Originally lived only in salesInvoice.js (Proforma/Commercial
// Invoice); pulled out here so the Quotation PDF can reuse the exact same
// per-category peculiarities (ton-priced Chemical's drum count, Textile's
// meterage, units_per_package's "≈ N packages"...) instead of maintaining a
// second, simplified copy that would silently drift out of sync whenever
// one of those rules changes.
//
// items: same normalizeSalesItem()-shaped array every caller already builds.
// opts.showImage: prepends an Image column (thumbnail from item.imageUrl) —
// used by the Quotation PDF, which carries product photos; Proforma/
// Commercial Invoice don't set imageUrl on their items, so this stays off
// for them (unchanged output).
// Returns just the category table(s) HTML — NOT any grand-total/summary
// row, since what belongs in that row (Total Length vs Total Quantity,
// which currency/amount) differs per document and stays the caller's job.
function renderItemSections(items, currency, opts = {}) {
  const { showImage = false } = opts;

  const textileItems = items.filter(i => i.isTextile);
  const otherItems = items.filter(i => !i.isTextile);

  const otherGroups = [];
  otherItems.forEach(item => {
    const key = item.category || "Other";
    let group = otherGroups.find(g => g.key === key);
    if (!group) { group = { key, items: [] }; otherGroups.push(group); }
    group.items.push(item);
  });
  const separateOtherGroups = otherGroups.length > 1;

  const imageCell = item => `
    <td class="center">
      ${item.imageUrl
        ? `<img src="${escapeHtml(item.imageUrl)}" style="width:90px; height:90px; object-fit:cover; border-radius:5px; border:1px solid #ddd;" />`
        : `<div style="width:90px; height:90px; border:1px dashed #ccc; border-radius:5px; margin:0 auto;"></div>`}
    </td>`;
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
      ${showImage ? imageCell(item) : ""}
      ${nameCell(item)}
      ${descCell(item)}
      <td class="center">${escapeHtml(item.color || "—")}${item.clientColorCode ? `<div style="font-size:10px; color:#666; margin-top:2px;">${escapeHtml(item.clientColorCode)}</div>` : ""}</td>
      <td class="center">${escapeHtml(item.weightSpec || "—")}</td>
      <td class="num">${fmtNumber(item.totalLength, 0)}</td>
      <td class="num">${fmtMoney(item.unitPrice, currency)}</td>
      <td class="num">${fmtMoney(item.total, currency)}</td>
    </tr>
  `).join("");

  const otherRowsFor = groupItems => groupItems.map(item => `
    <tr>
      ${showImage ? imageCell(item) : ""}
      ${nameCell(item)}
      ${descCell(item)}
      <td class="center">${escapeHtml(item.color || "—")}${item.clientColorCode ? `<div style="font-size:10px; color:#666; margin-top:2px;">${escapeHtml(item.clientColorCode)}</div>` : ""}</td>
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

  const imgTh = showImage ? `<th style="width:16%">Image</th>` : "";
  const imgColAdjust = showImage ? 16 : 0;

  let sectionsHtml = "";

  if (textileItems.length > 0) {
    sectionsHtml += `
    <table class="items-table" style="margin-top:4px;">
      <thead>
        <tr>
          ${imgTh}
          <th style="width:${15 - imgColAdjust * 0.4}%">Product</th>
          <th style="width:${38 - imgColAdjust * 0.6}%">Description</th>
          <th style="width:8%">Color</th>
          <th style="width:9%">Weight</th>
          <th style="width:10%">Total Length</th>
          <th style="width:9%">Unit Price</th>
          <th style="width:11%">Total Amount</th>
        </tr>
      </thead>
      <tbody>
        ${textileRows}
      </tbody>
    </table>
  `;
  }

  otherGroups.forEach((group, idx) => {
    const isNewSection = separateOtherGroups && idx > 0;
    sectionsHtml += `
    <table class="items-table" style="margin-top:${isNewSection ? "12px" : "4px"};">
      <thead>
        <tr>
          ${imgTh}
          <th style="width:${16 - imgColAdjust * 0.4}%">Product</th>
          <th style="width:${28 - imgColAdjust * 0.6}%">Description</th>
          <th style="width:8%">Color</th>
          <th style="width:9%">Unit</th>
          <th style="width:10%">Quantity</th>
          <th style="width:10%">Total Weight</th>
          <th style="width:9%">Unit Price</th>
          <th style="width:10%">Total Amount</th>
        </tr>
      </thead>
      <tbody>
        ${otherRowsFor(group.items)}
      </tbody>
    </table>
  `;
  });

  return sectionsHtml;
}

module.exports = { renderItemSections };
