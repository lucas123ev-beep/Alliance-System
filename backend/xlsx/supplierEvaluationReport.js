// Supplier Evaluation Excel report — one sheet per supplier, listing that
// supplier's full incident history (problem + solution + points + notes +
// who logged it) plus its current 5-star rating, right in the sheet title.
// Triggered from the Suppliers screen (Evaluation modal / list), either for
// every supplier or a chosen subset — see GET /api/suppliers/evaluations/report
// in server.js.
//
// Reuses addReportSheet/toExcelDate/safeSheetName from reportBuilder.js so
// this shares the exact same letterhead/column styling as every other
// generated report instead of re-implementing it.
const ExcelJS = require("exceljs");
const { addReportSheet, toExcelDate, safeSheetName } = require("./reportBuilder");
const { computeRating } = require("../supplierEvaluationOptions");

const COLUMNS = [
  { key: "date", header: "Date", width: 13, type: "date" },
  { key: "problem", header: "Problem", width: 34 },
  { key: "problem_points", header: "Problem Points", width: 14, type: "decimal" },
  { key: "problem_notes", header: "Problem Notes", width: 34 },
  { key: "solution", header: "Solution", width: 34 },
  { key: "solution_points", header: "Solution Points", width: 14, type: "decimal" },
  { key: "solution_notes", header: "Solution Notes", width: 34 },
  { key: "net", header: "Net", width: 10, type: "decimal" },
  { key: "logged_by", header: "Logged By", width: 16 },
];

// `supplierIds`: array of supplier.id to include, or null/undefined/empty
// for every supplier registered. Suppliers with zero incidents still get a
// sheet (empty table, rating stays 5.0) — the point of the report is "here's
// this supplier's full record," and a clean record is still a record.
function buildSupplierEvaluationReportWorkbook(db, supplierIds) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Alliance Flow";
  workbook.created = new Date();

  const suppliers = supplierIds && supplierIds.length
    ? db.prepare(`SELECT * FROM suppliers WHERE id IN (${supplierIds.map(() => "?").join(",")}) ORDER BY company_name COLLATE NOCASE`).all(...supplierIds)
    : db.prepare("SELECT * FROM suppliers ORDER BY company_name COLLATE NOCASE").all();

  const usedNames = new Set();
  suppliers.forEach(supplier => {
    const rows = db.prepare(
      "SELECT * FROM supplier_evaluations WHERE supplier_id=? ORDER BY created_at ASC, id ASC"
    ).all(supplier.id);
    const rating = computeRating(rows);

    addReportSheet(workbook, {
      sheetName: safeSheetName(supplier.company_name || `Supplier ${supplier.id}`, usedNames),
      title: `${(supplier.company_name || "SUPPLIER").toUpperCase()} — RATING ${rating.toFixed(2)}/5`,
      columns: COLUMNS,
      rows: rows.map(r => ({
        date: toExcelDate(r.created_at),
        problem: r.problem_label,
        problem_points: r.problem_points,
        problem_notes: r.problem_notes || "",
        solution: r.solution_label,
        solution_points: r.solution_points,
        solution_notes: r.solution_notes || "",
        net: r.problem_points + r.solution_points,
        logged_by: r.created_by || "",
      })),
    });
  });

  return workbook;
}

module.exports = { buildSupplierEvaluationReportWorkbook };
