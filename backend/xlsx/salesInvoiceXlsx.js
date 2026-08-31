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
const LABEL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F7" } };

// Which theme (accent ARGB + logo) this workbook should use — same
// acq.code-driven rule as pdf/layout.js's themeFor(). logoWidth/logoHeight
// keep each logo's own real aspect ratio at the same ~150px placement
// width — the Ningbo wordmark (1600x378, ~4.23:1) is noticeably flatter
// than the HKAG one (~900x297, ~3.03:1), so a single fixed height for both
// would stretch one of them.
function themeForXlsx(acq) {
  return acq && acq.code === "NINGBO"
    ? { accentArgb: GRAY_ARGB, logo: LOGO_NINGBO, logoWidth: 150, logoHeight: 35 }
    : { accentArgb: NAVY_ARGB, logo: LOGO, logoWidth: 150, logoHeight: 50 };
}

// Widest item table (the "other goods" one) needs 8 columns — every other
// block on the sheet merges across however many of these 8 it needs.
const NUM_COLS = 8;

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
  const HEADER_RULE = { style: "medium", color: { argb: theme.accentArgb } };
  const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: theme.accentArgb } };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title === "PROFORMA INVOICE" ? "Proforma Invoice" : "Commercial Invoice", {
    views: [{ showGridLines: false }],
  });
  sheet.columns = Array.from({ length: NUM_COLS }, (_, i) => ({ key: `c${i}`, width: i === 1 ? 30 : 14 }));

  // ── Letterhead: logo + title ──────────────────────────────────────────
  sheet.mergeCells(1, 1, 1, NUM_COLS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 15, color: { argb: theme.accentArgb } };
  titleCell.alignment = { vertical: "middle", horizontal: "right" };
  sheet.getRow(1).height = 46;
  for (let c = 1; c <= NUM_COLS; c++) sheet.getCell(1, c).border = { bottom: HEADER_RULE };
  const imageId = workbook.addImage({ base64: theme.logo, extension: "png" });
  sheet.addImage(imageId, { tl: { col: 0.15, row: 0.1 }, ext: { width: theme.logoWidth, height: theme.logoHeight } });

  sheet.getRow(2).height = 6; // spacer

  // ── Number / Date ─────────────────────────────────────────────────────
  const metaRow = sheet.addRow([`Number: ${number || "—"}`, "", "", "", `Date: ${fmtDateLong(date)}`]);
  sheet.mergeCells(metaRow.number, 1, metaRow.number, 4);
  sheet.mergeCells(metaRow.number, 5, metaRow.number, NUM_COLS);
  metaRow.font = { bold: true };

  // ── Shipment meta table ───────────────────────────────────────────────
  const addMetaLine = (leftLabel, leftValue, rightLabel, rightValue) => {
    const row = sheet.addRow([`${leftLabel}: ${leftValue}`, "", "", "", `${rightLabel}: ${rightValue}`]);
    sheet.mergeCells(row.number, 1, row.number, 4);
    sheet.mergeCells(row.number, 5, row.number, NUM_COLS);
    row.eachCell(c => { c.alignment = { wrapText: true, vertical: "middle" }; });
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

  const originRow = sheet.addRow([`Country of origin and provenance: ${countryOfOrigin || "China"}.`, "", "", "", `Country of acquisition: ${acq.countryOfAcquisition}.`]);
  sheet.mergeCells(originRow.number, 1, originRow.number, 4);
  sheet.mergeCells(originRow.number, 5, originRow.number, NUM_COLS);
  originRow.font = { italic: true, color: { argb: "FF444444" } };

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

  const addTableHeader = headers => {
    const row = sheet.addRow(headers);
    row.eachCell(c => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = HEADER_FILL;
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      c.border = { top: THIN_SEP, bottom: THIN_SEP, left: THIN_SEP, right: THIN_SEP };
    });
    return row;
  };
  const addTableDataRow = values => {
    const row = sheet.addRow(values);
    row.eachCell(c => { c.border = { bottom: THIN_SEP }; c.alignment = { vertical: "middle", wrapText: true }; });
    return row;
  };
  const itemDescription = item => [item.description, item.descriptionText, ...(item.bullets || []), item.ncm ? `NCM: ${item.ncm}` : ""].filter(Boolean).join("\n");
  const itemColor = item => item.clientColorCode ? `${item.color || "—"} (${item.clientColorCode})` : (item.color || "—");

  if (textileItems.length > 0) {
    addTableHeader(["Product", "Description", "Color", "Weight", "Total Length", "Unit Price", "Total Amount"]);
    textileItems.forEach(item => {
      addTableDataRow([
        item.description, itemDescription(item), itemColor(item), item.weightSpec || "—",
        fmtNumber(item.totalLength, 0), fmtMoney(item.unitPrice, currency), fmtMoney(item.total, currency),
      ]);
    });
    sheet.addRow([]);
  }
  otherGroups.forEach(group => {
    addTableHeader(["Product", "Description", "Color", "Unit", "Quantity", "Total Weight", "Unit Price", "Total Amount"]);
    group.items.forEach(item => {
      addTableDataRow([
        item.description, itemDescription(item), itemColor(item), item.priceUnitLabel || item.width || "—",
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
    freightRow.getCell(1).alignment = { horizontal: "right" };
  }
  const summaryLabel = textileItems.length > 0
    ? `Total Length: ${fmtNumber(totalLength, 0)} m`
    : `Total Quantity: ${fmtNumber(totalQuantity, 2)}`;
  const summaryRow = sheet.addRow([`${summaryLabel}   |   Grand Total Amount: ${fmtMoney(grandTotal, currency)}`]);
  sheet.mergeCells(summaryRow.number, 1, summaryRow.number, NUM_COLS);
  summaryRow.font = { bold: true };
  summaryRow.getCell(1).alignment = { horizontal: "right" };
  summaryRow.getCell(1).fill = LABEL_FILL;

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
  for (let i = 0; i < maxLines; i++) {
    const row = sheet.addRow([]);
    columns.forEach(col => {
      const line = col.lines[i];
      if (!line || !line.text) return;
      sheet.mergeCells(row.number, col.colStart, row.number, col.colEnd);
      const cell = sheet.getCell(row.number, col.colStart);
      cell.value = line.text;
      cell.alignment = { wrapText: true, vertical: "top" };
      if (line.style === "title") {
        cell.font = { bold: true, size: 12, color: { argb: theme.accentArgb } };
        cell.border = { bottom: HEADER_RULE, top: HEADER_RULE };
      } else if (line.style === "bold") {
        cell.font = { bold: true };
      } else if (line.style === "italic") {
        cell.font = { italic: true };
      } else if (line.style === "big") {
        cell.font = { bold: true, size: 14 };
      }
    });
  }

  if (title === "PROFORMA INVOICE") {
    sheet.addRow([]);
    const noteRow = sheet.addRow(["This Proforma Invoice is issued for quote purpose only and does not constitute a sales contract."]);
    sheet.mergeCells(noteRow.number, 1, noteRow.number, NUM_COLS);
    noteRow.font = { italic: true, size: 10, color: { argb: "FF666666" } };
  }

  return workbook;
}

module.exports = { buildSalesInvoiceWorkbook };
