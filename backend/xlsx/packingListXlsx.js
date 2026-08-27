// Excel version of the Packing List — same content as pdf/packingList.js's
// renderPackingList(), laid out as a single-sheet workbook instead of a
// printed page. Takes the exact same `params` shape as the PDF template, so
// both are built from the same data the /api/packing-lists/:id/pdf route in
// server.js already assembles.
const ExcelJS = require("exceljs");
const LOGO = require("../pdf/logo");
const { fmtDateLong, fmtNumber } = require("../pdf/helpers");

const NAVY_ARGB = "FF0D1627";
const HEADER_RULE = { style: "medium", color: { argb: NAVY_ARGB } };
const THIN_SEP = { style: "thin", color: { argb: "FFCCCCCC" } };
const LABEL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F7" } };
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };

// Widest item table (Textile/DTF Film — 10 columns) sets the sheet width.
const NUM_COLS = 10;

function isTextileItem(item) {
  if (typeof item.isTextile === "boolean") return item.isTextile;
  const category = item.category || "";
  if (category === "Textile" || category === "DTF Film") return true;
  if (category) return false;
  return !!(item.totalLength && parseFloat(item.totalLength) > 0);
}

const sumOf = (arr, key) => arr.reduce((s, i) => s + (parseFloat(i[key]) || 0), 0);
const packageLabel = arr => (arr.length && arr.every(isTextileItem)) ? "Roll" : "Packages";

