const LOGO = require("./logo");
const { escapeHtml, fmtNumber, fmtMoney } = require("./helpers");

// Supplier Purchase Contract (采购合同) — Chinese-language PO used with
// Chinese factories/trading companies. Structure and clause wording are
// fixed (per client's own template); only dates, numbers, items, totals
// and the buyer/seller blocks are dynamic.
function renderContract(params) {
  const {
    contractNumber, signDate, deliveryDate, acq, supplier, items, total, currency, remarks,
  } = params;

  const rows = items.map((item, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${escapeHtml(item.productName)}</td>
      <td>${escapeHtml(item.color || "—")}</td>
      <td>${escapeHtml(item.code || "—")}</td>
      <td>${escapeHtml(item.thickness || "—")}</td>
      <td>${escapeHtml(item.width || "—")}</td>
      <td>${escapeHtml(item.gramatura || "—")}</td>
      <td class="num">${item.quantityTons != null ? `${fmtNumber(item.quantityTons, 3)} t` : "—"}</td>
      <td class="num">${fmtMoney(item.unitPrice, item.currency || currency)}</td>
      <td class="num">${fmtMoney(item.total, item.currency || currency)}</td>
    </tr>
  `).join("");

  const css = `
    * { box-sizing: border-box; }
    body { margin: 0; padding: 22px 30px; font-family: "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif; font-size: 10.5px; color: #1a1a1a; }
    table { width: 100%; border-collapse: collapse; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .header img.logo { height: 30px; }
    .header .company { text-align: right; font-size: 10px; line-height: 1.5; }
    .header .company .cn { font-weight: bold; font-size: 12px; }
    .header .company .en { font-weight: bold; font-size: 10px; }
    .title-bar { text-align: center; font-weight: bold; font-size: 15px; letter-spacing: 4px; margin: 4px 0 10px; }
    .meta-row { display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 8px; }
    .items-table td, .items-table th { border: 1px solid #333; padding: 5px 6px; font-size: 9.5px; }
    .items-table th { background: #eee; font-size: 9px; }
    .items-table .num { text-align: right; }
    .totals-row td { font-weight: bold; background: #f2f2f2; }
    .remarks { border: 1px solid #333; border-top: none; padding: 8px 10px; }
    .remarks .req-title { text-align: center; font-weight: bold; background: #eee; margin: -8px -10px 8px; padding: 4px 0; border-bottom: 1px solid #333; }
    .clause { margin: 5px 0; line-height: 1.5; }
    .clause b { font-weight: bold; }
    .sign-block { display: flex; justify-content: space-between; margin-top: 40px; }
    .sign-block .party { width: 46%; font-size: 10px; line-height: 1.8; }
    .sign-block .party .role { font-weight: bold; margin-bottom: 4px; }
    .sign-line { border-top: 1px solid #333; margin-top: 30px; padding-top: 4px; }
  `;

  const body = `
    <div class="header">
      <img class="logo" src="${LOGO}" alt="Alliance Global" />
      <div class="company">
        ${acq.chineseName ? `<div class="cn">${escapeHtml(acq.chineseName)}</div>` : ""}
        <div class="en">${escapeHtml(acq.name)}</div>
      </div>
    </div>
    <div class="title-bar">采购合同 / PURCHASE CONTRACT</div>
    <div class="meta-row">
      <div>合同日期 / Contract Date: <strong>${escapeHtml(signDate)}</strong></div>
      <div>合同编号 / Contract No.: <strong>${escapeHtml(contractNumber)}</strong></div>
    </div>
    <p style="font-size:9.5px; color:#444;">根据《中华人民共和国合同法》及相关法律规定买卖双方本着平等互利的原则，自愿签订以下合约，供双方共同履行。</p>
    <p style="font-weight:bold; margin-bottom:4px;">1. 产品规格及要求 / Product Specifications</p>
    <table class="items-table">
      <thead>
        <tr>
          <th>项目</th><th>品名</th><th>颜色</th><th>编号</th><th>厚度</th><th>有效门幅</th>
          <th>克重 Gramatura</th><th>总重量(吨) Total Weight (Tons)</th><th>含税单价</th><th>金额</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="totals-row">
          <td colspan="9" style="text-align:right;">总计 (Total)</td>
          <td class="num">${fmtMoney(total, currency)}</td>
        </tr>
      </tbody>
    </table>

    <div class="remarks">
      <div class="req-title">要求 / Requirements</div>
      ${remarks ? `<p class="clause" style="white-space:pre-wrap;">${escapeHtml(remarks)}</p>` : ""}
    </div>

    <div class="sign-block">
      <div class="party">
        <div class="role">买方 / Buyer: ${escapeHtml(acq.chineseName || acq.name)}</div>
        <div>帐号 / Account: ${escapeHtml(acq.bank.account)}</div>
        <div>开户 / Bank: ${escapeHtml(acq.bank.bankName)}</div>
        <div class="sign-line">签名 / 公司盖章 &nbsp;&nbsp;&nbsp;&nbsp; 日期:</div>
      </div>
      <div class="party">
        <div class="role">卖方 / Seller: ${escapeHtml(supplier.name)}</div>
        <div>帐号 / Account: ${escapeHtml(supplier.accountNumber || "—")}</div>
        <div>开户 / Bank: ${escapeHtml(supplier.bankName || "—")}${supplier.bankBranch ? " " + escapeHtml(supplier.bankBranch) : ""}</div>
        ${supplier.contactName ? `<div>联系人 / Attn: ${escapeHtml(supplier.contactName)} ${escapeHtml(supplier.phone || "")}</div>` : ""}
        <div class="sign-line">签名 / 公司盖章 &nbsp;&nbsp;&nbsp;&nbsp; 日期:</div>
      </div>
    </div>
  `;

  const fontLinks = `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap" rel="stylesheet" />
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />${fontLinks}<style>${css}</style></head><body>${body}</body></html>`;
}

module.exports = { renderContract };
