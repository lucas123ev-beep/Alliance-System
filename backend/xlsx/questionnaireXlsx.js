// Excel version of the Supplier Questionnaire builder (see the
// "Questionnaire" button on the Quotations list). Organized exactly the way
// the client asked for: one block per photo, the photo on the left and its
// title + questions to the right, each question printed with a checkbox
// cell per answer option (the actual option text/labels the user typed —
// e.g. "MOQ" / "500 units" / "1000 units") plus a blank Observation column
// for the supplier to fill in. Meant to be sent to the supplier and filled
// out by hand (or in Excel/WPS/Google Sheets), then sent back.
const ExcelJS = require("exceljs");

const NAVY_ARGB = "FF0D1627";
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
const SECTION_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F7" } };
const THIN = { style: "thin", color: { argb: "FFCCCCCC" } };
const BORDER_ALL = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const LABELS = {
  pt: {
    docTitle: "Questionário para Fornecedor",
    quotationNumber: "Número da Cotação",
    instructions: "Marque a opção correta com um X e preencha as observações quando necessário.",
    photo: "Foto",
    question: "Pergunta",
    options: "Opções",
    observation: "Observação",
    noPhoto: "Sem foto",
  },
  en: {
    docTitle: "Supplier Questionnaire",
    quotationNumber: "Quotation Number",
    instructions: "Mark the correct option with an X and fill in observations where needed.",
    photo: "Photo",
    question: "Question",
    options: "Options",
    observation: "Observation",
    noPhoto: "No photo",
  },
  zh: {
    docTitle: "供应商问卷",
    quotationNumber: "报价单编号",
    instructions: "请在正确选项处标记X，并在需要时填写备注。",
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

// photos: [{ title, questions: [{ resolvedText, options: [string] }], imageBuffer, imageExt }]
function buildQuestionnaireWorkbook({ quotationNumber, language, photos }) {
  const lang = LABELS[language] ? language : "en";
  const L = LABELS[lang];

  const maxOptions = Math.max(0, ...photos.flatMap(p => p.questions.map(q => (q.options || []).length)));
  const PHOTO_COL = 1, QUESTION_COL = 2, OPTIONS_START = 3, OPTIONS_END = 2 + maxOptions, OBS_COL = 3 + maxOptions;
  const NUM_COLS = OBS_COL;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(L.docTitle.slice(0, 31), { views: [{ showGridLines: false }] });
  sheet.columns = Array.from({ length: NUM_COLS }, (_, i) => ({
    width: i === 0 ? 24 : i === 1 ? 34 : (i === NUM_COLS - 1 ? 30 : 18),
  }));

  // ── Title / meta ──────────────────────────────────────────────────────
  sheet.mergeCells(1, 1, 1, NUM_COLS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = L.docTitle;
  titleCell.font = { bold: true, size: 16, color: { argb: NAVY_ARGB } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 32;

  const metaRow = sheet.addRow([`${L.quotationNumber}: ${quotationNumber || "—"}`]);
  sheet.mergeCells(metaRow.number, 1, metaRow.number, NUM_COLS);
  metaRow.font = { bold: true, size: 12 };
  metaRow.alignment = { horizontal: "center" };

  const instrRow = sheet.addRow([L.instructions]);
  sheet.mergeCells(instrRow.number, 1, instrRow.number, NUM_COLS);
  instrRow.font = { italic: true, size: 10, color: { argb: "FF666666" } };
  instrRow.alignment = { horizontal: "center" };

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
    cell.fill = HEADER_FILL;
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
    sectionCell.font = { bold: true, size: 12, color: { argb: NAVY_ARGB } };
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

      for (let c = OPTIONS_START; c <= OPTIONS_END; c++) {
        const optIdx = c - OPTIONS_START;
        const cell = sheet.getCell(row.number, c);
        if (optIdx < (q.options || []).length) cell.value = `☐  ${q.options[optIdx]}`;
        cell.alignment = { wrapText: true, vertical: "middle" };
        cell.border = BORDER_ALL;
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
      const imageId = workbook.addImage({ buffer: photo.imageBuffer, extension: photo.imageExt || "jpeg" });
      sheet.addImage(imageId, {
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
