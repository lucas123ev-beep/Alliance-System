const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./database');
const { scheduleBackups, runBackup, listBackups } = require('./backup');
const { sendStatusChangeEmail, fetchAttachment, isRestricted, ENTITY_LABELS } = require('./notifications');

const { renderPdfBuffer } = require('./pdf/render');
const { renderSalesInvoice } = require('./pdf/salesInvoice');
const { renderPackingList } = require('./pdf/packingList');
const { renderContract } = require('./pdf/contract');
const { renderQuotation } = require('./pdf/quotation');
const { buildProfitReportWorkbook } = require('./xlsx/profitReport');
const ACQUISITION_COMPANIES = require('./pdf/acquisitionCompanies');
// The company is a trader with two invoicing entities (HK/Ningbo), but only
// Ningbo is the real Chinese trading company that actually handles
// procurement/export — so the "Manufacturer" shown on client-facing docs and
// the "Buyer" on supplier-facing docs (Contract, Payment Notice) are always
// Ningbo, regardless of which entity (acquisition_company) was picked to
// invoice/bank the client on a given deal.
const NINGBO_ACQ = ACQUISITION_COMPANIES.NINGBO;
const { parseJsonSafe, contentDisposition } = require('./pdf/helpers');

// Download filenames for Proforma/Commercial Invoice/Packing List/Payment
// Notice all key off the Order number (not each document's own internal
// number, and never a raw DB id) so the file the client saves to disk
// immediately tells them which order it belongs to. Order numbers can
// contain slashes/spaces, which would otherwise leak into the filename as
// stray path separators — stripped down to safe characters here.
function safeFilenamePart(s) {
  return String(s || '').replace(/[\/\\:*?"<>|]/g, '-').trim() || 'unknown';
}
const { buildFullReportWorkbook, CATEGORIES: REPORT_CATEGORIES } = require('./xlsx/reportBuilder');
const { buildProductSupplierReportWorkbook } = require('./xlsx/productSupplierReport');
const { buildSupplierEvaluationReportWorkbook } = require('./xlsx/supplierEvaluationReport');
const { buildPaymentNoticeWorkbook } = require('./xlsx/paymentNotice');
const { buildSalesInvoiceWorkbook } = require('./xlsx/salesInvoiceXlsx');
const { buildPackingListWorkbook } = require('./xlsx/packingListXlsx');
const { PROBLEM_OPTIONS, SOLUTION_OPTIONS, findProblem, findSolution, computeRating } = require('./supplierEvaluationOptions');
const {
  hashPassword, verifyPassword, generateToken, generateTempPassword, requireAuth, guardScreen, actorName,
  isLockedOut, lockoutMinutesRemaining, recordFailedLogin, resetFailedLogins,
} = require('./auth');
const { permissionsFor, ALL_SCREENS } = require('./permissions');

const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();

// Render sits in front of this service as a reverse proxy — without this,
// Express (and anything that reads req.ip, like the rate limiters below)
// sees every request as coming from Render's internal proxy IP instead of
// the real client, which would make IP-based rate limiting useless.
app.set('trust proxy', 1);

// Adds a standard set of protective HTTP response headers (blocks MIME
// sniffing, disables framing to prevent clickjacking, forces HTTPS via
// HSTS, etc.) — cheap, standard hardening with no behavior change for a
// JSON API like this one.
app.use(helmet());

// General ceiling on how many requests one IP can make. Set high on purpose:
// several people on this team share the same office/VPN exit IP, so this
// counter is really "9 people's traffic combined," not one person's. The
// goal here is only to catch a runaway script or a leaked token being
// hammered thousands of times — not to ever get in the way of normal use,
// even on a busy day.
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Tighter limit specifically on /api/login, on top of the per-account
// lockout in auth.js — that lockout stops one *account* from being
// guessed, this stops one *IP* from hammering the login endpoint across
// many different usernames. skipSuccessfulRequests means a normal,
// successful login never counts against this limit at all — only wrong
// passwords do — so a shared VPN IP with several people logging in
// correctly around the same time never gets close to the ceiling; only
// an actual burst of failed attempts does.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts from this network. Please try again later.' },
});

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      "http://localhost:5173",
      "https://alliance-system.vercel.app",
      "https://alliance-system.app",
      // The iOS app (Capacitor) serves its bundled frontend from these
      // pseudo-origins instead of a real domain — capacitor://localhost is
      // the default WKWebView origin, https://localhost is what it becomes
      // if the app is ever configured with `server.iosScheme: "https"`.
      "capacitor://localhost",
      "https://localhost",
    ];
    if (!origin || allowed.includes(origin) || origin.endsWith(".vercel.app")) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
}));
app.use(express.json());

// ─── AUTH ────────────────────────────────────────────────────────────────────
// Replaces the old setup where a single password lived in the frontend
// bundle and the backend had no login check at all. /api/login is the only
// route below that's reachable without a valid session — the requireAuth
// middleware registered right after it protects every route defined below
// this point in the file (Express applies middleware in registration
// order, so anything defined above this block is NOT covered by it — keep
// all real routes below this block).
app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim().toLowerCase());

  // Checked before verifying the password so a locked-out account can't be
  // used to keep guessing indefinitely just by re-sending the same request.
  if (user && isLockedOut(user)) {
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${lockoutMinutesRemaining(user)} minute(s).`,
    });
  }

  if (!user || !verifyPassword(password, user.password_hash)) {
    // Only real accounts accumulate failed attempts — recording them for a
    // username that doesn't exist would let someone probe which usernames
    // are valid by watching for a lockout response.
    if (user) recordFailedLogin(db, user);
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  resetFailedLogins(db, user.id);
  const token = generateToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  res.json({
    token, name: user.name, username: user.username,
    mustChangePassword: !!user.must_change_password,
    permissions: permissionsFor(user.username),
  });
});

app.use('/api', requireAuth(db));

app.post('/api/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  res.json(req.user);
});

app.post('/api/change-password', (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(hashPassword(newPassword), req.user.id);
  res.json({ success: true });
});

// Lets a full-access account (lucas/martiello/gabriel/juliana — anyone whose
// own permissions cover every screen) generate a fresh one-time password
// for anybody else, e.g. after using someone's account to test their
// restricted view, which consumes their original temp password by forcing
// a real one to be set. Same shape as the very first seed (see
// seedUsers.js): a random readable password, must_change_password set back
// to 1 so the next login forces them to pick their own, and any existing
// lockout/failed-attempt count cleared. There's no UI for this on purpose —
// call it once via fetch() from the browser console while logged in as an
// admin account (see the reply this was requested in for the exact
// snippet), same "small trusted team, admin hands out credentials
// directly" reasoning as the initial rollout.
app.post('/api/admin/users/:username/reset-password', (req, res) => {
  const isAdmin = req.user.permissions && ALL_SCREENS.every(s => req.user.permissions.screens.includes(s));
  if (!isAdmin) return res.status(403).json({ error: "You don't have access to this." });

  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.params.username || '').trim().toLowerCase());
  if (!target) return res.status(404).json({ error: 'No account with that username.' });

  const password = generateTempPassword();
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?')
    .run(hashPassword(password), target.id);
  // Also drop any active sessions for that account so a device that's
  // already logged in doesn't keep working on the old password indefinitely.
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);

  res.json({ username: target.username, name: target.name, password });
});

// ─── ORDERS ──────────────────────────────────────────────────────────────────

app.get('/api/orders', (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, 
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
    FROM orders o ORDER BY o.created_at DESC
  `).all();
  res.json(orders);
});

// Registered ABOVE the generic /api/orders/:id route just below — Express
// matches routes in registration order, not by specificity, so if this sat
// after /api/orders/:id (as it originally did), a request for
// "/api/orders/profitability-report" would match :id="profitability-report"
// first and 404 with "Order not found" before ever reaching this handler.
// requireProfitAccess/computeOrderProfitability/buildProfitReportWorkbook
// are all `function`/top-level `const` declarations elsewhere in this file,
// which are fully hoisted/initialized by the time any request actually
// comes in, so defining this route this early (before their own textual
// definitions further down) is safe.
//
// ?all=1 -> every Completed order. Otherwise ?ids=1,2,3 -> exactly those
// orders (any status — a privileged user picking specific orders by hand is
// trusted to know why), matching the "one, some, or all" report Lucas asked
// for. Always forces the USD base (see computeOrderProfitability) so a
// report spanning orders in different currencies still has a meaningful
// grand total row.
app.get('/api/orders/profitability-report', requireProfitAccess, async (req, res) => {
  try {
    let orderRows;
    if (req.query.all === '1') {
      orderRows = db.prepare(`SELECT * FROM orders WHERE status='Completed' ORDER BY order_number ASC`).all();
    } else {
      const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length === 0) return res.status(400).json({ error: 'No orders selected' });
      orderRows = ids.map(id => db.prepare('SELECT * FROM orders WHERE id=?').get(id)).filter(Boolean);
    }
    if (orderRows.length === 0) return res.status(404).json({ error: 'No orders found' });

    const results = [];
    for (const order of orderRows) {
      results.push(await computeOrderProfitability(order, 'USD'));
    }

    const workbook = buildProfitReportWorkbook({ generatedAt: new Date().toISOString().slice(0, 10), currency: 'USD', orders: results });
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `AllianceFlow-Profitability-Report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(filename),
    });
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Profitability report error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  // ORDER BY id (not left to SQLite's default, which isn't guaranteed to be
  // insertion order) so items always list in the order they were actually
  // added to the order — everywhere this order's items show up (Order
  // screen, Proformas, Packing Lists...) reads the same sequence.
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC').all(req.params.id);
  res.json({ ...order, items });
});

app.post('/api/orders', guardScreen('orders'), (req, res) => {
  const { order_number, client, supplier, product, value, currency, production_lead_time, delivery_days,
    shipment_date, arrival_date, incoterm, payment_terms, port_of_loading,
    port_of_discharge, freight_value, acquisition_company, container, container_qty, notes, items } = req.body;
  try {
    const insert = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO orders (order_number, client, supplier, product, value, currency, production_lead_time, delivery_days,
          shipment_date, arrival_date, incoterm, payment_terms, port_of_loading, port_of_discharge, freight_value, acquisition_company, container, container_qty, notes, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(order_number, client, supplier, product, value, currency || 'USD', production_lead_time || null, delivery_days || null,
        shipment_date, arrival_date, incoterm, payment_terms, port_of_loading, port_of_discharge, freight_value || '', acquisition_company || '', container || '', container_qty, notes, actorName(req));
      const orderId = result.lastInsertRowid;
      if (items && items.length > 0) {
        const insertItem = db.prepare(`
          INSERT INTO order_items (order_id, product_id, product_name, product_code, supplier, quantity, unit, unit_price, currency, total, total_weight, total_meterage, cost_price, cost_currency, category, sale_per_meter, cost_per_meter, sale_per_liter, cost_per_liter, sale_pct, target_price, target_price_unit, height, height_unit, price_basis, sale_per_ton, cost_per_ton)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of items) {
          insertItem.run(orderId, item.product_id || null, item.product_name,
            item.product_code || null, item.supplier || null, item.quantity,
            item.unit || 'unit', item.unit_price, item.currency || 'USD', item.total || 0, item.total_weight || null, item.total_meterage || null, item.cost_price || null, item.cost_currency || null, item.category || null, item.sale_per_meter || null, item.cost_per_meter || null,
            item.sale_per_liter || null, item.cost_per_liter || null, item.sale_pct || null, item.target_price || null, item.target_price_unit || null, item.height || null, item.height_unit || null,
            item.price_basis || null, item.sale_per_ton || null, item.cost_per_ton || null);
        }
      }
      return orderId;
    });
    const orderId = insert();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/orders/:id', guardScreen('orders'), (req, res) => {
  const { order_number, client, supplier, product, value, currency, production_lead_time, delivery_days,
    shipment_date, arrival_date, incoterm, payment_terms, port_of_loading,
    port_of_discharge, freight_value, acquisition_company, container, container_qty, notes, items } = req.body;
  db.prepare(`
    UPDATE orders SET order_number=?, client=?, supplier=?, product=?, value=?, currency=?,
      production_lead_time=?, delivery_days=?, shipment_date=?, arrival_date=?, incoterm=?,
      payment_terms=?, port_of_loading=?, port_of_discharge=?, freight_value=?, acquisition_company=?, container=?, container_qty=?, notes=?,
      updated_by=?, updated_at=datetime('now')
    WHERE id=?
  `).run(order_number, client, supplier, product, value, currency, production_lead_time || null, delivery_days || null,
    shipment_date, arrival_date, incoterm, payment_terms, port_of_loading,
    port_of_discharge, freight_value || '', acquisition_company || '', container || '', container_qty || null, notes, actorName(req), req.params.id);

