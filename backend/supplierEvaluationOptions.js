// Fixed preset lists for the Supplier Evaluation feature (5-star rating that
// drops on problems and recovers on solutions -- see the supplier_evaluations
// table comment in database.js for the full model). This file is the single
// source of truth for every problem/solution type and its point value: the
// frontend never hardcodes these, it fetches them from
// GET /api/supplier-evaluation-options, and the backend never trusts a point
// value submitted by the client -- POST /api/suppliers/:id/evaluations always
// re-resolves the label/points from the `key` the client sent, looking it up
// in these same arrays. That keeps scoring consistent across every supplier
// regardless of who's logging the incident, and means adjusting a point
// value here immediately applies everywhere (list, report, history) without
// touching the frontend.
//
// Point scale: every supplier starts at 5.0. `problem_points` is always <= 0
// (deducted), `solution_points` is always >= 0 (recovered). A single
// incident's net effect is problem_points + solution_points -- e.g. a severe
// problem (-1.5) resolved with a weak solution like a discount on the next
// order (+0.25) nets -1.25, matching the client's own example (wrong fabric
// colors delivered, "fixed" with a discount -- a bad problem barely
// recovered).
//
// Every list also carries 3 generic severity levels (Pequeno/Médio/Grave for
// problems, Pequena/Média/Grande for solutions) for anything not covered by
// the specific presets below, per the client's explicit request.
const PROBLEM_OPTIONS = [
  { key: "generic_small", label: "Problema pequeno (genérico)", points: -0.25, generic: true },
  { key: "generic_medium", label: "Problema médio (genérico)", points: -0.75, generic: true },
  { key: "generic_severe", label: "Problema grave (genérico)", points: -1.5, generic: true },

  { key: "wrong_spec", label: "Produto / cor / especificação errada", points: -1.5 },
  { key: "quality_defect", label: "Qualidade abaixo do esperado / defeitos", points: -1.5 },
  { key: "failed_inspection", label: "Reprovado na inspeção", points: -1.5 },
  { key: "late_delivery", label: "Atraso na entrega", points: -1.0 },
  { key: "wrong_quantity", label: "Quantidade errada / faltando", points: -1.0 },
  { key: "damaged_goods", label: "Mercadoria danificada no transporte", points: -1.0 },
  { key: "price_dispute", label: "Cobrança fora do combinado (preço/pagamento)", points: -1.0 },
  { key: "documentation_error", label: "Erro em documentos (fatura, packing list, certificados)", points: -0.5 },
  { key: "packaging_issue", label: "Problema de embalagem", points: -0.5 },
  { key: "communication_issue", label: "Falta de comunicação / resposta lenta", points: -0.5 },
];

const SOLUTION_OPTIONS = [
  { key: "generic_small", label: "Solução pequena (genérico)", points: 0.1, generic: true },
  { key: "generic_medium", label: "Solução média (genérico)", points: 0.5, generic: true },
  { key: "generic_large", label: "Solução grande (genérico)", points: 1.5, generic: true },

  { key: "full_replacement_free", label: "Substituição total, sem custo", points: 1.5 },
  { key: "full_refund", label: "Reembolso total", points: 1.5 },
  { key: "fast_correction", label: "Correção rápida, sem impacto no pedido", points: 1.0 },
  { key: "partial_replacement_free", label: "Substituição parcial, sem custo", points: 0.75 },
  { key: "partial_refund", label: "Reembolso parcial", points: 0.75 },
  { key: "credit_note", label: "Nota de crédito para uso futuro", points: 0.5 },
  { key: "discount_next_order", label: "Desconto no próximo pedido", points: 0.25 },
  { key: "apology_only", label: "Só pediu desculpas, sem ação concreta", points: 0.1 },
  { key: "no_action", label: "Nenhuma solução oferecida", points: 0 },
];

function findProblem(key) {
  return PROBLEM_OPTIONS.find(o => o.key === key) || null;
}

function findSolution(key) {
  return SOLUTION_OPTIONS.find(o => o.key === key) || null;
}

// clamp(5 + sum of every incident's problem_points + solution_points, 0, 5).
// `rows` is an array of { problem_points, solution_points } (or any objects
// with those two numeric fields) -- both the per-supplier list query and the
// single-supplier evaluations endpoint share this.
function computeRating(rows) {
  const delta = (rows || []).reduce(
    (sum, r) => sum + (Number(r.problem_points) || 0) + (Number(r.solution_points) || 0),
    0
  );
  const rating = 5 + delta;
  return Math.max(0, Math.min(5, Math.round(rating * 100) / 100));
}

module.exports = { PROBLEM_OPTIONS, SOLUTION_OPTIONS, findProblem, findSolution, computeRating };
