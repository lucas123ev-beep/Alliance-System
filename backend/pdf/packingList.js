const { wrapDocument, icon, applyTheme } = require("./layout");
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

// Product name and description are two separate columns (matching the
// client's own reference documents), not name-plus-paragraph stacked in one
// cell — NCM and any extra facts (CAS number, etc.) print as their own
// plain lines under the description, same as the reference documents
// (flush-left, no bullet marker/indent — see .desc-line in layout.js).
const nameCell = item => `<td class="center"><strong>${escapeHtml(item.description)}</strong></td>`;
// item.descriptionIsHtml (set by buildPackingListDraft on the frontend,
// same convention as server.js's splitDescription for Proforma/Commercial
// Invoice) means this came from the RichTextEditor toolbar, not hand-typed
// text — safe to render as trusted HTML instead of escaping it.
const descCell = item => `
  <td>
    ${item.descriptionText
      ? (item.descriptionIsHtml
          ? `<div class="desc-text">${item.descriptionText}</div>`
          : `<p class="desc-text">${escapeHtml(item.descriptionText)}</p>`)
      : ""}
    ${(item.bullets || []).map(b => `<p class="desc-line">${escapeHtml(b)}</p>`).join("")}
    ${item.ncm ? `<p class="desc-line"><strong>NCM: ${escapeHtml(item.ncm)}</strong></p>` : ""}
  </td>
`;

const sumOf = (arr, key) => arr.reduce((s, i) => s + (parseFloat(i[key]) || 0), 0);