db.prepare('DELETE FROM order_items WHERE order_id=?').run(req.params.id);
if (items && items.length > 0) {
const insertItem = db.prepare(`
  INSERT INTO order_items (order_id, product_id, product_name, product_code, supplier, quantity, unit, unit_price, currency, total, total_weight, total_meterage, cost_price, cost_currency, category, sale_per_meter, cost_per_meter, sale_per_liter, cost_per_liter, sale_pct, target_price, target_price_unit, height, height_unit, price_basis, sale_per_ton, cost_per_ton)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
  for (const item of items) {
insertItem.run(req.params.id, item.product_id || null, item.product_name,
  item.product_code || null, item.supplier || null, item.quantity,
  item.unit || 'unit', item.unit_price, item.currency || 'USD', item.total || 0, item.total_weight || null, item.total_meterage || null, item.cost_price || null, item.cost_currency || null, item.category || null, item.sale_per_meter || null, item.cost_per_meter || null,
  item.sale_per_liter || null, item.cost_per_liter || null, item.sale_pct || null, item.target_price || null, item.target_price_unit || null, item.height || null, item.height_unit || null,
  item.price_basis || null, item.sale_per_ton || null, item.cost_per_ton || null);
  }
}

  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  const savedItems = db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id ASC').all(req.params.id);
  res.json({ ...order, items: savedItems });
});

app.delete('/api/orders/:id', guardScreen('orders'), (req, res) => {
  try {
    db.prepare('DELETE FROM order_items WHERE order_id=?').run(req.params.id);
    // The Proforma is the SOURCE document an Order gets created from — not a
    // byproduct of it — so deleting an Order must never delete the Proforma
    // that spawned it. Just unlink it (it goes back to having no linked
    // Order, same as a Proforma that never had one created yet).
    db.prepare('UPDATE proformas SET order_id=NULL WHERE order_id=?').run(req.params.id);
    // Contracts, Commercial Invoices, Inspections and Packing Lists are all
    // generated downstream FROM the Order itself, so it's correct for them
    // to go away with it.
    db.prepare('DELETE FROM supplier_contracts WHERE order_id=?').run(req.params.id);
    db.prepare('DELETE FROM commercial_invoices WHERE order_id=?').run(req.params.id);
    db.prepare('DELETE FROM inspections WHERE order_id=?').run(req.params.id);
    db.prepare('DELETE FROM packing_lists WHERE order_id=?').run(req.params.id);
    db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Pending', 'In Production', 'Inspection', 'Shipment', 'Completed'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  // completed_at drives which day's exchange rate the real-profit
  // calculation converts costs at (see computeOrderProfitability) — stamped
  // the moment status actually becomes Completed, and cleared if it's ever
  // moved back off Completed (e.g. a mistake reopened), so it never keeps
  // reporting a stale "completed" date for an order that no longer is.
  const completedAt = status === 'Completed' ? "datetime('now')" : 'NULL';
  db.prepare(`UPDATE orders SET status=?, updated_by=?, updated_at=datetime('now'), completed_at=${completedAt} WHERE id=?`)
    .run(status, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id));
});

app.delete('/api/contracts/:id', guardScreen('contracts'), (req, res) => {
  db.prepare('DELETE FROM supplier_contracts WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  // Addition order (registration order), not alphabetical — same reasoning
  // as order_items: the list should read in the order things were actually
  // added. The Products screen's own column headers are click-to-sort, so
  // anyone who wants it alphabetical (or by any other column) can still get
  // that with one click — this is just the starting default.
  res.json(db.prepare('SELECT * FROM products ORDER BY id ASC').all());
});

// Single product by id -- used by the Order/Quotation item list's "refresh
// from registered product" button (App.jsx) to pull the live current price
// (and every other registered field) for one specific item without having
// to re-fetch/re-search the whole product list.
app.get('/api/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(row);
});

// The field that actually represents a product's "price" changes by
// category/basis — mirrors the frontend's productRate() in App.jsx exactly
// (Textile/DTF Film -> per meter, Chemical -> per ton or per liter
// depending on price_basis, everything else -> unit_cost/sale_price).
// Both this and productRate() must stay in sync; if one changes the other
// needs the same edit.
function priceFieldFor(category, priceBasis, kind) {
  const isTextile = category === 'Textile' || category === 'DTF Film';
  const isChemical = category === 'Chemical';
  const isTon = isChemical && priceBasis === 'ton';
  if (isTextile) return kind === 'cost' ? 'cost_per_meter' : 'sale_per_meter';
  if (isChemical) return isTon
    ? (kind === 'cost' ? 'cost_per_ton' : 'sale_per_ton')
    : (kind === 'cost' ? 'cost_per_liter' : 'sale_per_liter');
  return kind === 'cost' ? 'unit_cost' : 'sale_price';
}

// Writes a product_price_history row whenever the registered Cost or Sale
// rate actually changed (or, for a brand-new product with oldRow=null,
// records the starting price as the first history point). Called from both
// the create and update routes below — never touched anywhere else.
function recordPriceHistory(productId, oldRow, newRow, actor) {
  ['cost', 'sale'].forEach(kind => {
    const field = priceFieldFor(newRow.category, newRow.price_basis, kind);
    const newVal = parseFloat(newRow[field]);
    if (!Number.isFinite(newVal) || newVal === 0) return; // nothing registered yet
    const oldVal = oldRow ? parseFloat(oldRow[field]) : null;
    if (oldRow && Number.isFinite(oldVal) && oldVal === newVal) return; // unchanged
    const currency = kind === 'cost' ? newRow.cost_currency : newRow.sale_currency;
    db.prepare(`
      INSERT INTO product_price_history (product_id, kind, field, old_value, new_value, currency, changed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(productId, kind, field, Number.isFinite(oldVal) ? oldVal : null, newVal, currency || 'USD', actor);
  });
}

app.post('/api/products', guardScreen('products'), (req, res) => {
  const { code, name, name_zh, description, unit, ncm, hs_code, color, color_zh, client_color_code, width, width_unit, height, height_unit, thickness, thickness_unit, weight, weight_unit, net_weight, tube_weight, tube_weight_unit, roll_diameter, roll_diameter_unit, volume, volume_unit, unit_cost, cost_currency, category, supplier, sale_price, sale_currency, cost_per_meter, sale_per_meter, cost_per_liter, sale_per_liter, sale_pct, media, price_basis, cost_per_ton, sale_per_ton, vat_pct, units_per_package, package_weight, selling_unit } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO products (code, name, name_zh, description, unit, ncm, hs_code, color, color_zh, client_color_code, width, width_unit, height, height_unit, thickness, thickness_unit, weight, weight_unit, net_weight, tube_weight, tube_weight_unit, roll_diameter, roll_diameter_unit, volume, volume_unit, unit_cost, cost_currency, category, supplier, sale_price, sale_currency, cost_per_meter, sale_per_meter, cost_per_liter, sale_per_liter, sale_pct, media, price_basis, cost_per_ton, sale_per_ton, vat_pct, units_per_package, package_weight, selling_unit, updated_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(code, name, name_zh || '', description, unit || 'unit', ncm || '', hs_code || '', color || '', color_zh || '', client_color_code || '', width, width_unit || 'cm', height, height_unit || 'cm', thickness, thickness_unit || 'mm', weight, weight_unit || 'kg', net_weight || null, tube_weight || null, tube_weight_unit || 'kg', roll_diameter || null, roll_diameter_unit || 'cm', volume || null, volume_unit || 'L', unit_cost || 0, cost_currency || 'USD', category, supplier, sale_price || 0, sale_currency || 'USD', cost_per_meter || 0, sale_per_meter || 0, cost_per_liter || 0, sale_per_liter || 0, sale_pct || null, media || null, price_basis || 'liter', cost_per_ton || 0, sale_per_ton || 0, vat_pct || null, units_per_package || null, package_weight || null, selling_unit || null, actorName(req));
    const created = db.prepare('SELECT * FROM products WHERE id=?').get(result.lastInsertRowid);
    recordPriceHistory(result.lastInsertRowid, null, created, actorName(req));
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/products/:id', guardScreen('products'), (req, res) => {
  const { code, name, name_zh, description, unit, ncm, hs_code, color, color_zh, client_color_code, width, width_unit, height, height_unit, thickness, thickness_unit, weight, weight_unit, net_weight, tube_weight, tube_weight_unit, roll_diameter, roll_diameter_unit, volume, volume_unit, unit_cost, cost_currency, category, supplier, sale_price, sale_currency, cost_per_meter, sale_per_meter, cost_per_liter, sale_per_liter, sale_pct, media, price_basis, cost_per_ton, sale_per_ton, vat_pct, units_per_package, package_weight, selling_unit } = req.body;
  const oldRow = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  db.prepare(`
    UPDATE products SET code=?, name=?, name_zh=?, description=?, unit=?, ncm=?, hs_code=?, color=?, color_zh=?, client_color_code=?, width=?, width_unit=?, height=?, height_unit=?, thickness=?, thickness_unit=?, weight=?, weight_unit=?, net_weight=?, tube_weight=?, tube_weight_unit=?, roll_diameter=?, roll_diameter_unit=?, volume=?, volume_unit=?, unit_cost=?, cost_currency=?, category=?, supplier=?, sale_price=?, sale_currency=?, cost_per_meter=?, sale_per_meter=?, cost_per_liter=?, sale_per_liter=?, sale_pct=?, media=?, price_basis=?, cost_per_ton=?, sale_per_ton=?, vat_pct=?, units_per_package=?, package_weight=?, selling_unit=?, updated_by=?
WHERE id=?
`).run(code, name, name_zh || '', description, unit, ncm || '', hs_code || '', color || '', color_zh || '', client_color_code || '', width, width_unit || 'cm', height, height_unit || 'cm', thickness, thickness_unit || 'mm', weight, weight_unit || 'kg', net_weight || null, tube_weight || null, tube_weight_unit || 'kg', roll_diameter || null, roll_diameter_unit || 'cm', volume || null, volume_unit || 'L', unit_cost, cost_currency || 'USD', category, supplier, sale_price, sale_currency || 'USD', cost_per_meter, sale_per_meter, cost_per_liter || 0, sale_per_liter || 0, sale_pct || null, media || null, price_basis || 'liter', cost_per_ton || 0, sale_per_ton || 0, vat_pct || null, units_per_package || null, package_weight || null, selling_unit || null, actorName(req), req.params.id);
  const updated = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  recordPriceHistory(req.params.id, oldRow, updated, actorName(req));
  res.json(updated);
});

// ─── EXCHANGE RATES ──────────────────────────────────────────────────────────
// Powers the Products screen's live "Real Margin" indicator: Cost and Sale
// Price can be registered in different currencies (RMB from a Chinese
// supplier vs. USD quoted to the client), so comparing the two raw numbers
// directly is meaningless — a healthy margin can look like a huge loss and
// vice versa unless one side is converted through a real exchange rate.
// Frankfurter (ECB reference rates, api.frankfurter.app) needs no API key
// and updates once a day on banking days — plenty for this use case, so
// results are cached here for 24h instead of hitting it on every request.
const FX_CURRENCIES = ['CNY', 'EUR', 'BRL', 'GBP', 'JPY', 'HKD'];
let fxCache = { date: null, rates: null };

async function getFxRates() {
  const today = new Date().toISOString().slice(0, 10);
  if (fxCache.date === today && fxCache.rates) {
    return { rates: fxCache.rates, date: fxCache.date, stale: false };
  }
  try {
    const resp = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${FX_CURRENCIES.join(',')}`);
    if (!resp.ok) throw new Error(`Frankfurter responded ${resp.status}`);
    const data = await resp.json();
    const rates = { USD: 1, ...data.rates };
    fxCache = { date: today, rates };
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('fx_rates', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
    `).run(JSON.stringify({ date: today, rates }));
    return { rates, date: today, stale: false };
  } catch (err) {
    console.error('Exchange rate fetch failed, falling back to last known rates:', err.message);
    // Live provider unreachable (or Render's outbound network hiccuped) —
    // fall back to whatever we last saw this boot, then to the last
    // snapshot persisted to app_settings (survives a restart), rather than
    // breaking the margin calculation entirely.
    if (fxCache.rates) return { rates: fxCache.rates, date: fxCache.date, stale: true };
    const saved = db.prepare(`SELECT value FROM app_settings WHERE key='fx_rates'`).get();
    if (saved) {
      const parsed = JSON.parse(saved.value);
      fxCache = { date: parsed.date, rates: parsed.rates };
      return { rates: parsed.rates, date: parsed.date, stale: true };
    }
    throw err;
  }
}

app.get('/api/exchange-rates', async (req, res) => {
  try {
    const { rates, date, stale } = await getFxRates();
    res.json({ base: 'USD', date, stale, rates });
  } catch (err) {
    res.status(502).json({ error: 'Could not fetch exchange rates', message: err.message });
  }
});

// Historical counterpart to getFxRates() — used by computeOrderProfitability
// so an order's real profit is converted at the exchange rate that was
// actually in effect the day the deal closed (order.completed_at), not
// whatever the rate happens to be on the day someone opens the report. A
// dated rate never changes once published, so each one is cached forever
// (in-memory per boot + persisted to app_settings keyed by date) instead of
// the 24h freshness check getFxRates() does for "today".
const fxHistoryCache = {};
async function getFxRatesForDate(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  // No completion date yet (order not Completed) or the date is today/future
  // (Frankfurter has no rate for a day that hasn't closed) — today's live
  // rate is the correct answer here anyway.
  if (!dateStr || dateStr >= today) return getFxRates();
  if (fxHistoryCache[dateStr]) return { rates: fxHistoryCache[dateStr], date: dateStr, stale: false };

  const settingsKey = `fx_rates_${dateStr}`;
  const saved = db.prepare(`SELECT value FROM app_settings WHERE key=?`).get(settingsKey);
  if (saved) {
    const rates = JSON.parse(saved.value);
    fxHistoryCache[dateStr] = rates;
    return { rates, date: dateStr, stale: false };
  }
  try {
    const resp = await fetch(`https://api.frankfurter.app/${dateStr}?from=USD&to=${FX_CURRENCIES.join(',')}`);
    if (!resp.ok) throw new Error(`Frankfurter responded ${resp.status}`);
    const data = await resp.json();
    const rates = { USD: 1, ...data.rates };
    fxHistoryCache[dateStr] = rates;
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
    `).run(settingsKey, JSON.stringify(rates));
    return { rates, date: dateStr, stale: false };
  } catch (err) {
    console.error(`Historical exchange rate fetch failed for ${dateStr}, falling back to current rate:`, err.message);
    return getFxRates();
  }
}

app.delete('/api/products/:id', guardScreen('products'), (req, res) => {
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/products/:id/price-history', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM product_price_history WHERE product_id=? ORDER BY changed_at ASC, id ASC
  `).all(req.params.id);
  res.json(rows);
});

// ─── SAMPLES ─────────────────────────────────────────────────────────────────

app.get('/api/samples', (req, res) => {
  res.json(db.prepare('SELECT * FROM samples ORDER BY created_at DESC').all());
});

