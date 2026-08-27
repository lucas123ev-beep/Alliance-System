// Excel version of the Proforma Invoice / Commercial Invoice — same content
// as pdf/salesInvoice.js's renderSalesInvoice(), laid out as a single-sheet
// workbook instead of a printed page. Added per the client's request to be
// able to download (or e-mail) either format for these documents. Takes the
// exact same `params` shape the PDF template does, so both are built from
// the same data the routes in server.js already assemble — no separate
// param-gathering logic to keep in sync.
const ExcelJS = require("exceljs");
const LOGO = require("../pdf/logo");
const { fmtDateLong, fmtNumber, fmtMoney, amountToWords, currencyLabel } = require("../pdf/helpers");

const NAVY_ARGB = "FF0D1627";
const HEADER_RULE = { style: "medium", color: { argb: NAVY_ARGB } };
const THIN_SEP = { style: "thin", color: { argb: "FFCCCCCC" } };
const LABEL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F7" } };
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };

// Widest item table (the "other goods" one) needs 8 columns — every other
// block on the sheet merges across however many of these 8 it needs.
const NUM_COLS = 8;

function daysOrNote(value, fallback) {
  const v = (value === undefined || value === null || value === "") ? fallback : value;
  return /^\d+$/.test(String(v).trim()) ? `${v} days after TT payment.` : String(v);
}

