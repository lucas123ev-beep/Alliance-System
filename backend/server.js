const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://alliance-system.vercel.app"
  ]
}));
app.use(express.json());

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
  const { order_number, client, supplier, product, value, currency, production_lead_time,
    shipment_date, arrival_date, incoterm, payment_terms, port_of_loading,
    port_of_discharge, acquisition_company, notes, items } = req.body;
  try {
    const insert = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO orders (order_number, client, supplier, product, value, currency, production_lead_time,
  shipment_date, arrival_date, incoterm, payment_terms, port_of_loading, port_of_discharge, acquisition_company, notes)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(order_number, client, supplier, product, value, currency || 'USD', production_lead_time,
  shipment_date, arrival_date, incoterm, payment_terms, port_of_loading, port_of_discharge, acquisition_company || '', notes);
      const orderId = result.lastInsertRowid;
      if (items && items.length > 0) {
        const insertItem = db.prepare(`
  INSERT INTO order_items (order_id, product_id, product_name, product_code, supplier, quantity, unit, unit_price, currency, total, total_weight, total_meterage)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
        for (const item of items) {
          insertItem.run(orderId, item.product_id || null, item.product_name,
  item.product_code || null, item.supplier || null, item.quantity,
  item.unit || 'unit', item.unit_price, item.currency || 'USD', item.total || 0, item.total_weight || null, item.total_meterage || null);
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
  const { order_number, client, supplier, product, value, currency, production_lead_time,
    shipment_date, arrival_date, incoterm, payment_terms, port_of_loading,
    port_of_discharge, notes, items } = req.body;
  db.prepare(`
    UPDATE orders SET order_number=?, client=?, supplier=?, product=?, value=?, currency=?,
      production_lead_time=?, shipment_date=?, arrival_date=?, incoterm=?,
      payment_terms=?, port_of_loading=?, port_of_discharge=?, acquisition_company=?, notes=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(order_number, client, supplier, product, value, currency, production_lead_time,
    shipment_date, arrival_date, incoterm, payment_terms, port_of_loading,
    port_of_discharge, acquisition_company || '', notes, req.params.id);

db.prepare('DELETE FROM order_items WHERE order_id=?').run(req.params.id);
if (items && items.length > 0) {
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, product_code, supplier, quantity, unit, unit_price, currency, total, total_weight, total_meterage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of items) {
    insertItem.run(req.params.id, item.product_id || null, item.product_name,
      item.product_code || null, item.supplier || null, item.quantity,
      item.unit || 'unit', item.unit_price, item.currency || 'USD', item.total || 0, item.total_weight || null, item.total_meterage || null);
  }
}

  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  const savedItems = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(req.params.id);
  res.json({ ...order, items: savedItems });
});

app.delete('/api/orders/:id', (req, res) => {
  db.prepare('DELETE FROM order_items WHERE order_id=?').run(req.params.id);
  db.prepare('DELETE FROM proformas WHERE order_id=?').run(req.params.id);
  db.prepare('DELETE FROM supplier_contracts WHERE order_id=?').run(req.params.id);
  db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Pending', 'In Production', 'Inspection', 'Completed'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare(`UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?`)
    .run(status, req.params.id);
  res.json(db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id));
});