function buildPackingListWorkbook(params) {
  const {
    number, date, wayOfShipment, countryOfOrigin, portOfOrigin, portOfDestination,
    incoterm, acq, manufacturer, items, totals, importer, containers,
  } = params;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Packing List", { views: [{ showGridLines: false }] });
  sheet.columns = Array.from({ length: NUM_COLS }, (_, i) => ({ key: `c${i}`, width: i === 1 ? 26 : 12 }));

  // ── Letterhead ───────────────────────────────────────────────────────
  sheet.mergeCells(1, 1, 1, NUM_COLS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = "PACKING LIST";
  titleCell.font = { bold: true, size: 15, color: { argb: NAVY_ARGB } };
  titleCell.alignment = { vertical: "middle", horizontal: "right" };
  sheet.getRow(1).height = 46;
  for (let c = 1; c <= NUM_COLS; c++) sheet.getCell(1, c).border = { bottom: HEADER_RULE };
  const imageId = workbook.addImage({ base64: LOGO, extension: "png" });
  // Same size bump as the Proforma/Commercial Invoice workbook — see
  // salesInvoiceXlsx.js for the reasoning (client felt the original 88x29
  // read too small next to the title).
  sheet.addImage(imageId, { tl: { col: 0.15, row: 0.1 }, ext: { width: 150, height: 50 } });

  sheet.getRow(2).height = 6;

  const half = Math.floor(NUM_COLS / 2);
  const metaRow = sheet.addRow([`Number: ${number || "—"}`, "", "", "", `Date: ${fmtDateLong(date)}`]);
  sheet.mergeCells(metaRow.number, 1, metaRow.number, half);
  sheet.mergeCells(metaRow.number, half + 1, metaRow.number, NUM_COLS);
  metaRow.font = { bold: true };

  const addMetaLine = (leftLabel, leftValue, rightLabel, rightValue) => {
    const row = sheet.addRow([`${leftLabel}: ${leftValue}`, "", "", "", `${rightLabel}: ${rightValue}`]);
    sheet.mergeCells(row.number, 1, row.number, half);
    sheet.mergeCells(row.number, half + 1, row.number, NUM_COLS);
    row.eachCell(c => { c.alignment = { wrapText: true, vertical: "middle" }; });
    return row;
  };
  addMetaLine("Way Of Shipment", wayOfShipment || "By Sea", "Country Of Origin", countryOfOrigin || "China");
  addMetaLine("Port Of Origin", portOfOrigin || "—", "Incoterm", incoterm || "—");
  addMetaLine("Port Of Destination", portOfDestination || "—", "Manufacturer", manufacturer?.name || "—");
  const mfgAddrRow = sheet.addRow([`Manufacturer Address: ${manufacturer?.address || "—"}${manufacturer?.tel ? ` | Tel.: ${manufacturer.tel}` : ""}`]);
  sheet.mergeCells(mfgAddrRow.number, 1, mfgAddrRow.number, NUM_COLS);

  const originRow = sheet.addRow([`Country of origin and provenance: ${countryOfOrigin || "China"}.`, "", "", "", `Country of acquisition: ${acq.countryOfAcquisition}.`]);
  sheet.mergeCells(originRow.number, 1, originRow.number, half);
  sheet.mergeCells(originRow.number, half + 1, originRow.number, NUM_COLS);
  originRow.font = { italic: true, color: { argb: "FF444444" } };

  sheet.addRow([]);

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
  const addTotalsRow = (label, cells) => {
    const row = sheet.addRow([label, ...cells]);
    row.font = { bold: true };
    row.eachCell(c => { c.fill = LABEL_FILL; c.border = { top: THIN_SEP, bottom: THIN_SEP }; });
    return row;
  };
  const itemDescription = item => [item.description, item.descriptionText, ...(item.bullets || []), item.ncm ? `NCM: ${item.ncm}` : ""].filter(Boolean).join("\n");
  const itemColor = item => item.clientColorCode ? `${item.color || "—"} (${item.clientColorCode})` : (item.color || "—");

  // Renders the (up to) two category tables for one group of items — same
  // split as the PDF: Textile/DTF Film (Total Length) vs everything else
  // (Quantity + Packages), further split per category when more than one
  // non-textile category is mixed in.
  function writeItemSections(sectionItems) {
    const textileItems = sectionItems.filter(isTextileItem);
    const otherItems = sectionItems.filter(i => !isTextileItem(i));
    const otherGroups = [];
    otherItems.forEach(item => {
      const key = item.category || "Other";
      let group = otherGroups.find(g => g.key === key);
      if (!group) { group = { key, items: [] }; otherGroups.push(group); }
      group.items.push(item);
    });

    if (textileItems.length > 0) {
      addTableHeader(["Product", "Description", "Color", "Width", "Weight", "Total Length", "Roll", "Gross Weight", "Net Weight", "CBM"]);
      textileItems.forEach(item => {
        addTableDataRow([
          item.description, itemDescription(item), itemColor(item), item.width || "—", item.weightSpec || "—",
          fmtNumber(item.totalLength, 0), fmtNumber(item.roll, 0), fmtNumber(item.grossWeight, 3), fmtNumber(item.netWeight, 3), fmtNumber(item.cbm, 2),
        ]);
      });
      addTotalsRow("SUBTOTAL:", ["", "", "", "", fmtNumber(sumOf(textileItems, "totalLength"), 0), fmtNumber(sumOf(textileItems, "roll"), 0), fmtNumber(sumOf(textileItems, "grossWeight"), 3), fmtNumber(sumOf(textileItems, "netWeight"), 3), fmtNumber(sumOf(textileItems, "cbm"), 2)]);
      sheet.addRow([]);
    }
    otherGroups.forEach(group => {
      addTableHeader(["Product", "Description", "Color", "Unit", "Quantity", "Packages", "Gross Weight", "Net Weight", "CBM"]);
      group.items.forEach(item => {
        addTableDataRow([
          item.description, itemDescription(item), itemColor(item), item.priceUnitLabel || item.width || "—",
          item.quantityLabel || (item.quantity != null ? `${item.quantity} ${item.unit || ""}`.trim() : "—"),
          fmtNumber(item.roll, 0), fmtNumber(item.grossWeight, 3), fmtNumber(item.netWeight, 3), fmtNumber(item.cbm, 2),
        ]);
      });
      addTotalsRow("SUBTOTAL:", ["", "", "", "", fmtNumber(sumOf(group.items, "roll"), 0), fmtNumber(sumOf(group.items, "grossWeight"), 3), fmtNumber(sumOf(group.items, "netWeight"), 3), fmtNumber(sumOf(group.items, "cbm"), 2)]);
      sheet.addRow([]);
    });
  }

  const hasContainerSplit = Array.isArray(containers) && containers.length >= 1;
  if (hasContainerSplit) {
    containers.forEach(c => {
      const containerItems = items.filter(i => (i.container_seq || 1) === c.seq && (parseFloat(i.roll) || 0) > 0);
      if (containerItems.length === 0) return;
      const headerRow = sheet.addRow([`Container ${String(c.seq).padStart(2, "0")}: ${c.code || "—"}`]);
      sheet.mergeCells(headerRow.number, 1, headerRow.number, NUM_COLS);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.getCell(1).fill = HEADER_FILL;
      writeItemSections(containerItems);
      addTotalsRow(
        "TOTAL:",
        [`Length: ${fmtNumber(sumOf(containerItems, "totalLength"), 0)}`, "", "",
          `${packageLabel(containerItems)}: ${fmtNumber(sumOf(containerItems, "roll"), 0)}`,
          `Gross Weight: ${fmtNumber(sumOf(containerItems, "grossWeight"), 3)}`, "",
          `Net Weight: ${fmtNumber(sumOf(containerItems, "netWeight"), 3)}`, "",
          `CBM: ${fmtNumber(sumOf(containerItems, "cbm"), 2)}`]
      );
      sheet.addRow([]);
    });
  } else {
    writeItemSections(items);
  }

  const grandTotalRow = sheet.addRow([
    `GRAND TOTAL:   Length: ${fmtNumber(totals.totalLength, 0)}   |   ${packageLabel(items)}: ${fmtNumber(totals.totalRoll, 0)}   |   Gross Weight: ${fmtNumber(totals.totalGrossWeight, 3)}   |   Net Weight: ${fmtNumber(totals.totalNetWeight, 3)}   |   CBM: ${fmtNumber(totals.totalCbm, 2)}`,
  ]);
  sheet.mergeCells(grandTotalRow.number, 1, grandTotalRow.number, NUM_COLS);
  grandTotalRow.font = { bold: true };
  grandTotalRow.getCell(1).fill = LABEL_FILL;
  grandTotalRow.getCell(1).border = { top: HEADER_RULE, bottom: HEADER_RULE };

  sheet.addRow([]);

  // ── Shipment Details ─────────────────────────────────────────────────
  const shipTitleRow = sheet.addRow(["Shipment Details"]);
  sheet.mergeCells(shipTitleRow.number, 1, shipTitleRow.number, NUM_COLS);
  shipTitleRow.font = { bold: true, size: 12, color: { argb: NAVY_ARGB } };
  shipTitleRow.getCell(1).border = { bottom: HEADER_RULE, top: HEADER_RULE };

  const addCenteredLine = text => {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, NUM_COLS);
    row.getCell(1).alignment = { horizontal: "center", wrapText: true };
    return row;
  };
  addCenteredLine("Importer | Consignee | Notify Part:").font = { bold: true };
  addCenteredLine(importer.name || "—").font = { bold: true };
  addCenteredLine(importer.address || "—");
  if (importer.taxId) addCenteredLine(`CNPJ: ${importer.taxId}`);
  if (importer.tel) addCenteredLine(`Tel.: ${importer.tel}`);

  return workbook;
}

module.exports = { buildPackingListWorkbook };
