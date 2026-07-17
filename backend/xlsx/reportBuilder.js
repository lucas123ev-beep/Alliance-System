// Full cross-module Excel report — one workbook covering every tracking
// screen (Quotations, Proformas, Orders, Commercial Invoices, Contracts,
// Inspections, Supplier Flow, Samples, Packing Lists), each split into two
// sheets: everything still open/pending first, everything already
// completed/closed second. Filtered from a given "since" date (on each
// table's own created_at) through today.
//
// "Completed" means something different per table (there's no single
// universal status column/value across all nine), so each category defines
// its own `isDone(row)` check right next to its query — see CATEGORIES below.
const ExcelJS = require("exceljs");
const LOGO = require("../pdf/logo");
const { currencyLabel } = require("../pdf/helpers");

const TITLE_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4A4A4A" } };
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
const THIN_BORDER = { style: "thin", color: { argb: "FFBBBBBB" } };

// Turns a "YYYY-MM-DD" (or any parseable) date string into a real JS Date
// for Excel — lets the user sort/filter by date naturally in Excel instead
// of getting stuck with plain text. Falls back to null (blank cell) for
// missing/invalid values instead of leaking "Invalid Date" onto the sheet.
function toExcelDate(value) {
  if (!value) return null;
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return isNaN(d.getTime()) ? null : d;
}

function toNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

// Adds one sheet: a dark title band (with the logo), a bold header row, an
// Excel autofilter + frozen header so it behaves like a real working report
// (not just a flat data dump), then the rows themselves.
function addReportSheet(workbook, { sheetName, title, subtitle, columns, rows }) {
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  sheet.columns = columns.map(c => ({ key: c.key, width: c.width || 16 }));

  // Row 1: title band, spanning every column.
  const titleRow = sheet.getRow(1);
  titleRow.height = 22;
  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  titleCell.fill = TITLE_FILL;
  for (let col = 1; col <= columns.length; col++) sheet.getCell(1, col).fill = TITLE_FILL;

  // Logo, floated over the left edge of the title band — same mark used on
  // every PDF, so the report reads as the same document family.
  const imageId = workbook.addImage({ base64: LOGO, extension: "png" });
  sheet.addImage(imageId, { tl: { col: 0.1, row: 0.08 }, ext: { width: 70, height: 15 } });

  // Row 2: column headers — this is what the autofilter/freeze anchor to.
  const headerRow = sheet.getRow(2);
  headerRow.height = 18;
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 9.5 };
    cell.fill = HEADER_FILL;
    cell.border = { bottom: THIN_BORDER };
    cell.alignment = { vertical: "middle" };
  });
  if (subtitle) sheet.getCell(2, columns.length).note = subtitle;

  rows.forEach(row => {
    const excelRow = sheet.addRow(row);
    columns.forEach((c, i) => {
      const cell = excelRow.getCell(i + 1);
      if (c.type === "date") cell.numFmt = "dd/mm/yyyy";
      if (c.type === "money") cell.numFmt = "#,##0.00";
      if (c.type === "number") cell.numFmt = "#,##0.##";
    });
  });

  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: columns.length } };
  return sheet;
}

// Splits already-fetched+mapped rows into {open, done} using a per-category
// predicate, and writes both sheets (open first, per the requested layout).
function addCategorySheets(workbook, { key, label, columns, rawRows, mapRow, isDone, since }) {
  const mapped = rawRows.map(mapRow);
  const open = mapped.filter(r => !isDone(r._raw));
  const done = mapped.filter(r => isDone(r._raw));
  const strip = rows => rows.map(({ _raw, ...rest }) => rest);
  const subtitle = since ? `Since ${since}` : "All time";

  addReportSheet(workbook, {
    sheetName: `${label} (Open)`.slice(0, 31),
    title: `${label.toUpperCase()} — OPEN / NOT COMPLETED`,
    subtitle, columns, rows: strip(open),
  });
  addReportSheet(workbook, {
    sheetName: `${label} (Done)`.slice(0, 31),
    title: `${label.toUpperCase()} — COMPLETED`,
    subtitle, columns, rows: strip(done),
  });
}

