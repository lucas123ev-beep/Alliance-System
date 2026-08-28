import { useState, useEffect, useCallback, useRef, createContext, useContext, Children, cloneElement } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// ─── LANGUAGE (EN / 简体中文) ───────────────────────────────────────────────
// Two-language toggle for the system's own interface chrome only — nav,
// buttons, headers, table columns, form field labels. Deliberately does NOT
// touch: PDF documents (Contract is already bilingual CN/EN by its own
// design; Proforma/CI/Packing List stay English, matching the client's own
// reference documents) or any registered business data (product/client/
// supplier names, notes, numbers — those are real records, never rewritten).
//
// t(key) uses the English UI string itself as the lookup key, so any string
// not yet added to TRANSLATIONS.zh just falls back to English instead of
// showing a blank or a raw key — the dictionary can be filled in
// incrementally, screen by screen, without ever breaking anything.
const TRANSLATIONS = {
  zh: {
    "Alliance Flow": "Alliance Flow",
    "Order Management": "订单管理",
    "Log out": "退出登录",
    "Dashboard": "仪表盘",
    "Quotations": "报价单",
    "Proformas": "形式发票",
    "Orders": "订单",
    "Commercial": "商业发票",
    "Packing Lists": "装箱单",
    "Contracts": "合同",
    "Inspections": "验货",
    "Supplier Flow": "供应商付款",
    "Samples": "样品",
    "Products": "产品",
    "Clients": "客户",
    "Suppliers": "供应商",
    "Freight Agents": "货运代理",
    "Reports": "报表",
    // Page titles (some phrased differently from the matching nav label
    // above, so they need their own separate dictionary entry).
    "Product Registry": "产品登记",
    "Product Development – Samples": "产品开发 – 样品",
    "Proforma Invoices": "形式发票",
    "Supplier Contracts": "供应商合同",
    "💰 Client Cash Flow": "💰 客户现金流",
    "📦 Supplier Cash Flow": "📦 供应商现金流",
    "Commercial Invoices": "商业发票",
    "📊 Reports": "📊 报表",
    // Modal titles
    "Edit Product Item": "编辑产品项目",
    "Add Product": "添加产品",
    "New Quotation": "新建报价单",
    "Edit Quotation": "编辑报价单",
    "Generate Proforma": "生成形式发票",
    "Edit Proforma": "编辑形式发票",
    "New Order": "新建订单",
    "Edit Order": "编辑订单",
    "Edit Contract": "编辑合同",
    "Generate Inspection": "生成验货",
    "Edit Inspection": "编辑验货",
    "Edit Commercial Invoice": "编辑商业发票",
    "Generate Supplier Contracts": "生成供应商合同",
    "Duplicate Product": "复制产品",
    "New Product": "新建产品",
    "Edit Product": "编辑产品",
    "New Sample Request": "新建样品申请",
    "Edit Sample": "编辑样品",
    "New Proforma": "新建形式发票",
    "New Client Payment": "新建客户付款",
    "Edit Client Payment": "编辑客户付款",
    "New Supplier Payment": "新建供应商付款",
    "Edit Supplier Payment": "编辑供应商付款",
    "New Client": "新建客户",
    "Edit Client": "编辑客户",
    "New Supplier": "新建供应商",
    "Edit Supplier": "编辑供应商",
    "New Freight Agent": "新建货运代理",
    "Edit Freight Agent": "编辑货运代理",
    "Generate Packing List": "生成装箱单",
    "Edit Packing List": "编辑装箱单",
    "New Inspection": "新建验货",
    // Form field labels
    "Product": "产品",
    "Supplier": "供应商",
    "Target Price Basis": "目标价基准",
    "Total Weight": "总重量",
    "≈ Packages": "≈ 包装数",
    "Total Meterage": "总米数",
    "Order Number": "订单编号",
    "Client": "客户",
    "Consignee (optional)": "收货人（可选）",
    "Notify Party (optional)": "通知方（可选）",
    "Acquisition Company": "采购公司",
    "Value": "金额",
    "Currency": "货币",
    "Prod. Lead Time (days)": "生产周期（天）",
    "Delivery Days (after TT payment, or a note)": "交货天数（TT付款后，或备注）",
    "Incoterm": "贸易术语",
    "Container": "集装箱",
    "Port of Loading": "装货港",
    "Port of Discharge": "卸货港",
    "Airport of Loading": "装货机场",
    "Airport of Discharge": "卸货机场",
    "Shipment Date": "发货日期",
    "Arrival Date": "到达日期",
    "Payment Terms": "付款条件",
    "Notes": "备注",
    "Product Code": "产品编号",
    "Name": "名称",
    "NCM": "NCM 编码",
    "HS Code": "HS 编码",
    "Color": "颜色",
    "Category": "类别",
    "Package": "包装",
    "Width": "宽度",
    "Height": "高度",
    "Thickness": "厚度",
    "Sold By": "销售单位",
    "Units per Package (optional)": "每包装数量（可选）",
    "Tube Weight (cardboard core, per roll)": "纸管重量（每卷）",
    "Roll Diameter (finished roll, tube included)": "卷径（含纸管）",
    "Volume (per package)": "体积（每包装）",
    "Price Basis": "计价基准",
    "Cost Currency": "成本货币",
    "Cost per Meter": "每米成本",
    "Cost per Liter": "每升成本",
    "Cost per Ton": "每吨成本",
    "Cost Price": "成本价",
    "VAT %": "增值税 %",
    "Sale Currency": "销售货币",
    "Sale per Meter": "每米售价",
    "Sale per Liter": "每升售价",
    "Sale per Ton": "每吨售价",
    "Sale Price": "销售价",
    "Margin %": "利润率 %",
    "Description": "描述",
    "Photos / Files": "照片 / 文件",
    "Code": "编号",
    "Product Name": "产品名称",
    "Requested Date": "申请日期",
    "Ready Date": "完成日期",
    "Sent Date": "寄出日期",
    "Status": "状态",
    "Photos / Videos": "照片 / 视频",
    "Linked Order": "关联订单",
    "Proforma Number": "形式发票编号",
    "Issue Date": "开票日期",
    "Validity Date": "有效日期",
    "Total Amount": "总金额",
    "Way of Shipment": "运输方式",
    "End of Production (days after TT payment, or a note)": "生产完成（TT付款后天数，或备注）",
    "Delivery at Port (days after TT payment, or a note)": "到港交货（TT付款后天数，或备注）",
    "Contract Number": "合同编号",
    "Sign Date": "签约日期",
    "Delivery Date": "交货日期",
    "Type": "类型",
    "Amount": "金额",
    "Due Date": "到期日",
    "Amount Paid So Far": "已付金额",
    "Payer": "付款人",
    "Payment Method": "付款方式",
    "Applicant": "申请人",
    "Approved By": "批准人",
    "Payment Schedule": "付款计划",
    "Number": "编号",
    "Deadline": "截止日期",
    "Price Validity": "价格有效期",
    "Specifications": "规格",
    "Date": "日期",
    "Loading Date": "装货日期",
    "Port of Origin": "起运港",
    "Port of Destination": "目的港",
    "Manufacturer": "生产商",
    "Manufacturer Address": "生产商地址",
    "Freight Agent": "货运代理",
    "Agent Cost": "代理费用",
    "Freight Cost": "运费",
    "Loading Cost": "装货费用",
    "Container Code": "集装箱号",
    "Total": "总计",
    "Company Name": "公司名称",
    "Contact Name": "联系人",
    "Email": "邮箱",
    "Phone": "电话",
    "Street / Address": "街道 / 地址",
    "Address 2 / Complement": "地址补充",
    "Neighborhood": "区域",
    "City": "城市",
    "State / Province": "州 / 省",
    "ZIP / Postal Code": "邮政编码",
    "Country": "国家",
    "Tax ID / CNPJ": "税号 / CNPJ",
    "Product Types": "产品类型",
    "Beneficiary Name": "收款人姓名",
    "Bank Name": "银行名称",
    "Bank Branch": "开户支行",
    "Account Number": "账号",
    "SWIFT Code": "SWIFT 代码",
    "Inspection Number": "验货编号",
    "Inspection Date": "验货日期",
    "Inspector": "验货员",
    "Result": "结果",
    "Observations": "备注",
    "Item": "项目",
    "Inspection saved.": "验货已保存。",
    "All inspections saved — Close": "所有验货已保存 — 关闭",
    "Since (optional)": "起始日期（可选）",
    // Buttons
    "Cancel": "取消",
    "Edit": "编辑",
    "Del": "删除",
    "Save": "保存",
    "+ New Quotation": "+ 新建报价单",
    "+ New Order": "+ 新建订单",
    "+ New Product": "+ 新建产品",
    "+ New Sample": "+ 新建样品",
    "+ New Proforma": "+ 新建形式发票",
    "+ New Entry": "+ 新建记录",
    "+ New Client": "+ 新建客户",
    "+ New Supplier": "+ 新建供应商",
    "+ New Freight Agent": "+ 新建货运代理",
    "+ New Inspection": "+ 新建验货",
    "+ Add Product": "+ 添加产品",
    "Save Order": "保存订单",
    "Save Sample": "保存样品",
    "Save Contract": "保存合同",
    "Save Packing List": "保存装箱单",
    "Save Client": "保存客户",
    "Save Supplier": "保存供应商",
    "Save Inspection": "保存验货",
    "Duplicate": "复制",
    "📄 Download PDF": "📄 下载 PDF",
    "📄 PDF": "📄 PDF",
    "OK": "好的",
    "✅ All contracts saved — Close": "✅ 所有合同已保存 — 关闭",
    "📊 Supplier Report": "📊 供应商报表",
    "⬇ Download Report (.xlsx)": "⬇ 下载报表 (.xlsx)",
    "Contract ✓": "合同 ✓",
    "Contract": "合同",
    "Commercial ✓": "商业发票 ✓",
    "Inspection ✓": "验货 ✓",
    "Inspection": "验货",
    "Proforma ✓": "形式发票 ✓",
    "Proforma": "形式发票",
    "Order ✓": "订单 ✓",
    "Create Order": "创建订单",
    "Packing List ✓": "装箱单 ✓",
    "Packing List": "装箱单",
    "Quotation": "报价单",
    "Sample": "样品",
    "Commercial Invoice": "商业发票",
    "Supplier Payment": "供应商付款",
    "Client Payment": "客户收款",
    // Table headers
    "Actions": "操作",
    "Report": "报表",
    "Qty": "数量",
    "Target Price": "目标价",
    "Target Price (RMB)": "目标价（人民币）",
    "Refresh from registered product": "从产品档案刷新",
    "Not linked to a registered product": "未关联已登记产品",
    "Update All": "全部更新",
    "Could not refresh this item — the registered product may have been deleted.": "无法刷新此项目 — 该产品可能已被删除。",
    "Order #": "订单号",
    "Shipment": "发货",
    "Contract #": "合同号",
    "Delivery": "交货",
    "Lead Time": "生产周期",
    "Arrival": "到达",
    "Unit": "单位",
    "Weight": "重量",
    "Cost": "成本",
    "Sale": "销售",
    "Price": "价格",
    "📈 Price History": "📈 价格历史",
    "Price History": "价格历史",
    "No price changes recorded yet.": "暂无价格变动记录。",
    "Overall change": "总变化",
    "since first record": "自首次记录以来",
    "Changed By": "修改人",
    "Change": "变化",
    "Requested": "申请日期",
    "Ready": "完成日期",
    "Sent": "寄出日期",
    "Validity": "有效期",
    "Company": "公司",
    "Contact": "联系人",
    "Bank": "银行",
    "Order": "订单",
    "Roll": "卷数",
    "Gross Weight": "毛重",
    "Net Weight": "净重",
    "CBM": "立方米",
    // Status / dropdown option values (Incoterms, currency codes, unit
    // abbreviations like mm/cm, and registered company names are
    // deliberately NOT translated here — they're international codes or
    // real data, and safely fall back to English via the same lookup).
    "Pending": "待处理",
    "In Production": "生产中",
    "Completed": "已完成",
    "Feedback Received": "已收到反馈",
    "Approved": "已批准",
    "Partial": "部分",
    "Overdue": "逾期",
    "Draft": "草稿",
    "Accepted": "已接受",
    "Rejected": "已拒绝",
    "Signed": "已签署",
    "In Force": "生效中",
    "Cancelled": "已取消",
    "Received": "已收到",
    "Conditional": "有条件",
    "Textile": "纺织品",
    "Machine": "机械",
    "DTF Film": "DTF 膜",
    "Chemical": "化工品",
    "Accessory": "配件",
    "Packaging": "包装",
    "Other": "其他",
    "Bags / Sacks - 25kg": "袋装 - 25公斤",
    "Bags / Sacks - 50kg": "袋装 - 50公斤",
    "Boxes / Cartons - Large": "纸箱 - 大",
    "Boxes / Cartons - Medium": "纸箱 - 中",
    "Boxes / Cartons - Small": "纸箱 - 小",
    "Wooden Crates - Large": "木箱 - 大",
    "Wooden Crates - Medium": "木箱 - 中",
    "Wooden Crates - Small": "木箱 - 小",
    "Fiber Drums / Barrels": "纤维桶",
    "Pallet - America": "托盘 - 美式",
    "Pallet - Europe": "托盘 - 欧式",
    "Plastic Drums / Barrels": "塑料桶",
    "Rolls": "卷装",
    "Steel Drums / Barrels": "钢桶",
    "IBC Tank": "IBC 罐",
    "Flex Tank": "软罐",
    "Meters": "米",
    "Pair": "双",
    "By Sea": "海运",
    "By Air": "空运",
    "By Land": "陆运",
    "Select...": "请选择...",
    // Login / force-change-password screens
    "Password": "密码",
    "Enter password…": "输入密码…",
    "Signing in…": "登录中…",
    "Enter": "登录",
    "Incorrect username or password.": "用户名或密码错误。",
    "Could not reach the server. Check your connection and try again.": "无法连接服务器，请检查网络后重试。",
    "Welcome,": "欢迎，",
    "This is your first time signing in. Set a new password to continue — the temporary one won't work again after this.": "这是您第一次登录。请设置新密码以继续 — 临时密码之后将无法再次使用。",
    "New password": "新密码",
    "Confirm password": "确认密码",
    "Password must be at least 6 characters.": "密码至少需要6个字符。",
    "Passwords don't match.": "两次输入的密码不一致。",
    "Couldn't update your password. Try again.": "密码更新失败，请重试。",
    "Saving…": "保存中…",
    "Set password & continue": "设置密码并继续",
    // Dashboard
    "Loading...": "加载中...",
    "Client Receivables": "客户应收款",
    "Supplier Payables": "供应商应付款",
    "Pending Orders": "待处理订单",
    "Pending Quotations": "待处理报价单",
    "Pending Commercial Invoices": "待处理商业发票",
    "Pending Inspections": "待验货",
    "Pending Samples": "待处理样品",
    "Pending Supplier Payments": "待付供应商款项",
    "Active Contracts": "生效中合同",
    // Reports screen
    "Generates one Excel workbook. Each screen you pick below becomes two sheets — everything still open/pending first, everything already completed second — with status, key dates and values for that screen.": "生成一个 Excel 工作簿。下方勾选的每个模块会生成两个工作表 — 先是仍在处理中的，然后是已完成的 — 包含该模块的状态、关键日期和金额。",
    "Which screens?": "选择模块",
    "All": "全选",
    "None": "全不选",
    "Pick at least one screen above.": "请至少选择一个模块。",
    "Leave the date blank to include everything on record. When set, only records created on or after that date are included, in each screen's own timeline.": "留空日期以包含所有记录。设置日期后，仅包含在该日期或之后创建的记录（按各模块自身的时间线）。",
    // Search placeholders
    "Search product…": "搜索产品…",
    "Search client…": "搜索客户…",
    "Search China ports or type any…": "搜索中国港口或输入任意港口…",
    "Search Brazil ports or type any…": "搜索巴西港口或输入任意港口…",
    "Search or type payment terms…": "搜索或输入付款条件…",
    "Search supplier…": "搜索供应商…",
    "Search by number, product, client or status…": "按编号、产品、客户或状态搜索…",
    "Search or type freight agent…": "搜索或输入货运代理…",
    "Search by order #, client, status or incoterm…": "按订单号、客户、状态或贸易术语搜索…",
    "Search by name, code or category…": "按名称、编号或类别搜索…",
    "Search by product, client or status…": "按产品、客户或状态搜索…",
    "Search by number, client or status…": "按编号、客户或状态搜索…",
    "Search by contract #, supplier or status…": "按合同号、供应商或状态搜索…",
    "Search by company or contact…": "按公司或联系人搜索…",
    "Search by company or product type…": "按公司或产品类型搜索…",
    "Search by number, order or client…": "按编号、订单或客户搜索…",
    "Search by number, inspector or result…": "按编号、验货员或结果搜索…",
    // Inline pricing row (Quotation/Order item editor)
    "Value / Meter": "单价 / 米",
    "Value / Roll": "单价 / 卷",
    "Value /": "单价 /",
    "Ton": "吨",
    "Liter": "升",
    "Unit Price": "单价",
    "Per Meter": "每米",
    "Per Liter": "每升",
    "Per Unit": "每件",
    // Empty-state messages
    "No records found": "暂无记录",
    "No quotations yet.": "暂无报价单。",
    "No orders found.": "暂无订单。",
    "No commercial invoices yet.": "暂无商业发票。",
    "No packing lists yet — generate one from the Commercial Invoices screen.": "暂无装箱单 — 请在商业发票页面生成。",
    "No inspections yet.": "暂无验货记录。",
    "Shipment Details (for PDF)": "运输详情（用于PDF）",
    "Payment Notice": "付款通知",
    "Commercial Invoice Generated!": "商业发票已生成！",
    "was created for": "已创建，客户为",
    "Order Created!": "订单已创建！",
    "was created successfully!": "已成功创建！",
    "Delete?": "确认删除？",
    "⏳ Uploading...": "⏳ 上传中...",
    "📎 Add Photos / Files": "📎 添加照片 / 文件",
    "📎 Add Photos / Videos": "📎 添加照片 / 视频",
    "📎 Add Photos / PDFs": "📎 添加照片 / PDF",
    "Upload failed: ": "上传失败：",
    "No items.": "暂无项目。",
    "Container code, e.g. OOCU7979442": "集装箱号，例如 OOCU7979442",
    "Length:": "长度：",
    "Qty:": "数量：",
    "Packages": "包装数",
    "Gross Weight (kg)": "毛重 (kg)",
    "Net Weight (kg)": "净重 (kg)",
    "Informational only — not used in any calculation.": "仅供参考 — 不参与任何计算。",
    "Sets the Sale Price so the Real Margin below equals this %.": "设置销售价，使下方的实际利润率等于此百分比。",
    "Trade Name": "商用名称",
    "English name, e.g. for Chinese suppliers": "英文名称，例如中国供应商的英文名",
    "Excel": "Excel",
    "Real Margin": "实际利润率",
    "Added on top of the Real Margin below.": "会加到下方的实际利润率上。",
    "Loss": "亏损",
    "Loading exchange rate...": "正在加载汇率...",
    "Could not load exchange rate.": "无法加载汇率。",
    "Rate date": "汇率日期",
    "cached": "缓存",

    // Supplier Evaluation (5-star rating) — modal UI chrome + the preset
    // problem/solution option labels themselves (see
    // backend/supplierEvaluationOptions.js, kept English there on purpose —
    // this dictionary is what makes them show in Chinese when that toggle
    // is on, same as every other string in the app).
    "Rating": "评级",
    "Rating (0-5)": "评级 (0-5)",
    "Evaluation": "评估",
    "⭐ Evaluation": "⭐ 评估",
    "Current Rating": "当前评级",
    "Problem": "问题",
    "Solution": "解决方案",
    "What happened": "发生了什么",
    "How it was resolved": "如何解决",
    "Details (optional)": "详情（可选）",
    "+ Log Evaluation": "+ 记录评估",
    "Saving...": "保存中...",
    "History": "历史记录",
    "No evaluations recorded yet.": "暂无评估记录。",
    "Net": "净分",
    "By": "记录人",
    "📊 Evaluation Report": "📊 评估报表",
    "Generate Evaluation Report": "生成评估报表",
    "All Suppliers": "所有供应商",
    "Specific Suppliers": "指定供应商",
    "Select suppliers to include, or leave all unchecked to include every supplier.": "选择要包含的供应商，若全部不选则包含所有供应商。",
    "Generate Report (.xlsx)": "生成报表 (.xlsx)",

    "Small problem (generic)": "小问题（通用）",
    "Medium problem (generic)": "中等问题（通用）",
    "Severe problem (generic)": "严重问题（通用）",
    "Wrong product / color / specification": "产品/颜色/规格错误",
    "Below-expected quality / defects": "质量不达标 / 有瑕疵",
    "Failed inspection": "验货不通过",
    "Late delivery": "交货延迟",
    "Wrong / missing quantity": "数量错误 / 缺货",
    "Goods damaged in transit": "运输途中货物损坏",
    "Charged outside what was agreed (price/payment)": "收费与约定不符（价格/付款）",
    "Documentation error (invoice, packing list, certificates)": "单据错误（发票、装箱单、证书）",
    "Packaging issue": "包装问题",
    "Poor communication / slow response": "沟通不畅 / 回复缓慢",

    "Small solution (generic)": "小型解决方案（通用）",
    "Medium solution (generic)": "中型解决方案（通用）",
    "Large solution (generic)": "大型解决方案（通用）",
    "Full replacement, free of charge": "全额免费更换",
    "Full refund": "全额退款",
    "Fast correction, no impact on the order": "快速纠正，不影响订单",
    "Partial replacement, free of charge": "部分免费更换",
    "Partial refund": "部分退款",
    "Credit note for future use": "留待日后使用的信用凭证",
    "Discount on next order": "下次订单折扣",
    "Apology only, no concrete action": "仅道歉，无实际行动",
    "No solution offered (refused / ignored)": "未提供解决方案（拒绝/未理会）",
    "No solution yet / not resolved": "尚无解决方案 / 未解决",

    "Notify status change": "通知状态变更",
    "Notify record created": "通知新记录创建",
    "Record created:": "已创建：",
    "Status changed to": "状态已变更为",
    "Who should be notified by e-mail?": "需要用邮件通知谁？",
    "Loading…": "加载中…",
    "No eligible recipients for this record.": "此记录没有可通知的收件人。",
    "Sent": "已发送",
    "skipped": "已跳过",
    "Failed to send. Try again.": "发送失败，请重试。",
    "Don't notify": "不通知",
    "Send": "发送",
    "Sending…": "发送中…",
    "Notify": "通知",
    "Message (optional)": "留言（可选）",
    "Add a note to include in the e-mail…": "添加要包含在邮件中的留言…",
    "Attachment (optional)": "附件（可选）",
    "Remove": "移除",
    "Send by e-mail": "通过邮件发送",
    "Sending": "发送内容",
    "Who should receive it by e-mail?": "谁应该通过邮件收到？",
    "Failed to prepare document: ": "准备文档失败：",
    "Choose a format": "选择格式",
    "Which format(s) to send?": "要发送哪种格式？",
    "Spreadsheet": "表格",
    "Continue": "继续",
    "Failed to save product: ": "保存产品失败：",
    "Profitability Report": "利润报告",
    "Profitability": "利润",
    "Profit": "利润",
    "All figures in": "所有金额单位为",
    "Real Profit": "实际利润",
    "Margin": "利润率",
    "VAT Credit": "增值税抵扣",
    "No completed orders yet.": "暂无已完成的订单。",
    "Select all": "全选",
    "All Completed": "全部已完成",
    "Generate Report": "生成报告",
    "Download": "下载",
    "was created": "已创建",
    "sent": "已发送",
    "Document": "文档",
    "Notifications": "通知",
    "Mark all as read": "全部标为已读",
    "No notifications yet.": "暂无通知。",
    "Open attachment": "打开附件",
    "Sent to": "发送给",
    "📎 Attach file": "📎 添加附件",
    "Desktop pop-ups are blocked for this site. Enable notifications for this site in your browser's settings to receive them when this tab is in the background.": "此网站的桌面通知已被屏蔽。请在浏览器设置中为此网站启用通知，以便在此标签页处于后台时也能收到提醒。",
    "Enable desktop pop-ups to get notified even when this tab is minimized or in the background.": "启用桌面通知，即使此标签页最小化或在后台运行时也能收到提醒。",
    "Enable desktop pop-ups": "启用桌面通知",
  },
};
const LanguageContext = createContext({ lang: "en", setLang: () => {} });
function useT() {
  const { lang } = useContext(LanguageContext);
  return (key) => (lang === "zh" && TRANSLATIONS.zh[key]) || key;
}

// Exposes the logged-in user's permissions (screens list + hideCommercialStatus/
// hideMargin flags — see backend/permissions.js, the single source of truth
// this is just a read-only mirror of) to any screen component without prop-
// drilling `user` through every one of them. Falls back to "full access" when
// there's no provider in the tree yet (e.g. a component rendered before login
// finishes) so nothing crashes trying to read .screens off undefined.
const UserContext = createContext({ permissions: { screens: [], hideCommercialStatus: false, hideMargin: false } });
function usePermissions() {
  return useContext(UserContext).permissions || { screens: [], hideCommercialStatus: false, hideMargin: false };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// The business calls mainland China's currency "RMB" everywhere client-
// facing, even though its stored/ISO code (CNY) is what Intl.NumberFormat
// needs internally. This relabels the raw code wherever it's shown as text.
const currencyLabel = (cur) => (cur === "CNY" ? "RMB" : cur);

const fmt = (n, cur = "USD") => {
  if (n == null) return "—";
  if (cur === "CNY") {
    return `RMB ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(n);
};

const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US") : "—");

// ─── IN-APP NOTIFICATION INBOX (bell icon) ─────────────────────────────────
// English labels for the same entityType keys used throughout the
// notify-by-e-mail feature (backend/notifications.js has its own Portuguese
// versions for the e-mail text) — the in-app bell follows the rest of the
// UI's en/zh toggle instead.
const ENTITY_LABELS_EN = {
  orders: "Order",
  quotations: "Quotation",
  proformas: "Proforma",
  "commercial-invoices": "Commercial Invoice",
  contracts: "Contract",
  "packing-lists": "Packing List",
  inspections: "Inspection",
  samples: "Sample",
  "financial-suppliers": "Supplier Payment",
  "financial-clients": "Client Payment",
};

// One-line summary for a notification row — mirrors the three eventTypes
// sendStatusChangeEmail branches on backend-side, just in whichever UI
// language is active instead of always Portuguese.
function notificationSummary(n, t) {
  const label = t(ENTITY_LABELS_EN[n.entity_type] || n.entity_type);
  const record = n.record_label || "";
  if (n.event_type === "created") return `${label} ${t("was created")}: ${record}`;
  if (n.event_type === "document") return `${n.document_label || t("Document")} ${t("sent")} — ${label} ${record}`;
  return `${label} ${record} — ${t("Status changed to")} ${n.new_status || ""}`;
}

// SQLite's datetime('now') is UTC with no offset marker — appending "Z"
// (after swapping the space for "T") is what makes `new Date(...)` parse it
// as UTC instead of silently treating it as local time.
function timeAgo(sqliteUTC) {
  if (!sqliteUTC) return "";
  const then = new Date(sqliteUTC.replace(" ", "T") + "Z").getTime();
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// A short two-tone "ding" synthesized with the Web Audio API instead of
// shipping/hosting an audio file — just for the moment a poll detects the
// unread count went up. Wrapped in try/catch because some browsers refuse
// to run an AudioContext before the page has had any user gesture at all;
// failing silently there is better than throwing into a setInterval callback.
function playNotificationSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.15);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.55, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
    osc.onended = () => ctx.close();
  } catch { /* audio unavailable/blocked — notification still shows visually */ }
}

// ─── INPUT MASKS ────────────────────────────────────────────────────────────
// Auto-format the punctuation into these fields as the person types (instead
// of requiring them to type the dots/dashes/slashes/parentheses themselves),
// matching how CEP, CNPJ and phone numbers are always displayed in Brazil.
// Clients/suppliers here aren't all Brazilian, though (Chinese suppliers,
// importers elsewhere), so every mask backs off and returns the text
// untouched — instead of silently mangling it — the moment it looks like it
// isn't a Brazilian-format value: contains letters (many countries' postal
// codes and tax IDs are alphanumeric), starts with "+" (international phone
// prefix), or already has more digits than the Brazilian format ever has.

// 00000-000
const maskCEP = (v) => {
  const raw = v || "";
  if (/[a-zA-Z]/.test(raw)) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length > 8) return raw;
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

// 00.000.000/0000-00
const maskCNPJ = (v) => {
  const raw = v || "";
  if (/[a-zA-Z]/.test(raw)) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length > 14) return raw;
  if (d.length > 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length > 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  if (d.length > 5) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return d;
};

// (00) 00000-0000 — also degrades correctly for an 8-digit landline
// ((00) 0000-0000) since the split point depends on the digit count typed
// so far, not a fixed mobile-only pattern.
const maskPhone = (v) => {
  const raw = v || "";
  if (raw.trim().startsWith("+")) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length > 11) return raw;
  if (d.length > 10) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length > 6) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length > 0) return `(${d}`;
  return d;
};

// 0000.00.00 — Brazilian customs tariff code (NCM), always 8 digits grouped
// 4.2.2. HS Code is left unmasked since it's an international field entered
// in whatever grouping the person's customs paperwork already uses.
const maskNCM = (v) => {
  const raw = v || "";
  if (/[a-zA-Z]/.test(raw)) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length > 8) return raw;
  if (d.length > 6) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
  if (d.length > 4) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return d;
};

// Live thousands-separator + decimal formatting for money amounts
// (1.234,56) — digits fill in as cents from the right, the same behavior
// every Brazilian banking/POS amount field uses (type "150000", see
// "1.500,00" appear). This is the only style of live mask that survives
// being re-applied to its own previous output on every keystroke: once the
// mask has inserted a "." as a thousands separator, that character is
// visually indistinguishable from a decimal point the person typed
// themselves, so re-deriving "where's the decimal" from the punctuation in
// the string (instead of always from raw digit count) breaks the moment
// more digits are typed after it. Safe to feed straight into
// parseLocaleNumber(), which every price field's save path already uses.
const maskMoney = (v) => {
  const raw = v == null ? "" : String(v);
  // Strip ALL leading zeros (not just ones followed by another digit) so
  // that repeatedly backspacing a typed amount actually reaches a fully
  // empty field instead of getting stuck floored at "0,00" forever.
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const cents = padded.slice(-2);
  const intPart = padded.slice(0, -2).replace(/^0+/, "") || "0";
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped},${cents}`;
};

// The two Alliance Global trading entities used to issue Proformas, Commercial
// Invoices and Packing Lists. Since the business is a trader, the "Manufacturer"
// shown on client-facing documents is always one of these — never the real
// factory/supplier. Mirrors backend/pdf/acquisitionCompanies.js.
const ACQUISITION_COMPANIES = {
  HK: {
    name: "HONG KONG ALLIANCE GLOBAL TRADING CO., LTD",
    address: "Unit 6, 10/Floor, Siu On Plaza. | 482 Jaffe Road, Causeway Bay. | Hong Kong",
    tel: "+ 856 2528 2801",
  },
  NINGBO: {
    name: "NINGBO WORLD ALLIANCE TRADING. CO. LTD.",
    address: "715, Changxing Road, 501, Jiangbei District | Ningbo - Zhejiang - China | Zip Code: 315000",
    tel: "+86 15888552349",
  },
};
const getAcqCompany = (code) => ACQUISITION_COMPANIES[code] || ACQUISITION_COMPANIES.HK;

// Shared searchable-dropdown ports lists (used by OrderForm and ProformaForm
// for Port of Loading / Port of Discharge).
const CHINA_PORTS_OPTIONS = [
  "Shanghai, CN", "Shenzhen, CN", "Ningbo, CN", "Guangzhou, CN", "Qingdao, CN",
  "Tianjin, CN", "Dalian, CN", "Xiamen, CN", "Suzhou, CN", "Foshan, CN",
  "Dongguan, CN", "Zhongshan, CN", "Zhuhai, CN", "Shantou, CN", "Quanzhou, CN",
  "Fuzhou, CN", "Wenzhou, CN", "Nanjing, CN", "Wuhan, CN", "Chongqing, CN",
  "Chengdu, CN", "Hangzhou, CN", "Nantong, CN", "Lianyungang, CN", "Yantai, CN",
  "Qinhuangdao, CN", "Tangshan, CN", "Rizhao, CN", "Zhanjiang, CN", "Huangpu, CN",
  "Chiwan, CN", "Yantian, CN", "Shekou, CN", "Nansha, CN", "Taicang, CN",
  "Zhoushan, CN", "Jinzhou, CN", "Yingkou, CN", "Dandong, CN", "Fangchenggang, CN",
  "Beihai, CN", "Haikou, CN", "Sanya, CN", "Lanzhou, CN", "Urumqi, CN",
];

const BRAZIL_PORTS_OPTIONS = [
  "Santos, BR", "Paranaguá, BR", "Rio de Janeiro, BR", "Itajaí, BR", "Suape, BR",
  "Manaus, BR", "Salvador, BR", "Fortaleza, BR", "Belém, BR", "Rio Grande, BR",
  "Vitória, BR", "São Francisco do Sul, BR", "Navegantes, BR", "Imbituba, BR",
  "Porto Alegre, BR", "Recife, BR", "Maceió, BR", "Natal, BR", "São Luís, BR",
  "Aratu, BR", "Angra dos Reis, BR", "Sepetiba, BR", "Presidente Epitácio, BR",
  "Santarém, BR", "Porto Velho, BR", "Corumbá, BR", "Ladário, BR",
  "Ilhéus, BR", "Cabedelo, BR", "Pecém, BR", "Itapoá, BR", "Itaguaí, BR",
  "Itaqui, BR", "São Sebastião, BR", "Barra do Riacho, BR", "Areia Branca, BR",
  "Antonina, BR", "Cotegipe, BR", "Praia Mole, BR", "Tubarão, BR",
  "Itacoatiara, BR", "Barcarena, BR", "Vila do Conde, BR", "Macapá, BR",
  "Niterói, BR", "Forno, BR", "Itaperi, BR", "Camaçari, BR", "Guarujá, BR",
];

// Same idea as the ports above, but for when Way of Shipment is "By Air" —
// the client's air shipments always run through one of these major
// international airports, never a random regional strip, so a fixed list
// (still free-typeable, same as the ports) is enough here too.
const CHINA_AIRPORTS_OPTIONS = [
  "Beijing Capital (PEK), CN", "Beijing Daxing (PKX), CN", "Shanghai Pudong (PVG), CN",
  "Shanghai Hongqiao (SHA), CN", "Guangzhou Baiyun (CAN), CN", "Shenzhen Bao'an (SZX), CN",
  "Chengdu Shuangliu (CTU), CN", "Chengdu Tianfu (TFU), CN", "Kunming Changshui (KMG), CN",
  "Xi'an Xianyang (XIY), CN", "Hangzhou Xiaoshan (HGH), CN", "Nanjing Lukou (NKG), CN",
  "Chongqing Jiangbei (CKG), CN", "Wuhan Tianhe (WUH), CN", "Qingdao Jiaodong (TAO), CN",
  "Xiamen Gaoqi (XMN), CN", "Zhengzhou Xinzheng (CGO), CN", "Changsha Huanghua (CSX), CN",
  "Tianjin Binhai (TSN), CN", "Ningbo Lishe (NGB), CN", "Fuzhou Changle (FOC), CN",
  "Shenyang Taoxian (SHE), CN", "Harbin Taiping (HRB), CN", "Dalian Zhoushuizi (DLC), CN",
  "Hong Kong (HKG), HK",
];

const BRAZIL_AIRPORTS_OPTIONS = [
  "São Paulo/Guarulhos (GRU), BR", "Viracopos/Campinas (VCP), BR", "Rio de Janeiro/Galeão (GIG), BR",
  "Belo Horizonte/Confins (CNF), BR", "Brasília (BSB), BR", "Curitiba (CWB), BR",
  "Porto Alegre (POA), BR", "Recife (REC), BR", "Salvador (SSA), BR", "Fortaleza (FOR), BR",
  "Manaus (MAO), BR", "Florianópolis (FLN), BR", "Navegantes (NVT), BR", "Joinville (JOI), BR",
  "Vitória (VIX), BR", "Belém (BEL), BR", "Goiânia (GYN), BR", "Campo Grande (CGR), BR",
  "Natal (NAT), BR", "São Luís (SLZ), BR", "Cuiabá (CGB), BR", "São José dos Campos (SJK), BR",
];

const PORT_DROPDOWN_STYLE = {
  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
  background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
  maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};
const PORT_DROP_ITEM_STYLE = {
  padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
  borderBottom: "1px solid #0f172a",
};

// Reusable searchable port input, used for Port of Loading / Port of Discharge
// on both OrderForm and ProformaForm.
function PortAutocomplete({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const filtered = options.filter(p => p.toLowerCase().includes((value || "").toLowerCase()));
  return (
    <div style={{ position: "relative" }}>
      <Input value={value || ""}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder} />
      {open && filtered.length > 0 && (
        <div style={PORT_DROPDOWN_STYLE}>
          {filtered.map((p, i) => (
            <div key={i} style={PORT_DROP_ITEM_STYLE}
              onMouseDown={() => { onChange(p); setOpen(false); }}
              onMouseEnter={e => e.currentTarget.style.background = "#334155"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// Parses a number typed with Brazilian formatting (e.g. "1.000,00" or
// "1000,00") or plain JS-style decimal ("1000.00") into a standard float.
// Used on money/rate inputs so users can type either style and land on the
// same value. Whichever of "," or "." appears LAST is treated as the
// decimal separator; the other is treated as a thousands separator.
const parseLocaleNumber = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[^\d,.\-]/g, "");
  if (!s || s === "-") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1) {
    const parts = s.split(".");
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) s = parts.join("");
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
};

// Converts a product's registered `height` (roll length) into meters,
// regardless of the unit it was entered in. Used to convert between the
// per-meter rate and the per-roll price.
const heightMOf = (product) => {
  if (!product) return 0;
  const h = parseFloat(product.height) || 0;
  return product.height_unit === "cm" ? h * 0.01 : product.height_unit === "mm" ? h * 0.001 : h;
};

// Generic value+unit → meters conversion (mm/cm/m/in), used wherever a
// dimension field needs converting regardless of which unit it was entered
// in — Width and Roll Diameter both use this for the Packing List's actual
// rolled-cylinder CBM calculation below.
const toMeters = (value, unit) => {
  const v = parseFloat(value) || 0;
  if (unit === "mm") return v * 0.001;
  if (unit === "cm") return v * 0.01;
  if (unit === "in") return v * 0.0254;
  return v; // m
};

// Actual physical volume of one finished Textile/DTF Film roll — a cylinder
// whose circular face is the rolled diameter (product.roll_diameter, tube
// included) and whose axial length is the fabric's width. This is a real
// measurement of the roll itself, independent of which container it ends up
// in — unlike the old fallback (splitting a container's flat nominal
// capacity proportionally by weight share), which only approximates how
// much of a container two differently-shaped rolls actually take up.
// Returns null when the product doesn't have a registered diameter yet, so
// callers can fall back to the capacity-based estimate for those.
const rollVolumeM3 = (product) => {
  if (!product || !product.roll_diameter || !product.width) return null;
  const diameterM = toMeters(product.roll_diameter, product.roll_diameter_unit || "cm");
  const widthM = toMeters(product.width, product.width_unit || "cm");
  if (!diameterM || !widthM) return null;
  return Math.PI * (diameterM / 2) ** 2 * widthM;
};

// The registered per-meter sale price on the product record — the 0%
// reference point the item's Margin % is measured against.
const registeredPerMeter = (product) => {
  const v = product ? parseFloat(product.sale_per_meter) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
};

// Recomputes an item's roll price, total, per-meter rate, and markup % when
// one of the three editable pricing fields changes — used inline in the
// Quotation screen's item list (where the final sale price to the client is
// actually decided) for Textile / DTF Film items. `field` is one of
// "sale_pct", "sale_per_meter", or "total"; `rawValue` is the raw text the
// user typed (may be Brazilian-formatted, e.g. "1.000,00").
function recalcTextileItem(item, product, field, rawValue) {
  const heightM = heightMOf(product);
  const qty = parseFloat(item.quantity) || 0;
  const base = registeredPerMeter(product);

  if (field === "sale_pct") {
    const pct = parseLocaleNumber(rawValue);
    const spm = base != null && pct != null ? base * (1 + pct / 100) : null;
    const unitPrice = spm != null && heightM ? spm * heightM : null;
    const total = unitPrice != null && qty ? unitPrice * qty : null;
    return {
      ...item,
      sale_pct: rawValue,
      sale_per_meter: spm != null ? spm.toFixed(2) : item.sale_per_meter,
      unit_price: unitPrice != null ? unitPrice.toFixed(2) : item.unit_price,
      total: total != null ? total.toFixed(2) : item.total,
    };
  }

  if (field === "sale_per_meter") {
    const spm = parseLocaleNumber(rawValue);
    const unitPrice = spm != null && heightM ? spm * heightM : null;
    const total = unitPrice != null && qty ? unitPrice * qty : null;
    const pct = base != null && spm != null ? ((spm / base) - 1) * 100 : null;
    return {
      ...item,
      sale_per_meter: rawValue,
      unit_price: unitPrice != null ? unitPrice.toFixed(2) : item.unit_price,
      total: total != null ? total.toFixed(2) : item.total,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }

  if (field === "total") {
    const total = parseLocaleNumber(rawValue);
    const price = total != null && qty ? total / qty : null;
    const spm = price != null && heightM ? price / heightM : null;
    const pct = base != null && spm != null ? ((spm / base) - 1) * 100 : null;
    return {
      ...item,
      total: rawValue,
      unit_price: price != null ? price.toFixed(4) : item.unit_price,
      sale_per_meter: spm != null ? spm.toFixed(2) : item.sale_per_meter,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }

  // Value/Roll — the per-roll sale price (Value/Meter × Meters/Roll). Always
  // computed already (feeds Total), but editing it directly here lets the
  // user set the roll price by hand and have Value/Meter and Total follow,
  // same as editing any of the other three fields does.
  if (field === "unit_price") {
    const price = parseLocaleNumber(rawValue);
    const total = price != null && qty ? price * qty : null;
    const spm = price != null && heightM ? price / heightM : null;
    const pct = base != null && spm != null ? ((spm / base) - 1) * 100 : null;
    return {
      ...item,
      unit_price: rawValue,
      total: total != null ? total.toFixed(2) : item.total,
      sale_per_meter: spm != null ? spm.toFixed(2) : item.sale_per_meter,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }

  return item;
}

// The registered flat sale price on the product record — the 0% reference
// point for Margin % on every non-Textile/non-Chemical category (machines,
// accessories, etc.), mirroring registeredPerMeter()/registeredPerLiter().
const registeredUnitPrice = (product) => {
  const v = product ? parseFloat(product.sale_price) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
};

// Same idea as recalcTextileItem but for every category with a flat unit
// price (machines, accessories, packaging, etc. — anything that isn't sold
// by the meter or by the liter). `field` is "sale_pct", "unit_price" or
// "total"; `rawValue` may be BR-formatted. The sale price for ALL categories
// is decided here, inline in the Quotation screen's item list — Add Product
// only holds cost data.
function recalcSimpleItem(item, product, field, rawValue) {
  const qty = parseFloat(item.quantity) || 0;
  const base = registeredUnitPrice(product);

  if (field === "sale_pct") {
    const pct = parseLocaleNumber(rawValue);
    const price = base != null && pct != null ? base * (1 + pct / 100) : null;
    const total = price != null && qty ? price * qty : null;
    return {
      ...item,
      sale_pct: rawValue,
      unit_price: price != null ? price.toFixed(2) : item.unit_price,
      total: total != null ? total.toFixed(2) : item.total,
    };
  }
  if (field === "unit_price") {
    const price = parseLocaleNumber(rawValue);
    const total = price != null && qty ? price * qty : null;
    const pct = base != null && price != null ? ((price / base) - 1) * 100 : null;
    return {
      ...item,
      unit_price: rawValue,
      total: total != null ? total.toFixed(2) : item.total,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }
  if (field === "total") {
    const total = parseLocaleNumber(rawValue);
    const price = total != null && qty ? total / qty : null;
    const pct = base != null && price != null ? ((price / base) - 1) * 100 : null;
    return {
      ...item,
      total: rawValue,
      unit_price: price != null ? price.toFixed(4) : item.unit_price,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }
  return item;
}

// Converts a product's registered `volume` (e.g. liters per drum/barrel)
// into liters, regardless of the unit it was entered in — the liquid-goods
// equivalent of heightMOf() for Textile rolls.
const volumeLOf = (product) => {
  if (!product) return 0;
  const v = parseFloat(product.volume) || 0;
  if (product.volume_unit === "mL") return v * 0.001;
  if (product.volume_unit === "gal") return v * 3.78541;
  return v; // L
};

// The registered per-liter sale price on the product record — the 0%
// reference point Margin % is measured against for Chemical/liquid items.
const registeredPerLiter = (product) => {
  const v = product ? parseFloat(product.sale_per_liter) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
};

// Converts a product's registered `weight` (already used elsewhere to
// compute an item's Total Weight in kg) into kg regardless of the unit it
// was entered in — g/m and g/m² are Textile-only per-length weight units
// and don't apply here, so they fall through to the plain kg branch same as
// an unset unit would.
const weightKgOf = (product) => {
  if (!product) return 0;
  const v = parseFloat(product.weight) || 0;
  const wu = product.weight_unit || "kg";
  if (wu === "g") return v / 1000;
  if (wu === "lb") return v * 0.453592;
  if (wu === "oz") return v * 0.0283495;
  return v; // kg
};

// Tons per package — the Chemical/liquid-goods equivalent of volumeLOf(),
// used when a product is priced by the ton instead of by the liter (bulk
// chemicals are commonly quoted by weight, not drum volume). `weight` is
// the GROSS weight of one full package (drum + chemical inside) — this is
// what Gross Weight totals should multiply by, NOT what "how many drums
// for X tons" should divide by (that overcounts every drum by its own
// empty weight — see netTonsOf below for that).
const tonsOf = (product) => weightKgOf(product) / 1000;

// Weight of the chemical alone in one package (excluding the drum's own
// weight) — same unit conversions as weightKgOf, reading the separate
// `net_weight` field. Used specifically to derive a physical package/drum
// count from a tons-ordered figure (ProductItemModal's "≈ Drums" display,
// buildPackingListDraft's roll count, server.js's quantityLabel).
const netWeightKgOf = (product) => {
  if (!product) return 0;
  const v = parseFloat(product.net_weight) || 0;
  const wu = product.weight_unit || "kg";
  if (wu === "g") return v / 1000;
  if (wu === "lb") return v * 0.453592;
  if (wu === "oz") return v * 0.0283495;
  return v; // kg
};
const netTonsOf = (product) => netWeightKgOf(product) / 1000;

// GROSS weight of one full physical package (box + contents), for products
// sold in a unit that differs from how they're packed (see units_per_package
// below) — same conversions as weightKgOf, reading the separate
// `package_weight` field. Generalizes the Chemical drum pattern above
// (weightKgOf/netWeightKgOf) to any category: e.g. LED lights sold per PAIR,
// packed 500 pairs to a cardboard box.
const packageWeightKgOf = (product) => {
  if (!product) return 0;
  const v = parseFloat(product.package_weight) || 0;
  const wu = product.weight_unit || "kg";
  if (wu === "g") return v / 1000;
  if (wu === "lb") return v * 0.453592;
  if (wu === "oz") return v * 0.0283495;
  return v; // kg
};

// The registered per-ton sale price on the product record — the 0%
// reference point Margin % is measured against for Chemical items priced by
// the ton (see registeredPerLiter for the per-liter equivalent).
const registeredPerTon = (product) => {
  const v = product ? parseFloat(product.sale_per_ton) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
};

// Liquid-goods (Chemical category — sold in drums/barrels) equivalent of
// recalcTextileItem: two-way Margin % / Value-per-X / Total, converting
// through the product's registered drum volume. Ton-priced items work
// differently: Quantity there IS the ton figure directly (not a drum
// count — see item.price_basis and ProductItemModal's calcWeight), so the
// registered per-ton rate is already the unit price with no per-package
// conversion needed (perPackage = 1), same as a flat unit-price category.
function recalcLiquidItem(item, product, field, rawValue) {
  const isTon = item.price_basis === "ton";
  const rateKey = isTon ? "sale_per_ton" : "sale_per_liter";
  const perPackage = isTon ? 1 : volumeLOf(product);
  const qty = parseFloat(item.quantity) || 0;
  const base = isTon ? registeredPerTon(product) : registeredPerLiter(product);

  if (field === "sale_pct") {
    const pct = parseLocaleNumber(rawValue);
    const rate = base != null && pct != null ? base * (1 + pct / 100) : null;
    const unitPrice = rate != null && perPackage ? rate * perPackage : null;
    const total = unitPrice != null && qty ? unitPrice * qty : null;
    return {
      ...item,
      sale_pct: rawValue,
      [rateKey]: rate != null ? rate.toFixed(2) : item[rateKey],
      unit_price: unitPrice != null ? unitPrice.toFixed(2) : item.unit_price,
      total: total != null ? total.toFixed(2) : item.total,
    };
  }
  if (field === rateKey) {
    const rate = parseLocaleNumber(rawValue);
    const unitPrice = rate != null && perPackage ? rate * perPackage : null;
    const total = unitPrice != null && qty ? unitPrice * qty : null;
    const pct = base != null && rate != null ? ((rate / base) - 1) * 100 : null;
    return {
      ...item,
      [rateKey]: rawValue,
      unit_price: unitPrice != null ? unitPrice.toFixed(2) : item.unit_price,
      total: total != null ? total.toFixed(2) : item.total,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }
  if (field === "total") {
    const total = parseLocaleNumber(rawValue);
    const price = total != null && qty ? total / qty : null;
    const rate = price != null && perPackage ? price / perPackage : null;
    const pct = base != null && rate != null ? ((rate / base) - 1) * 100 : null;
    return {
      ...item,
      total: rawValue,
      unit_price: price != null ? price.toFixed(4) : item.unit_price,
      [rateKey]: rate != null ? rate.toFixed(2) : item[rateKey],
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }
  return item;
}

// Options for the "Target Price refers to" selector shown next to each
// item's Target Price field. Per Meter, Per Liter, and Per Pair are always
// offered as fixed entries (not just for items whose category/Sold By
// happens to match) — ad-hoc items typed in without picking a registered
// product never get a category set at all, but the person may still be
// quoting them by the meter, the liter, or the pair, so the option needs to
// be there regardless of whatever's currently selected in Sold By. The last
// entry stays dynamic (`Per ${item.unit}`) so a category with its own
// arbitrary package type (e.g. Chemical's Drum/Tank) still gets a matching
// option here too.
function targetPriceUnitOptions(item) {
  return [
    { value: "total", label: "Total" },
    { value: "meter", label: "Per Meter" },
    { value: "liter", label: "Per Liter" },
    { value: "pair", label: "Per Pair" },
    { value: "unit", label: `Per ${item?.unit || "Unit"}` },
  ];
}

const targetPriceUnitSuffix = (item) => {
  if (item.target_price_unit === "meter") return "/m";
  if (item.target_price_unit === "liter") return "/L";
  if (item.target_price_unit === "pair") return "/pr";
  if (item.target_price_unit === "unit") return `/${item.unit || "un"}`;
  return "";
};

// Shared inline Margin %/Value-per-X/Total editor for a single item row —
// used by both QuotationForm and OrderForm. Add Product only ever holds
// cost data, so this is the one place a sale price actually gets set; it
// needs to exist in the Order screen too (not just Quotation), since a
// custom price can legitimately end up different from whatever's currently
// registered on the Product, and Order items may be added/edited directly
// without ever going through a Quotation.
function PricingRow({ item, product, currency, onChange }) {
  const t = useT();
  const isTextile = item.category === "Textile" || item.category === "DTF Film";
  const isLiquid = item.category === "Chemical";
  const isTon = isLiquid && item.price_basis === "ton";
  const rateKey = isTon ? "sale_per_ton" : "sale_per_liter";
  // Live thousands-separator formatting on every money field here (Value/X,
  // Unit Price, Total) — Margin % is a percentage, not a money amount, so
  // it's left as plain typed digits.
  const moneyMask = (field, value) => (field === "sale_pct" ? value : maskMoney(value));
  const onPriceField = (field) => (e) => onChange(recalcTextileItem(item, product, field, moneyMask(field, e.target.value)));
  const onLiquidField = (field) => (e) => onChange(recalcLiquidItem(item, product, field, moneyMask(field, e.target.value)));
  const onSimpleField = (field) => (e) => onChange(recalcSimpleItem(item, product, field, moneyMask(field, e.target.value)));
  const pctHandler = isTextile ? onPriceField("sale_pct") : isLiquid ? onLiquidField("sale_pct") : onSimpleField("sale_pct");
  const totalHandler = isTextile ? onPriceField("total") : isLiquid ? onLiquidField("total") : onSimpleField("total");
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginTop: "8px", flexWrap: "wrap" }}>
      <label style={{ fontSize: "11px", color: "#64748b" }}>{t("Margin %")}
        <input type="text" inputMode="decimal" value={item.sale_pct ?? ""} onChange={pctHandler}
          placeholder="0" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "70px" }} />
      </label>
      {isTextile ? (
        <>
          <label style={{ fontSize: "11px", color: "#64748b" }}>{t("Value / Meter")} ({currencyLabel(currency)})
            <input type="text" inputMode="decimal" value={item.sale_per_meter ?? ""} onChange={onPriceField("sale_per_meter")}
              placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
          </label>
          {/* unit_price already holds Value/Meter × Meters/Roll (the per-roll
              sale value) — it was being computed but never actually shown,
              so there was no way to see what a single roll sells for
              without doing the math by hand. Editable in-place too: typing
              here recalculates Value/Meter and Total the same as editing
              any of the other three fields does. */}
          <label style={{ fontSize: "11px", color: "#64748b" }}>{t("Value / Roll")} ({currencyLabel(currency)})
            <input type="text" inputMode="decimal" value={item.unit_price ?? ""} onChange={onPriceField("unit_price")}
              placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
          </label>
        </>
      ) : isLiquid ? (
        // Value / Liter or Value / Ton depending on how this Chemical item
        // is priced (item.price_basis, inherited from the product when it
        // was added) — the two rates are kept in separate fields
        // (sale_per_liter / sale_per_ton) so switching a product's basis
        // later doesn't silently reinterpret an old item's registered rate.
        <label style={{ fontSize: "11px", color: "#64748b" }}>{t("Value /")} {isTon ? t("Ton") : t("Liter")} ({currencyLabel(currency)})
          <input type="text" inputMode="decimal" value={item[rateKey] ?? ""} onChange={onLiquidField(rateKey)}
            placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
        </label>
      ) : (
        <label style={{ fontSize: "11px", color: "#64748b" }}>{t("Unit Price")} ({currencyLabel(currency)})
          <input type="text" inputMode="decimal" value={item.unit_price ?? ""} onChange={onSimpleField("unit_price")}
            placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
        </label>
      )}
      <label style={{ fontSize: "11px", color: "#64748b" }}>{t("Total")} ({currencyLabel(currency)})
        <input type="text" inputMode="decimal" value={item.total ?? ""} onChange={totalHandler}
          placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "110px", fontWeight: 700, color: "#10b981" }} />
      </label>
    </div>
  );
}

// Package/unit options a product can be sold in — shared between the
// Product Registry's "Package" field and the Add Product modal's Unit
// field, so an ad-hoc item (not tied to a registered product) can still
// pick a real package type instead of being stuck with whatever the last
// selected product had.
// Physical packaging/container types only (what the goods are actually
// packed in) — NOT what's being counted/sold (see SELLING_UNIT_OPTIONS
// below for that). Mixing the two into one list is what put "Pairs" here
// before, which then printed as if it were a package type.
const PACKAGE_UNIT_OPTIONS = [
  "Bags / Sacks - 25kg",
  "Bags / Sacks - 50kg",
  "Boxes / Cartons - Large",
  "Boxes / Cartons - Medium",
  "Boxes / Cartons - Small",
  "Wooden Crates - Large",
  "Wooden Crates - Medium",
  "Wooden Crates - Small",
  "Fiber Drums / Barrels",
  "Pallet - America",
  "Pallet - Europe",
  "Plastic Drums / Barrels",
  "Rolls",
  "Steel Drums / Barrels",
  "IBC Tank",
  "Flex Tank",
];

// What's actually being counted/sold — separate concept from the physical
// package it ships in (a Unit, a Pair, a Meter, or a Liter can just as
// easily go in a Box, a Crate, or a Bag). Mostly offered for categories
// that don't already have their own dedicated pricing unit (Chemical prices
// by liter/ton via its own package-type flow, Textile/DTF Film by the
// meter/roll via their own dedicated flow — see the category check where
// this is used) — Meter and Liter are included here too since plenty of
// non-Chemical/non-Textile-category items (ribbon, trim, cable, elastic,
// small volumes of liquid...) are still legitimately sold by length or
// volume.
const SELLING_UNIT_OPTIONS = ["Unit", "Pair", "Meter", "Liter"];

// Shared list of product categories — used by Product registration, Sample
// registration, and the Supplier's Product Types field (so a supplier's
// declared specialties line up with the same categories products actually
// get registered under).
const PRODUCT_CATEGORIES = ["Textile", "Machine", "DTF Film", "Chemical", "Accessory", "Packaging", "Other"];

// Shared list of trade payment-term presets, used by both OrderForm and
// ProformaForm's searchable Payment Terms field.
const PAYMENT_TERMS_OPTIONS = [
  "100% ADV – 100% Advance",
  "100% AFTER D. SALE – 100% After Domestic Sale",
  "100% ARRIVAL – 100% At Destination Port",
  "100%ADV B. SHIP. – 100% Advance Before Shipment",
  "100%DP BL – 100%DP Under BL Copy",
  "20%ADV/80%DP B. SHIP – 20% Advance, 80%DP Before Shipment",
  "20%ADV/80%DP BL – 20% Advance, 80%DP Under BL Copy",
  "30% ADV 70% BL – 30% Advance and 70% 30 Days After Shipment",
  "30% ADV 70% BS – 30% Advance and 70% Before Shipment",
  "30%ADV/70%DP B. SHIP – 30% Advance, 70%DP Before Shipment",
  "30%ADV/70%DP BL – 30% Advance, 70%DP Under BL Copy",
];

// Split-payment presets for Supplier Payments — each `parts` entry gets its
// own Payment Notice PDF (own amount slice + label), so a 20/80 deposit
// schedule generates two separate documents instead of one for the full
// amount.
const PAYMENT_SCHEDULES = {
  "100": { label: "100% (Single Payment)", parts: [{ pct: 100, label: "" }] },
  "20/80": { label: "20% Deposit / 80% Balance", parts: [{ pct: 20, label: "Deposit" }, { pct: 80, label: "Balance" }] },
  "30/70": { label: "30% Deposit / 70% Balance", parts: [{ pct: 30, label: "Deposit" }, { pct: 70, label: "Balance" }] },
  "50/50": { label: "50% / 50%", parts: [{ pct: 50, label: "1st Payment" }, { pct: 50, label: "2nd Payment" }] },
  // TT deposit against the rest due once the goods are on the Bill of
  // Lading — a common trade-finance term distinct from the generic
  // "Deposit / Balance" presets above (which don't say how each part is
  // actually settled). Each part's label feeds straight into the Payment
  // Notice's purpose line (see the payment-notice-xlsx route).
  "20TT/BL": { label: "20% TT / Balance Against BL", parts: [{ pct: 20, label: "TT" }, { pct: 80, label: "Balance Against BL" }] },
  "30TT/BL": { label: "30% TT / Balance Against BL", parts: [{ pct: 30, label: "TT" }, { pct: 70, label: "Balance Against BL" }] },
};

// For Textile / DTF Film items, the roll price is derived from a per-meter
// rate — show that rate alongside the roll total so it's clear where the
// number came from. `field` is "sale_per_meter" or "cost_per_meter".
const perMeterLabel = (item, field, cur) => {
  const isTextile = item?.category === "Textile" || item?.category === "DTF Film";
  const rate = item?.[field];
  if (!isTextile || !rate) return null;
  return `${fmt(parseFloat(rate), cur)}/m`;
};

// The Products screen's Cost/Sale Price columns used to always show
// unit_cost/sale_price — correct for Unit/Pair-counted goods, but for
// Textile/DTF Film that pair only ever holds the derived per-ROLL total
// (cost_per_meter × registered roll length), and for Chemical it's blank
// entirely (Chemical is priced per liter or per ton, never as a flat unit
// price). Picks whichever rate the product was actually registered under —
// same category/price_basis branching used everywhere else this
// distinction matters (ProductItemModal, PricingRow, contract.js) — so the
// column always reads as "the real registered rate", not a derived total or
// a blank.
function productRate(product, kind) {
  const isTextile = product?.category === "Textile" || product?.category === "DTF Film";
  const isChemical = product?.category === "Chemical";
  const isTon = isChemical && product?.price_basis === "ton";
  const currency = kind === "cost" ? product?.cost_currency : product?.sale_currency;
  if (isTextile) {
    return { value: product?.[kind === "cost" ? "cost_per_meter" : "sale_per_meter"], currency, suffix: "/m" };
  }
  if (isChemical) {
    return isTon
      ? { value: product?.[kind === "cost" ? "cost_per_ton" : "sale_per_ton"], currency, suffix: "/ton" }
      : { value: product?.[kind === "cost" ? "cost_per_liter" : "sale_per_liter"], currency, suffix: "/L" };
  }
  return {
    value: product?.[kind === "cost" ? "unit_cost" : "sale_price"],
    currency,
    suffix: product?.unit === "Pair" ? "/pair" : "/unit",
  };
}

// The product search dropdown (Add Product) only ever showed Code + Name +
// Price — two products legitimately share the same Name constantly (same
// article, different colorway/spec/supplier batch), so that wasn't enough
// to tell them apart before picking one. Surfaces whatever spec actually
// distinguishes products within each category: Gramatura + Thickness for
// Textile/DTF Film (the two numbers a buyer actually checks first for
// fabric), Width/Height for physical goods (Machine/Accessory/Packaging/
// Other) where a size difference is the likely distinguisher, and — for
// every category, since it applies regardless of category — Color and
// Supplier whenever registered, since a same-name product from two
// different suppliers (or in two different colors) is the single most
// common real-world case of this collision.
function productDistinguisher(p) {
  const parts = [];
  const isTextile = p.category === "Textile" || p.category === "DTF Film";
  if (isTextile) {
    if (p.weight) parts.push(`${p.weight}${p.weight_unit || "g/m²"}`);
    if (p.thickness) parts.push(`${p.thickness}${p.thickness_unit || ""}`);
  } else if (p.category !== "Chemical") {
    if (p.width) parts.push(`${p.width}${p.width_unit || ""}`);
    if (p.height) parts.push(`${p.height}${p.height_unit || ""}`);
  }
  if (p.color) parts.push(p.color);
  if (p.supplier) parts.push(p.supplier);
  return parts.join(" • ");
}

// Module-level (not React state) so `api()` — called from dozens of places
// that aren't React components — can always read the current session token
// without it being threaded through props. Set once on login/logout via
// `setAuthToken`, which also mirrors it into localStorage so a page reload
// doesn't force everyone to log in again.
let authToken = null;
function setAuthToken(token) {
  authToken = token;
  if (token) localStorage.setItem("af_token", token);
  else localStorage.removeItem("af_token");
}
setAuthToken(typeof localStorage !== "undefined" ? localStorage.getItem("af_token") : null);

// PDF/Excel downloads open via window.open(url) — a plain browser
// navigation, not a fetch() call — so there's no way to attach the
// Authorization header the rest of the app uses. The backend's requireAuth
// middleware accepts the session token as a `?token=` query param as a
// fallback specifically for this case; this helper appends it correctly
// whether `path` already has its own query string or not.
function authUrl(path) {
  if (!authToken) return path;
  return `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(authToken)}`;
}

async function api(path, method = "GET", body) {
  const headers = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    // Session is gone (logged out elsewhere, revoked, or just expired) —
    // clear it locally and bounce back to the login screen instead of
    // leaving the app stuck on a broken/half-loaded screen.
    setAuthToken(null);
    localStorage.removeItem("af_user");
    window.location.reload();
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function uploadToCloudinary(file) {
  const isPDF = file.type === "application/pdf";
  const resourceType = isPDF ? "raw" : "auto";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "ml_Alliance System");
  formData.append("folder", "exportflow");
  formData.append("resource_type", resourceType);
  const res = await fetch(`https://api.cloudinary.com/v1_1/eymnivfs/${resourceType}/upload`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { url: data.secure_url, name: file.name };
}

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────

const ORDER_STATUSES = ["Pending", "In Production", "Inspection", "Shipment", "Completed"];
// Same currency list ProductForm already offers for Cost/Sale Price —
// shared here for the Packing List's per-cost currency pickers (Agent/
// Freight/Loading) so all three stay consistent with the rest of the app.
const PACKING_COST_CURRENCIES = ["USD", "BRL", "CNY", "EUR", "GBP", "JPY", "HKD"];
const STATUS_COLORS = {
  Pending: { bg: "#1e293b", text: "#94a3b8", dot: "#64748b", border: "#334155" },
  "In Production": { bg: "#1e3a5f", text: "#60a5fa", dot: "#3b82f6", border: "#1e40af" },
  Inspection: { bg: "#3b2a00", text: "#fbbf24", dot: "#f59e0b", border: "#92400e" },
  Shipment: { bg: "#1a3a2a", text: "#34d399", dot: "#10b981", border: "#065f46" },
  Completed: { bg: "#064e3b", text: "#34d399", dot: "#10b981", border: "#065f46" },
};
const SAMPLE_STATUSES = ["Requested", "In Production", "Sent", "Feedback Received", "Approved"];
const FIN_STATUSES = ["Pending", "Partial", "Paid", "Overdue"];

// ─── REUSABLE UI ──────────────────────────────────────────────────────────────

// Pressing Escape closes whatever overlay is currently on screen — every
// form Modal, plus the few one-off overlays that don't go through the
// shared Modal component (lightbox, success notifications). `active`
// gates the listener so it's only ever attached while something is
// actually open, and re-attaches cleanly if onClose changes.
function useEscapeToClose(active, onClose) {
  useEffect(() => {
    if (!active) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onClose]);
}

function Modal({ title, onClose, children, wide, headerExtra }) {
  useEscapeToClose(true, onClose);
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
      }}
      // Clicking the backdrop used to close the modal — too easy to trigger
      // by accident mid-edit (a slightly-off click loses whatever was being
      // filled in). Now only the explicit × button or Cancel closes it.
    >
      <div
        style={{
          background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px",
          width: "100%", maxWidth: wide ? "900px" : "600px", maxHeight: "90vh",
          overflow: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 28px 0", gap: "12px" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#f1f5f9", fontFamily: "'DM Sans', sans-serif" }}>{title}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            {headerExtra}
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: "22px", cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        </div>
        <div style={{ padding: "20px 28px 28px" }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, half }) {
  // Auto-translates plain-string labels via the shared dictionary (falls
  // back to the original English string — including dynamic/template
  // labels built at the call site — when no matching entry exists, so
  // this is always safe to run unconditionally).
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: half ? "span 1" : "span 2" }}>
      <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{typeof label === "string" ? t(label) : label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
  padding: "10px 12px", color: "#f1f5f9", fontSize: "14px", outline: "none",
  width: "100%", boxSizing: "border-box", fontFamily: "inherit",
};

function Input({ style, placeholder, onWheel, type, ...props }) {
  // Auto-translates plain-string placeholders via the shared dictionary —
  // same safe fallback-to-English pattern as Field/Btn/Table/Select.
  const t = useT();
  // A focused <input type="number"> silently changes its value on mouse-
  // wheel scroll — a native browser quirk, not anything this app opted
  // into. Bit someone scrolling past the Margin % field on the product
  // form (mid-scroll of the whole page) and having it change value under
  // them without any click. Blurring on wheel is the standard fix — once
  // the field isn't focused, the browser has nothing to apply the scroll
  // delta to, and normal page scrolling continues working right past it.
  // Only applies to type="number" (the only type this quirk affects);
  // anything else keeps whatever onWheel (if any) was explicitly passed.
  const handleWheel = type === "number"
    ? (e) => { e.target.blur(); onWheel?.(e); }
    : onWheel;
  return <input type={type} style={{ ...inputStyle, ...style }} placeholder={typeof placeholder === "string" ? t(placeholder) : placeholder} onWheel={handleWheel} {...props} />;
}
// `style` is destructured separately and merged AFTER the base inputStyle so
// that callers passing a custom style (e.g. a narrower width for an inline
// unit dropdown) only override what they specify — previously a passed-in
// `style` completely replaced inputStyle (spread order bug), which is why
// some unit dropdowns rendered with the browser's default white background
// instead of the app's dark theme.
function Select({ children, style, ...props }) {
  // Auto-translates plain-string <option> text via the shared dictionary —
  // same safe fallback-to-English pattern as Field/Btn/Table. Codes that
  // aren't in the dictionary (currency codes, unit abbreviations like
  // mm/cm, registered company names) simply fall through unchanged.
  //
  // IMPORTANT: the <option>'s `value` must stay the original English string
  // regardless of language — only the visible label gets translated. Without
  // an explicit `value`, the browser uses the rendered children as the
  // option's value, so an earlier version of this component ended up saving
  // the *translated Chinese text itself* (e.g. "已发送") into the database
  // whenever someone changed a status while using the Chinese UI — the
  // English UI would then no longer recognize that value and silently fall
  // back to displaying its first option instead, and status-change e-mails
  // went out with Chinese text baked in. Explicitly pinning `value` to the
  // canonical English string (or whatever `value` was already passed in)
  // keeps stored data language-independent no matter which UI language was
  // used to make the change.
  const t = useT();
  const translated = Children.map(children, (child) => {
    if (child && child.type === "option" && typeof child.props.children === "string") {
      const canonicalValue = child.props.value !== undefined ? child.props.value : child.props.children;
      return cloneElement(child, { value: canonicalValue }, t(child.props.children));
    }
    return child;
  });
  return <select style={{ ...inputStyle, cursor: "pointer", ...style }} {...props}>{translated}</select>;
}
function Textarea(props) { return <textarea style={{ ...inputStyle, resize: "vertical", minHeight: "80px" }} {...props} />; }

// "Refresh from registered product" icon — two vertical U-shaped arrows
// forming a sync/refresh symbol, matching the exact glyph requested for the
// Order/Quotation item list's refresh buttons. stroke="currentColor" so it
// automatically follows whatever text color the parent <Btn> is using.
function RefreshIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <path d="m2 17 4 4 4-4" />
      <path d="M11 3h-1a4 4 0 0 0-4 4v14" />
      <path d="m22 7-4-4-4 4" />
      <path d="M13 21h1a4 4 0 0 0 4-4V3" />
    </svg>
  );
}

function Btn({ children, onClick, color = "#3b82f6", small, outline, disabled, title }) {
  // Auto-translates plain-string button labels via the shared dictionary
  // (same safe fallback-to-English pattern as Field) — non-string children
  // (icons, fragments) pass through untouched.
  const t = useT();
  const bg = outline ? "transparent" : color;
  const border = outline ? `1px solid ${color}` : "none";
  const textColor = outline ? color : "#fff";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: bg, border, color: textColor, borderRadius: "8px",
        padding: small ? "6px 12px" : "10px 18px",
        fontSize: small ? "12px" : "13px", fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s", fontFamily: "inherit", whiteSpace: "nowrap",
      }}
    >
      {typeof children === "string" ? t(children) : children}
    </button>
  );
}

// Shown right after a status change goes through, letting whoever made the
// change decide who to e-mail about it. Nobody is pre-checked on purpose —
// this is opt-in every time, not an automatic blast to the whole team.
// `entityType` must match one of the backend's ENTITY_LABELS keys
// (notifications.js); for "commercial-invoices" the /recipients call below
// only ever returns people who already have access to that screen — the
// backend enforces that regardless of what this modal shows, this is just
// the same list reflected in the UI so nobody sees a name they can't
// actually pick.
function NotifyStatusChangeModal({ entityType, recordLabel, oldStatus, newStatus, eventType = "status_change", onClose }) {
  const isCreated = eventType === "created";
  const t = useT();
  const [recipients, setRecipients] = useState(null); // null = still loading
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState(null); // { url, name }
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api(`/notifications/recipients?entityType=${encodeURIComponent(entityType)}`)
      .then(setRecipients)
      .catch(() => setRecipients([]));
  }, [entityType]);

  function toggle(username) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username); else next.add(username);
      return next;
    });
  }

  async function handleAttach(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      setAttachment(await uploadToCloudinary(file));
    } catch (err) {
      alert(t("Upload failed: ") + err.message);
    }
    setUploading(false);
  }

  async function send() {
    if (selected.size === 0) { onClose(); return; }
    setSending(true);
    try {
      const res = await api("/notifications/status-change", "POST", {
        entityType, recordLabel, oldStatus, newStatus, eventType,
        recipientUsernames: [...selected],
        message: message.trim() || undefined,
        attachmentUrl: attachment?.url,
        attachmentName: attachment?.name,
      });
      setResult(res);
      setTimeout(onClose, 1100);
    } catch {
      setResult({ error: true });
      setSending(false);
    }
  }

  return (
    <Modal title={isCreated ? t("Notify record created") : t("Notify status change")} onClose={onClose}>
      <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#94a3b8", lineHeight: 1.5 }}>
        {isCreated
          ? <>{t("Record created:")} <strong style={{ color: "#f1f5f9" }}>{recordLabel}</strong>. {t("Who should be notified by e-mail?")}</>
          : <>{t("Status changed to")} <strong style={{ color: "#f1f5f9" }}>{newStatus}</strong>. {t("Who should be notified by e-mail?")}</>}
      </p>
      {recipients === null ? (
        <p style={{ color: "#64748b", fontSize: "13px" }}>{t("Loading…")}</p>
      ) : recipients.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "13px" }}>{t("No eligible recipients for this record.")}</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 16px", marginBottom: "20px" }}>
          {recipients.map(u => (
            <label key={u.username} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#f1f5f9", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.has(u.username)} onChange={() => toggle(u.username)} />
              {u.name}
            </label>
          ))}
        </div>
      )}
      <div style={{ marginBottom: "16px" }}>
        <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>
          {t("Message (optional)")}
        </label>
        <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={t("Add a note to include in the e-mail…")} />
      </div>
      <div style={{ marginBottom: "20px" }}>
        <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>
          {t("Attachment (optional)")}
        </label>
        {attachment ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#f1f5f9" }}>
            📎 {attachment.name}
            <Btn small outline color="#ef4444" onClick={() => setAttachment(null)}>Remove</Btn>
          </div>
        ) : (
          <>
            <input id="notify-attach-input" type="file" onChange={handleAttach} style={{ display: "none" }} />
            <Btn small outline color="#64748b" disabled={uploading} onClick={() => document.getElementById("notify-attach-input").click()}>
              {uploading ? "Uploading…" : "📎 Attach file"}
            </Btn>
          </>
        )}
      </div>
      {result && !result.error && (
        <p style={{ fontSize: "13px", color: "#4ade80", margin: "0 0 12px" }}>
          {t("Sent")}: {result.sent.length}{result.skipped.length ? ` — ${t("skipped")}: ${result.skipped.length}` : ""}
        </p>
      )}
      {result && result.error && (
        <p style={{ fontSize: "13px", color: "#f87171", margin: "0 0 12px" }}>{t("Failed to send. Try again.")}</p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose} disabled={sending}>Don't notify</Btn>
        <Btn onClick={send} disabled={sending || uploading || recipients === null || recipients.length === 0}>
          {sending ? "Sending…" : "Send"}
        </Btn>
      </div>
    </Modal>
  );
}

// Recipient picker for sending an already-generated PDF/Excel by e-mail
// instead of (or in addition to) downloading it — sibling to
// NotifyStatusChangeModal but simpler: the attachment is already resolved
// (fetched + uploaded to Cloudinary by DocButtons before this opens), there's
// no old/new status, and it always posts eventType "document". Reuses the
// same /notifications/status-change route and recipient-eligibility rules
// (e.g. Commercial Invoice documents are still restricted to
// non-hideCommercialStatus users with screen access).
function SendDocumentModal({ entityType, recordLabel, documentLabel, attachments, onClose }) {
  const t = useT();
  const [recipients, setRecipients] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api(`/notifications/recipients?entityType=${encodeURIComponent(entityType)}`)
      .then(setRecipients)
      .catch(() => setRecipients([]));
  }, [entityType]);

  function toggle(username) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username); else next.add(username);
      return next;
    });
  }

  // One or two files may have been chosen (PDF and/or Spreadsheet) — since
  // the backend/e-mail plumbing only ever attaches one file per message,
  // sending both means firing one notification per file instead of trying
  // to bundle two attachments into a single e-mail. Each recipient then
  // gets one e-mail per format, its subject/documentLabel naming which one
  // it is (e.g. "PDF" vs "Spreadsheet") so it's clear they're not
  // duplicates. Results are combined across all the calls.
  async function send() {
    if (selected.size === 0) { onClose(); return; }
    setSending(true);
    try {
      const results = await Promise.all((attachments || []).map(att => api("/notifications/status-change", "POST", {
        entityType, recordLabel, eventType: "document",
        documentLabel: attachments.length > 1 ? `${documentLabel} (${att.formatLabel})` : documentLabel,
        recipientUsernames: [...selected],
        message: message.trim() || undefined,
        attachmentUrl: att?.url,
        attachmentName: att?.name,
      })));
      setResult({
        sent: [...new Set(results.flatMap(r => r.sent || []))],
        skipped: [...new Set(results.flatMap(r => r.skipped || []))],
      });
      setTimeout(onClose, 1100);
    } catch {
      setResult({ error: true });
      setSending(false);
    }
  }

  return (
    <Modal title={t("Send by e-mail")} onClose={onClose}>
      <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#94a3b8", lineHeight: 1.5 }}>
        {t("Send by e-mail")}: <strong style={{ color: "#f1f5f9" }}>{documentLabel} — {recordLabel}</strong>. {t("Who should receive it by e-mail?")}
      </p>
      {recipients === null ? (
        <p style={{ color: "#64748b", fontSize: "13px" }}>{t("Loading…")}</p>
      ) : recipients.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "13px" }}>{t("No eligible recipients for this record.")}</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 16px", marginBottom: "20px" }}>
          {recipients.map(u => (
            <label key={u.username} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#f1f5f9", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.has(u.username)} onChange={() => toggle(u.username)} />
              {u.name}
            </label>
          ))}
        </div>
      )}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>
          {t("Message (optional)")}
        </label>
        <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={t("Add a note to include in the e-mail…")} />
      </div>
      {result && !result.error && (
        <p style={{ fontSize: "13px", color: "#4ade80", margin: "0 0 12px" }}>
          {t("Sent")}: {result.sent.length}{result.skipped.length ? ` — ${t("skipped")}: ${result.skipped.length}` : ""}
        </p>
      )}
      {result && result.error && (
        <p style={{ fontSize: "13px", color: "#f87171", margin: "0 0 12px" }}>{t("Failed to send. Try again.")}</p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose} disabled={sending}>{t("Cancel")}</Btn>
        <Btn onClick={send} disabled={sending || recipients === null || recipients.length === 0}>
          {sending ? t("Sending…") : t("Send")}
        </Btn>
      </div>
    </Modal>
  );
}

// Small "which format?" chooser — used both for the plain download button
// (pick one, opens it) and, when e-mailing, for picking which one(s) to
// attach (checkboxes, since both can be sent at once). Only ever rendered
// when the caller actually passed an xlsxUrl — documents without an Excel
// version (Quotation, Contract) never show this and keep the old
// single-button behavior untouched.
function FormatPickerModal({ mode, onPick, onClose }) {
  const t = useT();
  const [checked, setChecked] = useState({ pdf: true, xlsx: false });
  const toggle = key => setChecked(p => ({ ...p, [key]: !p[key] }));

  return (
    <Modal title={mode === "download" ? t("Choose a format") : t("Which format(s) to send?")} onClose={onClose}>
      {mode === "download" ? (
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", padding: "8px 0 4px" }}>
          <Btn onClick={() => onPick(["pdf"])}>📄 PDF</Btn>
          <Btn onClick={() => onPick(["xlsx"])}>📊 {t("Spreadsheet")}</Btn>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "4px 0 20px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#f1f5f9", cursor: "pointer" }}>
              <input type="checkbox" checked={checked.pdf} onChange={() => toggle("pdf")} /> 📄 PDF
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#f1f5f9", cursor: "pointer" }}>
              <input type="checkbox" checked={checked.xlsx} onChange={() => toggle("xlsx")} /> 📊 {t("Spreadsheet")}
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <Btn outline color="#64748b" onClick={onClose}>{t("Cancel")}</Btn>
            <Btn disabled={!checked.pdf && !checked.xlsx} onClick={() => onPick([checked.pdf && "pdf", checked.xlsx && "xlsx"].filter(Boolean))}>
              {t("Continue")}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

// Wraps an existing "Download PDF" button with (a) an Excel alternative,
// when the caller passes xlsxUrl — clicking the main button then asks PDF
// or Spreadsheet instead of opening the PDF straight away — and (b) a
// second small button that fetches the chosen file(s), uploads them to
// Cloudinary (reusing uploadToCloudinary — same helper as message
// attachments elsewhere), and opens SendDocumentModal to pick who gets them
// by e-mail. Documents with no xlsxUrl (Quotation, Contract) keep the exact
// original single-button behavior — the format picker never appears.
function DocButtons({ url, filename, xlsxUrl, xlsxFilename, entityType, recordLabel, documentLabel = "PDF", label, color = "#10b981", small = true }) {
  const t = useT();
  const [preparing, setPreparing] = useState(false);
  const [picker, setPicker] = useState(null); // "download" | "email" | null
  const [sendDoc, setSendDoc] = useState(null); // { attachments: [{ url, name, label }] }

  const urlFor = fmt => (fmt === "xlsx" ? xlsxUrl : url);
  const nameFor = fmt => (fmt === "xlsx" ? (xlsxFilename || filename) : filename);
  const labelFor = fmt => (fmt === "xlsx" ? t("Spreadsheet") : "PDF");

  function handleMainClick() {
    if (xlsxUrl) { setPicker("download"); return; }
    window.open(url, "_blank");
  }

  function handleDownloadPick(formats) {
    setPicker(null);
    (formats[0] ? [formats[0]] : []).forEach(fmt => window.open(urlFor(fmt), "_blank"));
  }

  function handleEmailClick() {
    if (xlsxUrl) { setPicker("email"); return; }
    prepareAndSend(["pdf"]);
  }

  async function prepareAndSend(formats) {
    setPicker(null);
    setPreparing(true);
    try {
      const attachments = [];
      for (const fmt of formats) {
        const res = await fetch(urlFor(fmt));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], nameFor(fmt), { type: blob.type });
        const uploaded = await uploadToCloudinary(file);
        attachments.push({ ...uploaded, formatLabel: labelFor(fmt) });
      }
      setSendDoc({ attachments });
    } catch (err) {
      alert(t("Failed to prepare document: ") + err.message);
    }
    setPreparing(false);
  }

  return (
    <>
      <Btn small={small} outline color={color} onClick={handleMainClick}>{label || `📄 ${documentLabel}`}</Btn>
      <Btn small={small} outline color="#3b82f6" disabled={preparing} onClick={handleEmailClick} title={t("Send by e-mail")}>
        {preparing ? "…" : "✉️"}
      </Btn>
      {picker && (
        <FormatPickerModal
          mode={picker}
          onClose={() => setPicker(null)}
          onPick={formats => (picker === "download" ? handleDownloadPick(formats) : prepareAndSend(formats))}
        />
      )}
      {sendDoc && (
        <SendDocumentModal
          entityType={entityType}
          recordLabel={recordLabel}
          documentLabel={documentLabel}
          attachments={sendDoc.attachments}
          onClose={() => setSendDoc(null)}
        />
      )}
    </>
  );
}

// Bell icon in the sidebar footer — polls the logged-in user's own inbox
// (see GET /api/notifications/inbox) every 20s, badges the unread count, and
// plays a short synthesized "ding" (playNotificationSound, defined up near
// fmtDate) the moment a poll finds MORE unread than the previous poll did —
// comparing against a ref rather than state so this only fires once per new
// arrival, not on every re-render. Rendered once in the App() shell, so it
// keeps polling no matter which tab is open.
function NotificationBell({ sidebarOpen }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null); // full notification being viewed, or null
  const [detailRecipients, setDetailRecipients] = useState(null); // who else got the same notification, or null while loading
  const [toasts, setToasts] = useState([]);
  // Tracks the browser's actual notification permission so the dropdown can
  // show the person whether desktop pop-ups (for when the tab is minimized/
  // in the background) are actually active — this used to fail completely
  // silently: if the permission prompt was dismissed/blocked, or the person
  // never happened to trigger it, nothing ever told them why no pop-up was
  // showing up. "unsupported" covers browsers without the Notification API
  // at all (e.g. some in-app webviews).
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  // null until the first poll resolves — tracks which notification ids have
  // already been seen (toasted/dinged for), so a fresh page load never
  // toasts for everything already sitting unread from before, only for
  // whatever shows up in a LATER poll that wasn't there yet.
  const seenIdsRef = useRef(null);
  const boxRef = useRef(null);

  function showToasts(freshOnes) {
    // Capped at 3 on-screen at once — if a batch of 10 notifications landed
    // together (e.g. someone picked "everyone" on a big change), stacking 10
    // toast cards would just cover the screen; the bell badge still shows
    // the real total.
    const withTs = freshOnes.slice(0, 3).map(n => ({ ...n, _toastId: `${n.id}-${Date.now()}` }));
    setToasts(prev => [...prev, ...withTs]);
    withTs.forEach(tst => {
      setTimeout(() => setToasts(prev => prev.filter(x => x._toastId !== tst._toastId)), 6000);
    });
  }

  // OS-level notification for when the tab is in the background/minimized —
  // the on-screen toast above only helps while someone's actually looking at
  // this tab. Permission is requested from the bell button's own click
  // handler (a real user gesture), never automatically on page load.
  function notifyDesktop(freshOnes) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    try {
      const n = freshOnes[0];
      const desktopNotif = new Notification("Alliance Flow", { body: notificationSummary(n, t) });
      desktopNotif.onclick = () => { window.focus(); desktopNotif.close(); };
    } catch { /* not supported/blocked in this browser — toast still covers it while visible */ }
  }

  const load = useCallback(async () => {
    try {
      const res = await api("/notifications/inbox");
      const newItems = res.items || [];
      setItems(newItems);
      setUnreadCount(res.unreadCount || 0);

      if (seenIdsRef.current === null) {
        seenIdsRef.current = new Set(newItems.map(n => n.id));
      } else {
        const freshOnes = newItems.filter(n => !n.is_read && !seenIdsRef.current.has(n.id));
        newItems.forEach(n => seenIdsRef.current.add(n.id));
        if (freshOnes.length > 0) {
          playNotificationSound();
          showToasts(freshOnes);
          notifyDesktop(freshOnes);
        }
      }
    } catch { /* polling — a failed check silently retries next cycle */ }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (!detail) { setDetailRecipients(null); return; }
    setDetailRecipients(null);
    api(`/notifications/inbox/${detail.id}/recipients`)
      .then(res => setDetailRecipients(res.recipients || []))
      .catch(() => setDetailRecipients([]));
  }, [detail]);

  async function markRead(id) {
    setItems(prev => prev.map(n => (n.id === id ? { ...n, is_read: 1 } : n)));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try { await api(`/notifications/inbox/${id}/read`, "POST"); } catch { /* next poll reconciles */ }
  }

  async function markAllRead() {
    setItems(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
    try { await api("/notifications/inbox/read-all", "POST"); } catch { /* next poll reconciles */ }
  }

  // Opens the full-message/attachment view for one notification — closes the
  // dropdown panel first (it shares screen space and a lower z-index with the
  // shared Modal component, so leaving both open at once would stack wrong).
  function openDetail(n) {
    setOpen(false);
    setDetail(n);
    if (!n.is_read) markRead(n.id);
  }

  // First real click on the bell doubles as the user gesture browsers
  // require before showing the "Allow notifications?" permission prompt —
  // never requested automatically on page load, so nobody gets that popup
  // just for opening the system.
  function toggleOpen() {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().then(setNotifPermission);
    }
    setOpen(o => !o);
  }

  // Lets someone retry after dismissing/blocking the prompt by mistake —
  // browsers only show the actual "Allow?" popup again while permission is
  // still "default"; once it's "denied" the browser refuses to re-prompt
  // and the person has to flip it back on in their own browser's site
  // settings, so this button also doubles as a way to re-check that state
  // without reloading the page.
  function requestDesktopPermission() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().then(setNotifPermission);
    } else {
      setNotifPermission(Notification.permission);
    }
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button onClick={toggleOpen} title={t("Notifications")}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: sidebarOpen ? "space-between" : "center", gap: "6px",
          padding: "8px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px",
          color: "#94a3b8", cursor: "pointer", fontSize: "12px", fontWeight: 600, position: "relative",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "14px" }}>🔔</span>
          {sidebarOpen && <span>{t("Notifications")}</span>}
        </span>
        {unreadCount > 0 && (
          <span style={{
            background: "#ef4444", color: "#fff", fontSize: "10px", fontWeight: 700,
            borderRadius: "999px", padding: "1px 6px", minWidth: "16px", textAlign: "center", lineHeight: "14px",
            ...(sidebarOpen ? {} : { position: "absolute", top: "2px", right: "2px" }),
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: sidebarOpen ? 0 : "-8px", width: "320px",
          maxHeight: "420px", overflowY: "auto", background: "#0f172a", border: "1px solid #1e293b",
          borderRadius: "10px", boxShadow: "0 20px 50px rgba(0,0,0,0.6)", zIndex: 1500,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid #1e293b" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#f1f5f9" }}>{t("Notifications")}</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: "11px", cursor: "pointer" }}>
                {t("Mark all as read")}
              </button>
            )}
          </div>
          {notifPermission !== "granted" && notifPermission !== "unsupported" && (
            <div style={{ padding: "10px 12px", borderBottom: "1px solid #1e293b", background: "#1e293b" }}>
              <div style={{ fontSize: "11.5px", color: "#cbd5e1", marginBottom: "6px" }}>
                {notifPermission === "denied"
                  ? t("Desktop pop-ups are blocked for this site. Enable notifications for this site in your browser's settings to receive them when this tab is in the background.")
                  : t("Enable desktop pop-ups to get notified even when this tab is minimized or in the background.")}
              </div>
              {notifPermission === "default" && (
                <button onClick={requestDesktopPermission} style={{
                  background: "#2563eb", border: "none", borderRadius: "6px", color: "#fff",
                  fontSize: "11.5px", fontWeight: 600, padding: "5px 10px", cursor: "pointer",
                }}>
                  {t("Enable desktop pop-ups")}
                </button>
              )}
            </div>
          )}
          {items.length === 0 ? (
            <p style={{ padding: "20px 12px", textAlign: "center", color: "#64748b", fontSize: "12.5px" }}>{t("No notifications yet.")}</p>
          ) : (
            items.map(n => (
              <div key={n.id} onClick={() => openDetail(n)}
                style={{
                  padding: "10px 12px", borderBottom: "1px solid #1e293b", cursor: "pointer",
                  background: n.is_read ? "transparent" : "rgba(59,130,246,0.08)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  {!n.is_read && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6", marginTop: "5px", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12.5px", color: "#e2e8f0", lineHeight: 1.4 }}>{notificationSummary(n, t)}</div>
                    {n.message && <div style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "3px", whiteSpace: "pre-wrap" }}>{n.message}</div>}
                    <div style={{ fontSize: "10.5px", color: "#475569", marginTop: "4px" }}>
                      {n.sender_name} · {timeAgo(n.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {toasts.length > 0 && (
        <div style={{
          position: "fixed", top: "20px", right: "20px", zIndex: 3000,
          display: "flex", flexDirection: "column", gap: "10px", maxWidth: "340px",
        }}>
          {toasts.map(tst => (
            <div key={tst._toastId}
              onClick={() => { setToasts(prev => prev.filter(x => x._toastId !== tst._toastId)); openDetail(tst); }}
              style={{
                background: "#0f172a", border: "1px solid #3b82f6", borderRadius: "10px", padding: "12px 14px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)", cursor: "pointer", animation: "notifToastIn 0.25s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <span style={{ fontSize: "14px" }}>🔔</span>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#60a5fa" }}>{t("Notifications")}</span>
              </div>
              <div style={{ fontSize: "12.5px", color: "#e2e8f0", lineHeight: 1.4 }}>{notificationSummary(tst, t)}</div>
              <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "4px" }}>{tst.sender_name}</div>
            </div>
          ))}
        </div>
      )}
      {detail && (
        <Modal title={t("Notifications")} onClose={() => setDetail(null)}>
          <div style={{ fontSize: "14.5px", fontWeight: 700, color: "#f1f5f9", marginBottom: "6px" }}>
            {notificationSummary(detail, t)}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "16px" }}>
            {detail.sender_name} · {timeAgo(detail.created_at)}
          </div>
          {detail.message && (
            <div style={{
              background: "#1e293b", borderRadius: "8px", padding: "12px", fontSize: "13px",
              color: "#e2e8f0", whiteSpace: "pre-wrap", marginBottom: "16px",
            }}>
              {detail.message}
            </div>
          )}
          {detail.attachment_url && (
            <Btn onClick={() => window.open(detail.attachment_url, "_blank")}>
              📎 {detail.attachment_name || t("Open attachment")}
            </Btn>
          )}
          {detailRecipients && detailRecipients.length > 0 && (
            <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #334155" }}>
              <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                {t("Sent to")}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {detailRecipients.map(r => (
                  <span key={r.username} style={{
                    fontSize: "12px", color: "#cbd5e1", background: "#1e293b",
                    borderRadius: "999px", padding: "3px 10px",
                  }}>
                    {r.name || r.username}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// Small audit-trail tag shown at the end of each row's Actions column —
// who last created/edited that record. Every write route now stamps
// `updated_by` with the signed-in user's name (see backend/auth.js),
// replacing the old setup where nothing tracked who touched what.
function LastModifiedBy({ name }) {
  if (!name) return null;
  return (
    <span style={{ fontSize: "10.5px", color: "#475569", whiteSpace: "nowrap", alignSelf: "center" }} title="Last modified by">
      ✎ {name}
    </span>
  );
}

// Read-only 5-star rating display, used for Suppliers' quality score (see
// supplier_evaluations table in database.js). Renders a smooth partial fill
// (not just whole/half stars) via a clipped overlay — five grey stars
// underneath, five colored stars on top clipped to `value/5` width — so a
// rating like 3.75 actually reads as 3.75, not rounded down to a fixed
// half-star step.
function StarRating({ value, size = 14, showNumber = true }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  const pct = (v / 5) * 100;
  const color = v >= 4 ? "#22c55e" : v >= 2.5 ? "#f59e0b" : "#ef4444";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
      <span style={{ position: "relative", display: "inline-block", fontSize: size, lineHeight: 1, letterSpacing: "1px" }}>
        <span style={{ color: "#334155" }}>★★★★★</span>
        <span style={{ position: "absolute", top: 0, left: 0, overflow: "hidden", width: `${pct}%`, color }}>★★★★★</span>
      </span>
      {showNumber && <span style={{ fontSize: "11px", color: "#64748b" }}>{v.toFixed(1)}/5</span>}
    </span>
  );
}

function Badge({ status }) {
  const c = STATUS_COLORS[status] || { bg: "#1e293b", text: "#94a3b8", dot: "#64748b", border: "#334155" };
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      borderRadius: "20px", padding: "3px 10px", fontSize: "11px", fontWeight: 600,
      display: "inline-flex", alignItems: "center", gap: "5px",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

// Click a column header to sort by it; click again to flip direction —
// works on every screen that uses this shared Table (Products, Orders,
// Samples...) without each one having to wire up its own sorting. Only
// columns with a `key` (or an explicit `sortValue(row)` for computed
// columns) are sortable — a pure `render`-only column like "Actions" has no
// underlying value to sort by, so it's left alone (no pointer cursor, click
// does nothing).
function Table({ cols, rows, emptyMsg = "No records found" }) {
  // Auto-translates column header labels and the empty-state message via
  // the shared dictionary (same safe fallback-to-English pattern as Field
  // and Btn) — this alone covers every Table's headers app-wide.
  const t = useT();
  const [sort, setSort] = useState({ id: null, dir: 1 }); // dir: 1 = asc, -1 = desc

  if (!rows.length) return (
    <div style={{ textAlign: "center", padding: "48px", color: "#475569", fontSize: "14px" }}>{t(emptyMsg)}</div>
  );

  const sortIdOf = c => c.key || c.label;
  const valueOf = (row, c) => c.sortValue ? c.sortValue(row) : (c.key ? row[c.key] : undefined);

  const activeCol = sort.id ? cols.find(c => sortIdOf(c) === sort.id) : null;
  const sortedRows = activeCol ? [...rows].sort((a, b) => {
    const av = valueOf(a, activeCol), bv = valueOf(b, activeCol);
    // Blanks always sort to the end regardless of direction — an empty
    // Category/Supplier shouldn't jump to the top just because "desc" was
    // picked.
    const aEmpty = av === null || av === undefined || av === "";
    const bEmpty = bv === null || bv === undefined || bv === "";
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    const an = parseFloat(av), bn = parseFloat(bv);
    const bothNumeric = Number.isFinite(an) && Number.isFinite(bn);
    const cmp = bothNumeric ? an - bn : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    return cmp * sort.dir;
  }) : rows;

  const toggleSort = c => {
    if (!c.key && !c.sortValue) return;
    const id = sortIdOf(c);
    setSort(prev => prev.id === id ? { id, dir: prev.dir * -1 } : { id, dir: 1 });
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            {cols.map((c) => {
              const sortable = !!(c.key || c.sortValue);
              const active = sort.id === sortIdOf(c);
              return (
                <th key={c.key || c.label} onClick={() => toggleSort(c)} style={{
                  textAlign: "left", padding: "10px 14px", color: active ? "#94a3b8" : "#475569",
                  fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.05em", borderBottom: "1px solid #1e293b", whiteSpace: "nowrap",
                  cursor: sortable ? "pointer" : "default", userSelect: "none",
                }}>{t(c.label)}{active ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr key={row.id ?? i} style={{ borderBottom: "1px solid #0f172a" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#1e293b"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              {cols.map((c) => (
                <td key={c.key || c.label} style={{ padding: "12px 14px", color: "#cbd5e1", verticalAlign: "middle" }}>
                  {c.render
                    ? c.render(row)
                    // Only "status"/"result"/"category" are safe to auto-translate
                    // here — they're always controlled enum values (Draft/Paid/
                    // Pending/Textile…), never free-typed registered data like a
                    // client or supplier name, which must never be run through t().
                    // This is also what makes a record edited via the Chinese UI
                    // display correctly once English is selected again (or vice
                    // versa) instead of showing whichever language it happened to
                    // be saved in — see the Select component's value/children fix.
                    : (c.key === "status" || c.key === "result" || c.key === "category") && typeof row[c.key] === "string"
                      ? t(row[c.key])
                      : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value, sub, color = "#3b82f6" }) {
  const t = useT();
  return (
    <div style={{
      background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px",
      padding: "20px 24px", display: "flex", flexDirection: "column", gap: "4px",
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{typeof label === "string" ? t(label) : label}</div>
      <div style={{ fontSize: "26px", fontWeight: 700, color: "#f1f5f9", fontFamily: "'DM Sans', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: "12px", color: "#64748b" }}>{sub}</div>}
    </div>
  );
}

// Builds a Packing List draft from an order's items, pulling as much as
// possible from the order/product records (color, width, weight spec,
// length, net weight already computed on the item). Roll count, gross
// weight and CBM are physical-packing specifics with no digital source, so
// gross weight defaults to net weight and roll defaults to the order item's
// quantity as starting points — both still editable afterwards.
// Shared at module level (used both from the Orders screen and the
// Commercial Invoice screen, where Packing Lists are now generated/edited).
function tubeWeightKg(value, unit) {
  const v = parseFloat(value);
  if (!v) return 0;
  if (unit === "g") return v / 1000;
  if (unit === "lb") return v * 0.453592;
  if (unit === "oz") return v * 0.0283495;
  return v; // kg
}

function buildPackingListDraft(order, products) {
  const baseItems = (order.items || []).map(item => {
    const product = products.find(p => Number(p.id) === Number(item.product_id));
    // Total Length only means anything for goods sold by the meter —
    // Textile/DTF Film rolls. Machines, chemicals and other quantity-based
    // goods get a Quantity column instead (same split used in the
    // Proforma/Commercial Invoice PDFs).
    const category = item.category || product?.category || "";
    const isTextile = category === "Textile" || category === "DTF Film";
    const totalLength = isTextile ? (parseFloat(item.total_meterage || item.quantity || 0) || 0) : null;
    // Round to 1 decimal here (not just at display time) so floating-point
    // artifacts from calcWeight (e.g. 26508.300000000003) never leak into
    // the draft's stored numbers.
    const round1 = n => Math.round(n * 10) / 10;
    const priceBasis = item.price_basis || product?.price_basis || null;
    const isTonChemical = category === "Chemical" && priceBasis === "ton";
    // Generalized version of the ton-priced Chemical case below, for any
    // OTHER category where the sold unit isn't the packed unit — e.g. LED
    // lights sold per PAIR, packed 500 pairs to a cardboard box
    // (units_per_package). Chemical keeps its own dedicated net_weight-based
    // path since that's a weight-based ratio, not a unit count.
    const perPackageUnits = (!isTonChemical && product?.units_per_package)
      ? parseFloat(product.units_per_package) || null : null;
    const perDrumTons = isTonChemical ? netTonsOf(product) : null;
    // For ton-priced Chemical items, item.quantity is the tons ordered, not
    // a physical package count (see recalcLiquidItem/ProductItemModal) — the
    // Packing List's "roll"/"Packages" field needs the real, whole number of
    // drums that corresponds to, derived from the product's registered NET
    // weight per drum (chemical alone) — dividing by the gross/full-drum
    // weight instead would undercount, since part of that figure is the
    // drum itself, not product. Products with units_per_package registered
    // (sold per pair/piece, packed N-to-a-box) get the same treatment, just
    // dividing by a unit count instead of a weight. Every other category
    // still uses quantity directly, since it already is a real package
    // count there.
    const rollCount = isTonChemical && perDrumTons > 0
      ? Math.round((parseFloat(item.quantity) || 0) / perDrumTons)
      : perPackageUnits > 0
      ? Math.round((parseFloat(item.quantity) || 0) / perPackageUnits)
      : (item.quantity != null && item.quantity !== "" ? parseFloat(item.quantity) || 0 : 0);
    // item.total_weight (computed in ProductItemModal via calcWeight, from
    // the product's registered net weight per roll) is the goods' Net
    // Weight — for ton-priced Chemical this is the idealized ordered tonnage
    // (qty × 1000). Gross Weight is the real physical total instead: for
    // Textile/DTF Film that's Net Weight plus the empty cardboard/plastic
    // tube core per roll; for ton-priced Chemical (or units_per_package
    // items) it's the actual (rounded) package count × the product's
    // registered per-package weight, which naturally differs a little from
    // the idealized Net figure since you can't ship a fractional package.
    const netWeightRaw = item.total_weight != null && item.total_weight !== "" ? parseFloat(item.total_weight) : null;
    const netWeight = netWeightRaw != null ? round1(netWeightRaw) : null;
    const tubeWeightPerRoll = isTextile ? tubeWeightKg(product?.tube_weight, product?.tube_weight_unit) : 0;
    const perPackageWeightKg = isTonChemical ? weightKgOf(product) : (perPackageUnits > 0 ? packageWeightKgOf(product) : 0);
    const grossWeight = netWeight != null
      ? ((isTonChemical || perPackageUnits > 0) && perPackageWeightKg > 0
          ? round1(rollCount * perPackageWeightKg)
          : round1(netWeight + tubeWeightPerRoll * rollCount))
      : null;
    // Real per-roll volume from the product's registered Roll Diameter, when
    // available — lets the CBM below be an actual physical measurement
    // instead of just a proportional slice of the container's nominal
    // capacity. `_cbmPerRoll` is transient (derived from the product record,
    // not something the Packing List itself should own) — stripped out
    // again before the draft is returned.
    const _cbmPerRoll = isTextile ? rollVolumeM3(product) : null;
    // Same split used server-side for Proforma/Commercial Invoice (see
    // splitDescription in server.js): the product's registered description
    // renders as its own paragraph (descriptionText), separate from the
    // bold product name above it — any further lines (e.g. a CAS number)
    // stay as a bulleted facts list underneath.
    const descLines = product?.description ? String(product.description).split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
    // "Width" only means something for Textile/DTF Film rolls — every other
    // category shows what unit the Quantity is expressed in instead (TON,
    // LITER, or the registered package unit), same as the PDF backend logic.
    const priceUnitLabel = !isTextile
      ? (category === "Chemical" ? (priceBasis === "ton" ? "TON" : "LITER") : (item.unit || product?.unit || "").toUpperCase())
      : null;
    // Ton-priced Chemical items: Quantity is stored directly in tons, so the
    // Quantity column needs its own label (tons + estimated drum count)
    // instead of the generic "{quantity} {unit}" — mirrors quantityLabel in
    // server.js's normalizeSalesItem. units_per_package products (sold per
    // pair/piece, packed N-to-a-box) deliberately do NOT get the same "(≈ N
    // packages)" annotation here — client docs for those just show the
    // plain sold quantity + unit (e.g. "35,000 Pairs"), same as any normal
    // item; the estimated package count is Packing-List-only information
    // (it already has its own real Packages column there).
    let quantityLabel = null;
    if (isTonChemical && item.quantity != null) {
      const drums = perDrumTons > 0 ? Math.round((parseFloat(item.quantity) || 0) / perDrumTons) : null;
      quantityLabel = `${item.quantity} t${drums ? ` (≈ ${drums} ${item.unit || "packages"})` : ""}`;
    }
    return {
      product_id: item.product_id,
      description: product?.name || item.product_name,
      descriptionText: descLines[0] || "",
      bullets: descLines.slice(1),
      ncm: product?.ncm || "",
      color: product?.color || "",
      width: product?.width ? `${product.width}${product.width_unit || ""}` : "",
      priceUnitLabel,
      weightSpec: product?.weight ? `${product.weight} ${product.weight_unit || ""}` : "",
      category,
      isTextile,
      price_basis: priceBasis,
      // NET tons of chemical (not the drum itself) represented by one
      // physical package/drum — lets downstream summaries (CI's "Packing
      // List Description" line) re-derive the traded tonnage for whatever
      // slice of `roll` ends up in each container, without needing to look
      // the product back up.
      tons_per_package: isTonChemical ? perDrumTons : null,
      // GROSS kg (full package, contents + packaging) of one package — what
      // PackingListForm's updateItemRoll needs to recompute Gross Weight
      // directly from Packages, since it doesn't have the products list to
      // look this back up. Deliberately separate from tons_per_package
      // above (net) — using the net figure here would undercount Gross
      // Weight by each drum/box's own tare. Covers both ton-priced Chemical
      // drums and any other units_per_package product (e.g. boxed pairs).
      gross_weight_per_package: (isTonChemical || perPackageUnits > 0) ? perPackageWeightKg : null,
      quantity: item.quantity != null ? item.quantity : null,
      quantityLabel,
      unit: item.unit || "",
      totalLength,
      // Physical package/drum count — for ton-priced Chemical this is
      // DERIVED from the tons ordered (see rollCount above), not the raw
      // order quantity, which means tons there rather than a package count.
      roll: rollCount,
      grossWeight: grossWeight != null ? grossWeight : "",
      netWeight: netWeight != null ? netWeight : "",
      // Auto-filled below from the roll's real volume (when the product has
      // a registered diameter) or the order's container info as a fallback;
      // still editable per-item afterwards either way.
      cbm: "",
      _cbmPerRoll,
    };
  });
  // Manufacturer is always the Ningbo entity — the real Chinese trading
  // company that handles procurement/export — regardless of which
  // Acquisition Company (HK or Ningbo) was picked for invoicing the client.
  const acq = getAcqCompany("NINGBO");

  // Multi-container shipments: split each item's roll count (and,
  // proportionally, its weight/length) across the order's containers, so
  // the Packing List/Commercial Invoice can show goods grouped by which
  // physical container they're loaded into — same as the client's own
  // reference documents ("Container 01: OOCU7979442", "Container 02: ...").
  // A single-container order (or one with no container info at all) keeps
  // exactly the old flat item list, just tagged onto one implicit container.
  const containerQty = Math.max(1, parseInt(order.container_qty) || 1);
  const containers = Array.from({ length: containerQty }, (_, i) => ({ seq: i + 1, code: "" }));

  let items;
  if (containerQty > 1) {
    // Every item gets a row in every container (even a "0" starting point)
    // rather than only the containers its default even split landed in —
    // that's what makes the allocation screen actually usable: the user can
    // freely move an item entirely from one container to another just by
    // editing the numbers, instead of being stuck with whichever container(s)
    // the automatic split happened to assign it to. Zero-roll rows are
    // filtered back out when the PDF is generated, so they never show up as
    // noise on the final document — only while allocating.
    items = [];
    baseItems.forEach(item => {
      const totalRoll = parseFloat(item.roll) || 0;
      // Default everything into Container 01 rather than spreading it evenly
      // across every container — an even split made both containers show
      // nonzero rolls for the same products right away, which read as "the
      // same items are in both containers" instead of an empty starting
      // point to allocate from. The user now moves rolls into Container 02+
      // by hand using the (still editable) zero-roll rows below.
      const rollShares = [totalRoll, ...Array(containerQty - 1).fill(0)];
      rollShares.forEach((rollShare, i) => {
        const fraction = totalRoll > 0 ? rollShare / totalRoll : 0;
        items.push({
          ...item,
          container_seq: i + 1,
          roll: rollShare,
          grossWeight: item.grossWeight !== "" ? Math.round(item.grossWeight * fraction * 10) / 10 : "",
          netWeight: item.netWeight !== "" ? Math.round(item.netWeight * fraction * 10) / 10 : "",
          totalLength: item.totalLength != null ? Math.round(item.totalLength * fraction * 100) / 100 : item.totalLength,
        });
      });
    });
  } else {
    items = baseItems.map(item => ({ ...item, container_seq: 1 }));
  }

  // CBM: real per-roll volume (from the product's Roll Diameter) takes
  // priority whenever it's available — it's an actual physical measurement
  // of that roll batch, not an estimate, so it doesn't need to be capped to
  // the container's nominal capacity. Only items whose product has no
  // registered diameter yet fall back to the old estimate: splitting the
  // container's flat usable capacity proportionally by weight share.
  items.forEach(i => {
    if (i._cbmPerRoll != null) {
      const rollCount = parseFloat(i.roll) || 0;
      i.cbm = rollCount > 0 ? Math.round(i._cbmPerRoll * rollCount * 100) / 100 : "";
    }
  });

  const CONTAINER_CBM = { "20' Standard": 33, "40' Standard": 67, "40' High Cube": 76 };
  const perContainerCbm = order.container && CONTAINER_CBM[order.container] ? CONTAINER_CBM[order.container] : null;
  if (perContainerCbm != null) {
    containers.forEach(c => {
      // Only split CBM across rows that actually start with rolls allocated
      // to this container, and that don't already have a real per-roll
      // volume computed above — the zero-roll padding rows (there so the
      // user can reallocate into them later) shouldn't soak up a share of
      // CBM either way.
      const containerItems = items.filter(i => i.container_seq === c.seq && (parseFloat(i.roll) || 0) > 0 && i._cbmPerRoll == null);
      if (!containerItems.length) return;
      const grossSum = containerItems.reduce((s, i) => s + (parseFloat(i.grossWeight) || 0), 0);
      containerItems.forEach(i => {
        const share = grossSum > 0 ? (parseFloat(i.grossWeight) || 0) / grossSum : 1 / containerItems.length;
        i.cbm = Math.round(perContainerCbm * share * 100) / 100;
      });
    });
  }

  // `_cbmPerRoll` was only ever a scratch value derived from the product
  // record to compute the line above — strip it before the draft is
  // returned so it doesn't get persisted into items_json as if it were part
  // of the Packing List's own data.
  items.forEach(i => { delete i._cbmPerRoll; });

  const totals = items.reduce((acc, i) => ({
    totalLength: acc.totalLength + (parseFloat(i.totalLength) || 0),
    totalRoll: acc.totalRoll + (parseFloat(i.roll) || 0),
    totalGrossWeight: acc.totalGrossWeight + (parseFloat(i.grossWeight) || 0),
    totalNetWeight: acc.totalNetWeight + (parseFloat(i.netWeight) || 0),
    totalCbm: acc.totalCbm + (parseFloat(i.cbm) || 0),
  }), { totalLength: 0, totalRoll: 0, totalGrossWeight: 0, totalNetWeight: 0, totalCbm: 0 });
  totals.totalLength = Math.round(totals.totalLength * 100) / 100;
  totals.totalGrossWeight = Math.round(totals.totalGrossWeight * 10) / 10;
  totals.totalNetWeight = Math.round(totals.totalNetWeight * 10) / 10;
  totals.totalCbm = Math.round(totals.totalCbm * 100) / 100;

  return {
    order_id: order.id,
    // Same as the Commercial Invoice number — no internal "PL-" prefix and
    // no "ORD-" prefix carried over, no random trailing digits either: the
    // client wants the exact same reference number on every document for
    // the same deal (Proforma, CI, Packing List, Contract all read
    // identically), not a different-looking system-generated code per
    // document type.
    number: String(order.order_number || "").replace(/^ORD-/, ""),
    date: new Date().toISOString().slice(0, 10),
    way_of_shipment: "By Sea",
    country_of_origin: "China",
    country_of_acquisition: order.acquisition_company === "HK" ? "Hong Kong" : "China",
    port_of_origin: order.port_of_loading || "",
    port_of_destination: order.port_of_discharge || "",
    incoterm: order.incoterm || "",
    manufacturer: acq.name,
    manufacturer_address: acq.address,
    _items: items,
    items_json: JSON.stringify(items),
    // Container codes (e.g. "OOCU7979442") start blank — filled in on the
    // Packing List screen. Only meaningful (and only shown in the UI/PDF)
    // when there's more than one container.
    _containers: containers,
    containers_json: JSON.stringify(containers),
    total_length: totals.totalLength, total_roll: totals.totalRoll,
    total_gross_weight: totals.totalGrossWeight, total_net_weight: totals.totalNetWeight, total_cbm: totals.totalCbm,
    status: "Draft",
    notes: "",
  };
}

// ─── FORMS ───────────────────────────────────────────────────────────────────

// Textile/DTF items sold "by Meters" (see isTextileMeters on
// ProductItemModal) keep the real ROLL COUNT in item.quantity underneath —
// every downstream calc (weight, Packing List, PDFs) still needs a roll
// count — while item.total_meterage holds the total meters the person
// actually typed in. Anywhere quantity+unit get shown together as a plain
// human-readable summary (the little product-card header line), that roll
// count next to "Meters" reads as if it were itself a meter figure (e.g.
// "750 Meters" when 750 is really the roll count for 30,000 meters) — this
// shows total_meterage instead whenever the item is in that mode.
function displayQtyUnit(item) {
  const isTextileMeters = (item.category === "Textile" || item.category === "DTF Film") && item.unit === "Meters";
  const qty = isTextileMeters ? item.total_meterage : item.quantity;
  return `${qty ?? ""} ${item.unit || ""}`.trim();
}

// Shared product -> item field mapping, used both when a product is picked
// from the search dropdown (ProductItemModal's selectProduct below) and by
// the Order/Quotation item list's "refresh from registered product" button
// (Orders/Quotations PRODUCTS cards) — both need the exact same
// price/unit/category computation so a refreshed item ends up identical to
// one freshly re-added from scratch, without actually deleting/re-adding it.
// `prevItem` supplies quantity (to recompute total) and is otherwise only
// used as the spread base so unrelated fields (target_price, notes, etc.)
// are preserved untouched.
function applyProductToItem(p, prevItem) {
  const isTextile = p.category === "Textile" || p.category === "DTF Film";
  const isLiquid = p.category === "Chemical";
  const isTon = isLiquid && p.price_basis === "ton";
  const h = parseFloat(p.height) || 0;
  const heightM = p.height_unit === "cm" ? h * 0.01 : p.height_unit === "mm" ? h * 0.001 : h;
  const volL = volumeLOf(p);

  const salePrice = isTextile && p.sale_per_meter && heightM
    ? (parseFloat(p.sale_per_meter) * heightM).toFixed(2)
    : isTon && p.sale_per_ton
    ? parseFloat(p.sale_per_ton).toFixed(2)
    : isLiquid && p.sale_per_liter && volL
    ? (parseFloat(p.sale_per_liter) * volL).toFixed(2)
    : p.sale_price || p.unit_cost || "";

  const costPrice = isTextile && p.cost_per_meter && heightM
    ? (parseFloat(p.cost_per_meter) * heightM).toFixed(2)
    : isTon && p.cost_per_ton
    ? parseFloat(p.cost_per_ton).toFixed(2)
    : isLiquid && p.cost_per_liter && volL
    ? (parseFloat(p.cost_per_liter) * volL).toFixed(2)
    : p.unit_cost || "";

  // Textile/DTF items sold "by Meters" (see isTextileMeters on
  // ProductItemModal) keep that choice across a refresh instead of snapping
  // back to Rolls every time — that used to silently discard someone's
  // "sell by total meters" setup (and the figure already typed in) the
  // moment they refreshed the item after fixing something on the product
  // record, which is exactly the scenario that made a corrected Length per
  // Roll look like it still wasn't fixing the item's Total.
  const keepsMeters = isTextile && prevItem.unit === "Meters";
  // Re-derives the roll count from the (possibly just-corrected) roll
  // length, same math as handleQtyChange — so fixing a wrong Length per
  // Roll on the product and then refreshing this item actually flows
  // through to a correct Total instead of leaving the old (often zero)
  // roll count behind.
  const totalMetersPrev = parseFloat(prevItem.total_meterage) || 0;
  const qtyForTotal = keepsMeters && heightM > 0
    ? String(Math.round((totalMetersPrev / heightM) * 100) / 100)
    : prevItem.quantity;

  return {
    ...prevItem,
    product_id: p.id,
    product_name: p.name,
    product_code: p.code,
    supplier: p.supplier || "",
    unit: keepsMeters ? "Meters"
      : (p.category === "Textile" || p.category === "DTF Film") ? "Rolls"
      : p.category === "Chemical" ? (p.unit || "unit")
      : (p.selling_unit || "Unit"),
    quantity: keepsMeters ? qtyForTotal : prevItem.quantity,
    currency: p.sale_currency || p.cost_currency || "USD",
    unit_price: salePrice,
    cost_price: costPrice,
    cost_currency: p.cost_currency || "USD",
    total: qtyForTotal && salePrice ? (parseFloat(qtyForTotal) * parseFloat(salePrice)).toFixed(2) : (prevItem.total || ""),
    category: p.category || "",
    sale_per_meter: isTextile ? (p.sale_per_meter || null) : null,
    cost_per_meter: isTextile ? (p.cost_per_meter || null) : null,
    sale_per_liter: isLiquid ? (p.sale_per_liter || null) : null,
    cost_per_liter: isLiquid ? (p.cost_per_liter || null) : null,
    price_basis: isLiquid ? (p.price_basis || "liter") : null,
    sale_per_ton: isTon ? (p.sale_per_ton || null) : null,
    cost_per_ton: isTon ? (p.cost_per_ton || null) : null,
    sale_pct: p.sale_pct != null && p.sale_pct !== "" ? String(p.sale_pct) : "0",
    height: (p.category === "Textile" || p.category === "DTF Film") ? (p.height || "") : "",
    height_unit: p.height_unit || "cm",
  };
}

function ProductItemModal({ onSave, onClose, initial, products, showTargetPrice, onProductSaved }) {
const t = useT();
// unit defaults to "Unit" (capitalized) to match the actual Sold By
// dropdown options (SELLING_UNIT_OPTIONS: "Unit"/"Pair"/"Meter") — this
// value also feeds the Target Price Basis label (`Per ${item.unit}`), so a
// lowercase default here was showing up as "Per unit" there until the Sold
// By field was touched.
const [item, setItem] = useState(initial || { product_id: "", product_name: "", product_code: "", supplier: "", currency: "USD", cost_currency: "USD", quantity: "", unit: "Unit", unit_price: "", cost_price: "", total: "", target_price: "", target_price_unit: "total" });
const [search, setSearch] = useState(
  initial?.product_code && initial?.product_name
    ? `${initial.product_code} – ${initial.product_name}`
    : initial?.product_name || ""
);
const [showList, setShowList] = useState(false);
const [selectedProduct, setSelectedProduct] = useState(null); // ← adicionar esta linha
// Lets someone register a brand-new product, or edit the one already linked
// to this item, without leaving the Quotation/Proforma/Order screen — see
// the "+ New Product"/"Edit" buttons in the modal header. null = closed,
// "new" = registering a product from scratch, "edit" = editing the product
// currently selected on this item (selectedProduct).
const [showProductForm, setShowProductForm] = useState(null);
const [savingProduct, setSavingProduct] = useState(false);

  useEffect(() => {
  if (initial?.product_id) {
    const found = products.find(p => p.id === initial.product_id);
    if (found) setSelectedProduct(found);
  }
}, []);

// Saves the product (create or edit, same two API calls the Product Registry
// screen itself uses), then applies the result to this item exactly like
// picking it from the search dropdown would (applyProductToItem, via
// selectProduct) — so a brand-new product becomes this item's product, and
// an edited one refreshes the item's pricing/unit to match. onProductSaved
// bubbles the saved row up so the parent form's own product list (used for
// the search box) stays in sync without needing a full page reload.
// Re-throws on failure (after the alert) rather than swallowing the error —
// ProductForm's own Save button does `await onSave(...); onClose();` right
// after calling this, with no try/catch of its own, so letting the promise
// reject here is what stops that onClose() from firing and closing the
// sub-modal out from under an edit that never actually saved.
const handleProductFormSave = async (formData) => {
  setSavingProduct(true);
  try {
    const saved = showProductForm === "edit" && selectedProduct
      ? await api(`/products/${selectedProduct.id}`, "PUT", formData)
      : await api("/products", "POST", formData);
    selectProduct(saved);
    onProductSaved?.(saved);
    setShowProductForm(null);
  } catch (err) {
    alert(t("Failed to save product: ") + err.message);
    setSavingProduct(false);
    throw err;
  }
  setSavingProduct(false);
};

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase())
  );

  
  // heightOverride/heightUnitOverride let a Quotation/Order item use a
  // different roll length than what's registered on the product (e.g. a
  // custom length requested by the client), same as the editable Height
  // field on Product registration.
  const calcWeight = (product, quantity, heightOverride, heightUnitOverride) => {
  if (!product || !quantity) return null;
  const qty = parseFloat(quantity) || 0;
  if (!qty) return null;

  const category = product.category || "";
  const wu = product.weight_unit || "kg";

  // Chemical items priced by the ton are entered directly in tons (not
  // number of drums — see price_basis) — Quantity IS the weight, so Total
  // Weight is just that converted to kg, not quantity × registered
  // per-drum weight (which would treat the tons figure as a drum count).
  if (category === "Chemical" && product.price_basis === "ton") {
    return qty * 1000;
  }

  const w = parseFloat(product.weight) || 0;
  if (!w) return null;

  // Cálculo complexo apenas para Textile e DTF Film
  if (category === "Textile" || category === "DTF Film") {
    const hRaw = heightOverride !== undefined && heightOverride !== null && heightOverride !== "" ? heightOverride : product.height;
    const hUnit = heightOverride !== undefined && heightOverride !== null && heightOverride !== "" ? (heightUnitOverride || product.height_unit) : product.height_unit;
    const h = parseFloat(hRaw) || 0;
    const width = parseFloat(product.width) || 0;
    if (!h) return null;

    if (wu === "g/m²") {
      const heightM = h * (hUnit === "cm" ? 0.01 : hUnit === "mm" ? 0.001 : 1);
      const widthM = width * (product.width_unit === "cm" ? 0.01 : product.width_unit === "mm" ? 0.001 : 1);
      return (w / 1000) * widthM * heightM * qty;
    } else if (wu === "g/m") {
      const heightM = h * (hUnit === "cm" ? 0.01 : hUnit === "mm" ? 0.001 : 1);
      return (w / 1000) * heightM * qty;
    } else if (wu === "g") {
      return (w / 1000) * qty;
    } else if (wu === "kg") {
      return w * qty;
    }
    return null;
  }

  // Cálculo simples para todas as outras categorias
  if (wu === "kg") return w * qty;
  if (wu === "g") return (w / 1000) * qty;
  if (wu === "lb") return w * 0.453592 * qty;
  if (wu === "oz") return w * 0.0283495 * qty;
  return w * qty;
};

const selectProduct = (p) => {
  setSelectedProduct(p);
  setSearch(`${p.code} – ${p.name}`);
  // total starts blank (not carried from prev.total) the first time a
  // product is picked from the dropdown, same as before this was extracted
  // into the shared applyProductToItem() helper.
  setItem(prev => applyProductToItem(p, { ...prev, total: "" }));
  setShowList(false);
};

const calcMeterage = (product, quantity, heightOverride, heightUnitOverride) => {
  if (!product || !quantity) return null;
  const qty = parseFloat(quantity) || 0;
  const hRaw = heightOverride !== undefined && heightOverride !== null && heightOverride !== "" ? heightOverride : product.height;
  const hUnit = heightOverride !== undefined && heightOverride !== null && heightOverride !== "" ? (heightUnitOverride || product.height_unit) : product.height_unit;
  const h = parseFloat(hRaw) || 0;
  if (!h || !qty) return null;
  const heightM = h * (hUnit === "cm" ? 0.01 : hUnit === "mm" ? 0.001 : 1);
  return heightM * qty;
};

// Whether Quantity is currently being entered as total meters instead of
// roll count — only offered for Textile/DTF Film, via the Unit dropdown
// ("Rolls" vs "Meters"). Whoever's quoting an order often knows the total
// meterage the client wants before knowing how many rolls that works out
// to — this lets them type meters directly and has the roll count (still
// the field every downstream calc — weight, Packing List, PDFs — actually
// uses) derived automatically instead of requiring hand math.
const isTextileMeters = (item.category === "Textile" || item.category === "DTF Film") && item.unit === "Meters";

const rollLengthM = (hOverride, huOverride) => {
  const hRaw = hOverride !== undefined ? hOverride : item.height;
  const huRaw = huOverride !== undefined ? huOverride : item.height_unit;
  const h = parseFloat(hRaw) || 0;
  if (!h) return 0;
  return h * (huRaw === "cm" ? 0.01 : huRaw === "mm" ? 0.001 : 1);
};

const handleQtyChange = (e) => {
  const raw = e.target.value;
  if (isTextileMeters) {
    // Box holds total meters here — derive the real roll count (still
    // item.quantity underneath, unchanged meaning for every other screen)
    // instead of storing the typed meters as if it were a roll count.
    const heightM = rollLengthM();
    const totalMeters = parseFloat(raw) || 0;
    const rolls = heightM > 0 ? totalMeters / heightM : 0;
    const rollsStr = rolls ? String(Math.round(rolls * 100) / 100) : "";
    const total = rolls && item.unit_price ? (rolls * parseFloat(item.unit_price)).toFixed(2) : "";
    const weight = selectedProduct ? calcWeight(selectedProduct, rollsStr, item.height, item.height_unit) : null;
    setItem(prev => ({ ...prev, quantity: rollsStr, total_meterage: raw, total, total_weight: weight }));
    return;
  }
  const qty = raw;
  const total = qty && item.unit_price ? (parseFloat(qty) * parseFloat(item.unit_price)).toFixed(2) : "";
  const weight = selectedProduct ? calcWeight(selectedProduct, qty, item.height, item.height_unit) : null;
  const meterage = selectedProduct ? calcMeterage(selectedProduct, qty, item.height, item.height_unit) : null;
  setItem(prev => ({ ...prev, quantity: qty, total, total_weight: weight, total_meterage: meterage }));
};

const handleHeightChange = (e) => {
  const h = e.target.value;
  if (isTextileMeters) {
    // Length per Roll changed while quoting by total meters — meters stays
    // the fixed, real quantity the client wants; the roll count re-derives
    // to match instead of drifting out of sync with it.
    const heightM = rollLengthM(h, item.height_unit);
    const totalMeters = parseFloat(item.total_meterage) || 0;
    const rolls = heightM > 0 ? totalMeters / heightM : 0;
    const rollsStr = rolls ? String(Math.round(rolls * 100) / 100) : "";
    const total = rolls && item.unit_price ? (rolls * parseFloat(item.unit_price)).toFixed(2) : "";
    const weight = selectedProduct ? calcWeight(selectedProduct, rollsStr, h, item.height_unit) : null;
    setItem(prev => ({ ...prev, height: h, quantity: rollsStr, total, total_weight: weight }));
    return;
  }
  const weight = selectedProduct ? calcWeight(selectedProduct, item.quantity, h, item.height_unit) : null;
  const meterage = selectedProduct ? calcMeterage(selectedProduct, item.quantity, h, item.height_unit) : null;
  setItem(prev => ({ ...prev, height: h, total_weight: weight, total_meterage: meterage }));
};

const handleHeightUnitChange = (e) => {
  const hu = e.target.value;
  if (isTextileMeters) {
    const heightM = rollLengthM(item.height, hu);
    const totalMeters = parseFloat(item.total_meterage) || 0;
    const rolls = heightM > 0 ? totalMeters / heightM : 0;
    const rollsStr = rolls ? String(Math.round(rolls * 100) / 100) : "";
    const total = rolls && item.unit_price ? (rolls * parseFloat(item.unit_price)).toFixed(2) : "";
    const weight = selectedProduct ? calcWeight(selectedProduct, rollsStr, item.height, hu) : null;
    setItem(prev => ({ ...prev, height_unit: hu, quantity: rollsStr, total, total_weight: weight }));
    return;
  }
  const weight = selectedProduct ? calcWeight(selectedProduct, item.quantity, item.height, hu) : null;
  const meterage = selectedProduct ? calcMeterage(selectedProduct, item.quantity, item.height, hu) : null;
  setItem(prev => ({ ...prev, height_unit: hu, total_weight: weight, total_meterage: meterage }));
};

// Switching the Unit dropdown itself between Rolls/Meters — convert the
// currently entered figure to the other basis instead of leaving stale
// numbers behind (e.g. "250" rolls sitting in the box after switching to
// Meters would otherwise silently mean "250 meters").
const handleUnitChange = (e) => {
  const newUnit = e.target.value;
  const wasMeters = isTextileMeters;
  const willBeMeters = (item.category === "Textile" || item.category === "DTF Film") && newUnit === "Meters";
  if (wasMeters === willBeMeters) {
    setItem(prev => ({ ...prev, unit: newUnit }));
    return;
  }
  const heightM = rollLengthM();
  if (willBeMeters) {
    // Rolls -> Meters: total meters = rolls × length/roll (same figure
    // calcMeterage already produces, just surfaced into the box itself).
    const rolls = parseFloat(item.quantity) || 0;
    const meters = heightM > 0 ? rolls * heightM : 0;
    setItem(prev => ({ ...prev, unit: newUnit, total_meterage: meters ? String(meters) : "" }));
  } else {
    // Meters -> Rolls: roll count = meters / length/roll (already kept
    // current in item.quantity by handleQtyChange, nothing to recompute).
    setItem(prev => ({ ...prev, unit: newUnit }));
  }
};
  
  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <>
    <Modal title={initial ? t("Edit Product Item") : t("Add Product")} onClose={onClose}
      headerExtra={
        <div style={{ display: "flex", gap: "8px" }}>
          <Btn small outline color="#60a5fa" onClick={() => setShowProductForm("new")}>+ New Product</Btn>
          {selectedProduct && (
            <Btn small outline color="#94a3b8" onClick={() => setShowProductForm("edit")}>Edit</Btn>
          )}
        </div>
      }>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <Field label="Product">
          <div style={{ position: "relative" }}>
            <Input value={search}
              onChange={e => { setSearch(e.target.value); setItem(p => ({ ...p, product_name: e.target.value })); setShowList(true); }}
              onFocus={() => setShowList(true)}
              onBlur={() => setTimeout(() => setShowList(false), 200)}
              placeholder="Search product…" />
            {showList && filtered.length > 0 && (
              <div style={dropdownStyle}>
                {filtered.map(p => {
                  const rate = productRate(p, "sale");
                  const distinguisher = productDistinguisher(p);
                  return (
                    <div key={p.id} style={dropItemStyle}
                      onMouseDown={() => selectProduct(p)}
                      onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div>
                        <span style={{ color: "#60a5fa", fontFamily: "monospace", fontSize: "11px" }}>{p.code}</span> {p.name}
                        {rate.value ? <span style={{ float: "right", color: "#10b981" }}>{currencyLabel(rate.currency || "USD")} {parseFloat(rate.value).toFixed(2)}{rate.suffix}</span> : null}
                      </div>
                      {distinguisher && (
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>{distinguisher}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Field>
        <Field label={(item.category === "Chemical" || item.category === "Textile" || item.category === "DTF Film") ? "Unit" : "Sold By"} half>
  {(item.category === "Textile" || item.category === "DTF Film") ? (
    // Textile/DTF Film: how this specific quote/order is being counted —
    // Rolls (Quantity below = roll count, meters derived) or Meters
    // (Quantity below = total meters wanted, roll count derived) — not the
    // general package-type list, which doesn't apply here.
    <Select value={item.unit || "Rolls"} onChange={handleUnitChange}>
      <option value="Rolls">Rolls</option>
      <option value="Meters">Meters</option>
    </Select>
  ) : item.category === "Chemical" ? (
    // Chemical (drums/tanks) is already counted in a physical package unit,
    // so the package-type list applies directly here.
    <Select value={item.unit || ""} onChange={e => setItem(p => ({ ...p, unit: e.target.value }))}>
      <option value="">Select...</option>
      {PACKAGE_UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
    </Select>
  ) : (
    // Every other category: what's being counted/sold (Unit or Pair) is a
    // separate concept from what it's physically packed in — a pair of LED
    // lights still ships in a Box, it just isn't priced or counted as one.
    // This is what actually prints as the Unit column on client documents.
    <Select value={item.unit || ""} onChange={e => setItem(p => ({ ...p, unit: e.target.value }))}>
      <option value="">Select...</option>
      {SELLING_UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
    </Select>
  )}
</Field>
        <Field label={
          isTextileMeters ? "Quantity (Total Meters)"
          : selectedProduct && selectedProduct.category === "Chemical" && selectedProduct.price_basis === "ton" ? "Quantity (Tons)"
          : (item.category === "Textile" || item.category === "DTF Film") ? "Quantity (Rolls)"
          : "Quantity"
        } half>
          <Input type="number" value={isTextileMeters ? (item.total_meterage || "") : item.quantity} onChange={handleQtyChange} placeholder="0" />
        </Field>
        {(item.category === "Textile" || item.category === "DTF Film") && (
          <Field label={`Length per Roll (Meters)${isTextileMeters ? ` — ≈ ${item.quantity || 0} rolls` : ""}`} half>
            <div style={{ display: "flex", gap: "6px" }}>
              <Input value={item.height || ""} onChange={handleHeightChange} placeholder="0" style={{ flex: 1 }} />
              <Select value={item.height_unit || "cm"} onChange={handleHeightUnitChange} style={{ width: "80px", cursor: "pointer" }}>
                {["mm","cm","m","in"].map(u => <option key={u}>{u}</option>)}
              </Select>
            </div>
          </Field>
        )}
        <Field label="Supplier">
          <Input value={item.supplier || ""} onChange={e => setItem(p => ({ ...p, supplier: e.target.value }))} placeholder="Auto-filled from product" />
        </Field>
<Field label={`Cost Price (${currencyLabel(item.cost_currency || "USD")})`} half>
  <Input type="text" inputMode="decimal" value={item.cost_price || ""} onChange={e => setItem(prev => ({ ...prev, cost_price: maskMoney(e.target.value) }))} placeholder="0.00" />
</Field>
{/* Real editable field (defaults from the product's registered Sale Price
    via selectProduct, same as Cost Price already did) instead of a
    read-only caption — needs to be overridable per item just like Cost
    Price is, not just visible for reference. Recomputes Total the same way
    handleQtyChange already does, so changing it here doesn't leave Total
    out of sync with the new price. */}
<Field label={`Sale Price (${currencyLabel(item.currency || "USD")})`} half>
  <Input type="text" inputMode="decimal" value={item.unit_price || ""} onChange={e => {
    const masked = maskMoney(e.target.value);
    const qty = parseFloat(item.quantity) || 0;
    const priceNum = parseLocaleNumber(masked) ?? parseFloat(masked) ?? 0;
    setItem(prev => ({ ...prev, unit_price: masked, total: qty && priceNum ? (qty * priceNum).toFixed(2) : prev.total }));
  }} placeholder="0.00" />
</Field>
{/* Target Price only shown for Quotation items (showTargetPrice) — lets
    whoever's building a quotation record what the client is asking to pay
    right when the item is added, instead of a separate edit step
    afterwards (the Quotation list still shows/edits this too, unchanged —
    this is purely a convenience shortcut at add-time). Always in RMB
    (regardless of item.currency, which is the Sale/Cost Price currency) —
    Target Price is a negotiation reference against what the supplier in
    China would charge, so it's always quoted in RMB, not whatever currency
    the client's own Sale Price happens to be in. */}
{showTargetPrice && (
  <>
    <Field label="Target Price (RMB)" half>
      <Input type="text" inputMode="decimal" value={item.target_price ?? ""} onChange={e => {
        setItem(prev => ({ ...prev, target_price: maskMoney(e.target.value) }));
      }} placeholder="0.00" />
    </Field>
    <Field label="Target Price Basis" half>
      <Select value={item.target_price_unit || "total"} onChange={e => setItem(prev => ({ ...prev, target_price_unit: e.target.value }))}>
        {targetPriceUnitOptions(item).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  </>
)}
{/* Total Weight only means something for goods actually priced/tracked by
    weight or volume (Chemical) or where the registered weight spec is part
    of the trade itself (Textile/DTF Film rolls) — for everything else
    (Unit/Pair-counted goods) it's not what's being decided on this screen,
    so it stays out of the way here. The weight is still computed and saved
    in the background either way, for the Packing List's Gross Weight total. */}
{(item.category === "Chemical" || item.category === "Textile" || item.category === "DTF Film") && (
  <Field label="Total Weight" half>
    <div style={{ background: "#0f172a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: item.total_weight ? "#10b981" : "#475569", fontWeight: item.total_weight ? 700 : 400, border: "1px solid #334155", minHeight: "42px", display: "flex", alignItems: "center" }}>
      {item.total_weight ? `${item.total_weight.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg` : "—"}
    </div>
  </Field>
)}
{selectedProduct && selectedProduct.category === "Chemical" && selectedProduct.price_basis === "ton" ? (
  // Ton-priced Chemical items: Quantity is entered directly in tons, so
  // this box repurposes the (otherwise unused, Textile-only) meterage slot
  // to show the estimated drum/package count that quantity corresponds to
  // — purely informational. Divides by the product's registered NET weight
  // per package (chemical only, not the drum itself) — dividing by the
  // gross/full-drum weight would undercount how many drums are actually
  // needed, since part of each drum's weight is the drum, not product.
  <Field label={`≈ Drums (${selectedProduct.unit || "package"})`} half>
    <div style={{ background: "#0f172a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#f59e0b", fontWeight: 700, border: "1px solid #334155", minHeight: "42px", display: "flex", alignItems: "center" }}>
      {(() => {
        const t = netTonsOf(selectedProduct);
        const qty = parseFloat(item.quantity) || 0;
        if (!t || !qty) return selectedProduct.net_weight ? "—" : "Set Net Weight on product";
        return `≈ ${Math.round(qty / t).toLocaleString("pt-BR")} ${selectedProduct.unit || "packages"}`;
      })()}
    </div>
  </Field>
) : selectedProduct && parseFloat(selectedProduct.units_per_package) > 0 ? (
  // Generalized version of the "≈ Drums" box above, for any OTHER category
  // sold in a unit that isn't the packed unit — e.g. LED lights sold per
  // PAIR, packed 500 pairs to a box. Same purely-informational role. Not
  // `half` — Total Weight is hidden for this category (see above), so
  // there's nothing left to pair it with.
  <Field label="≈ Packages">
    <div style={{ background: "#0f172a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#f59e0b", fontWeight: 700, border: "1px solid #334155", minHeight: "42px", display: "flex", alignItems: "center" }}>
      {(() => {
        const perPackage = parseFloat(selectedProduct.units_per_package) || 0;
        const qty = parseFloat(item.quantity) || 0;
        if (!perPackage || !qty) return "—";
        return `≈ ${Math.round(qty / perPackage).toLocaleString("pt-BR")} packages`;
      })()}
    </div>
  </Field>
) : (item.category === "Chemical" || item.category === "Textile" || item.category === "DTF Film") ? (
  // Meterage/liter-priced Chemical fallback — pairs with the Total Weight
  // box above for these three categories, same as before. Not shown at all
  // for the generic Unit/Pair-counted category (nothing to show — there's
  // no meterage concept there, and Total Weight is already hidden too).
  <Field label="Total Meterage" half>
    <div style={{ background: "#0f172a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: item.total_meterage ? "#60a5fa" : "#475569", fontWeight: item.total_meterage ? 700 : 400, border: "1px solid #334155", minHeight: "42px", display: "flex", alignItems: "center" }}>
      {item.total_meterage ? `${item.total_meterage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m` : "—"}
    </div>
  </Field>
) : null}
        <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => {
            // cost_price displays with live thousands-separator formatting
            // (maskMoney) while editing — convert back to a plain number
            // before it joins the item list (which ultimately gets sent to
            // the backend's REAL cost_price column).
            onSave({ ...item, cost_price: item.cost_price !== "" && item.cost_price != null ? (parseLocaleNumber(item.cost_price) ?? item.cost_price) : item.cost_price });
            onClose();
          }}>
            {initial ? "Update Item" : "Add Item"}
          </Btn>
        </div>
      </div>
    </Modal>
    {showProductForm && (
      <Modal title={showProductForm === "edit" ? t("Edit Product") : t("New Product")} onClose={() => !savingProduct && setShowProductForm(null)}>
        <ProductForm
          initial={showProductForm === "edit" ? selectedProduct : null}
          onSave={handleProductFormSave}
          onClose={() => !savingProduct && setShowProductForm(null)}
        />
      </Modal>
    )}
    </>
  );
}

function OrderForm({ initial, onSave, onClose }) {
  const t = useT();
  const [f, setF] = useState(initial || {
    order_number: "", client: "", supplier: "", value: "", currency: "USD",
    production_lead_time: "", delivery_days: "", shipment_date: "", arrival_date: "",
    incoterm: "", payment_terms: "", port_of_loading: "", port_of_discharge: "",
    freight_value: "",
    acquisition_company: "", container: "", container_qty: "", notes: "",
  });
  const [items, setItems] = useState(initial?.items || []);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [clientSearch, setClientSearch] = useState(initial?.client || "");
  const [supplierSearch, setSupplierSearch] = useState(initial?.supplier || "");
  const [showClientList, setShowClientList] = useState(false);
  const [showSupplierList, setShowSupplierList] = useState(false);
  const [showPaymentList, setShowPaymentList] = useState(false);
  const [itemModal, setItemModal] = useState(null);
  const [editingItemIdx, setEditingItemIdx] = useState(null);

  useEffect(() => {
    api("/clients").then(setClients);
    api("/suppliers").then(setSuppliers);
    api("/products").then(setProducts);
  }, []);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const itemsTotal = items.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
  const [initialLoad, setInitialLoad] = useState(true);

useEffect(() => {
  if (initialLoad) {
    setInitialLoad(false);
    return;
  }
  if (items.length > 0) {
    setF(p => ({ ...p, value: itemsTotal.toFixed(2) }));
  }
}, [itemsTotal]);

  const addItem = (item) => {
    setItems(prev => [...prev, item]);
    setF(p => ({ ...p, value: (parseFloat(p.value || 0) + parseFloat(item.total || 0)).toFixed(2) }));
  };

  const updateItem = (idx, item) => {
    setItems(prev => {
      const updated = [...prev];
      const oldTotal = parseFloat(updated[idx].total) || 0;
      const newTotal = parseFloat(item.total) || 0;
      updated[idx] = item;
      setF(p => ({ ...p, value: (parseFloat(p.value || 0) - oldTotal + newTotal).toFixed(2) }));
      return updated;
    });
  };

  // Pulls the item's linked Product record fresh from the backend and
  // re-applies its current price/unit/category fields onto the item (via
  // the shared applyProductToItem() helper) — lets a stale price get
  // corrected in place instead of deleting and re-adding the whole item.
  // Only works for items actually linked to a registered product
  // (item.product_id set) — freehand-typed items have nothing to refresh
  // from, so the button calling this is disabled for those.
  const refreshItem = async (idx) => {
    const item = items[idx];
    if (!item.product_id) return;
    try {
      const fresh = await api(`/products/${item.product_id}`);
      updateItem(idx, applyProductToItem(fresh, item));
    } catch {
      alert(t("Could not refresh this item — the registered product may have been deleted."));
    }
  };
  // "Update All" — refreshes every linked item in one click instead of
  // clicking the per-item refresh button one at a time. Re-fetches the full
  // product list once (fresher than whatever was loaded when the form
  // opened) rather than issuing one request per item.
  const refreshAllItems = async () => {
    const freshProducts = await api("/products");
    setProducts(freshProducts);
    items.forEach((item, idx) => {
      if (!item.product_id) return;
      const fresh = freshProducts.find(p => Number(p.id) === Number(item.product_id));
      if (fresh) updateItem(idx, applyProductToItem(fresh, item));
    });
  };

  const removeItem = (idx) => {
    setItems(prev => {
      const removed = parseFloat(prev[idx].total) || 0;
      setF(p => ({ ...p, value: Math.max(0, parseFloat(p.value || 0) - removed).toFixed(2) }));
      return prev.filter((_, i) => i !== idx);
    });
  };

  const filteredClients = clients.filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()));
  const filteredPayments = PAYMENT_TERMS_OPTIONS.filter(p => p.toLowerCase().includes((f.payment_terms || "").toLowerCase()));

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  const submit = async () => {
    // Value displays with live thousands-separator formatting (maskMoney)
    // while editing — convert back to a plain number here. Same cleanup as
    // QuotationForm's cleanedItems for the item rows themselves, since
    // Order items go through this same PricingRow editor and can just as
    // easily end up holding BR-formatted text in whichever field was last
    // typed into directly.
    const cleanedItems = items.map(item => ({
      ...item,
      total: item.total !== "" && item.total != null ? (parseLocaleNumber(item.total) ?? item.total) : item.total,
      unit_price: item.unit_price !== "" && item.unit_price != null ? (parseLocaleNumber(item.unit_price) ?? item.unit_price) : item.unit_price,
      sale_per_meter: item.sale_per_meter !== "" && item.sale_per_meter != null ? (parseLocaleNumber(item.sale_per_meter) ?? item.sale_per_meter) : item.sale_per_meter,
      sale_per_liter: item.sale_per_liter !== "" && item.sale_per_liter != null ? (parseLocaleNumber(item.sale_per_liter) ?? item.sale_per_liter) : item.sale_per_liter,
      sale_per_ton: item.sale_per_ton !== "" && item.sale_per_ton != null ? (parseLocaleNumber(item.sale_per_ton) ?? item.sale_per_ton) : item.sale_per_ton,
      sale_pct: item.sale_pct !== "" && item.sale_pct != null ? (parseLocaleNumber(item.sale_pct) ?? item.sale_pct) : item.sale_pct,
      target_price: item.target_price !== "" && item.target_price != null ? (parseLocaleNumber(item.target_price) ?? item.target_price) : item.target_price,
    }));
    await onSave({
      ...f, value: parseLocaleNumber(f.value) ?? 0,
      freight_value: f.freight_value !== "" && f.freight_value != null ? (parseLocaleNumber(f.freight_value) ?? f.freight_value) : f.freight_value,
      items: cleanedItems,
    });
    onClose();
  };

  return (
    <>
      {itemModal !== null && (
        <ProductItemModal
          products={products}
          initial={editingItemIdx !== null ? items[editingItemIdx] : null}
          onSave={(item) => {
            if (editingItemIdx !== null) { updateItem(editingItemIdx, item); setEditingItemIdx(null); }
            else addItem(item);
          }}
          onProductSaved={(saved) => setProducts(prev => prev.some(p => p.id === saved.id) ? prev.map(p => p.id === saved.id ? saved : p) : [...prev, saved])}
          onClose={() => { setItemModal(null); setEditingItemIdx(null); }}
        />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <Field label="Order Number" half>
          <Input value={f.order_number} onChange={set("order_number")} placeholder="EXP-2024-001" />
        </Field>

        <Field label="Client" half>
          <div style={{ position: "relative" }}>
            <Input value={clientSearch}
              onChange={e => { setClientSearch(e.target.value); setF(p => ({ ...p, client: e.target.value })); setShowClientList(true); }}
              onFocus={() => setShowClientList(true)}
              onBlur={() => setTimeout(() => setShowClientList(false), 200)}
              placeholder="Search client…" />
            {showClientList && filteredClients.length > 0 && (
              <div style={dropdownStyle}>
                {filteredClients.map(c => (
                  <div key={c.id} style={dropItemStyle}
                    onMouseDown={() => { setClientSearch(c.company_name); setF(p => ({ ...p, client: c.company_name })); setShowClientList(false); }}
                    onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {c.company_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>

        <Field label="Acquisition Company">
  <Select value={f.acquisition_company} onChange={set("acquisition_company")}>
    <option value="">Select...</option>
    <option value="HK">HONG KONG ALLIANCE GLOBAL TRADING CO., LTD</option>
    <option value="NINGBO">NINGBO WORLD ALLIANCE TRADING. CO. LTD.</option>
  </Select>
</Field>

        {/* PRODUCTS LIST */}
        <Field label="Products">
          <div style={{ background: "#1e293b", borderRadius: "8px", border: "1px solid #334155", overflow: "hidden" }}>
            {items.length === 0 && (
              <div style={{ padding: "12px 14px", color: "#475569", fontSize: "13px" }}>No products added yet.</div>
            )}
            {items.map((item, idx) => {
              const product = products.find(p => Number(p.id) === Number(item.product_id));
              return (
                <div key={idx} style={{ padding: "10px 14px", borderBottom: "1px solid #0f172a" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ flex: 1, fontSize: "13px" }}>
                      <span style={{ color: "#60a5fa", fontFamily: "monospace", fontSize: "11px" }}>{item.product_code}</span>
                      <span style={{ color: "#f1f5f9", marginLeft: "6px" }}>{item.product_name}</span>
                      <span style={{ color: "#64748b", marginLeft: "8px" }}>{displayQtyUnit(item)}</span>
                    </div>
                    {/* Pulls the current registered price/spec from the Product
                        record onto this item — disabled for items never linked
                        to a real product (typed freehand, no product_id / not
                        found among registered products), since there's nothing
                        to refresh from. */}
                    <Btn small color="#8857F6" disabled={!product}
                      title={product ? t("Refresh from registered product") : t("Not linked to a registered product")}
                      onClick={() => refreshItem(idx)}><RefreshIcon /></Btn>
                    <Btn small outline color="#64748b" onClick={() => { setEditingItemIdx(idx); setItemModal("edit"); }}>Edit</Btn>
                    <Btn small outline color="#ef4444" onClick={() => removeItem(idx)}>✕</Btn>
                  </div>
                  {/* The sale price can legitimately differ from whatever's registered
                      on the Product (e.g. carried over custom from a Quotation, or
                      negotiated directly here) — always editable, same as on the
                      Quotation screen. */}
                  <PricingRow item={item} product={product} currency={item.currency || f.currency}
                    onChange={updated => updateItem(idx, updated)} />
                </div>
              );
            })}
            <div style={{ padding: "10px 14px", display: "flex", gap: "8px" }}>
              <Btn small color="#3b82f6" onClick={() => { setEditingItemIdx(null); setItemModal("new"); }}>+ Add Product</Btn>
              {items.some(i => i.product_id) && (
                <Btn small color="#8857F6" onClick={refreshAllItems}><RefreshIcon /> {t("Update All")}</Btn>
              )}
            </div>
          </div>
        </Field>

        {items.length > 0 && (
          <div style={{ gridColumn: "span 2", background: "#0f172a", borderRadius: "8px", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#64748b", fontSize: "13px" }}>Items Total</span>
            <span style={{ color: "#10b981", fontWeight: 700, fontSize: "18px" }}>{fmt(itemsTotal, f.currency)}</span>
          </div>
        )}

        <Field label="Value" half>
         <Input type="text" inputMode="decimal" value={f.value} onChange={e => setF(p => ({ ...p, value: maskMoney(e.target.value) }))} placeholder="0.00" />
        </Field>
        <Field label="Currency" half>
          <Select value={f.currency} onChange={set("currency")}>
            <option>USD</option><option>EUR</option><option>BRL</option><option value="CNY">RMB</option><option value="HKD">HKD</option>
          </Select>
        </Field>
        {/* CIF freight charged to the client, on top of the goods themselves
            — shown on the Proforma/Commercial Invoice PDFs and counted as
            ordinary revenue in the Order Profitability report. */}
        <Field label={`Freight Value (${currencyLabel(f.currency)})`} half>
          <Input type="text" inputMode="decimal" value={f.freight_value || ""}
            onChange={e => setF(p => ({ ...p, freight_value: maskMoney(e.target.value) }))} placeholder="0.00" />
        </Field>
        <Field label="Prod. Lead Time (days)" half>
          <Input type="number" value={f.production_lead_time} onChange={set("production_lead_time")} />
        </Field>
        {/* Plain text, not a number input — this can end up printed on the
            Commercial Invoice PDF too (as a fallback when the Proforma's own
            Delivery at Port field is blank — see server.js), which now
            accepts a free-text note instead of only a day-count. */}
        <Field label="Delivery Days (after TT payment, or a note)" half>
          <Input value={f.delivery_days || ""} onChange={set("delivery_days")} placeholder="33" />
        </Field>
        <Field label="Incoterm" half>
          <Select value={f.incoterm} onChange={set("incoterm")}>
            <option value="">Select...</option>
            {["FOB","CIF","CFR","EXW","DAP","DDP","FCA"].map(t => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Container" half>
  <div style={{ display: "flex", gap: "8px" }}>
    <Select value={f.container} onChange={set("container")} style={{ ...inputStyle, flex: 2, cursor: "pointer" }}>
      <option value="">Select...</option>
      <option>20' Standard</option>
      <option>40' High Cube</option>
      <option>40' Standard</option>
    </Select>
    <Input type="number" value={f.container_qty || ""} onChange={set("container_qty")} placeholder="Qty" style={{ ...inputStyle, flex: 1 }} />
  </div>
</Field>

        <Field label="Port of Loading" half>
          <PortAutocomplete value={f.port_of_loading} options={CHINA_PORTS_OPTIONS}
            onChange={v => setF(p => ({ ...p, port_of_loading: v }))}
            placeholder="Search China ports or type any…" />
        </Field>

        <Field label="Port of Discharge" half>
          <PortAutocomplete value={f.port_of_discharge} options={BRAZIL_PORTS_OPTIONS}
            onChange={v => setF(p => ({ ...p, port_of_discharge: v }))}
            placeholder="Search Brazil ports or type any…" />
        </Field>

        <Field label="Shipment Date" half>
          <Input type="date" value={f.shipment_date} onChange={set("shipment_date")} />
        </Field>
        <Field label="Arrival Date" half>
          <Input type="date" value={f.arrival_date} onChange={set("arrival_date")} />
        </Field>

        <Field label="Payment Terms">
          <div style={{ position: "relative" }}>
            <Input value={f.payment_terms}
              onChange={e => { setF(p => ({ ...p, payment_terms: e.target.value })); setShowPaymentList(true); }}
              onFocus={() => setShowPaymentList(true)}
              onBlur={() => setTimeout(() => setShowPaymentList(false), 200)}
              placeholder="Search or type payment terms…" />
            {showPaymentList && filteredPayments.length > 0 && (
              <div style={dropdownStyle}>
                {filteredPayments.map((pt, i) => (
                  <div key={i} style={dropItemStyle}
                    onMouseDown={() => { setF(p => ({ ...p, payment_terms: pt })); setShowPaymentList(false); }}
                    onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{pt}</div>
                ))}
              </div>
            )}
          </div>
        </Field>

        <Field label="Notes">
          <Textarea value={f.notes} onChange={set("notes")} />
        </Field>

        <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
          <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit}>Save Order</Btn>
        </div>
      </div>
    </>
  );
}

// Shows a product's registered Cost/Sale rate over time (product_price_history
// rows, written automatically by the backend whenever the registered rate
// actually changes — see priceFieldFor/recordPriceHistory in server.js).
// No charting library is available in this project (frontend deps are just
// react/react-dom), so this is a small hand-rolled inline SVG line chart
// rather than pulling in a new dependency.
function PriceHistoryModal({ product, onClose }) {
  const t = useT();
  const [rows, setRows] = useState(null); // null = loading

  useEffect(() => {
    api(`/products/${product.id}/price-history`).then(setRows).catch(() => setRows([]));
  }, [product.id]);

  if (rows === null) {
    return (
      <Modal title={t("Price History")} onClose={onClose}>
        <div style={{ color: "#64748b", fontSize: "13px", padding: "20px 0" }}>{t("Loading...")}</div>
      </Modal>
    );
  }

  const saleRows = rows.filter(r => r.kind === "sale");
  const costRows = rows.filter(r => r.kind === "cost");
  const parseTs = (s) => new Date(String(s).replace(" ", "T")).getTime();

  if (rows.length === 0) {
    return (
      <Modal title={t("Price History")} onClose={onClose}>
        <div style={{ color: "#64748b", fontSize: "13px", padding: "20px 0" }}>{t("No price changes recorded yet.")}</div>
      </Modal>
    );
  }

  // ── Chart geometry ────────────────────────────────────────────────────
  const W = 760, H = 240, padL = 56, padR = 20, padT = 16, padB = 34;
  const allPts = [...saleRows, ...costRows];
  const times = allPts.map(r => parseTs(r.changed_at));
  const minT = Math.min(...times), maxT = Math.max(...times);
  const values = allPts.map(r => r.new_value);
  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values) * 1.1 || 1;
  const xFor = (ts) => minT === maxT ? (padL + (W - padL - padR) / 2) : padL + ((ts - minT) / (maxT - minT)) * (W - padL - padR);
  const yFor = (v) => (H - padB) - ((v - minV) / (maxV - minV || 1)) * (H - padT - padB);

  const buildPath = (series) => series
    .slice().sort((a, b) => parseTs(a.changed_at) - parseTs(b.changed_at))
    .map((r, i) => `${i === 0 ? "M" : "L"} ${xFor(parseTs(r.changed_at)).toFixed(1)} ${yFor(r.new_value).toFixed(1)}`)
    .join(" ");

  const gridLines = 4;
  const overallFor = (series) => {
    if (series.length === 0) return null;
    const sorted = series.slice().sort((a, b) => parseTs(a.changed_at) - parseTs(b.changed_at));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const base = first.old_value != null ? first.old_value : first.new_value;
    const pct = base ? ((last.new_value - base) / base) * 100 : null;
    return { base, latest: last.new_value, pct, currency: last.currency };
  };
  const saleOverall = overallFor(saleRows);
  const costOverall = overallFor(costRows);

  const tableRows = rows.slice().sort((a, b) => parseTs(b.changed_at) - parseTs(a.changed_at));

  return (
    <Modal title={`${t("Price History")} — ${product.name}`} onClose={onClose} wide>
      <div style={{ display: "flex", gap: "20px", marginBottom: "16px", flexWrap: "wrap" }}>
        {saleOverall && (
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "12px 16px", flex: 1, minWidth: "180px" }}>
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("Sale")} · {t("Overall change")}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: saleOverall.pct > 0 ? "#ef4444" : saleOverall.pct < 0 ? "#10b981" : "#f1f5f9", marginTop: "4px" }}>
              {saleOverall.pct == null ? "—" : `${saleOverall.pct > 0 ? "+" : ""}${saleOverall.pct.toFixed(1)}%`}
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
              {currencyLabel(saleOverall.currency)} {parseFloat(saleOverall.base).toFixed(2)} → {parseFloat(saleOverall.latest).toFixed(2)} ({t("since first record")})
            </div>
          </div>
        )}
        {costOverall && (
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "12px 16px", flex: 1, minWidth: "180px" }}>
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("Cost")} · {t("Overall change")}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: costOverall.pct > 0 ? "#ef4444" : costOverall.pct < 0 ? "#10b981" : "#f1f5f9", marginTop: "4px" }}>
              {costOverall.pct == null ? "—" : `${costOverall.pct > 0 ? "+" : ""}${costOverall.pct.toFixed(1)}%`}
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
              {currencyLabel(costOverall.currency)} {parseFloat(costOverall.base).toFixed(2)} → {parseFloat(costOverall.latest).toFixed(2)} ({t("since first record")})
            </div>
          </div>
        )}
      </div>

      <div style={{ background: "#0b1220", border: "1px solid #1e293b", borderRadius: "10px", padding: "10px", marginBottom: "20px" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {Array.from({ length: gridLines + 1 }).map((_, i) => {
            const v = minV + ((maxV - minV) * i) / gridLines;
            const y = yFor(v);
            return (
              <g key={i}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#1e293b" strokeWidth="1" />
                <text x={padL - 8} y={y + 3} fontSize="10" fill="#64748b" textAnchor="end">{v.toFixed(0)}</text>
              </g>
            );
          })}
          {saleRows.length > 0 && <path d={buildPath(saleRows)} fill="none" stroke="#10b981" strokeWidth="2" />}
          {costRows.length > 0 && <path d={buildPath(costRows)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="5,4" />}
          {saleRows.map((r, i) => (
            <circle key={`s${i}`} cx={xFor(parseTs(r.changed_at))} cy={yFor(r.new_value)} r="3.5" fill="#10b981">
              <title>{`${t("Sale")}: ${currencyLabel(r.currency)} ${parseFloat(r.new_value).toFixed(2)} (${String(r.changed_at).slice(0, 10)})`}</title>
            </circle>
          ))}
          {costRows.map((r, i) => (
            <circle key={`c${i}`} cx={xFor(parseTs(r.changed_at))} cy={yFor(r.new_value)} r="3.5" fill="#f59e0b">
              <title>{`${t("Cost")}: ${currencyLabel(r.currency)} ${parseFloat(r.new_value).toFixed(2)} (${String(r.changed_at).slice(0, 10)})`}</title>
            </circle>
          ))}
        </svg>
        <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "#94a3b8", marginTop: "6px", paddingLeft: `${padL}px` }}>
          {saleRows.length > 0 && <span><span style={{ display: "inline-block", width: "10px", height: "2px", background: "#10b981", marginRight: "4px", verticalAlign: "middle" }} />{t("Sale")}</span>}
          {costRows.length > 0 && <span><span style={{ display: "inline-block", width: "10px", height: "2px", background: "#f59e0b", marginRight: "4px", verticalAlign: "middle" }} />{t("Cost")}</span>}
        </div>
      </div>

      <Table
        cols={[
          { key: "changed_at", label: "Date", render: r => String(r.changed_at).slice(0, 10) },
          { key: "kind", label: "Type", render: r => r.kind === "sale" ? t("Sale") : t("Cost") },
          { key: "new_value", label: "Price", render: r => `${currencyLabel(r.currency)} ${parseFloat(r.new_value).toFixed(2)}` },
          {
            key: "delta", label: "Change", sortValue: r => r.old_value == null ? null : (r.new_value - r.old_value), render: r => {
              if (r.old_value == null) return "—";
              const delta = r.new_value - r.old_value;
              const pct = r.old_value ? (delta / r.old_value) * 100 : null;
              const color = delta > 0 ? "#ef4444" : delta < 0 ? "#10b981" : "#94a3b8";
              return <span style={{ color }}>{delta > 0 ? "+" : ""}{delta.toFixed(2)}{pct != null ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)` : ""}</span>;
            }
          },
          { key: "changed_by", label: "Changed By", render: r => r.changed_by || "—" },
        ]}
        rows={tableRows}
      />
    </Modal>
  );
}

function ProductForm({ initial, onSave, onClose }) {
const t = useT();
const { hideMargin } = usePermissions();
const [f, setF] = useState(initial || {
  code: "", name: "", description: "", unit: "unit", ncm: "", hs_code: "", color: "",
  width: "", width_unit: "cm",
  height: "", height_unit: "cm",
  thickness: "", thickness_unit: "mm",
  weight: "", weight_unit: "kg",
  tube_weight: "", tube_weight_unit: "kg",
  roll_diameter: "", roll_diameter_unit: "cm",
  volume: "", volume_unit: "L",
  unit_cost: "", cost_currency: "USD",
  sale_price: "", sale_currency: "USD", sale_pct: "",
  cost_per_meter: "", sale_per_meter: "",
  cost_per_liter: "", sale_per_liter: "",
  // Chemical goods can be priced by the liter (drum volume, the original
  // behavior) or by the ton (gross weight) — some suppliers quote bulk
  // chemicals by weight instead of volume. price_basis picks which of the
  // two rate fields below is the one actually driving Cost/Sale Price.
  price_basis: "liter",
  cost_per_ton: "", sale_per_ton: "",
  // Informational only — not used in any pricing calculation, just a
  // reference note shown next to Margin % for whoever's pricing the item.
  vat_pct: "",
  // What's counted/sold (Unit or Pair) for categories that don't already
  // have their own pricing unit (Chemical=liter/ton, Textile/DTF=meter) —
  // see the Sold By field below.
  selling_unit: "Unit",
  category: "", supplier: "",
});
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState(initial?.supplier || "");
  const [showSupplierList, setShowSupplierList] = useState(false);
  const [media, setMedia] = useState(() => {
  if (!initial?.media) return [];
  if (Array.isArray(initial.media)) return initial.media;
  try { return JSON.parse(initial.media); } catch { return []; }
});
const [uploading, setUploading] = useState(false);
const [lightbox, setLightbox] = useState(null);
useEscapeToClose(!!lightbox, () => setLightbox(null));
const [showPriceHistory, setShowPriceHistory] = useState(false);
// Live exchange rates (USD base) — used only to convert Cost Price into
// Sale Price's currency so the Real Margin indicator below is accurate
// even when a product is bought in RMB and sold in USD (or any other
// currency mismatch). Fetched once per form open; the backend itself
// caches the upstream rate for 24h, so this is cheap to call every time.
const [fx, setFx] = useState(null);
const [fxError, setFxError] = useState(false);

useEffect(() => {
  api("/exchange-rates").then(setFx).catch(() => setFxError(true));
}, []);

const handleUpload = async (e) => {
  const files = Array.from(e.target.files);
  setUploading(true);
  try {
    const results = await Promise.all(files.map(uploadToCloudinary));
    setMedia(prev => [...prev, ...results.filter(Boolean)]);
  } catch(err) { alert(t("Upload failed: ") + err.message); }
  setUploading(false);
};

  useEffect(() => {
    api("/suppliers").then(setSuppliers);
  }, []);

  // Auto-generate the next sequential Product Code for new products (never
  // overwrites an existing product's code when editing). Looks at every
  // purely-numeric code already registered and picks the next number,
  // starting at 001 if none exist yet — still editable afterwards in case
  // a manual code is needed.
  useEffect(() => {
    // Skip only when editing an existing product (it already has a real
    // code). A Duplicate seed is also passed in as `initial` but with
    // code cleared to "" on purpose — it still needs the next sequential
    // number generated here, same as a brand-new product.
    if (initial && initial.code) return;
    api("/products").then(products => {
      const maxNum = (products || []).reduce((max, p) => {
        const match = String(p.code || "").trim().match(/^(\d+)$/);
        if (!match) return max;
        return Math.max(max, parseInt(match[1], 10));
      }, 0);
      const next = String(maxNum + 1).padStart(3, "0");
      setF(p => (p.code ? p : { ...p, code: next }));
    });
  }, []);

  const filteredSuppliers = suppliers.filter(s =>
    s.company_name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

const handleCostChange = (e) => {
  const masked = maskMoney(e.target.value);
  const cost = parseLocaleNumber(masked) || 0;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const volL = volumeLOf(f);
  // Cost/Sale per Ton is a rate for the pure chemical (net weight), so the
  // per-package reference price below has to multiply by the NET tons in
  // one package, not the gross (package + drum) tons — see netTonsOf.
  const tons = netTonsOf(f);
  const cpm = heightM > 0 ? (cost / heightM).toFixed(4) : f.cost_per_meter;
  const cpl = volL > 0 ? (cost / volL).toFixed(4) : f.cost_per_liter;
  const cpt = tons > 0 ? (cost / tons).toFixed(4) : f.cost_per_ton;
  setF((p) => ({
    ...p, unit_cost: masked,
    cost_per_meter: heightM > 0 ? cpm : p.cost_per_meter,
    cost_per_liter: volL > 0 ? cpl : p.cost_per_liter,
    cost_per_ton: tons > 0 ? cpt : p.cost_per_ton,
  }));
};

  const handleSalePriceChange = (e) => {
  const masked = maskMoney(e.target.value);
  const sale = parseLocaleNumber(masked) || 0;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const volL = volumeLOf(f);
  // Cost/Sale per Ton is a rate for the pure chemical (net weight), so the
  // per-package reference price below has to multiply by the NET tons in
  // one package, not the gross (package + drum) tons — see netTonsOf.
  const tons = netTonsOf(f);
  const spm = heightM > 0 ? (sale / heightM).toFixed(4) : f.sale_per_meter;
  const spl = volL > 0 ? (sale / volL).toFixed(4) : f.sale_per_liter;
  const spt = tons > 0 ? (sale / tons).toFixed(4) : f.sale_per_ton;
  setF((p) => ({
    ...p, sale_price: masked,
    sale_per_meter: heightM > 0 ? spm : p.sale_per_meter,
    sale_per_liter: volL > 0 ? spl : p.sale_per_liter,
    sale_per_ton: tons > 0 ? spt : p.sale_per_ton,
  }));
};

// Margin % is the target for the "Real Margin" box further down (Sale vs.
// Cost, converted into Sale Price's currency, PLUS VAT % added straight on
// top — same combinedMarginPct math that box itself displays): typing 11
// here solves for whatever Sale Price makes that box read exactly +11.0%,
// instead of the old behavior of just bumping whatever Sale Price already
// happened to be typed in. Needs Cost Price filled in (and, for a different
// Cost/Sale currency pair, the live exchange rate to have loaded) — without
// those there's nothing to solve the equation from, so the field still
// accepts the number but leaves Sale Price untouched until they're there.
const handleSalePctChange = (e) => {
  const pctStr = e.target.value;
  const pct = parseFloat(pctStr);
  const costNum = parseLocaleNumber(f.unit_cost) || 0;
  const costCur = f.cost_currency || "USD";
  const saleCur = f.sale_currency || "USD";
  let costInSaleCur = null;
  if (costNum > 0) {
    if (costCur === saleCur) costInSaleCur = costNum;
    else if (fx?.rates?.[costCur] && fx?.rates?.[saleCur]) costInSaleCur = (costNum / fx.rates[costCur]) * fx.rates[saleCur];
  }
  const vatPct = parseFloat(f.vat_pct) || 0;
  const canCalc = costInSaleCur != null && costInSaleCur > 0 && !isNaN(pct);
  const sale = canCalc ? costInSaleCur * (1 + (pct - vatPct) / 100) : null;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const volL = volumeLOf(f);
  // Cost/Sale per Ton is a rate for the pure chemical (net weight), so the
  // per-package reference price below has to multiply by the NET tons in
  // one package, not the gross (package + drum) tons — see netTonsOf.
  const tons = netTonsOf(f);
  setF((p) => ({
    ...p, sale_pct: pctStr,
    sale_price: canCalc ? maskMoney(sale.toFixed(2)) : p.sale_price,
    sale_per_meter: canCalc && heightM > 0 ? (sale / heightM).toFixed(4) : p.sale_per_meter,
    sale_per_liter: canCalc && volL > 0 ? (sale / volL).toFixed(4) : p.sale_per_liter,
    sale_per_ton: canCalc && tons > 0 ? (sale / tons).toFixed(4) : p.sale_per_ton,
  }));
};

const handleCostPerMeterChange = (e) => {
  const cpm = parseFloat(e.target.value) || 0;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const unit_cost = maskMoney((cpm * heightM).toFixed(2));
  setF((p) => ({ ...p, cost_per_meter: e.target.value, unit_cost: heightM > 0 ? unit_cost : p.unit_cost }));
};

const handleSalePerMeterChange = (e) => {
  const spm = parseFloat(e.target.value) || 0;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const sale_price = maskMoney((spm * heightM).toFixed(2));
  setF((p) => ({
    ...p, sale_per_meter: e.target.value,
    sale_price: heightM > 0 ? sale_price : p.sale_price,
  }));
};

const handleCostPerLiterChange = (e) => {
  const cpl = parseFloat(e.target.value) || 0;
  const volL = volumeLOf(f);
  const unit_cost = maskMoney((cpl * volL).toFixed(2));
  setF((p) => ({ ...p, cost_per_liter: e.target.value, unit_cost: volL > 0 ? unit_cost : p.unit_cost }));
};

const handleCostPerTonChange = (e) => {
  const cpt = parseFloat(e.target.value) || 0;
  // Cost/Sale per Ton is a rate for the pure chemical (net weight), so the
  // per-package reference price below has to multiply by the NET tons in
  // one package, not the gross (package + drum) tons — see netTonsOf.
  const tons = netTonsOf(f);
  const unit_cost = maskMoney((cpt * tons).toFixed(2));
  setF((p) => ({ ...p, cost_per_ton: e.target.value, unit_cost: tons > 0 ? unit_cost : p.unit_cost }));
};

const handleSalePerTonChange = (e) => {
  const spt = parseFloat(e.target.value) || 0;
  // Cost/Sale per Ton is a rate for the pure chemical (net weight), so the
  // per-package reference price below has to multiply by the NET tons in
  // one package, not the gross (package + drum) tons — see netTonsOf.
  const tons = netTonsOf(f);
  const sale_price = maskMoney((spt * tons).toFixed(2));
  setF((p) => ({
    ...p, sale_per_ton: e.target.value,
    sale_price: tons > 0 ? sale_price : p.sale_price,
  }));
};

const handleSalePerLiterChange = (e) => {
  const spl = parseFloat(e.target.value) || 0;
  const volL = volumeLOf(f);
  const sale_price = maskMoney((spl * volL).toFixed(2));
  setF((p) => ({
    ...p, sale_per_liter: e.target.value,
    sale_price: volL > 0 ? sale_price : p.sale_price,
  }));
};

  const currencies = ["USD", "BRL", "CNY", "EUR", "GBP", "JPY", "HKD"];

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  // Real profit margin, converting Cost Price into Sale Price's currency
  // via the live exchange rate first — comparing the two raw numbers
  // directly (e.g. RMB 368.15 cost vs USD 119.4 sale) is meaningless and
  // used to require doing this conversion by hand. Same-currency products
  // skip the rate lookup entirely and are always calculable.
  const costNum = parseLocaleNumber(f.unit_cost) || 0;
  const saleNum = parseLocaleNumber(f.sale_price) || 0;
  const costCur = f.cost_currency || "USD";
  const saleCur = f.sale_currency || "USD";
  let costInSaleCur = null;
  if (costNum > 0) {
    if (costCur === saleCur) {
      costInSaleCur = costNum;
    } else if (fx?.rates?.[costCur] && fx?.rates?.[saleCur]) {
      costInSaleCur = (costNum / fx.rates[costCur]) * fx.rates[saleCur];
    }
  }
  const realMarginPct = (costInSaleCur != null && costInSaleCur > 0 && saleNum > 0)
    ? ((saleNum - costInSaleCur) / costInSaleCur) * 100
    : null;
  // VAT % (e.g. a Chinese export rebate) adds straight onto the margin
  // below instead of just sitting there as a reference note — per the
  // client's own instruction, it's a simple sum on top of the currency-
  // converted real margin, not a separate calculation of its own.
  const vatPct = parseFloat(f.vat_pct) || 0;
  const combinedMarginPct = realMarginPct != null ? realMarginPct + vatPct : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Product Code" half><Input value={f.code} onChange={set("code")} placeholder="001" /></Field>
      {/* Name/Color are always stored upper-case (typed or pasted — a paste
          fires the same onChange event as typing, so uppercasing here on
          every change covers both) per client convention for how these
          print on generated PDFs/labels. */}
      <Field label="Name" half><Input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value.toUpperCase() }))} /></Field>
      <Field label="NCM" half><Input value={f.ncm} onChange={e => setF(p => ({ ...p, ncm: maskNCM(e.target.value) }))} placeholder="0000.00.00" /></Field>
      {/* Chinese-language name, entered by hand alongside the English one —
          printed under Product Name on the bilingual Purchase Contract PDF
          sent to the Chinese factory. */}
      <Field label="Name (Chinese)" half><Input value={f.name_zh || ""} onChange={set("name_zh")} placeholder="产品名称" /></Field>
      <Field label="HS Code" half><Input value={f.hs_code || ""} onChange={set("hs_code")} placeholder="0000.00" /></Field>
      <Field label="Color" half><Input value={f.color || ""} onChange={e => setF(p => ({ ...p, color: e.target.value.toUpperCase() }))} placeholder="e.g. Red, Navy Blue" /></Field>
      {/* The client's OWN color reference (e.g. a Pantone code or their
          internal color name) — separate from Color above, which is this
          company's own description of it. Printed under Color on the
          Commercial Invoice/Proforma/Packing List PDFs. */}
      <Field label="Client Color Code" half><Input value={f.client_color_code || ""} onChange={set("client_color_code")} placeholder="e.g. PMS 186 C" /></Field>
      {/* Chinese-language color, same purpose as Name (Chinese) above —
          printed under Color on the Purchase Contract PDF. */}
      <Field label="Color (Chinese)" half><Input value={f.color_zh || ""} onChange={set("color_zh")} placeholder="颜色" /></Field>
      <Field label="Category" half>
  <Select value={f.category} onChange={set("category")}>
    <option value="">Select...</option>
    {PRODUCT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
  </Select>
</Field>

      <Field label="Supplier" half>
        <div style={{ position: "relative" }}>
          <Input
            value={supplierSearch}
            onChange={e => { setSupplierSearch(e.target.value); setF(p => ({ ...p, supplier: e.target.value })); setShowSupplierList(true); }}
            onFocus={() => setShowSupplierList(true)}
            onBlur={() => setTimeout(() => setShowSupplierList(false), 200)}
            placeholder="Search supplier…"
          />
          {showSupplierList && filteredSuppliers.length > 0 && (
            <div style={dropdownStyle}>
              {filteredSuppliers.map(s => (
                <div key={s.id} style={dropItemStyle}
                  onMouseDown={() => { setSupplierSearch(s.company_name); setF(p => ({ ...p, supplier: s.company_name })); setShowSupplierList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {s.company_name}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>

      <Field label="Package" half>
  <Select value={f.unit} onChange={set("unit")}>
    <option value="">Select...</option>
    {PACKAGE_UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
  </Select>
</Field>

<Field label="Width" half>
  <div style={{ display: "flex", gap: "6px" }}>
    <Input value={f.width} onChange={set("width")} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
    <Select value={f.width_unit} onChange={set("width_unit")} style={{ ...inputStyle, width: "80px", cursor: "pointer" }}>
      {["mm","cm","m","in"].map(u => <option key={u}>{u}</option>)}
    </Select>
  </div>
</Field>
<Field label="Height" half>
  <div style={{ display: "flex", gap: "6px" }}>
    <Input value={f.height || ""} onChange={set("height")} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
    <Select value={f.height_unit || "cm"} onChange={set("height_unit")} style={{ ...inputStyle, width: "80px", cursor: "pointer" }}>
      {["mm","cm","m","in"].map(u => <option key={u}>{u}</option>)}
    </Select>
  </div>
</Field>
<Field label="Thickness" half>
  <div style={{ display: "flex", gap: "6px" }}>
    <Input value={f.thickness || ""} onChange={set("thickness")} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
    <Select value={f.thickness_unit || "mm"} onChange={set("thickness_unit")} style={{ ...inputStyle, width: "80px", cursor: "pointer" }}>
      {["mm","cm","m","in"].map(u => <option key={u}>{u}</option>)}
    </Select>
  </div>
</Field>
<Field label={f.category === "Chemical" ? "Weight (gross, full package)" : "Weight"} half>
  <div style={{ display: "flex", gap: "6px" }}>
    <Input value={f.weight || ""} onChange={set("weight")} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
    <Select value={f.weight_unit || "kg"} onChange={set("weight_unit")} style={{ ...inputStyle, width: "90px", cursor: "pointer" }}>
      {["kg","g","g/m","g/m²","lb","oz"].map(u => <option key={u}>{u}</option>)}
    </Select>
  </div>
</Field>

{f.category === "Chemical" && f.price_basis === "ton" && (
  // Full-width, same reasoning as Volume below — a conditional `half`
  // field here would throw off the Cost/Sale grid alternation that
  // follows. `weight` above is the GROSS weight of one full drum (drum +
  // chemical) — used for Gross Weight totals. This is the chemical ALONE,
  // same unit as Weight's dropdown, used only to work out how many drums a
  // given tonnage needs (dividing by the gross figure would undercount,
  // since part of it is the drum itself, not product).
  <Field label={`Net Weight (chemical only, per package, ${f.weight_unit || "kg"})`}>
    <Input value={f.net_weight || ""} onChange={set("net_weight")} placeholder="e.g. 200 (vs. 264.85 gross above)" style={{ ...inputStyle }} />
  </Field>
)}

{f.category !== "Chemical" && f.category !== "Textile" && f.category !== "DTF Film" && (
  // What's actually being counted/sold — separate from Package above (the
  // physical container). Registered here so every order item for this
  // product defaults correctly instead of relying on whoever places a given
  // order to remember to switch it. Full-width and grouped down here with
  // Units per Package/Package Weight (not up next to Package) since the
  // three belong together — up there it split the Width/Height/Thickness/
  // Weight fields across mismatched rows.
  <Field label="Sold By">
    <Select value={f.selling_unit || "Unit"} onChange={set("selling_unit")}>
      {SELLING_UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
    </Select>
  </Field>
)}

{f.category !== "Chemical" && f.category !== "Textile" && f.category !== "DTF Film" && (
  // For any OTHER category sold in a different unit than it's physically
  // packed in — e.g. LED lights sold per PAIR, packed 500 pairs to a
  // cardboard box. Not for Chemical or Textile/DTF Film — both already have
  // their own dedicated weight-per-package concept (Net Weight/tons per
  // drum for Chemical; Tube Weight + Roll Diameter for Textile/DTF, sold by
  // roll/meter rather than a "units per package" count), so this pair of
  // fields doesn't mean anything there and was showing up regardless of
  // category — same gate as Sold By just above, which this belongs next to.
  // Both optional/blank by default (no effect on anything unless filled
  // in): leave them empty and Packages on the Packing List just defaults to
  // the raw quantity ordered, same as always. Fill them in and Packages/
  // Gross Weight get derived automatically instead of needing to be typed
  // in by hand on every shipment.
  <>
    <Field label="Units per Package (optional)" half>
      <Input value={f.units_per_package || ""} onChange={set("units_per_package")} placeholder="e.g. 500 (pairs per box)" style={{ ...inputStyle }} />
    </Field>
    <Field label={`Package Weight (gross, per package, ${f.weight_unit || "kg"})`} half>
      <Input value={f.package_weight || ""} onChange={set("package_weight")} placeholder="e.g. 16 (kg per box)" style={{ ...inputStyle }} />
    </Field>
  </>
)}

{(f.category === "Textile" || f.category === "DTF Film") && (
  // Paired as two `half` fields (same row) instead of each taking the full
  // width — together they still add up to one full row, so the Cost/Sale
  // grid alternation that follows lines up exactly the same as before.
  // Same compact Input+Select layout as the Weight field above, just with a
  // plain weight-unit list (no g/m or g/m², which don't apply to a fixed
  // per-roll tube mass).
  <Field label="Tube Weight (cardboard core, per roll)" half>
    <div style={{ display: "flex", gap: "6px" }}>
      <Input value={f.tube_weight || ""} onChange={set("tube_weight")} placeholder="e.g. 1.075" style={{ ...inputStyle, flex: 1 }} />
      <Select value={f.tube_weight_unit || "kg"} onChange={set("tube_weight_unit")} style={{ ...inputStyle, width: "90px", cursor: "pointer" }}>
        {["kg","g","lb","oz"].map(u => <option key={u}>{u}</option>)}
      </Select>
    </div>
  </Field>
)}

{(f.category === "Textile" || f.category === "DTF Film") && (
  // Rolled diameter (outer diameter of the finished roll, tube included) —
  // needed to compute an actual rolled volume (cylinder: π × (diameter/2)² ×
  // length) for the Packing List's CBM, instead of only splitting each
  // container's flat capacity proportionally by weight share.
  <Field label="Roll Diameter (finished roll, tube included)" half>
    <div style={{ display: "flex", gap: "6px" }}>
      <Input value={f.roll_diameter || ""} onChange={set("roll_diameter")} placeholder="e.g. 30" style={{ ...inputStyle, flex: 1 }} />
      <Select value={f.roll_diameter_unit || "cm"} onChange={set("roll_diameter_unit")} style={{ ...inputStyle, width: "90px", cursor: "pointer" }}>
        {["mm","cm","m","in"].map(u => <option key={u}>{u}</option>)}
      </Select>
    </div>
  </Field>
)}

{f.category === "Chemical" && (
  // Full-width on purpose: a conditional `half` field here would eat one
  // slot of the 2-column grid and throw off every Cost/Sale pair that
  // follows (whichever field lands next would silently swap from the left
  // column to the right one, and vice versa).
  <Field label="Volume (per package)">
    <div style={{ display: "flex", gap: "6px" }}>
      <Input value={f.volume || ""} onChange={set("volume")} placeholder="e.g. 200 for a 200L drum" style={{ ...inputStyle, flex: 1 }} />
      <Select value={f.volume_unit || "L"} onChange={set("volume_unit")} style={{ ...inputStyle, width: "80px", cursor: "pointer" }}>
        {["mL","L","gal"].map(u => <option key={u}>{u}</option>)}
      </Select>
    </div>
  </Field>
)}

{f.category === "Chemical" && (
  // Which of the two rate fields below (Cost/Sale per Liter or per Ton)
  // actually drives Cost/Sale Price — some bulk chemicals are quoted by
  // weight instead of drum volume. Uses the Weight field above (already
  // filled in for every category's Total Weight calc) as tons/package,
  // same way Volume above is used as liters/package.
  <Field label="Price Basis">
    <Select value={f.price_basis || "liter"} onChange={set("price_basis")}>
      <option value="liter">Per Liter (uses Volume)</option>
      <option value="ton">Per Ton (uses Weight)</option>
    </Select>
  </Field>
)}

{/* Cost and Sale fields laid out as two explicit columns (their own grid,
    spanning the full width of the outer form grid) so "Cost X" always sits
    on the left and "Sale X" always sits on the right, regardless of which
    conditional per-meter/per-liter rows are showing for the category. */}
<div style={{ gridColumn: "span 2", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
    <Field label="Cost Currency">
      <Select value={f.cost_currency} onChange={set("cost_currency")}>
        {currencies.map(c => <option key={c} value={c}>{currencyLabel(c)}</option>)}
      </Select>
    </Field>
    {(f.category === "Textile" || f.category === "DTF Film") && (
      <Field label="Cost per Meter">
        <Input type="number" value={f.cost_per_meter || ""} onChange={handleCostPerMeterChange} placeholder="0.00" />
      </Field>
    )}
    {f.category === "Chemical" && (f.price_basis || "liter") === "liter" && (
      <Field label="Cost per Liter">
        <Input type="number" value={f.cost_per_liter || ""} onChange={handleCostPerLiterChange} placeholder="0.00" />
      </Field>
    )}
    {f.category === "Chemical" && f.price_basis === "ton" && (
      <Field label="Cost per Ton">
        <Input type="number" value={f.cost_per_ton || ""} onChange={handleCostPerTonChange} placeholder="0.00" />
        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
          1 package ≈ {netTonsOf(f).toFixed(3)} t net (from Net Weight above) — Cost/Sale Price below = this rate × that weight.
        </div>
      </Field>
    )}
    <div style={{ display: "flex", gap: "16px" }}>
      <div style={{ flex: 1 }}>
        <Field label="Cost Price">
          <Input type="text" inputMode="decimal" value={f.unit_cost} onChange={handleCostChange} placeholder="0.00" />
        </Field>
      </div>
      <div style={{ flex: 1 }}>
        <Field label="VAT %">
          <Input type="number" value={f.vat_pct || ""} onChange={set("vat_pct")} placeholder="e.g. 13" />
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>{t("Added on top of the Real Margin below.")}</div>
        </Field>
      </div>
    </div>
  </div>
  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
    <Field label="Sale Currency">
      <Select value={f.sale_currency || "USD"} onChange={set("sale_currency")}>
        {currencies.map(c => <option key={c} value={c}>{currencyLabel(c)}</option>)}
      </Select>
    </Field>
    {(f.category === "Textile" || f.category === "DTF Film") && (
      <Field label="Sale per Meter">
        <Input type="number" value={f.sale_per_meter || ""} onChange={handleSalePerMeterChange} placeholder="0.00" />
      </Field>
    )}
    {f.category === "Chemical" && (f.price_basis || "liter") === "liter" && (
      <Field label="Sale per Liter">
        <Input type="number" value={f.sale_per_liter || ""} onChange={handleSalePerLiterChange} placeholder="0.00" />
      </Field>
    )}
    {f.category === "Chemical" && f.price_basis === "ton" && (
      <Field label="Sale per Ton">
        <Input type="number" value={f.sale_per_ton || ""} onChange={handleSalePerTonChange} placeholder="0.00" />
      </Field>
    )}
    <Field label="Sale Price">
      <Input type="text" inputMode="decimal" value={f.sale_price || ""} onChange={handleSalePriceChange} placeholder="0.00" />
    </Field>
    <Field label="Margin %">
      <Input type="number" value={f.sale_pct || ""} onChange={handleSalePctChange} placeholder="e.g. 15" />
      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>{t("Sets the Sale Price so the Real Margin below equals this %.")}</div>
    </Field>
  </div>
</div>

{!hideMargin && costNum > 0 && saleNum > 0 && (
  <div style={{
    gridColumn: "span 2", background: "#1e293b",
    border: `1px solid ${realMarginPct == null ? "#334155" : realMarginPct < 0 ? "#ef4444" : "#10b981"}`,
    borderRadius: "10px", padding: "14px 18px", display: "flex", alignItems: "center",
    justifyContent: "space-between", flexWrap: "wrap", gap: "8px",
  }}>
    <div>
      <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("Real Margin")}</div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: combinedMarginPct == null ? "#94a3b8" : combinedMarginPct < 0 ? "#ef4444" : "#10b981" }}>
        {combinedMarginPct == null
          ? (costCur === saleCur ? "—" : (fxError ? "—" : t("Loading exchange rate...")))
          : `${combinedMarginPct > 0 ? "+" : ""}${combinedMarginPct.toFixed(1)}%`}
        {combinedMarginPct != null && combinedMarginPct < 0 && <span style={{ fontSize: "13px", marginLeft: "8px" }}>⚠️ {t("Loss")}</span>}
      </div>
      {realMarginPct != null && vatPct !== 0 && (
        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
          {realMarginPct.toFixed(1)}% {vatPct > 0 ? "+" : ""}{vatPct.toFixed(1)}% {t("VAT %")}
        </div>
      )}
    </div>
    {costCur !== saleCur && (
      <div style={{ fontSize: "11px", color: "#64748b", textAlign: "right" }}>
        {costInSaleCur != null
          ? <div>{currencyLabel(costCur)} {costNum.toFixed(2)} ≈ {currencyLabel(saleCur)} {costInSaleCur.toFixed(2)}</div>
          : <div>{fxError ? t("Could not load exchange rate.") : t("Loading exchange rate...")}</div>}
        {fx?.date && <div>{t("Rate date")}: {fx.date}{fx.stale ? ` (${t("cached")})` : ""}</div>}
      </div>
    )}
  </div>
)}

      <Field label="Description"><Textarea value={f.description} onChange={set("description")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        {initial?.id && (
          <Btn outline color="#8b5cf6" onClick={() => setShowPriceHistory(true)}>📈 Price History</Btn>
        )}
        {showPriceHistory && (
          <PriceHistoryModal product={initial} onClose={() => setShowPriceHistory(false)} />
        )}
        <Field label="Photos / Files">
  <div>
    <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 16px", cursor: "pointer", fontSize: "13px", color: "#94a3b8", marginBottom: "12px" }}>
      {uploading ? t("⏳ Uploading...") : t("📎 Add Photos / Files")}
      <input type="file" multiple accept="image/*,application/pdf,video/*" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
    </label>
    {lightbox && (
      <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        {lightbox.match(/\.(mp4|mov|avi|webm)$/i) ? (
          <video src={lightbox} controls style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px" }} onClick={e => e.stopPropagation()} />
        ) : (
          <img src={lightbox} style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px", objectFit: "contain" }} alt="" onClick={e => e.stopPropagation()} />
        )}
        <button onClick={() => setLightbox(null)} style={{ position: "fixed", top: "20px", right: "20px", background: "#ef4444", border: "none", borderRadius: "50%", width: "36px", height: "36px", color: "#fff", fontSize: "18px", cursor: "pointer" }}>✕</button>
      </div>
    )}
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {media.filter(Boolean).map((item, i) => {
        const url = typeof item === 'string' ? item : item.url;
        const name = typeof item === 'string' ? url.split('/').pop() : item.name;
        return (
          <div key={i} style={{ position: "relative" }}>
            {url.match(/\.pdf$/i) || name.match(/\.pdf$/i) ? (
              <a href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "80px", height: "80px", background: "#1e293b", borderRadius: "6px", border: "1px solid #334155", color: "#f1f5f9", fontSize: "28px", textDecoration: "none" }}>📄</a>
            ) : url.match(/\.(mp4|mov|avi|webm)$/i) ? (
              <video src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} />
            ) : (
              <img src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} alt="" />
            )}
            <button onClick={async () => { const res = await fetch(url); const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }} style={{ position: "absolute", bottom: "-6px", left: "-6px", background: "#3b82f6", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⬇</button>
            <button onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: "-6px", right: "-6px", background: "#ef4444", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
        );
      })}
    </div>
  </div>
</Field>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => {
          // unit_cost/sale_price display with live thousands-separator
          // formatting (see maskMoney) while editing — convert back to
          // plain numbers here so the backend's REAL columns get an actual
          // number, not a "1.225,60"-style formatted string.
          //
          // width/height/thickness/weight/tube_weight/roll_diameter/volume
          // are plain free-text fields (no mask) — a Brazilian user typing
          // "264,85" would otherwise get saved as the literal string
          // "264,85", and every downstream calculation (Total Weight, drum
          // count for ton-priced Chemical, CBM...) uses parseFloat(), which
          // stops at the first comma and silently reads it as just "264",
          // quietly dropping the decimal part. Routing these through the
          // same BR/US-aware parser used for money fields fixes that at
          // the source instead of leaving every downstream parseFloat() to
          // get it wrong the same way.
          const normNum = (v) => (v === "" || v == null ? v : (parseLocaleNumber(v) ?? v));
          await onSave({
            ...f,
            unit_cost: parseLocaleNumber(f.unit_cost) ?? 0,
            sale_price: parseLocaleNumber(f.sale_price) ?? 0,
            width: normNum(f.width),
            height: normNum(f.height),
            thickness: normNum(f.thickness),
            weight: normNum(f.weight),
            net_weight: normNum(f.net_weight),
            tube_weight: normNum(f.tube_weight),
            roll_diameter: normNum(f.roll_diameter),
            volume: normNum(f.volume),
            units_per_package: normNum(f.units_per_package),
            package_weight: normNum(f.package_weight),
            media: JSON.stringify(media),
          });
          onClose();
        }}>Save Product</Btn>
      </div>
    </div>
  );
}

function SampleForm({ onSave, onClose, initial }) {
const t = useT();
const [f, setF] = useState(initial || { code: "", product_name: "", category: "", client: "", supplier: "", requested_date: "", ready_date: "", status: "Requested", notes: "" });
const [clients, setClients] = useState([]);
const [clientSearch, setClientSearch] = useState(initial?.client || "");
const [showClientList, setShowClientList] = useState(false);
const [suppliers, setSuppliers] = useState([]);
const [supplierSearch, setSupplierSearch] = useState(initial?.supplier || "");
const [showSupplierList, setShowSupplierList] = useState(false);

// Auto-generate the next sequential Code for new sample requests — same
// convention as Product Code/Quotation Number: highest purely-numeric code
// already registered, +1, zero-padded to 3 digits. Never overwrites an
// existing sample's code when editing, still fully editable afterwards.
useEffect(() => {
  if (initial && initial.code) return;
  api("/samples").then(samples => {
    const maxNum = (samples || []).reduce((max, s) => {
      const match = String(s.code || "").trim().match(/^(\d+)$/);
      if (!match) return max;
      return Math.max(max, parseInt(match[1], 10));
    }, 0);
    const next = String(maxNum + 1).padStart(3, "0");
    setF(p => (p.code ? p : { ...p, code: next }));
  });
}, []);
const [media, setMedia] = useState(() => {
  if (!initial?.media) return [];
  let parsed = initial.media;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(item => typeof item === 'string' ? { url: item, name: item.split('/').pop() } : item);
});
const [uploading, setUploading] = useState(false);
const [lightbox, setLightbox] = useState(null);
useEscapeToClose(!!lightbox, () => setLightbox(null));
  
const handleUpload = async (e) => {
  const files = Array.from(e.target.files);
  setUploading(true);
  try {
const results = await Promise.all(files.map(uploadToCloudinary));
const validResults = results.filter(Boolean);
setMedia(prev => [...prev, ...validResults]);
  } catch(err) {
    alert(t("Upload failed: ") + err.message);
  }
  setUploading(false);
};
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  useEffect(() => { api("/clients").then(setClients); api("/suppliers").then(setSuppliers); }, []);

  const filteredClients = clients.filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()));
  const filteredSuppliers = suppliers.filter(s => s.company_name.toLowerCase().includes(supplierSearch.toLowerCase()));

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Code" half><Input value={f.code} onChange={set("code")} placeholder="SMP-001" /></Field>
      <Field label="Category" half>
        <Select value={f.category} onChange={set("category")}>
          <option value="">Select...</option>
          {PRODUCT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Product Name"><Input value={f.product_name} onChange={set("product_name")} /></Field>
      <Field label="Client" half>
        <div style={{ position: "relative" }}>
          <Input value={clientSearch}
            onChange={e => { setClientSearch(e.target.value); setF(p => ({ ...p, client: e.target.value })); setShowClientList(true); }}
            onFocus={() => setShowClientList(true)}
            onBlur={() => setTimeout(() => setShowClientList(false), 200)}
            placeholder="Search client…" />
          {showClientList && filteredClients.length > 0 && (
            <div style={dropdownStyle}>
              {filteredClients.map(c => (
                <div key={c.id} style={dropItemStyle}
                  onMouseDown={() => { setClientSearch(c.company_name); setF(p => ({ ...p, client: c.company_name })); setShowClientList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {c.company_name}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="Supplier" half>
        <div style={{ position: "relative" }}>
          <Input value={supplierSearch}
            onChange={e => { setSupplierSearch(e.target.value); setF(p => ({ ...p, supplier: e.target.value })); setShowSupplierList(true); }}
            onFocus={() => setShowSupplierList(true)}
            onBlur={() => setTimeout(() => setShowSupplierList(false), 200)}
            placeholder="Search supplier…" />
          {showSupplierList && filteredSuppliers.length > 0 && (
            <div style={dropdownStyle}>
              {filteredSuppliers.map(s => (
                <div key={s.id} style={dropItemStyle}
                  onMouseDown={() => { setSupplierSearch(s.company_name); setF(p => ({ ...p, supplier: s.company_name })); setShowSupplierList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {s.company_name}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="Requested Date" half><Input type="date" value={f.requested_date} onChange={set("requested_date")} /></Field>
      <Field label="Ready Date" half><Input type="date" value={f.ready_date || ""} onChange={set("ready_date")} /></Field>
      <Field label="Sent Date" half><Input type="date" value={f.sent_date || ""} onChange={set("sent_date")} /></Field>
      <Field label="Status" half>
        <Select value={f.status} onChange={set("status")}>
          {SAMPLE_STATUSES.map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>

<div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
  <Field label="Photos / Videos">
  <div style={{ gridColumn: "span 2" }}>
    <label style={{
      display: "inline-flex", alignItems: "center", gap: "8px",
      background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
      padding: "10px 16px", cursor: "pointer", fontSize: "13px", color: "#94a3b8",
      marginBottom: "12px",
    }}>
      {uploading ? t("⏳ Uploading...") : t("📎 Add Photos / Videos")}
      <input type="file" multiple accept="image/*,video/*" onChange={handleUpload}
        style={{ display: "none" }} disabled={uploading} />
    </label>
    {media.length > 0 && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
{lightbox && (
  <div onClick={() => setLightbox(null)} style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
  }}>
    {lightbox.match(/\.(mp4|mov|avi|webm)$/i) ? (
      <video src={lightbox} controls style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px" }} onClick={e => e.stopPropagation()} />
    ) : (
      <img src={lightbox} style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px", objectFit: "contain" }} alt="" onClick={e => e.stopPropagation()} />
    )}
    <button onClick={() => setLightbox(null)} style={{
      position: "fixed", top: "20px", right: "20px", background: "#ef4444",
      border: "none", borderRadius: "50%", width: "36px", height: "36px",
      color: "#fff", fontSize: "18px", cursor: "pointer"
    }}>✕</button>
  </div>
)}

{media.filter(Boolean).map((item, i) => {
  const url = typeof item === 'string' ? item : item.url;
  const name = typeof item === 'string' ? url.split('/').pop() : item.name;
  return (
    <div key={i} style={{ position: "relative" }}>
      {url.match(/\.pdf$/i) || name.match(/\.pdf$/i) ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "80px", height: "80px", background: "#1e293b", borderRadius: "6px", border: "1px solid #334155", color: "#f1f5f9", fontSize: "28px", textDecoration: "none" }}>📄</a>
      ) : url.match(/\.(mp4|mov|avi|webm)$/i) ? (
        <video src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} />
      ) : (
        <img src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} alt="" />
      )}
      <button onClick={async () => {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
      }} style={{ position: "absolute", bottom: "-6px", left: "-6px", background: "#3b82f6", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⬇</button>
      <button onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: "-6px", right: "-6px", background: "#ef4444", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
    </div>
  );
})}
      </div>
    )}
  </div>
</Field>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave({ ...f, media: JSON.stringify(media) }); onClose(); }}>Save Sample</Btn>
      </div>
    </div>
  );
}

function ProformaForm({ onSave, onClose, orders, initial }) {
  const t = useT();
  const [f, setF] = useState(initial || {
    order_id: "", quotation_id: "", number: "", issue_date: "", validity: "", client: "", total: "", currency: "USD", status: "Draft", notes: "",
    acquisition_company: "", incoterm: "", way_of_shipment: "By Sea", port_of_loading: "", port_of_discharge: "",
    freight_value: "",
    payment_terms: "", production_days: "", delivery_days: "", consignee: "", notify_party: "",
  });
  const [items, setItems] = useState(() => {
    if (Array.isArray(initial?.items)) return initial.items;
    if (typeof initial?.items === "string") { try { return JSON.parse(initial.items || "[]"); } catch { return []; } }
    return [];
  });
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState(initial?.client || "");
  const [showClientList, setShowClientList] = useState(false);
  // Consignee / Notify Party — same "search the registered Clients list"
  // pattern as Client itself, both entirely optional. Left blank (the
  // common case), the PDF shows one combined "Importer / Consignee / Notify
  // Party" box for the Client, same as before this existed; filling either
  // one in switches the PDF to separate labeled boxes (see salesInvoice.js).
  const [consigneeSearch, setConsigneeSearch] = useState(initial?.consignee || "");
  const [showConsigneeList, setShowConsigneeList] = useState(false);
  const [notifyPartySearch, setNotifyPartySearch] = useState(initial?.notify_party || "");
  const [showNotifyPartyList, setShowNotifyPartyList] = useState(false);
  const [itemModal, setItemModal] = useState(null);
  const [editingItemIdx, setEditingItemIdx] = useState(null);
  const [showPaymentList, setShowPaymentList] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const filteredPayments = PAYMENT_TERMS_OPTIONS.filter(p => p.toLowerCase().includes((f.payment_terms || "").toLowerCase()));

  useEffect(() => {
    api("/products").then(setProducts);
    api("/clients").then(setClients);
  }, []);

  // Keeps Acquisition Company synced to the linked Order's current value
  // any time this form has one — not just the moment the user actively
  // re-picks a different order in the dropdown below (which used to be the
  // only place this synced), but also the instant the Edit Proforma modal
  // opens for a Proforma that already has an order_id. Without this, the
  // field kept showing whatever was saved on the Proforma itself the last
  // time it was edited, so changing the Acquisition Company on the Order
  // afterwards left this "locked" field looking stale here — even though
  // the actual generated PDF was already reading live from the Order all
  // along (see the PDF route in server.js).
  useEffect(() => {
    if (!f.order_id) return;
    const linkedOrder = orders.find(o => String(o.id) === String(f.order_id));
    if (linkedOrder && linkedOrder.acquisition_company && linkedOrder.acquisition_company !== f.acquisition_company) {
      setF(p => ({ ...p, acquisition_company: linkedOrder.acquisition_company }));
    }
  }, [f.order_id, orders]);

  const addItem = (item) => setItems(prev => [...prev, item]);
  const updateItem = (idx, item) => setItems(prev => { const u = [...prev]; u[idx] = item; return u; });
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const filteredClients = clients.filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()));
  const filteredConsignees = clients.filter(c => c.company_name.toLowerCase().includes(consigneeSearch.toLowerCase()));
  const filteredNotifyParties = clients.filter(c => c.company_name.toLowerCase().includes(notifyPartySearch.toLowerCase()));

  // Items are the Proforma's own snapshot — its Total stays in sync with
  // them automatically, same pattern as Quotation/Order.
  const itemsTotal = items.reduce((sum, i) => sum + (parseLocaleNumber(i.total) || 0), 0);
  const [initialLoad, setInitialLoad] = useState(true);
  useEffect(() => {
    if (initialLoad) { setInitialLoad(false); return; }
    if (items.length > 0) setF(p => ({ ...p, total: itemsTotal.toFixed(2) }));
  }, [itemsTotal]);

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <>
      {itemModal !== null && (
        <ProductItemModal
          products={products}
          initial={editingItemIdx !== null ? items[editingItemIdx] : null}
          onSave={(item) => {
            if (editingItemIdx !== null) { updateItem(editingItemIdx, item); setEditingItemIdx(null); }
            else addItem(item);
          }}
          onProductSaved={(saved) => setProducts(prev => prev.some(p => p.id === saved.id) ? prev.map(p => p.id === saved.id ? saved : p) : [...prev, saved])}
          onClose={() => { setItemModal(null); setEditingItemIdx(null); }}
        />
      )}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Linked Order" half>
        <Select value={f.order_id} onChange={set("order_id")}>
          <option value="">None</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} – {o.client}</option>)}
        </Select>
      </Field>
      <Field label="Proforma Number" half><Input value={f.number} onChange={set("number")} placeholder="PI-2024-001" /></Field>
      <Field label="Client" half>
        <div style={{ position: "relative" }}>
          <Input value={clientSearch}
            onChange={e => { setClientSearch(e.target.value); setF(p => ({ ...p, client: e.target.value })); setShowClientList(true); }}
            onFocus={() => setShowClientList(true)}
            onBlur={() => setTimeout(() => setShowClientList(false), 200)}
            placeholder="Search client…" />
          {showClientList && filteredClients.length > 0 && (
            <div style={dropdownStyle}>
              {filteredClients.map(c => (
                <div key={c.id} style={dropItemStyle}
                  onMouseDown={() => { setClientSearch(c.company_name); setF(p => ({ ...p, client: c.company_name })); setShowClientList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {c.company_name}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>
      {/* Optional — leave both blank to keep the PDF's single combined
          "Importer / Consignee / Notify Party" box (all three = the Client
          above). Filling either one in splits the PDF into separate labeled
          boxes instead — and if two roles end up pointing at the same
          client, the PDF still merges them back into one box with a
          combined heading (e.g. "Importer / Notify Party") instead of
          printing the same address twice. Kept right next to Client so all
          three "who this document is for" fields read together. */}
      <Field label="Consignee (optional)" half>
        <div style={{ position: "relative" }}>
          <Input value={consigneeSearch}
            onChange={e => { setConsigneeSearch(e.target.value); setF(p => ({ ...p, consignee: e.target.value })); setShowConsigneeList(true); }}
            onFocus={() => setShowConsigneeList(true)}
            onBlur={() => setTimeout(() => setShowConsigneeList(false), 200)}
            placeholder="Search client… (leave blank to reuse Client)" />
          {showConsigneeList && filteredConsignees.length > 0 && (
            <div style={dropdownStyle}>
              {filteredConsignees.map(c => (
                <div key={c.id} style={dropItemStyle}
                  onMouseDown={() => { setConsigneeSearch(c.company_name); setF(p => ({ ...p, consignee: c.company_name })); setShowConsigneeList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {c.company_name}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="Notify Party (optional)" half>
        <div style={{ position: "relative" }}>
          <Input value={notifyPartySearch}
            onChange={e => { setNotifyPartySearch(e.target.value); setF(p => ({ ...p, notify_party: e.target.value })); setShowNotifyPartyList(true); }}
            onFocus={() => setShowNotifyPartyList(true)}
            onBlur={() => setTimeout(() => setShowNotifyPartyList(false), 200)}
            placeholder="Search client… (leave blank to reuse Client)" />
          {showNotifyPartyList && filteredNotifyParties.length > 0 && (
            <div style={dropdownStyle}>
              {filteredNotifyParties.map(c => (
                <div key={c.id} style={dropItemStyle}
                  onMouseDown={() => { setNotifyPartySearch(c.company_name); setF(p => ({ ...p, notify_party: c.company_name })); setShowNotifyPartyList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {c.company_name}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="Issue Date" half><Input type="date" value={f.issue_date} onChange={set("issue_date")} /></Field>
      <Field label="Validity Date" half><Input type="date" value={f.validity} onChange={set("validity")} /></Field>

      <Field label="Products">
        <div style={{ background: "#1e293b", borderRadius: "8px", border: "1px solid #334155", overflow: "hidden" }}>
          {items.length === 0 && (
            <div style={{ padding: "12px 14px", color: "#475569", fontSize: "13px" }}>No products added yet.</div>
          )}
          {items.map((item, idx) => {
            const product = products.find(p => Number(p.id) === Number(item.product_id));
            return (
              <div key={idx} style={{ padding: "10px 14px", borderBottom: "1px solid #0f172a" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ flex: 1, fontSize: "13px" }}>
                    <span style={{ color: "#60a5fa", fontFamily: "monospace", fontSize: "11px" }}>{item.product_code}</span>
                    <span style={{ color: "#f1f5f9", marginLeft: "6px" }}>{item.product_name}</span>
                    <span style={{ color: "#64748b", marginLeft: "8px" }}>{displayQtyUnit(item)}</span>
                  </div>
                  <Btn small outline color="#64748b" onClick={() => { setEditingItemIdx(idx); setItemModal("edit"); }}>Edit</Btn>
                  <Btn small outline color="#ef4444" onClick={() => removeItem(idx)}>✕</Btn>
                </div>
                <PricingRow item={item} product={product} currency={item.currency || f.currency}
                  onChange={updated => updateItem(idx, updated)} />
              </div>
            );
          })}
          <div style={{ padding: "10px 14px" }}>
            <Btn small color="#3b82f6" onClick={() => { setEditingItemIdx(null); setItemModal("new"); }}>+ Add Product</Btn>
          </div>
        </div>
      </Field>

      {items.length > 0 && (
        <div style={{ gridColumn: "span 2", background: "#0f172a", borderRadius: "8px", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#64748b", fontSize: "13px" }}>Items Total</span>
          <span style={{ color: "#10b981", fontWeight: 700, fontSize: "18px" }}>{fmt(itemsTotal, f.currency)}</span>
        </div>
      )}

      <Field label="Total Amount" half>
  <input value={f.total} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
</Field>
<Field label="Currency" half>
  <Select value={f.currency} onChange={e => {
    const cur = e.target.value;
    setF(p => ({ ...p, currency: cur }));
    setItems(prev => prev.map(i => ({ ...i, currency: cur })));
  }}>
    {["USD","EUR","BRL","CNY","HKD"].map(c => <option key={c} value={c}>{currencyLabel(c)}</option>)}
  </Select>
</Field>
      {/* CIF freight charged to the client, on top of the goods themselves —
          shown as its own line on the Proforma/Commercial Invoice PDFs, and
          counted as ordinary revenue in the Order Profitability report. */}
      <Field label={`Freight Value (${currencyLabel(f.currency)})`} half>
        <Input type="text" inputMode="decimal" value={f.freight_value || ""}
          onChange={e => setF(p => ({ ...p, freight_value: maskMoney(e.target.value) }))} placeholder="0.00" />
      </Field>
      <Field label="Status" half>
        <Select value={f.status} onChange={set("status")}>
          {["Draft","Sent","Accepted","Rejected"].map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <div style={{ gridColumn: "span 2", marginTop: "4px", marginBottom: "-4px", fontSize: "12px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {t("Shipment Details (for PDF)")}
      </div>
      <Field label="Acquisition Company" half>
        <Select value={f.acquisition_company} onChange={set("acquisition_company")} disabled={!!f.order_id}>
          <option value="">Select...</option>
          <option value="HK">HONG KONG ALLIANCE GLOBAL TRADING CO., LTD</option>
          <option value="NINGBO">NINGBO WORLD ALLIANCE TRADING. CO. LTD.</option>
        </Select>
        {f.order_id && (
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
            {t("Locked to the linked Order's Acquisition Company — change it on the Order to update this.")}
          </div>
        )}
      </Field>
      <Field label="Incoterm" half>
        <Select value={f.incoterm} onChange={set("incoterm")}>
          <option value="">Select...</option>
          {["FOB","CIF","CFR","EXW","DAP","DDP","FCA"].map(t => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Way of Shipment" half>
        <Select value={f.way_of_shipment} onChange={set("way_of_shipment")}>
          <option>By Sea</option><option>By Air</option><option>By Land</option>
        </Select>
      </Field>
      {/* By Air switches both fields to airport lists/labels instead of sea
          ports — an air shipment's "Port of Loading" would otherwise show
          Ningbo/Shanghai etc., which don't mean anything for air freight. */}
      <Field label={f.way_of_shipment === "By Air" ? "Airport of Loading" : "Port of Loading"} half>
        <PortAutocomplete value={f.port_of_loading} options={f.way_of_shipment === "By Air" ? CHINA_AIRPORTS_OPTIONS : CHINA_PORTS_OPTIONS}
          onChange={v => setF(p => ({ ...p, port_of_loading: v }))}
          placeholder={f.way_of_shipment === "By Air" ? "Search China airports or type any…" : "Search China ports or type any…"} />
      </Field>
      <Field label={f.way_of_shipment === "By Air" ? "Airport of Discharge" : "Port of Discharge"} half>
        <PortAutocomplete value={f.port_of_discharge} options={f.way_of_shipment === "By Air" ? BRAZIL_AIRPORTS_OPTIONS : BRAZIL_PORTS_OPTIONS}
          onChange={v => setF(p => ({ ...p, port_of_discharge: v }))}
          placeholder={f.way_of_shipment === "By Air" ? "Search Brazil airports or type any…" : "Search Brazil ports or type any…"} />
      </Field>

      <Field label="Payment Terms">
        <div style={{ position: "relative" }}>
          <Input value={f.payment_terms}
            onChange={e => { setF(p => ({ ...p, payment_terms: e.target.value })); setShowPaymentList(true); }}
            onFocus={() => setShowPaymentList(true)}
            onBlur={() => setTimeout(() => setShowPaymentList(false), 200)}
            placeholder="Search or type payment terms…" />
          {showPaymentList && filteredPayments.length > 0 && (
            <div style={PORT_DROPDOWN_STYLE}>
              {filteredPayments.map((pt, i) => (
                <div key={i} style={PORT_DROP_ITEM_STYLE}
                  onMouseDown={() => { setF(p => ({ ...p, payment_terms: pt })); setShowPaymentList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{pt}</div>
              ))}
            </div>
          )}
        </div>
      </Field>
      {/* Plain text, not a number input — usually just a day-count ("28"),
          which still prints as "28 days after TT payment." on the PDF (see
          daysOrNote in salesInvoice.js), but some deals need a full note
          here instead (e.g. "Depending on booking, please book at least 7
          days after production finish date."), which now prints as-is. */}
      <Field label="End of Production (days after TT payment, or a note)" half>
        <Input value={f.production_days || ""} onChange={set("production_days")} placeholder="28" />
      </Field>
      <Field label="Delivery at Port (days after TT payment, or a note)" half>
        <Input value={f.delivery_days || ""} onChange={set("delivery_days")} placeholder="33" />
      </Field>

      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        {f.id && <DocButtons url={authUrl(`${API}/proformas/${f.id}/pdf`)} filename={`Proforma-${f.number}.pdf`}
          xlsxUrl={authUrl(`${API}/proformas/${f.id}/xlsx`)} xlsxFilename={`Proforma-${f.number}.xlsx`}
          entityType="proformas" recordLabel={f.number} label="📄 Download" small={false} />}
        <Btn onClick={async () => {
          // Same BR-formatted-text cleanup as QuotationForm/OrderForm — the
          // items here go through the same PricingRow editor.
          const cleanedItems = items.map(item => ({
            ...item,
            total: item.total !== "" && item.total != null ? (parseLocaleNumber(item.total) ?? item.total) : item.total,
            unit_price: item.unit_price !== "" && item.unit_price != null ? (parseLocaleNumber(item.unit_price) ?? item.unit_price) : item.unit_price,
            sale_per_meter: item.sale_per_meter !== "" && item.sale_per_meter != null ? (parseLocaleNumber(item.sale_per_meter) ?? item.sale_per_meter) : item.sale_per_meter,
            sale_per_liter: item.sale_per_liter !== "" && item.sale_per_liter != null ? (parseLocaleNumber(item.sale_per_liter) ?? item.sale_per_liter) : item.sale_per_liter,
            sale_per_ton: item.sale_per_ton !== "" && item.sale_per_ton != null ? (parseLocaleNumber(item.sale_per_ton) ?? item.sale_per_ton) : item.sale_per_ton,
            sale_pct: item.sale_pct !== "" && item.sale_pct != null ? (parseLocaleNumber(item.sale_pct) ?? item.sale_pct) : item.sale_pct,
            target_price: item.target_price !== "" && item.target_price != null ? (parseLocaleNumber(item.target_price) ?? item.target_price) : item.target_price,
          }));
          await onSave({
            ...f,
            freight_value: f.freight_value !== "" && f.freight_value != null ? (parseLocaleNumber(f.freight_value) ?? f.freight_value) : f.freight_value,
            items: JSON.stringify(cleanedItems),
          });
          onClose();
        }}>Save Proforma</Btn>
      </div>
    </div>
    </>
  );
}

function ContractForm({ onSave, onClose, orders, initial }) {
  const [f, setF] = useState(initial || { order_id: "", contract_number: "", supplier: "", sign_date: "", delivery_date: "", total: "", currency: "USD", status: "Draft", notes: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Linked Order" half>
        <Select value={f.order_id} onChange={set("order_id")}>
          <option value="">None</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} – {o.client}</option>)}
        </Select>
      </Field>
      <Field label="Contract Number" half><Input value={f.contract_number} onChange={set("contract_number")} placeholder="PO-2024-001" /></Field>
      <Field label="Supplier" half><Input value={f.supplier} onChange={set("supplier")} /></Field>
      <Field label="Sign Date" half><Input type="date" value={f.sign_date} onChange={set("sign_date")} /></Field>
      <Field label="Delivery Date" half><Input type="date" value={f.delivery_date} onChange={set("delivery_date")} /></Field>
      <Field label="Total Amount" half>
        <input value={f.total} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
      </Field>
      <Field label="Currency" half>
        <input value={currencyLabel(f.currency)} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
      </Field>
      <Field label="Status" half>
        <Select value={f.status} onChange={set("status")}>
          {["Draft","Signed","In Force","Completed","Cancelled"].map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>

      {(f._items || (f.items_json ? JSON.parse(f.items_json) : [])).length > 0 && (
        <div style={{ gridColumn: "span 2", background: "#0f172a", borderRadius: "8px", padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Products in this contract</span>
            <span style={{ color: "#10b981", fontWeight: 700, fontSize: "15px" }}>{fmt(parseFloat(f.total), f.currency)}</span>
          </div>
          {(f._items || (f.items_json ? JSON.parse(f.items_json) : [])).map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1e293b", fontSize: "13px" }}>
              <div>
                <span style={{ color: "#60a5fa", fontFamily: "monospace", fontSize: "11px" }}>{item.product_code}</span>
                <span style={{ color: "#f1f5f9", marginLeft: "8px", fontWeight: 600 }}>{item.product_name}</span>
                <span style={{ color: "#64748b", marginLeft: "8px" }}>{displayQtyUnit(item)}</span>
                {perMeterLabel(item, "cost_per_meter", item.cost_currency || item.currency) && (
                  <span style={{ color: "#a78bfa", marginLeft: "8px", fontSize: "11px" }}>({perMeterLabel(item, "cost_per_meter", item.cost_currency || item.currency)})</span>
                )}
              </div>
              <span style={{ color: "#10b981", fontWeight: 600 }}>{currencyLabel(item.cost_currency || item.currency)} {parseFloat(item.cost_price || item.unit_price).toFixed(2)} × {item.quantity} = {fmt(parseFloat((item.cost_price || item.unit_price) * item.quantity), item.cost_currency || item.currency)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave(f); }}>Save Contract</Btn>
      </div>
    </div>
  );
}
  
function FinForm({ type, onSave, onClose, orders, initial }) {
  const t = useT();
  const isClient = type === "client";
  const [f, setF] = useState(initial || {
    order_id: "", [isClient ? "client" : "supplier"]: "", description: "",
    type: isClient ? "Invoice" : "Purchase Order",
    amount: "", currency: "USD", due_date: "", status: "Pending", notes: "",
    payment_method: "Online bank payment", applicant: "", approved_by: "",
    payment_schedule: "100", paid_amount: "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const party = isClient ? "client" : "supplier";
  const txTypes = isClient
    ? ["Invoice", "Down Payment", "Balance", "Commission", "Refund"]
    : ["Purchase Order", "Deposit", "Final Payment", "Freight", "Other"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Linked Order" half>
        <Select value={f.order_id} onChange={e => {
          const orderId = e.target.value;
          // Currency always matches the linked Order's own registered
          // currency — no separate manual dropdown here anymore, so there's
          // no way for this record to end up in a different currency than
          // the deal it's actually part of.
          const linkedOrder = orders.find(o => String(o.id) === String(orderId));
          setF(p => ({ ...p, order_id: orderId, currency: linkedOrder?.currency || p.currency }));
        }}>
          <option value="">None</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} – {o.client}</option>)}
        </Select>
      </Field>
      <Field label={isClient ? "Client" : "Supplier"} half>
        <Input value={f[party]} onChange={set(party)} />
      </Field>
      <Field label="Type" half>
        <Select value={f.type} onChange={set("type")}>
          {txTypes.map(t => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Amount" half><Input type="text" inputMode="decimal" value={f.amount} onChange={e => setF(p => ({ ...p, amount: maskMoney(e.target.value) }))} /></Field>
      <Field label="Due Date" half><Input type="date" value={f.due_date} onChange={set("due_date")} /></Field>
      {/* Only meaningful with status "Partial" — how much of Amount has
          actually been paid so far, so the Cash Flow Pending/Paid summary
          cards can split the row between them instead of leaving the whole
          amount stuck in Pending regardless of what's actually been paid. */}
      {f.status === "Partial" && (
        <Field label="Amount Paid So Far" half>
          <Input type="text" inputMode="decimal" value={f.paid_amount} onChange={e => setF(p => ({ ...p, paid_amount: maskMoney(e.target.value) }))} />
        </Field>
      )}
      <Field label="Description">
        <Input value={f.description} onChange={set("description")} placeholder={!isClient ? "Contract-AGNB26.044" : ""} />
      </Field>
      {!isClient && (
        <>
          <div style={{ gridColumn: "span 2", marginTop: "4px", marginBottom: "-4px", fontSize: "12px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("Payment Notice")}
          </div>
          {/* No Payer field — supplier payments always run through Ningbo
              now (see NINGBO_ACQ in server.js), so there's nothing to pick. */}
          <Field label="Payment Method" half>
            <Select value={f.payment_method} onChange={set("payment_method")}>
              <option value="Online bank payment">Online bank payment</option>
              <option value="Wire transfer">Wire transfer</option>
            </Select>
          </Field>
          <Field label="Applicant" half><Input value={f.applicant} onChange={set("applicant")} /></Field>
          <Field label="Approved By" half><Input value={f.approved_by} onChange={set("approved_by")} /></Field>
          <Field label="Payment Schedule" half>
            <Select value={f.payment_schedule || "100"} onChange={set("payment_schedule")}>
              {Object.entries(PAYMENT_SCHEDULES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
        </>
      )}
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        {/* Each installment in the chosen schedule (e.g. 20% Deposit / 80%
            Balance) gets its own Payment Notice button — a single 100%
            schedule falls back to the one plain button it had before.
            Generates an Excel file, not a PDF. */}
        {!isClient && f.id && (PAYMENT_SCHEDULES[f.payment_schedule || "100"] || PAYMENT_SCHEDULES["100"]).parts.map((part, i) => (
          <DocButtons key={i}
            url={authUrl(`${API}/financial/suppliers/${f.id}/payment-notice-xlsx${part.label ? `?pct=${part.pct}&label=${encodeURIComponent(part.label)}` : ""}`)}
            filename={`PaymentNotice-${f.description || f.supplier || f.id}${part.label ? `-${part.label}` : ""}.xlsx`}
            entityType="financial-suppliers" recordLabel={f.description || f.supplier}
            documentLabel={part.label ? `Payment Notice — ${part.label} (${part.pct}%)` : "Payment Notice"}
            label={<>📊 {part.label ? `${part.label} (${part.pct}%)` : t("Payment Notice")}</>} small={false} />
        ))}
        <Btn color={isClient ? "#3b82f6" : "#8b5cf6"} onClick={async () => {
          // Amount/Amount Paid display with live thousands-separator
          // formatting (see maskMoney) while editing — convert back to
          // plain numbers here so the backend's REAL columns get an actual
          // number, not a "1.225,60"-style formatted string.
          await onSave({
            ...f,
            amount: parseLocaleNumber(f.amount) ?? 0,
            paid_amount: f.paid_amount !== "" && f.paid_amount != null ? (parseLocaleNumber(f.paid_amount) ?? 0) : f.paid_amount,
          });
          onClose();
        }}>Save</Btn>
      </div>
    </div>
  );
}

function QuotationForm({ onSave, onClose, initial }) {
  const t = useT();
  const [f, setF] = useState(initial || {
  number: "", client: "", currency: "USD", deadline: "", price_validity: "",
  acquisition_company: "",
  port_of_loading: "", port_of_discharge: "",
  freight_value: "",
  total: "",
  specifications: "", notes: "", status: "Pending",
});
  const [items, setItems] = useState(Array.isArray(initial?.items) ? initial.items : []);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState(initial?.client || "");
  const [showClientList, setShowClientList] = useState(false);
  const [products, setProducts] = useState([]);
  const [media, setMedia] = useState(() => {
  if (!initial?.media) return [];
  let parsed = initial.media;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(item => typeof item === 'string' ? { url: item, name: item.split('/').pop() } : item);
});
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  useEscapeToClose(!!lightbox, () => setLightbox(null));
  const [itemModal, setItemModal] = useState(null);
  const [editingItemIdx, setEditingItemIdx] = useState(null);

  useEffect(() => {
    api("/clients").then(setClients);
    api("/products").then(setProducts);
  }, []);

  // Auto-generate the next sequential Quotation Number for new quotations —
  // same convention as Product Code (ProductForm): look at every purely-
  // numeric number already registered, take the highest, add one, zero-pad
  // to 3 digits. Never overwrites an existing quotation's number when
  // editing, and still fully editable afterwards (e.g. to the client's own
  // compound reference format) same as Product Code is.
  useEffect(() => {
    if (initial && initial.number) return;
    api("/quotations").then(quotations => {
      const maxNum = (quotations || []).reduce((max, q) => {
        const match = String(q.number || "").trim().match(/^(\d+)$/);
        if (!match) return max;
        return Math.max(max, parseInt(match[1], 10));
      }, 0);
      const next = String(maxNum + 1).padStart(3, "0");
      setF(p => (p.number ? p : { ...p, number: next }));
    });
  }, []);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const itemsTotal = items.reduce((sum, i) => sum + (parseLocaleNumber(i.total) || 0), 0);
const [initialLoad, setInitialLoad] = useState(true);
useEffect(() => {
  if (initialLoad) { setInitialLoad(false); return; }
  if (items.length > 0) setF(p => ({ ...p, total: itemsTotal.toFixed(2) }));
}, [itemsTotal]);

  const addItem = (item) => setItems(prev => [...prev, item]);
  const updateItem = (idx, item) => setItems(prev => { const u = [...prev]; u[idx] = item; return u; });
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  // Same "refresh from registered product" pair as OrderForm — see its
  // comments for the full rationale. Only works for items linked to a real
  // product (item.product_id set); freehand-typed items have nothing to
  // refresh from.
  const refreshItem = async (idx) => {
    const item = items[idx];
    if (!item.product_id) return;
    try {
      const fresh = await api(`/products/${item.product_id}`);
      updateItem(idx, applyProductToItem(fresh, item));
    } catch {
      alert(t("Could not refresh this item — the registered product may have been deleted."));
    }
  };
  const refreshAllItems = async () => {
    const freshProducts = await api("/products");
    setProducts(freshProducts);
    items.forEach((item, idx) => {
      if (!item.product_id) return;
      const fresh = freshProducts.find(p => Number(p.id) === Number(item.product_id));
      if (fresh) updateItem(idx, applyProductToItem(fresh, item));
    });
  };

  const filteredClients = clients.filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()));

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    setUploading(true);
    try {
const results = await Promise.all(files.map(uploadToCloudinary));
setMedia(prev => [...prev, ...results.filter(Boolean)]);
    } catch(err) { alert(t("Upload failed: ") + err.message); }
    setUploading(false);
  };

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <>
      {itemModal !== null && (
        <ProductItemModal
          products={products}
          initial={editingItemIdx !== null ? items[editingItemIdx] : null}
          showTargetPrice
          onSave={(item) => {
            if (editingItemIdx !== null) { updateItem(editingItemIdx, item); setEditingItemIdx(null); }
            else addItem(item);
          }}
          onProductSaved={(saved) => setProducts(prev => prev.some(p => p.id === saved.id) ? prev.map(p => p.id === saved.id ? saved : p) : [...prev, saved])}
          onClose={() => { setItemModal(null); setEditingItemIdx(null); }}
        />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <Field label="Number" half><Input value={f.number} onChange={set("number")} placeholder="QT-2024-001" /></Field>
        <Field label="Status" half>
          <Select value={f.status} onChange={set("status")}>
            {["Pending","Sent","Received","Accepted","Rejected"].map(s => <option key={s}>{s}</option>)}
          </Select>
        </Field>

        <Field label="Client" half>
          <div style={{ position: "relative" }}>
            <Input value={clientSearch}
              onChange={e => { setClientSearch(e.target.value); setF(p => ({ ...p, client: e.target.value })); setShowClientList(true); }}
              onFocus={() => setShowClientList(true)}
              onBlur={() => setTimeout(() => setShowClientList(false), 200)}
              placeholder="Search client…" />
            {showClientList && filteredClients.length > 0 && (
              <div style={dropdownStyle}>
                {filteredClients.map(c => (
                  <div key={c.id} style={dropItemStyle}
                    onMouseDown={() => { setClientSearch(c.company_name); setF(p => ({ ...p, client: c.company_name })); setShowClientList(false); }}
                    onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {c.company_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>

        {/* Which trading entity this quote is under — same field as
            Proforma/Order, carried straight over when "Generate Proforma"
            is used, so it doesn't need re-picking for a deal already
            scoped here. */}
        <Field label="Acquisition Company" half>
          <Select value={f.acquisition_company} onChange={set("acquisition_company")}>
            <option value="">Select...</option>
            <option value="HK">HONG KONG ALLIANCE GLOBAL TRADING CO., LTD</option>
            <option value="NINGBO">NINGBO WORLD ALLIANCE TRADING. CO. LTD.</option>
          </Select>
        </Field>

        <Field label="Deadline" half><Input type="date" value={f.deadline} onChange={set("deadline")} /></Field>
        {/* Left column keeps stacking straight down from here (Port of
            Loading then Port of Discharge, right below Client/Deadline)
            while Price Validity fills the right column alongside them —
            requested this way instead of the ports trailing off after
            Price Validity, which left one of the two stranded alone on its
            own row. */}
        <Field label="Port of Loading" half>
          <PortAutocomplete value={f.port_of_loading} options={CHINA_PORTS_OPTIONS}
            onChange={v => setF(p => ({ ...p, port_of_loading: v }))}
            placeholder="Search China ports or type any…" />
        </Field>
        <Field label="Price Validity" half><Input type="date" value={f.price_validity || ""} onChange={set("price_validity")} /></Field>
        <Field label="Port of Discharge" half>
          <PortAutocomplete value={f.port_of_discharge} options={BRAZIL_PORTS_OPTIONS}
            onChange={v => setF(p => ({ ...p, port_of_discharge: v }))}
            placeholder="Search Brazil ports or type any…" />
        </Field>
        {/* CIF freight charged to the client, on top of the goods themselves
            — shown as its own line on the Quotation PDF and carried into
            the Proforma/Order once generated from here. */}
        <Field label={`Freight Value (${currencyLabel(f.currency)})`} half>
          <Input type="text" inputMode="decimal" value={f.freight_value || ""}
            onChange={e => setF(p => ({ ...p, freight_value: maskMoney(e.target.value) }))} placeholder="0.00" />
        </Field>

        <Field label="Products">
          <div style={{ background: "#1e293b", borderRadius: "8px", border: "1px solid #334155", overflow: "hidden" }}>
            {items.length === 0 && (
              <div style={{ padding: "12px 14px", color: "#475569", fontSize: "13px" }}>No products added yet.</div>
            )}
            {items.map((item, idx) => {
              const product = products.find(p => Number(p.id) === Number(item.product_id));
              const onTargetField = (e) => updateItem(idx, { ...item, target_price: e.target.value });
              const onTargetUnitField = (e) => updateItem(idx, { ...item, target_price_unit: e.target.value });
              return (
                <div key={idx} style={{ padding: "10px 14px", borderBottom: "1px solid #0f172a" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ flex: 1, fontSize: "13px" }}>
                      <span style={{ color: "#60a5fa", fontFamily: "monospace", fontSize: "11px" }}>{item.product_code}</span>
                      <span style={{ color: "#f1f5f9", marginLeft: "6px" }}>{item.product_name}</span>
                      <span style={{ color: "#64748b", marginLeft: "8px" }}>{displayQtyUnit(item)}</span>
                    </div>
                    {/* Pulls the current registered price/spec from the Product
                        record onto this item — disabled for items never linked
                        to a real product (typed freehand). */}
                    <Btn small color="#8857F6" disabled={!product}
                      title={product ? t("Refresh from registered product") : t("Not linked to a registered product")}
                      onClick={() => refreshItem(idx)}><RefreshIcon /></Btn>
                    <Btn small outline color="#64748b" onClick={() => { setEditingItemIdx(idx); setItemModal("edit"); }}>Edit</Btn>
                    <Btn small outline color="#ef4444" onClick={() => removeItem(idx)}>✕</Btn>
                  </div>
                  <PricingRow item={item} product={product} currency={item.currency || f.currency}
                    onChange={updated => updateItem(idx, updated)} />
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginTop: "8px" }}>
                    <label style={{ fontSize: "11px", color: "#64748b" }}>{t("Target Price (RMB)")}
                      <input type="text" inputMode="decimal" value={item.target_price ?? ""} onChange={onTargetField}
                        placeholder="0,00"
                        style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
                    </label>
                    <Select value={item.target_price_unit || "total"} onChange={onTargetUnitField}
                      style={{ padding: "6px 8px", fontSize: "12px", width: "auto" }}>
                      {targetPriceUnitOptions(item).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </div>
                </div>
              );
            })}
            <div style={{ padding: "10px 14px", display: "flex", gap: "8px" }}>
              <Btn small color="#3b82f6" onClick={() => { setEditingItemIdx(null); setItemModal("new"); }}>+ Add Product</Btn>
              {items.some(i => i.product_id) && (
                <Btn small color="#8857F6" onClick={refreshAllItems}><RefreshIcon /> {t("Update All")}</Btn>
              )}
            </div>
          </div>
        </Field>

        {items.length > 0 && (
  <div style={{ gridColumn: "span 2", background: "#0f172a", borderRadius: "8px", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <span style={{ color: "#64748b", fontSize: "13px" }}>Items Total</span>
    <span style={{ color: "#10b981", fontWeight: 700, fontSize: "18px" }}>{fmt(itemsTotal, f.currency)}</span>
  </div>
)}

        <Field label="Currency" half>
  <Select value={f.currency} onChange={e => {
    // The quotation's Currency is the one that ends up on the Proforma/PDF —
    // keep every item's own currency in sync with it, otherwise items stay
    // labeled in whatever currency their product was registered in while
    // the total silently gets relabeled with the new symbol (no real
    // conversion happens; this just keeps the numbers and labels honest).
    const cur = e.target.value;
    setF(p => ({ ...p, currency: cur }));
    setItems(prev => prev.map(i => ({ ...i, currency: cur })));
  }}>
    {["USD","EUR","BRL","CNY","HKD"].map(c => <option key={c} value={c}>{currencyLabel(c)}</option>)}
  </Select>
</Field>
<Field label="Specifications"><Textarea value={f.specifications || ""} onChange={set("specifications")} /></Field>
        <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>

        <Field label="Photos / Videos">
          <div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 16px", cursor: "pointer", fontSize: "13px", color: "#94a3b8", marginBottom: "12px" }}>
              {uploading ? t("⏳ Uploading...") : t("📎 Add Photos / Videos")}
              <input type="file" multiple accept="image/*,video/*" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
            </label>
            {lightbox && (
              <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                {lightbox.match(/\.(mp4|mov|avi|webm)$/i) ? (
                  <video src={lightbox} controls style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px" }} onClick={e => e.stopPropagation()} />
                ) : (
                  <img src={lightbox} style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px", objectFit: "contain" }} alt="" onClick={e => e.stopPropagation()} />
                )}
                <button onClick={() => setLightbox(null)} style={{ position: "fixed", top: "20px", right: "20px", background: "#ef4444", border: "none", borderRadius: "50%", width: "36px", height: "36px", color: "#fff", fontSize: "18px", cursor: "pointer" }}>✕</button>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {media.filter(Boolean).map((item, i) => {
  const url = typeof item === 'string' ? item : item.url;
  const name = typeof item === 'string' ? url.split('/').pop() : item.name;
  return (
    <div key={i} style={{ position: "relative" }}>
      {url.match(/\.pdf$/i) || name.match(/\.pdf$/i) ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "80px", height: "80px", background: "#1e293b", borderRadius: "6px", border: "1px solid #334155", color: "#f1f5f9", fontSize: "28px", textDecoration: "none" }}>📄</a>
      ) : url.match(/\.(mp4|mov|avi|webm)$/i) ? (
        <video src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} />
      ) : (
        <img src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} alt="" />
      )}
      <button onClick={async () => {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
      }} style={{ position: "absolute", bottom: "-6px", left: "-6px", background: "#3b82f6", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⬇</button>
      <button onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: "-6px", right: "-6px", background: "#ef4444", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
    </div>
  );
})}
            </div>
          </div>
        </Field>

        <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          {f.id && <DocButtons url={authUrl(`${API}/quotations/${f.id}/pdf`)} filename={`Quotation-${f.number}.pdf`}
            entityType="quotations" recordLabel={f.number} label="📄 Download PDF" small={false} />}
          <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
          <Btn onClick={async () => {
            // Normalize any BR-formatted text ("1.000,00") typed into the
            // inline Margin %/Value-per-Meter/Total fields into plain
            // numbers before saving, so downstream displays (which use
            // parseFloat) stay correct.
            const cleanedItems = items.map(item => ({
              ...item,
              total: item.total !== "" && item.total != null ? (parseLocaleNumber(item.total) ?? item.total) : item.total,
              unit_price: item.unit_price !== "" && item.unit_price != null ? (parseLocaleNumber(item.unit_price) ?? item.unit_price) : item.unit_price,
              sale_per_meter: item.sale_per_meter !== "" && item.sale_per_meter != null ? (parseLocaleNumber(item.sale_per_meter) ?? item.sale_per_meter) : item.sale_per_meter,
              sale_per_liter: item.sale_per_liter !== "" && item.sale_per_liter != null ? (parseLocaleNumber(item.sale_per_liter) ?? item.sale_per_liter) : item.sale_per_liter,
              sale_per_ton: item.sale_per_ton !== "" && item.sale_per_ton != null ? (parseLocaleNumber(item.sale_per_ton) ?? item.sale_per_ton) : item.sale_per_ton,
              sale_pct: item.sale_pct !== "" && item.sale_pct != null ? (parseLocaleNumber(item.sale_pct) ?? item.sale_pct) : item.sale_pct,
              target_price: item.target_price !== "" && item.target_price != null ? (parseLocaleNumber(item.target_price) ?? item.target_price) : item.target_price,
            }));
            await onSave({
              ...f,
              freight_value: f.freight_value !== "" && f.freight_value != null ? (parseLocaleNumber(f.freight_value) ?? f.freight_value) : f.freight_value,
              items: JSON.stringify(cleanedItems), media: JSON.stringify(media),
            });
            onClose();
          }}>Save Quotation</Btn>
        </div>
      </div>
    </>
  );
}
function Quotations() {
const t = useT();
const [proformas, setProformas] = useState([]);
const [proformaModal, setProformaModal] = useState(null);
const [editProforma, setEditProforma] = useState(null);
const [quotations, setQuotations] = useState([]);
const [modal, setModal] = useState(false);
const [editing, setEditing] = useState(null);
const [search, setSearch] = useState("");
const [orders, setOrders] = useState([]);
const [notify, setNotify] = useState(null);
  const load = useCallback(async () => {
  try {
    console.log('loading quotations...');
const [quotations, orders, proformas] = await Promise.all([
  api("/quotations"),
  api("/orders"),
  api("/proformas"),
]);
setProformas(proformas);
    setQuotations(quotations || []);
console.log('quotations set:', quotations?.length);
    setOrders(orders || []);
  } catch(e) {
    console.error('load error:', e);
  }
}, []);
    useEffect(() => { load(); }, [load]);
  
  const filtered = quotations.filter(q =>
    (q.number || "").toLowerCase().includes(search.toLowerCase()) ||
    (q.product_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (q.client || "").toLowerCase().includes(search.toLowerCase()) ||
    (q.status || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("Quotations")}</h2>
        <Btn onClick={() => setModal(true)}>+ New Quotation</Btn>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by number, product, client or status…" style={{ ...inputStyle, marginBottom: "16px" }} />
      {modal && (
        <Modal title={t("New Quotation")} onClose={() => setModal(false)} wide>
          <QuotationForm onSave={b => api("/quotations", "POST", b).then(() => {
            load();
            setNotify({ entityType: "quotations", recordLabel: b.number, eventType: "created" });
          })} onClose={() => setModal(false)} />
        </Modal>
      )}
      {editing && (
  <Modal title={t("Edit Quotation")} onClose={() => setEditing(null)} wide>
    <QuotationForm initial={{
      ...editing,
      items: editing.items ? (typeof editing.items === 'string' ? JSON.parse(editing.items) : editing.items) : [],
      media: editing.media ? (typeof editing.media === 'string' ? JSON.parse(editing.media) : editing.media) : [],
    }} onSave={async b => {
      const oldStatus = editing.status;
      await api(`/quotations/${editing.id}`, "PUT", b);
      load();
      if (b.status !== oldStatus) setNotify({ entityType: "quotations", recordLabel: b.number || editing.number, oldStatus, newStatus: b.status });
    }} onClose={() => setEditing(null)} />
  </Modal>
)}

      {proformaModal && (
  <Modal title={t("Generate Proforma")} onClose={() => setProformaModal(null)} wide>
    <ProformaForm
      orders={[]}
      initial={proformaModal}
      onSave={async b => {
        await api("/proformas", "POST", b);
        setProformaModal(null); load();
        setNotify({ entityType: "proformas", recordLabel: b.number, eventType: "created" });
      }}
      onClose={() => setProformaModal(null)}
    />
  </Modal>
)}
{editProforma && (
  <Modal title={t("Edit Proforma")} onClose={() => setEditProforma(null)} wide>
    <ProformaForm
      orders={[]}
      initial={editProforma}
      onSave={async b => {
        const oldStatus = editProforma.status;
        await api(`/proformas/${editProforma.id}`, "PUT", b);
        setEditProforma(null); load();
        if (b.status !== oldStatus) setNotify({ entityType: "proformas", recordLabel: b.number || editProforma.number, oldStatus, newStatus: b.status });
      }}
      onClose={() => setEditProforma(null)}
    />
  </Modal>
)}
{notify && <NotifyStatusChangeModal {...notify} onClose={() => setNotify(null)} />}
      <Table
        cols={[
          { label: "Number", sortValue: r => r.number, render: r => <span style={{ fontWeight: 700, color: "#60a5fa" }}>{r.number}</span> },
          { label: "Product", key: "product_name" },
          { label: "Client", key: "client" },
          { label: "Suppliers", sortValue: r => {
  try {
    const items = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
    const suppliers = [...new Set(items.map(i => i.supplier).filter(Boolean))];
    return suppliers.join(", ");
  } catch { return ""; }
}, render: r => {
  try {
    const items = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
    const suppliers = [...new Set(items.map(i => i.supplier).filter(Boolean))];
    return suppliers.length > 0 ? suppliers.join(", ") : "—";
  } catch { return "—"; }
}},
          { label: "Total", sortValue: r => {
  try {
    const items = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
    return items.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
  } catch { return null; }
}, render: r => {
  try {
    const items = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
    const total = items.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
    return total > 0 ? fmt(total, r.currency) : "—";
  } catch { return "—"; }
}},
          { label: "Deadline", sortValue: r => r.deadline, render: r => fmtDate(r.deadline) },
          { label: "Status", sortValue: r => r.status, render: r => (
            <Select value={r.status}
              onChange={async e => {
                const oldStatus = r.status, newStatus = e.target.value;
                await api(`/quotations/${r.id}`, "PUT", { ...r, status: newStatus }); load();
                setNotify({ entityType: "quotations", recordLabel: r.number, oldStatus, newStatus });
              }}
              style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}>
              {["Pending","Sent","Received","Accepted","Rejected"].map(s => <option key={s}>{s}</option>)}
            </Select>
          )},
         { label: "Actions", render: r => {
  const hasProforma = proformas.find(p => Number(p.quotation_id) === Number(r.id));
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      <Btn small color={hasProforma ? "#f59e0b" : "#475569"}
        onClick={() => hasProforma ? setEditProforma(hasProforma) : setProformaModal({
  quotation_id: r.id,
  order_id: null,
  // No "PI-" prefix and no random trailing digits — same reference number
  // as the Quotation it came from, matching every other document type.
  number: r.number,
          client: r.client || "",
          issue_date: new Date().toISOString().slice(0, 10),
          validity: "",
          total: r.total || "",
          currency: r.currency || "USD",
          status: "Draft",
          notes: r.notes || "",
          // Carried straight over from the Quotation instead of making
          // someone re-pick both ports a second time for a shipment that
          // was already scoped at the Quotation stage — still fully
          // editable afterwards like every other field here.
          acquisition_company: r.acquisition_company || "",
          port_of_loading: r.port_of_loading || "",
          port_of_discharge: r.port_of_discharge || "",
          // Same carry-over as the ports above — the CIF freight already
          // negotiated at Quotation stage.
          freight_value: r.freight_value || "",
          // Copy the Quotation's items in as the Proforma's own snapshot —
          // from this point on they're independently editable, same as how
          // Order items work once created from a Proforma.
          items: r.items || "[]",
        })}>
        📋 {hasProforma ? t("Proforma ✓") : t("Proforma")}
      </Btn>
      <DocButtons url={authUrl(`${API}/quotations/${r.id}/pdf`)} filename={`Quotation-${r.number}.pdf`}
        entityType="quotations" recordLabel={r.number} label="📄 PDF" />
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`/quotations/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
      <LastModifiedBy name={r.updated_by} />
    </div>
  );
}},
        ]}
        rows={filtered}
        emptyMsg="No quotations yet."
      />
    </div>
  );
}

// ─── SECTION COMPONENTS ───────────────────────────────────────────────────────

      
function Dashboard() {
  const t = useT();
  const [data, setData] = useState(null);
  useEffect(() => { api("/dashboard").then(setData); }, []);
  if (!data) return <div style={{ color: "#475569", padding: "40px", textAlign: "center" }}>{t("Loading...")}</div>;

  const orderStatuses = ["Pending", "In Production", "Inspection", "Shipment", "Completed"];
  const statusColors = { Pending: "#64748b", "In Production": "#3b82f6", Inspection: "#f59e0b", Shipment: "#10b981", Completed: "#8b5cf6" };
  const statusMap = Object.fromEntries(data.orderStats.map(s => [s.status, s]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* Order Status Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px" }}>
        {orderStatuses.map(status => (
          <StatCard key={status} label={status} value={statusMap[status]?.count || 0} color={statusColors[status]} />
        ))}
      </div>

      {/* Financial Cards — Client Receivables is Commercial Invoice status
          info in aggregate form, so accounts with hideCommercialStatus (see
          usePermissions) never get this card at all (the backend already
          sends clientFinancial: null for them, rather than real numbers). */}
      <div style={{ display: "grid", gridTemplateColumns: data.clientFinancial ? "1fr 1fr" : "1fr", gap: "16px" }}>
        {data.clientFinancial && (
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>💰 {t("Client Receivables")}</h3>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <StatCard label="Pending Invoices" value={data.clientFinancial?.pending || 0} color="#f59e0b" />
              <StatCard label="Paid Invoices" value={data.clientFinancial?.received || 0} color="#10b981" />
            </div>
          </div>
        )}
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>📦 {t("Supplier Payables")}</h3>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <StatCard label="Active Contracts" value={data.supplierFinancial?.pending || 0} color="#f59e0b" />
            <StatCard label="Completed" value={data.supplierFinancial?.paid || 0} color="#10b981" />
          </div>
        </div>
      </div>

      {/* Pending Orders */}
      {data.pendingOrders?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>📋 {t("Pending Orders")}</h3>
          <Table
            cols={[
              { label: "Order #", sortValue: r => r.order_number, render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.order_number}</span> },
              { label: "Client", key: "client" },
              { label: "Value", sortValue: r => r.value, render: r => fmt(r.value, r.currency) },
              { label: "Shipment", sortValue: r => r.shipment_date, render: r => fmtDate(r.shipment_date) },
            ]}
            rows={data.pendingOrders}
          />
        </div>
      )}

      {/* Pending Quotations */}
      {data.pendingQuotations?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>💬 {t("Pending Quotations")}</h3>
          <Table
            cols={[
              { label: "Number", sortValue: r => r.number, render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.number}</span> },
              { label: "Client", key: "client" },
              { label: "Total", sortValue: r => r.total, render: r => r.total ? fmt(r.total, r.currency) : "—" },
              { label: "Deadline", sortValue: r => r.deadline, render: r => fmtDate(r.deadline) },
            ]}
            rows={data.pendingQuotations}
          />
        </div>
      )}

      {/* Pending Commercial Invoices */}
      {data.pendingCommercials?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>🧾 {t("Pending Commercial Invoices")}</h3>
          <Table
            cols={[
              { label: "Number", sortValue: r => r.number, render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.number}</span> },
              { label: "Client", key: "client" },
              { label: "Total", sortValue: r => r.total, render: r => fmt(r.total, r.currency) },
              { label: "Issue Date", sortValue: r => r.issue_date, render: r => fmtDate(r.issue_date) },
            ]}
            rows={data.pendingCommercials}
          />
        </div>
      )}

      {/* Pending Inspections */}
      {data.pendingInspections?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>🔍 {t("Pending Inspections")}</h3>
          <Table
            cols={[
              { label: "Number", sortValue: r => r.number, render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.number}</span> },
              { label: "Inspector", key: "inspector" },
              { label: "Date", sortValue: r => r.inspection_date, render: r => fmtDate(r.inspection_date) },
            ]}
            rows={data.pendingInspections}
          />
        </div>
      )}

      {/* Pending Samples */}
      {data.pendingSamples?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>✏️ {t("Pending Samples")}</h3>
          <Table
            cols={[
              { label: "Product", sortValue: r => r.product_name, render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.product_name}</span> },
              { label: "Client", key: "client" },
              { label: "Requested Date", sortValue: r => r.requested_date, render: r => fmtDate(r.requested_date) },
            ]}
            rows={data.pendingSamples}
          />
        </div>
      )}

      {/* Pending Supplier Payments (Payment Notices not yet Paid) */}
      {data.pendingSupplierPayments?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>💳 {t("Pending Supplier Payments")}</h3>
          <Table
            cols={[
              { label: "Supplier", key: "supplier" },
              { label: "Description", key: "description" },
              { label: "Amount", sortValue: r => r.amount, render: r => <span style={{ fontWeight: 600, color: "#f59e0b" }}>{fmt(r.amount, r.currency)}</span> },
              { label: "Due Date", sortValue: r => r.due_date, render: r => fmtDate(r.due_date) },
              { label: "Status", key: "status" },
            ]}
            rows={data.pendingSupplierPayments}
          />
        </div>
      )}

      {/* Active Contracts */}
      {data.activeContracts?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>🤝 {t("Active Contracts")}</h3>
          <Table
            cols={[
              { label: "Contract #", sortValue: r => r.contract_number, render: r => <span style={{ fontWeight: 600, color: "#a78bfa" }}>{r.contract_number}</span> },
              { label: "Supplier", key: "supplier" },
              { label: "Total", sortValue: r => r.total, render: r => fmt(r.total, r.currency) },
              { label: "Status", key: "status" },
              { label: "Delivery", sortValue: r => r.delivery_date, render: r => fmtDate(r.delivery_date) },
            ]}
            rows={data.activeContracts}
          />
        </div>
      )}

    </div>
  );
}
      
function PackingListForm({ initial, onSave, onClose, onDelete }) {
  const t = useT();
  const [f, setF] = useState(() => {
    const rawItems = initial._items || (initial.items_json ? (() => { try { return JSON.parse(initial.items_json); } catch { return []; } })() : []);
    // Ton-priced Chemical items: Gross Weight must always equal Packages ×
    // the product's registered GROSS per-drum weight (gross_weight_per_package
    // — full drum, chemical + packaging; not tons_per_package, which is net
    // chemical only). Re-derive it here on every load — not just when
    // Packages is actively being edited — so a Packing List saved before
    // this rule existed (or saved mid-edit under an earlier, rate-preserving
    // or net/gross-confused version of it) always self-corrects the moment
    // it's reopened, instead of keeping whatever figure happened to be
    // stored.
    const items = rawItems.map(it => {
      if (!it.gross_weight_per_package) return it;
      const grossWeight = Math.round((parseFloat(it.roll) || 0) * it.gross_weight_per_package * 10) / 10;
      return { ...it, grossWeight };
    });
    const totalGrossWeight = items.reduce((s, i) => s + (parseFloat(i.grossWeight) || 0), 0);
    return {
      ...initial,
      _items: items,
      _containers: initial._containers || (initial.containers_json ? (() => { try { return JSON.parse(initial.containers_json); } catch { return []; } })() : []),
      total_gross_weight: Math.round(totalGrossWeight * 10) / 10,
    };
  });
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));

  // Freight Agent — same searchable "type or pick from the registered list"
  // pattern used for Client/Supplier elsewhere in the app. Just a text
  // snapshot on the packing list (like orders.supplier), not a foreign key,
  // so it still reads correctly even if the agent record changes later.
  const [freightAgents, setFreightAgents] = useState([]);
  const [agentSearch, setAgentSearch] = useState(initial.freight_agent || "");
  const [showAgentList, setShowAgentList] = useState(false);
  useEffect(() => { api("/freight-agents").then(setFreightAgents); }, []);
  const filteredAgents = freightAgents.filter(a => a.company_name.toLowerCase().includes(agentSearch.toLowerCase()));

  const applyTotals = (prev, items) => {
    const totals = items.reduce((acc, i) => ({
      totalLength: acc.totalLength + (parseFloat(i.totalLength) || 0),
      totalRoll: acc.totalRoll + (parseFloat(i.roll) || 0),
      totalGrossWeight: acc.totalGrossWeight + (parseFloat(i.grossWeight) || 0),
      totalNetWeight: acc.totalNetWeight + (parseFloat(i.netWeight) || 0),
      totalCbm: acc.totalCbm + (parseFloat(i.cbm) || 0),
    }), { totalLength: 0, totalRoll: 0, totalGrossWeight: 0, totalNetWeight: 0, totalCbm: 0 });
    return {
      ...prev, _items: items, items_json: JSON.stringify(items),
      total_length: totals.totalLength, total_roll: totals.totalRoll,
      total_gross_weight: totals.totalGrossWeight, total_net_weight: totals.totalNetWeight, total_cbm: totals.totalCbm,
    };
  };

  const updateItem = (idx, key, value) => {
    setF(prev => {
      const items = [...prev._items];
      items[idx] = { ...items[idx], [key]: value };
      return applyTotals(prev, items);
    });
  };

  // Editing Roll for one container's copy of a product used to just
  // overwrite that one row — nothing stopped the same product from showing
  // more total rolls across containers than the order actually has, which
  // read as "we're shipping more than what was ordered." Roll edits now
  // trade directly with the item's Container 01 row (its normal starting
  // point, per buildPackingListDraft's default) so the sum across every
  // container for that product always stays exactly at its total package
  // count. Editing Container 01 itself trades with Container 02 instead,
  // since there's no "container before 01" to draw from. Gross/Net Weight,
  // Total Length and CBM are then recomputed for both rows from a per-roll
  // rate derived off however they were already split (works whether that
  // came from the real roll-volume CBM or the capacity-share fallback).
  const updateItemRoll = (idx, rawValue) => {
    setF(prev => {
      const items = [...prev._items];
      const item = items[idx];

      const sameProduct = items.map((_, i) => i).filter(i => items[i].product_id === item.product_id);
      // Total physical package count for this product across every
      // container — derived from the roll values buildPackingListDraft
      // already set (real drum count for ton-priced Chemical, order
      // quantity for everything else), not item.quantity directly, since
      // for ton-priced Chemical that field holds tons ordered, not a
      // package count.
      const total = sameProduct.reduce((s, i) => s + (parseFloat(items[i].roll) || 0), 0);
      if (!total) { items[idx] = { ...item, roll: rawValue }; return applyTotals(prev, items); }

      const thisSeq = item.container_seq || 1;
      const partnerSeq = thisSeq !== 1 ? 1 : 2;
      const partnerIdx = sameProduct.find(i => (items[i].container_seq || 1) === partnerSeq);
      if (partnerIdx == null) { items[idx] = { ...item, roll: rawValue }; return applyTotals(prev, items); }

      // Per-roll rates, derived from the current split (sum of that field
      // across every container for this product ÷ the order quantity) —
      // self-correcting regardless of which CBM method produced the numbers.
      const sumField = (f) => sameProduct.reduce((s, i) => s + (parseFloat(items[i][f]) || 0), 0);
      const grossPerRoll = sumField("grossWeight") / total;
      const netPerRoll = sumField("netWeight") / total;
      const cbmPerRoll = sumField("cbm") / total;
      const lengthPerRoll = item.isTextile ? sumField("totalLength") / total : null;
      // Ton-priced Chemical: Gross Weight per container is recomputed
      // directly from Packages × the product's registered GROSS per-drum
      // weight (gross_weight_per_package — full drum, not tons_per_package,
      // which is the chemical alone) every time, instead of carrying
      // forward a "per-roll rate" — that rate can only stay exactly right
      // if it's never touched by an edit made under different numbers, and
      // any drift there would silently break "Packages × weight = Gross
      // Weight" (which is what should always be checkable at a glance).
      const perDrumWeightKg = item.gross_weight_per_package || null;

      const otherSum = sameProduct
        .filter(i => i !== idx && i !== partnerIdx)
        .reduce((s, i) => s + (parseFloat(items[i].roll) || 0), 0);
      const clampMax = Math.max(0, total - otherSum);
      let newRoll = parseFloat(String(rawValue).replace(",", "."));
      if (isNaN(newRoll)) newRoll = 0;
      newRoll = Math.max(0, Math.min(clampMax, newRoll));
      const partnerNewRoll = Math.max(0, total - otherSum - newRoll);

      const applyRow = (i, roll) => {
        items[i] = {
          ...items[i],
          roll,
          grossWeight: perDrumWeightKg != null
            ? Math.round(roll * perDrumWeightKg * 10) / 10
            : Math.round(grossPerRoll * roll * 10) / 10,
          netWeight: Math.round(netPerRoll * roll * 10) / 10,
          cbm: Math.round(cbmPerRoll * roll * 100) / 100,
          totalLength: lengthPerRoll != null ? Math.round(lengthPerRoll * roll * 100) / 100 : items[i].totalLength,
        };
      };
      applyRow(idx, newRoll);
      applyRow(partnerIdx, partnerNewRoll);

      return applyTotals(prev, items);
    });
  };

  const updateContainerCode = (seq, code) => {
    setF(prev => {
      const containers = (prev._containers || []).map(c => c.seq === seq ? { ...c, code } : c);
      return { ...prev, _containers: containers, containers_json: JSON.stringify(containers) };
    });
  };

  const miniInput = { ...inputStyle, padding: "5px 8px", fontSize: "12px", width: "72px", textAlign: "right" };

  // Multi-container allocation: group the flat item list by container_seq so
  // each container gets its own "Container 0N — Code" block with just its
  // slice of the items, still editable per-item exactly like the
  // single-container view. Falls back to the plain flat list when there's
  // only one container (or none set up — older Packing Lists).
  const containers = f._containers || [];
  const isMultiContainer = containers.length > 1;
  const items = f._items || [];

  const renderItemRow = (item, idx) => (
    <div key={idx} style={{ padding: "10px 14px", borderBottom: "1px solid #1e293b" }}>
      <div style={{ fontSize: "13px", color: "#f1f5f9", marginBottom: "6px" }}>
        <strong>{item.description}</strong>
        <span style={{ color: "#64748b", marginLeft: "8px" }}>
          {item.color} {item.width} {item.weightSpec}
          {item.isTextile
            ? ` · ${t("Length:")} ${parseFloat(item.totalLength || 0).toFixed(2)} m`
            : (item.quantityLabel
                ? ` · ${t("Qty:")} ${item.quantityLabel}`
                : (item.quantity != null ? ` · ${t("Qty:")} ${item.quantity} ${item.unit || ""}` : ""))}
        </span>
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <label style={{ fontSize: "11px", color: "#64748b" }}>{item.isTextile ? t("Roll") : t("Packages")}
          <input type="number" value={item.roll} onChange={e => updateItemRoll(idx, e.target.value)} style={{ ...miniInput, display: "block", marginTop: "2px" }} />
        </label>
        <label style={{ fontSize: "11px", color: "#64748b" }}>{t("Gross Weight (kg)")}
          <input type="number" value={item.grossWeight} onChange={e => updateItem(idx, "grossWeight", e.target.value)} style={{ ...miniInput, display: "block", marginTop: "2px" }} />
        </label>
        <label style={{ fontSize: "11px", color: "#64748b" }}>{t("Net Weight (kg)")}
          <input type="number" value={item.netWeight} onChange={e => updateItem(idx, "netWeight", e.target.value)} style={{ ...miniInput, display: "block", marginTop: "2px" }} />
        </label>
        <label style={{ fontSize: "11px", color: "#64748b" }}>{t("CBM")}
          <input type="number" value={item.cbm} onChange={e => updateItem(idx, "cbm", e.target.value)} style={{ ...miniInput, display: "block", marginTop: "2px" }} />
        </label>
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Number" half><Input value={f.number} onChange={set("number")} /></Field>
      <Field label="Date" half><Input type="date" value={f.date} onChange={set("date")} /></Field>
      <Field label="Loading Date" half><Input type="date" value={f.loading_date || ""} onChange={set("loading_date")} /></Field>
      <Field label="Way of Shipment" half>
        <Select value={f.way_of_shipment} onChange={set("way_of_shipment")}>
          <option>By Sea</option><option>By Air</option><option>By Land</option>
        </Select>
      </Field>
      <Field label="Incoterm" half><Input value={f.incoterm} onChange={set("incoterm")} /></Field>
      <Field label="Port of Origin" half><Input value={f.port_of_origin} onChange={set("port_of_origin")} /></Field>
      <Field label="Port of Destination" half><Input value={f.port_of_destination} onChange={set("port_of_destination")} /></Field>
      <Field label="Manufacturer" half><Input value={f.manufacturer} onChange={set("manufacturer")} /></Field>
      <Field label="Manufacturer Address" half><Input value={f.manufacturer_address} onChange={set("manufacturer_address")} /></Field>

      {/* Freight Agent + costs — informational only, never printed on this
          document's own PDF (see server.js's renderPackingList call); they
          only ever surface back on the Order's own report. */}
      <Field label="Freight Agent" half>
        <div style={{ position: "relative" }}>
          <Input
            value={agentSearch}
            onChange={e => { setAgentSearch(e.target.value); setF(p => ({ ...p, freight_agent: e.target.value })); setShowAgentList(true); }}
            onFocus={() => setShowAgentList(true)}
            onBlur={() => setTimeout(() => setShowAgentList(false), 200)}
            placeholder="Search or type freight agent…"
          />
          {showAgentList && filteredAgents.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
              background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
              maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}>
              {filteredAgents.map(a => (
                <div key={a.id} style={{ padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1", borderBottom: "1px solid #0f172a" }}
                  onMouseDown={() => { setAgentSearch(a.company_name); setF(p => ({ ...p, freight_agent: a.company_name })); setShowAgentList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {a.company_name}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>
      {/* Plain number inputs (not the BR-masked money fields used elsewhere
          in the app) — matches how every other cost/weight figure already
          on this specific form (Gross/Net Weight, CBM) is entered, and
          avoids sending a comma-formatted display string somewhere that
          only ever expects a clean parseable number. Each cost gets its own
          currency picker right next to it — the agent's fee, the freight
          rate and a local loading fee are often quoted in different
          currencies, and this feeds the Order's real-profit calculation
          (see computeOrderProfitability in server.js), which needs to know
          which currency each figure is actually in to convert correctly. */}
      <Field label="Agent Cost" half>
        <div style={{ display: "flex", gap: "8px" }}>
          <Input type="number" value={f.agent_cost || ""} onChange={set("agent_cost")} placeholder="0.00" style={{ flex: 1 }} />
          <Select value={f.agent_currency || "USD"} onChange={set("agent_currency")} style={{ width: "90px", flexShrink: 0 }}>
            {PACKING_COST_CURRENCIES.map(c => <option key={c} value={c}>{currencyLabel(c)}</option>)}
          </Select>
        </div>
      </Field>
      <Field label="Freight Cost" half>
        <div style={{ display: "flex", gap: "8px" }}>
          <Input type="number" value={f.freight_cost || ""} onChange={set("freight_cost")} placeholder="0.00" style={{ flex: 1 }} />
          <Select value={f.freight_currency || "USD"} onChange={set("freight_currency")} style={{ width: "90px", flexShrink: 0 }}>
            {PACKING_COST_CURRENCIES.map(c => <option key={c} value={c}>{currencyLabel(c)}</option>)}
          </Select>
        </div>
      </Field>
      <Field label="Loading Cost" half>
        <div style={{ display: "flex", gap: "8px" }}>
          <Input type="number" value={f.loading_cost || ""} onChange={set("loading_cost")} placeholder="0.00" style={{ flex: 1 }} />
          <Select value={f.loading_currency || "USD"} onChange={set("loading_currency")} style={{ width: "90px", flexShrink: 0 }}>
            {PACKING_COST_CURRENCIES.map(c => <option key={c} value={c}>{currencyLabel(c)}</option>)}
          </Select>
        </div>
      </Field>

      {!isMultiContainer && containers.length === 1 && (
        // Single container: still worth capturing its code (shows at the top
        // of the Packing List/CI), just without the full allocation UI.
        <Field label="Container Code" half>
          <Input value={containers[0].code || ""} onChange={e => updateContainerCode(containers[0].seq, e.target.value)} placeholder="e.g. OOCU7979442" />
        </Field>
      )}

      <Field label={isMultiContainer ? "Items — allocated per container" : "Items — Roll / Gross Weight / Net Weight / CBM"}>
        <div style={{ display: "flex", flexDirection: "column", gap: isMultiContainer ? "12px" : 0 }}>
          {items.length === 0 && (
            <div style={{ background: "#0f172a", borderRadius: "8px", border: "1px solid #334155", padding: "12px 14px", color: "#475569", fontSize: "13px" }}>{t("No items.")}</div>
          )}
          {isMultiContainer ? (
            containers.map(c => {
              const indices = items.map((it, i) => i).filter(i => (items[i].container_seq || 1) === c.seq);
              if (indices.length === 0) return null;
              return (
                <div key={c.seq} style={{ background: "#0f172a", borderRadius: "8px", border: "1px solid #334155", overflow: "hidden" }}>
                  <div style={{ background: "#1e293b", padding: "8px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {t("Container")} {String(c.seq).padStart(2, "0")}
                    </span>
                    <Input value={c.code || ""} onChange={e => updateContainerCode(c.seq, e.target.value)}
                      placeholder="Container code, e.g. OOCU7979442" style={{ ...inputStyle, flex: 1, padding: "6px 10px", fontSize: "13px" }} />
                  </div>
                  {indices.map(idx => renderItemRow(items[idx], idx))}
                </div>
              );
            })
          ) : (
            <div style={{ background: "#0f172a", borderRadius: "8px", border: "1px solid #334155", overflow: "hidden" }}>
              {items.map((item, idx) => renderItemRow(item, idx))}
            </div>
          )}
        </div>
      </Field>

      <div style={{ gridColumn: "span 2", background: "#0f172a", borderRadius: "8px", padding: "12px 16px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", fontSize: "13px", color: "#94a3b8" }}>
        <span>Total Length: <strong style={{ color: "#f1f5f9" }}>{(parseFloat(f.total_length) || 0).toFixed(2)} m</strong></span>
        <span>Total Roll: <strong style={{ color: "#f1f5f9" }}>{f.total_roll}</strong></span>
        <span>Gross Weight: <strong style={{ color: "#f1f5f9" }}>{f.total_gross_weight} kg</strong></span>
        <span>Net Weight: <strong style={{ color: "#f1f5f9" }}>{f.total_net_weight} kg</strong></span>
        <span>CBM: <strong style={{ color: "#f1f5f9" }}>{f.total_cbm}</strong></span>
      </div>

      <Field label="Notes"><Textarea value={f.notes || ""} onChange={set("notes")} /></Field>

      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        {f.id && <DocButtons url={authUrl(`${API}/packing-lists/${f.id}/pdf`)} filename={`PackingList-${f.number}.pdf`}
          xlsxUrl={authUrl(`${API}/packing-lists/${f.id}/xlsx`)} xlsxFilename={`PackingList-${f.number}.xlsx`}
          entityType="packing-lists" recordLabel={f.number} label="📄 Download" small={false} />}
        <Btn onClick={async () => { await onSave(f); onClose(); }}>Save Packing List</Btn>
      </div>
    </div>
  );
}

// Real profit for a single Completed order — sale vs. product cost + the
// Agent/Freight/Loading costs on its Packing List(s), everything converted
// to the order's own currency by the backend (see computeOrderProfitability
// in server.js). Only ever rendered when canViewProfit is true (see the
// button in Orders() below) — the route itself is also gated server-side,
// so this never even gets a chance to render real numbers for anyone else.
function OrderProfitModal({ order, onClose }) {
  const t = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/orders/${order.id}/profitability`)
      .then(setData)
      .catch(err => setError(err.message || "Failed to load"));
  }, [order.id]);

  return (
    <Modal title={`${t("Profitability")} — ${order.order_number}`} onClose={onClose} wide>
      {error && <p style={{ color: "#ef4444", fontSize: "13px" }}>{error}</p>}
      {!data && !error && <p style={{ color: "#64748b", fontSize: "13px" }}>{t("Loading...")}</p>}
      {data && (
        <div>
          <div style={{ marginBottom: "16px", fontSize: "12.5px", color: "#64748b" }}>
            {t("Client")}: <strong style={{ color: "#f1f5f9" }}>{data.client || "—"}</strong>
            {" · "}{t("All figures in")} {currencyLabel(data.currency)}
          </div>
          <Table
            cols={[
              { label: "Product", key: "product_name" },
              { label: "Qty", render: r => `${r.quantity || "—"} ${r.unit || ""}`.trim() },
              { label: "Sale", render: r => fmt(r.sale, data.currency) },
              { label: "Cost", render: r => fmt(r.cost, data.currency) },
            ]}
            rows={data.items}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "20px" }}>
            <StatCard label="Total Sale" value={fmt(data.saleTotal, data.currency)} color="#60a5fa" />
            <StatCard label="Product Cost" value={fmt(data.productCostTotal, data.currency)} color="#f59e0b" />
            <StatCard label="Total Cost" value={fmt(data.totalCost, data.currency)} color="#ef4444" />
            <StatCard label="Agent Cost" value={fmt(data.agentCost, data.currency)} color="#94a3b8" />
            <StatCard label="Freight Cost" value={fmt(data.freightCost, data.currency)} color="#94a3b8" />
            <StatCard label="Loading Cost" value={fmt(data.loadingCost, data.currency)} color="#94a3b8" />
            {/* Recoverable input-tax credit on the registered product cost —
                same convention as the Real Margin box on the Product form
                (Real Margin = ((Sale-Cost)/Cost)*100 + VAT%). Shown as its
                own line so Real Profit below doesn't look like it's pulling
                a number out of nowhere when Sale alone is under Cost. */}
            <StatCard label="VAT Credit" value={fmt(data.vatCreditTotal, data.currency)} color="#a78bfa" />
          </div>
          <div style={{
            marginTop: "20px", background: "#1e293b",
            border: `1px solid ${data.profit < 0 ? "#ef4444" : "#10b981"}`,
            borderRadius: "10px", padding: "18px 20px", display: "flex",
            justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px",
          }}>
            <div>
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("Real Profit")}</div>
              <div style={{ fontSize: "26px", fontWeight: 700, color: data.profit < 0 ? "#ef4444" : "#10b981" }}>
                {fmt(data.profit, data.currency)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("Margin")}</div>
              <div style={{ fontSize: "26px", fontWeight: 700, color: data.marginPct == null ? "#94a3b8" : data.marginPct < 0 ? "#ef4444" : "#10b981" }}>
                {data.marginPct == null ? "—" : `${data.marginPct > 0 ? "+" : ""}${data.marginPct.toFixed(1)}%`}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Lets a canViewProfit user pick one, several, or every Completed order and
// download a PDF profitability report for exactly that selection — see
// GET /api/orders/profitability-report in server.js. `orders` is the same
// list Orders() already has loaded, filtered down to Completed here rather
// than re-fetched.
function OrderProfitReportModal({ orders, onClose }) {
  const t = useT();
  const completed = orders.filter(o => o.status === "Completed");
  const [selected, setSelected] = useState(() => new Set());
  const allSelected = completed.length > 0 && selected.size === completed.length;

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <Modal title={t("Profitability Report")} onClose={onClose}>
      {completed.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "13px" }}>{t("No completed orders yet.")}</p>
      ) : (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#cbd5e1", cursor: "pointer", marginBottom: "10px" }}>
            <input type="checkbox" checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(completed.map(o => o.id)))} />
            {t("Select all")} ({completed.length})
          </label>
          <div style={{ maxHeight: "320px", overflowY: "auto", border: "1px solid #1e293b", borderRadius: "8px" }}>
            {completed.map(o => (
              <label key={o.id} style={{
                display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px",
                borderBottom: "1px solid #1e293b", fontSize: "13px", color: "#e2e8f0", cursor: "pointer",
              }}>
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                <span style={{ fontWeight: 700, color: "#60a5fa" }}>{o.order_number}</span>
                <span style={{ color: "#64748b" }}>{o.client}</span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
            <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
            <Btn outline color="#2563eb" onClick={() => { window.open(authUrl(`${API}/orders/profitability-report?all=1`), "_blank"); onClose(); }}>
              📊 {t("All Completed")}
            </Btn>
            <Btn color="#10b981" disabled={selected.size === 0}
              onClick={() => {
                window.open(authUrl(`${API}/orders/profitability-report?ids=${[...selected].join(",")}`), "_blank");
                onClose();
              }}>
              📊 {t("Generate Report")}{selected.size > 0 ? ` (${selected.size})` : ""}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

function Orders() {
const t = useT();
const { canViewProfit } = usePermissions();
const [profitOrder, setProfitOrder] = useState(null); // order whose profit detail modal is open, or null
const [showProfitReport, setShowProfitReport] = useState(false);
const [contracts, setContracts] = useState([]);
const [commercials, setCommercials] = useState([]);
const [editContract, setEditContract] = useState(null);
const [editCommercial, setEditCommercial] = useState(null);
// Pristine snapshot taken the moment editCommercial is opened, kept
// untouched while editCommercial itself gets mutated field-by-field — lets
// the Save handler tell whether status actually changed, the same way
// `initial` does for the separate <XxxForm> components elsewhere.
const [editCommercialOriginal, setEditCommercialOriginal] = useState(null);
const [orders, setOrders] = useState([]);
const [notify, setNotify] = useState(null);
  const [modal, setModal] = useState(null);
  const [editOrder, setEditOrder] = useState(null);
  const [editNumberId, setEditNumberId] = useState(null);
  const [editNumberVal, setEditNumberVal] = useState("");
  const [search, setSearch] = useState("");
  const [contractModal, setContractModal] = useState(null);
  const [savedContracts, setSavedContracts] = useState([]);
  const [ciNotification, setCiNotification] = useState(null);
  useEscapeToClose(!!ciNotification, () => setCiNotification(null));
  // Per-item Inspection generation: mirrors contractModal/savedContracts
  // below, but keyed per order.items entry instead of per supplier -- even
  // when several products on an order share a supplier, each one still
  // needs its own physical inspection. inspectionsModal holds one stub per
  // item (or the saved record, if that item already has one); savedInspections
  // tracks which indices are considered "done" (pre-existing when the modal
  // opened, or just saved in this session); editingInspectionIdx is which
  // "done" card (if any) has been switched back into edit mode.
  const [inspectionsModal, setInspectionsModal] = useState(null);
  const [savedInspections, setSavedInspections] = useState([]);
  const [editingInspectionIdx, setEditingInspectionIdx] = useState(null);
const [inspections, setInspections] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);

 const load = useCallback(async () => {
    const [orders, contracts, commercials, inspections, products, suppliersList] = await Promise.all([
  api("/orders"),
  api("/contracts"),
  api("/commercial-invoices"),
  api("/inspections"),
  api("/products"),
  api("/suppliers"),
]);
setInspections(inspections);
setProducts(products);
setSuppliersList(suppliersList);
    const ordersWithItems = await Promise.all(
      orders.map(async o => {
        const detail = await api(`/orders/${o.id}`);
        return { ...o, items: detail.items || [] };
      })
    );
    setOrders(ordersWithItems);
    setContracts(contracts);
    setCommercials(commercials);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const filtered = orders.filter(o =>
    o.order_number.toLowerCase().includes(search.toLowerCase()) ||
    o.client.toLowerCase().includes(search.toLowerCase()) ||
    (o.status || "").toLowerCase().includes(search.toLowerCase()) ||
    (o.incoterm || "").toLowerCase().includes(search.toLowerCase())
  );

  const createOrder = (f) => api("/orders", "POST", f).then(() => {
    load();
    setNotify({ entityType: "orders", recordLabel: f.order_number, eventType: "created" });
  });
  const updateOrder = (f) => api(`/orders/${editOrder.id}`, "PUT", f).then(load);

const changeStatus = async (id, status) => {
  // Previously this auto-generated a Commercial Invoice + Packing List when
  // moving to "Shipment" and popped up an Inspection modal when moving to
  // "Inspection". Per user request, status changes no longer trigger any
  // document generation — those are created on-demand via their own
  // "Generate…" buttons instead.
  await api(`/orders/${id}/status`, "PATCH", { status });
  load();
};
  const deleteOrder = async (id) => { if (confirm("Delete this order?")) { await api(`/orders/${id}`, "DELETE"); load(); } };
  const saveNumber = async (id) => {
    await api(`/orders/${id}`, "PUT", { ...orders.find(o => o.id === id), order_number: editNumberVal });
    setEditNumberId(null); load();
  };

  const nextStatus = { Pending: "In Production", "In Production": "Inspection", Inspection: "Completed" };
const prevStatus = { "In Production": "Pending", Inspection: "In Production", Completed: "Inspection" };
  const generateCommercial = async (order) => {
  // order.order_number carries an "ORD-" prefix (see orderNumber generation
  // from the Proforma) which doesn't belong on a Commercial Invoice number,
  // and it previously got a random trailing suffix appended — dropped so the
  // CI number lines up 1:1 with the order reference, e.g. "AGNB26.044". No
  // "CI-" prefix either (client doesn't want it on the printed document).
  const number = String(order.order_number || "").replace(/^ORD-/, "");
  const ci = await api("/commercial-invoices", "POST", {
    order_id: order.id,
    number,
    issue_date: new Date().toISOString().slice(0, 10),
    client: order.client,
    total: order.value,
    currency: order.currency || "USD",
    status: "Pending",
    notes: "",
  });
  setEditCommercial(ci);
  setEditCommercialOriginal(ci);
  load();
  setNotify({ entityType: "commercial-invoices", recordLabel: ci.number || number, eventType: "created" });
};
const generateContract = (order) => {
  // No "PO-" prefix — the client wants the exact same reference number on
  // every document type for a given deal (Proforma, CI, Packing List,
  // Contract), not a different-looking system code per type. Same "ORD-"
  // strip as the other document numbers.
  const baseNumber = String(order.order_number || "").replace(/^ORD-/, "");
  const suppliers = [...new Set((order.items || []).map(i => i.supplier).filter(Boolean))];
  // The supplier tag (e.g. "-SHAN") only exists to tell apart multiple
  // contracts generated from the SAME order — it has no reason to show up
  // for the common case of a single supplier, which used to fall into this
  // branch too (suppliers.length was only checked against 0, not 1),
  // tacking an unwanted tag onto every contract number/PDF filename.
  if (suppliers.length <= 1) {
    const number = baseNumber;
    // A supplier Contract is the COST side of the deal (what's owed to the
    // factory), not the sale side — order.value/order.currency are what the
    // CLIENT pays, which used to leak in here and show e.g. a Chinese
    // supplier's contract in USD instead of the RMB it was actually quoted
    // in. Same cost-based total/currency calc the multi-supplier branch
    // below already uses, just for the whole order's items at once.
    const items = order.items || [];
    const total = items.reduce((sum, i) => sum + ((parseFloat(i.cost_price) || parseFloat(i.unit_price) || 0) * (parseFloat(i.quantity) || 0)), 0);
    const currency = items[0]?.cost_currency || items[0]?.currency || order.currency || "USD";
   setContractModal([{
  order_id: order.id,
  contract_number: number,
  // Plain order reference (no "PO-" prefix, no supplier tag) — used to build
  // the Supplier Payment description below without re-deriving it from
  // contract_number, which for multi-supplier orders has a supplier tag
  // appended that would otherwise leak into the description.
  _order_ref: baseNumber,
  // A single known supplier gets used directly (so the PDF's Seller block —
  // name, bank details — is filled in); genuinely supplier-less orders
  // (suppliers.length === 0) still leave it blank, same as before.
  supplier: suppliers[0] || "",
  sign_date: new Date().toISOString().slice(0, 10),
  delivery_date: order.shipment_date || "",
  total: total.toFixed(2),
  currency,
  status: "Draft",
  // Contract notes start blank — inheriting the order's notes (e.g. "Created
  // from Proforma PI-... (Quotation ...)") wasn't meaningful on a contract,
  // which has its own remarks that print into the PDF's 要求/Requirements box.
  notes: "",
  _items: order.items || [],
  items_json: JSON.stringify(order.items || []),
}]);
  } else {
    setContractModal(suppliers.map((supplier, supplierIdx) => {
const supplierItems = (order.items || []).filter(i => i.supplier === supplier);
const total = supplierItems.reduce((sum, i) => sum + ((parseFloat(i.cost_price) || parseFloat(i.unit_price) || 0) * (parseFloat(i.quantity) || 0)), 0);
const currency = supplierItems[0]?.cost_currency || supplierItems[0]?.currency || order.currency || "USD";
      // Multiple suppliers on the same order need distinct contract numbers —
      // a plain running index ("-1", "-2"...) tells them apart without
      // spelling any part of the supplier's name into the number, which
      // used to make it (and anywhere it's quoted, like Supplier Flow) read
      // longer/heavier than it needs to.
      const number = `${baseNumber}-${supplierIdx + 1}`;
      return {
  order_id: order.id,
  contract_number: number,
  _order_ref: baseNumber,
  supplier,
  sign_date: new Date().toISOString().slice(0, 10),
  delivery_date: order.shipment_date || "",
  total: total.toFixed(2),
  currency,
  status: "Draft",
  // Contract notes start blank — inheriting the order's notes (e.g. "Created
  // from Proforma PI-... (Quotation ...)") wasn't meaningful on a contract,
  // which has its own remarks that print into the PDF's 要求/Requirements box.
  notes: "",
  _items: supplierItems,
  items_json: JSON.stringify(supplierItems),
};
    }));
  }
};
// One inspection per product on the order -- even when several products
// share the same supplier, each physical item still has to be inspected on
// its own. Builds one stub per order.items entry, reusing the existing saved
// inspection for that item (matched via order_item_id) when there is one, so
// reopening this modal never loses previously-logged results.
const generateInspections = (order) => {
  const baseNumber = String(order.order_number || "").replace(/^ORD-/, "");
  const items = order.items || [];
  // Fallback for the edge case of an order with no item rows at all (legacy
  // data, or a manually-created order that skipped the items step) -- keeps
  // a single order-level inspection available instead of the button doing
  // nothing, matching how inspections worked before this per-item change.
  const stubs = items.length > 0 ? items : [null];
  const doneIdxs = [];
  const built = stubs.map((item, idx) => {
    const existing = item
      ? inspections.find(i => Number(i.order_item_id) === Number(item.id))
      : inspections.find(i => Number(i.order_id) === Number(order.id) && !i.order_item_id);
    if (existing) {
      doneIdxs.push(idx);
      return { ...existing };
    }
    const number = stubs.length > 1 ? `INS-${baseNumber}-${idx + 1}` : `INS-${baseNumber}`;
    return {
      order_id: order.id,
      order_item_id: item ? item.id : null,
      product_name: item ? (item.product_name || "") : "",
      number,
      inspection_date: new Date().toISOString().slice(0, 10),
      inspector: "",
      result: "Pending",
      observations: "",
    };
  });
  setInspectionsModal(built);
  setSavedInspections(doneIdxs);
  setEditingInspectionIdx(null);
};
// Product count vs. how many of those products already have a saved
// inspection -- drives the "(done/total)" badge on the Actions button.
const inspectionStatusFor = (order) => {
  const items = order.items || [];
  if (items.length === 0) {
    const has = inspections.some(i => Number(i.order_id) === Number(order.id));
    return { done: has ? 1 : 0, total: 1 };
  }
  const done = items.filter(item => inspections.some(i => Number(i.order_item_id) === Number(item.id))).length;
  return { done, total: items.length };
};
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("Orders")}</h2>
        <div style={{ display: "flex", gap: "10px" }}>
          {canViewProfit && (
            <Btn outline color="#10b981" onClick={() => setShowProfitReport(true)}>📊 {t("Profitability Report")}</Btn>
          )}
          <Btn onClick={() => setModal("new")}>+ New Order</Btn>
        </div>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
  placeholder="Search by order #, client, status or incoterm…" style={{ ...inputStyle, marginBottom: "16px" }} />

      {modal === "new" && (
        <Modal title={t("New Order")} onClose={() => setModal(null)}>
          <OrderForm onSave={createOrder} onClose={() => setModal(null)} />
        </Modal>
      )}
      {profitOrder && <OrderProfitModal order={profitOrder} onClose={() => setProfitOrder(null)} />}
      {showProfitReport && <OrderProfitReportModal orders={orders} onClose={() => setShowProfitReport(false)} />}
{editOrder && (
        <Modal title={t("Edit Order")} onClose={() => setEditOrder(null)}>
          <OrderForm initial={editOrder} onSave={updateOrder} onClose={() => setEditOrder(null)} />
        </Modal>
      )}
{editContract && (
  <Modal title={t("Edit Contract")} onClose={() => { setEditContract(null); load(); }} wide>
    <ContractForm orders={orders} initial={editContract}
      onSave={async b => {
        const oldStatus = editContract.status;
        await api(`/contracts/${editContract.id}`, "PUT", b);
        setEditContract(null); load();
        if (b.status !== oldStatus) setNotify({ entityType: "contracts", recordLabel: b.contract_number || editContract.contract_number, oldStatus, newStatus: b.status });
      }}
      onClose={() => setEditContract(null)} />
  </Modal>
)}
      {inspectionsModal && (
  <Modal title={t("Generate Inspection")} onClose={() => { setInspectionsModal(null); setSavedInspections([]); setEditingInspectionIdx(null); load(); }} wide>
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {inspectionsModal.map((insp, idx) => {
        const isDone = savedInspections.includes(idx);
        const showForm = !isDone || editingInspectionIdx === idx;
        return (
          <div key={idx} style={{ background: "#1e293b", borderRadius: "12px", padding: "16px", opacity: isDone && editingInspectionIdx !== idx ? 0.7 : 1 }}>
            <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: isDone ? "#10b981" : "#f59e0b", fontSize: "14px" }}>
                {isDone ? "✅" : "🔍"} {insp.product_name || (t("Item") + " " + (idx + 1))}
              </span>
              {isDone && editingInspectionIdx !== idx && (
                <Btn small outline color="#64748b" onClick={() => setEditingInspectionIdx(idx)}>✎ {t("Edit")}</Btn>
              )}
            </div>
            {showForm ? (
              <InspectionForm
                orders={orders}
                initial={{ ...insp, media: insp.media ? (typeof insp.media === 'string' ? JSON.parse(insp.media) : insp.media) : [] }}
                onSave={async b => {
                  const saved = insp.id
                    ? await api(`/inspections/${insp.id}`, "PUT", b)
                    : await api("/inspections", "POST", b);
                  setInspectionsModal(prev => prev.map((p, i) => i === idx ? saved : p));
                  setSavedInspections(prev => {
                    const wasAlreadySaved = prev.includes(idx);
                    const updated = wasAlreadySaved ? prev : [...prev, idx];
                    if (!wasAlreadySaved && updated.length === inspectionsModal.length) {
                      setNotify({
                        entityType: "inspections",
                        recordLabel: inspectionsModal.map(ii => ii.number).join(", "),
                        eventType: "created",
                      });
                    }
                    return updated;
                  });
                  load();
                }}
                onClose={() => setEditingInspectionIdx(null)}
              />
            ) : (
              <div style={{ textAlign: "center", padding: "12px", color: "#10b981", fontWeight: 600, fontSize: "14px" }}>
                ✅ {t("Inspection saved.")} {insp.result ? `(${t(insp.result)})` : ""}
              </div>
            )}
          </div>
        );
      })}
      {savedInspections.length === inspectionsModal.length && (
        <div style={{ textAlign: "center" }}>
          <Btn color="#10b981" onClick={() => { setInspectionsModal(null); setSavedInspections([]); setEditingInspectionIdx(null); load(); }}>
            ✅ {t("All inspections saved — Close")}
          </Btn>
        </div>
      )}
    </div>
  </Modal>
)}
{editCommercial && (
  <Modal title={t("Edit Commercial Invoice")} onClose={() => { setEditCommercial(null); load(); }} wide>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Number" half><Input value={editCommercial.number} onChange={e => setEditCommercial(p => ({ ...p, number: e.target.value }))} /></Field>
      <Field label="Issue Date" half><Input type="date" value={editCommercial.issue_date} onChange={e => setEditCommercial(p => ({ ...p, issue_date: e.target.value }))} /></Field>
      <Field label="Client" half><Input value={editCommercial.client} onChange={e => setEditCommercial(p => ({ ...p, client: e.target.value }))} /></Field>
<Field label="Total" half>
        <input value={editCommercial.total} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
      </Field>
      <Field label="Currency" half>
        <input value={currencyLabel(editCommercial.currency)} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
      </Field>
      <Field label="Status" half>
        <Select value={editCommercial.status} onChange={e => setEditCommercial(p => ({ ...p, status: e.target.value }))}>
          <option>Pending</option><option>Paid</option>
        </Select>
      </Field>
      {/* Shipment/Arrival Date aren't stored separately on the CI — they're
          the linked Order's own columns (see the /api/commercial-invoices
          route), so editing them here writes straight to the Order and
          editing them on the Order shows up here too, automatically. */}
      <Field label="Shipment Date" half>
        <Input type="date" value={editCommercial.shipment_date || ""} onChange={e => setEditCommercial(p => ({ ...p, shipment_date: e.target.value }))} />
      </Field>
      <Field label="Arrival Date" half>
        <Input type="date" value={editCommercial.arrival_date || ""} onChange={e => setEditCommercial(p => ({ ...p, arrival_date: e.target.value }))} />
      </Field>
      <Field label="Notes"><Textarea value={editCommercial.notes || ""} onChange={e => setEditCommercial(p => ({ ...p, notes: e.target.value }))} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={() => setEditCommercial(null)}>Cancel</Btn>
        <Btn onClick={async () => {
          const oldStatus = editCommercialOriginal?.status;
          const newStatus = editCommercial.status;
          const label = editCommercial.number;
          await api(`/commercial-invoices/${editCommercial.id}`, "PUT", editCommercial);
          setEditCommercial(null); setEditCommercialOriginal(null); load();
          if (oldStatus !== undefined && newStatus !== oldStatus) {
            setNotify({ entityType: "commercial-invoices", recordLabel: label, oldStatus, newStatus });
          }
        }}>Save</Btn>
      </div>
    </div>
  </Modal>
)}
{notify && <NotifyStatusChangeModal {...notify} onClose={() => setNotify(null)} />}
{contractModal && (
  <Modal title={t("Generate Supplier Contracts")} onClose={() => { setContractModal(null); setSavedContracts([]); load(); }} wide>
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {contractModal.map((c, idx) => (
        <div key={idx} style={{ background: "#1e293b", borderRadius: "12px", padding: "16px", opacity: savedContracts.includes(idx) ? 0.6 : 1 }}>
          <div style={{ marginBottom: "12px" }}>
            {/* Total dropped here — ContractForm's own "Products in this
                Contract" total below already shows the same figure, so this
                was just a redundant duplicate. */}
            <div style={{ marginBottom: "10px" }}>
              <span style={{ fontWeight: 700, color: savedContracts.includes(idx) ? "#10b981" : "#a78bfa", fontSize: "14px" }}>
                {savedContracts.includes(idx) ? "✅" : "🏭"} {c.supplier || "Supplier " + (idx + 1)}
              </span>
            </div>
          </div>
          {savedContracts.includes(idx) ? (
            <div style={{ textAlign: "center", padding: "12px", color: "#10b981", fontWeight: 600, fontSize: "14px" }}>
              ✅ Contract saved — payment requirement created in Supplier Flow.
            </div>
          ) : (
            <ContractForm
              orders={orders}
              initial={c}
onSave={async b => {
  const contract = await api("/contracts", "POST", b);
  await api("/financial/suppliers", "POST", {
    order_id: b.order_id,
    supplier: b.supplier,
    // "Contract-<order ref>" — the Supplier column right next to this in
    // Supplier Flow already shows the supplier name, so appending it here
    // too just repeated it. Built from the plain order reference
    // (_order_ref), not by stripping "PO-" off contract_number — for
    // multi-supplier orders contract_number also carries a short supplier
    // tag suffix (e.g. "PO-AGNB26.044-浙江"), which would otherwise leak
    // into the description as a stray fragment.
    description: `Contract-${b._order_ref || String(b.contract_number || "").replace(/^PO-/, "").replace(/-[^-]*$/, "")}`,
    type: "Purchase Order",
    amount: b.total,
    currency: b.currency || "USD",
    due_date: b.delivery_date || "",
    status: "Pending",
    notes: b.notes || "",
    contract_id: contract.id,
    items_json: b.items_json || null,
  });
  setSavedContracts(prev => {
    const wasAlreadySaved = prev.includes(idx);
    const updated = wasAlreadySaved ? prev : [...prev, idx];
    if (updated.length === contractModal.length) {
      load();
      if (!wasAlreadySaved) {
        setNotify({
          entityType: "contracts",
          recordLabel: contractModal.map(cc => cc.contract_number).join(", "),
          eventType: "created",
        });
      }
    }
    return updated;
  });
}}
              onClose={() => { setContractModal(null); setSavedContracts([]); load(); }}
            />
          )}
        </div>
      ))}
     {savedContracts.length === contractModal.length && (
        <div style={{ textAlign: "center" }}>
          <Btn color="#10b981" onClick={() => { setContractModal(null); setSavedContracts([]); load(); }}>
            ✅ All contracts saved — Close
          </Btn>
        </div>
      )}
    </div>
  </Modal>
)}

      {ciNotification && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
          zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#0f172a", border: "1px solid #10b981", borderRadius: "16px",
            padding: "32px 40px", maxWidth: "420px", textAlign: "center",
            boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🧾</div>
            <h3 style={{ margin: "0 0 8px", color: "#10b981", fontSize: "18px", fontWeight: 700 }}>{t("Commercial Invoice Generated!")}</h3>
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: "0 0 24px" }}>
              <strong style={{ color: "#f1f5f9" }}>{ciNotification.number}</strong> {t("was created for")} <strong style={{ color: "#f1f5f9" }}>{ciNotification.client}</strong>.
            </p>
            <Btn color="#10b981" onClick={() => setCiNotification(null)}>OK</Btn>
          </div>
        </div>
      )}

      <Table
        cols={[
          {
            label: "Order #", sortValue: r => r.order_number, render: r =>
              editNumberId === r.id ? (
                <div style={{ display: "flex", gap: "6px" }}>
                  <Input value={editNumberVal} onChange={e => setEditNumberVal(e.target.value)}
                    style={{ ...inputStyle, width: "120px", padding: "4px 8px" }} />
                  <Btn small onClick={() => saveNumber(r.id)}>✓</Btn>
                  <Btn small outline color="#64748b" onClick={() => setEditNumberId(null)}>✗</Btn>
                </div>
              ) : (
                <span
                  style={{ fontWeight: 700, color: "#60a5fa", cursor: "pointer", borderBottom: "1px dashed #334155" }}
                  onClick={() => { setEditNumberId(r.id); setEditNumberVal(r.order_number); }}
                  title="Click to edit"
                >{r.order_number}</span>
              )
          },
          { label: "Client", key: "client" },
          { label: "Value", sortValue: r => r.value, render: r => fmt(r.value, r.currency) },
          { label: "Lead Time", sortValue: r => r.production_lead_time, render: r => r.production_lead_time ? `${r.production_lead_time}d` : "—" },
          { label: "Shipment", sortValue: r => r.shipment_date, render: r => fmtDate(r.shipment_date) },
          { label: "Arrival", sortValue: r => r.arrival_date, render: r => fmtDate(r.arrival_date) },
          { label: "Status", sortValue: r => r.status, render: r => (
  <Select value={r.status}
    onChange={async e => {
      const oldStatus = r.status, newStatus = e.target.value;
      await changeStatus(r.id, newStatus);
      setNotify({ entityType: "orders", recordLabel: r.order_number, oldStatus, newStatus });
    }}
    style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}>
    {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
  </Select>
)},
{ label: "Actions", render: r => {
const hasContract = contracts.filter(c => Number(c.order_id) === Number(r.id));
const hasCommercial = commercials.find(c => Number(c.order_id) === Number(r.id));
  const insStatus = inspectionStatusFor(r);

  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      <Btn small color={hasContract.length > 0 ? "#8b5cf6" : "#334155"}
  onClick={() => hasContract.length > 0 ? setEditContract(hasContract[0]) : generateContract(r)}>
  🤝 {hasContract.length > 0 ? t("Contract ✓") : t("Contract")}
</Btn>
      <Btn small outline={!hasCommercial} color={hasCommercial ? "#10b981" : "#64748b"}
  onClick={() => {
    if (hasCommercial) { setEditCommercial(hasCommercial); setEditCommercialOriginal(hasCommercial); }
    else generateCommercial(r);
  }}>
  🧾 {hasCommercial ? t("Commercial ✓") : t("Commercial")}
</Btn>
      <Btn small outline={insStatus.done === 0} color={insStatus.total > 0 && insStatus.done === insStatus.total ? "#10b981" : insStatus.done > 0 ? "#f59e0b" : "#64748b"}
  onClick={() => generateInspections(r)}>
  🔍 {t("Inspection")}{insStatus.total > 0 ? ` (${insStatus.done}/${insStatus.total})` : ""}
</Btn>
      {canViewProfit && r.status === "Completed" && (
        <Btn small outline color="#10b981" onClick={() => setProfitOrder(r)}>💰 {t("Profit")}</Btn>
      )}
      <Btn small outline color="#64748b" onClick={() => setEditOrder(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`/orders/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
      <LastModifiedBy name={r.updated_by} />
    </div>
  );
}},
        ]}
        rows={filtered}
        emptyMsg="No orders found."
      />
    </div>
  );
}

function Products() {
  const t = useT();
  const [products, setProducts] = useState([]);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  // Prefills the New Product form when duplicating an existing product
  // (Code cleared — it's unique, so the copy can't reuse it — and Name
  // tagged "(Copy)" so it's obviously a draft waiting to be told apart from
  // the original) instead of starting the whole registration from scratch
  // for a near-identical item. null for a genuinely blank "+ New Product".
  const [duplicateSeed, setDuplicateSeed] = useState(null);

  const load = useCallback(() => api("/products").then(setProducts), []);
  useEffect(() => { load(); }, [load]);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("Product Registry")}</h2>
        <div style={{ display: "flex", gap: "10px" }}>
          <Btn outline color="#10b981" onClick={() => window.open(authUrl(`${API}/reports/products-by-supplier`), "_blank")}>📊 Supplier Report</Btn>
          <Btn onClick={() => { setDuplicateSeed(null); setModal("new"); }}>+ New Product</Btn>
        </div>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by name, code or category…" style={{ ...inputStyle, marginBottom: "16px" }} />

      {modal === "new" && (
        <Modal title={duplicateSeed ? t("Duplicate Product") : t("New Product")} onClose={() => { setModal(null); setDuplicateSeed(null); }}>
          <ProductForm initial={duplicateSeed}
            onSave={b => api("/products", "POST", b).then(load)}
            onClose={() => { setModal(null); setDuplicateSeed(null); }} />
        </Modal>
      )}
      {editing && (
        <Modal title={t("Edit Product")} onClose={() => setEditing(null)}>
          <ProductForm initial={editing}
            onSave={b => api(`/products/${editing.id}`, "PUT", b).then(load)}
            onClose={() => setEditing(null)} />
        </Modal>
      )}

      <Table
cols={[
  { label: "Code", sortValue: r => r.code, render: r => <span style={{ fontFamily: "monospace", color: "#60a5fa" }}>{r.code}</span> },
  { label: "Name", sortValue: r => r.name, render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
  { label: "Category", key: "category" },
  { label: "Color", sortValue: r => r.color, render: r => r.color || "—" },
  { label: "Supplier", key: "supplier" },
  { label: "Unit", key: "unit" },
  { label: "Width", sortValue: r => r.width, render: r => r.width || "—" },
  { label: "Height", sortValue: r => r.height, render: r => r.height || "—" },
  { label: "Thickness", sortValue: r => r.thickness, render: r => r.thickness || "—" },
  { label: "Weight", sortValue: r => r.weight, render: r => r.weight || "—" },
  { label: "Cost", sortValue: r => productRate(r, "cost").value, render: r => {
    const { value, currency, suffix } = productRate(r, "cost");
    return value ? `${currencyLabel(currency || "USD")} ${parseFloat(value).toFixed(2)}${suffix}` : "—";
  } },
  { label: "Sale Price", sortValue: r => productRate(r, "sale").value, render: r => {
    const { value, currency, suffix } = productRate(r, "sale");
    return value ? `${currencyLabel(currency || "USD")} ${parseFloat(value).toFixed(2)}${suffix}` : "—";
  } },
  { label: "Actions", render: r => (
    <div style={{ display: "flex", gap: "6px" }}>
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#3b82f6" onClick={() => {
        // Strip identity/audit fields that must NOT carry over to the copy —
        // id (would overwrite the original if sent), code (unique, and this
        // one's already taken), created_at/updated_by (fresh values belong
        // to the new row, not borrowed from the original).
        const { id, code, created_at, updated_by, ...rest } = r;
        setDuplicateSeed({ ...rest, code: "", name: `${r.name} (Copy)` });
        setModal("new");
      }}>Duplicate</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`/products/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
      <LastModifiedBy name={r.updated_by} />
    </div>
  )},
]}
        rows={filtered}
      />
    </div>
  );
}

function Samples() {
 const t = useT();
 const [samples, setSamples] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [notify, setNotify] = useState(null);
  const load = useCallback(() => api("/samples").then(setSamples), []);
  useEffect(() => { load(); }, [load]);

  const filtered = samples.filter(s =>
    s.product_name.toLowerCase().includes(search.toLowerCase()) ||
    s.client.toLowerCase().includes(search.toLowerCase()) ||
    (s.status || "").toLowerCase().includes(search.toLowerCase())
  );

  const sampleColors = {
    Requested: "#64748b", "In Production": "#3b82f6", Sent: "#f59e0b",
    "Feedback Received": "#8b5cf6", Approved: "#10b981",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("Product Development – Samples")}</h2>
        <Btn onClick={() => setModal(true)}>+ New Sample</Btn>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
  placeholder="Search by product, client or status…" style={{ ...inputStyle, marginBottom: "16px" }} />
      {modal && (
        <Modal title={t("New Sample Request")} onClose={() => setModal(false)}>
          <SampleForm onSave={b => api("/samples", "POST", b).then(load)} onClose={() => setModal(false)} />
        </Modal>
      )}

  {editing && (
  <Modal title={t("Edit Sample")} onClose={() => setEditing(null)}>
    <SampleForm initial={editing} onSave={async b => {
      const oldStatus = editing.status;
      await api(`/samples/${editing.id}`, "PUT", b); load();
      if (b.status !== oldStatus) setNotify({ entityType: "samples", recordLabel: b.code || editing.code, oldStatus, newStatus: b.status });
    }} onClose={() => setEditing(null)} />
  </Modal>
)}
{notify && <NotifyStatusChangeModal {...notify} onClose={() => setNotify(null)} />}
      <Table
        cols={[
  { label: "Code", sortValue: r => r.code, render: r => <span style={{ fontFamily: "monospace", color: "#60a5fa" }}>{r.code || "—"}</span> },
  { label: "Category", key: "category" },
  { label: "Product", sortValue: r => r.product_name, render: r => <span style={{ fontWeight: 600 }}>{r.product_name}</span> },
  { label: "Client", key: "client" },
  { label: "Supplier", key: "supplier" },
  { label: "Requested", sortValue: r => r.requested_date, render: r => fmtDate(r.requested_date) },
  { label: "Ready", sortValue: r => r.ready_date, render: r => fmtDate(r.ready_date) },
  { label: "Sent", sortValue: r => r.sent_date, render: r => fmtDate(r.sent_date) },
{ label: "Status", sortValue: r => r.status, render: r => (
  <Select value={r.status}
    onChange={async e => {
      const oldStatus = r.status, newStatus = e.target.value;
      await api(`/samples/${r.id}/status`, "PATCH", { status: newStatus }); load();
      setNotify({ entityType: "samples", recordLabel: r.code, oldStatus, newStatus });
    }}
    style={{ padding: "4px 8px", color: sampleColors[r.status] || "#94a3b8", fontSize: "12px", width: "auto" }}>
    {SAMPLE_STATUSES.map(s => <option key={s}>{s}</option>)}
  </Select>
)},
  { label: "Notes", key: "notes" },
  { label: "", render: r => (
    <div style={{ display: "flex", gap: "6px" }}>
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`/samples/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
      <LastModifiedBy name={r.updated_by} />
    </div>
  )},
]}
        rows={filtered}
      />
    </div>
  );
}
      
      
function Proformas() {
const t = useT();
const [proformas, setProformas] = useState([]);
  const [orders, setOrders] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [orderNotification, setOrderNotification] = useState(null);
  const [notify, setNotify] = useState(null);
  useEscapeToClose(!!orderNotification, () => setOrderNotification(null));
  const load = useCallback(() => {
    api("/proformas").then(setProformas);
    api("/orders").then(setOrders);
    api("/quotations").then(setQuotations);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = proformas.filter(p =>
    p.number.toLowerCase().includes(search.toLowerCase()) ||
    p.client.toLowerCase().includes(search.toLowerCase()) ||
    (p.status || "").toLowerCase().includes(search.toLowerCase())
  );

  // Builds an Order from the Proforma's own shipment fields plus its items
  // — the Proforma's own items snapshot takes priority (present whether it
  // was created manually or generated from a Quotation), falling back to
  // the linked Quotation's items only for older Proformas saved before
  // Proformas carried their own items.
  const createOrderFromProforma = async (pf) => {
    const quotation = quotations.find(q => Number(q.id) === Number(pf.quotation_id));
    const parseItems = (raw) => {
      if (!raw) return [];
      return typeof raw === 'string' ? (JSON.parse(raw || "[]")) : raw;
    };
    const items = pf.items ? parseItems(pf.items) : parseItems(quotation?.items);
    const itemsTotal = items.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
    // Suppliers now live per item (each product in the quotation can have
    // its own), not as a single field on the quotation — join whatever
    // unique suppliers show up across the items being carried into the Order.
    const itemSuppliers = [...new Set(items.map(i => i.supplier).filter(Boolean))];
    const orderNumber = `ORD-${pf.number}`;
    const order = await api("/orders", "POST", {
      order_number: orderNumber,
      client: pf.client || quotation?.client || "",
      supplier: itemSuppliers.join(", "),
      value: pf.total || itemsTotal.toFixed(2),
      currency: pf.currency || quotation?.currency || "USD",
      incoterm: pf.incoterm || "",
      port_of_loading: pf.port_of_loading || "",
      port_of_discharge: pf.port_of_discharge || "",
      freight_value: pf.freight_value || "",
      acquisition_company: pf.acquisition_company || "",
      payment_terms: pf.payment_terms || "",
      production_lead_time: pf.production_days || "",
      delivery_days: pf.delivery_days || "",
      status: "Pending",
      notes: `Created from Proforma ${pf.number}${quotation ? ` (Quotation ${quotation.number})` : ""}`,
      items,
    });
    await api(`/proformas/${pf.id}`, "PUT", { ...pf, order_id: order.id });
    setOrderNotification(orderNumber);
    load();
  };

  return (
    <div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("Proforma Invoices")}</h2>
        <Btn onClick={() => setModal(true)}>+ New Proforma</Btn>
      </div>
      {modal && (
        <Modal title={t("New Proforma")} onClose={() => setModal(false)} wide>
          <ProformaForm orders={orders} onSave={b => api("/proformas", "POST", b).then(() => {
            load();
            setNotify({ entityType: "proformas", recordLabel: b.number, eventType: "created" });
          })} onClose={() => setModal(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={t("Edit Proforma")} onClose={() => setEditing(null)} wide>
          <ProformaForm orders={orders} initial={editing} onSave={async b => {
            const oldStatus = editing.status;
            await api(`/proformas/${editing.id}`, "PUT", b); load();
            if (b.status !== oldStatus) setNotify({ entityType: "proformas", recordLabel: b.number || editing.number, oldStatus, newStatus: b.status });
          }} onClose={() => setEditing(null)} />
        </Modal>
      )}
      {notify && <NotifyStatusChangeModal {...notify} onClose={() => setNotify(null)} />}
      {orderNotification && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
          zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#0f172a", border: "1px solid #10b981", borderRadius: "16px",
            padding: "32px 40px", maxWidth: "420px", textAlign: "center",
            boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🛒</div>
            <h3 style={{ margin: "0 0 8px", color: "#10b981", fontSize: "18px", fontWeight: 700 }}>{t("Order Created!")}</h3>
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: "0 0 24px" }}>
              {t("Order")} <strong style={{ color: "#f1f5f9" }}>{orderNotification}</strong> {t("was created successfully!")}
            </p>
            <Btn color="#10b981" onClick={() => {
              setNotify({ entityType: "orders", recordLabel: orderNotification, eventType: "created" });
              setOrderNotification(null);
            }}>OK</Btn>
          </div>
        </div>
      )}
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by number, client or status…" style={{ ...inputStyle, marginBottom: "16px" }} />
      <Table
cols={[
  { label: "Number", sortValue: r => r.number, render: r => <span style={{ fontWeight: 700, color: "#60a5fa" }}>{r.number}</span> },
  { label: "Client", key: "client" },
  { label: "Issue Date", sortValue: r => r.issue_date, render: r => fmtDate(r.issue_date) },
  { label: "Validity", sortValue: r => r.validity, render: r => fmtDate(r.validity) },
  { label: "Total", sortValue: r => r.total, render: r => fmt(r.total, r.currency) },
  { label: "Status", sortValue: r => r.status, render: r => (
    <Select value={r.status}
      onChange={async e => {
        const oldStatus = r.status, newStatus = e.target.value;
        await api(`/proformas/${r.id}`, "PUT", { ...r, status: newStatus });
        load();
        setNotify({ entityType: "proformas", recordLabel: r.number, oldStatus, newStatus });
      }}
      style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}>
      {["Draft","Sent","Accepted","Rejected"].map(s => <option key={s}>{s}</option>)}
    </Select>
  )},
  { label: "Actions", render: r => (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      <Btn small color={r.order_id ? "#10b981" : "#334155"} onClick={() => !r.order_id && createOrderFromProforma(r)}>
        🛒 {r.order_id ? t("Order ✓") : t("Create Order")}
      </Btn>
      <DocButtons url={authUrl(`${API}/proformas/${r.id}/pdf`)} filename={`Proforma-${r.number}.pdf`}
        xlsxUrl={authUrl(`${API}/proformas/${r.id}/xlsx`)} xlsxFilename={`Proforma-${r.number}.xlsx`}
        entityType="proformas" recordLabel={r.number} label="📄 Doc" />
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`/proformas/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
      <LastModifiedBy name={r.updated_by} />
    </div>
  )},
]}
        rows={filtered}
      />
    </div>
  );
}

function Contracts() {
  const t = useT();
  const [contracts, setContracts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [notify, setNotify] = useState(null);
  const load = useCallback(() => {
    api("/contracts").then(setContracts);
    api("/orders").then(setOrders);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = contracts.filter(c =>
    (c.contract_number || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.supplier || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.status || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("Supplier Contracts")}</h2>
      </div>
      {editing && (
        <Modal title={t("Edit Contract")} onClose={() => setEditing(null)} wide>
          <ContractForm orders={orders} initial={editing}
            onSave={async b => {
              const oldStatus = editing.status;
              await api(`/contracts/${editing.id}`, "PUT", b).then(load);
              setEditing(null);
              if (b.status !== oldStatus) setNotify({ entityType: "contracts", recordLabel: b.contract_number || editing.contract_number, oldStatus, newStatus: b.status });
            }}
            onClose={() => setEditing(null)} />
        </Modal>
      )}
      {notify && <NotifyStatusChangeModal {...notify} onClose={() => setNotify(null)} />}
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by contract #, supplier or status…" style={{ ...inputStyle, marginBottom: "16px" }} />
      <Table
        cols={[
          { label: "Contract #", sortValue: r => r.contract_number, render: r => <span style={{ fontWeight: 700, color: "#a78bfa" }}>{r.contract_number}</span> },
          { label: "Supplier", key: "supplier" },
          { label: "Sign Date", sortValue: r => r.sign_date, render: r => fmtDate(r.sign_date) },
          { label: "Delivery Date", sortValue: r => r.delivery_date, render: r => fmtDate(r.delivery_date) },
          { label: "Total", sortValue: r => r.total, render: r => fmt(r.total, r.currency) },
          { label: "Status", sortValue: r => r.status, render: r => (
            <Select value={r.status}
              onChange={async e => {
                const oldStatus = r.status, newStatus = e.target.value;
                await api(`/contracts/${r.id}`, "PUT", { ...r, status: newStatus });
                load();
                setNotify({ entityType: "contracts", recordLabel: r.contract_number, oldStatus, newStatus });
              }}
              style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}>
              {["Draft","Signed","In Force","Completed","Cancelled"].map(s => <option key={s}>{s}</option>)}
            </Select>
          )},
          { label: "Actions", render: r => (
            <div style={{ display: "flex", gap: "6px" }}>
              <DocButtons url={authUrl(`${API}/contracts/${r.id}/pdf`)} filename={`Contract-${r.contract_number}.pdf`}
                entityType="contracts" recordLabel={r.contract_number} label="📄 PDF" />
              <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`/contracts/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
              <LastModifiedBy name={r.updated_by} />
            </div>
          )},
        ]}
        rows={filtered}
      />
    </div>
  );
}

function Financial({ type }) {
  const t = useT();
  const isClient = type === "client";
  const [records, setRecords] = useState([]);
  const [orders, setOrders] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [notify, setNotify] = useState(null);
  const entityType = isClient ? "financial-clients" : "financial-suppliers";
  const endpoint = isClient ? "/financial/clients" : "/financial/suppliers";
  const load = useCallback(() => {
    api(endpoint).then(setRecords);
    api("/orders").then(setOrders);
  }, [endpoint]);
  useEffect(() => { load(); }, [load]);

  // A "Partial" row splits its amount between Paid (paid_amount) and Pending
  // (the remainder) instead of counting the whole row as Pending — that's
  // what makes picking "Partial" actually move the summary cards instead of
  // leaving Total/Pending unchanged.
  const totals = records.reduce((acc, r) => {
    acc.total += r.amount;
    const paidSoFar = r.status === "Paid" ? r.amount : r.status === "Partial" ? (parseFloat(r.paid_amount) || 0) : 0;
    acc.paid += paidSoFar;
    if (r.status === "Pending") acc.pending += r.amount;
    if (r.status === "Partial") acc.pending += Math.max(0, r.amount - paidSoFar);
    return acc;
  }, { total: 0, pending: 0, paid: 0 });

  const color = isClient ? "#3b82f6" : "#8b5cf6";
  const party = isClient ? "client" : "supplier";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>
          {isClient ? t("💰 Client Cash Flow") : t("📦 Supplier Cash Flow")}
        </h2>
        <Btn color={color} onClick={() => setModal(true)}>+ New Entry</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <StatCard label="Total" value={fmt(totals.total)} color={color} />
        <StatCard label="Pending" value={fmt(totals.pending)} color="#f59e0b" />
        <StatCard label={isClient ? "Received" : "Paid"} value={fmt(totals.paid)} color="#10b981" />
      </div>
      {modal && (
        <Modal title={isClient ? t("New Client Payment") : t("New Supplier Payment")} onClose={() => setModal(false)}>
          <FinForm type={type} orders={orders} onSave={b => api(endpoint, "POST", b).then(load)} onClose={() => setModal(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={isClient ? t("Edit Client Payment") : t("Edit Supplier Payment")} onClose={() => setEditing(null)}>
          <FinForm type={type} orders={orders} initial={editing} onSave={async b => {
            const oldStatus = editing.status;
            await api(`${endpoint}/${editing.id}`, "PUT", b); load();
            if (b.status !== oldStatus) setNotify({ entityType, recordLabel: b[party] || editing[party], oldStatus, newStatus: b.status });
          }} onClose={() => setEditing(null)} />
        </Modal>
      )}
      {notify && <NotifyStatusChangeModal {...notify} onClose={() => setNotify(null)} />}
      <Table
cols={[
  { label: isClient ? "Client" : "Supplier", sortValue: r => r[party], render: r => <span style={{ fontWeight: 600 }}>{r[party]}</span> },
  { label: "Type", key: "type" },
  { label: "Description", key: "description" },
  ...(!isClient ? [{
    label: "Items", render: r => {
      try {
        const items = r.items_json ? JSON.parse(r.items_json) : [];
        return items.length > 0 ? (
          <div style={{ fontSize: "11px", color: "#94a3b8" }}>
            {items.map((i, idx) => (
              <div key={idx}>{i.product_name} × {i.quantity} {i.unit}</div>
            ))}
          </div>
        ) : "—";
      } catch { return "—"; }
    }
  }] : []),
  { label: "Amount", sortValue: r => r.amount, render: r => (
    <span style={{ fontWeight: 600, color }}>
      {fmt(r.amount, r.currency)}
      {r.status === "Partial" && (
        <div style={{ fontSize: "11px", fontWeight: 400, color: "#94a3b8" }}>
          Paid: {fmt(r.paid_amount || 0, r.currency)}
        </div>
      )}
    </span>
  ) },
  { label: "Due Date", sortValue: r => r.due_date, render: r => fmtDate(r.due_date) },
  { label: "Status", sortValue: r => r.status, render: r => (
    <Select value={r.status}
      onChange={async e => {
        const status = e.target.value;
        let paid_amount;
        if (status === "Partial") {
          // The Payment Notice schedule (e.g. "20% Deposit / 80% Balance")
          // already says exactly what's been paid at this point — the
          // deposit installment. No need to ask: if it's split 20/80,
          // "Partial" obviously means the 20% deposit landed, so derive it
          // straight from the schedule's first installment instead of
          // prompting for a number that's already known.
          const schedule = !isClient ? (PAYMENT_SCHEDULES[r.payment_schedule || "100"] || PAYMENT_SCHEDULES["100"]) : null;
          if (schedule && schedule.parts.length > 1) {
            paid_amount = Math.round(r.amount * (schedule.parts[0].pct / 100) * 100) / 100;
          } else {
            // No split schedule to infer from (single-payment schedule, or a
            // Client entry — clients don't have a payment_schedule at all) —
            // still need to ask, there's nothing else to derive it from.
            const input = prompt(`How much of ${fmt(r.amount, r.currency)} has been paid so far?`, r.paid_amount || "");
            if (input === null) return; // cancelled — leave status as-is
            paid_amount = parseFloat(input.replace(",", ".")) || 0;
          }
        }
        const oldStatus = r.status;
        await api(`${endpoint}/${r.id}/status`, "PATCH", {
          status,
          // A "Partial" row means money actually landed too (the deposit/
          // first installment) — it was only ever recording this for "Paid"
          // before, leaving Paid Date blank for every partial payment even
          // though a real payment date exists for it. Only Pending/Overdue
          // (nothing paid yet) have no date to record.
          paid_date: (status === "Paid" || status === "Partial") ? new Date().toISOString().slice(0, 10) : null,
          paid_amount,
        });
        load();
        setNotify({ entityType, recordLabel: r[party], oldStatus, newStatus: status });
      }}
      style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}>
      {FIN_STATUSES.map(s => <option key={s}>{s}</option>)}
    </Select>
  )},
  { label: "Actions", render: r => (
    <div style={{ display: "flex", gap: "6px" }}>
      {/* Split-payment schedules (e.g. 20% Deposit / 80% Balance) get one
          Payment Notice button per installment here too, same as the Edit
          modal — a plain 100% schedule still renders as the single
          original button. Generates an Excel file, not a PDF. */}
      {!isClient && (PAYMENT_SCHEDULES[r.payment_schedule || "100"] || PAYMENT_SCHEDULES["100"]).parts.map((part, i) => (
        <DocButtons key={i}
          url={authUrl(`${API}/financial/suppliers/${r.id}/payment-notice-xlsx${part.label ? `?pct=${part.pct}&label=${encodeURIComponent(part.label)}` : ""}`)}
          filename={`PaymentNotice-${r.description || r.supplier || r.id}${part.label ? `-${part.label}` : ""}.xlsx`}
          entityType="financial-suppliers" recordLabel={r.description || r.supplier}
          documentLabel={part.label ? `Payment Notice — ${part.label} (${part.pct}%)` : "Payment Notice"}
          label={<>📊 {part.label ? `${part.label} (${part.pct}%)` : t("Excel")}</>} />
      ))}
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`${endpoint}/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
      <LastModifiedBy name={r.updated_by} />
    </div>
  )},
]}
        rows={records}
      />
    </div>
  );
}
function ClientForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || {
    company_name: "", address: "", address2: "", address_number: "", neighborhood: "",
    city: "", state: "", zip_code: "", country: "", email: "",
    phone: "", contact_name: "", payment_terms: "", tax_id: "", notes: "",
  });
  const [showPaymentList, setShowPaymentList] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const paymentOptions = [
    "100% ADV – 100% Advance",
    "100% AFTER D. SALE – 100% After Domestic Sale",
    "100% ARRIVAL – 100% At Destination Port",
    "100%ADV B. SHIP. – 100% Advance Before Shipment",
    "100%DP BL – 100%DP Under BL Copy",
    "20%ADV/80%DP B. SHIP – 20% Advance, 80%DP Before Shipment",
    "20%ADV/80%DP BL – 20% Advance, 80%DP Under BL Copy",
    "30% ADV 70% BL – 30% Advance and 70% 30 Days After Shipment",
    "30% ADV 70% BS – 30% Advance and 70% Before Shipment",
    "30%ADV/70%DP B. SHIP – 30% Advance, 70%DP Before Shipment",
    "30%ADV/70%DP BL – 30% Advance, 70%DP Under BL Copy",
  ];

  const filteredPayments = paymentOptions.filter(p =>
    p.toLowerCase().includes((f.payment_terms || "").toLowerCase())
  );

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Company Name"><Input value={f.company_name} onChange={set("company_name")} /></Field>
      <Field label="Contact Name" half><Input value={f.contact_name} onChange={set("contact_name")} /></Field>
      <Field label="Email" half><Input type="email" value={f.email} onChange={set("email")} /></Field>
      <Field label="Phone" half><Input value={f.phone} onChange={e => setF(p => ({ ...p, phone: maskPhone(e.target.value) }))} placeholder="(00) 00000-0000" /></Field>
      <Field label="Payment Terms" half>
        <div style={{ position: "relative" }}>
          <Input
            value={f.payment_terms}
            onChange={e => { setF(p => ({ ...p, payment_terms: e.target.value })); setShowPaymentList(true); }}
            onFocus={() => setShowPaymentList(true)}
            onBlur={() => setTimeout(() => setShowPaymentList(false), 200)}
            placeholder="Search or type payment terms…"
          />
          {showPaymentList && filteredPayments.length > 0 && (
            <div style={dropdownStyle}>
              {filteredPayments.map((pt, i) => (
                <div key={i} style={dropItemStyle}
                  onMouseDown={() => { setF(p => ({ ...p, payment_terms: pt })); setShowPaymentList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {pt}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="Street / Address" half><Input value={f.address} onChange={set("address")} placeholder="Street name" /></Field>
      <Field label="Number" half><Input value={f.address_number} onChange={set("address_number")} placeholder="No." /></Field>
      <Field label="Address 2 / Complement"><Input value={f.address2} onChange={set("address2")} placeholder="Suite, floor, unit…" /></Field>
      <Field label="Neighborhood" half><Input value={f.neighborhood} onChange={set("neighborhood")} placeholder="Bairro" /></Field>
      <Field label="City" half><Input value={f.city} onChange={set("city")} /></Field>
      <Field label="State / Province" half><Input value={f.state} onChange={set("state")} /></Field>
      <Field label="ZIP / Postal Code" half><Input value={f.zip_code} onChange={e => setF(p => ({ ...p, zip_code: maskCEP(e.target.value) }))} placeholder="CEP" /></Field>
      <Field label="Country" half><Input value={f.country} onChange={set("country")} /></Field>
      <Field label="Tax ID / CNPJ" half><Input value={f.tax_id} onChange={e => setF(p => ({ ...p, tax_id: maskCNPJ(e.target.value) }))} placeholder="00.000.000/0000-00" /></Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave(f); onClose(); }}>Save Client</Btn>
      </div>
    </div>
  );
}

function Clients() {
  const t = useT();
  const [clients, setClients] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const load = useCallback(() => api("/clients").then(setClients), []);
  useEffect(() => { load(); }, [load]);
  const filtered = clients.filter(c =>
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_name || "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("Clients")}</h2>
        <Btn onClick={() => setModal(true)}>+ New Client</Btn>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by company or contact…" style={{ ...inputStyle, marginBottom: "16px" }} />
      {modal && (
        <Modal title={t("New Client")} onClose={() => setModal(false)}>
          <ClientForm onSave={b => api("/clients", "POST", b).then(load)} onClose={() => setModal(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={t("Edit Client")} onClose={() => setEditing(null)}>
          <ClientForm initial={editing} onSave={b => api(`/clients/${editing.id}`, "PUT", b).then(load)} onClose={() => setEditing(null)} />
        </Modal>
      )}
      <Table
        cols={[
          { label: "Company", sortValue: r => r.company_name, render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.company_name}</span> },
          { label: "Contact", key: "contact_name" },
          { label: "Email", key: "email" },
          { label: "Phone", key: "phone" },
          { label: "Payment Terms", key: "payment_terms" },
          { label: "Actions", render: r => (
            <div style={{ display: "flex", gap: "6px" }}>
              <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`/clients/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
              <LastModifiedBy name={r.updated_by} />
            </div>
          )},
        ]}
        rows={filtered}
      />
    </div>
  );
}

// Evaluation history + "log a new incident" form for one supplier — opened
// from a button inside SupplierForm, same idiom as ProductForm's Price
// History modal. `problem_key`/`solution_key` are the only things sent to
// the server; the point values shown here are just what the backend will
// resolve them to (see supplierEvaluationOptions.js — the client never gets
// to submit an arbitrary point value).
function SupplierEvaluationModal({ supplier, onClose }) {
  const t = useT();
  const [options, setOptions] = useState(null); // { problems, solutions }
  const [data, setData] = useState(null); // { rating, evaluations }
  const [problemKey, setProblemKey] = useState("");
  const [problemNotes, setProblemNotes] = useState("");
  const [solutionKey, setSolutionKey] = useState("");
  const [solutionNotes, setSolutionNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api(`/suppliers/${supplier.id}/evaluations`).then(setData), [supplier.id]);
  useEffect(() => { api("/supplier-evaluation-options").then(setOptions); load(); }, [load]);

  const submit = async () => {
    if (!problemKey || !solutionKey) return;
    setSaving(true);
    try {
      const result = await api(`/suppliers/${supplier.id}/evaluations`, "POST", {
        problem_key: problemKey, problem_notes: problemNotes,
        solution_key: solutionKey, solution_notes: solutionNotes,
      });
      setData(result);
      setProblemKey(""); setProblemNotes(""); setSolutionKey(""); setSolutionNotes("");
    } finally {
      setSaving(false);
    }
  };

  const removeEval = async (id) => {
    if (!confirm(t("Delete?"))) return;
    setData(await api(`/suppliers/evaluations/${id}`, "DELETE"));
  };

  if (!options || !data) {
    return (
      <Modal title={`${t("Evaluation")} — ${supplier.company_name}`} onClose={onClose} wide>
        <div style={{ color: "#64748b", fontSize: "13px", padding: "20px 0" }}>{t("Loading...")}</div>
      </Modal>
    );
  }

  return (
    <Modal title={`${t("Evaluation")} — ${supplier.company_name}`} onClose={onClose} wide>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px", background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "14px 18px" }}>
        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("Current Rating")}</div>
        <StarRating value={data.rating} size={22} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
        <div style={{ border: "1px solid #334155", borderRadius: "10px", padding: "14px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
            {t("Problem")}
          </div>
          <Field label="What happened">
            <Select value={problemKey} onChange={e => setProblemKey(e.target.value)}>
              <option value="">{t("Select...")}</option>
              {options.problems.map(o => (
                <option key={o.key} value={o.key}>{o.generic ? "• " : ""}{t(o.label)} ({o.points})</option>
              ))}
            </Select>
          </Field>
          <Field label="Details (optional)">
            <Textarea value={problemNotes} onChange={e => setProblemNotes(e.target.value)} />
          </Field>
        </div>
        <div style={{ border: "1px solid #334155", borderRadius: "10px", padding: "14px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
            {t("Solution")}
          </div>
          <Field label="How it was resolved">
            <Select value={solutionKey} onChange={e => setSolutionKey(e.target.value)}>
              <option value="">{t("Select...")}</option>
              {options.solutions.map(o => (
                <option key={o.key} value={o.key}>{o.generic ? "• " : ""}{t(o.label)} (+{o.points})</option>
              ))}
            </Select>
          </Field>
          <Field label="Details (optional)">
            <Textarea value={solutionNotes} onChange={e => setSolutionNotes(e.target.value)} />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "26px" }}>
        <Btn color="#8b5cf6" disabled={!problemKey || !solutionKey || saving} onClick={submit}>
          {saving ? t("Saving...") : t("+ Log Evaluation")}
        </Btn>
      </div>

      <div style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
        {t("History")}
      </div>
      {data.evaluations.length === 0 ? (
        <div style={{ color: "#64748b", fontSize: "13px" }}>{t("No evaluations recorded yet.")}</div>
      ) : (
        <Table
          cols={[
            { label: "Date", sortValue: r => r.created_at, render: r => new Date(String(r.created_at).replace(" ", "T")).toLocaleDateString("en-US") },
            { label: "Problem", render: r => (
              <div>
                <div>{t(r.problem_label)} <span style={{ color: "#ef4444" }}>({r.problem_points})</span></div>
                {r.problem_notes && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>{r.problem_notes}</div>}
              </div>
            ) },
            { label: "Solution", render: r => (
              <div>
                <div>{t(r.solution_label)} <span style={{ color: "#22c55e" }}>(+{r.solution_points})</span></div>
                {r.solution_notes && <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>{r.solution_notes}</div>}
              </div>
            ) },
            { label: "Net", sortValue: r => r.problem_points + r.solution_points, render: r => {
              const net = r.problem_points + r.solution_points;
              return <span style={{ fontWeight: 700, color: net < 0 ? "#ef4444" : net > 0 ? "#22c55e" : "#64748b" }}>{net > 0 ? "+" : ""}{net.toFixed(2)}</span>;
            } },
            { label: "By", key: "created_by" },
            { label: "Actions", render: r => <Btn small outline color="#ef4444" onClick={() => removeEval(r.id)}>Del</Btn> },
          ]}
          rows={data.evaluations}
        />
      )}
    </Modal>
  );
}

function SupplierForm({ initial, onSave, onClose, onEvaluationsChanged }) {
  const t = useT();
  const [f, setF] = useState(initial || {
    company_name: "", trade_name: "", address: "", address2: "", address_number: "", neighborhood: "",
    city: "", state: "", zip_code: "", country: "", email: "",
    phone: "", contact_name: "", payment_terms: "", product_types: "", notes: "",
    beneficiary_name: "", bank_name: "", bank_branch: "", account_number: "", swift_code: "",
  });
  const [showPaymentList, setShowPaymentList] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const paymentOptions = [
    "100% ADV – 100% Advance",
    "100% AFTER D. SALE – 100% After Domestic Sale",
    "100% ARRIVAL – 100% At Destination Port",
    "100%ADV B. SHIP. – 100% Advance Before Shipment",
    "100%DP BL – 100%DP Under BL Copy",
    "20%ADV/80%DP B. SHIP – 20% Advance, 80%DP Before Shipment",
    "20%ADV/80%DP BL – 20% Advance, 80%DP Under BL Copy",
    "30% ADV 70% BL – 30% Advance and 70% 30 Days After Shipment",
    "30% ADV 70% BS – 30% Advance and 70% Before Shipment",
    "30%ADV/70%DP B. SHIP – 30% Advance, 70%DP Before Shipment",
    "30%ADV/70%DP BL – 30% Advance, 70%DP Under BL Copy",
  ];

  const filteredPayments = paymentOptions.filter(p =>
    p.toLowerCase().includes((f.payment_terms || "").toLowerCase())
  );

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      {initial?.id && (
        <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("Rating")}</span>
            <StarRating value={initial.rating} size={16} />
          </div>
          <Btn outline color="#8b5cf6" onClick={() => setShowEvaluation(true)}>⭐ Evaluation</Btn>
        </div>
      )}
      {showEvaluation && (
        <SupplierEvaluationModal supplier={initial} onClose={() => { setShowEvaluation(false); onEvaluationsChanged?.(); }} />
      )}
      <Field label="Company Name"><Input value={f.company_name} onChange={set("company_name")} /></Field>
      <Field label="Trade Name">
        <Input value={f.trade_name || ""} onChange={set("trade_name")} placeholder="English name, e.g. for Chinese suppliers" />
      </Field>
      <Field label="Contact Name" half><Input value={f.contact_name} onChange={set("contact_name")} /></Field>
      <Field label="Email" half><Input type="email" value={f.email} onChange={set("email")} /></Field>
      <Field label="Phone" half><Input value={f.phone} onChange={e => setF(p => ({ ...p, phone: maskPhone(e.target.value) }))} placeholder="(00) 00000-0000" /></Field>
      <Field label="Payment Terms" half>
        <div style={{ position: "relative" }}>
          <Input
            value={f.payment_terms}
            onChange={e => { setF(p => ({ ...p, payment_terms: e.target.value })); setShowPaymentList(true); }}
            onFocus={() => setShowPaymentList(true)}
            onBlur={() => setTimeout(() => setShowPaymentList(false), 200)}
            placeholder="Search or type payment terms…"
          />
          {showPaymentList && filteredPayments.length > 0 && (
            <div style={dropdownStyle}>
              {filteredPayments.map((pt, i) => (
                <div key={i} style={dropItemStyle}
                  onMouseDown={() => { setF(p => ({ ...p, payment_terms: pt })); setShowPaymentList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {pt}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="Street / Address" half><Input value={f.address} onChange={set("address")} placeholder="Street name" /></Field>
      <Field label="Number" half><Input value={f.address_number} onChange={set("address_number")} placeholder="No." /></Field>
      <Field label="Address 2 / Complement"><Input value={f.address2} onChange={set("address2")} placeholder="Suite, floor, unit…" /></Field>
      <Field label="Neighborhood" half><Input value={f.neighborhood} onChange={set("neighborhood")} placeholder="Bairro" /></Field>
      <Field label="City" half><Input value={f.city} onChange={set("city")} /></Field>
      <Field label="State / Province" half><Input value={f.state} onChange={set("state")} /></Field>
      <Field label="ZIP / Postal Code" half><Input value={f.zip_code} onChange={e => setF(p => ({ ...p, zip_code: maskCEP(e.target.value) }))} placeholder="CEP" /></Field>
      <Field label="Country" half><Input value={f.country} onChange={set("country")} /></Field>
      <Field label="Product Types">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {PRODUCT_CATEGORIES.map(cat => {
            const selected = (f.product_types || "").split(",").map(s => s.trim()).filter(Boolean).includes(cat);
            return (
              <button type="button" key={cat}
                onClick={() => {
                  const current = (f.product_types || "").split(",").map(s => s.trim()).filter(Boolean);
                  const next = selected ? current.filter(c => c !== cat) : [...current, cat];
                  setF(p => ({ ...p, product_types: next.join(", ") }));
                }}
                style={{
                  padding: "7px 14px", borderRadius: "999px", fontSize: "12px", cursor: "pointer",
                  border: `1px solid ${selected ? "#8b5cf6" : "#334155"}`,
                  background: selected ? "rgba(139,92,246,0.15)" : "#1e293b",
                  color: selected ? "#c4b5fd" : "#94a3b8", fontWeight: selected ? 600 : 400,
                }}>
                {cat}
              </button>
            );
          })}
        </div>
      </Field>
      <div style={{ gridColumn: "span 2", marginTop: "4px", marginBottom: "-4px", fontSize: "12px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Bank Information (for Contracts &amp; Payment Notices)
      </div>
      <Field label="Beneficiary Name" half>
        <Input value={f.beneficiary_name} onChange={set("beneficiary_name")} placeholder="If different from company name" />
      </Field>
      <Field label="Bank Name" half><Input value={f.bank_name} onChange={set("bank_name")} /></Field>
      <Field label="Bank Branch" half><Input value={f.bank_branch} onChange={set("bank_branch")} placeholder="e.g. 支行 / branch name" /></Field>
      <Field label="Account Number" half><Input value={f.account_number} onChange={set("account_number")} /></Field>
      <Field label="SWIFT Code" half><Input value={f.swift_code} onChange={set("swift_code")} placeholder="For international wires" /></Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn color="#8b5cf6" onClick={async () => { await onSave(f); onClose(); }}>Save Supplier</Btn>
      </div>
    </div>
  );
}

// "All Suppliers" vs "Specific Suppliers" (checkbox picker) before
// downloading the evaluation history workbook — see
// xlsx/supplierEvaluationReport.js. Opens the file the same way every other
// report in this app does: window.open() with the session token appended as
// a query param (authUrl), since a plain browser navigation can't carry the
// Authorization header a fetch() call would.
function SupplierEvaluationReportModal({ suppliers, onClose }) {
  const t = useT();
  const [mode, setMode] = useState("all"); // "all" | "specific"
  const [selected, setSelected] = useState(new Set());

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const disabled = mode === "specific" && selected.size === 0;

  const generate = () => {
    const ids = mode === "specific" ? [...selected] : [];
    const qs = ids.length ? `?supplier_ids=${ids.join(",")}` : "";
    window.open(authUrl(`${API}/suppliers/evaluations/report${qs}`), "_blank");
    onClose();
  };

  return (
    <Modal title={t("Generate Evaluation Report")} onClose={onClose}>
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <Btn outline={mode !== "all"} color="#8b5cf6" onClick={() => setMode("all")}>{t("All Suppliers")}</Btn>
        <Btn outline={mode !== "specific"} color="#8b5cf6" onClick={() => setMode("specific")}>{t("Specific Suppliers")}</Btn>
      </div>
      {mode === "specific" && (
        <div>
          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "10px" }}>
            {t("Select suppliers to include, or leave all unchecked to include every supplier.")}
          </div>
          <div style={{ maxHeight: "320px", overflowY: "auto", border: "1px solid #334155", borderRadius: "10px", padding: "6px" }}>
            {suppliers.map(s => (
              <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", cursor: "pointer", borderRadius: "6px", fontSize: "13px", color: "#cbd5e1" }}>
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                <span style={{ flex: 1 }}>{s.company_name}</span>
                <StarRating value={s.rating} size={11} showNumber={false} />
              </label>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn color="#8b5cf6" disabled={disabled} onClick={generate}>{t("Generate Report (.xlsx)")}</Btn>
      </div>
    </Modal>
  );
}

function Suppliers() {
  const t = useT();
  const [suppliers, setSuppliers] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [showReport, setShowReport] = useState(false);
  const load = useCallback(() => api("/suppliers").then(setSuppliers), []);
  useEffect(() => { load(); }, [load]);
  const filtered = suppliers.filter(s =>
    s.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.product_types || "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("Suppliers")}</h2>
        <div style={{ display: "flex", gap: "10px" }}>
          <Btn outline color="#10b981" onClick={() => setShowReport(true)}>📊 Evaluation Report</Btn>
          <Btn color="#8b5cf6" onClick={() => setModal(true)}>+ New Supplier</Btn>
        </div>
      </div>
      {showReport && (
        <SupplierEvaluationReportModal suppliers={suppliers} onClose={() => setShowReport(false)} />
      )}
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by company or product type…" style={{ ...inputStyle, marginBottom: "16px" }} />
      {modal && (
        <Modal title={t("New Supplier")} onClose={() => setModal(false)}>
          <SupplierForm onSave={b => api("/suppliers", "POST", b).then(load)} onClose={() => setModal(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={t("Edit Supplier")} onClose={() => setEditing(null)}>
          <SupplierForm initial={editing} onSave={b => api(`/suppliers/${editing.id}`, "PUT", b).then(load)} onClose={() => setEditing(null)} onEvaluationsChanged={load} />
        </Modal>
      )}
      <Table
        cols={[
          { label: "Company", sortValue: r => r.company_name, render: r => <span style={{ fontWeight: 600, color: "#a78bfa" }}>{r.company_name}</span> },
          { label: "Rating", sortValue: r => r.rating, render: r => <StarRating value={r.rating} size={12} /> },
          { label: "Trade Name", key: "trade_name" },
          { label: "Contact", key: "contact_name" },
          { label: "Email", key: "email" },
          { label: "Phone", key: "phone" },
          { label: "Product Types", key: "product_types" },
          { label: "Actions", render: r => (
            <div style={{ display: "flex", gap: "6px" }}>
              <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`/suppliers/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
              <LastModifiedBy name={r.updated_by} />
            </div>
          )},
        ]}
        rows={filtered}
      />
    </div>
  );
}

// Freight forwarding agents — a lean registry (see the matching comment on
// the freight_agents table in database.js). No address/bank fields like
// Clients/Suppliers get; just enough to identify who to contact, plus a
// searchable picker used on the Packing List screen.
function FreightAgentForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || { company_name: "", contact_name: "", email: "", phone: "", notes: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Company Name"><Input value={f.company_name} onChange={set("company_name")} /></Field>
      <Field label="Contact Name" half><Input value={f.contact_name} onChange={set("contact_name")} /></Field>
      <Field label="Email" half><Input type="email" value={f.email} onChange={set("email")} /></Field>
      <Field label="Phone" half><Input value={f.phone} onChange={e => setF(p => ({ ...p, phone: maskPhone(e.target.value) }))} placeholder="(00) 00000-0000" /></Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave(f); onClose(); }}>Save</Btn>
      </div>
    </div>
  );
}

function FreightAgents() {
  const t = useT();
  const [agents, setAgents] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const load = useCallback(() => api("/freight-agents").then(setAgents), []);
  useEffect(() => { load(); }, [load]);
  const filtered = agents.filter(a =>
    a.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (a.contact_name || "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("Freight Agents")}</h2>
        <Btn color="#0ea5e9" onClick={() => setModal(true)}>+ New Freight Agent</Btn>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by company or contact…" style={{ ...inputStyle, marginBottom: "16px" }} />
      {modal && (
        <Modal title={t("New Freight Agent")} onClose={() => setModal(false)}>
          <FreightAgentForm onSave={b => api("/freight-agents", "POST", b).then(load)} onClose={() => setModal(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={t("Edit Freight Agent")} onClose={() => setEditing(null)}>
          <FreightAgentForm initial={editing} onSave={b => api(`/freight-agents/${editing.id}`, "PUT", b).then(load)} onClose={() => setEditing(null)} />
        </Modal>
      )}
      <Table
        cols={[
          { label: "Company", sortValue: r => r.company_name, render: r => <span style={{ fontWeight: 600, color: "#0ea5e9" }}>{r.company_name}</span> },
          { label: "Contact", key: "contact_name" },
          { label: "Email", key: "email" },
          { label: "Phone", key: "phone" },
          { label: "Notes", key: "notes" },
          { label: "Actions", render: r => (
            <div style={{ display: "flex", gap: "6px" }}>
              <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`/freight-agents/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
              <LastModifiedBy name={r.updated_by} />
            </div>
          )},
        ]}
        rows={filtered}
      />
    </div>
  );
}

function CommercialInvoices() {
  const t = useT();
  const { hideCommercialStatus } = usePermissions();
  const [invoices, setInvoices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [packingLists, setPackingLists] = useState([]);
  const [packingListModal, setPackingListModal] = useState(null);
  const [editPackingList, setEditPackingList] = useState(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  // Pristine snapshot taken when the edit modal opens (see editCommercial /
  // editCommercialOriginal in Orders() for the same pattern) — lets Save
  // tell whether status actually changed, since `editing` itself gets
  // mutated field-by-field as the form is edited.
  const [editingOriginal, setEditingOriginal] = useState(null);
  const [notify, setNotify] = useState(null);
  const load = useCallback(async () => {
    api("/commercial-invoices").then(setInvoices);
    api("/products").then(setProducts);
    api("/packing-lists").then(setPackingLists);
    // Packing List generation needs each order's items (color, width,
    // weight, meterage…), which the plain /orders list doesn't include.
    const orders = await api("/orders");
    const ordersWithItems = await Promise.all(
      orders.map(async o => {
        const detail = await api(`/orders/${o.id}`);
        return { ...o, items: detail.items || [] };
      })
    );
    setOrders(ordersWithItems);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Packing Lists are generated from an order's items, same as before — just
  // triggered from this screen (alongside the Commercial Invoice it ships
  // with) instead of from the Orders screen.
  const generatePackingList = (order) => setPackingListModal(buildPackingListDraft(order, products));

  const filtered = invoices.filter(i =>
    (i.number || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.client || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.status || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("Commercial Invoices")}</h2>
      </div>
      {editing && (
        <Modal title={t("Edit Commercial Invoice")} onClose={() => setEditing(null)} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Field label="Number" half><Input value={editing.number} onChange={e => setEditing(p => ({ ...p, number: e.target.value }))} /></Field>
            <Field label="Issue Date" half><Input type="date" value={editing.issue_date} onChange={e => setEditing(p => ({ ...p, issue_date: e.target.value }))} /></Field>
            <Field label="Total" half><input value={editing.total} readOnly onChange={() => {}} style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} /></Field>
      <Field label="Currency" half><input value={currencyLabel(editing.currency)} readOnly onChange={() => {}} style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} /></Field>
            {!hideCommercialStatus && (
              <Field label="Status" half>
                <Select value={editing.status} onChange={e => setEditing(p => ({ ...p, status: e.target.value }))}>
                  <option>Pending</option><option>Paid</option>
                </Select>
              </Field>
            )}
            {/* Shipment/Arrival Date live on the linked Order, not on the CI
                itself — editing them here writes straight to the Order, and
                editing them on the Order shows up here too, automatically. */}
            <Field label="Shipment Date" half>
              <Input type="date" value={editing.shipment_date || ""} onChange={e => setEditing(p => ({ ...p, shipment_date: e.target.value }))} />
            </Field>
            <Field label="Arrival Date" half>
              <Input type="date" value={editing.arrival_date || ""} onChange={e => setEditing(p => ({ ...p, arrival_date: e.target.value }))} />
            </Field>
            <Field label="Notes"><Textarea value={editing.notes || ""} onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))} /></Field>
            <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Btn outline color="#64748b" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn onClick={async () => {
                const oldStatus = editingOriginal?.status;
                const newStatus = editing.status;
                const label = editing.number;
                await api(`/commercial-invoices/${editing.id}`, "PUT", editing).then(load);
                setEditing(null); setEditingOriginal(null);
                if (oldStatus !== undefined && newStatus !== oldStatus) {
                  setNotify({ entityType: "commercial-invoices", recordLabel: label, oldStatus, newStatus });
                }
              }}>Save</Btn>
            </div>
          </div>
        </Modal>
      )}
      {packingListModal && (
        <Modal title={t("Generate Packing List")} onClose={() => { setPackingListModal(null); load(); }} wide>
          <PackingListForm
            initial={packingListModal}
            onSave={async b => { await api("/packing-lists", "POST", b); load(); }}
            onClose={() => { setPackingListModal(null); load(); }}
          />
        </Modal>
      )}
      {editPackingList && (
        <Modal title={t("Edit Packing List")} onClose={() => { setEditPackingList(null); load(); }} wide>
          <PackingListForm
            initial={editPackingList}
            onSave={async b => { await api(`/packing-lists/${editPackingList.id}`, "PUT", b); load(); }}
            onClose={() => { setEditPackingList(null); load(); }}
          />
        </Modal>
      )}
      {notify && <NotifyStatusChangeModal {...notify} onClose={() => setNotify(null)} />}
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder={hideCommercialStatus ? "Search by number or client…" : "Search by number, client or status…"} style={{ ...inputStyle, marginBottom: "16px" }} />
      <Table
        cols={[
          { label: "Number", sortValue: r => r.number, render: r => <span style={{ fontWeight: 700, color: "#60a5fa" }}>{r.number}</span> },
          { label: "Client", key: "client" },
          { label: "Issue Date", sortValue: r => r.issue_date, render: r => fmtDate(r.issue_date) },
          { label: "Total", sortValue: r => r.total, render: r => fmt(r.total, r.currency) },
          ...(hideCommercialStatus ? [] : [{ label: "Status", sortValue: r => r.status, render: r => (
            <Select value={r.status}
              onChange={async e => {
                const oldStatus = r.status, newStatus = e.target.value;
                await api(`/commercial-invoices/${r.id}`, "PUT", { ...r, status: newStatus }); load();
                setNotify({ entityType: "commercial-invoices", recordLabel: r.number, oldStatus, newStatus });
              }}
              style={{ padding: "4px 8px", fontSize: "12px", width: "auto", color: r.status === "Paid" ? "#10b981" : "#f59e0b" }}>
              <option>Pending</option><option>Paid</option>
            </Select>
          )}]),
          { label: "Actions", render: r => {
            const order = orders.find(o => Number(o.id) === Number(r.order_id));
            const hasPackingList = packingLists.find(p => Number(p.order_id) === Number(r.order_id));
            return (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <DocButtons url={authUrl(`${API}/commercial-invoices/${r.id}/pdf`)} filename={`CI-${r.number}.pdf`}
                  xlsxUrl={authUrl(`${API}/commercial-invoices/${r.id}/xlsx`)} xlsxFilename={`CI-${r.number}.xlsx`}
                  entityType="commercial-invoices" recordLabel={r.number} label="📄 Doc" />
                <Btn small outline color="#64748b" onClick={() => { setEditing(r); setEditingOriginal(r); }}>Edit</Btn>
                {order && (
                  <Btn small outline={!hasPackingList} color={hasPackingList ? "#06b6d4" : "#64748b"}
                    onClick={() => hasPackingList ? setEditPackingList(hasPackingList) : generatePackingList(order)}>
                    📦 {hasPackingList ? t("Packing List ✓") : t("Packing List")}
                  </Btn>
                )}
                <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`/commercial-invoices/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
                <LastModifiedBy name={r.updated_by} />
              </div>
            );
          }},
        ]}
        rows={filtered}
        emptyMsg="No commercial invoices yet."
      />
    </div>
  );
}

// Dedicated Packing Lists screen — previously a Packing List could only be
// reached indirectly through the Commercial Invoice it shipped with (no
// standalone listing existed). Shipment/Arrival Date shown here come from
// the linked Order (see the /api/packing-lists route's join), same
// single-source-of-truth approach as the Commercial Invoice screen.
function PackingLists() {
  const t = useT();
  const [lists, setLists] = useState([]);
  const [search, setSearch] = useState("");
  const [editList, setEditList] = useState(null);
  const load = useCallback(() => { api("/packing-lists").then(setLists); }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = lists.filter(l =>
    (l.number || "").toLowerCase().includes(search.toLowerCase()) ||
    (l.client || "").toLowerCase().includes(search.toLowerCase()) ||
    (l.order_number || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("Packing Lists")}</h2>
      </div>
      {editList && (
        <Modal title={t("Edit Packing List")} onClose={() => { setEditList(null); load(); }} wide>
          <PackingListForm
            initial={editList}
            onSave={async b => { await api(`/packing-lists/${editList.id}`, "PUT", b); load(); }}
            onClose={() => { setEditList(null); load(); }}
          />
        </Modal>
      )}
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by number, order or client…" style={{ ...inputStyle, marginBottom: "16px" }} />
      <Table
        cols={[
          { label: "Number", sortValue: r => r.number, render: r => <span style={{ fontWeight: 700, color: "#60a5fa" }}>{r.number}</span> },
          { label: "Order #", key: "order_number" },
          { label: "Client", key: "client" },
          { label: "Shipment Date", sortValue: r => r.shipment_date, render: r => r.shipment_date ? fmtDate(r.shipment_date) : "—" },
          { label: "Arrival Date", sortValue: r => r.arrival_date, render: r => r.arrival_date ? fmtDate(r.arrival_date) : "—" },
          { label: "Roll", sortValue: r => r.total_roll, render: r => r.total_roll || "—" },
          { label: "Gross Weight", sortValue: r => r.total_gross_weight, render: r => r.total_gross_weight ? `${parseFloat(r.total_gross_weight).toLocaleString("en-US", { maximumFractionDigits: 1 })} kg` : "—" },
          { label: "Net Weight", sortValue: r => r.total_net_weight, render: r => r.total_net_weight ? `${parseFloat(r.total_net_weight).toLocaleString("en-US", { maximumFractionDigits: 1 })} kg` : "—" },
          { label: "CBM", sortValue: r => r.total_cbm, render: r => r.total_cbm || "—" },
          { label: "Status", key: "status" },
          { label: "Actions", render: r => (
            <div style={{ display: "flex", gap: "6px" }}>
              <DocButtons url={authUrl(`${API}/packing-lists/${r.id}/pdf`)} filename={`PackingList-${r.number}.pdf`}
                xlsxUrl={authUrl(`${API}/packing-lists/${r.id}/xlsx`)} xlsxFilename={`PackingList-${r.number}.xlsx`}
                entityType="packing-lists" recordLabel={r.number} label="📄 Doc" />
              <Btn small outline color="#64748b" onClick={() => setEditList(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`/packing-lists/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
              <LastModifiedBy name={r.updated_by} />
            </div>
          )},
        ]}
        rows={filtered}
        emptyMsg="No packing lists yet — generate one from the Commercial Invoices screen."
      />
    </div>
  );
}

function InspectionForm({ onSave, onClose, initial, orders }) {
  const t = useT();
  const [f, setF] = useState(initial || {
    order_id: "", number: "", inspection_date: "", inspector: "",
    result: "Pending", observations: "",
  });
const [media, setMedia] = useState(() => {
  if (!initial?.media) return [];
  let parsed = initial.media;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(item => typeof item === 'string' ? { url: item, name: item.split('/').pop() } : item);
});
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  useEscapeToClose(!!lightbox, () => setLightbox(null));
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    setUploading(true);
    try {
const results = await Promise.all(files.map(uploadToCloudinary));
setMedia(prev => [...prev, ...results.filter(Boolean)]);
    } catch(err) { alert(t("Upload failed: ") + err.message); }
    setUploading(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      {/* Read-only Product indicator -- only shown when this inspection was
          generated per-item from the Orders screen (f.product_name set).
          Inspections logged standalone from the Inspections tab have no item
          attached, so this field just doesn't render for them. */}
      {f.product_name && (
        <Field label="Product" half>
          <input value={f.product_name} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
        </Field>
      )}
      <Field label="Linked Order" half>
        <Select value={f.order_id} onChange={set("order_id")}>
          <option value="">None</option>
          {(orders || []).map(o => <option key={o.id} value={o.id}>{o.order_number} – {o.client}</option>)}
        </Select>
      </Field>
      <Field label="Inspection Number" half><Input value={f.number} onChange={set("number")} placeholder="INS-2024-001" /></Field>
      <Field label="Inspection Date" half><Input type="date" value={f.inspection_date} onChange={set("inspection_date")} /></Field>
      <Field label="Inspector" half><Input value={f.inspector} onChange={set("inspector")} placeholder="Inspector name" /></Field>
      <Field label="Result" half>
        <Select value={f.result} onChange={set("result")}>
          {["Pending","Approved","Rejected","Conditional"].map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Observations"><Textarea value={f.observations || ""} onChange={set("observations")} /></Field>

      <Field label="Photos / PDFs">
        <div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 16px", cursor: "pointer", fontSize: "13px", color: "#94a3b8", marginBottom: "12px" }}>
            {uploading ? t("⏳ Uploading...") : t("📎 Add Photos / PDFs")}
            <input type="file" multiple accept="image/*,application/pdf" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
          </label>
          {lightbox && (
            <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <img src={lightbox} style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px", objectFit: "contain" }} alt="" onClick={e => e.stopPropagation()} />
              <button onClick={() => setLightbox(null)} style={{ position: "fixed", top: "20px", right: "20px", background: "#ef4444", border: "none", borderRadius: "50%", width: "36px", height: "36px", color: "#fff", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {media.filter(Boolean).map((item, i) => {
  const url = typeof item === 'string' ? item : item.url;
  const name = typeof item === 'string' ? url.split('/').pop() : item.name;
  return (
    <div key={i} style={{ position: "relative" }}>
      {url.match(/\.pdf$/i) || name.match(/\.pdf$/i) ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "80px", height: "80px", background: "#1e293b", borderRadius: "6px", border: "1px solid #334155", color: "#f1f5f9", fontSize: "28px", textDecoration: "none" }}>📄</a>
      ) : url.match(/\.(mp4|mov|avi|webm)$/i) ? (
        <video src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} />
      ) : (
        <img src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} alt="" />
      )}
      <button onClick={async () => {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
      }} style={{ position: "absolute", bottom: "-6px", left: "-6px", background: "#3b82f6", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⬇</button>
      <button onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: "-6px", right: "-6px", background: "#ef4444", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
    </div>
  );
})}
          </div>
        </div>
      </Field>

      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave({ ...f, media: JSON.stringify(media) }); onClose(); }}>Save Inspection</Btn>
      </div>
    </div>
  );
}

function Inspections() {
  const t = useT();
  const [inspections, setInspections] = useState([]);
  const [orders, setOrders] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [notify, setNotify] = useState(null);
  const load = useCallback(async () => {
    const [inspections, orders] = await Promise.all([api("/inspections"), api("/orders")]);
    setInspections(inspections || []);
    setOrders(orders || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = inspections.filter(i =>
    (i.number || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.inspector || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.result || "").toLowerCase().includes(search.toLowerCase())
  );

  const resultColors = { Approved: "#10b981", Rejected: "#ef4444", Conditional: "#f59e0b", Pending: "#64748b" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("Inspections")}</h2>
        <Btn onClick={() => setModal(true)}>+ New Inspection</Btn>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by number, inspector or result…" style={{ ...inputStyle, marginBottom: "16px" }} />
      {modal && (
        <Modal title={t("New Inspection")} onClose={() => setModal(false)} wide>
          <InspectionForm orders={orders} onSave={async b => {
            await api("/inspections", "POST", b);
            load();
            setNotify({ entityType: "inspections", recordLabel: b.number, eventType: "created" });
          }} onClose={() => setModal(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={t("Edit Inspection")} onClose={() => setEditing(null)} wide>
          <InspectionForm orders={orders} initial={{ ...editing, media: editing.media ? (typeof editing.media === 'string' ? JSON.parse(editing.media) : editing.media) : [] }}
            onSave={async b => {
              const oldStatus = editing.result;
              await api(`/inspections/${editing.id}`, "PUT", b); load();
              if (b.result !== oldStatus) setNotify({ entityType: "inspections", recordLabel: b.number || editing.number, oldStatus, newStatus: b.result });
            }}
            onClose={() => setEditing(null)} />
        </Modal>
      )}
      {notify && <NotifyStatusChangeModal {...notify} onClose={() => setNotify(null)} />}
      <Table
        cols={[
          { label: "Number", sortValue: r => r.number, render: r => <span style={{ fontWeight: 700, color: "#60a5fa" }}>{r.number}</span> },
          { label: "Order", sortValue: r => { const o = orders.find(o => o.id === Number(r.order_id)); return o ? o.order_number : ""; }, render: r => { const o = orders.find(o => o.id === Number(r.order_id)); return o ? `${o.order_number} – ${o.client}` : "—"; }},
          { label: "Date", sortValue: r => r.inspection_date, render: r => fmtDate(r.inspection_date) },
          { label: "Inspector", key: "inspector" },
          { label: "Result", sortValue: r => r.result, render: r => (
  <Select value={r.result}
    onChange={async e => {
      const oldStatus = r.result, newStatus = e.target.value;
      await api(`/inspections/${r.id}`, "PUT", { ...r, status: r.status, result: newStatus }); load();
      setNotify({ entityType: "inspections", recordLabel: r.number, oldStatus, newStatus });
    }}
    style={{ padding: "4px 8px", fontSize: "12px", width: "auto", color: resultColors[r.result] || "#64748b" }}>
    {["Pending","Approved","Rejected","Conditional"].map(s => <option key={s}>{s}</option>)}
  </Select>
)},
          { label: "Report", render: r => {
  let hasMedia = false;
  try {
    const media = typeof r.media === 'string' ? JSON.parse(r.media) : (r.media || []);
    hasMedia = media.filter(Boolean).length > 0;
  } catch { hasMedia = false; }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: hasMedia ? "#10b981" : "#ef4444" }}>
      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: hasMedia ? "#10b981" : "#ef4444", display: "inline-block" }} />
      {hasMedia ? "Attached" : "Missing"}
    </span>
  );
}},
          { label: "Actions", render: r => (
            <div style={{ display: "flex", gap: "6px" }}>
              <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm(t("Delete?"))) { await api(`/inspections/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
              <LastModifiedBy name={r.updated_by} />
            </div>
          )},
        ]}
        rows={filtered}
        emptyMsg="No inspections yet."
      />
    </div>
  );
}

// Full cross-module Excel report — one button, one optional "since" date
// filter, downloads a workbook covering every tracking screen (Quotations,
// Proformas, Orders, Commercial, Contracts, Inspections, Supplier Flow,
// Samples, Packing Lists). Each category gets two sheets — everything still
// open first, everything already completed second — built server-side in
// xlsx/reportBuilder.js. This screen is just the trigger; there's no data to
// fetch or list here.
function Reports() {
  const t = useT();
  const [since, setSince] = useState("");
  // Category list comes from the backend (xlsx/reportBuilder.js's own
  // CATEGORIES export) instead of being duplicated here, so the checkboxes
  // can never drift out of sync with what the server actually knows how to
  // build. Starts every category checked — that's still the common case.
  const [categories, setCategories] = useState([]);
  const [checked, setChecked] = useState({});

  useEffect(() => {
    api("/reports/categories").then(list => {
      setCategories(list);
      setChecked(Object.fromEntries(list.map(c => [c.key, true])));
    });
  }, []);

  const toggle = key => setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleAll = value => setChecked(Object.fromEntries(categories.map(c => [c.key, value])));

  const selectedKeys = Object.keys(checked).filter(k => checked[k]);
  const allChecked = categories.length > 0 && selectedKeys.length === categories.length;
  const noneChecked = selectedKeys.length === 0;

  const download = () => {
    if (noneChecked) return;
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    // Omitting ?categories= entirely means "everything" server-side, so only
    // send it when the selection is actually a subset — keeps the URL clean
    // in the (most common) all-selected case.
    if (!allChecked) params.set("categories", selectedKeys.join(","));
    const qs = params.toString();
    window.open(authUrl(`${API}/reports/full${qs ? `?${qs}` : ""}`), "_blank");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>{t("📊 Reports")}</h2>
      </div>
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "12px", padding: "24px", maxWidth: "640px" }}>
        <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.6, margin: "0 0 16px" }}>
          {t("Generates one Excel workbook. Each screen you pick below becomes two sheets — everything still open/pending first, everything already completed second — with status, key dates and values for that screen.")}
        </p>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("Which screens?")}
          </label>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => toggleAll(true)} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: "11.5px", cursor: "pointer", padding: 0 }}>{t("All")}</button>
            <button onClick={() => toggleAll(false)} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: "11.5px", cursor: "pointer", padding: 0 }}>{t("None")}</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: "20px" }}>
          {categories.map(c => (
            <label key={c.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#e2e8f0", cursor: "pointer" }}>
              <input type="checkbox" checked={!!checked[c.key]} onChange={() => toggle(c.key)} />
              {t(c.label)}
            </label>
          ))}
        </div>

        <div style={{ display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Since (optional)" half>
            <Input type="date" value={since} onChange={e => setSince(e.target.value)} />
          </Field>
          <Btn onClick={download} disabled={noneChecked}>⬇ Download Report (.xlsx)</Btn>
        </div>
        {noneChecked && (
          <p style={{ color: "#f87171", fontSize: "11.5px", marginTop: "10px", marginBottom: 0 }}>
            {t("Pick at least one screen above.")}
          </p>
        )}
        <p style={{ color: "#64748b", fontSize: "11.5px", marginTop: "14px", marginBottom: 0 }}>
          {t("Leave the date blank to include everything on record. When set, only records created on or after that date are included, in each screen's own timeline.")}
        </p>
      </div>
    </div>
  );
}

// ─── NAV CONFIG ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "quotations", label: "Quotations", icon: "💬" },
  { id: "proformas", label: "Proformas", icon: "📄" },
  { id: "orders", label: "Orders", icon: "📋" },
  { id: "commercial", label: "Commercial", icon: "🧾" },
  { id: "packing-lists", label: "Packing Lists", icon: "📑" },
  { id: "contracts", label: "Contracts", icon: "🤝" },
  { id: "inspections", label: "Inspections", icon: "🔍" },
  { id: "fin-suppliers", label: "Supplier Flow", icon: "📦" },
  { id: "samples", label: "Samples", icon: "✏️" },
  { id: "products", label: "Products", icon: "🗂" },
  { id: "clients", label: "Clients", icon: "🏢" },
  { id: "suppliers", label: "Suppliers", icon: "🏭" },
  { id: "freight-agents", label: "Freight Agents", icon: "🚢" },
  { id: "reports", label: "Reports", icon: "📊" },
];

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

// Replaces the old single shared password (which lived in this file, in
// plain text, shipped straight to every visitor's browser) with real
// per-person logins verified server-side. Each of the 9 accounts has its
// own username/password; the backend hashes and checks passwords and every
// API route now requires the session token this screen gets back.
function LoginScreen({ onLoggedIn }) {
  const t = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username || !password || busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t("Incorrect username or password."));
        return;
      }
      setAuthToken(data.token);
      const user = { name: data.name, username: data.username, mustChangePassword: !!data.mustChangePassword, permissions: data.permissions };
      localStorage.setItem("af_user", JSON.stringify(user));
      onLoggedIn(user);
    } catch {
      setError(t("Could not reach the server. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#020617", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px",
        padding: "40px 48px", width: "100%", maxWidth: "380px",
        boxShadow: "0 25px 60px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", gap: "24px",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>Alliance Global System</div>
          <div style={{ fontSize: "12px", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "4px" }}>{t("Order Management")}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("Name")}</label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              placeholder={t("Name")}
              autoCapitalize="off" autoCorrect="off"
              style={{
                background: "#1e293b", border: `1px solid ${error ? "#ef4444" : "#334155"}`,
                borderRadius: "8px", padding: "12px 14px", color: "#f1f5f9",
                fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", marginTop: "6px",
              }}
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("Password")}</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              placeholder={t("Enter password…")}
              style={{
                background: "#1e293b", border: `1px solid ${error ? "#ef4444" : "#334155"}`,
                borderRadius: "8px", padding: "12px 14px", color: "#f1f5f9",
                fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", marginTop: "6px",
              }}
            />
          </div>
          {error && <div style={{ color: "#ef4444", fontSize: "12px" }}>{t(error)}</div>}
          <button
            onClick={submit}
            disabled={busy}
            style={{
              background: "#3b82f6", border: "none", borderRadius: "8px",
              padding: "12px", color: "#fff", fontSize: "14px", fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer", marginTop: "4px", opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? t("Signing in…") : t("Enter")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Shown right after login for any account still on its original temporary
// password (must_change_password) — forces setting a real one before the
// person can reach any actual data.
function ForceChangePasswordScreen({ user, onDone }) {
  const t = useT();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (pw1.length < 6) return setError(t("Password must be at least 6 characters."));
    if (pw1 !== pw2) return setError(t("Passwords don't match."));
    setError("");
    setBusy(true);
    try {
      await api("/change-password", "POST", { newPassword: pw1 });
      const updated = { ...user, mustChangePassword: false };
      localStorage.setItem("af_user", JSON.stringify(updated));
      onDone(updated);
    } catch {
      setError(t("Couldn't update your password. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#020617", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px",
        padding: "40px 48px", width: "100%", maxWidth: "380px",
        boxShadow: "0 25px 60px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", gap: "20px",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#f1f5f9" }}>{t("Welcome,")} {user.name}</div>
          <div style={{ fontSize: "12.5px", color: "#94a3b8", marginTop: "8px", lineHeight: 1.5 }}>
            {t("This is your first time signing in. Set a new password to continue — the temporary one won't work again after this.")}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("New password")}</label>
            <input
              type="password" value={pw1}
              onChange={e => { setPw1(e.target.value); setError(""); }}
              style={{
                background: "#1e293b", border: `1px solid ${error ? "#ef4444" : "#334155"}`,
                borderRadius: "8px", padding: "12px 14px", color: "#f1f5f9",
                fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", marginTop: "6px",
              }}
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("Confirm password")}</label>
            <input
              type="password" value={pw2}
              onChange={e => { setPw2(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              style={{
                background: "#1e293b", border: `1px solid ${error ? "#ef4444" : "#334155"}`,
                borderRadius: "8px", padding: "12px 14px", color: "#f1f5f9",
                fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", marginTop: "6px",
              }}
            />
          </div>
          {error && <div style={{ color: "#ef4444", fontSize: "12px" }}>{t(error)}</div>}
          <button
            onClick={submit}
            disabled={busy}
            style={{
              background: "#3b82f6", border: "none", borderRadius: "8px",
              padding: "12px", color: "#fff", fontSize: "14px", fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer", marginTop: "4px", opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? t("Saving…") : t("Set password & continue")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Tiny helper so the "stale session, no permissions cached" bounce-back can
// clear state from inside a useEffect (a proper side effect) instead of
// directly in App's render body.
function StaleSessionLogout({ onDone }) {
  useEffect(() => { onDone(); }, []);
  return null;
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("af_user");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  // Lands the person on the first screen they're actually allowed to see
  // (in sidebar order) instead of a hardcoded "dashboard" — several
  // accounts don't have Dashboard access at all (see permissions.js), so
  // defaulting to it would show them a blank/broken tab on first login.
  const [tab, setTab] = useState(() => {
    try {
      const raw = localStorage.getItem("af_user");
      const screens = JSON.parse(raw || "null")?.permissions?.screens;
      if (Array.isArray(screens) && screens.length > 0) {
        return TABS.find(navItem => screens.includes(navItem.id))?.id || screens[0];
      }
    } catch { /* fall through to the default below */ }
    return "dashboard";
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("af_lang") || "en"; } catch { return "en"; }
  });
  useEffect(() => {
    try { localStorage.setItem("af_lang", lang); } catch { /* private browsing — fine, just won't persist */ }
  }, [lang]);
  // App is the top of the tree (renders the LanguageContext.Provider
  // itself further down), so it reads its own `lang` state directly rather
  // than through useT()/useContext — same lookup logic either way.
  const t = (key) => (lang === "zh" && TRANSLATIONS.zh[key]) || key;

  const logout = async () => {
    try { await api("/logout", "POST"); } catch { /* token may already be gone — fine either way */ }
    setAuthToken(null);
    localStorage.removeItem("af_user");
    setUser(null);
  };

  // Permissions are captured once at login time and cached in localStorage
  // (see handleLogin below) so a page reload doesn't force everyone to log
  // in again — but that means an account whose permissions changed on the
  // backend (e.g. canViewProfit newly granted to someone) keeps showing the
  // STALE set for as long as that browser tab/session stays open, since
  // nothing ever re-reads them. requireAuth in auth.js already recomputes
  // permissions fresh on every backend request, so GET /api/me always
  // reflects the current truth — this just re-fetches it once per app boot
  // (a real page load/refresh, not every render — see the dependency below)
  // and syncs the result into state + localStorage, so a refresh is enough
  // to pick up a permissions change instead of requiring a full logout.
  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    let cancelled = false;
    api("/me").then(fresh => {
      if (cancelled || !fresh || !fresh.permissions) return;
      setUser(prev => {
        if (!prev) return prev;
        const updated = { ...prev, permissions: fresh.permissions };
        try { localStorage.setItem("af_user", JSON.stringify(updated)); } catch { /* private browsing — fine, just won't persist */ }
        return updated;
      });
    }).catch(() => { /* offline, or session already invalid — api() itself handles a 401 */ });
    return () => { cancelled = true; };
  }, [user?.username]);

  if (!user) {
    return (
      <LanguageContext.Provider value={{ lang, setLang }}>
        <LoginScreen onLoggedIn={setUser} />
      </LanguageContext.Provider>
    );
  }

  if (user.mustChangePassword) {
    return (
      <LanguageContext.Provider value={{ lang, setLang }}>
        <ForceChangePasswordScreen user={user} onDone={setUser} />
      </LanguageContext.Provider>
    );
  }

  // Sessions saved before per-user screen access existed have no
  // `permissions` in localStorage — rather than let that silently mean
  // "no screens allowed" (or, worse, accidentally full access), just bounce
  // back to the login screen once so the next login response fills it in.
  // Done in an effect (not directly in render) since it's a side effect.
  if (!user.permissions) {
    return <StaleSessionLogout onDone={() => { setAuthToken(null); localStorage.removeItem("af_user"); setUser(null); }} />;
  }

  // Sidebar only ever offers screens this account is allowed to open — and
  // `tab` itself is always initialized from those same allowed screens (see
  // the useState above), so in practice `tab` can't drift outside
  // `allowedScreens` just from clicking around. `effectiveTab` is a cheap
  // extra guard for the edge case anyway (falls back to this account's
  // first allowed screen instead of rendering a blank pane) — no separate
  // effect/redirect needed since this is computed fresh every render.
  const allowedScreens = user.permissions.screens || [];
  const visibleTabs = TABS.filter(navItem => allowedScreens.includes(navItem.id));
  const effectiveTab = allowedScreens.includes(tab) ? tab : (visibleTabs[0]?.id || null);

const renderTab = () => {
    switch (effectiveTab) {
      case "dashboard": return <Dashboard />;
      case "orders": return <Orders />;
      case "clients": return <Clients />;
      case "suppliers": return <Suppliers />;
      case "freight-agents": return <FreightAgents />;
      case "products": return <Products />;
      case "samples": return <Samples />;
      case "quotations": return <Quotations />;
      case "inspections": return <Inspections />;
      case "proformas": return <Proformas />;
      case "commercial": return <CommercialInvoices />;
      case "packing-lists": return <PackingLists />;
      case "contracts": return <Contracts />;
      case "fin-suppliers": return <Financial type="supplier" />;
      case "reports": return <Reports />;
      default: return null;
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #020617; font-family: 'DM Sans', sans-serif; color: #cbd5e1; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
        input:focus, select:focus, textarea:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
        @keyframes notifToastIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Sidebar */}
        <aside style={{
          width: sidebarOpen ? "220px" : "60px", background: "#0a0f1e",
          borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column",
          transition: "width 0.2s ease", flexShrink: 0, position: "sticky", top: 0, height: "100vh",
        }}>
          <div style={{ padding: "20px 16px", borderBottom: "1px solid #1e293b" }}>
            {sidebarOpen ? (
              <div>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>{t("Alliance Flow")}</div>
                <div style={{ fontSize: "10px", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("Order Management")}</div>
              </div>
            ) : (
              <div style={{ fontSize: "20px", textAlign: "center" }}>⬡</div>
            )}
          </div>
          <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {/* Renamed the loop var from `t` to `navItem` — `t` is the
                translate function in scope here, and shadowing it inside
                this callback would silently make every t(...) call below
                resolve to the tab object instead. */}
            {visibleTabs.map(navItem => (
              <button key={navItem.id} onClick={() => setTab(navItem.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "10px 10px", borderRadius: "8px", border: "none", cursor: "pointer",
                  background: effectiveTab === navItem.id ? "#1e293b" : "transparent",
                  color: effectiveTab === navItem.id ? "#f1f5f9" : "#64748b",
                  fontFamily: "inherit", fontSize: "13px", fontWeight: effectiveTab === navItem.id ? 600 : 400,
                  textAlign: "left", transition: "all 0.1s",
                  borderLeft: effectiveTab === navItem.id ? "2px solid #3b82f6" : "2px solid transparent",
                }}
                onMouseEnter={e => { if (effectiveTab !== navItem.id) e.currentTarget.style.color = "#94a3b8"; }}
                onMouseLeave={e => { if (effectiveTab !== navItem.id) e.currentTarget.style.color = "#64748b"; }}
              >
                <span style={{ fontSize: "16px", flexShrink: 0, width: "20px", textAlign: "center" }}>{navItem.icon}</span>
                {sidebarOpen && <span style={{ overflow: "hidden", whiteSpace: "nowrap" }}>{t(navItem.label)}</span>}
              </button>
            ))}
          </nav>
          <div style={{ padding: "10px 12px", borderTop: "1px solid #1e293b" }}>
            {sidebarOpen ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
                  <div style={{ fontSize: "10px", color: "#475569" }}>@{user.username}</div>
                </div>
                <button onClick={logout} title={t("Log out")}
                  style={{
                    background: "none", border: "none", color: "#64748b", cursor: "pointer",
                    fontSize: "13px", padding: "4px 6px", borderRadius: "6px", flexShrink: 0,
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                  onMouseLeave={e => e.currentTarget.style.color = "#64748b"}
                >⏻</button>
              </div>
            ) : (
              <button onClick={logout} title={`Log out (${user.name})`}
                style={{
                  width: "100%", background: "none", border: "none", color: "#64748b",
                  cursor: "pointer", fontSize: "16px", textAlign: "center", padding: "4px",
                }}
                onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                onMouseLeave={e => e.currentTarget.style.color = "#64748b"}
              >⏻</button>
            )}
          </div>
          {/* In-app notification bell — same recipients as the e-mail
              notify-picker (see NotifyStatusChangeModal/SendDocumentModal),
              just also visible without leaving the system, with a badge and
              a sound when a poll finds something new. */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid #1e293b" }}>
            <NotificationBell sidebarOpen={sidebarOpen} />
          </div>
          {/* Interface language toggle — only switches the system's own UI
              text (nav, buttons, labels), never PDFs or any registered
              data. */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid #1e293b" }}>
            <button onClick={() => setLang(l => (l === "en" ? "zh" : "en"))}
              title="Switch interface language / 切换界面语言"
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                padding: "8px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px",
                color: "#94a3b8", cursor: "pointer", fontSize: "12px", fontWeight: 600,
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#f1f5f9"}
              onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}
            >
              <span>{lang === "en" ? "🇬🇧" : "🇨🇳"}</span>
              {sidebarOpen && <span>{lang === "en" ? "English" : "简体中文"}</span>}
            </button>
          </div>
          <div style={{ padding: "8px 8px 12px", borderTop: "1px solid #1e293b" }}>
            <button onClick={() => setSidebarOpen(o => !o)}
              style={{
                width: "100%", padding: "8px", background: "none", border: "none",
                color: "#475569", cursor: "pointer", fontSize: "16px", borderRadius: "6px",
                transition: "color 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#94a3b8"}
              onMouseLeave={e => e.currentTarget.style.color = "#475569"}
            >{sidebarOpen ? "◀" : "▶"}</button>
          </div>
        </aside>

        {/* Main — every screen component renders inside this Provider, so
            any of them can call useT() to translate their own text. */}
        <main style={{ flex: 1, padding: "32px", minWidth: 0 }}>
          <div style={{
            background: "#0a1628", border: "1px solid #1e293b", borderRadius: "16px",
            padding: "28px", minHeight: "calc(100vh - 64px)",
          }}>
            <LanguageContext.Provider value={{ lang, setLang }}>
              <UserContext.Provider value={{ permissions: user.permissions }}>
                {renderTab()}
              </UserContext.Provider>
            </LanguageContext.Provider>
          </div>
        </main>
      </div>
    </>
  );
}
