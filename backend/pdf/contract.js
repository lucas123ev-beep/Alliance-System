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
      <td class="num">${fmtNumber(item.quantity, 2)} ${escapeHtml(item.unit || "")}</td>
      <td class="num">${fmtMoney(item.unitPrice, item.currency || currency)}</td>
      <td class="num">${fmtMoney(item.total, item.currency || currency)}</td>
    </tr>
  `).join("");

  const css = `
    * { box-sizing: border-box; }
    body { margin: 0; padding: 22px 30px; font-family: "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif; font-size: 10.5px; color: #1a1a1a; }
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
          <th>数量</th><th>含税单价</th><th>金额</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="totals-row">
          <td colspan="8" style="text-align:right;">总计 (Total)</td>
          <td class="num">${fmtMoney(total, currency)}</td>
        </tr>
      </tbody>
    </table>

    <div class="remarks">
      <div class="req-title">要求 / Requirements</div>
      ${remarks ? `<p class="clause"><b>备注 / Notes:</b> ${escapeHtml(remarks)}</p>` : ""}
      <p class="clause">2. 30 米一卷，纸管包装，加微粉打卷，一层PVC袋，一层牛皮纸，左右两端都要贴唛头，包装完成，中间不允许有破洞、接头、划痕等。</p>
      <p class="clause">3. 数量要求：出货数量控制在 +/- 5% 内。发货前需各寄 2 米大货样至我司确认品质，并提供细码单（记录每卷米数跟重量）及发货发票。</p>
      <p class="clause">4. 运输方式：买方负责运费。</p>
      <p class="clause">5. 付款方式：20% 定金，剩余 80% 尾款发货前付清。</p>
      <p class="clause">6. 交货期：收到定金后 20 天内完成${deliveryDate ? `（${escapeHtml(deliveryDate)} 前交货）` : ""}。</p>
      <p class="clause">7. 品质保证期为货到目的港后一年内有效。</p>
      <p class="clause">8. 产品投诉：如卖方的品质与合同不符，或者未在规定的交货期完成货物，我司有权拒收所有货物，并要求退还定金。</p>
      <p class="clause">9. 本合同经双方签字或盖章确认生效，如有纠纷双方协商解决，协商不成，由买方所在地人民法院管辖。</p>
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

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>${css}</style></head><body>${body}</body></html>`;
}

module.exports = { renderContract };
