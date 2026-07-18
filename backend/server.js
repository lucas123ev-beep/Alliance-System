const express = require('express');
const cors = require('cors');
const db = require('./database');

const { renderPdfBuffer } = require('./pdf/render');
const { renderSalesInvoice } = require('./pdf/salesInvoice');
const { renderPackingList } = require('./pdf/packingList');
const { renderContract } = require('./pdf/contract');
const { renderPaymentNotice } = require('./pdf/paymentNotice');
const ACQUISITION_COMPANIES = require('./pdf/acquisitionCompanies');
const { parseJsonSafe, contentDisposition } = require('./pdf/helpers');
const { buildFullReportWorkbook, CATEGORIES: REPORT_CATEGORIES } = require('./xlsx/reportBuilder');
const {
  hashPassword, verifyPassword, generateToken, requireAuth, actorName,
  isLockedOut, lockoutMinutesRemaining, recordFailedLogin, resetFailedLogins,
} = require('./auth');

const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      "http://localhost:5173",
      "https://alliance-system.vercel.app",
      "https://alliance-system.app",
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
app.post('/api/login', (req, res) => {
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

// ─── ORDERS ──────────────────────────────────────────────────────────────────

app.get('/api/orders', (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, 
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
    FROM orders o ORDER BY o.created_at DESC
  `).all();
  res.json(orders);
});

app.get('/api/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
  res.json({ ...order, items });
});

app.post('/api/orders', (req, res) => {
  const { order_number, client, supplier, product, value, currency, production_lead_time, delivery_days,
    shipment_date, arrival_date, incoterm, payment_terms, port_of_loading,
    port_of_discharge, acquisition_company, container, container_qty, notes, items } = req.body;
  try {
    const insert = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO orders (order_number, client, supplier, product, value, currency, production_lead_time, delivery_days,
          shipment_date, arrival_date, incoterm, payment_terms, port_of_loading, port_of_discharge, acquisition_company, container, container_qty, notes, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(order_number, client, supplier, product, value, currency || 'USD', production_lead_time || null, delivery_days || null,
        shipment_date, arrival_date, incoterm, payment_terms, port_of_loading, port_of_discharge, acquisition_company || '', container || '', container_qty, notes, actorName(req));
      const orderId = result.lastInsertRowid;
      if (items && items.length > 0) {
        const insertItem = db.prepare(`
          INSERT INTO order_items (order_id, product_id, product_name, product_code, supplier, quantity, unit, unit_price, currency, total, total_weight, total_meterage, cost_price, cost_currency, category, sale_per_meter, cost_per_meter, sale_per_liter, cost_per_liter, sale_pct, target_price, target_price_unit, height, height_unit)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of items) {
          insertItem.run(orderId, item.product_id || null, item.product_name,
            item.product_code || null, item.supplier || null, item.quantity,
            item.unit || 'unit', item.unit_price, item.currency || 'USD', item.total || 0, item.total_weight || null, item.total_meterage || null, item.cost_price || null, item.cost_currency || null, item.category || null, item.sale_per_meter || null, item.cost_per_meter || null,
            item.sale_per_liter || null, item.cost_per_liter || null, item.sale_pct || null, item.target_price || null, item.target_price_unit || null, item.height || null, item.height_unit || null);
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

app.put('/api/orders/:id', (req, res) => {
  const { order_number, client, supplier, product, value, currency, production_lead_time, delivery_days,
    shipment_date, arrival_date, incoterm, payment_terms, port_of_loading,
    port_of_discharge, acquisition_company, container, container_qty, notes, items } = req.body;
  db.prepare(`
    UPDATE orders SET order_number=?, client=?, supplier=?, product=?, value=?, currency=?,
      production_lead_time=?, delivery_days=?, shipment_date=?, arrival_date=?, incoterm=?,
      payment_terms=?, port_of_loading=?, port_of_discharge=?, acquisition_company=?, container=?, container_qty=?, notes=?,
      updated_by=?, updated_at=datetime('now')
    WHERE id=?
  `).run(order_number, client, supplier, product, value, currency, production_lead_time || null, delivery_days || null,
    shipment_date, arrival_date, incoterm, payment_terms, port_of_loading,
    port_of_discharge, acquisition_company || '', container || '', container_qty || null, notes, actorName(req), req.params.id);

db.prepare('DELETE FROM order_items WHERE order_id=?').run(req.params.id);
if (items && items.length > 0) {
const insertItem = db.prepare(`
  INSERT INTO order_items (order_id, product_id, product_name, product_code, supplier, quantity, unit, unit_price, currency, total, total_weight, total_meterage, cost_price, cost_currency, category, sale_per_meter, cost_per_meter, sale_per_liter, cost_per_liter, sale_pct, target_price, target_price_unit, height, height_unit)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
  for (const item of items) {
insertItem.run(req.params.id, item.product_id || null, item.product_name,
  item.product_code || null, item.supplier || null, item.quantity,
  item.unit || 'unit', item.unit_price, item.currency || 'USD', item.total || 0, item.total_weight || null, item.total_meterage || null, item.cost_price || null, item.cost_currency || null, item.category || null, item.sale_per_meter || null, item.cost_per_meter || null,
  item.sale_per_liter || null, item.cost_per_liter || null, item.sale_pct || null, item.target_price || null, item.target_price_unit || null, item.height || null, item.height_unit || null);
  }
}

  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  const savedItems = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(req.params.id);
  res.json({ ...order, items: savedItems });
});

app.delete('/api/orders/:id', (req, res) => {
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
  db.prepare(`UPDATE orders SET status=?, updated_by=?, updated_at=datetime('now') WHERE id=?`)
    .run(status, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id));
});

app.delete('/api/contracts/:id', (req, res) => {
  db.prepare('DELETE FROM supplier_contracts WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY name').all());
});

app.post('/api/products', (req, res) => {
  const { code, name, description, unit, ncm, hs_code, color, width, width_unit, height, height_unit, thickness, thickness_unit, weight, weight_unit, tube_weight, tube_weight_unit, roll_diameter, roll_diameter_unit, volume, volume_unit, unit_cost, cost_currency, category, supplier, sale_price, sale_currency, cost_per_meter, sale_per_meter, cost_per_liter, sale_per_liter, sale_pct, media } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO products (code, name, description, unit, ncm, hs_code, color, width, width_unit, height, height_unit, thickness, thickness_unit, weight, weight_unit, tube_weight, tube_weight_unit, roll_diameter, roll_diameter_unit, volume, volume_unit, unit_cost, cost_currency, category, supplier, sale_price, sale_currency, cost_per_meter, sale_per_meter, cost_per_liter, sale_per_liter, sale_pct, media, updated_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(code, name, description, unit || 'unit', ncm || '', hs_code || '', color || '', width, width_unit || 'cm', height, height_unit || 'cm', thickness, thickness_unit || 'mm', weight, weight_unit || 'kg', tube_weight || null, tube_weight_unit || 'kg', roll_diameter || null, roll_diameter_unit || 'cm', volume || null, volume_unit || 'L', unit_cost || 0, cost_currency || 'USD', category, supplier, sale_price || 0, sale_currency || 'USD', cost_per_meter || 0, sale_per_meter || 0, cost_per_liter || 0, sale_per_liter || 0, sale_pct || null, media || null, actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  const { code, name, description, unit, ncm, hs_code, color, width, width_unit, height, height_unit, thickness, thickness_unit, weight, weight_unit, tube_weight, tube_weight_unit, roll_diameter, roll_diameter_unit, volume, volume_unit, unit_cost, cost_currency, category, supplier, sale_price, sale_currency, cost_per_meter, sale_per_meter, cost_per_liter, sale_per_liter, sale_pct, media } = req.body;
  db.prepare(`
    UPDATE products SET code=?, name=?, description=?, unit=?, ncm=?, hs_code=?, color=?, width=?, width_unit=?, height=?, height_unit=?, thickness=?, thickness_unit=?, weight=?, weight_unit=?, tube_weight=?, tube_weight_unit=?, roll_diameter=?, roll_diameter_unit=?, volume=?, volume_unit=?, unit_cost=?, cost_currency=?, category=?, supplier=?, sale_price=?, sale_currency=?, cost_per_meter=?, sale_per_meter=?, cost_per_liter=?, sale_per_liter=?, sale_pct=?, media=?, updated_by=?
WHERE id=?
`).run(code, name, description, unit, ncm || '', hs_code || '', color || '', width, width_unit || 'cm', height, height_unit || 'cm', thickness, thickness_unit || 'mm', weight, weight_unit || 'kg', tube_weight || null, tube_weight_unit || 'kg', roll_diameter || null, roll_diameter_unit || 'cm', volume || null, volume_unit || 'L', unit_cost, cost_currency || 'USD', category, supplier, sale_price, sale_currency || 'USD', cost_per_meter, sale_per_meter, cost_per_liter || 0, sale_per_liter || 0, sale_pct || null, media || null, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id));
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── SAMPLES ─────────────────────────────────────────────────────────────────

app.get('/api/samples', (req, res) => {
  res.json(db.prepare('SELECT * FROM samples ORDER BY created_at DESC').all());
});

app.post('/api/samples', (req, res) => {
  const { code, product_id, product_name, category, client, requested_date, sent_date, feedback_date, status, notes } = req.body;
  const result = db.prepare(`
    INSERT INTO samples (code, product_id, product_name, category, client, requested_date, sent_date, feedback_date, status, notes, updated_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(code || '', product_id || null, product_name, category || '', client, requested_date, sent_date, feedback_date, status || 'Requested', notes, actorName(req));
  res.status(201).json(db.prepare('SELECT * FROM samples WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/samples/:id', (req, res) => {
  const { code, product_name, category, client, requested_date, sent_date, status, notes, media } = req.body;
  db.prepare(`
UPDATE samples SET code=?, product_name=?, category=?, client=?, requested_date=?, sent_date=?, status=?, notes=?, media=?, updated_by=?
WHERE id=?
`).run(code || '', product_name, category || '', client, requested_date, sent_date, status, notes, media || null, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM samples WHERE id=?').get(req.params.id));
});

app.patch('/api/samples/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE samples SET status=?, updated_by=? WHERE id=?').run(status, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM samples WHERE id=?').get(req.params.id));
});

app.delete('/api/samples/:id', (req, res) => {
  db.prepare('DELETE FROM samples WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── PROFORMAS ───────────────────────────────────────────────────────────────

app.get('/api/proformas', (req, res) => {
  res.json(db.prepare('SELECT * FROM proformas ORDER BY created_at DESC').all());
});

app.post('/api/proformas', (req, res) => {
  const { order_id, quotation_id, number, issue_date, validity, client, total, currency, status, notes,
    acquisition_company, incoterm, way_of_shipment, port_of_loading, port_of_discharge, supplier,
    payment_terms, production_days, delivery_days, items } = req.body;
  try {
    const result = db.prepare(`
INSERT INTO proformas (order_id, quotation_id, number, issue_date, validity, client, total, currency, status, notes,
  acquisition_company, incoterm, way_of_shipment, port_of_loading, port_of_discharge, supplier,
  payment_terms, production_days, delivery_days, items, updated_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(order_id || null, quotation_id || null, number, issue_date, validity, client, total, currency || 'USD', status || 'Draft', notes,
      acquisition_company || '', incoterm || '', way_of_shipment || 'By Sea', port_of_loading || '', port_of_discharge || '', supplier || '',
      payment_terms || null, production_days || null, delivery_days || null, items || null, actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM proformas WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/proformas/:id', (req, res) => {
  const { order_id, number, issue_date, validity, client, total, currency, status, notes,
    acquisition_company, incoterm, way_of_shipment, port_of_loading, port_of_discharge, supplier,
    payment_terms, production_days, delivery_days, items } = req.body;
  db.prepare(`
    UPDATE proformas SET order_id=?, number=?, issue_date=?, validity=?, client=?, total=?, currency=?, status=?, notes=?,
      acquisition_company=?, incoterm=?, way_of_shipment=?, port_of_loading=?, port_of_discharge=?, supplier=?,
      payment_terms=?, production_days=?, delivery_days=?, items=?, updated_by=?
    WHERE id=?
  `).run(order_id || null, number, issue_date, validity, client, total, currency, status, notes,
    acquisition_company || '', incoterm || '', way_of_shipment || 'By Sea', port_of_loading || '', port_of_discharge || '', supplier || '',
    payment_terms || null, production_days || null, delivery_days || null, items || null, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM proformas WHERE id=?').get(req.params.id));
});

app.delete('/api/proformas/:id', (req, res) => {
  db.prepare('DELETE FROM proformas WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── SUPPLIER CONTRACTS ───────────────────────────────────────────────────────

app.get('/api/contracts', (req, res) => {
  res.json(db.prepare('SELECT * FROM supplier_contracts ORDER BY created_at DESC').all());
});

app.post('/api/contracts', (req, res) => {
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

app.put('/api/contracts/:id', (req, res) => {
  const { order_id, contract_number, supplier, sign_date, delivery_date, total, currency, status, notes } = req.body;
  db.prepare(`
    UPDATE supplier_contracts SET order_id=?, contract_number=?, supplier=?, sign_date=?, delivery_date=?, total=?, currency=?, status=?, notes=?, updated_by=?
    WHERE id=?
  `).run(order_id || null, contract_number, supplier, sign_date, delivery_date, total, currency, status, notes, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM supplier_contracts WHERE id=?').get(req.params.id));
});

app.delete('/api/contracts/:id', (req, res) => {
  db.prepare('DELETE FROM supplier_contracts WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── FINANCIAL CLIENTS ────────────────────────────────────────────────────────

app.get('/api/financial/clients', (req, res) => {
  res.json(db.prepare('SELECT * FROM financial_clients ORDER BY due_date ASC').all());
});

app.post('/api/financial/clients', (req, res) => {
  const { order_id, client, description, type, amount, currency, due_date, paid_date, status, notes, paid_amount } = req.body;
  const result = db.prepare(`
    INSERT INTO financial_clients (order_id, client, description, type, amount, currency, due_date, paid_date, status, notes, paid_amount, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(order_id || null, client, description, type, amount, currency || 'USD', due_date, paid_date, status || 'Pending', notes, paid_amount || 0, actorName(req));
  res.status(201).json(db.prepare('SELECT * FROM financial_clients WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/financial/clients/:id', (req, res) => {
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

app.delete('/api/financial/clients/:id', (req, res) => {
  db.prepare('DELETE FROM financial_clients WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── FINANCIAL SUPPLIERS ──────────────────────────────────────────────────────

app.get('/api/financial/suppliers', (req, res) => {
  res.json(db.prepare('SELECT * FROM financial_suppliers ORDER BY due_date ASC').all());
});

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

app.put('/api/financial/suppliers/:id', (req, res) => {
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

app.delete('/api/financial/suppliers/:id', (req, res) => {
  db.prepare('DELETE FROM financial_suppliers WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── COMMERCIAL INVOICES ─────────────────────────────────────────────────────
// Shipment Date / Arrival Date are not duplicated onto commercial_invoices —
// the linked Order is the single source of truth, joined in here as
// shipment_date/arrival_date on each row. That's what makes editing the date
// from either screen "just work" without a separate sync step: there's only
// ever one place the value actually lives.
app.get('/api/commercial-invoices', (req, res) => {
  res.json(db.prepare(`
    SELECT ci.*, o.shipment_date AS shipment_date, o.arrival_date AS arrival_date
    FROM commercial_invoices ci
    LEFT JOIN orders o ON o.id = ci.order_id
    ORDER BY ci.created_at DESC
  `).all());
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

app.post('/api/commercial-invoices', (req, res) => {
  const { order_id, number, issue_date, client, total, currency, status, notes } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO commercial_invoices (order_id, number, issue_date, client, total, currency, status, notes, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, number, issue_date, client, total, currency || 'USD', status || 'Pending', notes, actorName(req));
    res.status(201).json(getCommercialInvoiceWithDates(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/commercial-invoices/:id', (req, res) => {
  const { order_id, number, issue_date, client, total, currency, status, notes, shipment_date, arrival_date } = req.body;
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
  res.json(getCommercialInvoiceWithDates(req.params.id));
});

app.delete('/api/commercial-invoices/:id', (req, res) => {
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

app.post('/api/packing-lists', (req, res) => {
  const { order_id, number, date, way_of_shipment, country_of_origin, country_of_acquisition,
    port_of_origin, port_of_destination, incoterm, manufacturer, manufacturer_address, items_json,
    total_length, total_roll, total_gross_weight, total_net_weight, total_cbm, status, notes, containers_json, loading_date } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO packing_lists (order_id, number, date, way_of_shipment, country_of_origin, country_of_acquisition,
        port_of_origin, port_of_destination, incoterm, manufacturer, manufacturer_address, items_json,
        total_length, total_roll, total_gross_weight, total_net_weight, total_cbm, status, notes, containers_json, loading_date, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, number, date, way_of_shipment || 'By Sea', country_of_origin || 'China', country_of_acquisition || '',
      port_of_origin || '', port_of_destination || '', incoterm || '', manufacturer || '', manufacturer_address || '', items_json || null,
      total_length || 0, total_roll || 0, total_gross_weight || 0, total_net_weight || 0, total_cbm || 0, status || 'Draft', notes || '', containers_json || null, loading_date || null, actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM packing_lists WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/packing-lists/:id', (req, res) => {
  const { order_id, number, date, way_of_shipment, country_of_origin, country_of_acquisition,
    port_of_origin, port_of_destination, incoterm, manufacturer, manufacturer_address, items_json,
    total_length, total_roll, total_gross_weight, total_net_weight, total_cbm, status, notes, containers_json, loading_date } = req.body;
  db.prepare(`
    UPDATE packing_lists SET order_id=?, number=?, date=?, way_of_shipment=?, country_of_origin=?, country_of_acquisition=?,
      port_of_origin=?, port_of_destination=?, incoterm=?, manufacturer=?, manufacturer_address=?, items_json=?,
      total_length=?, total_roll=?, total_gross_weight=?, total_net_weight=?, total_cbm=?, status=?, notes=?, containers_json=?, loading_date=?, updated_by=?
    WHERE id=?
  `).run(order_id || null, number, date, way_of_shipment || 'By Sea', country_of_origin || 'China', country_of_acquisition || '',
    port_of_origin || '', port_of_destination || '', incoterm || '', manufacturer || '', manufacturer_address || '', items_json || null,
    total_length || 0, total_roll || 0, total_gross_weight || 0, total_net_weight || 0, total_cbm || 0, status || 'Draft', notes || '', containers_json || null, loading_date || null, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM packing_lists WHERE id=?').get(req.params.id));
});

app.delete('/api/packing-lists/:id', (req, res) => {
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

app.post('/api/quotations', (req, res) => {
 const { number, client, suppliers, currency, deadline, specifications, notes, status, media, items, total, target_price } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO quotations (number, client, suppliers, currency, deadline, specifications, notes, status, media, items, total, target_price, updated_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(number, client, suppliers, currency || 'USD', deadline, specifications, notes, status || 'Open', media || null, items || null, total || null, target_price || null, actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM quotations WHERE id=?').get(result.lastInsertRowid));
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/quotations/:id', (req, res) => {
  const { number, client, suppliers, currency, deadline, specifications, notes, status, media, items, total, target_price } = req.body;
  db.prepare(`
    UPDATE quotations SET number=?, client=?, suppliers=?, currency=?, deadline=?, specifications=?, notes=?, status=?, media=?, items=?, total=?, target_price=?, updated_by=?
    WHERE id=?
  `).run(number, client, suppliers, currency, deadline, specifications, notes, status, media || null, items || null, total || null, target_price || null, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM quotations WHERE id=?').get(req.params.id));
});

app.delete('/api/quotations/:id', (req, res) => {
  db.prepare('DELETE FROM quotations WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── INSPECTIONS ──────────────────────────────────────────────────────────────
app.get('/api/inspections', (req, res) => {
  res.json(db.prepare('SELECT * FROM inspections ORDER BY created_at DESC').all());
});

app.post('/api/inspections', (req, res) => {
  const { order_id, number, inspection_date, inspector, result, observations, media } = req.body;
  try {
    const r = db.prepare(`
      INSERT INTO inspections (order_id, number, inspection_date, inspector, result, observations, media, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, number, inspection_date, inspector, result || 'Pending', observations, media || null, actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM inspections WHERE id=?').get(r.lastInsertRowid));
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/inspections/:id', (req, res) => {
  const { order_id, number, inspection_date, inspector, result, observations, media } = req.body;
  db.prepare(`
    UPDATE inspections SET order_id=?, number=?, inspection_date=?, inspector=?, result=?, observations=?, media=?, updated_by=?
    WHERE id=?
  `).run(order_id || null, number, inspection_date, inspector, result, observations, media || null, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM inspections WHERE id=?').get(req.params.id));
});

app.delete('/api/inspections/:id', (req, res) => {
  db.prepare('DELETE FROM inspections WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── REPORTS ─────────────────────────────────────────────────────────────────
// Single cross-module Excel export — every tracking screen (Quotations,
// Proformas, Orders, Commercial, Contracts, Inspections, Supplier Flow,
// Samples, Packing Lists), each as a pair of sheets (still open / already
// completed), filtered from ?since=YYYY-MM-DD onward. See
// xlsx/reportBuilder.js for the per-category queries and column layouts.
app.get('/api/reports/categories', (req, res) => {
  res.json(REPORT_CATEGORIES);
});

app.get('/api/reports/full', async (req, res) => {
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

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

app.get('/api/dashboard', (req, res) => {
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

  res.json({
    orderStats,
    clientFinancial: { pending: commercialPending.count, received: commercialPaid.count },
    supplierFinancial: { pending: supplierPending.count, paid: supplierPaid.count },
    pendingOrders,
    pendingQuotations,
    pendingCommercials,
    pendingInspections,
    pendingSamples,
    activeContracts,
    pendingSupplierPayments,
  });
});

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

app.get('/api/clients', (req, res) => {
  res.json(db.prepare('SELECT * FROM clients ORDER BY company_name').all());
});

app.post('/api/clients', (req, res) => {
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

app.put('/api/clients/:id', (req, res) => {
  const { company_name, address, address2, address_number, neighborhood, city, state, zip_code, country,
    email, phone, contact_name, payment_terms, tax_id, notes } = req.body;
  db.prepare(`
    UPDATE clients SET company_name=?, address=?, address2=?, address_number=?, neighborhood=?, city=?, state=?, zip_code=?, country=?, email=?, phone=?, contact_name=?, payment_terms=?, tax_id=?, notes=?, updated_by=?
    WHERE id=?
  `).run(company_name, address, address2, address_number || '', neighborhood || '', city || '', state || '', zip_code || '', country || '',
    email, phone, contact_name, payment_terms, tax_id || '', notes, actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id));
});

app.delete('/api/clients/:id', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────

app.get('/api/suppliers', (req, res) => {
  res.json(db.prepare('SELECT * FROM suppliers ORDER BY company_name').all());
});

app.post('/api/suppliers', (req, res) => {
  const { company_name, address, address2, address_number, neighborhood, city, state, zip_code, country,
    email, phone, contact_name, payment_terms, product_types, notes,
    beneficiary_name, bank_name, bank_branch, account_number, swift_code } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO suppliers (company_name, address, address2, address_number, neighborhood, city, state, zip_code, country, email, phone, contact_name, payment_terms, product_types, notes,
        beneficiary_name, bank_name, bank_branch, account_number, swift_code, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(company_name, address, address2, address_number || '', neighborhood || '', city || '', state || '', zip_code || '', country || '',
      email, phone, contact_name, payment_terms, product_types, notes,
      beneficiary_name || '', bank_name || '', bank_branch || '', account_number || '', swift_code || '', actorName(req));
    res.status(201).json(db.prepare('SELECT * FROM suppliers WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', (req, res) => {
  const { company_name, address, address2, address_number, neighborhood, city, state, zip_code, country,
    email, phone, contact_name, payment_terms, product_types, notes,
    beneficiary_name, bank_name, bank_branch, account_number, swift_code } = req.body;
  db.prepare(`
    UPDATE suppliers SET company_name=?, address=?, address2=?, address_number=?, neighborhood=?, city=?, state=?, zip_code=?, country=?, email=?, phone=?, contact_name=?, payment_terms=?, product_types=?, notes=?,
      beneficiary_name=?, bank_name=?, bank_branch=?, account_number=?, swift_code=?, updated_by=?
    WHERE id=?
  `).run(company_name, address, address2, address_number || '', neighborhood || '', city || '', state || '', zip_code || '', country || '',
    email, phone, contact_name, payment_terms, product_types, notes,
    beneficiary_name || '', bank_name || '', bank_branch || '', account_number || '', swift_code || '', actorName(req), req.params.id);
  res.json(db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id));
});

app.delete('/api/suppliers/:id', (req, res) => {
  db.prepare('DELETE FROM suppliers WHERE id=?').run(req.params.id);
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

function normalizeSalesItem(item, fallbackCurrency) {
  const product = getProduct(item.product_id);
  const category = item.category || product?.category || '';
  const isTextile = category === 'Textile' || category === 'DTF Film';
  // Meters per roll — the roll length used for this specific item (may
  // differ from the product's registered default when a custom length was
  // requested), shown as its own column for Textile/DTF Film.
  const metersPerRoll = isTextile
    ? (metersOf(item.height, item.height_unit) ?? metersOf(product?.height, product?.height_unit))
    : null;
  return {
    description: product?.name || item.product_name || '—',
    bullets: descriptionBullets(product),
    ncm: product?.ncm || '',
    color: product?.color || '',
    width: product?.width ? `${product.width}${product.width_unit || ''}` : '',
    weightSpec: product?.weight ? `${product.weight} ${product.weight_unit || ''}` : '',
    category,
    isTextile,
    quantity: item.quantity ?? null,
    unit: item.unit || '',
    metersPerRoll,
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
  return db.prepare('SELECT * FROM order_items WHERE order_id=?').all(orderId);
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

    const acqCode = pf.acquisition_company || order?.acquisition_company || 'HK';
    const acq = getAcq(acqCode);
    const clientRow = findClientByName(pf.client);

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
      // The company is a trading company (trader) — the "Manufacturer" shown on
      // client-facing docs is always the selected Acquisition Company, never
      // the real factory/supplier.
      manufacturer: { name: acq.name, address: acq.addressLine, tel: acq.tel },
      items,
      totalLength,
      totalWeight,
      totalQuantity,
      totalAmount,
      currency,
      // Payment terms / production / delivery days: prefer whatever was
      // filled in on the Proforma itself (it usually exists before any Order
      // does); fall back to the linked Order once one has been created.
      paymentTerms: pf.payment_terms || order?.payment_terms,
      productionDays: pf.production_days || order?.production_lead_time,
      deliveryDays: pf.delivery_days || order?.delivery_days,
      importer: { name: pf.client, address: fullAddress(clientRow), taxId: clientRow?.tax_id, tel: clientRow?.phone },
    });

    const pdf = await renderPdfBuffer(html);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`Proforma-${pf.number}.pdf`) });
    res.send(pdf);
  } catch (err) {
    console.error('Proforma PDF error:', err);
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
    let plSummary = pl ? `Rolls: ${pl.total_roll || 0} | Gross Weight: ${pl.total_gross_weight || 0} kg | Net Weight: ${pl.total_net_weight || 0} kg | CBM: ${pl.total_cbm || 0}` : '';
    if (pl && Array.isArray(plContainers) && plContainers.length > 1) {
      const sumOf = (arr, key) => arr.reduce((s, i) => s + (parseFloat(i[key]) || 0), 0);
      plSummary = plContainers.map(c => {
        // Same zero-roll filter as the Packing List PDF — unallocated rows
        // that only exist for the allocation UI shouldn't show up here.
        const containerItems = plItems.filter(i => (i.container_seq || 1) === c.seq && (parseFloat(i.roll) || 0) > 0);
        return `Container ${String(c.seq).padStart(2, '0')}: ${c.code || '—'} — Rolls: ${sumOf(containerItems, 'roll')} | Gross Weight: ${sumOf(containerItems, 'grossWeight').toFixed(1)} kg | Net Weight: ${sumOf(containerItems, 'netWeight').toFixed(1)} kg | CBM: ${sumOf(containerItems, 'cbm').toFixed(1)}`;
      }).filter(line => !/Rolls: 0 \|/.test(line));
    }

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
      // Trader company: "Manufacturer" is always the Acquisition Company, not the real supplier.
      manufacturer: { name: acq.name, address: acq.addressLine, tel: acq.tel },
      items,
      totalLength,
      totalWeight,
      totalQuantity,
      totalAmount,
      currency,
      paymentTerms: order?.payment_terms || ci.notes,
      productionDays: order?.production_lead_time,
      deliveryDays: order?.delivery_days,
      extraShipmentLine: plSummary,
      importer: { name: ci.client, address: fullAddress(clientRow), taxId: clientRow?.tax_id, tel: clientRow?.phone },
    });

    const pdf = await renderPdfBuffer(html);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`Commercial-${ci.number}.pdf`) });
    res.send(pdf);
  } catch (err) {
    console.error('Commercial invoice PDF error:', err);
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
    const acq = getAcq(pl.country_of_acquisition === 'Hong Kong' ? 'HK' : (order?.acquisition_company || 'HK'));

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
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`PackingList-${pl.number}.pdf`) });
    res.send(pdf);
  } catch (err) {
    console.error('Packing list PDF error:', err);
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
      // Gramatura (GSM) only applies to Textile/DTF Film, registered on the
      // product as weight g/m² or g/m.
      const gramatura = isTextile && product?.weight && (product.weight_unit === 'g/m²' || product.weight_unit === 'g/m')
        ? `${product.weight} ${product.weight_unit}` : '';
      // Total quantity in tons (replacing the roll count) — Gross Weight =
      // Net Weight (item.total_weight) + tube core weight × roll count.
      const netWeight = item.total_weight != null && item.total_weight !== '' ? parseFloat(item.total_weight) : null;
      const tubeWeightPerRoll = isTextile ? tubeWeightKg(product?.tube_weight, product?.tube_weight_unit) : 0;
      const grossWeightKg = netWeight != null ? netWeight + tubeWeightPerRoll * qty : null;
      const quantityTons = grossWeightKg != null ? grossWeightKg / 1000 : null;
      // unitPrice as stored on the item is a per-roll rate (what was
      // actually quoted/costed) — now that the Quantity column shows tons
      // instead of rolls, the Unit Price shown alongside it must also be
      // re-expressed as a per-ton rate, or unitPrice × quantity visually
      // stops matching Total (e.g. "RMB 237.00" per roll next to "27.552 t"
      // reads as if the total should be 237×27.552, when it's actually
      // 237×971 rolls — same total, wrong-looking math). Total itself is
      // unaffected, it's still unitPrice(perRoll) × qty(rolls).
      const total = unitPrice * qty;
      const unitPricePerTon = quantityTons ? total / quantityTons : unitPrice;
      return {
        productName: product?.name || item.product_name || '—',
        color: product?.color || '',
        code: item.product_code || product?.code || '',
        thickness: product?.thickness ? `${product.thickness}${product.thickness_unit || ''}` : '',
        width: product?.width ? `${product.width}${product.width_unit || ''}` : '',
        gramatura,
        quantityTons,
        unit: item.unit || '',
        unitPrice: unitPricePerTon,
        currency: item.cost_currency || item.currency || contract.currency,
        total,
      };
    });

    const acq = getAcq(order?.acquisition_company || 'NINGBO');

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

app.get('/api/financial/suppliers/:id/payment-notice-pdf', async (req, res) => {
  try {
    const fin = db.prepare('SELECT * FROM financial_suppliers WHERE id=?').get(req.params.id);
    if (!fin) return res.status(404).json({ error: 'Payment record not found' });
    const supplierRow = findSupplierByName(fin.supplier);
    const order = fin.order_id ? db.prepare('SELECT * FROM orders WHERE id=?').get(fin.order_id) : null;

    // Split-payment support: ?pct=20&label=Deposit renders just that
    // installment's slice of the total amount, with the label appended to
    // the purpose line — used when payment_schedule is a split like
    // "20/80" and the frontend generates one PDF per installment.
    const pct = req.query.pct ? parseFloat(req.query.pct) : null;
    const label = req.query.label || '';
    const amount = pct != null ? (parseFloat(fin.amount) || 0) * (pct / 100) : fin.amount;
    const purpose = label ? `${fin.description || ''} — ${label} (${pct}%)`.trim() : fin.description;

    const html = renderPaymentNotice({
      payer: fin.payer || (order?.acquisition_company ? getAcq(order.acquisition_company).name : ''),
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

    const pdf = await renderPdfBuffer(html);
    const suffix = label ? `-${label}` : '';
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`PaymentNotice-${fin.id}${suffix}.pdf`) });
    res.send(pdf);
  } catch (err) {
    console.error('Payment notice PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
