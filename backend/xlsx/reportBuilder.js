// Full cross-module Excel report — one workbook covering every tracking
// screen (Quotations, Proformas, Orders, Commercial Invoices, Contracts,
// Inspections, Supplier Flow, Samples, Shipment), each split into two
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
// One single rule style used everywhere a horizontal line appears on the
// sheet — the title's underline, the column-header underline, and the line
// under every data row all need to read as the same weight, not have the
// header rule look bold/black while the row-separator lines look fainter.
const HEADER_RULE = { style: "medium", color: { argb: "FF000000" } };

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

// Adds a day-count (e.g. orders.production_lead_time) onto a base date to
// turn a duration into an actual target date, matching how the client's own
// reference spreadsheet shows "Production Lead Time" as a calendar date
// rather than a number of days.
function addDaysToDate(baseDateStr, days) {
  const base = toExcelDate(baseDateStr);
  if (!base || days === null || days === undefined || days === "") return null;
  const n = Number(days);
  if (!Number.isFinite(n)) return null;
  const result = new Date(base.getTime());
  result.setDate(result.getDate() + n);
  return result;
}

// Adds one sheet: small logo top-left + big bold title right-aligned (row
// 1, no fill), a black rule closing off that header block, then a plain
// bold column-header row (row 3, no fill either) with the Excel autofilter,
// then the data rows — first column bold, same as the reference report's
// Order No. column.
function addReportSheet(workbook, { sheetName, title, subtitle, columns, rows }) {
  const sheet = workbook.addWorksheet(sheetName, {
    // No frozen panes: freezing draws Excel's own black divider line at the
    // split row, and that line always spans the full window width — past
    // the table's real columns — with no way to scope or hide it while
    // freeze stays on. Not worth it just to keep the header sticky.
    // activeCell still points past the merged title (A1:I1) so Excel
    // doesn't open with its green selection box sitting on the letterhead.
    views: [{ showGridLines: false, activeCell: "A4" }],
  });

  sheet.columns = columns.map(c => ({ key: c.key, width: c.width || 16 }));

  // Row 1: logo (floating, doesn't touch cell content) + right-aligned title.
  const titleRow = sheet.getRow(1);
  titleRow.height = 34;
  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 17, color: { argb: "FF1A1A1A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "right" };
  sheet.getCell(1, 1).border = { bottom: HEADER_RULE };
  for (let col = 2; col <= columns.length; col++) sheet.getCell(1, col).border = { bottom: HEADER_RULE };

  const imageId = workbook.addImage({ base64: LOGO, extension: "png" });
  sheet.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 130, height: 29 } });

  // Row 2: thin spacer between the letterhead and the column headers.
  sheet.getRow(2).height = 6;

  // Row 3: column headers — bold, no fill, same rule weight as the title's
  // underline above it — this is what the autofilter/freeze anchor to.
  const headerRow = sheet.getRow(3);
  headerRow.height = 18;
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 10 };
    cell.border = { bottom: HEADER_RULE };
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
      // Every item gets the exact same rule as the header row above it —
      // no lighter/fainter line further down the table.
      cell.border = { bottom: HEADER_RULE };
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
// `plainTitle` drops the "— OPEN / NOT COMPLETED" / "— COMPLETED" suffix
// from the on-sheet title (the two tabs already say Open/Done in their own
// names, so for Shipment specifically that suffix just read as clutter).
function addCategorySheets(workbook, { key, label, columns, rawRows, mapRow, isDone, since, plainTitle }) {
  const mapped = rawRows.map(mapRow);
  const open = mapped.filter(r => !isDone(r._raw));
  const done = mapped.filter(r => isDone(r._raw));
  const strip = rows => rows.map(({ _raw, ...rest }) => rest);
  const subtitle = since ? `Since ${since}` : "All time";

  addReportSheet(workbook, {
    sheetName: `${label} (Open)`.slice(0, 31),
    title: plainTitle ? label.toUpperCase() : `${label.toUpperCase()} — OPEN / NOT COMPLETED`,
    subtitle, columns, rows: strip(open),
  });
  addReportSheet(workbook, {
    sheetName: `${label} (Done)`.slice(0, 31),
    title: plainTitle ? label.toUpperCase() : `${label.toUpperCase()} — COMPLETED`,
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
  workbook.creator = "Alliance Flow";
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

  // ─── Shipment ──────────────────────────────────────────────────────────
  // Mirrors the client's own "ORDER SHIPMENT" tracking sheet column-for-
  // column (Order No./Importer/Proforma Date/Product Name/Loading Port/
  // Production Lead Time/Loading Date/Shipping Date/Remark), built off
  // Orders rather than packing_lists — packing_lists.status is unused, and
  // the reference sheet's fields line up with Order + its latest Proforma.
  // `plainTitle: true` because the sheet tabs already say (Open)/(Done),
  // so repeating "— OPEN / NOT COMPLETED" in the title itself was clutter.
  //
  // Production Lead Time has no clean 1:1 real column: it's stored as a
  // day-count (orders.production_lead_time), not a date, so it's shown as
  // Proforma Date + that many days, matching how the reference sheet
  // displays an actual date here. Loading Date now comes from the most
  // recent Packing List linked to the order (packing_lists.loading_date,
  // entered on that screen), since Order itself only tracks one departure
  // date (shipment_date, used for Shipping Date).
  if (include("shipment")) addCategorySheets(workbook, {
    label: "Shipment",
    since,
    plainTitle: true,
    rawRows: db.prepare(`
      SELECT o.*,
        (SELECT p.issue_date FROM proformas p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1) AS proforma_date,
        (SELECT GROUP_CONCAT(DISTINCT oi.product_name) FROM order_items oi WHERE oi.order_id = o.id) AS product_names,
        (SELECT pl.loading_date FROM packing_lists pl WHERE pl.order_id = o.id ORDER BY pl.created_at DESC LIMIT 1) AS loading_date
      FROM orders o
      WHERE o.created_at >= ? ORDER BY o.created_at DESC
    `).all(sinceValue),
    isDone: r => r.status === "Completed",
    columns: [
      { key: "order_number", header: "ORDER NO.", width: 16 },
      { key: "client", header: "IMPORTER", width: 20 },
      { key: "proforma_date", header: "PROFORMA DATE", width: 14, type: "date" },
      { key: "product_name", header: "PRODUCT NAME", width: 26 },
      { key: "loading_port", header: "LOADING PORT", width: 18 },
      { key: "production_lead_time", header: "PRODUCTION LEAD TIME", width: 16, type: "date" },
      { key: "loading_date", header: "LOADING DATE", width: 14, type: "date" },
      { key: "shipping_date", header: "SHIPPING DATE", width: 14, type: "date" },
      { key: "remark", header: "REMARK", width: 30 },
    ],
    mapRow: r => ({
      _raw: r,
      order_number: r.order_number, client: r.client,
      proforma_date: toExcelDate(r.proforma_date),
      product_name: r.product_names || r.product || "—",
      loading_port: r.port_of_loading,
      production_lead_time: addDaysToDate(r.proforma_date, r.production_lead_time),
      loading_date: toExcelDate(r.loading_date),
      shipping_date: toExcelDate(r.shipment_date),
      remark: r.notes,
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
  { key: "shipment", label: "Shipment" },
];

// addReportSheet/toNumber/toExcelDate are also reused by
// productSupplierReport.js, which mirrors this same letterhead/column
// styling for its own (differently-shaped) Products-by-Supplier workbook.
module.exports = { buildFullReportWorkbook, CATEGORIES, addReportSheet, toNumber, toExcelDate };
