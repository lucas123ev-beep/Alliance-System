// Order Profitability Excel report — internal-only (see canViewProfit in
// permissions.js — the route calling this is restricted to Lucas, Martiello,
// Gabriel and Juliana, nobody else can reach it). One row per selected
// order with its real sale/cost/profit/margin breakdown (see
// computeOrderProfitability in server.js), every figure already converted
// to a single currency by the caller — using the exchange rate from the day
// each order was actually completed, not today's — so a report spanning
// orders closed on different dates (and placed in different currencies)
// still adds up to a meaningful grand total.
//
// Reuses addReportSheet/toNumber from reportBuilder.js so this shares the
// exact same letterhead/column styling as every other Excel report in the
// app instead of re-implementing it.
const ExcelJS = require("exceljs");
const { addReportSheet, toNumber } = require("./reportBuilder");

const COLUMNS = [
  { key: "orderNumber", header: "Order", width: 16 },
  { key: "client", header: "Client", width: 26 },
  { key: "sale", header: "Sale", width: 15, type: "money" },
  { key: "productCost", header: "Product Cost", width: 15, type: "money" },
  { key: "agentCost", header: "Agent", width: 13, type: "money" },
  { key: "freightCost", header: "Freight", width: 13, type: "money" },
  { key: "loadingCost", header: "Loading", width: 13, type: "money" },
  { key: "totalCost", header: "Total Cost", width: 15, type: "money" },
  { key: "profit", header: "Profit", width: 15, type: "money" },
  { key: "marginPct", header: "Margin %", width: 12, type: "decimal" },
];

// params:
//   generatedAt: "YYYY-MM-DD"
//   currency: the single currency every figure below is already in
//   orders: computeOrderProfitability() results, one per selected order
function buildProfitReportWorkbook({ generatedAt, currency, orders }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Alliance Flow";
  workbook.created = new Date();

  const rows = orders.map(o => ({
    orderNumber: o.orderNumber,
    client: o.client || "—",
    sale: toNumber(o.saleTotal) || 0,
    productCost: toNumber(o.productCostTotal) || 0,
    agentCost: toNumber(o.agentCost) || 0,
    freightCost: toNumber(o.freightCost) || 0,
    loadingCost: toNumber(o.loadingCost) || 0,
    totalCost: toNumber(o.totalCost) || 0,
    profit: toNumber(o.profit) || 0,
    marginPct: o.marginPct == null ? null : toNumber(o.marginPct.toFixed(2)),
  }));

  addReportSheet(workbook, {
    sheetName: "Profitability",
    title: "ORDER PROFITABILITY REPORT",
    subtitle: `Generated ${generatedAt} — figures in ${currency}, each order converted at the exchange rate on its own completion date`,
    columns: COLUMNS,
    rows,
    totals: ["sale", "productCost", "agentCost", "freightCost", "loadingCost", "totalCost", "profit"],
  });

  return workbook;
}

module.exports = { buildProfitReportWorkbook };
