// Excel version of the Proforma Invoice / Commercial Invoice — same content
// as pdf/salesInvoice.js's renderSalesInvoice(), laid out as a single-sheet
// workbook instead of a printed page. Added per the client's request to be
// able to download (or e-mail) either format for these documents. Takes the
// exact same `params` shape the PDF template does, so both are built from
// the same data the routes in server.js already assemble — no separate
// param-gathering logic to keep in sync.
const ExcelJS = require("exceljs");
const LOGO = require("../pdf/logo");
const LOGO_NINGBO = require("../pdf/logoNingbo");
const { fmtDateLong, fmtNumber, fmtMoney, amountToWords, currencyLabel } = require("../pdf/helpers");

const NAVY_ARGB = "FF0D1627";
// Second, lighter-palette theme for documents issued under the Ningbo
// entity — same #58595B accent as the PDF version (pdf/layout.js), sampled
// from the client's own uploaded Alliance wordmark (pdf/logoNingbo.js).
const GRAY_ARGB = "FF58595B";
const THIN_SEP = { style: "thin", color: { argb: "FFCCCCCC" } };
const DARK_RULE = { style: "thin", color: { argb: "FF333333" } };
const LABEL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F7" } };
// Same light card background the PDF's footer-grid/check-band use (see
// pdf/layout.js's .check-band/.footer-grid .card — #f0f1f3/#f7f8fa, close
// enough to read as the same "card" without needing two near-identical
// grays here).
const CARD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
// One font-size scale, reused everywhere instead of ad-hoc numbers per
// call site — mirrors the PDF's own size steps (see pdf/layout.js's
// baseCss): body text, small print, section headings, and the two "hero"
// moments (title bar, Total Invoice Value).
const FS = { body: 10, small: 9, heading: 11, title: 14, hero: 16 };

// Row heights used to build the letterhead's company-name/address/phone
// block (see companyLines.forEach below) — shared with themeForXlsx's own
// vertical-centering math so the two can never drift out of sync with each
// other.
const NAME_ROW_H = 26;
const OTHER_ROW_H = 18;
const SPACER_ROW_H = 10;

// Which theme (accent ARGB + logo) this workbook should use — same
// acq.code-driven rule as pdf/layout.js's themeFor(). logoWidth/logoHeight
// keep each logo's own real aspect ratio at the same ~260px placement
// width — the Ningbo wordmark (1600x378, ~4.23:1) is noticeably flatter
// than the HKAG one (~900x297, ~3.03:1), so a single fixed height for both
// would stretch one of them. Bumped up from an earlier, still-too-small
// 200px per the client's feedback that it needed to read as clearly as the
// PDF's own logo, not a small icon tucked in the corner.
//
// logoRowOffset vertically centers the logo against the WHOLE letterhead
// text block (name + address + tel, plus email/website for HK) instead of
// pinning it to the top of the first row — HK's block has 2 extra lines
// (email/website Ningbo doesn't have), so it needs a bigger offset to land
// centered. Expressed as a fraction of the name row's own height since
// ExcelJS's image anchor scales a fractional `row` by that specific row's
// height, and the computed offset always stays within that first row for
// both entities (verified below — never exceeds NAME_ROW_H).
function themeForXlsx(acq) {
  const isNingbo = acq && acq.code === "NINGBO";
  const base = isNingbo
    ? { accentArgb: GRAY_ARGB, logo: LOGO_NINGBO, logoWidth: 260, logoHeight: 61 }
    : { accentArgb: NAVY_ARGB, logo: LOGO, logoWidth: 260, logoHeight: 86 };
  const numLines = 1 + [acq?.addressLine, acq?.tel, acq?.email, acq?.website].filter(Boolean).length;
  const blockHeight = NAME_ROW_H + (numLines - 1) * OTHER_ROW_H + SPACER_ROW_H;
  const offsetPts = Math.max(0, (blockHeight - base.logoHeight) / 2);
  return { ...base, logoRowOffset: Math.min(0.9, offsetPts / NAME_ROW_H) };
}

// Widest item table (the "other goods" one, now with Thickness — see
// itemSections.js's showThickness) needs 9 columns — every other block on
// the sheet merges across however many of these 9 it needs.
const NUM_COLS = 9;

