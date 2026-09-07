// Excel version of the Client Questionnaire builder (see the
// "Questionnaire" button on the Quotations list). This document goes to
// the CLIENT, not the supplier — organized exactly the way the client
// asked for: one block per photo, the photo on the left and its title +
// questions to the right, each question printed with a clickable checkbox
// per answer option (the actual option text/labels the user typed — e.g.
// "MOQ" / "500 units" / "1000 units") plus a blank Observation column for
// them to fill in.
const ExcelJS = require("exceljs");
const LOGO = require("../pdf/logo");
const LOGO_NINGBO = require("../pdf/logoNingbo");

const NAVY_ARGB = "FF0D1627";
// Same #58595B accent used everywhere else a Ningbo-issued document needs
// its own theme (pdf/layout.js, xlsx/salesInvoiceXlsx.js) — sampled from
// the client's own uploaded Alliance wordmark.
const GRAY_ARGB = "FF58595B";
const SECTION_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F7" } };
const THIN = { style: "thin", color: { argb: "FFCCCCCC" } };
const BORDER_ALL = { top: THIN, left: THIN, bottom: THIN, right: THIN };

// Which of the two entities issued this Quotation — same acq.code rule as
// every other themed document. Falls back to the HKAG theme when acq is
// missing (e.g. an older Quotation saved before Acquisition Company
// existed), matching getAcq()'s own default in server.js.
function themeFor(acq) {
  return acq && acq.code === "NINGBO"
    ? { accentArgb: GRAY_ARGB, logo: LOGO_NINGBO, logoWidth: 150, logoHeight: 35 }
    : { accentArgb: NAVY_ARGB, logo: LOGO, logoWidth: 150, logoHeight: 50 };
}

const LABELS = {
  pt: {
    docTitle: "Questionário para Cliente",
    quotationNumber: "Número da Cotação",
    instructions: "Clique na caixinha da opção desejada e selecione ☑ para marcar. Preencha as observações quando necessário.",
    photo: "Foto",
    question: "Pergunta",
    options: "Opções",
    observation: "Observação",
    noPhoto: "Sem foto",
  },
  en: {
    docTitle: "Client Questionnaire",
    quotationNumber: "Quotation Number",
    instructions: "Click the checkbox next to the option you want and select ☑ to mark it. Fill in observations where needed.",
    photo: "Photo",
    question: "Question",
    options: "Options",
    observation: "Observation",
    noPhoto: "No photo",
  },
  zh: {
    docTitle: "客户问卷",
    quotationNumber: "报价单编号",
    instructions: "点击所需选项旁的方框并选择☑进行标记。请在需要时填写备注。",
    photo: "照片",
    question: "问题",
    options: "选项",
    observation: "备注",
    noPhoto: "无照片",
  },
};

// Minimal, dependency-free PNG/JPEG dimension reader — just enough to keep
// embedded photos at their real aspect ratio (a fixed square box would crop
// or stretch tall/narrow product photos, exactly the bug just fixed on the
// Quotation PDF's item thumbnails — see pdf/itemSections.js). The
// server.js route requests Cloudinary's f_jpg transformation before
// fetching, so in practice this only ever needs to handle JPEG, but PNG is
// kept too as a harmless fallback in case that transformation is ever
// skipped (e.g. a photo saved before this existed).
function getImageDimensions(buffer) {
  try {
    if (!buffer || buffer.length < 24) return null;
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length - 9) {
        if (buffer[offset] !== 0xff) { offset++; continue; }
        const marker = buffer[offset + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue; }
        const length = buffer.readUInt16BE(offset + 2);
        const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSOF) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        offset += 2 + length;
      }
    }
  } catch { /* fall through to null below */ }
  return null;
}

