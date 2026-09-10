// Mirrors PAYMENT_SCHEDULES in frontend/App.jsx — kept in sync by hand
// (same pattern as questionnaireQuestions.js mirroring the frontend's
// standard question dictionary). Only used server-side to label each
// installment's due-date Calendar event (see calendar.js) with the same
// Deposit/Balance/etc. wording the Supplier Payment form itself shows —
// nothing here drives an actual calculation, so only `parts` (pct + label)
// needs to exist, not the full `label` shown in the frontend's dropdown.
const PAYMENT_SCHEDULES = {
  "100": { parts: [{ pct: 100, label: "" }] },
  "20/80": { parts: [{ pct: 20, label: "Deposit" }, { pct: 80, label: "Balance" }] },
  "30/70": { parts: [{ pct: 30, label: "Deposit" }, { pct: 70, label: "Balance" }] },
  "50/50": { parts: [{ pct: 50, label: "1st Payment" }, { pct: 50, label: "2nd Payment" }] },
  "20TT/BL": { parts: [{ pct: 20, label: "TT" }, { pct: 80, label: "Balance Against BL" }] },
  "30TT/BL": { parts: [{ pct: 30, label: "TT" }, { pct: 70, label: "Balance Against BL" }] },
};

module.exports = { PAYMENT_SCHEDULES };