app.post('/api/samples', guardScreen('samples'), (req, res) => {
  const { code, product_id, product_name, category, client, supplier, requested_date, ready_date, sent_date, feedback_date, status, notes, media } = req.body;
  const result = db.prepare(`
    INSERT INTO samples (code, product_id, product_name, category, client, supplier, requested_date, ready_date, sent_date, feedback_date, status, notes, media, updated_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(code || '', product_id || null, product_name, category || '', client, supplier || '', requested_date, ready_date || null, sent_date, feedback_date, status || 'Requested', notes, media || null, actorName(req));
  res.status(201).json(db.prepare('SELECT * FROM samples WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/samples/:id', guardScreen('samples'), (req, res) => {
  const { code, product_name, category, client, supplier, requested_date, ready_date, sent_date, status, notes, media } = req.body;
  db.prepare(`
UPDATE samples SET code=?, product_name=?, category=?, client=?, supplier=?, requested_date=?, ready_date=?, sent_date=?, status=?, notes=?, media=?, updated_by=?
WHERE id=?
`).run(code || '', product_name, category || '', client, supplier || '', requested_date, ready_date || null, sent_date, status, notes, media || null, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM samples WHERE id=?').get(req.params.id));
});

app.patch('/api/samples/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE samples SET status=?, updated_by=? WHERE id=?').run(status, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM samples WHERE id=?').get(req.params.id));
});

app.delete('/api/samples/:id', guardScreen('samples'), (req, res) => {
  db.prepare('DELETE FROM samples WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── PROFORMAS ───────────────────────────────────────────────────────────────

app.get('/api/proformas', (req, res) => {
  res.json(db.prepare('SELECT * FROM proformas ORDER BY created_at DESC').all());
});

// POST/PUT intentionally NOT guarded by the "proformas" screen: the
// Quotations screen's "Generate Proforma" / "Edit Proforma" flow calls
// these same two routes directly (see App.jsx's Quotations() component),
// and some accounts have "quotations" access without "proformas" — gating
// these would break that permitted feature for them. DELETE below stays
// guarded since it's only ever reachable from the dedicated Proformas
// screen.
app.post('/api/proformas', (req, res) => {
  const { order_id, quotation_id, number, issue_date, validity, client, total, currency, status, notes,
    acquisition_company, incoterm, way_of_shipment, port_of_loading, port_of_discharge, freight_value, supplier,
    payment_terms, production_days, delivery_days, items, consignee, notify_party } = req.body;
  try {
    const result = db.prepare(`
INSERT INTO proformas (order_id, quotation_id, number, issue_date, validity, client, total, currency, status, notes,
  acquisition_company, incoterm, way_of_shipment, port_of_loading, port_of_discharge, freight_value, supplier,
  payment_terms, production_days, delivery_days, items, consignee, notify_party, updated_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(order_id || null, quotation_id || null, number, issue_date, validity, client, total, currency || 'USD', status || 'Draft', notes,
      acquisition_company || '', incoterm || '', way_of_shipment || 'By Sea', port_of_loading || '', port_of_discharge || '', freight_value || '', supplier || '',
      payment_terms || null, production_days || null, delivery_days || null, items || null, consignee || null, notify_party || null, actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM proformas WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/proformas/:id', (req, res) => {
  const { order_id, number, issue_date, validity, client, total, currency, status, notes,
    acquisition_company, incoterm, way_of_shipment, port_of_loading, port_of_discharge, freight_value, supplier,
    payment_terms, production_days, delivery_days, items, consignee, notify_party } = req.body;
  db.prepare(`
    UPDATE proformas SET order_id=?, number=?, issue_date=?, validity=?, client=?, total=?, currency=?, status=?, notes=?,
      acquisition_company=?, incoterm=?, way_of_shipment=?, port_of_loading=?, port_of_discharge=?, freight_value=?, supplier=?,
      payment_terms=?, production_days=?, delivery_days=?, items=?, consignee=?, notify_party=?, updated_by=?
    WHERE id=?
  `).run(order_id || null, number, issue_date, validity, client, total, currency, status, notes,
    acquisition_company || '', incoterm || '', way_of_shipment || 'By Sea', port_of_loading || '', port_of_discharge || '', freight_value || '', supplier || '',
    payment_terms || null, production_days || null, delivery_days || null, items || null, consignee || null, notify_party || null, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM proformas WHERE id=?').get(req.params.id));
});

app.delete('/api/proformas/:id', guardScreen('proformas'), (req, res) => {
  db.prepare('DELETE FROM proformas WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── SUPPLIER CONTRACTS ───────────────────────────────────────────────────────

app.get('/api/contracts', (req, res) => {
  res.json(db.prepare('SELECT * FROM supplier_contracts ORDER BY created_at DESC').all());
});

app.post('/api/contracts', guardScreen('contracts'), (req, res) => {
  const { order_id, contract_number, supplier, sign_date, delivery_date, total, currency, status, notes, items_json } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO supplier_contracts (order_id, contract_number, supplier, sign_date, delivery_date, total, currency, status, notes, items_json, updated_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(order_id || null, contract_number, supplier, sign_date, delivery_date, total, currency || 'USD', status || 'Draft', notes, items_json || null, actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM supplier_contracts WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/contracts/:id', guardScreen('contracts'), (req, res) => {
  const { order_id, contract_number, supplier, sign_date, delivery_date, total, currency, status, notes } = req.body;
  db.prepare(`
    UPDATE supplier_contracts SET order_id=?, contract_number=?, supplier=?, sign_date=?, delivery_date=?, total=?, currency=?, status=?, notes=?, updated_by=?
    WHERE id=?
  `).run(order_id || null, contract_number, supplier, sign_date, delivery_date, total, currency, status, notes, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM supplier_contracts WHERE id=?').get(req.params.id));
});

app.delete('/api/contracts/:id', guardScreen('contracts'), (req, res) => {
  db.prepare('DELETE FROM supplier_contracts WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── FINANCIAL CLIENTS ────────────────────────────────────────────────────────

app.get('/api/financial/clients', (req, res) => {
  res.json(db.prepare('SELECT * FROM financial_clients ORDER BY due_date ASC').all());
});

app.post('/api/financial/clients', guardScreen('clients'), (req, res) => {
  const { order_id, client, description, type, amount, currency, due_date, paid_date, status, notes, paid_amount } = req.body;
  const result = db.prepare(`
    INSERT INTO financial_clients (order_id, client, description, type, amount, currency, due_date, paid_date, status, notes, paid_amount, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(order_id || null, client, description, type, amount, currency || 'USD', due_date, paid_date, status || 'Pending', notes, paid_amount || 0, actorName(req));
  res.status(201).json(db.prepare('SELECT * FROM financial_clients WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/financial/clients/:id', guardScreen('clients'), (req, res) => {
  const { order_id, client, description, type, amount, currency, due_date, paid_date, status, notes, paid_amount } = req.body;
  db.prepare(`
    UPDATE financial_clients SET order_id=?, client=?, description=?, type=?, amount=?, currency=?, due_date=?, paid_date=?, status=?, notes=?, paid_amount=?, updated_by=?
    WHERE id=?
  `).run(order_id || null, client, description, type, amount, currency || 'USD', due_date, paid_date || null, status || 'Pending', notes, paid_amount || 0, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM financial_clients WHERE id=?').get(req.params.id));
});

// `paid_amount` is only meaningful when status is "Partial" — full amount is
// implied for "Paid" and 0 for "Pending"/"Overdue", so those normalize it
// here instead of trusting whatever the client last had cached.
app.patch('/api/financial/clients/:id/status', (req, res) => {
  const { status, paid_date, paid_amount } = req.body;
  const row = db.prepare('SELECT amount FROM financial_clients WHERE id=?').get(req.params.id);
  const normalizedPaidAmount = status === 'Paid' ? (row?.amount || 0) : status === 'Partial' ? (paid_amount || 0) : 0;
  db.prepare('UPDATE financial_clients SET status=?, paid_date=?, paid_amount=?, updated_by=? WHERE id=?').run(status, paid_date || null, normalizedPaidAmount, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM financial_clients WHERE id=?').get(req.params.id));
});

app.delete('/api/financial/clients/:id', guardScreen('clients'), (req, res) => {
  db.prepare('DELETE FROM financial_clients WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── FINANCIAL SUPPLIERS ──────────────────────────────────────────────────────

app.get('/api/financial/suppliers', (req, res) => {
  res.json(db.prepare('SELECT * FROM financial_suppliers ORDER BY due_date ASC').all());
});

// POST intentionally NOT guarded by "fin-suppliers": generating a Supplier
// Contract from the Orders screen ("Generate Supplier Contracts") auto-
// creates the matching payment requirement here as a side effect (see
// App.jsx's Orders() component) — some accounts have "orders"+"contracts"
// without "fin-suppliers", and gating this would break that permitted
// feature for them. PUT/DELETE below stay guarded since editing/deleting
// an existing payment record is only ever reachable from the dedicated
// Supplier Flow screen.
app.post('/api/financial/suppliers', (req, res) => {
  const { order_id, supplier, description, type, amount, currency, due_date, status, notes, contract_id, items_json,
    payer, payment_method, applicant, approved_by, payment_schedule, paid_amount } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO financial_suppliers (order_id, supplier, description, type, amount, currency, due_date, status, notes, contract_id, items_json,
        payer, payment_method, applicant, approved_by, payment_schedule, paid_amount, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, supplier, description, type, amount, currency || 'USD', due_date, status || 'Pending', notes, contract_id || null, items_json || null,
      payer || '', payment_method || '网银汇款 Online bank payment', applicant || '', approved_by || '', payment_schedule || '100', paid_amount || 0, actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM financial_suppliers WHERE id=?').get(result.lastInsertRowid));
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/financial/suppliers/:id', guardScreen('fin-suppliers'), (req, res) => {
  const { order_id, supplier, description, type, amount, currency, due_date, status, notes, contract_id, items_json,
    payer, payment_method, applicant, approved_by, paid_date, payment_schedule, paid_amount } = req.body;
  try {
    db.prepare(`
      UPDATE financial_suppliers SET order_id=?, supplier=?, description=?, type=?, amount=?, currency=?, due_date=?, status=?, notes=?,
        contract_id=?, items_json=?, payer=?, payment_method=?, applicant=?, approved_by=?, paid_date=?, payment_schedule=?, paid_amount=?, updated_by=?
      WHERE id=?
    `).run(order_id || null, supplier, description, type, amount, currency || 'USD', due_date, status || 'Pending', notes,
      contract_id || null, items_json || null, payer || '', payment_method || '网银汇款 Online bank payment', applicant || '', approved_by || '', paid_date || null, payment_schedule || '100', paid_amount || 0, actorName(req), req.params.id);
    res.json(db.prepare('SELECT * FROM financial_suppliers WHERE id=?').get(req.params.id));
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});

// `paid_amount` is only meaningful when status is "Partial" — full amount is
// implied for "Paid" and 0 for "Pending"/"Overdue", so those normalize it
// here instead of trusting whatever the client last had cached. Without this
// the Cash Flow summary cards had no way to reflect a Partial payment: the
// row's full amount just sat in "Pending" regardless of how much was
// actually paid.
app.patch('/api/financial/suppliers/:id/status', (req, res) => {
  const { status, paid_date, paid_amount } = req.body;
  const row = db.prepare('SELECT amount FROM financial_suppliers WHERE id=?').get(req.params.id);
  const normalizedPaidAmount = status === 'Paid' ? (row?.amount || 0) : status === 'Partial' ? (paid_amount || 0) : 0;
  db.prepare('UPDATE financial_suppliers SET status=?, paid_date=?, paid_amount=?, updated_by=? WHERE id=?').run(status, paid_date || null, normalizedPaidAmount, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM financial_suppliers WHERE id=?').get(req.params.id));
});

app.delete('/api/financial/suppliers/:id', guardScreen('fin-suppliers'), (req, res) => {
  db.prepare('DELETE FROM financial_suppliers WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── COMMERCIAL INVOICES ─────────────────────────────────────────────────────
// Shipment Date / Arrival Date are not duplicated onto commercial_invoices —
// the linked Order is the single source of truth, joined in here as
// shipment_date/arrival_date on each row. That's what makes editing the date
// from either screen "just work" without a separate sync step: there's only
// ever one place the value actually lives.
// Commercial Invoice status (Pending/Paid) is hidden entirely from accounts
// with hideCommercialStatus (yukin, max — see permissions.js) — stripped
// here server-side rather than just hidden by CSS, so it isn't visible via
// the browser's network tab either. Applied everywhere a Commercial
// Invoice row goes back to the frontend (list, create, update).
function redactCommercialStatus(req, row) {
  if (!row || !(req.user && req.user.permissions && req.user.permissions.hideCommercialStatus)) return row;
  const { status, ...rest } = row;
  return rest;
}

app.get('/api/commercial-invoices', (req, res) => {
  const rows = db.prepare(`
    SELECT ci.*, o.shipment_date AS shipment_date, o.arrival_date AS arrival_date
    FROM commercial_invoices ci
    LEFT JOIN orders o ON o.id = ci.order_id
    ORDER BY ci.created_at DESC
  `).all();
  res.json(rows.map(r => redactCommercialStatus(req, r)));
});

// Shared by every route that hands a Commercial Invoice back to the
// frontend, so shipment_date/arrival_date (read from the linked Order —
// there's no separate copy on the CI itself) are always present, not just
// on the plain GET-list route. Missing this on the POST response was why
// the "Generate Commercial Invoice" flow opened straight into an edit modal
// with blank date fields even though the Order already had them filled in.
function getCommercialInvoiceWithDates(id) {
  return db.prepare(`
    SELECT ci.*, o.shipment_date AS shipment_date, o.arrival_date AS arrival_date
    FROM commercial_invoices ci LEFT JOIN orders o ON o.id = ci.order_id
    WHERE ci.id=?
  `).get(id);
}

// POST/PUT intentionally NOT guarded by "commercial": the Orders screen's
// "Generate Commercial Invoice" / inline edit flow calls these same two
// routes directly (see App.jsx's Orders() component), and some accounts
// have "orders" without "commercial" — gating these would break that
// permitted feature for them. DELETE below stays guarded since it's only
// ever reachable from the dedicated Commercial Invoices screen. The
// hideCommercialStatus redaction further below applies regardless of any
// of this.
app.post('/api/commercial-invoices', (req, res) => {
  const { order_id, number, issue_date, client, total, currency, status, notes } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO commercial_invoices (order_id, number, issue_date, client, total, currency, status, notes, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, number, issue_date, client, total, currency || 'USD', status || 'Pending', notes, actorName(req));
    res.status(201).json(redactCommercialStatus(req, getCommercialInvoiceWithDates(result.lastInsertRowid)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/commercial-invoices/:id', (req, res) => {
  const { order_id, number, issue_date, client, total, currency, notes, shipment_date, arrival_date } = req.body;
  // Accounts with hideCommercialStatus never see the status field, so they
  // can't legitimately be submitting a real change to it either — keep
  // whatever is already in the database instead of trusting req.body.status
  // here (defense in depth: the frontend already hides this field for
  // them, this just means a raw API call can't slip a status change
  // through even if attempted).
  const hidesStatus = req.user && req.user.permissions && req.user.permissions.hideCommercialStatus;
  const status = hidesStatus
    ? db.prepare('SELECT status FROM commercial_invoices WHERE id=?').get(req.params.id)?.status
    : req.body.status;
  db.prepare(`
    UPDATE commercial_invoices SET order_id=?, number=?, issue_date=?, client=?, total=?, currency=?, status=?, notes=?, updated_by=?
    WHERE id=?
  `).run(order_id || null, number, issue_date, client, total, currency, status, notes, actorName(req), req.params.id);
  // Editing the shipment/arrival date from the Commercial Invoice screen
  // writes straight through to the linked Order — same value, same column,
  // so a change made here is immediately reflected back on the Order (and
  // vice versa, since the Order screen just edits that same column).
  const linkedOrderId = order_id || db.prepare('SELECT order_id FROM commercial_invoices WHERE id=?').get(req.params.id)?.order_id;
  if (linkedOrderId && (shipment_date !== undefined || arrival_date !== undefined)) {
    const current = db.prepare('SELECT shipment_date, arrival_date FROM orders WHERE id=?').get(linkedOrderId);
    if (current) {
      db.prepare(`UPDATE orders SET shipment_date=?, arrival_date=?, updated_at=datetime('now') WHERE id=?`)
        .run(shipment_date !== undefined ? shipment_date : current.shipment_date,
             arrival_date !== undefined ? arrival_date : current.arrival_date,
             linkedOrderId);
    }
  }
  res.json(redactCommercialStatus(req, getCommercialInvoiceWithDates(req.params.id)));
});

app.delete('/api/commercial-invoices/:id', guardScreen('commercial'), (req, res) => {
  db.prepare('DELETE FROM commercial_invoices WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── PACKING LISTS ────────────────────────────────────────────────────────────
// Shipment Date isn't duplicated onto packing_lists — it's read from the
// linked Order (single source of truth, same approach as Commercial
// Invoices), plus the Order's number/client so the list screen doesn't need
// a second round-trip per row.
app.get('/api/packing-lists', (req, res) => {
  res.json(db.prepare(`
    SELECT pl.*, o.order_number AS order_number, o.client AS client,
      o.shipment_date AS shipment_date, o.arrival_date AS arrival_date
    FROM packing_lists pl
    LEFT JOIN orders o ON o.id = pl.order_id
    ORDER BY pl.created_at DESC
  `).all());
});

app.get('/api/packing-lists/:id', (req, res) => {
  const pl = db.prepare('SELECT * FROM packing_lists WHERE id=?').get(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Packing list not found' });
  res.json(pl);
});

app.post('/api/packing-lists', guardScreen('packing-lists'), (req, res) => {
  const { order_id, number, date, way_of_shipment, country_of_origin, country_of_acquisition,
    port_of_origin, port_of_destination, incoterm, manufacturer, manufacturer_address, items_json,
    total_length, total_roll, total_gross_weight, total_net_weight, total_cbm, status, notes, containers_json, loading_date,
    // Freight forwarding info — informational only, never printed on the
    // Packing List PDF itself (renderPackingList/packingList.js never
    // receives these), only ever surfaced on the Order's own report.
    freight_agent, agent_cost, freight_cost, loading_cost,
    agent_currency, freight_currency, loading_currency } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO packing_lists (order_id, number, date, way_of_shipment, country_of_origin, country_of_acquisition,
        port_of_origin, port_of_destination, incoterm, manufacturer, manufacturer_address, items_json,
        total_length, total_roll, total_gross_weight, total_net_weight, total_cbm, status, notes, containers_json, loading_date,
        freight_agent, agent_cost, freight_cost, loading_cost, agent_currency, freight_currency, loading_currency, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, number, date, way_of_shipment || 'By Sea', country_of_origin || 'China', country_of_acquisition || '',
      port_of_origin || '', port_of_destination || '', incoterm || '', manufacturer || '', manufacturer_address || '', items_json || null,
      total_length || 0, total_roll || 0, total_gross_weight || 0, total_net_weight || 0, total_cbm || 0, status || 'Draft', notes || '', containers_json || null, loading_date || null,
      freight_agent || '', agent_cost || null, freight_cost || null, loading_cost || null,
      agent_currency || 'USD', freight_currency || 'USD', loading_currency || 'USD', actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM packing_lists WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/packing-lists/:id', guardScreen('packing-lists'), (req, res) => {
  const { order_id, number, date, way_of_shipment, country_of_origin, country_of_acquisition,
    port_of_origin, port_of_destination, incoterm, manufacturer, manufacturer_address, items_json,
    total_length, total_roll, total_gross_weight, total_net_weight, total_cbm, status, notes, containers_json, loading_date,
    freight_agent, agent_cost, freight_cost, loading_cost,
    agent_currency, freight_currency, loading_currency } = req.body;
  db.prepare(`
    UPDATE packing_lists SET order_id=?, number=?, date=?, way_of_shipment=?, country_of_origin=?, country_of_acquisition=?,
      port_of_origin=?, port_of_destination=?, incoterm=?, manufacturer=?, manufacturer_address=?, items_json=?,
      total_length=?, total_roll=?, total_gross_weight=?, total_net_weight=?, total_cbm=?, status=?, notes=?, containers_json=?, loading_date=?,
      freight_agent=?, agent_cost=?, freight_cost=?, loading_cost=?, agent_currency=?, freight_currency=?, loading_currency=?, updated_by=?
    WHERE id=?
  `).run(order_id || null, number, date, way_of_shipment || 'By Sea', country_of_origin || 'China', country_of_acquisition || '',
    port_of_origin || '', port_of_destination || '', incoterm || '', manufacturer || '', manufacturer_address || '', items_json || null,
    total_length || 0, total_roll || 0, total_gross_weight || 0, total_net_weight || 0, total_cbm || 0, status || 'Draft', notes || '', containers_json || null, loading_date || null,
    freight_agent || '', agent_cost || null, freight_cost || null, loading_cost || null,
    agent_currency || 'USD', freight_currency || 'USD', loading_currency || 'USD', actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM packing_lists WHERE id=?').get(req.params.id));
});

app.delete('/api/packing-lists/:id', guardScreen('packing-lists'), (req, res) => {
  db.prepare('DELETE FROM packing_lists WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── CLOUDINARY ───────────────────────────────────────────────────────────────
app.get('/api/cloudinary-signature', (req, res) => {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder: 'exportflow' },
    process.env.CLOUDINARY_API_SECRET
  );
  res.json({ timestamp, signature, api_key: process.env.CLOUDINARY_API_KEY, cloud_name: process.env.CLOUDINARY_CLOUD_NAME });
});

// ─── QUOTATIONS ───────────────────────────────────────────────────────────────
app.get('/api/quotations', (req, res) => {
  res.json(db.prepare('SELECT * FROM quotations ORDER BY created_at DESC').all());
});

app.post('/api/quotations', guardScreen('quotations'), (req, res) => {
 const { number, client, suppliers, currency, deadline, price_validity, port_of_loading, port_of_discharge, freight_value, acquisition_company, specifications, notes, status, media, items, total, target_price } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO quotations (number, client, suppliers, currency, deadline, price_validity, port_of_loading, port_of_discharge, freight_value, acquisition_company, specifications, notes, status, media, items, total, target_price, updated_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(number, client, suppliers, currency || 'USD', deadline, price_validity || null, port_of_loading || null, port_of_discharge || null, freight_value || null, acquisition_company || '', specifications, notes, status || 'Open', media || null, items || null, total || null, target_price || null, actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM quotations WHERE id=?').get(result.lastInsertRowid));
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/quotations/:id', guardScreen('quotations'), (req, res) => {
  const { number, client, suppliers, currency, deadline, price_validity, port_of_loading, port_of_discharge, freight_value, acquisition_company, specifications, notes, status, media, items, total, target_price } = req.body;
  db.prepare(`
    UPDATE quotations SET number=?, client=?, suppliers=?, currency=?, deadline=?, price_validity=?, port_of_loading=?, port_of_discharge=?, freight_value=?, acquisition_company=?, specifications=?, notes=?, status=?, media=?, items=?, total=?, target_price=?, updated_by=?
    WHERE id=?
  `).run(number, client, suppliers, currency, deadline, price_validity || null, port_of_loading || null, port_of_discharge || null, freight_value || null, acquisition_company || '', specifications, notes, status, media || null, items || null, total || null, target_price || null, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM quotations WHERE id=?').get(req.params.id));
});

app.delete('/api/quotations/:id', guardScreen('quotations'), (req, res) => {
  db.prepare('DELETE FROM quotations WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/quotations/:id/pdf', async (req, res) => {
  try {
    const q = db.prepare('SELECT * FROM quotations WHERE id=?').get(req.params.id);
    if (!q) return res.status(404).json({ error: 'Quotation not found' });

    const currency = q.currency || 'USD';
    const rawItems = parseJsonSafe(q.items, []);
    const items = rawItems.map(i => {
      const normalized = normalizeSalesItem(i, currency);
      return { ...normalized, imageUrl: firstProductImage(normalized._product) };
    });
    const totalAmount = q.total || items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const clientRow = findClientByName(q.client);
    // Only resolved once an Acquisition Company has actually been chosen on
    // the Quotation itself — renderQuotation falls back to the older
    // "both companies" header when this is null (blank/legacy Quotations).
    const acq = q.acquisition_company ? getAcq(q.acquisition_company) : null;

    const html = renderQuotation({
      number: q.number,
      date: q.created_at ? q.created_at.slice(0, 10) : null,
      client: { name: q.client, address: fullAddress(clientRow), taxId: clientRow?.tax_id, tel: clientRow?.phone },
      priceValidity: q.price_validity,
      portOfLoading: q.port_of_loading,
      portOfDischarge: q.port_of_discharge,
      currency,
      items,
      totalAmount,
      freightValue: q.freight_value,
      acq,
    });

    const pdf = await renderPdfBuffer(html);
    const filename = `Quotation-${safeFilenamePart(q.number)}.pdf`;
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(filename) });
    res.send(pdf);
  } catch (err) {
    console.error('Quotation PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── INSPECTIONS ──────────────────────────────────────────────────────────────
app.get('/api/inspections', (req, res) => {
  res.json(db.prepare('SELECT * FROM inspections ORDER BY created_at DESC').all());
});

// POST/PUT intentionally NOT guarded by "inspections": the Orders screen's
// "Generate Inspection" / inline edit flow calls these same two routes
// directly (see App.jsx's Orders() component), and some accounts have
// "orders" without "inspections" — gating these would break that permitted
// feature for them. DELETE below stays guarded since it's only ever
// reachable from the dedicated Inspections screen.
app.post('/api/inspections', (req, res) => {
  // order_item_id/product_name: which specific product on the order this
  // inspection covers -- the Orders screen now generates one inspection per
  // item (see generateInspections() in App.jsx's Orders()), since every
  // product needs its own physical inspection even when several share the
  // same supplier. Both stay optional (null/blank) for inspections logged
  // without an item, e.g. straight from the standalone Inspections tab.
  const { order_id, order_item_id, product_name, number, inspection_date, inspector, result, observations, media } = req.body;
  try {
    const r = db.prepare(`
      INSERT INTO inspections (order_id, order_item_id, product_name, number, inspection_date, inspector, result, observations, media, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, order_item_id || null, product_name || null, number, inspection_date, inspector, result || 'Pending', observations, media || null, actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM inspections WHERE id=?').get(r.lastInsertRowid));
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/inspections/:id', (req, res) => {
  const { order_id, order_item_id, product_name, number, inspection_date, inspector, result, observations, media } = req.body;
  db.prepare(`
    UPDATE inspections SET order_id=?, order_item_id=?, product_name=?, number=?, inspection_date=?, inspector=?, result=?, observations=?, media=?, updated_by=?
    WHERE id=?
  `).run(order_id || null, order_item_id || null, product_name || null, number, inspection_date, inspector, result, observations, media || null, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM inspections WHERE id=?').get(req.params.id));
});

app.delete('/api/inspections/:id', guardScreen('inspections'), (req, res) => {
  db.prepare('DELETE FROM inspections WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── REPORTS ─────────────────────────────────────────────────────────────────
// Single cross-module Excel export — every tracking screen (Quotations,
// Proformas, Orders, Commercial, Contracts, Inspections, Supplier Flow,
// Samples, Packing Lists), each as a pair of sheets (still open / already
// completed), filtered from ?since=YYYY-MM-DD onward. See
// xlsx/reportBuilder.js for the per-category queries and column layouts.
app.get('/api/reports/categories', guardScreen('reports'), (req, res) => {
  res.json(REPORT_CATEGORIES);
});

app.get('/api/reports/full', guardScreen('reports'), async (req, res) => {
  try {
    const since = req.query.since && /^\d{4}-\d{2}-\d{2}$/.test(req.query.since) ? req.query.since : null;
    // Empty/missing ?categories= means "everything" (buildFullReportWorkbook
    // treats a null Set as no filter) — only build a Set when the frontend
    // actually sent a subset.
    const categories = req.query.categories ? new Set(req.query.categories.split(',').filter(Boolean)) : null;
    const workbook = buildFullReportWorkbook(db, since, categories);
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `AllianceFlow-Report${since ? `-since-${since}` : ""}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(filename),
    });
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Full report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Products-by-Supplier — one sheet per supplier (see xlsx/productSupplierReport.js)
// with each item's registered specs plus how often/heavily it's actually
// been ordered, for spotting problematic suppliers (price creep, items that
// never get reordered...) from the Products screen.
app.get('/api/reports/products-by-supplier', guardScreen('reports'), async (req, res) => {
  try {
    const workbook = buildProductSupplierReportWorkbook(db);
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `AllianceFlow-ProductsBySupplier-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(filename),
    });
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Products by supplier report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

app.get('/api/dashboard', guardScreen('dashboard'), (req, res) => {
  const orderStats = db.prepare(`
    SELECT status, COUNT(*) as count, SUM(value) as total_value
    FROM orders GROUP BY status
  `).all();

  const commercialPending = db.prepare(`
    SELECT COUNT(*) as count FROM commercial_invoices WHERE status = 'Pending'
  `).get();
  const commercialPaid = db.prepare(`
    SELECT COUNT(*) as count FROM commercial_invoices WHERE status = 'Paid'
  `).get();

const supplierPending = db.prepare(`
  SELECT COUNT(*) as count FROM financial_suppliers WHERE status = 'Pending'
`).get();
const supplierPaid = db.prepare(`
  SELECT COUNT(*) as count FROM financial_suppliers WHERE status = 'Paid'
`).get();

  const pendingOrders = db.prepare(`
    SELECT * FROM orders WHERE status = 'Pending' ORDER BY created_at DESC
  `).all();

  const pendingQuotations = db.prepare(`
    SELECT * FROM quotations WHERE status = 'Pending' ORDER BY created_at DESC
  `).all();

  const pendingCommercials = db.prepare(`
    SELECT * FROM commercial_invoices WHERE status = 'Pending' ORDER BY created_at DESC
  `).all();

  const pendingInspections = db.prepare(`
    SELECT * FROM inspections WHERE result = 'Pending' ORDER BY created_at DESC
  `).all();

  const pendingSamples = db.prepare(`
    SELECT * FROM samples WHERE status = 'Requested' ORDER BY requested_date DESC
  `).all();

  const activeContracts = db.prepare(`
    SELECT * FROM supplier_contracts WHERE status NOT IN ('Completed', 'Cancelled') ORDER BY created_at DESC
  `).all();

  // Supplier Payment Notices still awaiting payment — same "not Paid yet"
  // idea as the other pending lists above.
  const pendingSupplierPayments = db.prepare(`
    SELECT * FROM financial_suppliers WHERE status != 'Paid' ORDER BY due_date ASC
  `).all();

  // Both clientFinancial (Pending/Paid counts) and pendingCommercials are
  // derived from Commercial Invoice status, so accounts with
  // hideCommercialStatus (yukin, max — see permissions.js) get neither: the
  // counts would leak the same status info the rest of the app hides from
  // them just in aggregate form instead of per-row.
  const hidesStatus = req.user && req.user.permissions && req.user.permissions.hideCommercialStatus;
  res.json({
    orderStats,
    clientFinancial: hidesStatus ? null : { pending: commercialPending.count, received: commercialPaid.count },
    supplierFinancial: { pending: supplierPending.count, paid: supplierPaid.count },
    pendingOrders,
    pendingQuotations,
    pendingCommercials: hidesStatus ? [] : pendingCommercials,
    pendingInspections,
    pendingSamples,
    activeContracts,
    pendingSupplierPayments,
  });
});

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

app.get('/api/clients', (req, res) => {
  // Addition order, not alphabetical — see the matching comment on
  // GET /api/products. Click any column header on the Clients screen to
  // sort by that instead.
  res.json(db.prepare('SELECT * FROM clients ORDER BY id ASC').all());
});

app.post('/api/clients', guardScreen('clients'), (req, res) => {
  const { company_name, address, address2, address_number, neighborhood, city, state, zip_code, country,
    email, phone, contact_name, payment_terms, tax_id, notes } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO clients (company_name, address, address2, address_number, neighborhood, city, state, zip_code, country, email, phone, contact_name, payment_terms, tax_id, notes, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(company_name, address, address2, address_number || '', neighborhood || '', city || '', state || '', zip_code || '', country || '',
      email, phone, contact_name, payment_terms, tax_id || '', notes, actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM clients WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/clients/:id', guardScreen('clients'), (req, res) => {
  const { company_name, address, address2, address_number, neighborhood, city, state, zip_code, country,
    email, phone, contact_name, payment_terms, tax_id, notes } = req.body;
  db.prepare(`
    UPDATE clients SET company_name=?, address=?, address2=?, address_number=?, neighborhood=?, city=?, state=?, zip_code=?, country=?, email=?, phone=?, contact_name=?, payment_terms=?, tax_id=?, notes=?, updated_by=?
    WHERE id=?
  `).run(company_name, address, address2, address_number || '', neighborhood || '', city || '', state || '', zip_code || '', country || '',
    email, phone, contact_name, payment_terms, tax_id || '', notes, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id));
});

app.delete('/api/clients/:id', guardScreen('clients'), (req, res) => {
  db.prepare('DELETE FROM clients WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────

app.get('/api/suppliers', (req, res) => {
  // Addition order, not alphabetical — see the matching comment on
  // GET /api/products. Click any column header on the Suppliers screen to
  // sort by that instead.
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY id ASC').all();
  // One evaluation-rows query for every supplier at once (not N+1) — each
  // supplier's rating is clamp(5 + its own incidents' points, 0, 5), see
  // computeRating() in supplierEvaluationOptions.js.
  const evalRows = db.prepare('SELECT supplier_id, problem_points, solution_points FROM supplier_evaluations').all();
  const bySupplier = {};
  for (const row of evalRows) (bySupplier[row.supplier_id] ||= []).push(row);
  for (const s of suppliers) s.rating = computeRating(bySupplier[s.id]);
  res.json(suppliers);
});

app.post('/api/suppliers', guardScreen('suppliers'), (req, res) => {
  const { company_name, trade_name, address, address2, address_number, neighborhood, city, state, zip_code, country,
    email, phone, contact_name, payment_terms, product_types, notes,
    beneficiary_name, bank_name, bank_branch, account_number, swift_code } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO suppliers (company_name, trade_name, address, address2, address_number, neighborhood, city, state, zip_code, country, email, phone, contact_name, payment_terms, product_types, notes,
        beneficiary_name, bank_name, bank_branch, account_number, swift_code, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(company_name, trade_name || '', address, address2, address_number || '', neighborhood || '', city || '', state || '', zip_code || '', country || '',
      email, phone, contact_name, payment_terms, product_types, notes,
      beneficiary_name || '', bank_name || '', bank_branch || '', account_number || '', swift_code || '', actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM suppliers WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', guardScreen('suppliers'), (req, res) => {
  const { company_name, trade_name, address, address2, address_number, neighborhood, city, state, zip_code, country,
    email, phone, contact_name, payment_terms, product_types, notes,
    beneficiary_name, bank_name, bank_branch, account_number, swift_code } = req.body;
  db.prepare(`
    UPDATE suppliers SET company_name=?, trade_name=?, address=?, address2=?, address_number=?, neighborhood=?, city=?, state=?, zip_code=?, country=?, email=?, phone=?, contact_name=?, payment_terms=?, product_types=?, notes=?,
      beneficiary_name=?, bank_name=?, bank_branch=?, account_number=?, swift_code=?, updated_by=?
    WHERE id=?
  `).run(company_name, trade_name || '', address, address2, address_number || '', neighborhood || '', city || '', state || '', zip_code || '', country || '',
    email, phone, contact_name, payment_terms, product_types, notes,
    beneficiary_name || '', bank_name || '', bank_branch || '', account_number || '', swift_code || '', actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id));
});

app.delete('/api/suppliers/:id', guardScreen('suppliers'), (req, res) => {
  db.prepare('DELETE FROM suppliers WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── SUPPLIER EVALUATIONS (5-star rating) ──────────────────────────────────────
// See the supplier_evaluations table comment in database.js and
// supplierEvaluationOptions.js for the full model. GET routes are open (same
// reasoning as every other GET in this file — read access isn't gated per
// screen, only mutations are); POST/DELETE are guarded the same way
// suppliers' own POST/PUT/DELETE already are.

// Single source of truth for the preset problem/solution lists + their point
// values, so the frontend never hardcodes them (mirrors GET
// /api/reports/categories for the Reports screen's checkbox list).
app.get('/api/supplier-evaluation-options', (req, res) => {
  res.json({ problems: PROBLEM_OPTIONS, solutions: SOLUTION_OPTIONS });
});

app.get('/api/suppliers/:id/evaluations', (req, res) => {
  const rows = db.prepare('SELECT * FROM supplier_evaluations WHERE supplier_id=? ORDER BY created_at DESC, id DESC').all(req.params.id);
  res.json({ rating: computeRating(rows), evaluations: rows });
});

app.post('/api/suppliers/:id/evaluations', guardScreen('suppliers'), (req, res) => {
  const supplier = db.prepare('SELECT id FROM suppliers WHERE id=?').get(req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  // Point values are never taken from the request body — only the `key`
  // is, then re-resolved server-side against the fixed preset lists. This
  // is what keeps every supplier's score consistent regardless of who's
  // logging the incident (and stops a tampered request from awarding
  // arbitrary points).
  const problem = findProblem(req.body.problem_key);
  const solution = findSolution(req.body.solution_key);
  if (!problem) return res.status(400).json({ error: 'Invalid problem_key' });
  if (!solution) return res.status(400).json({ error: 'Invalid solution_key' });

  const result = db.prepare(`
    INSERT INTO supplier_evaluations
      (supplier_id, problem_key, problem_label, problem_points, problem_notes,
       solution_key, solution_label, solution_points, solution_notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.id, problem.key, problem.label, problem.points, req.body.problem_notes || '',
    solution.key, solution.label, solution.points, req.body.solution_notes || '', actorName(req)
  );

  const rows = db.prepare('SELECT * FROM supplier_evaluations WHERE supplier_id=? ORDER BY created_at DESC, id DESC').all(req.params.id);
  res.status(201).json({ rating: computeRating(rows), evaluations: rows });
});

// Downloadable Excel version of the evaluation history — one sheet per
// supplier (see xlsx/supplierEvaluationReport.js). `?supplier_ids=3,7,12`
// limits it to those suppliers; omitted/empty means every supplier. Guarded
// like the rest of this section (not guardScreen('reports')) since it's
// exposed from the Suppliers screen itself, not the general Reports tab —
// anyone who can manage suppliers can pull their own evaluation history.
app.get('/api/suppliers/evaluations/report', guardScreen('suppliers'), async (req, res) => {
  try {
    const supplierIds = (req.query.supplier_ids || '')
      .split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
    const workbook = buildSupplierEvaluationReportWorkbook(db, supplierIds.length ? supplierIds : null);
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `AllianceFlow-SupplierEvaluations-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(filename),
    });
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Supplier evaluation report error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suppliers/evaluations/:evalId', guardScreen('suppliers'), (req, res) => {
  const row = db.prepare('SELECT supplier_id FROM supplier_evaluations WHERE id=?').get(req.params.evalId);
  if (!row) return res.status(404).json({ error: 'Evaluation not found' });
  db.prepare('DELETE FROM supplier_evaluations WHERE id=?').run(req.params.evalId);
  const rows = db.prepare('SELECT * FROM supplier_evaluations WHERE supplier_id=? ORDER BY created_at DESC, id DESC').all(row.supplier_id);
  res.json({ rating: computeRating(rows), evaluations: rows });
});

// ─── FREIGHT AGENTS ───────────────────────────────────────────────────────────

app.get('/api/freight-agents', (req, res) => {
  res.json(db.prepare('SELECT * FROM freight_agents ORDER BY id ASC').all());
});

app.post('/api/freight-agents', guardScreen('freight-agents'), (req, res) => {
  const { company_name, contact_name, email, phone, notes } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO freight_agents (company_name, contact_name, email, phone, notes, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(company_name, contact_name || '', email || '', phone || '', notes || '', actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM freight_agents WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/freight-agents/:id', guardScreen('freight-agents'), (req, res) => {
  const { company_name, contact_name, email, phone, notes } = req.body;
  db.prepare(`
    UPDATE freight_agents SET company_name=?, contact_name=?, email=?, phone=?, notes=?, updated_by=?
    WHERE id=?
  `).run(company_name, contact_name || '', email || '', phone || '', notes || '', actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM freight_agents WHERE id=?').get(req.params.id));
});

app.delete('/api/freight-agents/:id', guardScreen('freight-agents'), (req, res) => {
  db.prepare('DELETE FROM freight_agents WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── PDF GENERATION ───────────────────────────────────────────────────────────

function getProduct(productId) {
  if (!productId) return null;
  return db.prepare('SELECT * FROM products WHERE id=?').get(productId) || null;
}

function findClientByName(name) {
  if (!name) return null;
  return db.prepare('SELECT * FROM clients WHERE company_name=?').get(name) || null;
}

function findSupplierByName(name) {
  if (!name) return null;
  return db.prepare('SELECT * FROM suppliers WHERE company_name=?').get(name) || null;
}

// Joins a client/supplier row's structured address fields into one display
// string for PDFs — street + number, complement, neighborhood, city/state,
// zip, country. Falls back gracefully when older records only have the
// original free-text address/address2 fields filled in.
function fullAddress(row) {
  if (!row) return '';
  const line1 = [row.address, row.address_number].filter(Boolean).join(', ');
  const line2 = row.address2;
  const line3 = [row.neighborhood, row.city, row.state].filter(Boolean).join(', ');
  const line4 = [row.zip_code, row.country].filter(Boolean).join(' - ');
  return [line1, line2, line3, line4].filter(Boolean).join(', ');
}

function getAcq(code) {
  return ACQUISITION_COMPANIES[code] || ACQUISITION_COMPANIES.HK;
}

function descriptionBullets(product) {
  if (!product || !product.description) return [];
  return String(product.description).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

// Splits a product's registered description into a lead paragraph (first
// line — the actual descriptive text, shown as its own field on
// Proforma/Commercial Invoice/Packing List, like the client's own reference
// docs) plus any remaining lines (extra facts such as a CAS number), which
// keep rendering as a bulleted list underneath it.
function splitDescription(product) {
  const lines = descriptionBullets(product);
  return { text: lines[0] || '', bullets: lines.slice(1) };
}

// "Width" only means something for Textile/DTF Film rolls — for every other
// category (machines, chemicals, accessories...) that column is repurposed
// to show what unit the Quantity is actually expressed in (e.g. "TON" for a
// ton-priced Chemical, "LITER" for a liter-priced one, or the registered
// package unit otherwise), so the reader knows what they're buying units of.
function priceUnitLabel(category, priceBasis, unit) {
  if (category === 'Chemical') return priceBasis === 'ton' ? 'TON' : 'LITER';
  return (unit || '').toUpperCase();
}

// Normalizes an order_item / quotation item row (+ its linked product) into
// the shape the Proforma / Commercial Invoice / Packing List templates need.
function metersOf(value, unit) {
  const v = parseFloat(value);
  if (!v) return null;
  if (unit === 'cm') return v * 0.01;
  if (unit === 'mm') return v * 0.001;
  return v;
}

// Converts a product's tube_weight (any unit) to kg, same conversions used
// on the frontend (buildPackingListDraft's tubeWeightKg).
function tubeWeightKg(value, unit) {
  const v = parseFloat(value);
  if (!v) return 0;
  if (unit === 'g') return v / 1000;
  if (unit === 'lb') return v * 0.453592;
  if (unit === 'oz') return v * 0.0283495;
  return v; // kg
}

// Converts a product's registered weight (per package/drum) to kg, same
// conversions used by tubeWeightKg above. `weight` is the GROSS weight of
// one full package (drum + chemical inside, e.g. what's on the scale) —
// used for actual Gross Weight totals, not for figuring out how many
// packages a given tonnage needs (see productNetWeightKg below for that).
function productWeightKg(product) {
  const v = parseFloat(product?.weight);
  if (!v) return 0;
  const unit = product?.weight_unit;
  if (unit === 'g') return v / 1000;
  if (unit === 'lb') return v * 0.453592;
  if (unit === 'oz') return v * 0.0283495;
  return v; // kg
}

// Same conversion, but for `net_weight` — the weight of the chemical alone
// in one package, excluding the drum's own weight. This is what "how many
// drums for X tons ordered" needs to divide by (dividing by the gross
// per-drum weight instead overcounts every drum by its own tare).
function productNetWeightKg(product) {
  const v = parseFloat(product?.net_weight);
  if (!v) return 0;
  const unit = product?.weight_unit;
  if (unit === 'g') return v / 1000;
  if (unit === 'lb') return v * 0.453592;
  if (unit === 'oz') return v * 0.0283495;
  return v; // kg
}

// Converts a product's registered `package_weight` (GROSS weight of one
// full physical package — e.g. a box of LED-light pairs, contents + box) to
// kg, same conversions as productWeightKg. Used only for products where the
// sold unit differs from the packed unit (see units_per_package below) —
// Chemical already has its own equivalent (weight/net_weight).
function packageWeightKg(product) {
  const v = parseFloat(product?.package_weight);
  if (!v) return 0;
  const unit = product?.weight_unit;
  if (unit === 'g') return v / 1000;
  if (unit === 'lb') return v * 0.453592;
  if (unit === 'oz') return v * 0.0283495;
  return v; // kg
}

function normalizeSalesItem(item, fallbackCurrency) {
  const product = getProduct(item.product_id);
  const category = item.category || product?.category || '';
  const isTextile = category === 'Textile' || category === 'DTF Film';
  const priceBasis = item.price_basis || product?.price_basis || null;
  // Ton-priced Chemical items: Quantity is entered/stored directly in tons
  // (see recalcLiquidItem/ProductItemModal on the frontend), so the PDF's
  // Quantity column needs its own label instead of the generic
  // "{quantity} {unit}" (which would misleadingly read e.g. "48 Plastic
  // Drums / Barrels" when 48 actually means 48 tons). Show the tons figure
  // plus, when the product's per-drum weight is known, the estimated
  // number of drums that corresponds to.
  // units_per_package products (sold per pair/piece, packed N-to-a-box)
  // deliberately do NOT get a "(≈ N packages)" annotation here — client
  // docs for those just show the plain sold quantity + unit (e.g. "35,000
  // Pairs"), same as any normal item; the estimated package count is
  // Packing-List-only information (it already has its own real Packages
  // column there, computed on the frontend in buildPackingListDraft).
  let quantityLabel = null;
  if (category === 'Chemical' && priceBasis === 'ton' && item.quantity != null) {
    const perDrumTons = productNetWeightKg(product) / 1000;
    const drums = perDrumTons > 0 ? Math.round((parseFloat(item.quantity) || 0) / perDrumTons) : null;
    quantityLabel = `${item.quantity} t${drums ? ` (≈ ${drums} ${item.unit || 'packages'})` : ''}`;
  }
  // Meters per roll — the roll length used for this specific item (may
  // differ from the product's registered default when a custom length was
  // requested), shown as its own column for Textile/DTF Film.
  const metersPerRoll = isTextile
    ? (metersOf(item.height, item.height_unit) ?? metersOf(product?.height, product?.height_unit))
    : null;
  const { text: descriptionText, bullets } = splitDescription(product);
  return {
    description: product?.name || item.product_name || '—',
    descriptionText,
    bullets,
    ncm: product?.ncm || '',
    color: product?.color || '',
    clientColorCode: product?.client_color_code || '',
    width: product?.width ? `${product.width}${product.width_unit || ''}` : '',
    // Non-textile items don't have a real Width, so their column shows what
    // unit the Quantity is expressed in instead (see priceUnitLabel above).
    priceUnitLabel: !isTextile ? priceUnitLabel(category, priceBasis, item.unit || product?.unit) : null,
    weightSpec: product?.weight ? `${product.weight} ${product.weight_unit || ''}` : '',
    category,
    isTextile,
    quantity: item.quantity ?? null,
    unit: item.unit || '',
    // Pre-formatted Quantity column override for ton-priced Chemical items
    // (see above) — salesInvoice.js uses this instead of "{quantity} {unit}"
    // when present, null for every other item (unchanged behavior).
    quantityLabel,
    metersPerRoll,
    // Chemical items priced by the ton (see item.price_basis) show their
    // weight column in tons instead of kg on client-facing docs, matching
    // whatever unit the deal was actually struck in — falls back to the
    // registered product's basis for older items saved before this existed.
    priceBasis,
    // "Total Length" (in meters) only means something for Textile/DTF Film
    // rolls — for other categories (machines, chemicals...) leave it blank
    // on the PDF instead of showing the raw quantity, which isn't a length.
    // They get a Total Weight + Quantity column instead (see salesInvoice.js).
    totalLength: isTextile ? (item.total_meterage ?? item.quantity ?? 0) : null,
    totalWeight: item.total_weight ?? null,
    // For Textile/DTF Film the Unit Price shown on client-facing docs is the
    // per-meter rate (what was actually quoted), not the per-roll total —
    // fall back to unit_price/length if sale_per_meter wasn't saved on the
    // item (older records).
    unitPrice: isTextile
      ? (item.sale_per_meter ?? (metersPerRoll ? (item.unit_price || 0) / metersPerRoll : item.unit_price ?? 0))
      : (item.unit_price ?? 0),
    total: item.total ?? ((item.unit_price || 0) * (item.quantity || 0)),
    currency: item.currency || fallbackCurrency,
    _product: product,
    _item: item,
  };
}

function orderItemsFor(orderId) {
  // ORDER BY id — feeds every client-facing document (Proforma, Commercial
  // Invoice...), which all need items to print in the order they were
  // actually added, not whatever order SQLite happens to return them in.
  return db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id ASC').all(orderId);
}

// Real profitability for an Order — sale value vs. registered product cost
// (order_items.cost_price × quantity, the same per-unit rate basis as
// unit_price/quantity — see applyProductToItem on the frontend) plus the
// Agent/Freight/Loading costs entered on that order's Packing List(s) (see
// the per-cost currency pickers on PackingListForm). Everything gets
// converted into one base currency via the FX rate in effect on the day the
// order was actually completed (order.completed_at, see getFxRatesForDate)
// rather than today's rate — the deal's real currency exposure was locked
// in when it closed, so that's the rate that reflects the real profit.
// Orders with no completed_at yet (not Completed, or completed before this
// column existed and the one-time backfill in database.js didn't find a
// usable fallback date either) fall back to today's live rate. Defaults to
// the order's own currency as the base, but the multi-order report below
// forces USD so orders placed in different currencies can be summed into
// one meaningful grand total.
// Restricted to canViewProfit accounts (see permissions.js and
// requireProfitAccess below) — nobody else can reach either route this
// feeds.
async function computeOrderProfitability(order, baseCurrencyOverride) {
  const { rates } = await getFxRatesForDate(order.completed_at ? order.completed_at.slice(0, 10) : null);
  const base = baseCurrencyOverride || order.currency || 'USD';
  const toBase = (amount, cur) => {
    const amt = parseFloat(amount) || 0;
    if (!amt) return 0;
    const from = cur || 'USD';
    if (from === base) return amt;
    // Can't convert (unsupported/missing currency) — treat as already in
    // the base currency rather than silently dropping it from the total;
    // this only happens for currencies outside FX_CURRENCIES, which the
    // app's own currency pickers don't offer anyway.
    if (!rates[from] || !rates[base]) return amt;
    return (amt / rates[from]) * rates[base];
  };

  // VAT registered on the product (products.vat_pct) is treated as
  // recoverable input-tax credit — the same convention the Real Margin box
  // on the Product form already uses (Real Margin % = ((Sale-Cost)/Cost)*100
  // + VAT%, see ProductForm's handleSalePctChange). Looked up live from
  // products rather than snapshotted onto the order item, same as every
  // other product-derived figure here — order_items doesn't carry its own
  // vat_pct column, so this is the one source of truth for it.
  const vatPctForProduct = db.prepare('SELECT vat_pct FROM products WHERE id=?');

  const rawItems = orderItemsFor(order.id);
  let saleTotal = 0, productCostTotal = 0, vatCreditTotal = 0;
  const items = rawItems.map(i => {
    const qty = parseFloat(i.quantity) || 0;
    const lineSale = parseFloat(i.total) || ((parseFloat(i.unit_price) || 0) * qty);
    const lineCost = (parseFloat(i.cost_price) || 0) * qty;
    const saleBase = toBase(lineSale, i.currency);
    const costBase = toBase(lineCost, i.cost_currency);
    const vatPct = i.product_id ? (parseFloat(vatPctForProduct.get(i.product_id)?.vat_pct) || 0) : 0;
    // Same base as the Product form: VAT% is a percentage of COST (not
    // sale), added straight onto profit rather than compounded — matches
    // Real Margin = grossPct + vatPct exactly (see the worked example in
    // ProductForm's help text).
    const vatCredit = (vatPct / 100) * costBase;
    saleTotal += saleBase;
    productCostTotal += costBase;
    vatCreditTotal += vatCredit;
    return {
      product_name: i.product_name || '—',
      quantity: qty,
      unit: i.unit || '',
      sale: saleBase,
      cost: costBase,
      vatPct,
      vatCredit,
    };
  });

  // CIF freight charged to the client is ordinary revenue, same as the
  // items themselves — added straight into saleTotal rather than kept
  // separate, so it flows through to profit/margin the same way a higher
  // item price would. Distinct from freightCost below (what the company
  // itself pays a forwarder, from the Packing List's own cost fields) —
  // one is money coming in, the other going out, and both can coexist on
  // the same order (e.g. client pays CIF freight, but the actual shipping
  // still costs the company something to arrange).
  const freightRevenue = toBase(order.freight_value, order.currency);
  saleTotal += freightRevenue;

  // Summed across every Packing List tied to this order — normally just
  // one, but a multi-shipment order could have more than one, and none
  // should get silently dropped.
  const packingLists = db.prepare('SELECT * FROM packing_lists WHERE order_id=?').all(order.id);
  let agentCost = 0, freightCost = 0, loadingCost = 0;
  packingLists.forEach(pl => {
    agentCost += toBase(pl.agent_cost, pl.agent_currency);
    freightCost += toBase(pl.freight_cost, pl.freight_currency);
    loadingCost += toBase(pl.loading_cost, pl.loading_currency);
  });

  const shippingCost = agentCost + freightCost + loadingCost;
  const totalCost = productCostTotal + shippingCost;
  // VAT credit only applies to the product leg (it's input tax recovered on
  // the goods themselves, not on Agent/Freight/Loading), so it's added once
  // here on top of the raw Sale-minus-Cost result rather than folded into
  // totalCost — same effect the Product form gets by adding vatPct straight
  // onto the gross % rather than changing what Cost itself means.
  const profit = saleTotal - totalCost + vatCreditTotal;
  // Measured against cost, same convention as the Real Margin box on the
  // Product form ((Sale - Cost) / Cost + VAT%) — not against sale price.
  const marginPct = totalCost > 0 ? (profit / totalCost) * 100 : null;

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    client: order.client,
    status: order.status,
    currency: base,
    items,
    saleTotal,
    freightRevenue,
    productCostTotal,
    agentCost,
    freightCost,
    loadingCost,
    shippingCost,
    totalCost,
    vatCreditTotal,
    profit,
    marginPct,
  };
}

// Narrower than any existing guardScreen() check — this isn't tied to a
// sidebar screen at all, just the four accounts with canViewProfit set in
// permissions.js.
function requireProfitAccess(req, res, next) {
  if (!req.user || !req.user.permissions || !req.user.permissions.canViewProfit) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  next();
}

app.get('/api/orders/:id/profitability', requireProfitAccess, async (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(await computeOrderProfitability(order));
  } catch (err) {
    console.error('Order profitability error:', err);
    res.status(500).json({ error: err.message });
  }
});

// First registered photo for a product (Quotation PDF's per-item thumbnail —
// see /api/quotations/:id/pdf below). `media` is a JSON array of either
// plain URL strings or { url, name } objects (same shape ProductForm's
// upload UI produces — see handleUpload there); PDFs/videos in that list are
// skipped since they don't make sense as a thumbnail image.
function firstProductImage(product) {
  const arr = parseJsonSafe(product?.media, []);
  if (!Array.isArray(arr)) return null;
  for (const entry of arr) {
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (url && !/\.(pdf|mp4|mov|avi|webm)$/i.test(url)) return url;
  }
  return null;
}

app.get('/api/proformas/:id/pdf', async (req, res) => {
  try {
    const pf = db.prepare('SELECT * FROM proformas WHERE id=?').get(req.params.id);
    if (!pf) return res.status(404).json({ error: 'Proforma not found' });

    const order = pf.order_id ? db.prepare('SELECT * FROM orders WHERE id=?').get(pf.order_id) : null;
    const quotation = pf.quotation_id ? db.prepare('SELECT * FROM quotations WHERE id=?').get(pf.quotation_id) : null;

    // Items priority: a linked Order is the most authoritative (it's
    // downstream and may have been edited independently); otherwise use the
    // Proforma's own items snapshot (present for both manually-created
    // Proformas and ones generated from a Quotation, which copy the
    // Quotation's items in at creation time); finally fall back to the
    // linked Quotation's items for older Proformas saved before this existed.
    let rawItems = [];
    if (order) rawItems = orderItemsFor(order.id);
    else if (pf.items) rawItems = parseJsonSafe(pf.items, []);
    else if (quotation) rawItems = parseJsonSafe(quotation.items, []);

    const currency = pf.currency || order?.currency || quotation?.currency || 'USD';
    const items = rawItems.map(i => normalizeSalesItem(i, currency));
    const totalLength = items.reduce((s, i) => s + (parseFloat(i.totalLength) || 0), 0);
    const totalWeight = items.filter(i => !i.isTextile).reduce((s, i) => s + (parseFloat(i.totalWeight) || 0), 0);
    const totalQuantity = items.filter(i => !i.isTextile).reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
    const totalAmount = pf.total || items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);

    // Once an Order exists, its acquisition_company is the single source of
    // truth (Commercial Invoice and Packing List both key off the Order too
    // — see their routes below), so the header company + bank info stays
    // identical across every document tied to the same deal. Before an
    // Order exists (quotation-stage Proforma), fall back to whatever was
    // picked on the Proforma itself.
    const acqCode = order?.acquisition_company || pf.acquisition_company || 'HK';
    const acq = getAcq(acqCode);
    const clientRow = findClientByName(pf.client);
    // Consignee / Notify Party are optional -- both blank means every role
    // (Importer/Consignee/Notify Party) is the same client, so
    // renderSalesInvoice keeps showing today's single combined box. Filling
    // either one in resolves that client's own address/tax id/phone by name
    // (same lookup as the Importer itself) and switches the PDF to separate
    // labeled boxes.
    const consigneeRow = pf.consignee ? findClientByName(pf.consignee) : null;
    const notifyPartyRow = pf.notify_party ? findClientByName(pf.notify_party) : null;

    const html = renderSalesInvoice({
      title: 'PROFORMA INVOICE',
      number: pf.number,
      date: pf.issue_date,
      wayOfShipment: pf.way_of_shipment || order?.way_of_shipment,
      countryOfOrigin: 'China',
      portOfOrigin: pf.port_of_loading || order?.port_of_loading,
      portOfDestination: pf.port_of_discharge || order?.port_of_discharge,
      incoterm: pf.incoterm || order?.incoterm,
      acq,
      // The company is a trading company (trader) — the "Manufacturer" shown
      // on client-facing docs is always the Ningbo entity (the real Chinese
      // trading company that actually handles procurement/export), never
      // the selected Acquisition Company (which only controls which entity
      // is invoicing/banking the client on this document) and never the
      // real factory/supplier.
      manufacturer: { name: NINGBO_ACQ.name, address: NINGBO_ACQ.addressLine, tel: NINGBO_ACQ.tel },
      items,
      totalLength,
      totalWeight,
      totalQuantity,
      totalAmount,
      currency,
      // CIF freight charged to the client — entered on the Proforma itself;
      // falls back to the linked Order's value once one has been created
      // (matching payment terms/production days above).
      freightValue: pf.freight_value || order?.freight_value,
      // Payment terms / production / delivery days: prefer whatever was
      // filled in on the Proforma itself (it usually exists before any Order
      // does); fall back to the linked Order once one has been created.
      paymentTerms: pf.payment_terms || order?.payment_terms,
      productionDays: pf.production_days || order?.production_lead_time,
      deliveryDays: pf.delivery_days || order?.delivery_days,
      importer: { name: pf.client, address: fullAddress(clientRow), taxId: clientRow?.tax_id, tel: clientRow?.phone },
      consignee: pf.consignee ? { name: pf.consignee, address: fullAddress(consigneeRow), taxId: consigneeRow?.tax_id, tel: consigneeRow?.phone } : null,
      notifyParty: pf.notify_party ? { name: pf.notify_party, address: fullAddress(notifyPartyRow), taxId: notifyPartyRow?.tax_id, tel: notifyPartyRow?.phone } : null,
      validity: pf.validity,
    });

    const pdf = await renderPdfBuffer(html);
    const pfFilename = `Proforma-${safeFilenamePart(order?.order_number || pf.number)}.pdf`;
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(pfFilename) });
    res.send(pdf);
  } catch (err) {
    console.error('Proforma PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Excel version of the same document — same param-gathering as the PDF
// route above (kept duplicated rather than refactored into a shared
// function, matching how the Contract PDF/Payment Notice xlsx routes
// already do their own independent param-building elsewhere in this file),
// just handed to buildSalesInvoiceWorkbook instead of renderSalesInvoice.
app.get('/api/proformas/:id/xlsx', async (req, res) => {
  try {
    const pf = db.prepare('SELECT * FROM proformas WHERE id=?').get(req.params.id);
    if (!pf) return res.status(404).json({ error: 'Proforma not found' });

    const order = pf.order_id ? db.prepare('SELECT * FROM orders WHERE id=?').get(pf.order_id) : null;
    const quotation = pf.quotation_id ? db.prepare('SELECT * FROM quotations WHERE id=?').get(pf.quotation_id) : null;

    let rawItems = [];
    if (order) rawItems = orderItemsFor(order.id);
    else if (pf.items) rawItems = parseJsonSafe(pf.items, []);
    else if (quotation) rawItems = parseJsonSafe(quotation.items, []);

    const currency = pf.currency || order?.currency || quotation?.currency || 'USD';
    const items = rawItems.map(i => normalizeSalesItem(i, currency));
    const totalLength = items.reduce((s, i) => s + (parseFloat(i.totalLength) || 0), 0);
    const totalWeight = items.filter(i => !i.isTextile).reduce((s, i) => s + (parseFloat(i.totalWeight) || 0), 0);
    const totalQuantity = items.filter(i => !i.isTextile).reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
    const totalAmount = pf.total || items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);

    const acqCode = order?.acquisition_company || pf.acquisition_company || 'HK';
    const acq = getAcq(acqCode);
    const clientRow = findClientByName(pf.client);
    const consigneeRow = pf.consignee ? findClientByName(pf.consignee) : null;
    const notifyPartyRow = pf.notify_party ? findClientByName(pf.notify_party) : null;

    const workbook = buildSalesInvoiceWorkbook({
      title: 'PROFORMA INVOICE',
      number: pf.number,
      date: pf.issue_date,
      wayOfShipment: pf.way_of_shipment || order?.way_of_shipment,
      countryOfOrigin: 'China',
      portOfOrigin: pf.port_of_loading || order?.port_of_loading,
      portOfDestination: pf.port_of_discharge || order?.port_of_discharge,
      incoterm: pf.incoterm || order?.incoterm,
      acq,
      manufacturer: { name: NINGBO_ACQ.name, address: NINGBO_ACQ.addressLine, tel: NINGBO_ACQ.tel },
      items,
      totalLength,
      totalWeight,
      totalQuantity,
      totalAmount,
      currency,
      freightValue: pf.freight_value || order?.freight_value,
      paymentTerms: pf.payment_terms || order?.payment_terms,
      productionDays: pf.production_days || order?.production_lead_time,
      deliveryDays: pf.delivery_days || order?.delivery_days,
      importer: { name: pf.client, address: fullAddress(clientRow), taxId: clientRow?.tax_id, tel: clientRow?.phone },
      consignee: pf.consignee ? { name: pf.consignee, address: fullAddress(consigneeRow), taxId: consigneeRow?.tax_id, tel: consigneeRow?.phone } : null,
      notifyParty: pf.notify_party ? { name: pf.notify_party, address: fullAddress(notifyPartyRow), taxId: notifyPartyRow?.tax_id, tel: notifyPartyRow?.phone } : null,
      validity: pf.validity,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `Proforma-${safeFilenamePart(order?.order_number || pf.number)}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(filename),
    });
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Proforma xlsx error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/commercial-invoices/:id/pdf', async (req, res) => {
  try {
    const ci = db.prepare('SELECT * FROM commercial_invoices WHERE id=?').get(req.params.id);
    if (!ci) return res.status(404).json({ error: 'Commercial invoice not found' });
    const order = ci.order_id ? db.prepare('SELECT * FROM orders WHERE id=?').get(ci.order_id) : null;
    const rawItems = order ? orderItemsFor(order.id) : [];
    const currency = ci.currency || order?.currency || 'USD';
    const items = rawItems.map(i => normalizeSalesItem(i, currency));
    const totalLength = items.reduce((s, i) => s + (parseFloat(i.totalLength) || 0), 0);
    const totalWeight = items.filter(i => !i.isTextile).reduce((s, i) => s + (parseFloat(i.totalWeight) || 0), 0);
    const totalQuantity = items.filter(i => !i.isTextile).reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
    const totalAmount = ci.total || items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);

    const acq = getAcq(order?.acquisition_company || 'HK');
    const clientRow = findClientByName(ci.client);
    const pl = db.prepare('SELECT * FROM packing_lists WHERE order_id=? ORDER BY created_at DESC LIMIT 1').get(order?.id);
    // Multi-container Packing Lists get one breakdown line per container
    // instead of a single aggregate line, matching the per-container
    // Packing List PDF itself (see renderPackingList's containers grouping).
    const plContainers = pl ? parseJsonSafe(pl.containers_json, []) : [];
    const plItems = pl ? parseJsonSafe(pl.items_json, []) : [];
    const sumOf = (arr, key) => arr.reduce((s, i) => s + (parseFloat(i[key]) || 0), 0);
    // Describes the "how many units" part of the summary using whatever
    // unit this specific order was actually negotiated in — Tons for a
    // ton-priced Chemical shipment, Rolls for Textile/DTF Film, Packages
    // for everything else — instead of a hardcoded "Rolls" that doesn't
    // apply once chemicals sold by weight are involved. Driven entirely by
    // each item's own price_basis/tons_per_package (set by
    // buildPackingListDraft), so it follows whatever the order was actually
    // filled in as, not a fixed assumption.
    const unitSummary = (arr) => {
      if (!arr.length) return 'Packages: 0';
      if (arr.every(i => i.price_basis === 'ton' && i.tons_per_package)) {
        const tons = arr.reduce((s, i) => s + (parseFloat(i.roll) || 0) * (parseFloat(i.tons_per_package) || 0), 0);
        return `Tons: ${tons.toFixed(3)}`;
      }
      return `${arr.every(i => i.isTextile) ? 'Rolls' : 'Packages'}: ${sumOf(arr, 'roll')}`;
    };
    // Falls back to this plain aggregate line (no container code — there's
    // nothing to attribute it to) only when the Packing List has no
    // registered containers at all. Any real container — even just one —
    // gets its code printed via the per-container breakdown below instead;
    // that used to only kick in above 1 container, which silently dropped
    // the container code for the (very common) single-container case.
    let plSummary = pl ? `${unitSummary(plItems)} | Gross Weight: ${pl.total_gross_weight || 0} kg | Net Weight: ${pl.total_net_weight || 0} kg | CBM: ${pl.total_cbm || 0}` : '';
    if (pl && Array.isArray(plContainers) && plContainers.length >= 1) {
      plSummary = plContainers.map(c => {
        // Same zero-roll filter as the Packing List PDF — unallocated rows
        // that only exist for the allocation UI shouldn't show up here.
        const containerItems = plItems.filter(i => (i.container_seq || 1) === c.seq && (parseFloat(i.roll) || 0) > 0);
        if (!containerItems.length) return null;
        return `Container ${String(c.seq).padStart(2, '0')}: ${c.code || '—'} — ${unitSummary(containerItems)} | Gross Weight: ${sumOf(containerItems, 'grossWeight').toFixed(1)} kg | Net Weight: ${sumOf(containerItems, 'netWeight').toFixed(1)} kg | CBM: ${sumOf(containerItems, 'cbm').toFixed(1)}`;
      }).filter(Boolean);
    }
    // "2x 40' High Cube" — shown right next to the "Packing List
    // Description" label so the container count/type is visible at a
    // glance instead of only implied by however many lines follow.
    const containerSummaryText = order?.container_qty && order?.container
      ? `${order.container_qty}x ${order.container}`
      : '';

    const html = renderSalesInvoice({
      title: 'COMMERCIAL INVOICE',
      number: ci.number,
      date: ci.issue_date,
      wayOfShipment: order?.way_of_shipment,
      countryOfOrigin: 'China',
      portOfOrigin: order?.port_of_loading,
      portOfDestination: order?.port_of_discharge,
      incoterm: order?.incoterm,
      acq,
      // Trader company: "Manufacturer" is always the Ningbo entity, never the
      // selected Acquisition Company (see the Proforma PDF route above for
      // the full reasoning) and never the real supplier.
      manufacturer: { name: NINGBO_ACQ.name, address: NINGBO_ACQ.addressLine, tel: NINGBO_ACQ.tel },
      items,
      totalLength,
      totalWeight,
      totalQuantity,
      totalAmount,
      currency,
      // No separate field on Commercial Invoice itself — this always reads
      // from the linked Order, same as payment terms/production days below.
      freightValue: order?.freight_value,
      paymentTerms: order?.payment_terms || ci.notes,
      productionDays: order?.production_lead_time,
      deliveryDays: order?.delivery_days,
      extraShipmentLine: plSummary,
      extraShipmentLineLabel: containerSummaryText,
      importer: { name: ci.client, address: fullAddress(clientRow), taxId: clientRow?.tax_id, tel: clientRow?.phone },
    });

    const pdf = await renderPdfBuffer(html);
    const ciFilename = `Commercial-${safeFilenamePart(order?.order_number || ci.number)}.pdf`;
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(ciFilename) });
    res.send(pdf);
  } catch (err) {
    console.error('Commercial invoice PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Excel version — same param-gathering as the PDF route above.
app.get('/api/commercial-invoices/:id/xlsx', async (req, res) => {
  try {
    const ci = db.prepare('SELECT * FROM commercial_invoices WHERE id=?').get(req.params.id);
    if (!ci) return res.status(404).json({ error: 'Commercial invoice not found' });
    const order = ci.order_id ? db.prepare('SELECT * FROM orders WHERE id=?').get(ci.order_id) : null;
    const rawItems = order ? orderItemsFor(order.id) : [];
    const currency = ci.currency || order?.currency || 'USD';
    const items = rawItems.map(i => normalizeSalesItem(i, currency));
    const totalLength = items.reduce((s, i) => s + (parseFloat(i.totalLength) || 0), 0);
    const totalWeight = items.filter(i => !i.isTextile).reduce((s, i) => s + (parseFloat(i.totalWeight) || 0), 0);
    const totalQuantity = items.filter(i => !i.isTextile).reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
    const totalAmount = ci.total || items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);

    const acq = getAcq(order?.acquisition_company || 'HK');
    const clientRow = findClientByName(ci.client);
    const pl = db.prepare('SELECT * FROM packing_lists WHERE order_id=? ORDER BY created_at DESC LIMIT 1').get(order?.id);
    const plContainers = pl ? parseJsonSafe(pl.containers_json, []) : [];
    const plItems = pl ? parseJsonSafe(pl.items_json, []) : [];
    const sumOf = (arr, key) => arr.reduce((s, i) => s + (parseFloat(i[key]) || 0), 0);
    const unitSummary = (arr) => {
      if (!arr.length) return 'Packages: 0';
      if (arr.every(i => i.price_basis === 'ton' && i.tons_per_package)) {
        const tons = arr.reduce((s, i) => s + (parseFloat(i.roll) || 0) * (parseFloat(i.tons_per_package) || 0), 0);
        return `Tons: ${tons.toFixed(3)}`;
      }
      return `${arr.every(i => i.isTextile) ? 'Rolls' : 'Packages'}: ${sumOf(arr, 'roll')}`;
    };
    let plSummary = pl ? `${unitSummary(plItems)} | Gross Weight: ${pl.total_gross_weight || 0} kg | Net Weight: ${pl.total_net_weight || 0} kg | CBM: ${pl.total_cbm || 0}` : '';
    if (pl && Array.isArray(plContainers) && plContainers.length >= 1) {
      plSummary = plContainers.map(c => {
        const containerItems = plItems.filter(i => (i.container_seq || 1) === c.seq && (parseFloat(i.roll) || 0) > 0);
        if (!containerItems.length) return null;
        return `Container ${String(c.seq).padStart(2, '0')}: ${c.code || '—'} — ${unitSummary(containerItems)} | Gross Weight: ${sumOf(containerItems, 'grossWeight').toFixed(1)} kg | Net Weight: ${sumOf(containerItems, 'netWeight').toFixed(1)} kg | CBM: ${sumOf(containerItems, 'cbm').toFixed(1)}`;
      }).filter(Boolean);
    }
    const containerSummaryText = order?.container_qty && order?.container
      ? `${order.container_qty}x ${order.container}`
      : '';

    const workbook = buildSalesInvoiceWorkbook({
      title: 'COMMERCIAL INVOICE',
      number: ci.number,
      date: ci.issue_date,
      wayOfShipment: order?.way_of_shipment,
      countryOfOrigin: 'China',
      portOfOrigin: order?.port_of_loading,
      portOfDestination: order?.port_of_discharge,
      incoterm: order?.incoterm,
      acq,
      manufacturer: { name: NINGBO_ACQ.name, address: NINGBO_ACQ.addressLine, tel: NINGBO_ACQ.tel },
      items,
      totalLength,
      totalWeight,
      totalQuantity,
      totalAmount,
      currency,
      freightValue: order?.freight_value,
      paymentTerms: order?.payment_terms || ci.notes,
      productionDays: order?.production_lead_time,
      deliveryDays: order?.delivery_days,
      extraShipmentLine: plSummary,
      extraShipmentLineLabel: containerSummaryText,
      importer: { name: ci.client, address: fullAddress(clientRow), taxId: clientRow?.tax_id, tel: clientRow?.phone },
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `Commercial-${safeFilenamePart(order?.order_number || ci.number)}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(filename),
    });
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Commercial invoice xlsx error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/packing-lists/:id/pdf', async (req, res) => {
  try {
    const pl = db.prepare('SELECT * FROM packing_lists WHERE id=?').get(req.params.id);
    if (!pl) return res.status(404).json({ error: 'Packing list not found' });
    const order = pl.order_id ? db.prepare('SELECT * FROM orders WHERE id=?').get(pl.order_id) : null;
    const items = parseJsonSafe(pl.items_json, []);
    const containers = parseJsonSafe(pl.containers_json, []);
    const clientRow = findClientByName(order?.client);
    // Same single source of truth as the Proforma/Commercial Invoice routes
    // above — order.acquisition_company — instead of pl.country_of_acquisition
    // (a display-only text field for the "Country of acquisition" line, not
    // the HK/NINGBO entity code, and a stale/independent value that let this
    // document drift out of sync with the other two for the same deal).
    const acq = getAcq(order?.acquisition_company || 'HK');

    const html = renderPackingList({
      number: pl.number,
      date: pl.date,
      wayOfShipment: pl.way_of_shipment,
      countryOfOrigin: pl.country_of_origin,
      portOfOrigin: pl.port_of_origin,
      portOfDestination: pl.port_of_destination,
      incoterm: pl.incoterm,
      acq,
      manufacturer: { name: pl.manufacturer, address: pl.manufacturer_address, tel: '' },
      items,
      containers,
      totals: {
        totalLength: pl.total_length, totalRoll: pl.total_roll,
        totalGrossWeight: pl.total_gross_weight, totalNetWeight: pl.total_net_weight, totalCbm: pl.total_cbm,
      },
      importer: { name: order?.client, address: fullAddress(clientRow), taxId: clientRow?.tax_id, tel: clientRow?.phone },
    });

    const pdf = await renderPdfBuffer(html);
    const plFilename = `PackingList-${safeFilenamePart(order?.order_number || pl.number)}.pdf`;
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(plFilename) });
    res.send(pdf);
  } catch (err) {
    console.error('Packing list PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Excel version — same param-gathering as the PDF route above.
app.get('/api/packing-lists/:id/xlsx', async (req, res) => {
  try {
    const pl = db.prepare('SELECT * FROM packing_lists WHERE id=?').get(req.params.id);
    if (!pl) return res.status(404).json({ error: 'Packing list not found' });
    const order = pl.order_id ? db.prepare('SELECT * FROM orders WHERE id=?').get(pl.order_id) : null;
    const items = parseJsonSafe(pl.items_json, []);
    const containers = parseJsonSafe(pl.containers_json, []);
    const clientRow = findClientByName(order?.client);
    const acq = getAcq(order?.acquisition_company || 'HK');

    const workbook = buildPackingListWorkbook({
      number: pl.number,
      date: pl.date,
      wayOfShipment: pl.way_of_shipment,
      countryOfOrigin: pl.country_of_origin,
      portOfOrigin: pl.port_of_origin,
      portOfDestination: pl.port_of_destination,
      incoterm: pl.incoterm,
      acq,
      manufacturer: { name: pl.manufacturer, address: pl.manufacturer_address, tel: '' },
      items,
      containers,
      totals: {
        totalLength: pl.total_length, totalRoll: pl.total_roll,
        totalGrossWeight: pl.total_gross_weight, totalNetWeight: pl.total_net_weight, totalCbm: pl.total_cbm,
      },
      importer: { name: order?.client, address: fullAddress(clientRow), taxId: clientRow?.tax_id, tel: clientRow?.phone },
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `PackingList-${safeFilenamePart(order?.order_number || pl.number)}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(filename),
    });
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Packing list xlsx error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/contracts/:id/pdf', async (req, res) => {
  try {
    const contract = db.prepare('SELECT * FROM supplier_contracts WHERE id=?').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    const order = contract.order_id ? db.prepare('SELECT * FROM orders WHERE id=?').get(contract.order_id) : null;
    const rawItems = parseJsonSafe(contract.items_json, []);
    const supplierRow = findSupplierByName(contract.supplier);

    const items = rawItems.map(item => {
      const product = getProduct(item.product_id);
      const unitPrice = parseFloat(item.cost_price ?? item.unit_price) || 0;
      const qty = parseFloat(item.quantity) || 0;
      const category = item.category || product?.category || '';
      const isTextile = category === 'Textile' || category === 'DTF Film';
      // Ton-based quantity/pricing only makes sense for Textile/DTF Film
      // (priced by total roll weight) and ton-priced Chemical — everything
      // else (general goods like LED lights sold per unit/pair) must show
      // its own real quantity and per-unit price instead. Forcing every
      // item into "Total Weight (Tons)" / "Unit Price (/Ton)" regardless of
      // category previously showed nonsense like "1.050 t" and "RMB
      // 115,000.00/ton" for a batch of LED lights sold per pair.
      const priceBasis = item.price_basis || product?.price_basis || null;
      const isTonChemical = category === 'Chemical' && priceBasis === 'ton';
      // Gramatura (GSM) only applies to Textile/DTF Film, registered on the
      // product as weight g/m² or g/m.
      const gramatura = isTextile && product?.weight && (product.weight_unit === 'g/m²' || product.weight_unit === 'g/m')
        ? `${product.weight} ${product.weight_unit}` : '';
      const total = unitPrice * qty;

      let quantityValue, quantityUnit, quantityDecimals, unitPriceValue;
      if (isTextile) {
        // Textile/DTF Film is quoted and priced by the meter — same basis
        // as the Proforma/Commercial Invoice (see normalizeSalesItem) and
        // the Product Item screen's Rolls/Meters toggle. This used to
        // convert to gross weight in tons instead (Net Weight + tube core
        // weight × roll count), which made a Textile contract read like a
        // ton-priced Chemical one — wrong basis entirely, not just wrong
        // numbers.
        const metersPerRoll = metersOf(item.height, item.height_unit) ?? metersOf(product?.height, product?.height_unit);
        const totalMeters = item.total_meterage != null && item.total_meterage !== ''
          ? parseFloat(item.total_meterage)
          : (metersPerRoll ? qty * metersPerRoll : null);
        quantityValue = totalMeters;
        // Chinese unit (米) instead of "m" — this document is Chinese-facing
        // (the supplier/factory), unlike the client-facing Proforma/CI which
        // use the Latin "m" abbreviation.
        quantityUnit = '米';
        // Whole meters only on the Contract PDF — "30,000.000 m" read as
        // confusingly precise to the factory, who only ever deal in whole
        // meters for a cut order like this.
        quantityDecimals = 0;
        // Prefer the registered per-meter cost rate when present — falls
        // back to total/meters (still correct, just derived) for older
        // items saved before cost_per_meter existed.
        unitPriceValue = item.cost_per_meter != null && item.cost_per_meter !== ''
          ? parseFloat(item.cost_per_meter)
          : (totalMeters ? total / totalMeters : unitPrice);
      } else if (isTonChemical) {
        // Ton-priced Chemical: item.quantity is already stored in tons —
        // no weight lookup/derivation needed, unitPrice is already per ton.
        quantityValue = qty;
        quantityUnit = 't';
        quantityDecimals = 3;
        unitPriceValue = unitPrice;
      } else {
        // General goods: show the real sold quantity/unit (e.g. "35,000
        // Pair") and the real per-unit price — no weight/ton conversion.
        quantityValue = qty;
        quantityUnit = item.unit || product?.unit || product?.selling_unit || '';
        quantityDecimals = Number.isInteger(qty) ? 0 : 2;
        unitPriceValue = unitPrice;
      }

      return {
        productName: product?.name || item.product_name || '—',
        productNameZh: product?.name_zh || '',
        color: product?.color || '',
        colorZh: product?.color_zh || '',
        clientColorCode: product?.client_color_code || '',
        // Live registered code takes priority (same as name/color/etc. above)
        // — a snapshot taken when the item was added to the order shouldn't
        // keep printing on the Contract PDF after the code was corrected in
        // the Product registry. Only falls back to the order item's own
        // snapshot when the product record itself is gone (e.g. deleted).
        code: product?.code || item.product_code || '',
        thickness: product?.thickness ? `${product.thickness}${product.thickness_unit || ''}` : '',
        width: product?.width ? `${product.width}${product.width_unit || ''}` : '',
        gramatura,
        quantityValue,
        quantityUnit,
        quantityDecimals,
        unit: item.unit || '',
        unitPrice: unitPriceValue,
        currency: item.cost_currency || item.currency || contract.currency,
        total,
      };
    });

    // The Buyer on a Supplier Purchase Contract is always the Ningbo entity —
    // procurement from Chinese suppliers always runs through Ningbo,
    // regardless of which Acquisition Company (HK or Ningbo) was picked on
    // the linked Order for invoicing the client.
    const acq = NINGBO_ACQ;

    // Summed alongside the Total Amount on the same row — only when every
    // item shares one unit (the common case: one contract, one fabric/good
    // sold the same way), since adding meters to pairs to tons wouldn't
    // mean anything. Mixed-unit contracts just leave this blank rather than
    // print a misleading number.
    const quantityUnits = new Set(items.map(i => i.quantityUnit).filter(Boolean));
    const totalQuantity = quantityUnits.size === 1
      ? items.reduce((sum, i) => sum + (parseFloat(i.quantityValue) || 0), 0)
      : null;
    const totalQuantityUnit = quantityUnits.size === 1 ? [...quantityUnits][0] : null;
    const totalQuantityDecimals = items[0]?.quantityDecimals ?? 0;

    const html = renderContract({
      contractNumber: contract.contract_number,
      signDate: contract.sign_date,
      deliveryDate: contract.delivery_date,
      acq,
      supplier: {
        name: contract.supplier,
        accountNumber: supplierRow?.account_number,
        bankName: supplierRow?.bank_name,
        bankBranch: supplierRow?.bank_branch,
        contactName: supplierRow?.contact_name,
        phone: supplierRow?.phone,
      },
      items,
      total: contract.total,
      currency: contract.currency,
      totalQuantity,
      totalQuantityUnit,
      totalQuantityDecimals,
      remarks: contract.notes,
    });

    const pdf = await renderPdfBuffer(html);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`Contract-${contract.contract_number}.pdf`) });
    res.send(pdf);
  } catch (err) {
    console.error('Contract PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Payment Request Form — generated as an Excel workbook (not a PDF), per
// the client's request. See xlsx/paymentNotice.js.
app.get('/api/financial/suppliers/:id/payment-notice-xlsx', async (req, res) => {
  try {
    const fin = db.prepare('SELECT * FROM financial_suppliers WHERE id=?').get(req.params.id);
    if (!fin) return res.status(404).json({ error: 'Payment record not found' });
    const order = fin.order_id ? db.prepare('SELECT * FROM orders WHERE id=?').get(fin.order_id) : null;
    const supplierRow = findSupplierByName(fin.supplier);

    // Split-payment support: ?pct=20&label=Deposit renders just that
    // installment's slice of the total amount, with the label appended to
    // the purpose line — used when payment_schedule is a split like
    // "20/80" and the frontend generates one file per installment.
    const pct = req.query.pct ? parseFloat(req.query.pct) : null;
    const label = req.query.label || '';
    const amount = pct != null ? (parseFloat(fin.amount) || 0) * (pct / 100) : fin.amount;
    const purpose = label ? `${fin.description || ''} — ${label} (${pct}%)`.trim() : fin.description;

    const workbook = buildPaymentNoticeWorkbook({
      // Supplier payments always run through Ningbo too (same reasoning as
      // the Contract PDF's Buyer) — the "Payer" field remains a manual
      // override for the rare case that isn't true, but the default no
      // longer follows the Order's Acquisition Company.
      payer: fin.payer || NINGBO_ACQ.name,
      applicationDate: fin.created_at ? fin.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      paymentMethod: fin.payment_method,
      paymentDeadline: fin.due_date,
      // Name of Payee should read the supplier's factory/company name, not
      // the bank account holder name (beneficiary_name is a banking detail
      // that can legitimately differ from the commercial name).
      payee: supplierRow?.company_name || fin.supplier,
      bankName: supplierRow?.bank_name,
      bankBranch: supplierRow?.bank_branch,
      accountNumber: supplierRow?.account_number,
      amount,
      currency: fin.currency,
      purpose,
      applicant: fin.applicant,
      approvedBy: fin.approved_by,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const suffix = label ? `-${label}` : '';
    const filename = `Payment-${safeFilenamePart(order?.order_number || fin.supplier)}${suffix}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(filename),
    });
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Payment notice xlsx error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── STATUS-CHANGE NOTIFICATIONS (see notifications.js) ─────────────────────
// Manual, not automatic: whoever changes a status picks who to notify from
// a list the frontend gets from the route below. Commercial Invoice status
// touches client payment info, so that one entityType is filtered down to
// only people with access to that screen -- every other entityType has no
// restriction, any of the 9 accounts can be picked. Re-checked here, not
// just on the frontend, so a tampered request can't email someone who
// isn't actually supposed to see that status.
function isEligibleForEntityType(username, entityType) {
  if (!isRestricted(entityType)) return true;
  const perms = permissionsFor(username);
  return perms.screens.includes('commercial') && !perms.hideCommercialStatus;
}

app.get('/api/notifications/recipients', requireAuth(db), (req, res) => {
  const entityType = String(req.query.entityType || '');
  if (!ENTITY_LABELS[entityType]) return res.status(400).json({ error: 'Unknown entityType' });
  const users = db.prepare('SELECT username, name, email FROM users ORDER BY name').all();
  const eligible = users
    .filter(u => u.email && isEligibleForEntityType(u.username, entityType))
    .map(u => ({ username: u.username, name: u.name }));
  res.json(eligible);
});

app.post('/api/notifications/status-change', requireAuth(db), async (req, res) => {
  const { entityType, recordLabel, oldStatus, newStatus, recipientUsernames, message, attachmentUrl, attachmentName, eventType, documentLabel } = req.body || {};
  // newStatus is only required for the original 'status_change' flow — a
  // 'created' notification has no De/Para, and a 'document' one (someone
  // generated a PDF/Excel and chose to send it by e-mail) is keyed off the
  // attachment instead.
  if (!ENTITY_LABELS[entityType]) return res.status(400).json({ error: 'Unknown entityType' });
  if (!recordLabel || ((!eventType || eventType === 'status_change') && !newStatus)) {
    return res.status(400).json({ error: 'recordLabel required (and newStatus, unless eventType is "created" or "document")' });
  }

  const requested = Array.isArray(recipientUsernames) ? recipientUsernames : [];
  if (requested.length === 0) return res.json({ sent: [], skipped: [] });

  const users = db.prepare('SELECT username, name, email FROM users').all();
  const byUsername = Object.fromEntries(users.map(u => [u.username, u]));

  // Downloaded once here (not inside the per-recipient loop) so N
  // recipients don't mean N redundant fetches of the same file.
  const attachment = await fetchAttachment(attachmentUrl, attachmentName);

  const changedBy = actorName(req);
  // One id for this whole call, stamped on every recipient's row below —
  // lets the frontend's notification detail view ask "who else got this
  // one" (see GET /api/notifications/inbox/:id/recipients) instead of
  // guessing from matching timestamps.
  const batchId = crypto.randomUUID();
  const insertInboxRow = db.prepare(`
    INSERT INTO notifications (recipient_username, entity_type, record_label, event_type, old_status, new_status, document_label, message, sender_name, attachment_url, attachment_name, batch_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sent = [];
  const skipped = [];
  for (const username of requested) {
    const user = byUsername[username];
    const eligible = user && user.email && isEligibleForEntityType(username, entityType);
    if (!eligible) { skipped.push(username); continue; }
    // Written to the in-app inbox regardless of whether the e-mail below
    // actually succeeds — the inbox is the reliable channel, e-mail is a
    // best-effort extra, so a Resend hiccup shouldn't also hide this from
    // the person inside the system.
    insertInboxRow.run(username, entityType, recordLabel || null, eventType || 'status_change', oldStatus || null, newStatus || null, documentLabel || null, message || null, changedBy, attachmentUrl || null, attachmentName || null, batchId);
    try {
      await sendStatusChangeEmail({
        to: user.email,
        entityType,
        recordLabel,
        oldStatus,
        newStatus,
        changedBy,
        message,
        attachment,
        eventType,
        documentLabel,
      });
      sent.push(username);
    } catch (err) {
      console.error(`Notification email to ${username} failed:`, err.message);
      skipped.push(username);
    }
  }
  res.json({ sent, skipped });
});

// In-app notification inbox — the rows written above, read back for the
// logged-in user's own bell icon (frontend polls this every ~15s). Newest
// first, capped at 50 so the panel never has to render an unbounded list;
// unreadCount is computed separately (not just items.length) so it stays
// correct even once older read items fall off that 50-row window.
app.get('/api/notifications/inbox', requireAuth(db), (req, res) => {
  const items = db.prepare(`
    SELECT id, entity_type, record_label, event_type, old_status, new_status, document_label, message, sender_name, attachment_url, attachment_name, batch_id, is_read, created_at
    FROM notifications WHERE recipient_username = ? ORDER BY created_at DESC, id DESC LIMIT 50
  `).all(req.user.username);
  const { unreadCount } = db.prepare(`SELECT COUNT(*) AS unreadCount FROM notifications WHERE recipient_username = ? AND is_read = 0`).get(req.user.username);
  res.json({ items, unreadCount });
});

app.post('/api/notifications/inbox/:id/read', requireAuth(db), (req, res) => {
  const result = db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_username = ?`).run(req.params.id, req.user.username);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Who else got this same notification — grouped by batch_id (see the
// comment on that column in database.js). Requires the requester to
// actually be one of that batch's own recipients first (looked up by their
// own id + username), so this can't be used to snoop on a batch_id someone
// wasn't part of.
app.get('/api/notifications/inbox/:id/recipients', requireAuth(db), (req, res) => {
  const row = db.prepare(`SELECT batch_id FROM notifications WHERE id = ? AND recipient_username = ?`).get(req.params.id, req.user.username);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!row.batch_id) return res.json({ recipients: [] }); // pre-existing rows from before batch_id existed
  const recipients = db.prepare(`
    SELECT n.recipient_username AS username, u.name AS name
    FROM notifications n LEFT JOIN users u ON u.username = n.recipient_username
    WHERE n.batch_id = ?
    ORDER BY name
  `).all(row.batch_id);
  res.json({ recipients });
});

app.post('/api/notifications/inbox/read-all', requireAuth(db), (req, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE recipient_username = ? AND is_read = 0`).run(req.user.username);
  res.json({ ok: true });
});

// ─── DATABASE BACKUPS (see backup.js) ────────────────────────────────────────
// Manual trigger + listing, restricted to the account holder, so the daily
// backup routine can be verified from the running app (e.g. right after
// deploying this) instead of just trusting the 3am schedule blindly.
app.post('/api/admin/backup-now', requireAuth(db), (req, res) => {
  if (req.user.username !== 'lucas') return res.status(403).json({ error: "Not allowed" });
  runBackup(db)
    .then(() => res.json({ ok: true }))
    .catch(err => {
      console.error('Manual backup error:', err);
      res.status(500).json({ error: 'Backup failed — check server logs.' });
    });
});

app.get('/api/admin/backups', requireAuth(db), (req, res) => {
  if (req.user.username !== 'lucas') return res.status(403).json({ error: "Not allowed" });
  listBackups()
    .then(list => res.json(list))
    .catch(err => {
      console.error('List backups error:', err);
      res.status(500).json({ error: 'Could not list backups — check server logs.' });
    });
});

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  scheduleBackups(db);
});
