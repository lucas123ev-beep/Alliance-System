const express = require('express');
const cors = require('cors');
const db = require('./database');

const { renderPdfBuffer } = require('./pdf/render');
const { renderSalesInvoice } = require('./pdf/salesInvoice');
const { renderPackingList } = require('./pdf/packingList');
const { renderContract } = require('./pdf/contract');
const { renderPaymentNotice } = require('./pdf/paymentNotice');
const ACQUISITION_COMPANIES = require('./pdf/acquisitionCompanies');
const { parseJsonSafe } = require('./pdf/helpers');

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
          shipment_date, arrival_date, incoterm, payment_terms, port_of_loading, port_of_discharge, acquisition_company, container, container_qty, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(order_number, client, supplier, product, value, currency || 'USD', production_lead_time || null, delivery_days || null,
        shipment_date, arrival_date, incoterm, payment_terms, port_of_loading, port_of_discharge, acquisition_company || '', container || '', container_qty, notes);
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
    port_of_discharge, acquisition_company, container, notes, items } = req.body;
  db.prepare(`
    UPDATE orders SET order_number=?, client=?, supplier=?, product=?, value=?, currency=?,
      production_lead_time=?, delivery_days=?, shipment_date=?, arrival_date=?, incoterm=?,
      payment_terms=?, port_of_loading=?, port_of_discharge=?, acquisition_company=?, container=?, notes=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(order_number, client, supplier, product, value, currency, production_lead_time || null, delivery_days || null,
    shipment_date, arrival_date, incoterm, payment_terms, port_of_loading,
    port_of_discharge, acquisition_company || '', container || '', notes, req.params.id);

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
  db.prepare(`UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?`)
    .run(status, req.params.id);
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
  const { code, name, description, unit, ncm, hs_code, color, width, width_unit, height, height_unit, thickness, thickness_unit, weight, weight_unit, tube_weight, tube_weight_unit, volume, volume_unit, unit_cost, cost_currency, category, supplier, sale_price, sale_currency, cost_per_meter, sale_per_meter, cost_per_liter, sale_per_liter, sale_pct, media } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO products (code, name, description, unit, ncm, hs_code, color, width, width_unit, height, height_unit, thickness, thickness_unit, weight, weight_unit, tube_weight, tube_weight_unit, volume, volume_unit, unit_cost, cost_currency, category, supplier, sale_price, sale_currency, cost_per_meter, sale_per_meter, cost_per_liter, sale_per_liter, sale_pct, media)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(code, name, description, unit || 'unit', ncm || '', hs_code || '', color || '', width, width_unit || 'cm', height, height_unit || 'cm', thickness, thickness_unit || 'mm', weight, weight_unit || 'kg', tube_weight || null, tube_weight_unit || 'kg', volume || null, volume_unit || 'L', unit_cost || 0, cost_currency || 'USD', category, supplier, sale_price || 0, sale_currency || 'USD', cost_per_meter || 0, sale_per_meter || 0, cost_per_liter || 0, sale_per_liter || 0, sale_pct || null, media || null);
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  const { code, name, description, unit, ncm, hs_code, color, width, width_unit, height, height_unit, thickness, thickness_unit, weight, weight_unit, tube_weight, tube_weight_unit, volume, volume_unit, unit_cost, cost_currency, category, supplier, sale_price, sale_currency, cost_per_meter, sale_per_meter, cost_per_liter, sale_per_liter, sale_pct, media } = req.body;
  db.prepare(`
    UPDATE products SET code=?, name=?, description=?, unit=?, ncm=?, hs_code=?, color=?, width=?, width_unit=?, height=?, height_unit=?, thickness=?, thickness_unit=?, weight=?, weight_unit=?, tube_weight=?, tube_weight_unit=?, volume=?, volume_unit=?, unit_cost=?, cost_currency=?, category=?, supplier=?, sale_price=?, sale_currency=?, cost_per_meter=?, sale_per_meter=?, cost_per_liter=?, sale_per_liter=?, sale_pct=?, media=?
WHERE id=?
`).run(code, name, description, unit, ncm || '', hs_code || '', color || '', width, width_unit || 'cm', height, height_unit || 'cm', thickness, thickness_unit || 'mm', weight, weight_unit || 'kg', tube_weight || null, tube_weight_unit || 'kg', volume || null, volume_unit || 'L', unit_cost, cost_currency || 'USD', category, supplier, sale_price, sale_currency || 'USD', cost_per_meter, sale_per_meter, cost_per_liter || 0, sale_per_liter || 0, sale_pct || null, media || null, req.params.id);
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
    INSERT INTO samples (code, product_id, product_name, category, client, requested_date, sent_date, feedback_date, status, notes)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(code || '', product_id || null, product_name, category || '', client, requested_date, sent_date, feedback_date, status || 'Requested', notes);
  res.status(201).json(db.prepare('SELECT * FROM samples WHERE id=?').get(result.lastInsertRowid));
});

app.put('/api/samples/:id', (req, res) => {
  const { code, product_name, category, client, requested_date, sent_date, status, notes, media } = req.body;
  db.prepare(`
UPDATE samples SET code=?, product_name=?, category=?, client=?, requested_date=?, sent_date=?, status=?, notes=?, media=?
WHERE id=?
`).run(code || '', product_name, category || '', client, requested_date, sent_date, status, notes, media || null, req.params.id);
  res.json(db.prepare('SELECT * FROM samples WHERE id=?').get(req.params.id));
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
  const { order_id, quotation_id, number, issue_date, validity, client, total, currency, status, notes,
    acquisition_company, incoterm, way_of_shipment, port_of_loading, port_of_discharge, supplier,
    payment_terms, production_days, delivery_days, items } = req.body;
  try {
    const result = db.prepare(`
INSERT INTO proformas (order_id, quotation_id, number, issue_date, validity, client, total, currency, status, notes,
  acquisition_company, incoterm, way_of_shipment, port_of_loading, port_of_discharge, supplier,
  payment_terms, production_days, delivery_days, items)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(order_id || null, quotation_id || null, number, issue_date, validity, client, total, currency || 'USD', status || 'Draft', notes,
      acquisition_company || '', incoterm || '', way_of_shipment || 'By Sea', port_of_loading || '', port_of_discharge || '', supplier || '',
      payment_terms || null, production_days || null, delivery_days || null, items || null);
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
      payment_terms=?, production_days=?, delivery_days=?, items=?
    WHERE id=?
  `).run(order_id || null, number, issue_date, validity, client, total, currency, status, notes,
    acquisition_company || '', incoterm || '', way_of_shipment || 'By Sea', port_of_loading || '', port_of_discharge || '', supplier || '',
    payment_terms || null, production_days || null, delivery_days || null, items || null, req.params.id);
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
      INSERT INTO supplier_contracts (order_id, contract_number, supplier, sign_date, delivery_date, total, currency, status, notes, items_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(order_id || null, contract_number, supplier, sign_date, delivery_date, total, currency || 'USD', status || 'Draft', notes, items_json || null);
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

app.put('/api/financial/clients/:id', (req, res) => {
  const { order_id, client, description, type, amount, currency, due_date, paid_date, status, notes } = req.body;
  db.prepare(`
    UPDATE financial_clients SET order_id=?, client=?, description=?, type=?, amount=?, currency=?, due_date=?, paid_date=?, status=?, notes=?
    WHERE id=?
  `).run(order_id || null, client, description, type, amount, currency || 'USD', due_date, paid_date || null, status || 'Pending', notes, req.params.id);
  res.json(db.prepare('SELECT * FROM financial_clients WHERE id=?').get(req.params.id));
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
  const { order_id, supplier, description, type, amount, currency, due_date, status, notes, contract_id, items_json,
    payer, payment_method, applicant, approved_by, payment_schedule } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO financial_suppliers (order_id, supplier, description, type, amount, currency, due_date, status, notes, contract_id, items_json,
        payer, payment_method, applicant, approved_by, payment_schedule)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, supplier, description, type, amount, currency || 'USD', due_date, status || 'Pending', notes, contract_id || null, items_json || null,
      payer || '', payment_method || '网银汇款 Online bank payment', applicant || '', approved_by || '', payment_schedule || '100');
    res.status(201).json(db.prepare('SELECT * FROM financial_suppliers WHERE id=?').get(result.lastInsertRowid));
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/financial/suppliers/:id', (req, res) => {
  const { order_id, supplier, description, type, amount, currency, due_date, status, notes, contract_id, items_json,
    payer, payment_method, applicant, approved_by, paid_date, payment_schedule } = req.body;
  try {
    db.prepare(`
      UPDATE financial_suppliers SET order_id=?, supplier=?, description=?, type=?, amount=?, currency=?, due_date=?, status=?, notes=?,
        contract_id=?, items_json=?, payer=?, payment_method=?, applicant=?, approved_by=?, paid_date=?, payment_schedule=?
      WHERE id=?
    `).run(order_id || null, supplier, description, type, amount, currency || 'USD', due_date, status || 'Pending', notes,
      contract_id || null, items_json || null, payer || '', payment_method || '网银汇款 Online bank payment', applicant || '', approved_by || '', paid_date || null, payment_schedule || '100', req.params.id);
    res.json(db.prepare('SELECT * FROM financial_suppliers WHERE id=?').get(req.params.id));
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
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

// ─── COMMERCIAL INVOICES ─────────────────────────────────────────────────────
app.get('/api/commercial-invoices', (req, res) => {
  res.json(db.prepare('SELECT * FROM commercial_invoices ORDER BY created_at DESC').all());
});

app.post('/api/commercial-invoices', (req, res) => {
  const { order_id, number, issue_date, client, total, currency, status, notes } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO commercial_invoices (order_id, number, issue_date, client, total, currency, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, number, issue_date, client, total, currency || 'USD', status || 'Pending', notes);
    res.status(201).json(db.prepare('SELECT * FROM commercial_invoices WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/commercial-invoices/:id', (req, res) => {
  const { order_id, number, issue_date, client, total, currency, status, notes } = req.body;
  db.prepare(`
    UPDATE commercial_invoices SET order_id=?, number=?, issue_date=?, client=?, total=?, currency=?, status=?, notes=?
    WHERE id=?
  `).run(order_id || null, number, issue_date, client, total, currency, status, notes, req.params.id);
  res.json(db.prepare('SELECT * FROM commercial_invoices WHERE id=?').get(req.params.id));
});

app.delete('/api/commercial-invoices/:id', (req, res) => {
  db.prepare('DELETE FROM commercial_invoices WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── PACKING LISTS ────────────────────────────────────────────────────────────
app.get('/api/packing-lists', (req, res) => {
  res.json(db.prepare('SELECT * FROM packing_lists ORDER BY created_at DESC').all());
});

app.get('/api/packing-lists/:id', (req, res) => {
  const pl = db.prepare('SELECT * FROM packing_lists WHERE id=?').get(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Packing list not found' });
  res.json(pl);
});

app.post('/api/packing-lists', (req, res) => {
  const { order_id, number, date, way_of_shipment, country_of_origin, country_of_acquisition,
    port_of_origin, port_of_destination, incoterm, manufacturer, manufacturer_address, items_json,
    total_length, total_roll, total_gross_weight, total_net_weight, total_cbm, status, notes } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO packing_lists (order_id, number, date, way_of_shipment, country_of_origin, country_of_acquisition,
        port_of_origin, port_of_destination, incoterm, manufacturer, manufacturer_address, items_json,
        total_length, total_roll, total_gross_weight, total_net_weight, total_cbm, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, number, date, way_of_shipment || 'By Sea', country_of_origin || 'China', country_of_acquisition || '',
      port_of_origin || '', port_of_destination || '', incoterm || '', manufacturer || '', manufacturer_address || '', items_json || null,
      total_length || 0, total_roll || 0, total_gross_weight || 0, total_net_weight || 0, total_cbm || 0, status || 'Draft', notes || '');
    res.status(201).json(db.prepare('SELECT * FROM packing_lists WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/packing-lists/:id', (req, res) => {
  const { order_id, number, date, way_of_shipment, country_of_origin, country_of_acquisition,
    port_of_origin, port_of_destination, incoterm, manufacturer, manufacturer_address, items_json,
    total_length, total_roll, total_gross_weight, total_net_weight, total_cbm, status, notes } = req.body;
  db.prepare(`
    UPDATE packing_lists SET order_id=?, number=?, date=?, way_of_shipment=?, country_of_origin=?, country_of_acquisition=?,
      port_of_origin=?, port_of_destination=?, incoterm=?, manufacturer=?, manufacturer_address=?, items_json=?,
      total_length=?, total_roll=?, total_gross_weight=?, total_net_weight=?, total_cbm=?, status=?, notes=?
    WHERE id=?
  `).run(order_id || null, number, date, way_of_shipment || 'By Sea', country_of_origin || 'China', country_of_acquisition || '',
    port_of_origin || '', port_of_destination || '', incoterm || '', manufacturer || '', manufacturer_address || '', items_json || null,
    total_length || 0, total_roll || 0, total_gross_weight || 0, total_net_weight || 0, total_cbm || 0, status || 'Draft', notes || '', req.params.id);
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
      INSERT INTO quotations (number, client, suppliers, currency, deadline, specifications, notes, status, media, items, total, target_price)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(number, client, suppliers, currency || 'USD', deadline, specifications, notes, status || 'Open', media || null, items || null, total || null, target_price || null);
    res.status(201).json(db.prepare('SELECT * FROM quotations WHERE id=?').get(result.lastInsertRowid));
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/quotations/:id', (req, res) => {
  const { number, client, suppliers, currency, deadline, specifications, notes, status, media, items, total, target_price } = req.body;
  db.prepare(`
    UPDATE quotations SET number=?, client=?, suppliers=?, currency=?, deadline=?, specifications=?, notes=?, status=?, media=?, items=?, total=?, target_price=?
    WHERE id=?
  `).run(number, client, suppliers, currency, deadline, specifications, notes, status, media || null, items || null, total || null, target_price || null, req.params.id);
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
      INSERT INTO inspections (order_id, number, inspection_date, inspector, result, observations, media)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(order_id || null, number, inspection_date, inspector, result || 'Pending', observations, media || null);
    res.status(201).json(db.prepare('SELECT * FROM inspections WHERE id=?').get(r.lastInsertRowid));
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/inspections/:id', (req, res) => {
  const { order_id, number, inspection_date, inspector, result, observations, media } = req.body;
  db.prepare(`
    UPDATE inspections SET order_id=?, number=?, inspection_date=?, inspector=?, result=?, observations=?, media=?
    WHERE id=?
  `).run(order_id || null, number, inspection_date, inspector, result, observations, media || null, req.params.id);
  res.json(db.prepare('SELECT * FROM inspections WHERE id=?').get(req.params.id));
});

app.delete('/api/inspections/:id', (req, res) => {
  db.prepare('DELETE FROM inspections WHERE id=?').run(req.params.id);
  res.json({ success: true });
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
      INSERT INTO clients (company_name, address, address2, address_number, neighborhood, city, state, zip_code, country, email, phone, contact_name, payment_terms, tax_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(company_name, address, address2, address_number || '', neighborhood || '', city || '', state || '', zip_code || '', country || '',
      email, phone, contact_name, payment_terms, tax_id || '', notes);
    res.status(201).json(db.prepare('SELECT * FROM clients WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/clients/:id', (req, res) => {
  const { company_name, address, address2, address_number, neighborhood, city, state, zip_code, country,
    email, phone, contact_name, payment_terms, tax_id, notes } = req.body;
  db.prepare(`
    UPDATE clients SET company_name=?, address=?, address2=?, address_number=?, neighborhood=?, city=?, state=?, zip_code=?, country=?, email=?, phone=?, contact_name=?, payment_terms=?, tax_id=?, notes=?
    WHERE id=?
  `).run(company_name, address, address2, address_number || '', neighborhood || '', city || '', state || '', zip_code || '', country || '',
    email, phone, contact_name, payment_terms, tax_id || '', notes, req.params.id);
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
        beneficiary_name, bank_name, bank_branch, account_number, swift_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(company_name, address, address2, address_number || '', neighborhood || '', city || '', state || '', zip_code || '', country || '',
      email, phone, contact_name, payment_terms, product_types, notes,
      beneficiary_name || '', bank_name || '', bank_branch || '', account_number || '', swift_code || '');
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
      beneficiary_name=?, bank_name=?, bank_branch=?, account_number=?, swift_code=?
    WHERE id=?
  `).run(company_name, address, address2, address_number || '', neighborhood || '', city || '', state || '', zip_code || '', country || '',
    email, phone, contact_name, payment_terms, product_types, notes,
    beneficiary_name || '', bank_name || '', bank_branch || '', account_number || '', swift_code || '', req.params.id);
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
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Proforma-${pf.number}.pdf"` });
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
    const plSummary = pl ? `Rolls: ${pl.total_roll || 0} | Gross Weight: ${pl.total_gross_weight || 0} kg | Net Weight: ${pl.total_net_weight || 0} kg | CBM: ${pl.total_cbm || 0}` : '';

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
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Commercial-${ci.number}.pdf"` });
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
      totals: {
        totalLength: pl.total_length, totalRoll: pl.total_roll,
        totalGrossWeight: pl.total_gross_weight, totalNetWeight: pl.total_net_weight, totalCbm: pl.total_cbm,
      },
      importer: { name: order?.client, address: fullAddress(clientRow), taxId: clientRow?.tax_id, tel: clientRow?.phone },
    });

    const pdf = await renderPdfBuffer(html);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="PackingList-${pl.number}.pdf"` });
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
      return {
        productName: product?.name || item.product_name || '—',
        color: product?.color || '',
        code: item.product_code || product?.code || '',
        thickness: product?.thickness ? `${product.thickness}${product.thickness_unit || ''}` : '',
        width: product?.width ? `${product.width}${product.width_unit || ''}` : '',
        gramatura,
        quantityTons,
        unit: item.unit || '',
        unitPrice,
        currency: item.cost_currency || item.currency || contract.currency,
        total: unitPrice * qty,
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
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Contract-${contract.contract_number}.pdf"` });
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
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="PaymentNotice-${fin.id}${suffix}.pdf"` });
    res.send(pdf);
  } catch (err) {
    console.error('Payment notice PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