function buildSalesInvoiceWorkbook(params) {
  const {
    title, number, date, wayOfShipment, countryOfOrigin, portOfOrigin, portOfDestination,
    incoterm, acq, manufacturer, items, totalLength, totalWeight, totalQuantity, totalAmount, currency,
    paymentTerms, productionDays, deliveryDays, importer, consignee, notifyParty,
    extraShipmentLine, extraShipmentLineLabel, validity,
  } = params;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title === "PROFORMA INVOICE" ? "Proforma Invoice" : "Commercial Invoice", {
    views: [{ showGridLines: false }],
  });
  sheet.columns = Array.from({ length: NUM_COLS }, (_, i) => ({ key: `c${i}`, width: i === 1 ? 30 : 14 }));

  // ── Letterhead: logo + title ──────────────────────────────────────────
  sheet.mergeCells(1, 1, 1, NUM_COLS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 15, color: { argb: NAVY_ARGB } };
  titleCell.alignment = { vertical: "middle", horizontal: "right" };
  sheet.getRow(1).height = 34;
  for (let c = 1; c <= NUM_COLS; c++) sheet.getCell(1, c).border = { bottom: HEADER_RULE };
  const imageId = workbook.addImage({ base64: LOGO, extension: "png" });
  sheet.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 88, height: 29 } });

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
  addMetaLine("Way Of Shipment", wayOfShipment || "By Sea", "Country Of Origin", countryOfOrigin || "China");
  addMetaLine("Port Of Origin", portOfOrigin || "—", "Incoterm", incoterm || "—");
  addMetaLine("Port Of Destination", portOfDestination || "—", "Manufacturer", manufacturer?.name || "—");
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

  const summaryLabel = textileItems.length > 0
    ? `Total Length: ${fmtNumber(totalLength, 0)} m`
    : `Total Quantity: ${fmtNumber(totalQuantity, 2)}`;
  const summaryRow = sheet.addRow([`${summaryLabel}   |   Grand Total Amount: ${fmtMoney(totalAmount, currency)}`]);
  sheet.mergeCells(summaryRow.number, 1, summaryRow.number, NUM_COLS);
  summaryRow.font = { bold: true };
  summaryRow.getCell(1).alignment = { horizontal: "right" };
  summaryRow.getCell(1).fill = LABEL_FILL;

  sheet.addRow([]);

  // ── Order Information ────────────────────────────────────────────────
  const addSectionTitle = text => {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, NUM_COLS);
    row.font = { bold: true, size: 12, color: { argb: NAVY_ARGB } };
    row.getCell(1).border = { bottom: HEADER_RULE, top: HEADER_RULE };
    return row;
  };
  const addPlainLine = text => {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, NUM_COLS);
    row.getCell(1).alignment = { wrapText: true };
    return row;
  };

  addSectionTitle("Order Information");
  addPlainLine(`1. Payment terms: ${paymentTerms || "100% on BL copy"}.`);
  addPlainLine(`2. End date of production: ${daysOrNote(productionDays, "28")}`);
  addPlainLine(`3. Goods delivered: ${portOfOrigin || "—"}.`);
  addPlainLine(`4. Delivery date at ${(portOfOrigin || "origin port").split(",")[0]}: ${daysOrNote(deliveryDays, "33")}`);
  if (extraShipmentLine) {
    addPlainLine(`5. Packing List Description${extraShipmentLineLabel ? `: ${extraShipmentLineLabel}` : ""}`).font = { bold: true };
    const lines = Array.isArray(extraShipmentLine) ? extraShipmentLine : [extraShipmentLine];
    lines.forEach(l => addPlainLine(`     ${l}.`));
  }
  sheet.addRow([]);

  // ── Total Invoice Value ──────────────────────────────────────────────
  const totalLabelRow = sheet.addRow(["Total Invoice Value"]);
  sheet.mergeCells(totalLabelRow.number, 1, totalLabelRow.number, NUM_COLS);
  totalLabelRow.font = { bold: true, color: { argb: NAVY_ARGB } };
  const totalValueRow = sheet.addRow([`${currencyLabel(currency)} ${fmtNumber(totalAmount, 2)}`]);
  sheet.mergeCells(totalValueRow.number, 1, totalValueRow.number, NUM_COLS);
  totalValueRow.font = { bold: true, size: 14 };
  const totalWordsRow = sheet.addRow([amountToWords(totalAmount, currency)]);
  sheet.mergeCells(totalWordsRow.number, 1, totalWordsRow.number, NUM_COLS);
  totalWordsRow.getCell(1).alignment = { wrapText: true };
  totalWordsRow.font = { italic: true };
  sheet.addRow([]);

  if (title === "PROFORMA INVOICE" && validity) {
    addSectionTitle("Quotation Validity");
    addPlainLine(`This Proforma Invoice is valid until ${fmtDateLong(validity)}.`);
    sheet.addRow([]);
  }

  // ── Bank Information ─────────────────────────────────────────────────
  addSectionTitle("Bank Information");
  addPlainLine(`Beneficiary Name: ${acq.bank.beneficiary}`);
  addPlainLine(`Address: ${acq.bank.address}`);
  addPlainLine(`Account Number: ${acq.bank.account}`);
  addPlainLine(`Bank Name: ${acq.bank.bankName}`);
  addPlainLine(`Bank SWIFT: ${acq.bank.swift}`);
  sheet.addRow([]);

  // ── Importer / Consignee / Notify Party ─────────────────────────────
  const partyCard = (heading, party) => {
    addSectionTitle(heading);
    addPlainLine(party.name || "—").font = { bold: true };
    addPlainLine(party.address || "—");
    if (party.taxId) addPlainLine(`Tax ID / CNPJ: ${party.taxId}`);
    if (party.tel) addPlainLine(`Tel.: ${party.tel}`);
  };
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
    groups.forEach(g => partyCard(g.roles.join(" / "), g.party));
  } else {
    partyCard("Importer / Consignee / Notify Party", importer);
  }
  sheet.addRow([]);

  // ── Signature ────────────────────────────────────────────────────────
  addPlainLine(`Authorized by: ${acq.name}`).font = { bold: true };
  addPlainLine("Authorized signature: _______________________________");

  if (title === "PROFORMA INVOICE") {
    sheet.addRow([]);
    const noteRow = sheet.addRow(["This Proforma Invoice is issued for quote purpose only and does not constitute a sales contract."]);
    sheet.mergeCells(noteRow.number, 1, noteRow.number, NUM_COLS);
    noteRow.font = { italic: true, size: 10, color: { argb: "FF666666" } };
  }

  return workbook;
}

module.exports = { buildSalesInvoiceWorkbook };