// Per-column widths, sized for what actually lands in each one across both
// item tables — Description is by far the longest (full product text +
// NCM), Product needs enough room for a two-line wrap of "NAME (CODE: X)"
// instead of the cramped 3-4 line wrap a generic width produced, and the
// short categorical columns (Color/Thickness/Unit) only need to fit a
// couple of words.
const COL_WIDTHS = [20, 38, 11, 10, 11, 15, 12, 12, 14];

// "TT payment" is only a sensible trigger when the chosen Payment Terms
// actually has an advance/deposit leg — see pdf/salesInvoice.js's daysOrNote
// for the full reasoning. Terms with no advance (100%DP BL, 100% ARRIVAL,
// 100% AFTER D. SALE) fall back to the Proforma Invoice being signed.
function daysOrNote(value, fallback, paymentTerms) {
  const v = (value === undefined || value === null || value === "") ? fallback : value;
  if (!/^\d+$/.test(String(v).trim())) return String(v);
  const trigger = /ADV/i.test(paymentTerms || "") ? "TT payment" : "the Proforma Invoice is signed";
  return `${v} days after ${trigger}.`;
}

function buildSalesInvoiceWorkbook(params) {
  const {
    title, number, date, wayOfShipment, countryOfOrigin, portOfOrigin, portOfDestination,
    incoterm, acq, manufacturer, items, totalLength, totalWeight, totalQuantity, totalAmount, currency,
    paymentTerms, productionDays, deliveryDays, importer, consignee, notifyParty,
    extraShipmentLine, extraShipmentLineLabel, validity, freightValue,
  } = params;

  // Same CIF freight handling as the PDF (pdf/salesInvoice.js) — separate
  // line, folded into every grand-total figure shown below.
  const freight = parseFloat(freightValue) || 0;
  const grandTotal = (parseFloat(totalAmount) || 0) + freight;

  // Navy/HKAG vs. gray/Ningbo — same acq.code rule as the PDF version.
  const theme = themeForXlsx(acq);
  const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: theme.accentArgb } };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title === "PROFORMA INVOICE" ? "Proforma Invoice" : "Commercial Invoice", {
    views: [{ showGridLines: false }],
  });
  sheet.columns = COL_WIDTHS.map((width, i) => ({ key: `c${i}`, width }));

  // ── Letterhead: logo (left) + company name/address/phone (right) ───────
  // Mirrors the PDF's own header block (see pdf/layout.js's renderHeader) —
  // the company's own name/address/contact belongs up here, not the
  // document title, which gets its own full-width bar right below instead
  // (same as the PDF's .title-bar).
  const imageId = workbook.addImage({ base64: theme.logo, extension: "png" });
  sheet.addImage(imageId, { tl: { col: 0.15, row: theme.logoRowOffset }, ext: { width: theme.logoWidth, height: theme.logoHeight } });

  const companyLines = [
    { text: acq.name, bold: true, size: FS.title, color: theme.accentArgb },
    ...(acq.addressLine ? [{ text: acq.addressLine, size: FS.small, color: "FF555555" }] : []),
    ...(acq.tel ? [{ text: `Tel.: ${acq.tel}`, size: FS.small, color: "FF555555" }] : []),
    ...(acq.email ? [{ text: acq.email, size: FS.small, color: "FF555555" }] : []),
    ...(acq.website ? [{ text: acq.website, size: FS.small, color: "FF555555" }] : []),
  ];
  companyLines.forEach((line, i) => {
    const row = sheet.addRow([]);
    // Taller than the surrounding body rows, on purpose — the logo (see
    // themeForXlsx above, now a full 86pt/61pt tall) needs the whole
    // letterhead block tall enough that it never runs into the title bar
    // underneath it, especially for Ningbo's shorter 3-line block (name/
    // address/tel only, no email/site — 4 rows total incl. spacer vs.
    // HK's 6) which has less natural height to work with. Same NAME_ROW_H/
    // OTHER_ROW_H constants themeForXlsx used to compute logoRowOffset
    // above — keep these two in sync if either changes.
    row.height = i === 0 ? NAME_ROW_H : OTHER_ROW_H;
    sheet.mergeCells(row.number, 4, row.number, NUM_COLS);
    const cell = sheet.getCell(row.number, 4);
    cell.value = line.text;
    cell.font = { bold: !!line.bold, size: line.size, color: { argb: line.color } };
    cell.alignment = { vertical: "middle", horizontal: "right" };
  });
  sheet.addRow([]).height = SPACER_ROW_H; // spacer

  // ── Title bar — full-width accent bar, same as the PDF's .title-bar ────
  const titleRow = sheet.addRow([title]);
  titleRow.height = 24;
  sheet.mergeCells(titleRow.number, 1, titleRow.number, NUM_COLS);
  const titleBarCell = sheet.getCell(titleRow.number, 1);
  titleBarCell.font = { bold: true, size: FS.title, color: { argb: "FFFFFFFF" } };
  titleBarCell.alignment = { vertical: "middle", horizontal: "center" };
  titleBarCell.fill = HEADER_FILL;

  sheet.addRow([]).height = 6; // spacer

  // ── Number / Date ─────────────────────────────────────────────────────
  // Bordered top/bottom, same as the PDF's .doc-meta-row — reads as its own
  // distinct strip sitting right under the title bar, not just another line
  // of body text.
  const metaRow = sheet.addRow([`Number: ${number || "—"}`, "", "", "", `Date: ${fmtDateLong(date)}`]);
  sheet.mergeCells(metaRow.number, 1, metaRow.number, 4);
  sheet.mergeCells(metaRow.number, 5, metaRow.number, NUM_COLS);
  metaRow.eachCell(c => {
    c.font = { bold: true, size: FS.body };
    c.border = { top: DARK_RULE, bottom: DARK_RULE };
    c.alignment = { vertical: "middle" };
  });

  // ── Shipment meta table ───────────────────────────────────────────────
  // Thin hairline between rows (matches the PDF's meta-table), plus a
  // heavier top/bottom rule around the whole block — added below, once the
  // last row (Manufacturer Address) is known.
  const addMetaLine = (leftLabel, leftValue, rightLabel, rightValue) => {
    const row = sheet.addRow([`${leftLabel}: ${leftValue}`, "", "", "", `${rightLabel}: ${rightValue}`]);
    sheet.mergeCells(row.number, 1, row.number, 4);
    sheet.mergeCells(row.number, 5, row.number, NUM_COLS);
    row.eachCell(c => { c.font = { size: FS.small }; c.alignment = { wrapText: true, vertical: "middle" }; c.border = { top: THIN_SEP }; });
    return row;
  };
  // Same Port-vs-Airport label switch as the PDF (pdf/salesInvoice.js) —
  // the value already comes through correctly from the airport picker on
  // the form, this just makes the label next to it say the right thing.
  const isAir = wayOfShipment === "By Air";
  const originLabel = isAir ? "Airport Of Origin" : "Port Of Origin";
  const destinationLabel = isAir ? "Airport Of Destination" : "Port Of Destination";

  addMetaLine("Way Of Shipment", wayOfShipment || "By Sea", "Country Of Origin", countryOfOrigin || "China");
  addMetaLine(originLabel, portOfOrigin || "—", "Incoterm", incoterm || "—");
  addMetaLine(destinationLabel, portOfDestination || "—", "Manufacturer", manufacturer?.name || "—");
  const mfgAddrRow = sheet.addRow([`Manufacturer Address: ${manufacturer?.address || "—"}${manufacturer?.tel ? ` | Tel.: ${manufacturer.tel}` : ""}`]);
  sheet.mergeCells(mfgAddrRow.number, 1, mfgAddrRow.number, NUM_COLS);
  // Closes the meta-table block with the same heavier rule its top border
  // (on the very first addMetaLine row, set above) opened with — the whole
  // Way Of Shipment→Manufacturer Address block reads as one bordered unit.
  mfgAddrRow.eachCell(c => { c.font = { size: FS.small }; c.border = { top: THIN_SEP, bottom: DARK_RULE }; c.alignment = { wrapText: true, vertical: "middle" }; });

  const originRow = sheet.addRow([`Country of origin and provenance: ${countryOfOrigin || "China"}.`, "", "", "", `Country of acquisition: ${acq.countryOfAcquisition}.`]);
  sheet.mergeCells(originRow.number, 1, originRow.number, 4);
  sheet.mergeCells(originRow.number, 5, originRow.number, NUM_COLS);
  originRow.eachCell(c => {
    c.font = { italic: true, size: FS.small, color: { argb: "FF444444" } };
    c.fill = CARD_FILL;
    c.alignment = { vertical: "middle" };
  });
  sheet.getRow(originRow.number).height = 18;

  sheet.addRow([]); // spacer

  // ── Items table(s) — same category split as the PDF (itemSections.js) ──
  const textileItems = items.filter(i => i.isTextile);
  const otherItems = items.filter(i => !i.isTextile);
  const otherGroups = [];
  otherItems.forEach(item => {
    const key = item.category || "Other";
    let group = otherGroups.find(g => g.key === key);
    if (!group) { group = { key, items: [] }; otherGroups.push(group); }
    group.items.push(item);
  });

  // The Textile item table only has 8 real columns (no Unit/Quantity split
  // the "Other goods" table needs) against this sheet's 9-column grid — left
  // as-is, its header fill and every row's bottom rule stopped one column
  // short of the right edge, unlike the title bar/meta rows above it which
  // all span the full NUM_COLS width. Padding every header/data row out to
  // NUM_COLS with a blank trailing cell (still styled — fill, border — just
  // no text) makes the whole table's lines reach the same right edge as
  // everything else on the sheet.
  const pad = arr => { const a = arr.slice(); while (a.length < NUM_COLS) a.push(""); return a; };

  const addTableHeader = headers => {
    const row = sheet.addRow(pad(headers));
    // No fixed height here on purpose — a couple of these headers ("Total
    // Length", "Total Weight") wrap onto two lines at these column widths,
    // and a fixed height would clip the second line instead of letting
    // Excel size the row to fit it.
    row.eachCell(c => {
      c.font = { bold: true, size: FS.small, color: { argb: "FFFFFFFF" } };
      c.fill = HEADER_FILL;
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      c.border = { top: THIN_SEP, bottom: THIN_SEP, left: THIN_SEP, right: THIN_SEP };
    });
    return row;
  };
  // Column 1 (Product) and every column from 3 onward (Color, Thickness,
  // Unit/Weight, Quantity/Total Length, Total Weight, Unit Price, Total
  // Amount) read as a tidy grid when centered — same as the PDF's own
  // "center"/"num" cell classes (see itemSections.js). Column 2
  // (Description) is the one full paragraph of running text, so it stays
  // left-aligned and top-anchored instead of vertically centered against
  // the row's tallest cell.
  const addTableDataRow = values => {
    const row = sheet.addRow(pad(values));
    row.eachCell((c, colNumber) => {
      c.font = { size: FS.small, bold: colNumber === 1 };
      c.border = { bottom: THIN_SEP };
      c.alignment = colNumber === 2
        ? { vertical: "top", horizontal: "left", wrapText: true }
        : { vertical: "middle", horizontal: "center", wrapText: true };
    });
    return row;
  };
  // Product name is NOT repeated here — it already has its own Product
  // column (column 1) — only the description paragraph, bullets and NCM
  // line belong in this cell. Previously included item.description again as
  // this cell's first line, which both duplicated the name and padded every
  // row with an extra line it didn't need (contributing to the "too tall"
  // rows the PDF doesn't have — its own descCell() never repeats the name
  // either, see itemSections.js).
  const itemDescription = item => [item.descriptionText, ...(item.bullets || []), item.ncm ? `NCM: ${item.ncm}` : ""].filter(Boolean).join("\n");
  const itemColor = item => item.clientColorCode ? `${item.color || "—"} (${item.clientColorCode})` : (item.color || "—");

  // Thickness column — same "value+unit" string Contract PDF already prints
  // (item.thickness, sourced from the product in normalizeSalesItem) — shown
  // here and on the PDF version (see pdf/itemSections.js's showThickness),
  // not on the Quotation.
  if (textileItems.length > 0) {
    addTableHeader(["Product", "Description", "Color", "Thickness", "Weight", "Total Length", "Unit Price", "Total Amount"]);
    textileItems.forEach(item => {
      addTableDataRow([
        item.description, itemDescription(item), itemColor(item), item.thickness || "—", item.weightSpec || "—",
        fmtNumber(item.totalLength, 0), fmtMoney(item.unitPrice, currency), fmtMoney(item.total, currency),
      ]);
    });
    sheet.addRow([]);
  }
  otherGroups.forEach(group => {
    addTableHeader(["Product", "Description", "Color", "Thickness", "Unit", "Quantity", "Total Weight", "Unit Price", "Total Amount"]);
    group.items.forEach(item => {
      addTableDataRow([
        item.description, itemDescription(item), itemColor(item), item.thickness || "—", item.priceUnitLabel || item.width || "—",
        item.quantityLabel || (item.quantity != null ? `${item.quantity} ${item.unit || ""}`.trim() : "—"),
        (item.category === "Chemical" && item.priceBasis !== "ton") ? (item.totalWeight ? `${fmtNumber(item.totalWeight, 1)} kg` : "—") : "",
        fmtMoney(item.unitPrice, currency), fmtMoney(item.total, currency),
      ]);
    });
    sheet.addRow([]);
  });

  if (freight > 0) {
    const freightRow = sheet.addRow([`Total CIF Freight: ${fmtMoney(freight, currency)}`]);
    sheet.mergeCells(freightRow.number, 1, freightRow.number, NUM_COLS);
    freightRow.getCell(1).font = { size: FS.small };
    freightRow.getCell(1).alignment = { horizontal: "right" };
  }
  const summaryLabel = textileItems.length > 0
    ? `Total Length: ${fmtNumber(totalLength, 0)} m`
    : `Total Quantity: ${fmtNumber(totalQuantity, 2)}`;
  const summaryRow = sheet.addRow([`${summaryLabel}   |   Grand Total Amount: ${fmtMoney(grandTotal, currency)}`]);
  sheet.mergeCells(summaryRow.number, 1, summaryRow.number, NUM_COLS);
  summaryRow.height = 20;
  summaryRow.getCell(1).font = { bold: true, size: FS.body };
  summaryRow.getCell(1).alignment = { vertical: "middle", horizontal: "right" };
  summaryRow.getCell(1).fill = LABEL_FILL;
  summaryRow.getCell(1).border = { top: { style: "medium", color: { argb: theme.accentArgb } } };

  sheet.addRow([]);

  // ── Footer: Order Information | Bank Information | Importer/Consignee ──
  // Same 3-column arrangement as the PDF's footer-grid (see salesInvoice.js)
  // instead of three separate full-width blocks stacked one under another —
  // per the client's feedback that the first version's layout here didn't
  // read like the PDF. Each column is built as its own list of "lines"
  // first, then written row-by-row in parallel so they line up side by
  // side; columns of different length just leave the shorter ones blank
  // for the remaining rows.
  const title_ = { style: "title" };
  const bold_ = { style: "bold" };
  const italic_ = { style: "italic" };
  const big_ = { style: "big" };

  const orderLines = [
    { text: "Order Information", ...title_ },
    { text: `1. Payment terms: ${paymentTerms || "100% on BL copy"}.` },
    { text: `2. End date of production: ${daysOrNote(productionDays, "28", paymentTerms)}` },
    { text: `3. Goods delivered: ${portOfOrigin || "—"}.` },
    { text: `4. Delivery date at ${(portOfOrigin || "origin port").split(",")[0]}: ${daysOrNote(deliveryDays, "33", paymentTerms)}` },
  ];
  if (extraShipmentLine) {
    orderLines.push({ text: `5. Packing List Description${extraShipmentLineLabel ? `: ${extraShipmentLineLabel}` : ""}`, ...bold_ });
    const lines = Array.isArray(extraShipmentLine) ? extraShipmentLine : [extraShipmentLine];
    lines.forEach(l => orderLines.push({ text: `     ${l}.` }));
  }
  orderLines.push(
    { text: "" },
    { text: "Total Invoice Value", ...title_ },
    { text: `${currencyLabel(currency)} ${fmtNumber(grandTotal, 2)}`, ...big_ },
    { text: amountToWords(grandTotal, currency), ...italic_ },
  );
  if (title === "PROFORMA INVOICE" && validity) {
    orderLines.push(
      { text: "" },
      { text: "Quotation Validity", ...title_ },
      { text: `This Proforma Invoice is valid until ${fmtDateLong(validity)}.` },
    );
  }

  const bankLines = [
    { text: "Bank Information", ...title_ },
    { text: `Beneficiary Name: ${acq.bank.beneficiary}` },
    { text: `Address: ${acq.bank.address}` },
    { text: `Account Number: ${acq.bank.account}` },
    { text: `Bank Name: ${acq.bank.bankName}` },
    { text: `Bank SWIFT: ${acq.bank.swift}` },
  ];

  const partyLinesFor = (heading, party) => [
    { text: heading, ...title_ },
    { text: party.name || "—", ...bold_ },
    { text: party.address || "—" },
    ...(party.taxId ? [{ text: `Tax ID / CNPJ: ${party.taxId}` }] : []),
    ...(party.tel ? [{ text: `Tel.: ${party.tel}` }] : []),
  ];
  let partyLines;
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
    partyLines = groups.flatMap(g => [...partyLinesFor(g.roles.join(" / "), g.party), { text: "" }]);
  } else {
    partyLines = partyLinesFor("Importer / Consignee / Notify Party", importer).concat([{ text: "" }]);
  }
  partyLines.push(
    { text: `Authorized by: ${acq.name}`, ...bold_ },
    { text: "Authorized signature: _______________________________" },
  );

  const columns = [
    { colStart: 1, colEnd: 3, lines: orderLines },
    { colStart: 4, colEnd: 6, lines: bankLines },
    { colStart: 7, colEnd: NUM_COLS, lines: partyLines },
  ];
  const maxLines = Math.max(...columns.map(c => c.lines.length));
  const sectionRule = { style: "thin", color: { argb: theme.accentArgb } };
  for (let i = 0; i < maxLines; i++) {
    const row = sheet.addRow([]);
    columns.forEach(col => {
      sheet.mergeCells(row.number, col.colStart, row.number, col.colEnd);
      const cell = sheet.getCell(row.number, col.colStart);
      // Light fill across every row of the column, even blank ones — reads
      // as one shaded card stretching the full height of the tallest
      // column, same as the PDF's .footer-grid .card (which uses CSS flex
      // align-items:stretch so all three cards line up edge-to-edge).
      cell.fill = CARD_FILL;
      cell.alignment = { wrapText: true, vertical: "top", horizontal: "left", indent: 1 };
      const line = col.lines[i];
      if (!line || !line.text) return;
      cell.value = line.text;
      if (line.style === "title") {
        // Single bottom rule (not a boxed top+bottom pair) — reads as an
        // underlined heading, same as the PDF's plain bold card-title text.
        cell.font = { bold: true, size: FS.heading, color: { argb: theme.accentArgb } };
        cell.border = { bottom: sectionRule };
      } else if (line.style === "bold") {
        cell.font = { bold: true, size: FS.small };
      } else if (line.style === "italic") {
        cell.font = { italic: true, size: FS.small, color: { argb: "FF666666" } };
      } else if (line.style === "big") {
        cell.font = { bold: true, size: FS.hero, color: { argb: theme.accentArgb } };
        cell.alignment = { ...cell.alignment, horizontal: "center", indent: 0 };
      } else {
        cell.font = { size: FS.small };
      }
    });
  }

  if (title === "PROFORMA INVOICE") {
    sheet.addRow([]);
    const noteRow = sheet.addRow(["This Proforma Invoice is issued for quote purpose only and does not constitute a sales contract."]);
    sheet.mergeCells(noteRow.number, 1, noteRow.number, NUM_COLS);
    noteRow.getCell(1).font = { italic: true, size: FS.small, color: { argb: "FF888888" } };
    noteRow.getCell(1).alignment = { horizontal: "center" };
    noteRow.getCell(1).border = { top: THIN_SEP };
  }

  return workbook;
}

module.exports = { buildSalesInvoiceWorkbook };
