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

// Which screen/table each entityType corresponds to, in English for the
// e-mail itself (the rest of the app's UI is en/zh, never Portuguese, so
// these match that instead of the team's own spoken language). Also doubles
// as the whitelist of valid entityType values — anything not in this list
// is rejected by the route in server.js.
const ENTITY_LABELS = {
  orders: 'Order',
  quotations: 'Quotation',
  proformas: 'Proforma',
  'commercial-invoices': 'Commercial Invoice',
  contracts: 'Contract',
  'packing-lists': 'Packing List',
  inspections: 'Inspection',
  samples: 'Sample',
  'financial-suppliers': 'Supplier Payment',
  'financial-clients': 'Client Payment',
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

// Downloads the attached file once (from its Cloudinary URL) so every
// recipient's e-mail can reuse the same in-memory copy instead of each one
// re-fetching it — called once per request in server.js, not per
// recipient. Returns null (never throws) on any failure, so a broken/slow
// attachment link degrades to "no attachment" instead of blocking the
// whole notification from sending.
async function fetchAttachment(url, filename) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    return { filename: filename || url.split('/').pop() || 'attachment', content: base64 };
  } catch (err) {
    console.error('Notification attachment download failed:', err.message);
    return null;
  }
}

// `to` is a single address — the route in server.js calls this once per
// recipient rather than passing an array, so one bad/missing address for
// one person can't silently drop the e-mail to everyone else. `attachment`
// (if any) should already be a resolved { filename, content: Buffer } —
// see fetchAttachment above, meant to be called once and reused across
// every recipient of the same notification.
//
// `eventType` distinguishes the three things this can notify about:
// 'status_change' (the original feature — From/To line), 'created' (a new
// record just got made — recordLabel can be a single number or a
// comma-joined list, for the batch-generate cases like Contracts/
// Inspections that can produce several records from one action), and
// 'document' (someone generated a PDF/Excel for a record and chose to send
// it by e-mail instead of/as well as downloading it — always carries an
// `attachment`, and `documentLabel` says which document, e.g. "PDF" or
// "Payment Notice (20% Deposit)").
async function sendStatusChangeEmail({ to, entityType, recordLabel, oldStatus, newStatus, changedBy, message, attachment, eventType = 'status_change', documentLabel }) {
  const label = entityLabel(entityType);
  const isCreated = eventType === 'created';
  const isDocument = eventType === 'document';

  const subject = isDocument
    ? `[Alliance Flow] ${documentLabel || 'Document'} — ${label} ${recordLabel}`
    : isCreated
    ? `[Alliance Flow] New ${label}: ${recordLabel}`
    : `[Alliance Flow] ${label} ${recordLabel} — status changed`;

  const text = (isDocument
    ? `${changedBy} sent the document "${documentLabel || 'Document'}" for ${label} ${recordLabel}. See the attachment.\n`
    : isCreated
    ? `${changedBy} created a new ${label}: ${recordLabel}.\n`
    : `${changedBy} changed the status of ${label} ${recordLabel}.\n\nFrom: ${oldStatus || '—'}\nTo: ${newStatus}\n`
  ) + (message ? `\nMessage from ${changedBy}:\n${message}\n` : '') + `\nOpen the system for more details.`;

  const bodyHtml = isDocument
    ? `<p><strong>${escapeHtml(changedBy)}</strong> sent the document <strong>${escapeHtml(documentLabel || 'Document')}</strong> for <strong>${escapeHtml(label)} ${escapeHtml(recordLabel)}</strong>. See the attachment.</p>`
    : isCreated
    ? `<p><strong>${escapeHtml(changedBy)}</strong> created a new <strong>${escapeHtml(label)}: ${escapeHtml(recordLabel)}</strong>.</p>`
    : `
      <p><strong>${escapeHtml(changedBy)}</strong> changed the status of <strong>${escapeHtml(label)} ${escapeHtml(recordLabel)}</strong>:</p>
      <table style="border-collapse: collapse; margin: 12px 0;">
        <tr><td style="padding: 4px 12px 4px 0; color:#666;">From</td><td style="padding:4px 0;">${escapeHtml(oldStatus || '—')}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color:#666;">To</td><td style="padding:4px 0;"><strong>${escapeHtml(newStatus)}</strong></td></tr>
      </table>
    `;

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222;">
      ${bodyHtml}
      ${message ? `
      <p style="margin: 12px 0 4px; color:#666;">Message from ${escapeHtml(changedBy)}:</p>
      <p style="margin: 0 0 12px; padding: 10px 12px; background: #f5f5f5; border-radius: 6px; white-space: pre-wrap;">${escapeHtml(message)}</p>
      ` : ''}
      <p style="color:#999; font-size:12px;">Alliance Flow — automatic notification, please do not reply to this e-mail.</p>
    </div>
  `;
  const { error } = await getResend().emails.send({
    from: FROM_ADDRESS, to, subject, text, html,
    attachments: attachment ? [attachment] : undefined,
  });
  if (error) throw new Error(error.message || 'Resend API error');
}

module.exports = { sendStatusChangeEmail, fetchAttachment, entityLabel, isRestricted, ENTITY_LABELS };
