// Per-user screen access + feature flags — who can see which sidebar
// tab, plus two narrower "can see this screen but not this one sensitive
// bit of it" flags. Keyed by username (lowercase, matches users.username)
// so adding a person or changing someone's access is a single edit here,
// not a hunt through server.js or App.jsx.
//
// `screens` mirrors the frontend's TABS ids exactly (see App.jsx's TABS
// array) — dashboard, quotations, proformas, orders, commercial,
// packing-lists, contracts, inspections, fin-suppliers, samples, products,
// clients, suppliers, freight-agents, reports.
//
// hideCommercialStatus: true means this person can open the Commercial
// Invoices screen (if they have that in `screens`) and the Dashboard (if
// they have that too) but never sees the Status (Pending/Paid) field or
// the "Pending Commercial Invoices" dashboard card — enforced both in the
// UI and by the backend stripping/ignoring `status` for these accounts
// (see server.js), so it isn't just hidden by CSS.
//
// hideMargin: true means the "Real Margin" indicator on the Product
// edit/create form is hidden for this person. This does NOT hide Cost
// Price or Sale Price themselves — several of the people this applies to
// (supplier negotiation, client quoting) genuinely need one or the other
// for their actual job, and hiding both numbers would break that. Only
// the derived "how much profit we make" callout is hidden, matching
// exactly what was asked for.
const ALL_SCREENS = [
  "dashboard", "quotations", "proformas", "orders", "commercial",
  "packing-lists", "contracts", "inspections", "fin-suppliers", "samples",
  "products", "clients", "suppliers", "freight-agents", "reports",
];

const PERMISSIONS = {
  lucas:     { screens: ALL_SCREENS, hideCommercialStatus: false, hideMargin: false },
  martiello: { screens: ALL_SCREENS, hideCommercialStatus: false, hideMargin: false },
  gabriel:   { screens: ALL_SCREENS, hideCommercialStatus: false, hideMargin: false },
  juliana:   { screens: ALL_SCREENS, hideCommercialStatus: false, hideMargin: false },

  // Full access, but never sees Commercial Invoice status (screen or
  // Dashboard card) or the Product Real Margin indicator.
  yukin: { screens: ALL_SCREENS, hideCommercialStatus: true, hideMargin: true },

  // Dashboard added on top of each person's existing screens, restricted
  // the same way as yukin: hideCommercialStatus hides the "Pending
  // Commercial Invoices" dashboard card (and the Status field on the
  // Commercial Invoices screen itself, for max who already has that
  // screen), hideMargin hides the Real Margin indicator on Products.
  keke: {
    screens: ["dashboard", "quotations", "samples", "products", "suppliers"],
    hideCommercialStatus: true, hideMargin: true,
  },
  amber: {
    screens: ["dashboard", "suppliers", "products", "contracts", "orders", "fin-suppliers", "samples", "inspections"],
    hideCommercialStatus: true, hideMargin: true,
  },
  max: {
    screens: ["dashboard", "orders", "proformas", "commercial", "packing-lists", "contracts", "products", "suppliers", "freight-agents"],
    hideCommercialStatus: true, hideMargin: true,
  },
  wang: {
    screens: ["dashboard", "quotations", "samples", "products", "suppliers", "inspections"],
    hideCommercialStatus: true, hideMargin: true,
  },
};

// Anyone not on the list above (shouldn't happen with a fixed 9-person
// team, but a new account added to `users` without a matching entry here
// should never silently inherit full access) gets nothing until someone
// adds them to PERMISSIONS.
const NO_ACCESS = { screens: [], hideCommercialStatus: true, hideMargin: true };

function permissionsFor(username) {
  return PERMISSIONS[String(username || "").toLowerCase()] || NO_ACCESS;
}

module.exports = { PERMISSIONS, ALL_SCREENS, permissionsFor };