// The per-container TOTAL and final GRAND TOTAL rows print as their own
// small standalone table below the item table(s), not as one more row
// inside them — but a <table> with no explicit widths lets the browser
// auto-distribute its columns independently of whatever's above it, so
// without this the two never lined up (Packages/Gross Weight/Net Weight/
// CBM in the totals row would drift out from under their own columns).
// Mirrors the exact same percentages as the textile table or the "other"
// (Chemical/Machine/Accessory/...) table in renderItemSections above,
// whichever this group of items actually used, so the browser lands each
// value at the same on-page position as the column it's summarizing.
// `sums` is whatever the caller already computed (sumOf() over just this
// container's items, or the document-level `totals` param for the grand
// total) — kept as plain numbers rather than an item list so the two
// callers below don't have to agree on where the figures come from.
function renderTotalsTable(label, sums, hasTextile, marginTop) {
  // Bare values only, same as SUBTOTAL right above it — the column position
  // (matching widths) already says what each number is, so repeating
  // "Packages:"/"Gross Weight:"/etc. in every cell just wrapped onto a
  // second line at these widths and pushed the actual number off-center.
  const lengthCell = hasTextile
    ? `<td class="num" style="width:9%">${fmtNumber(sums.length, 0)}</td>`
    : `<td style="width:9%"></td>`;
  const labelWidth = hasTextile ? 56 : 52;
  const packagesWidth = hasTextile ? 8 : 9;
  const weightWidth = hasTextile ? 9 : 10;
  return `
    <table class="items-table" style="margin-top:${marginTop};">
      <tbody>
        <tr class="totals-row">
          <td style="width:${labelWidth}%">${label}</td>
          ${lengthCell}
          <td class="num" style="width:${packagesWidth}%">${fmtNumber(sums.roll, 0)}</td>
          <td class="num" style="width:${weightWidth}%">${fmtNumber(sums.gross, 3)}</td>
          <td class="num" style="width:${weightWidth}%">${fmtNumber(sums.net, 3)}</td>
          <td class="num" style="width:${weightWidth}%">${fmtNumber(sums.cbm, 2)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

// Renders the (up to) two category tables — Textile/DTF Film with a Total
// Length column, everything else with a Quantity column — for one group of
// items. Used both for a whole Packing List (no container split) and for a
// single container's slice of items (multi-container split), so the split
// logic doesn't have to be duplicated.
function renderItemSections(items) {
  const textileItems = items.filter(isTextileItem);
  const otherItems = items.filter(i => !isTextileItem(i));

  // Non-Textile items still split into their own group per category (e.g.
  // Accessory vs Other) when more than one is present — same reasoning as
  // the Commercial Invoice/Proforma: an LED item and a towel lumped into
  // one table with no separation reads as confusing. Collapses back to a
  // single plain table when everything shares one category (the common
  // case), unchanged from before.
  const otherGroups = [];
  otherItems.forEach(item => {
    const key = item.category || "Other";
    let group = otherGroups.find(g => g.key === key);
    if (!group) { group = { key, items: [] }; otherGroups.push(group); }
    group.items.push(item);
  });
  const separateOtherGroups = otherGroups.length > 1;

  const textileRows = textileItems.map(item => `
    <tr>
      ${nameCell(item)}
      ${descCell(item)}
      <td class="center">${escapeHtml(item.color || "—")}${item.clientColorCode ? `<div style="font-size:10px; color:#666; margin-top:2px;">${escapeHtml(item.clientColorCode)}</div>` : ""}</td>
      <td class="center">${escapeHtml(item.width || "—")}</td>
      <td class="center">${escapeHtml(item.weightSpec || "—")}</td>
      <td class="num">${fmtNumber(item.totalLength, 0)}</td>
      <td class="num">${fmtNumber(item.roll, 0)}</td>
      <td class="num">${fmtNumber(item.grossWeight, 3)}</td>
      <td class="num">${fmtNumber(item.netWeight, 3)}</td>
      <td class="num">${fmtNumber(item.cbm, 2)}</td>
    </tr>
  `).join("");

  const otherRowsFor = groupItems => groupItems.map(item => `
    <tr>
      ${nameCell(item)}
      ${descCell(item)}
      <td class="center">${escapeHtml(item.color || "—")}${item.clientColorCode ? `<div style="font-size:10px; color:#666; margin-top:2px;">${escapeHtml(item.clientColorCode)}</div>` : ""}</td>
      <td class="center">${escapeHtml(item.priceUnitLabel || item.width || "—")}</td>
      <td class="center">${item.quantityLabel
        ? escapeHtml(item.quantityLabel)
        : item.quantity != null ? escapeHtml(`${item.quantity} ${item.unit || ""}`.trim()) : "—"}</td>
      <td class="num">${fmtNumber(item.roll, 0)}${item.packageType ? `<div style="font-size:9px;color:#666;margin-top:2px;font-weight:normal;">${escapeHtml(item.packageType)}</div>` : ""}</td>
      <td class="num">${fmtNumber(item.grossWeight, 3)}</td>
      <td class="num">${fmtNumber(item.netWeight, 3)}</td>
      <td class="num">${fmtNumber(item.cbm, 2)}</td>
    </tr>
  `).join("");

  // Column widths are all explicit percentages (not left to auto-distribute)
  // so Description can take a noticeably wider share — same reasoning as
  // salesInvoice.js: the short columns (Color, Roll, CBM...) hold single
  // short values and don't need much room, freeing up space for more words
  // per description line before wrapping. Page size itself is untouched
  // (still plain A4 from render.js).
  let html = "";

  if (textileItems.length > 0) {
    html += `
    <table class="items-table" style="margin-top:6px;">
      <thead>
        <tr>
          <th style="width:14%">Product</th>
          <th style="width:22%">Description</th>
          <th style="width:6%">Color</th>
          <th style="width:7%">Width</th>
          <th style="width:7%">Weight</th>
          <th style="width:9%">Total Length</th>
          <th style="width:8%">Roll</th>
          <th style="width:9%">Gross Weight</th>
          <th style="width:9%">Net Weight</th>
          <th style="width:9%">CBM</th>
        </tr>
      </thead>
      <tbody>
        ${textileRows}
        <tr class="totals-row">
          <td colspan="5">SUBTOTAL:</td>
          <td class="num">${fmtNumber(sumOf(textileItems, "totalLength"), 0)}</td>
          <td class="num">${fmtNumber(sumOf(textileItems, "roll"), 0)}</td>
          <td class="num">${fmtNumber(sumOf(textileItems, "grossWeight"), 3)}</td>
          <td class="num">${fmtNumber(sumOf(textileItems, "netWeight"), 3)}</td>
          <td class="num">${fmtNumber(sumOf(textileItems, "cbm"), 2)}</td>
        </tr>
      </tbody>
    </table>
  `;
  }

  otherGroups.forEach((group, idx) => {
    // Later groups (2nd category onward) get extra top spacing only — no
    // line, no category text, same treatment as the Commercial Invoice/
    // Proforma tables: just enough of a gap to read as a new group.
    const isNewSection = separateOtherGroups && idx > 0;
    html += `
    <table class="items-table" style="margin-top:${isNewSection ? "12px" : "6px"};">
      <thead>
        <tr>
          <th style="width:14%">Product</th>
          <th style="width:23%">Description</th>
          <th style="width:7%">Color</th>
          <th style="width:8%">Unit</th>
          <th style="width:9%">Quantity</th>
          <th style="width:9%">Packages</th>
          <th style="width:10%">Gross Weight</th>
          <th style="width:10%">Net Weight</th>
          <th style="width:10%">CBM</th>
        </tr>
      </thead>
      <tbody>
        ${otherRowsFor(group.items)}
        <tr class="totals-row">
          <td colspan="4">SUBTOTAL:</td>
          <td></td>
          <td class="num">${fmtNumber(sumOf(group.items, "roll"), 0)}</td>
          <td class="num">${fmtNumber(sumOf(group.items, "grossWeight"), 3)}</td>
          <td class="num">${fmtNumber(sumOf(group.items, "netWeight"), 3)}</td>
          <td class="num">${fmtNumber(sumOf(group.items, "cbm"), 2)}</td>
        </tr>
      </tbody>
    </table>
  `;
  });

  return html;
}

function renderPackingList(params) {
  const {
    number, date, wayOfShipment, countryOfOrigin, portOfOrigin, portOfDestination,
    incoterm, acq, manufacturer, items, totals, importer, containers,
  } = params;

  // Picks navy/HKAG vs. gray/Ningbo for every icon() call below — must run
  // before any of the body-building template literals execute.
  applyTheme(acq);

  // Every registered container — even just one — gets its own "Container
  // 0N: <code>" header and TOTAL row; this used to only kick in above 1
  // container, which silently dropped the container code from single-
  // container Packing Lists (the common case). Only falls back to the old
  // plain single-table rendering when there's truly no container registered
  // at all (older Packing Lists saved before this existed).
  const hasContainerSplit = Array.isArray(containers) && containers.length >= 1;

  let sectionsHtml = "";

  if (hasContainerSplit) {
    containers.forEach(c => {
      // Skip zero-roll rows — those exist in the saved draft purely so the
      // allocation screen could offer every item in every container to move
      // between them; a row nobody actually allocated here shouldn't print.
      const containerItems = items.filter(i => (i.container_seq || 1) === c.seq && (parseFloat(i.roll) || 0) > 0);
      if (containerItems.length === 0) return;
      // Length only means anything when this container actually has a
      // Textile/DTF Film item in it — a Chemical/Accessory-only container
      // showing "Length: 0" reads as meaningless noise, so the cell is
      // dropped entirely rather than printed as a stray zero.
      const containerHasTextile = containerItems.some(isTextileItem);
      sectionsHtml += `
        <div class="section-bar" style="margin-top:14px;">Container ${String(c.seq).padStart(2, "0")}: ${escapeHtml(c.code || "—")}</div>
        ${renderItemSections(containerItems)}
        ${renderTotalsTable("TOTAL:", {
          length: sumOf(containerItems, "totalLength"),
          roll: sumOf(containerItems, "roll"),
          gross: sumOf(containerItems, "grossWeight"),
          net: sumOf(containerItems, "netWeight"),
          cbm: sumOf(containerItems, "cbm"),
        }, containerHasTextile, "0")}
      `;
    });
  } else {
    sectionsHtml += renderItemSections(items);
  }

  // Extra breathing room above this one — it's a document-level summary
  // (every container combined), not just another per-container TOTAL row,
  // so it needs to visibly stand apart from the last container's block
  // instead of reading as one more row crammed onto the end of it.
  const anyTextile = items.some(isTextileItem);
  sectionsHtml += renderTotalsTable("GRAND TOTAL:", {
    length: totals.totalLength,
    roll: totals.totalRoll,
    gross: totals.totalGrossWeight,
    net: totals.totalNetWeight,
    cbm: totals.totalCbm,
  }, anyTextile, "22px");

  // Same Port-vs-Airport label switch as the Proforma/Commercial Invoice
  // PDF — Packing List has its own Way Of Shipment field too.
  const isAir = wayOfShipment === "By Air";
  const originLabel = isAir ? "Airport Of Origin" : "Port Of Origin";
  const destinationLabel = isAir ? "Airport Of Destination" : "Port Of Destination";

  const body = `
    <div class="doc-meta-row">
      <div><strong>Number:</strong> ${escapeHtml(number)}</div>
      <div><strong>Date:</strong> ${fmtDateLong(date)}</div>
    </div>
    <table class="meta-table">
      <tr><td>${icon("ship")}<strong>Way Of Shipment:</strong> ${escapeHtml(wayOfShipment || "By Sea")}.</td>
          <td>${icon("world")}<strong>Country Of Origin:</strong> ${escapeHtml(countryOfOrigin || "China")}.</td></tr>
      <tr><td>${icon("anchor")}<strong>${originLabel}:</strong> ${escapeHtml(portOfOrigin || "—")}.</td>
          <td>${icon("file")}<strong>Incoterm:</strong> ${escapeHtml(incoterm || "—")}</td></tr>
      <tr><td>${icon("ship")}<strong>${destinationLabel}:</strong> ${escapeHtml(portOfDestination || "—")}.</td>
          <td>${icon("building")}<strong>Manufacturer:</strong> ${escapeHtml(manufacturer.name || "—")}</td></tr>
      <tr><td colspan="2">${icon("building")}<strong>Manufacturer Address:</strong> ${escapeHtml(manufacturer.address || "—")}${manufacturer.tel ? ` | Tel.: ${escapeHtml(manufacturer.tel)}` : ""}</td></tr>
    </table>
    <div class="check-band">
      <div class="col">${icon("check")}<strong>Country of origin and provenance:</strong> ${escapeHtml(countryOfOrigin || "China")}.</div>
      <div class="col">${icon("check")}<strong>Country of acquisition:</strong> ${escapeHtml(acq.countryOfAcquisition)}.</div>
    </div>

    ${sectionsHtml}

    <div class="section-bar" style="margin-top:10px;">${icon("user", "#fff")}Shipment Details</div>
    <div style="padding:10px 14px;">
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