// Each answer option gets a pair of columns: a narrow "Mark" cell (an
// in-cell dropdown restricted to ☐/☑ — exceljs/xlsx has no support for
// real ActiveX/Form-control checkboxes, so this is the closest thing to a
// genuinely clickable checkbox that reliably opens in Excel, WPS AND
// Google Sheets: click the cell, click the dropdown arrow, click ☑ — no
// typing needed) plus a "Label" cell holding the option's actual text
// (e.g. "MOQ", "500 units"). Keeping the tick mark and the label in
// separate cells is what makes the dropdown workable — a single shared
// cell would lose the label text the moment someone picked from the list.
function addOptionColumns(sheet, row, markCol, value) {
  const markCell = sheet.getCell(row, markCol);
  markCell.value = "☐";
  markCell.dataValidation = { type: "list", allowBlank: true, formulae: ['"☐,☑"'] };
  markCell.alignment = { vertical: "middle", horizontal: "center" };
  markCell.border = BORDER_ALL;
  const labelCell = sheet.getCell(row, markCol + 1);
  labelCell.value = value || "";
  labelCell.alignment = { wrapText: true, vertical: "middle" };
  labelCell.border = BORDER_ALL;
}

// photos: [{ title, questions: [{ resolvedText, options: [string] }], imageBuffer, imageExt }]
function buildQuestionnaireWorkbook({ quotationNumber, language, photos, acq }) {
  const lang = LABELS[language] ? language : "en";
  const L = LABELS[lang];
  const theme = themeFor(acq);

  const maxOptions = Math.max(0, ...photos.flatMap(p => p.questions.map(q => (q.options || []).length)));
  // Photo | Question | (Mark, Label) × maxOptions | Observation
  const PHOTO_COL = 1, QUESTION_COL = 2, OPTIONS_START = 3, OPTIONS_END = 2 + maxOptions * 2, OBS_COL = OPTIONS_END + 1;
  const NUM_COLS = OBS_COL;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(L.docTitle.slice(0, 31), { views: [{ showGridLines: false }] });
  sheet.columns = Array.from({ length: NUM_COLS }, (_, i) => {
    const col = i + 1;
    if (col === PHOTO_COL) return { width: 24 };
    if (col === QUESTION_COL) return { width: 32 };
    if (col === OBS_COL) return { width: 30 };
    // Options region: odd offset from OPTIONS_START = Mark (narrow),
    // even offset = Label (wider).
    const isMarkCol = (col - OPTIONS_START) % 2 === 0;
    return { width: isMarkCol ? 5 : 16 };
  });

  // ── Letterhead: logo + title ──────────────────────────────────────────
  sheet.mergeCells(1, 1, 1, NUM_COLS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = L.docTitle;
  titleCell.font = { bold: true, size: 16, color: { argb: theme.accentArgb } };
  titleCell.alignment = { vertical: "middle", horizontal: "right" };
  sheet.getRow(1).height = 46;
  for (let c = 1; c <= NUM_COLS; c++) sheet.getCell(1, c).border = { bottom: { style: "medium", color: { argb: theme.accentArgb } } };
  const imageId = workbook.addImage({ base64: theme.logo, extension: "png" });
  sheet.addImage(imageId, { tl: { col: 0.15, row: 0.1 }, ext: { width: theme.logoWidth, height: theme.logoHeight } });

  sheet.getRow(2).height = 6; // spacer

  const metaRow = sheet.addRow([`${L.quotationNumber}: ${quotationNumber || "—"}`]);
  sheet.mergeCells(metaRow.number, 1, metaRow.number, NUM_COLS);
  metaRow.font = { bold: true, size: 12 };
  metaRow.alignment = { horizontal: "center" };

  const instrRow = sheet.addRow([L.instructions]);
  sheet.mergeCells(instrRow.number, 1, instrRow.number, NUM_COLS);
  instrRow.font = { italic: true, size: 10, color: { argb: "FF666666" } };
  instrRow.alignment = { horizontal: "center", wrapText: true };

  sheet.addRow([]); // spacer

  // ── Table header ──────────────────────────────────────────────────────
  const headerRow = sheet.addRow([]);
  sheet.getCell(headerRow.number, PHOTO_COL).value = L.photo;
  sheet.getCell(headerRow.number, QUESTION_COL).value = L.question;
  if (maxOptions > 0) {
    sheet.mergeCells(headerRow.number, OPTIONS_START, headerRow.number, OPTIONS_END);
    sheet.getCell(headerRow.number, OPTIONS_START).value = L.options;
  }
  sheet.getCell(headerRow.number, OBS_COL).value = L.observation;
  for (let c = 1; c <= NUM_COLS; c++) {
    const cell = sheet.getCell(headerRow.number, c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.accentArgb } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDER_ALL;
  }
  sheet.getRow(headerRow.number).height = 22;

  // ── One block per photo ───────────────────────────────────────────────
  photos.forEach((photo, photoIdx) => {
    const sectionRow = sheet.addRow([]);
    sheet.mergeCells(sectionRow.number, 1, sectionRow.number, NUM_COLS);
    const sectionCell = sheet.getCell(sectionRow.number, 1);
    sectionCell.value = photo.title || `${L.photo} ${photoIdx + 1}`;
    sectionCell.font = { bold: true, size: 12, color: { argb: theme.accentArgb } };
    sectionCell.fill = SECTION_FILL;
    sectionCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    sheet.getRow(sectionRow.number).height = 22;

    // Every block gets at least one row even with zero questions saved yet,
    // so there's always somewhere for the photo to sit.
    const questions = photo.questions.length > 0 ? photo.questions : [{ resolvedText: "", options: [] }];
    const firstDataRow = sheet.rowCount + 1;

    questions.forEach(q => {
      const row = sheet.addRow([]);
      row.height = 60;
      const qCell = sheet.getCell(row.number, QUESTION_COL);
      qCell.value = q.resolvedText || "";
      qCell.alignment = { wrapText: true, vertical: "middle" };
      qCell.border = BORDER_ALL;

      for (let i = 0; i < maxOptions; i++) {
        const markCol = OPTIONS_START + i * 2;
        const option = (q.options || [])[i];
        if (option != null) {
          addOptionColumns(sheet, row.number, markCol, option);
        } else {
          sheet.getCell(row.number, markCol).border = BORDER_ALL;
          sheet.getCell(row.number, markCol + 1).border = BORDER_ALL;
        }
      }

      sheet.getCell(row.number, OBS_COL).border = BORDER_ALL;
    });

    const lastDataRow = sheet.rowCount;

    // Photo column — one merged cell spanning every question row in this
    // block, with the photo (aspect-ratio preserved, never cropped/
    // stretched — see getImageDimensions above) anchored inside it.
    sheet.mergeCells(firstDataRow, PHOTO_COL, lastDataRow, PHOTO_COL);
    const photoCell = sheet.getCell(firstDataRow, PHOTO_COL);
    photoCell.border = BORDER_ALL;

    if (photo.imageBuffer) {
      const dims = getImageDimensions(photo.imageBuffer);
      const maxW = 150;
      // Rough px budget for the block's row span (60pt rows ≈ 80px each,
      // with some padding) — keeps tall blocks (few questions) from
      // getting an image box that spills into the next section.
      const maxH = Math.max(60, Math.min(220, (lastDataRow - firstDataRow + 1) * 76));
      let w = maxW, h = maxH;
      if (dims && dims.width > 0 && dims.height > 0) {
        const ratio = dims.width / dims.height;
        w = maxW; h = maxW / ratio;
        if (h > maxH) { h = maxH; w = maxH * ratio; }
      }
      const imageId2 = workbook.addImage({ buffer: photo.imageBuffer, extension: photo.imageExt || "jpeg" });
      sheet.addImage(imageId2, {
        tl: { col: PHOTO_COL - 1 + 0.15, row: firstDataRow - 1 + 0.1 },
        ext: { width: w, height: h },
      });
    } else {
      photoCell.value = L.noPhoto;
      photoCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      photoCell.font = { italic: true, color: { argb: "FFAAAAAA" } };
    }

    if (photoIdx < photos.length - 1) sheet.addRow([]); // spacer between blocks
  });

  return workbook;
}

module.exports = { buildQuestionnaireWorkbook };
