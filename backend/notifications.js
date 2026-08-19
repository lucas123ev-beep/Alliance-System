// Sends "status changed" e-mail notifications. This is triggered manually
// by whoever changes a status (see the recipient-picker modal on the
// frontend) — deliberately NOT automatic. The team decided the person
// making the change should choose who actually needs to know, instead of
// everyone getting pinged on every small status edit across the whole
// system.
//
// Sent via Resend's API (not Gmail SMTP — Google Workspace admin policy on
// this account blocks enabling 2-Step Verification, which Gmail requires
// before it'll issue an App Password) using the RESEND_API_KEY env var on
// Render — never committed to the repo. "From" address is systemupdates@
// hkag.co, which needs that domain (hkag.co) verified in the Resend
// dashboard before it can send to anyone outside the account owner's own
// inbox — see the setup steps shared separately.
const { Resend } = require('resend');
const { escapeHtml } = require('./pdf/helpers');

const FROM_ADDRESS = 'Alliance Flow <systemupdates@hkag.co>'; // no real inbox needed — Resend sends via the domain's verified DNS, not a Gmail mailbox

// Which screen/table each entityType corresponds to, in Portuguese for the
// email itself. Also doubles as the whitelist of valid entityType values —
// anything not in this list is rejected by the route in server.js.
const ENTITY_LABELS = {
  orders: 'Pedido',
  quotations: 'Cotação',
  proformas: 'Proforma',
  'commercial-invoices': 'Fatura Comercial',
  contracts: 'Contrato',
  'packing-lists': 'Packing List',
  inspections: 'Inspeção',
  samples: 'Amostra',
  'financial-suppliers': 'Pagamento a Fornecedor',
  'financial-clients': 'Recebimento de Cliente',
};

// Client payment status on Commercial Invoices is the one case the team
// wants restricted — only people who already have access to that screen
// AND aren't on the hideCommercialStatus list can be picked as recipients
// or actually receive the e-mail, even if someone tried to force it via
// the API directly. Every other entity type has no restriction: any of
// the 9 accounts can be picked.
const RESTRICTED_ENTITY_TYPES = new Set(['commercial-invoices']);

let resendClient = null;
function getResend() {
  if (resendClient) return resendClient;
  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️  RESEND_API_KEY not set — status-change e-mails will fail to send.');
  }
  resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

function entityLabel(entityType) {
  return ENTITY_LABELS[entityType] || entityType;
}

function isRestricted(entityType) {
  return RESTRICTED_ENTITY_TYPES.has(entityType);
}

// `to` is a single address — the route in server.js calls this once per
// recipient rather than passing an array, so one bad/missing address for
// one person can't silently drop the e-mail to everyone else.
async function sendStatusChangeEmail({ to, entityType, recordLabel, oldStatus, newStatus, changedBy }) {
  const label = entityLabel(entityType);
  const subject = `[Alliance Flow] ${label} ${recordLabel} — status alterado`;
  const text = `${changedBy} alterou o status de ${label} ${recordLabel}.\n\n` +
    `De: ${oldStatus || '—'}\nPara: ${newStatus}\n\n` +
    `Acesse o sistema para mais detalhes.`;
  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222;">
      <p><strong>${escapeHtml(changedBy)}</strong> alterou o status de <strong>${escapeHtml(label)} ${escapeHtml(recordLabel)}</strong>:</p>
      <table style="border-collapse: collapse; margin: 12px 0;">
        <tr><td style="padding: 4px 12px 4px 0; color:#666;">De</td><td style="padding:4px 0;">${escapeHtml(oldStatus || '—')}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color:#666;">Para</td><td style="padding:4px 0;"><strong>${escapeHtml(newStatus)}</strong></td></tr>
      </table>
      <p style="color:#999; font-size:12px;">Alliance Flow — notificação automática, não responda este e-mail.</p>
    </div>
  `;
  const { error } = await getResend().emails.send({ from: FROM_ADDRESS, to, subject, text, html });
  if (error) throw new Error(error.message || 'Resend API error');
}

module.exports = { sendStatusChangeEmail, entityLabel, isRestricted, ENTITY_LABELS };
