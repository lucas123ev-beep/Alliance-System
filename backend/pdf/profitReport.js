const { wrapDocument } = require("./layout");
const { escapeHtml, fmtMoney, fmtDateLong, currencyLabel } = require("./helpers");

// Internal-only report (see canViewProfit in permissions.js — nobody else
// can reach the route that calls this) — one row per order with its real
// sale/cost/profit/margin breakdown (see computeOrderProfitability in
// server.js), everything already converted to a single currency by the
// caller so a report spanning orders placed in different currencies still
// has a meaningful grand total row.
//
// params:
//   generatedAt: "YYYY-MM-DD"
//   currency: the single currency every figure below is already in
//   orders: computeOrderProfitability() results, one per selected order
function renderProfitReport({ generatedAt, currency, orders }) {
  const rows = orders.map(o => `
    <tr>
      <td><strong>${escapeHtml(o.orderNumber)}</strong></td>
      <td>${escapeHtml(o.client || "—")}</td>
      <td class="num">${fmtMoney(o.saleTotal, currency)}</td>
      <td class="num">${fmtMoney(o.productCostTotal, currency)}</td>
      <td class="num">${fmtMoney(o.agentCost, currency)}</td>
      <td class="num">${fmtMoney(o.freightCost, currency)}</td>
      <td class="num">${fmtMoney(o.loadingCost, currency)}</td>
      <td class="num">${fmtMoney(o.totalCost, currency)}</td>
      <td class="num" style="font-weight:bold; color:${o.profit < 0 ? "#ef4444" : "#0D1627"};">${fmtMoney(o.profit, currency)}</td>
      <td class="num" style="font-weight:bold;">${o.marginPct == null ? "—" : `${o.marginPct > 0 ? "+" : ""}${o.marginPct.toFixed(1)}%`}</td>
    </tr>
  `).join("");

  const totals = orders.reduce((acc, o) => ({
    sale: acc.sale + o.saleTotal,
    productCost: acc.productCost + o.productCostTotal,
    agent: acc.agent + o.agentCost,
    freight: acc.freight + o.freightCost,
    loading: acc.loading + o.loadingCost,
    totalCost: acc.totalCost + o.totalCost,
    profit: acc.profit + o.profit,
  }), { sale: 0, productCost: 0, agent: 0, freight: 0, loading: 0, totalCost: 0, profit: 0 });
  const grandMarginPct = totals.totalCost > 0 ? (totals.profit / totals.totalCost) * 100 : null;

  const body = `
    <div class="doc-meta-row">
      <div><strong>Generated:</strong> ${fmtDateLong(generatedAt)}</div>
      <div><strong>Orders:</strong> ${orders.length}</div>
    </div>
    <table class="items-table" style="margin-top:8px;">
      <thead>
        <tr>
          <th style="width:9%">Order</th>
          <th style="width:17%">Client</th>
          <th style="width:10%">Sale</th>
          <th style="width:10%">Product Cost</th>
          <th style="width:9%">Agent</th>
          <th style="width:9%">Freight</th>
          <th style="width:9%">Loading</th>
          <th style="width:10%">Total Cost</th>
          <th style="width:10%">Profit</th>
          <th style="width:7%">Margin</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tbody>
        <tr class="totals-row">
          <td colspan="2">TOTAL</td>
          <td class="num">${fmtMoney(totals.sale, currency)}</td>
          <td class="num">${fmtMoney(totals.productCost, currency)}</td>
          <td class="num">${fmtMoney(totals.agent, currency)}</td>
          <td class="num">${fmtMoney(totals.freight, currency)}</td>
          <td class="num">${fmtMoney(totals.loading, currency)}</td>
          <td class="num">${fmtMoney(totals.totalCost, currency)}</td>
          <td class="num">${fmtMoney(totals.profit, currency)}</td>
          <td class="num">${grandMarginPct == null ? "—" : `${grandMarginPct > 0 ? "+" : ""}${grandMarginPct.toFixed(1)}%`}</td>
        </tr>
      </tbody>
    </table>
    <div class="footer-note">Internal report — all figures converted to ${escapeHtml(currencyLabel(currency))} at the exchange rate in effect when this report was generated. Not for client distribution.</div>
  `;

  const header = `
    <div class="header">
      <div class="company">
        <div class="company-name">Alliance Flow — Order Profitability Report</div>
      </div>
    </div>
  `;
  return wrapDocument({ title: "PROFITABILITY REPORT", header, body });
}

module.exports = { renderProfitReport };