function buildFullReportWorkbook(db, since) {
  const sinceValue = since || "0000-01-01";
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ExportFlow";
  workbook.created = new Date();

  // ─── Quotations ────────────────────────────────────────────────────────
  addCategorySheets(workbook, {
    label: "Quotations",
    since,
    rawRows: db.prepare(`SELECT * FROM quotations WHERE created_at >= ? ORDER BY created_at DESC`).all(sinceValue),
    isDone: r => ["Accepted", "Rejected"].includes(r.status),
    columns: [
      { key: "number", header: "Number", width: 18 },
      { key: "client", header: "Client", width: 26 },
      { key: "status", header: "Status", width: 14 },
      { key: "total", header: "Total", width: 14, type: "money" },
      { key: "currency", header: "Currency", width: 10 },
      { key: "deadline", header: "Deadline", width: 14, type: "date" },
      { key: "suppliers", header: "Suppliers", width: 24 },
      { key: "created_at", header: "Created At", width: 14, type: "date" },
    ],
    mapRow: r => ({
      _raw: r,
      number: r.number, client: r.client, status: r.status,
      total: toNumber(r.total), currency: currencyLabel(r.currency),
      deadline: toExcelDate(r.deadline), suppliers: r.suppliers,
      created_at: toExcelDate(r.created_at),
    }),
  });

  // ─── Proformas ─────────────────────────────────────────────────────────
  addCategorySheets(workbook, {
    label: "Proformas",
    since,
    rawRows: db.prepare(`
      SELECT p.*, o.order_number AS order_number
      FROM proformas p LEFT JOIN orders o ON o.id = p.order_id
      WHERE p.created_at >= ? ORDER BY p.created_at DESC
    `).all(sinceValue),
    isDone: r => ["Accepted", "Rejected"].includes(r.status),
    columns: [
      { key: "number", header: "Number", width: 18 },
      { key: "order_number", header: "Order Number", width: 18 },
      { key: "client", header: "Client", width: 26 },
      { key: "status", header: "Status", width: 14 },
      { key: "total", header: "Total", width: 14, type: "money" },
      { key: "currency", header: "Currency", width: 10 },
      { key: "issue_date", header: "Issue Date", width: 14, type: "date" },
      { key: "validity", header: "Validity", width: 14, type: "date" },
      { key: "incoterm", header: "Incoterm", width: 12 },
      { key: "way_of_shipment", header: "Way Of Shipment", width: 16 },
      { key: "port_of_loading", header: "Port Of Loading", width: 18 },
      { key: "port_of_discharge", header: "Port Of Discharge", width: 18 },
      { key: "payment_terms", header: "Payment Terms", width: 22 },
      { key: "created_at", header: "Created At", width: 14, type: "date" },
    ],
    mapRow: r => ({
      _raw: r,
      number: r.number, order_number: r.order_number, client: r.client, status: r.status,
      total: toNumber(r.total), currency: currencyLabel(r.currency),
      issue_date: toExcelDate(r.issue_date), validity: toExcelDate(r.validity),
      incoterm: r.incoterm, way_of_shipment: r.way_of_shipment,
      port_of_loading: r.port_of_loading, port_of_discharge: r.port_of_discharge,
      payment_terms: r.payment_terms, created_at: toExcelDate(r.created_at),
    }),
  });

  // ─── Orders ────────────────────────────────────────────────────────────
  addCategorySheets(workbook, {
    label: "Orders",
    since,
    rawRows: db.prepare(`SELECT * FROM orders WHERE created_at >= ? ORDER BY created_at DESC`).all(sinceValue),
    isDone: r => r.status === "Completed",
    columns: [
      { key: "order_number", header: "Order Number", width: 18 },
      { key: "client", header: "Client", width: 26 },
      { key: "supplier", header: "Supplier", width: 22 },
      { key: "product", header: "Product", width: 22 },
      { key: "value", header: "Value", width: 14, type: "money" },
      { key: "currency", header: "Currency", width: 10 },
      { key: "status", header: "Status", width: 16 },
      { key: "production_lead_time", header: "Production Lead Time (days)", width: 16, type: "number" },
      { key: "delivery_days", header: "Delivery Days", width: 14, type: "number" },
      { key: "shipment_date", header: "Shipment Date", width: 14, type: "date" },
      { key: "arrival_date", header: "Arrival Date", width: 14, type: "date" },
      { key: "incoterm", header: "Incoterm", width: 12 },
      { key: "container", header: "Container", width: 16 },
      { key: "container_qty", header: "Container Qty", width: 12, type: "number" },
      { key: "created_at", header: "Created At", width: 14, type: "date" },
    ],
    mapRow: r => ({
      _raw: r,
      order_number: r.order_number, client: r.client, supplier: r.supplier, product: r.product,
      value: toNumber(r.value), currency: currencyLabel(r.currency), status: r.status,
      production_lead_time: toNumber(r.production_lead_time), delivery_days: toNumber(r.delivery_days),
      shipment_date: toExcelDate(r.shipment_date), arrival_date: toExcelDate(r.arrival_date),
      incoterm: r.incoterm, container: r.container, container_qty: toNumber(r.container_qty),
      created_at: toExcelDate(r.created_at),
    }),
  });

  // ─── Commercial Invoices ───────────────────────────────────────────────
  addCategorySheets(workbook, {
    label: "Commercial",
    since,
    rawRows: db.prepare(`
      SELECT ci.*, o.order_number AS order_number, o.shipment_date AS shipment_date, o.arrival_date AS arrival_date
      FROM commercial_invoices ci LEFT JOIN orders o ON o.id = ci.order_id
      WHERE ci.created_at >= ? ORDER BY ci.created_at DESC
    `).all(sinceValue),
    isDone: r => r.status === "Paid",
    columns: [
      { key: "number", header: "Number", width: 18 },
      { key: "order_number", header: "Order Number", width: 18 },
      { key: "client", header: "Client", width: 26 },
      { key: "status", header: "Status", width: 14 },
      { key: "total", header: "Total", width: 14, type: "money" },
      { key: "currency", header: "Currency", width: 10 },
      { key: "issue_date", header: "Issue Date", width: 14, type: "date" },
      { key: "shipment_date", header: "Shipment Date", width: 14, type: "date" },
      { key: "arrival_date", header: "Arrival Date", width: 14, type: "date" },
      { key: "created_at", header: "Created At", width: 14, type: "date" },
    ],
    mapRow: r => ({
      _raw: r,
      number: r.number, order_number: r.order_number, client: r.client, status: r.status,
      total: toNumber(r.total), currency: currencyLabel(r.currency),
      issue_date: toExcelDate(r.issue_date), shipment_date: toExcelDate(r.shipment_date),
      arrival_date: toExcelDate(r.arrival_date), created_at: toExcelDate(r.created_at),
    }),
  });

  // ─── Contracts ─────────────────────────────────────────────────────────
  addCategorySheets(workbook, {
    label: "Contracts",
    since,
    rawRows: db.prepare(`
      SELECT c.*, o.order_number AS order_number
      FROM supplier_contracts c LEFT JOIN orders o ON o.id = c.order_id
      WHERE c.created_at >= ? ORDER BY c.created_at DESC
    `).all(sinceValue),
    isDone: r => ["Completed", "Cancelled"].includes(r.status),
    columns: [
      { key: "contract_number", header: "Contract Number", width: 20 },
      { key: "order_number", header: "Order Number", width: 18 },
      { key: "supplier", header: "Supplier", width: 26 },
      { key: "status", header: "Status", width: 14 },
      { key: "total", header: "Total", width: 14, type: "money" },
      { key: "currency", header: "Currency", width: 10 },
      { key: "sign_date", header: "Sign Date", width: 14, type: "date" },
      { key: "delivery_date", header: "Delivery Date", width: 14, type: "date" },
      { key: "created_at", header: "Created At", width: 14, type: "date" },
    ],
    mapRow: r => ({
      _raw: r,
      contract_number: r.contract_number, order_number: r.order_number, supplier: r.supplier, status: r.status,
      total: toNumber(r.total), currency: currencyLabel(r.currency),
      sign_date: toExcelDate(r.sign_date), delivery_date: toExcelDate(r.delivery_date),
      created_at: toExcelDate(r.created_at),
    }),
  });

  // ─── Inspections ───────────────────────────────────────────────────────
  // No `status` column on this table — `result` is the equivalent, and
  // "Conditional" is treated as still-open since it implies follow-up work.
  addCategorySheets(workbook, {
    label: "Inspections",
    since,
    rawRows: db.prepare(`
      SELECT i.*, o.order_number AS order_number
      FROM inspections i LEFT JOIN orders o ON o.id = i.order_id
      WHERE i.created_at >= ? ORDER BY i.created_at DESC
    `).all(sinceValue),
    isDone: r => ["Approved", "Rejected"].includes(r.result),
    columns: [
      { key: "number", header: "Number", width: 18 },
      { key: "order_number", header: "Order Number", width: 18 },
      { key: "inspector", header: "Inspector", width: 20 },
      { key: "result", header: "Result", width: 14 },
      { key: "inspection_date", header: "Inspection Date", width: 14, type: "date" },
      { key: "observations", header: "Observations", width: 34 },
      { key: "created_at", header: "Created At", width: 14, type: "date" },
    ],
    mapRow: r => ({
      _raw: r,
      number: r.number, order_number: r.order_number, inspector: r.inspector, result: r.result,
      inspection_date: toExcelDate(r.inspection_date), observations: r.observations,
      created_at: toExcelDate(r.created_at),
    }),
  });

  // ─── Supplier Flow ─────────────────────────────────────────────────────
  addCategorySheets(workbook, {
    label: "Supplier Flow",
    since,
    rawRows: db.prepare(`
      SELECT f.*, o.order_number AS order_number
      FROM financial_suppliers f LEFT JOIN orders o ON o.id = f.order_id
      WHERE f.created_at >= ? ORDER BY f.created_at DESC
    `).all(sinceValue),
    isDone: r => r.status === "Paid",
    columns: [
      { key: "supplier", header: "Supplier", width: 26 },
      { key: "order_number", header: "Order Number", width: 18 },
      { key: "type", header: "Type", width: 16 },
      { key: "description", header: "Description", width: 30 },
      { key: "amount", header: "Amount", width: 14, type: "money" },
      { key: "currency", header: "Currency", width: 10 },
      { key: "status", header: "Status", width: 12 },
      { key: "due_date", header: "Due Date", width: 14, type: "date" },
      { key: "paid_date", header: "Paid Date", width: 14, type: "date" },
      { key: "paid_amount", header: "Paid Amount", width: 14, type: "money" },
      { key: "payment_schedule", header: "Payment Schedule", width: 16 },
      { key: "created_at", header: "Created At", width: 14, type: "date" },
    ],
    mapRow: r => ({
      _raw: r,
      supplier: r.supplier, order_number: r.order_number, type: r.type, description: r.description,
      amount: toNumber(r.amount), currency: currencyLabel(r.currency), status: r.status,
      due_date: toExcelDate(r.due_date), paid_date: toExcelDate(r.paid_date),
      paid_amount: toNumber(r.paid_amount), payment_schedule: r.payment_schedule,
      created_at: toExcelDate(r.created_at),
    }),
  });

  // ─── Samples ───────────────────────────────────────────────────────────
  addCategorySheets(workbook, {
    label: "Samples",
    since,
    rawRows: db.prepare(`SELECT * FROM samples WHERE created_at >= ? ORDER BY created_at DESC`).all(sinceValue),
    isDone: r => r.status === "Approved",
    columns: [
      { key: "code", header: "Code", width: 12 },
      { key: "product_name", header: "Product Name", width: 24 },
      { key: "category", header: "Category", width: 16 },
      { key: "client", header: "Client", width: 26 },
      { key: "status", header: "Status", width: 18 },
      { key: "requested_date", header: "Requested Date", width: 14, type: "date" },
      { key: "sent_date", header: "Sent Date", width: 14, type: "date" },
      { key: "feedback_date", header: "Feedback Date", width: 14, type: "date" },
      { key: "created_at", header: "Created At", width: 14, type: "date" },
    ],
    mapRow: r => ({
      _raw: r,
      code: r.code, product_name: r.product_name, category: r.category, client: r.client, status: r.status,
      requested_date: toExcelDate(r.requested_date), sent_date: toExcelDate(r.sent_date),
      feedback_date: toExcelDate(r.feedback_date), created_at: toExcelDate(r.created_at),
    }),
  });

  // ─── Packing Lists ─────────────────────────────────────────────────────
  // packing_lists.status is never actually used by the UI (always stuck at
  // "Draft"), so open/completed is based on the linked Order's own status
  // instead — the Order Status column shows exactly why each row landed on
  // whichever sheet it did.
  addCategorySheets(workbook, {
    label: "Packing List",
    since,
    rawRows: db.prepare(`
      SELECT pl.*, o.order_number AS order_number, o.client AS order_client, o.status AS order_status,
        o.shipment_date AS shipment_date, o.arrival_date AS arrival_date
      FROM packing_lists pl LEFT JOIN orders o ON o.id = pl.order_id
      WHERE pl.created_at >= ? ORDER BY pl.created_at DESC
    `).all(sinceValue),
    isDone: r => r.order_status === "Completed",
    columns: [
      { key: "number", header: "Number", width: 22 },
      { key: "order_number", header: "Order Number", width: 18 },
      { key: "client", header: "Client", width: 26 },
      { key: "order_status", header: "Order Status", width: 16 },
      { key: "date", header: "Date", width: 14, type: "date" },
      { key: "shipment_date", header: "Shipment Date", width: 14, type: "date" },
      { key: "arrival_date", header: "Arrival Date", width: 14, type: "date" },
      { key: "total_roll", header: "Total Roll", width: 12, type: "number" },
      { key: "total_gross_weight", header: "Gross Weight (kg)", width: 16, type: "number" },
      { key: "total_net_weight", header: "Net Weight (kg)", width: 16, type: "number" },
      { key: "total_cbm", header: "CBM", width: 12, type: "number" },
      { key: "created_at", header: "Created At", width: 14, type: "date" },
    ],
    mapRow: r => ({
      _raw: r,
      number: r.number, order_number: r.order_number, client: r.order_client, order_status: r.order_status || "—",
      date: toExcelDate(r.date), shipment_date: toExcelDate(r.shipment_date), arrival_date: toExcelDate(r.arrival_date),
      total_roll: toNumber(r.total_roll), total_gross_weight: toNumber(r.total_gross_weight),
      total_net_weight: toNumber(r.total_net_weight), total_cbm: toNumber(r.total_cbm),
      created_at: toExcelDate(r.created_at),
    }),
  });

  return workbook;
}

module.exports = { buildFullReportWorkbook };
