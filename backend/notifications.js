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
const cloudinary = require('cloudinary').v2; // already configured in server.js — same signed account used for backups/uploads
const { escapeHtml } = require('./pdf/helpers');

const FROM_ADDRESS = 'Alliance Flow <systemupdates@hkag.co>'; // no real inbox needed — Resend sends via the domain's verified DNS, not a Gmail mailbox

// Company logo. Gmail (and several other clients) strip inline base64
// "data:" image URIs from the message body — confirmed broken in testing,
// shows as an empty box — so instead of embedding the PNG straight into the
// HTML, it's uploaded once to Cloudinary (same account server.js already
// uses) and referenced by its hosted URL, which every client renders fine.
// Uploaded lazily on the first e-mail sent after each deploy/restart, then
// cached in memory for the rest of the process's life — see getLogoUrl().
const LOGO_BASE64 = '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';
const LOGO_DATA_URI = `data:image/png;base64,${LOGO_BASE64}`;

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

// The in-memory cache means this uploads at most once per running process
// (i.e. once per deploy/restart, on whichever e-mail happens to trigger it
// first) — every e-mail after that reuses the cached URL instead of
// re-uploading. Deliberately `overwrite: true` with a fixed public_id
// instead of trying to detect "already uploaded" server-side: simpler, and
// avoids relying on exactly how Cloudinary's overwrite:false behaves when
// the asset already exists (which is what silently broke this the first
// time — no error was thrown, but no URL came back either). Re-uploading a
// 9KB image once per restart costs nothing worth optimizing away. Returns
// null (never throws) on failure, so a Cloudinary hiccup degrades to
// "e-mail without a logo" instead of blocking the notification entirely.
let cachedLogoUrl = null;
async function getLogoUrl() {
  if (cachedLogoUrl) return cachedLogoUrl;
  try {
    const result = await cloudinary.uploader.upload(LOGO_DATA_URI, {
      public_id: 'exportflow/branding/hkag-logo-email',
      overwrite: true,
      resource_type: 'image',
    });
    cachedLogoUrl = result.secure_url;
  } catch (err) {
    console.error('Logo upload to Cloudinary failed:', err?.message || err);
  }
  return cachedLogoUrl;
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

  const logoUrl = await getLogoUrl();

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222;">
      ${bodyHtml}
      ${message ? `
      <p style="margin: 12px 0 4px; color:#666;">Message from ${escapeHtml(changedBy)}:</p>
      <p style="margin: 0 0 12px; padding: 10px 12px; background: #f5f5f5; border-radius: 6px; white-space: pre-wrap;">${escapeHtml(message)}</p>
      ` : ''}
      <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e5e5;">
        ${logoUrl ? `<img src="${logoUrl}" alt="HKAG — Hong Kong Alliance Global Trading Co. Ltd." width="180" style="display:block; width:180px; height:auto;" />` : ''}
        <p style="color:#999; font-size:12px; margin: 10px 0 0;">Alliance Flow — automatic notification, please do not reply to this e-mail.</p>
      </div>
    </div>
  `;
  const { error } = await getResend().emails.send({
    from: FROM_ADDRESS, to, subject, text, html,
    attachments: attachment ? [attachment] : undefined,
  });
  if (error) throw new Error(error.message || 'Resend API error');
}

module.exports = { sendStatusChangeEmail, fetchAttachment, entityLabel, isRestricted, ENTITY_LABELS };
