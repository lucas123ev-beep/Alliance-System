// Cross-entity activity log — a real audit trail of everything created,
// edited, status-changed or deleted anywhere in the system, independent of
// the (opt-in, per-recipient) notifications system in server.js. Powers the
// "Activity" screen, visible only to Lucas/Martiello/Gabriel/Juliana (same
// group as Swift HKAG — see permissions.js).
//
// Rather than hand-adding a logging call to every one of the ~50
// POST/PUT/PATCH/DELETE route handlers in server.js (high risk of missing
// one, and it'd scatter the same three lines everywhere), this is wired in
// ONCE as Express middleware that wraps res.json() for any request whose
// method+path matches an entry in ACTIVITY_ROUTES below. New entity types
// just need one more entry here, not a change inside their own route.
//
// Best-effort only: any failure writing to activity_log is swallowed (just
// logged to the console) so a bug in this file can never break the actual
// request it's piggybacking on.
const { actorName } = require('./auth');

// method, a path regex (capturing the numeric :id as group 1 when the
// route has one), the entityType shown on the Activity screen, the table
// to read a human label from, and which column(s) on that table to try (in
// order) for that label.
const ACTIVITY_ROUTES = [
  { method: 'POST',   regex: /^\/api\/orders$/,                             entityType: 'orders',              table: 'orders',              labelCols: ['order_number'] },
  { method: 'PUT',    regex: /^\/api\/orders\/(\d+)$/,                      entityType: 'orders',              table: 'orders',              labelCols: ['order_number'] },
  { method: 'DELETE', regex: /^\/api\/orders\/(\d+)$/,                      entityType: 'orders',              table: 'orders',              labelCols: ['order_number'] },
  { method: 'PATCH',  regex: /^\/api\/orders\/(\d+)\/status$/,              entityType: 'orders',              table: 'orders',              labelCols: ['order_number'] },

  { method: 'POST',   regex: /^\/api\/contracts$/,                         entityType: 'contracts',           table: 'supplier_contracts',  labelCols: ['contract_number'] },
  { method: 'PUT',    regex: /^\/api\/contracts\/(\d+)$/,                  entityType: 'contracts',           table: 'supplier_contracts',  labelCols: ['contract_number'] },
  { method: 'DELETE', regex: /^\/api\/contracts\/(\d+)$/,                  entityType: 'contracts',           table: 'supplier_contracts',  labelCols: ['contract_number'] },

  { method: 'POST',   regex: /^\/api\/products$/,                          entityType: 'products',            table: 'products',            labelCols: ['name'] },
  { method: 'PUT',    regex: /^\/api\/products\/(\d+)$/,                   entityType: 'products',            table: 'products',            labelCols: ['name'] },
  { method: 'DELETE', regex: /^\/api\/products\/(\d+)$/,                   entityType: 'products',            table: 'products',            labelCols: ['name'] },

  { method: 'POST',   regex: /^\/api\/samples$/,                           entityType: 'samples',             table: 'samples',             labelCols: ['code', 'product_name'] },
  { method: 'PUT',    regex: /^\/api\/samples\/(\d+)$/,                    entityType: 'samples',             table: 'samples',             labelCols: ['code', 'product_name'] },
  { method: 'PATCH',  regex: /^\/api\/samples\/(\d+)\/status$/,            entityType: 'samples',             table: 'samples',             labelCols: ['code', 'product_name'] },
  { method: 'DELETE', regex: /^\/api\/samples\/(\d+)$/,                    entityType: 'samples',             table: 'samples',             labelCols: ['code', 'product_name'] },

  { method: 'POST',   regex: /^\/api\/proformas$/,                         entityType: 'proformas',           table: 'proformas',           labelCols: ['number'] },
  { method: 'PUT',    regex: /^\/api\/proformas\/(\d+)$/,                  entityType: 'proformas',           table: 'proformas',           labelCols: ['number'] },
  { method: 'DELETE', regex: /^\/api\/proformas\/(\d+)$/,                  entityType: 'proformas',           table: 'proformas',           labelCols: ['number'] },

  { method: 'POST',   regex: /^\/api\/financial\/clients$/,                entityType: 'financial-clients',   table: 'financial_clients',   labelCols: ['client', 'description'] },
  { method: 'PUT',    regex: /^\/api\/financial\/clients\/(\d+)$/,         entityType: 'financial-clients',   table: 'financial_clients',   labelCols: ['client', 'description'] },
  { method: 'PATCH',  regex: /^\/api\/financial\/clients\/(\d+)\/status$/, entityType: 'financial-clients',   table: 'financial_clients',   labelCols: ['client', 'description'] },
  { method: 'DELETE', regex: /^\/api\/financial\/clients\/(\d+)$/,         entityType: 'financial-clients',   table: 'financial_clients',   labelCols: ['client', 'description'] },

  { method: 'POST',   regex: /^\/api\/financial\/suppliers$/,              entityType: 'financial-suppliers', table: 'financial_suppliers', labelCols: ['supplier', 'description'] },
  { method: 'PUT',    regex: /^\/api\/financial\/suppliers\/(\d+)$/,       entityType: 'financial-suppliers', table: 'financial_suppliers', labelCols: ['supplier', 'description'] },
  { method: 'PATCH',  regex: /^\/api\/financial\/suppliers\/(\d+)\/status$/, entityType: 'fin-suppliers',     table: 'financial_suppliers', labelCols: ['supplier', 'description'] },
  { method: 'DELETE', regex: /^\/api\/financial\/suppliers\/(\d+)$/,       entityType: 'financial-suppliers', table: 'financial_suppliers', labelCols: ['supplier', 'description'] },

  { method: 'POST',   regex: /^\/api\/commercial-invoices$/,               entityType: 'commercial-invoices', table: 'commercial_invoices', labelCols: ['number'] },
  { method: 'PUT',    regex: /^\/api\/commercial-invoices\/(\d+)$/,        entityType: 'commercial-invoices', table: 'commercial_invoices', labelCols: ['number'] },
  { method: 'DELETE', regex: /^\/api\/commercial-invoices\/(\d+)$/,        entityType: 'commercial-invoices', table: 'commercial_invoices', labelCols: ['number'] },

  { method: 'POST',   regex: /^\/api\/packing-lists$/,                     entityType: 'packing-lists',       table: 'packing_lists',       labelCols: ['number'] },
  { method: 'PUT',    regex: /^\/api\/packing-lists\/(\d+)$/,              entityType: 'packing-lists',       table: 'packing_lists',       labelCols: ['number'] },
  { method: 'DELETE', regex: /^\/api\/packing-lists\/(\d+)$/,              entityType: 'packing-lists',       table: 'packing_lists',       labelCols: ['number'] },

  { method: 'POST',   regex: /^\/api\/quotations$/,                        entityType: 'quotations',          table: 'quotations',          labelCols: ['number'] },
  { method: 'PUT',    regex: /^\/api\/quotations\/(\d+)$/,                 entityType: 'quotations',          table: 'quotations',          labelCols: ['number'] },
  { method: 'DELETE', regex: /^\/api\/quotations\/(\d+)$/,                 entityType: 'quotations',          table: 'quotations',          labelCols: ['number'] },

  { method: 'POST',   regex: /^\/api\/inspections$/,                       entityType: 'inspections',         table: 'inspections',         labelCols: ['number', 'product_name'] },
  { method: 'PUT',    regex: /^\/api\/inspections\/(\d+)$/,                entityType: 'inspections',         table: 'inspections',         labelCols: ['number', 'product_name'] },
  { method: 'DELETE', regex: /^\/api\/inspections\/(\d+)$/,                entityType: 'inspections',         table: 'inspections',         labelCols: ['number', 'product_name'] },

  { method: 'POST',   regex: /^\/api\/swift-transfers$/,                   entityType: 'swift-hkag',          table: 'swift_transfers',     labelCols: ['number'] },
  { method: 'PUT',    regex: /^\/api\/swift-transfers\/(\d+)$/,            entityType: 'swift-hkag',          table: 'swift_transfers',     labelCols: ['number'] },
  { method: 'DELETE', regex: /^\/api\/swift-transfers\/(\d+)$/,            entityType: 'swift-hkag',          table: 'swift_transfers',     labelCols: ['number'] },

  { method: 'POST',   regex: /^\/api\/clients$/,                           entityType: 'clients',             table: 'clients',             labelCols: ['company_name'] },
  { method: 'PUT',    regex: /^\/api\/clients\/(\d+)$/,                    entityType: 'clients',             table: 'clients',             labelCols: ['company_name'] },
  { method: 'DELETE', regex: /^\/api\/clients\/(\d+)$/,                    entityType: 'clients',             table: 'clients',             labelCols: ['company_name'] },

  { method: 'POST',   regex: /^\/api\/suppliers$/,                         entityType: 'suppliers',           table: 'suppliers',           labelCols: ['company_name'] },
  { method: 'PUT',    regex: /^\/api\/suppliers\/(\d+)$/,                  entityType: 'suppliers',           table: 'suppliers',           labelCols: ['company_name'] },
  { method: 'DELETE', regex: /^\/api\/suppliers\/(\d+)$/,                  entityType: 'suppliers',           table: 'suppliers',           labelCols: ['company_name'] },

  { method: 'POST',   regex: /^\/api\/freight-agents$/,                    entityType: 'freight-agents',      table: 'freight_agents',      labelCols: ['company_name'] },
  { method: 'PUT',    regex: /^\/api\/freight-agents\/(\d+)$/,             entityType: 'freight-agents',      table: 'freight_agents',      labelCols: ['company_name'] },
  { method: 'DELETE', regex: /^\/api\/freight-agents\/(\d+)$/,             entityType: 'freight-agents',      table: 'freight_agents',      labelCols: ['company_name'] },
];