app.put('/api/orders/:id', (req, res) => {
  const { order_number, client, supplier, product, value, currency, production_lead_time,
    shipment_date, arrival_date, incoterm, payment_terms, port_of_loading,
    port_of_discharge, notes, items } = req.body;
  db.prepare(`
    UPDATE orders SET order_number=?, client=?, supplier=?, product=?, value=?, currency=?,
      production_lead_time=?, shipment_date=?, arrival_date=?, incoterm=?,
      payment_terms=?, port_of_loading=?, port_of_discharge=?, notes=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(order_number, client, supplier, product, value, currency, production_lead_time,
    shipment_date, arrival_date, incoterm, payment_terms, port_of_loading,
    port_of_discharge, notes, req.params.id);

  if (items && items.length > 0) {
    db.prepare('DELETE FROM order_items WHERE order_id=?').run(req.params.id);
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, product_code, supplier, quantity, unit, unit_price, currency, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      insertItem.run(req.params.id, item.product_id || null, item.product_name,
        item.product_code || "", item.supplier || "", item.quantity,
        item.unit || 'unit', item.unit_price, item.currency || 'USD', item.total);
    }
  }

  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  const savedItems = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(req.params.id);
  res.json({ ...order, items: savedItems });
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
  const { code, name, description, unit, ncm, width, width_unit, height, height_unit, thickness, thickness_unit, weight, weight_unit, unit_cost, cost_currency, category, supplier } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO products (code, name, description, unit, ncm, width, width_unit, height, height_unit, thickness, thickness_unit, weight, weight_unit, unit_cost, cost_currency, category, supplier)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(code, name, description, unit || 'unit', ncm || '', width, width_unit || 'cm', height, height_unit || 'cm', thickness, thickness_unit || 'mm', weight, weight_unit || 'kg', unit_cost || 0, cost_currency || 'USD', category, supplier);
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  const { code, name, description, unit, ncm, width, width_unit, height, height_unit, thickness, thickness_unit, weight, weight_unit, unit_cost, cost_currency, category, supplier } = req.body;
db.prepare(`
  UPDATE products SET code=?, name=?, description=?, unit=?, ncm=?, width=?, width_unit=?, height=?, height_unit=?, thickness=?, thickness_unit=?, weight=?, weight_unit=?, unit_cost=?, cost_currency=?, category=?, supplier=?
  WHERE id=?
`).run(code, name, description, unit, ncm || '', width, width_unit || 'cm', height, height_unit || 'cm', thickness, thickness_unit || 'mm', weight, weight_unit || 'kg', unit_cost, cost_currency || 'USD', category, supplier, req.params.id);
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
  const { product_id, product_name, client, requested_date, sent_date, feedback_date, status, notes } = req.body;
  const result = db.prepare(`
    INSERT INTO samples (product_id, product_name, client, requested_date, sent_date, feedback_date, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(product_id || null, product_name, client, requested_date, sent_date, feedback_date, status || 'Requested', notes);
  res.status(201).json(db.prepare('SELECT * FROM samples WHERE id=?').get(result.lastInsertRowid));
});

app.patch('/api/samples/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE samples SET status=? WHERE id=?').run(status, req.params.id);
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
  const { order_id, number, issue_date, validity, client, total, currency, status, notes } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO proformas (order_id, number, issue_date, validity, client, total, currency, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, number, issue_date, validity, client, total, currency || 'USD', status || 'Draft', notes);
    res.status(201).json(db.prepare('SELECT * FROM proformas WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/proformas/:id', (req, res) => {
  const { order_id, number, issue_date, validity, client, total, currency, status, notes } = req.body;
  db.prepare(`
    UPDATE proformas SET order_id=?, number=?, issue_date=?, validity=?, client=?, total=?, currency=?, status=?, notes=?
    WHERE id=?
  `).run(order_id || null, number, issue_date, validity, client, total, currency, status, notes, req.params.id);
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
  const { order_id, contract_number, supplier, sign_date, delivery_date, total, currency, status, notes } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO supplier_contracts (order_id, contract_number, supplier, sign_date, delivery_date, total, currency, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, contract_number, supplier, sign_date, delivery_date, total, currency || 'USD', status || 'Draft', notes);
    res.status(201).json(db.prepare('SELECT * FROM supplier_contracts WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/contracts/:id', (req, res) => {
  const { order_id, contract_number, supplier, sign_date, delivery_date, total, currency, status, notes } = req.body;
  db.prepare(`
    UPDATE supplier_contracts SET order_id=?, contract_number=?, supplier=?, sign_date=?, delivery_date=?, total=?, currency=?, status=?, notes=?
    WHERE id=?
  `).run(order_id || null, contract_number, supplier, sign_date, delivery_date, total, currency, status, notes, req.params.id);
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
  const { order_id, client, description, type, amount, currency, due_date, paid_date, status, notes } = req.body;
  const result = db.prepare(`
    INSERT INTO financial_clients (order_id, client, description, type, amount, currency, due_date, paid_date, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(order_id || null, client, description, type, amount, currency || 'USD', due_date, paid_date, status || 'Pending', notes);
  res.status(201).json(db.prepare('SELECT * FROM financial_clients WHERE id=?').get(result.lastInsertRowid));
});

app.patch('/api/financial/clients/:id/status', (req, res) => {
  const { status, paid_date } = req.body;
  db.prepare('UPDATE financial_clients SET status=?, paid_date=? WHERE id=?').run(status, paid_date || null, req.params.id);
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
  const { order_id, supplier, description, type, amount, currency, due_date, paid_date, status, notes } = req.body;
  const result = db.prepare(`
    INSERT INTO financial_suppliers (order_id, supplier, description, type, amount, currency, due_date, paid_date, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(order_id || null, supplier, description, type, amount, currency || 'USD', due_date, paid_date, status || 'Pending', notes);
  res.status(201).json(db.prepare('SELECT * FROM financial_suppliers WHERE id=?').get(result.lastInsertRowid));
});

app.patch('/api/financial/suppliers/:id/status', (req, res) => {
  const { status, paid_date } = req.body;
  db.prepare('UPDATE financial_suppliers SET status=?, paid_date=? WHERE id=?').run(status, paid_date || null, req.params.id);
  res.json(db.prepare('SELECT * FROM financial_suppliers WHERE id=?').get(req.params.id));
});

app.delete('/api/financial/suppliers/:id', (req, res) => {
  db.prepare('DELETE FROM financial_suppliers WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

app.get('/api/dashboard', (req, res) => {
  const orderStats = db.prepare(`
    SELECT status, COUNT(*) as count, SUM(value) as total_value
    FROM orders GROUP BY status
  `).all();

  const sampleStats = db.prepare(`
    SELECT status, COUNT(*) as count FROM samples GROUP BY status
  `).all();

  const clientFinancial = db.prepare(`
    SELECT 
      SUM(CASE WHEN status='Pending' THEN amount ELSE 0 END) as pending,
      SUM(CASE WHEN status='Paid' THEN amount ELSE 0 END) as received,
      SUM(amount) as total
    FROM financial_clients
  `).get();

  const supplierFinancial = db.prepare(`
    SELECT 
      SUM(CASE WHEN status='Pending' THEN amount ELSE 0 END) as pending,
      SUM(CASE WHEN status='Paid' THEN amount ELSE 0 END) as paid,
      SUM(amount) as total
    FROM financial_suppliers
  `).get();

  const recentOrders = db.prepare(`
    SELECT * FROM orders ORDER BY created_at DESC LIMIT 5
  `).all();

  res.json({ orderStats, sampleStats, clientFinancial, supplierFinancial, recentOrders });
});

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

app.get('/api/clients', (req, res) => {
  res.json(db.prepare('SELECT * FROM clients ORDER BY company_name').all());
});

app.post('/api/clients', (req, res) => {
  const { company_name, address, address2, email, phone, contact_name, payment_terms, notes } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO clients (company_name, address, address2, email, phone, contact_name, payment_terms, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(company_name, address, address2, email, phone, contact_name, payment_terms, notes);
    res.status(201).json(db.prepare('SELECT * FROM clients WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/clients/:id', (req, res) => {
  const { company_name, address, address2, email, phone, contact_name, payment_terms, notes } = req.body;
  db.prepare(`
    UPDATE clients SET company_name=?, address=?, address2=?, email=?, phone=?, contact_name=?, payment_terms=?, notes=?
    WHERE id=?
  `).run(company_name, address, address2, email, phone, contact_name, payment_terms, notes, req.params.id);
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
  const { company_name, address, address2, email, phone, contact_name, payment_terms, product_types, notes } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO suppliers (company_name, address, address2, email, phone, contact_name, payment_terms, product_types, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(company_name, address, address2, email, phone, contact_name, payment_terms, product_types, notes);
    res.status(201).json(db.prepare('SELECT * FROM suppliers WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', (req, res) => {
  const { company_name, address, address2, email, phone, contact_name, payment_terms, product_types, notes } = req.body;
  db.prepare(`
    UPDATE suppliers SET company_name=?, address=?, address2=?, email=?, phone=?, contact_name=?, payment_terms=?, product_types=?, notes=?
    WHERE id=?
  `).run(company_name, address, address2, email, phone, contact_name, payment_terms, product_types, notes, req.params.id);
  res.json(db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id));
});

app.delete('/api/suppliers/:id', (req, res) => {
  db.prepare('DELETE FROM suppliers WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
