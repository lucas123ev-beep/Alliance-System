// Products-by-Supplier Excel report — triggered from the Products screen.
// One sheet per supplier, listing that supplier's registered items plus how
// often/heavily each one has actually been ordered, so a problematic
// supplier (price creep, one-off items that never get reordered, etc.) is
// visible at a glance instead of buried across every order individually.
//
// Reuses addReportSheet/toNumber/toExcelDate from reportBuilder.js so this
// shares the exact same letterhead/column styling as the main Reports tab
// instead of re-implementing it.
const ExcelJS = require("exceljs");
const { addReportSheet, toNumber, toExcelDate } = require("./reportBuilder");
const { currencyLabel } = require("../pdf/helpers");

// "120 cm" / "" — pairs a raw value with its unit, blank when there's
// nothing registered instead of printing a bare unit or "undefined".
function dimStr(value, unit) {
  if (value === null || value === undefined || value === "") return "";
  return `${value} ${unit || ""}`.trim();
}

// Excel forbids \ / ? * [ ] in sheet names and caps them at 31 chars.
// Supplier company names routinely contain "/" (trading co. names) or run
// long, and two different suppliers can collide once truncated — dedupe
// with a "(2)", "(3)"... suffix rather than silently overwriting one sheet
// with another's data.
function safeSheetName(name, usedNames) {
  // Base capped at 25 chars (not 31) so " (2)".." (99)" — up to 5 more
  // chars — always still fits under Excel's 31-char sheet-name limit
  // instead of the suffix itself getting clipped off (e.g. "... (2" with no
  // closing paren) once a collision actually happens.
  const base = (String(name).replace(/[\\/?*\[\]:]/g, "-").trim() || "Supplier").slice(0, 25);
  let candidate = base;
  let n = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base} (${n})`;
    n++;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

const PRODUCT_COLUMNS = [
  { key: "code", header: "Code", width: 14 },
  { key: "name", header: "Name", width: 28 },
  { key: "category", header: "Category", width: 14 },
  { key: "color", header: "Color", width: 12 },
  { key: "dimensions", header: "Dimensions (W×H×T)", width: 22 },
  { key: "weight", header: "Weight (Gross)", width: 16 },
  { key: "net_weight", header: "Net Weight", width: 16 },
  { key: "unit", header: "Unit", width: 10 },
  { key: "price_basis", header: "Price Basis", width: 12 },
  { key: "cost_price", header: "Cost Price", width: 14, type: "money" },
  { key: "cost_currency", header: "Cost Currency", width: 12 },
  { key: "sale_price", header: "Sale Price", width: 14, type: "money" },
  { key: "sale_currency", header: "Sale Currency", width: 12 },
  { key: "margin_pct", header: "Margin %", width: 10, type: "number" },
  { key: "ncm", header: "NCM", width: 12 },
  { key: "vat_pct", header: "VAT %", width: 10, type: "number" },
  // Usage stats — the actual point of the report: how much this item has
  // really moved, and whether its cost has been creeping up order to order.
  { key: "times_ordered", header: "Times Ordered", width: 13, type: "number" },
  { key: "total_qty", header: "Total Qty Ordered", width: 16, type: "number" },
  { key: "total_spend", header: "Total Spend", width: 16, type: "money" },
  { key: "min_unit_cost", header: "Min Cost Paid", width: 14, type: "money" },
  { key: "max_unit_cost", header: "Max Cost Paid", width: 14, type: "money" },
  { key: "first_order_date", header: "First Order", width: 13, type: "date" },
  { key: "last_order_date", header: "Last Order", width: 13, type: "date" },
];

const SUMMARY_COLUMNS = [
  { key: "supplier", header: "Supplier", width: 28 },
  { key: "product_count", header: "Products Registered", width: 16, type: "number" },
  { key: "orders_count", header: "Orders (Distinct)", width: 14, type: "number" },
  { key: "total_qty", header: "Total Qty Ordered", width: 16, type: "number" },
  { key: "total_spend", header: "Total Spend", width: 16, type: "money" },
  { key: "first_order_date", header: "First Order", width: 13, type: "date" },
  { key: "last_order_date", header: "Last Order", width: 13, type: "date" },
];

function buildProductSupplierReportWorkbook(db) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Alliance Flow";
  workbook.created = new Date();

  const products = db.prepare(`
    SELECT * FROM products ORDER BY supplier COLLATE NOCASE, name COLLATE NOCASE
  `).all();

  // Per-product usage: how many distinct orders it appeared in, total
  // quantity/spend, and the cost range actually paid over time. cost_price
  // is what was actually paid the supplier per unit (falls back to
  // unit_price for older rows saved before that column existed).
  const usageRows = db.prepare(`
    SELECT oi.product_id,
      COUNT(DISTINCT oi.order_id) AS times_ordered,
      SUM(oi.quantity) AS total_qty,
      SUM(COALESCE(oi.cost_price, oi.unit_price, 0) * oi.quantity) AS total_spend,
      MIN(COALESCE(oi.cost_price, oi.unit_price)) AS min_unit_cost,
      MAX(COALESCE(oi.cost_price, oi.unit_price)) AS max_unit_cost,
      MIN(o.created_at) AS first_order_date,
      MAX(o.created_at) AS last_order_date
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
    GROUP BY oi.product_id
  `).all();
  const usageByProduct = new Map(usageRows.map(u => [u.product_id, u]));

  const mapProduct = p => {
    const u = usageByProduct.get(p.id);
    const dimensions = [
      dimStr(p.width, p.width_unit),
      dimStr(p.height, p.height_unit),
      dimStr(p.thickness, p.thickness_unit),
    ].filter(Boolean).join(" × ");
    return {
      code: p.code, name: p.name, category: p.category || "—", color: p.color || "",
      dimensions: dimensions || "—",
      weight: dimStr(p.weight, p.weight_unit) || "—",
      net_weight: dimStr(p.net_weight, p.weight_unit),
      unit: p.unit || "",
      price_basis: p.price_basis || "",
      cost_price: toNumber(p.unit_cost),
      cost_currency: currencyLabel(p.cost_currency || "USD"),
      sale_price: toNumber(p.sale_price),
      sale_currency: currencyLabel(p.sale_currency || "USD"),
      margin_pct: toNumber(p.sale_pct),
      ncm: p.ncm || "",
      vat_pct: toNumber(p.vat_pct),
      times_ordered: u ? toNumber(u.times_ordered) || 0 : 0,
      total_qty: u ? toNumber(u.total_qty) : null,
      total_spend: u ? toNumber(u.total_spend) : null,
      min_unit_cost: u ? toNumber(u.min_unit_cost) : null,
      max_unit_cost: u ? toNumber(u.max_unit_cost) : null,
      first_order_date: u ? toExcelDate(u.first_order_date) : null,
      last_order_date: u ? toExcelDate(u.last_order_date) : null,
    };
  };

  // ─── Supplier Summary ──────────────────────────────────────────────────
  // One row per supplier, sorted by total spend (biggest relationships
  // first) — the fastest way to see who's worth scrutinizing before diving
  // into any one supplier's own item-level sheet.
  // Aliased as `supplier_name` (not `supplier`) because order_items and
  // orders each have their own real `supplier` column once joined in —
  // GROUP BY/ORDER BY `supplier` was ambiguous between those and this
  // computed column, even though the SELECT list itself resolved fine.
  const summaryRows = db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(p.supplier), ''), 'No Supplier') AS supplier_name,
      COUNT(DISTINCT p.id) AS product_count,
      COUNT(DISTINCT oi.order_id) AS orders_count,
      SUM(oi.quantity) AS total_qty,
      SUM(COALESCE(oi.cost_price, oi.unit_price, 0) * oi.quantity) AS total_spend,
      MIN(o.created_at) AS first_order_date,
      MAX(o.created_at) AS last_order_date
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders o ON o.id = oi.order_id
    GROUP BY supplier_name
    ORDER BY total_spend DESC, supplier_name COLLATE NOCASE
  `).all();

  addReportSheet(workbook, {
    sheetName: "Supplier Summary",
    title: "SUPPLIER SUMMARY",
    columns: SUMMARY_COLUMNS,
    rows: summaryRows.map(r => ({
      supplier: r.supplier_name,
      product_count: toNumber(r.product_count) || 0,
      orders_count: toNumber(r.orders_count) || 0,
      total_qty: toNumber(r.total_qty),
      total_spend: toNumber(r.total_spend),
      first_order_date: toExcelDate(r.first_order_date),
      last_order_date: toExcelDate(r.last_order_date),
    })),
  });

  // ─── One sheet per supplier ────────────────────────────────────────────
  const grouped = new Map();
  products.forEach(p => {
    const supplier = (p.supplier || "").trim() || "No Supplier";
    if (!grouped.has(supplier)) grouped.set(supplier, []);
    grouped.get(supplier).push(p);
  });

  const usedNames = new Set(["supplier summary"]);
  // Same order as the summary sheet (biggest spend first) so the tab order
  // reads as a priority list too, not just alphabetical noise. Suppliers
  // with products but zero order history yet fall back to name order.
  const spendBySupplier = new Map(summaryRows.map(r => [r.supplier_name, toNumber(r.total_spend) || 0]));
  const supplierNames = [...grouped.keys()].sort((a, b) => {
    const diff = (spendBySupplier.get(b) || 0) - (spendBySupplier.get(a) || 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  supplierNames.forEach(supplier => {
    const items = grouped.get(supplier);
    addReportSheet(workbook, {
      sheetName: safeSheetName(supplier, usedNames),
      title: supplier.toUpperCase(),
      columns: PRODUCT_COLUMNS,
      rows: items.map(mapProduct),
    });
  });

  return workbook;
}

module.exports = { buildProductSupplierReportWorkbook };