function matchRoute(method, path) {
  for (const r of ACTIVITY_ROUTES) {
    if (r.method !== method) continue;
    const m = path.match(r.regex);
    if (m) return { ...r, id: m[1] || null };
  }
  return null;
}

function actionFor(method, path) {
  if (method === 'POST') return 'created';
  if (method === 'DELETE') return 'deleted';
  if (path.endsWith('/status')) return 'status_changed';
  return 'updated';
}

function labelFromRow(row, labelCols) {
  if (!row) return '';
  for (const c of labelCols) {
    if (row[c]) return String(row[c]);
  }
  return '';
}

function activityLogger(db) {
  const insert = db.prepare(`
    INSERT INTO activity_log (entity_type, record_label, action, detail, actor)
    VALUES (?, ?, ?, ?, ?)
  `);

  return (req, res, next) => {
    // req.path (and req.url) get the mount prefix stripped by Express for
    // the duration of a middleware mounted via app.use('/api', ...) — this
    // middleware would see "/quotations/42" instead of "/api/quotations/42"
    // if it matched against req.path, so every regex above (all anchored on
    // "^/api/...") would silently never match anything. req.originalUrl is
    // never rewritten this way, so that's what has to be matched against
    // instead (query string stripped, since it's irrelevant here and would
    // break the "$" end-anchors on routes with no :id, like POST /api/orders).
    const path = req.originalUrl.split('?')[0];
    const route = matchRoute(req.method, path);
    if (!route) return next();

    // DELETE responses are just {success:true} — nothing to read a label
    // from after the fact — so the row (and its label) has to be looked up
    // BEFORE the handler actually deletes it.
    let preDeleteLabel = null;
    if (req.method === 'DELETE' && route.id) {
      try {
        const row = db.prepare(`SELECT * FROM ${route.table} WHERE id = ?`).get(route.id);
        preDeleteLabel = labelFromRow(row, route.labelCols);
      } catch (err) {
        console.error('activityLogger pre-delete lookup failed:', err.message);
      }
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const label = req.method === 'DELETE' ? preDeleteLabel : labelFromRow(body, route.labelCols);
          const action = actionFor(req.method, path);
          const detail = action === 'status_changed' && req.body && req.body.status
            ? `→ ${req.body.status}` : null;
          insert.run(route.entityType, label || null, action, detail, actorName(req));
        } catch (err) {
          console.error('activityLogger insert failed:', err.message);
        }
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { activityLogger };
