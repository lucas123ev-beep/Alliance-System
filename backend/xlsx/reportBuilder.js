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

// Matches the plain, native-Excel letterhead the client already uses (small
// logo top-left, big bold title right-aligned, one black rule underneath,
// otherwise no fill colors or cell borders anywhere) instead of the boxed
// PDF-style banner this used to have — that read as a totally different
// document family instead of "the same report they already know."
const HEADER_RULE = { style: "medium", color: { argb: "FF000000" } };
const HEADER_UNDERLINE = { style: "thin", color: { argb: "FF999999" } };

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

// Adds one sheet: small logo top-left + big bold title right-aligned (row
// 1, no fill), a black rule closing off that header block, then a plain
// bold column-header row (row 3, no fill either) with the Excel autofilter
// + frozen panes anchored to it, then the data rows — first column bold,
// same as the reference report's Order No. column.
function addReportSheet(workbook, { sheetName, title, subtitle, columns, rows }) {
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  sheet.columns = columns.map(c => ({ key: c.key, width: c.width || 16 }));

  // Row 1: logo (floating, doesn't touch cell content) + right-aligned title.
  const titleRow = sheet.getRow(1);
  titleRow.height = 30;
  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 17, color: { argb: "FF1A1A1A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "right" };
  sheet.getCell(1, 1).border = { bottom: HEADER_RULE };
  for (let col = 2; col <= columns.length; col++) sheet.getCell(1, col).border = { bottom: HEADER_RULE };

  const imageId = workbook.addImage({ base64: LOGO, extension: "png" });
  sheet.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 85, height: 19 } });

  // Row 2: thin spacer between the letterhead and the column headers.
  sheet.getRow(2).height = 6;

  // Row 3: column headers — bold, no fill, just a thin rule under them —
  // this is what the autofilter/freeze anchor to.
  const headerRow = sheet.getRow(3);
  headerRow.height = 18;
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 10 };
    cell.border = { bottom: HEADER_UNDERLINE };
    cell.alignment = { vertical: "middle" };
  });
  if (subtitle) sheet.getCell(3, columns.length).note = subtitle;

  rows.forEach(row => {
    const excelRow = sheet.addRow(row);
    columns.forEach((c, i) => {
      const cell = excelRow.getCell(i + 1);
      if (c.type === "date") cell.numFmt = "dd/mm/yyyy";
      if (c.type === "money") cell.numFmt = "#,##0.00";
      if (c.type === "number") cell.numFmt = "#,##0.##";
      cell.alignment = { vertical: "top", wrapText: true };
      // First column (e.g. Order/Contract/Invoice Number) bold, matching
      // the reference report's bolded Order No. column.
      if (i === 0) cell.font = { bold: true };
    });
  });

  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } };
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

// `selectedCategories` is a Set of category keys (see the CATEGORY_KEYS
// list exported below — the frontend's checkboxes use the same keys) or
// null/undefined to mean "include everything". Wrapping each block in
// `include(key)` skips both the sheet AND its query entirely for anything
// left unchecked, instead of running every query and just hiding the sheet.
function buildFullReportWorkbook(db, since, selectedCategories) {
  const sinceValue = since || "0000-01-01";
  const include = key => !selectedCategories || selectedCategories.has(key);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ExportFlow";
  workbook.created = new Date();

  // ─── Quotations ────────────────────────────────────────────────────────
  if (include("quotations")) addCategorySheets(workbook, {
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
  if (include("proformas")) addCategorySheets(workbook, {
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
  if (include("orders")) addCategorySheets(workbook, {
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
  if (include("commercial")) addCategorySheets(workbook, {
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
  if (include("contracts")) addCategorySheets(workbook, {
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
  if (include("inspections")) addCategorySheets(workbook, {
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
  if (include("supplier-flow")) addCategorySheets(workbook, {
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
  if (include("samples")) addCategorySheets(workbook, {
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
  if (include("packing-list")) addCategorySheets(workbook, {
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

// Single source of truth for the 9 category keys/labels — the frontend's
// Reports screen checkboxes are built from this same list (via
// GET /api/reports/categories) so the two sides can't drift apart.
const CATEGORIES = [
  { key: "quotations", label: "Quotations" },
  { key: "proformas", label: "Proformas" },
  { key: "orders", label: "Orders" },
  { key: "commercial", label: "Commercial Invoices" },
  { key: "contracts", label: "Contracts" },
  { key: "inspections", label: "Inspections" },
  { key: "supplier-flow", label: "Supplier Flow" },
  { key: "samples", label: "Samples" },
  { key: "packing-list", label: "Packing List" },
];

module.exports = { buildFullReportWorkbook, CATEGORIES };
