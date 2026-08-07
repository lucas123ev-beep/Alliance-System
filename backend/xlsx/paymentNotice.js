// Payment Request Form (付款申请单) as an Excel workbook — internal
// bilingual form used to authorize a payment to a supplier. Same content as
// the old PDF version (see pdf/paymentNotice.js, kept only for reference/
// history — no longer used by any route), just laid out as a single-sheet
// label/value form instead of a printed table, per the client's request to
// receive this one as .xlsx instead of .pdf.
const ExcelJS = require("exceljs");
const LOGO = require("../pdf/logo");
const { fmtDateShort, currencyLabel } = require("../pdf/helpers");

// Navy (#0D1627) brand color, matching the redesigned Proforma/Commercial
// Invoice/Packing List PDFs (see pdf/layout.js) — every generated workbook
// in the app now reads as the same document family as the PDFs.
const NAVY_ARGB = "FF0D1627";
const HEADER_RULE = { style: "medium", color: { argb: NAVY_ARGB } };
const LABEL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F7" } };
// Heavier rule used only for the outer edge of the Payer→Purpose block —
// matches the thick outline the client added by hand to their own copy of
// this file when asking for this styling.
const THICK_RULE = { style: "thick", color: { argb: NAVY_ARGB } };
const THIN_SEP = { style: "thin", color: { argb: "FFCCCCCC" } };

function buildPaymentNoticeWorkbook(params) {
  const {
    payer, applicationDate, paymentMethod, paymentDeadline, payee,
    bankName, bankBranch, accountNumber, amount, currency, purpose,
    applicant, approvedBy,
  } = params;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Payment Notice", {
    views: [{ showGridLines: false, activeCell: "A5" }],
  });
  sheet.columns = [{ key: "label", width: 34 }, { key: "value", width: 46 }];

  // Row 1: logo (floating) + right-aligned title, same letterhead style as
  // the other xlsx reports in this app.
  sheet.mergeCells(1, 1, 1, 2);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = "Payment Request Form 付款申请单";
  titleCell.font = { bold: true, size: 15, color: { argb: NAVY_ARGB } };
  titleCell.alignment = { vertical: "middle", horizontal: "right" };
  sheet.getRow(1).height = 34;
  sheet.getCell(1, 1).border = { bottom: HEADER_RULE };
  sheet.getCell(1, 2).border = { bottom: HEADER_RULE };
  // Real logo artwork is ~900x297px (~3.03:1) — width/height below must
  // keep that ratio or the logo prints visibly squished/stretched.
  const imageId = workbook.addImage({ base64: LOGO, extension: "png" });
  sheet.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 88, height: 29 } });

  sheet.getRow(2).height = 6; // spacer between letterhead and the form

  // Payer sits on its own bold row right under the letterhead, matching the
  // old PDF's layout (payer identity is the first thing read on the form).
  // This whole block (Payer through Payment Purpose) reads as one grouped
  // card — value column centered, thick outer border around the perimeter
  // — per the client's own hand-styled example.
  const payerRow = sheet.addRow(["付款单位 Payer", payer || ""]);
  payerRow.getCell(1).font = { bold: true };
  payerRow.getCell(2).font = { bold: true };
  payerRow.getCell(2).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  payerRow.eachCell(c => { c.border = { bottom: THIN_SEP }; });

  // Every other field: bold shaded label cell in column A, centered value in
  // column B — reads like the PDF's two-column table without needing an
  // actual bordered table for a one-record form.
  const addField = (label, value, { numFmt, dateValue } = {}) => {
    const row = sheet.addRow([label, dateValue !== undefined ? dateValue : (value ?? "")]);
    const labelCell = row.getCell(1);
    labelCell.font = { bold: true };
    labelCell.fill = LABEL_FILL;
    labelCell.alignment = { vertical: "middle", wrapText: true };
    const valueCell = row.getCell(2);
    valueCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    if (numFmt) valueCell.numFmt = numFmt;
    row.eachCell(c => { c.border = { bottom: THIN_SEP }; });
    return row;
  };

  const appDate = applicationDate ? new Date(`${applicationDate}T00:00:00`) : null;
  addField("申请时间 Date of Payment Application", null, {
    dateValue: appDate && !isNaN(appDate.getTime()) ? appDate : (applicationDate || "—"),
    numFmt: appDate && !isNaN(appDate.getTime()) ? "dd/mm/yyyy" : undefined,
  });
  addField("支付方式 Payment Method", paymentMethod || "网银汇款 Online bank payment");
  const deadline = paymentDeadline ? new Date(`${paymentDeadline}T00:00:00`) : null;
  addField("最迟支付时间 Payment Deadline", null, {
    dateValue: deadline && !isNaN(deadline.getTime()) ? deadline : "—",
    numFmt: deadline && !isNaN(deadline.getTime()) ? "dd/mm/yyyy" : undefined,
  });
  addField("收款人 / 单位 Name of Payee", payee || "—");
  addField("银行名称 Bank name", bankName || "—");
  addField("银行支行全称 Bank Branch name", bankBranch || "—");
  addField("账户号码 Account NO", accountNumber || "—");
  const amountNum = parseFloat(amount);
  addField(`金额 Amount (${currencyLabel(currency) || ""})`, Number.isFinite(amountNum) ? amountNum : "—", {
    numFmt: Number.isFinite(amountNum) ? "#,##0.00" : undefined,
  });
  const purposeRow = addField("支付目的及摘要 Payment Purpose / Description", purpose || "—");

  // Thick outer border around the whole Payer→Purpose block — internal
  // thin separators between fields (set above) stay untouched; this only
  // overrides the four outside edges.
  for (let r = payerRow.number; r <= purposeRow.number; r++) {
    const row = sheet.getRow(r);
    const leftCell = row.getCell(1);
    const rightCell = row.getCell(2);
    leftCell.border = { ...leftCell.border, left: THICK_RULE };
    rightCell.border = { ...rightCell.border, right: THICK_RULE };
    if (r === payerRow.number) {
      leftCell.border = { ...leftCell.border, top: THICK_RULE };
      rightCell.border = { ...rightCell.border, top: THICK_RULE };
    }
    if (r === purposeRow.number) {
      leftCell.border = { ...leftCell.border, bottom: THICK_RULE };
      rightCell.border = { ...rightCell.border, bottom: THICK_RULE };
    }
  }

  sheet.addRow([]); // spacer before the approval block

  const approvalHeader = sheet.addRow(["审批情况 Approval process", ""]);
  sheet.mergeCells(approvalHeader.number, 1, approvalHeader.number, 2);
  approvalHeader.getCell(1).font = { bold: true };
  approvalHeader.getCell(1).alignment = { horizontal: "center" };
  approvalHeader.getCell(1).border = { bottom: HEADER_RULE, top: HEADER_RULE };

  addField("申请人 Applicant", applicant || "—");
  addField("审批人 Approved by", approvedBy || "—");

  return workbook;
}

module.exports = { buildPaymentNoticeWorkbook };
