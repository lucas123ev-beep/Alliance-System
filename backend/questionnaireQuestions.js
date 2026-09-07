// Standard/preset question list for the Supplier Questionnaire builder (see
// the "Questionnaire" button on the Quotations list, and
// xlsx/questionnaireXlsx.js for how these get laid out into the generated
// spreadsheet). Each preset has a stable `key` — a saved question on a
// Quotation stores that key (not the text itself), so switching the
// questionnaire's language always re-translates every standard question
// used, while anything the user typed by hand (no key — see `text` on the
// question object instead) is left exactly as typed, in whichever language
// it was written in. Per the client's explicit choice: only these presets
// get machine-translated, never free-typed text.
//
// Mirrored on the frontend (App.jsx, QUESTIONNAIRE_STANDARD_QUESTIONS) for
// the picker dropdown — keep both lists' keys in sync if either changes;
// there's no shared module between the two, same as every other small
// static dictionary in this app (PAYMENT_TERMS_OPTIONS, currency labels...).
const STANDARD_QUESTIONS = {
  pt: {
    moq: "Qual é o MOQ (quantidade mínima de pedido)?",
    unit_price: "Qual é o preço unitário?",
    lead_time: "Qual é o prazo de produção?",
    payment_terms: "Quais são as condições de pagamento aceitas?",
    packaging: "Como é a embalagem do produto?",
    colors: "Quais cores estão disponíveis?",
    sizes: "Quais tamanhos estão disponíveis?",
    sample: "Há amostra disponível? Quanto tempo leva e qual o custo?",
    certification: "Este produto possui alguma certificação (CE, ISO, etc.)?",
    material: "Qual é a composição do material?",
    // This is asked TO THE CLIENT (see the Questionnaire button on the
    // Quotations list — the whole document is for the client, not the
    // supplier), so it asks what they want, not what's technically
    // possible — worded as a capability question ("é possível...?") reads
    // like it's addressed to the factory instead.
    customization: "Deseja personalização com marca/logo próprios?",
    port_of_loading: "De qual porto esse produto será embarcado?",
  },
  en: {
    moq: "What is the MOQ (Minimum Order Quantity)?",
    unit_price: "What is the unit price?",
    lead_time: "What is the production lead time?",
    payment_terms: "What payment terms are accepted?",
    packaging: "How is the product packaged?",
    colors: "What colors are available?",
    sizes: "What sizes are available?",
    sample: "Is a sample available? How long does it take and how much does it cost?",
    certification: "Does this product have any certifications (CE, ISO, etc.)?",
    material: "What is the material composition?",
    customization: "Would you like customization with your own brand/logo?",
    port_of_loading: "Which port will this be shipped from?",
  },
  zh: {
    moq: "起订量（MOQ）是多少？",
    unit_price: "单价是多少？",
    lead_time: "生产周期是多久？",
    payment_terms: "可接受的付款方式是什么？",
    packaging: "产品的包装方式是怎样的？",
    colors: "有哪些颜色可选？",
    sizes: "有哪些尺寸可选？",
    sample: "是否可以提供样品？需要多长时间，费用是多少？",
    certification: "该产品是否有认证（CE、ISO等）？",
    material: "材质成分是什么？",
    customization: "您是否需要定制专属品牌/logo？",
    port_of_loading: "该产品将从哪个港口发货？",
  },
};

// Stable order for the picker dropdown — Object.keys(STANDARD_QUESTIONS.en)
// would work too, but an explicit list keeps the order intentional instead
// of accidental insertion order.
const STANDARD_QUESTION_KEYS = [
  "moq", "unit_price", "lead_time", "payment_terms", "packaging", "colors",
  "sizes", "sample", "certification", "material", "customization", "port_of_loading",
];

module.exports = { STANDARD_QUESTIONS, STANDARD_QUESTION_KEYS };
