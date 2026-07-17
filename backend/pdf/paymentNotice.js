const LOGO = require("./logo");
const { escapeHtml, fmtDateShort, fmtMoney } = require("./helpers");

// Payment Request Form (付款申请单) — internal bilingual form used to
// authorize a payment to a supplier. Built from a financial_suppliers row
// joined with the supplier's bank details.
function renderPaymentNotice(params) {
  const {
    payer, applicationDate, paymentMethod, paymentDeadline, payee,
    bankName, bankBranch, accountNumber, amount, currency, purpose,
    applicant, approvedBy,
  } = params;

  const css = `
    * { box-sizing: border-box; }
    body { margin: 0; padding: 30px 40px; font-family: "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    td { border: 1px solid #333; padding: 8px 10px; font-size: 10.5px; }
    td.label { font-weight: bold; width: 34%; background: #f7f7f7; }
    .bar { background: #f4b183; text-align: center; font-weight: bold; padding: 6px 0; border: 1px solid #333; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .header img { height: 26px; }
    .payer-row td { font-weight: bold; }
  `;

  const body = `
    <div class="header">
      <img src="${LOGO}" alt="Alliance Global" />
      <div style="font-size:10px; color:#555;">${escapeHtml(fmtDateShort(applicationDate))}</div>
    </div>
    <table>
      <tr class="payer-row"><td class="label">付款单位 Payer:</td><td>${escapeHtml(payer || "")}</td></tr>
      <tr><td colspan="2" class="bar">Payment Request Form 付款申请单</td></tr>
      <tr><td class="label">申请时间 Date of Payment Application</td><td>${escapeHtml(fmtDateShort(applicationDate))}</td></tr>
      <tr><td class="label">支付方式 Payment Method</td><td>${escapeHtml(paymentMethod || "网银汇款 Online bank payment")}</td></tr>
      <tr><td class="label">最迟支付时间 Payment Deadline</td><td>${paymentDeadline ? escapeHtml(fmtDateShort(paymentDeadline)) : "—"}</td></tr>
      <tr><td class="label">收款人 / 单位 Name of Payee</td><td>${escapeHtml(payee || "—")}</td></tr>
      <tr><td class="label">银行名称 Bank name</td><td>${escapeHtml(bankName || "—")}</td></tr>
      <tr><td class="label">银行支行全称 Bank Branch name</td><td>${escapeHtml(bankBranch || "—")}</td></tr>
      <tr><td class="label">账户号码 Account NO</td><td>${escapeHtml(accountNumber || "—")}</td></tr>
      <tr><td class="label">金额 Amount</td><td>${fmtMoney(amount, currency)} &nbsp; 币种 currency: ${escapeHtml(currency)}</td></tr>
      <tr><td class="label">支付目的及摘要 Payment Purpose / Description</td><td>${escapeHtml(purpose || "—")}</td></tr>
      <tr><td colspan="2" class="bar">审批情况 Approval process</td></tr>
      <tr><td class="label">申请人 Applicant</td><td>${escapeHtml(applicant || "—")}</td></tr>
      <tr><td class="label">审批人 Approved by</td><td>${escapeHtml(approvedBy || "—")}</td></tr>
    </table>
  `;

  const fontLinks = `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap" rel="stylesheet" />
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />${fontLinks}<style>${css}</style></head><body>${body}</body></html>`;
}

module.exports = { renderPaymentNotice };
