const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const resendApiKey = defineSecret('RESEND_API_KEY');
const receiptFrom = defineString('INQUIRY_RECEIPT_FROM');
const attorneyNotificationTo = defineString('ATTORNEY_NOTIFICATION_TO', {default: ''});
const inboxUrl = 'https://family-law-firm.pages.dev/admin/';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

async function sendEmail({to, subject, text, html, key}) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + resendApiKey.value(),
      'Content-Type': 'application/json',
      'Idempotency-Key': key
    },
    body: JSON.stringify({from: receiptFrom.value(), to, subject, text, html}),
    signal: AbortSignal.timeout(10000)
  });
  if (response.ok) return;
  if ([408, 409, 429].includes(response.status) || response.status >= 500) {
    throw new Error('Email provider temporarily unavailable (' + response.status + ')');
  }
  logger.error('Email rejected by provider', {status: response.status, key});
}

function bookingNotice(inquiry, reference) {
  const contact = inquiry.contact ?? {};
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Not provided';
  const topicNames = {
    separation: 'Divorce and separation',
    parenting: 'Parenting arrangements',
    property: 'Property and finances',
    consent: 'Consent orders'
  };
  const topic = topicNames[contact.topic] || 'Family law consultation';
  const requestedTime = contact.preferredTime || 'No preferred time selected';
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(contact.email);
  const safeTopic = escapeHtml(topic);
  const safeTime = escapeHtml(requestedTime);
  const safeReference = escapeHtml(reference);
  const html = '<!doctype html><html><body style="margin:0;background:#f4f1eb;padding:24px;font-family:Arial,sans-serif;color:#102a3a">' +
    '<main style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e6dfd3;border-radius:14px;overflow:hidden">' +
    '<header style="background:#102a3a;padding:22px 28px;color:#f7f4ee"><strong style="font:600 20px Georgia,serif">Prevail Family Law</strong><div style="margin-top:5px;color:#f3e6cc;font-size:13px">New consultation inquiry</div></header>' +
    '<section style="padding:26px 28px"><h1 style="margin:0 0 10px;font:500 25px Georgia,serif">A new inquiry has arrived</h1>' +
    '<p style="margin:0 0 20px;color:#536273;line-height:1.5">Review the request in the secure staff inbox. The client’s case summary is not included in this email.</p>' +
    '<table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:10px 0;border-bottom:1px solid #e6dfd3;color:#64717b">Client</td><td style="padding:10px 0;border-bottom:1px solid #e6dfd3;text-align:right;font-weight:700">' + safeName + '</td></tr>' +
    '<tr><td style="padding:10px 0;border-bottom:1px solid #e6dfd3;color:#64717b">Email</td><td style="padding:10px 0;border-bottom:1px solid #e6dfd3;text-align:right"><a style="color:#102a3a" href="mailto:' + safeEmail + '">' + safeEmail + '</a></td></tr>' +
    '<tr><td style="padding:10px 0;border-bottom:1px solid #e6dfd3;color:#64717b">Topic</td><td style="padding:10px 0;border-bottom:1px solid #e6dfd3;text-align:right;font-weight:700">' + safeTopic + '</td></tr>' +
    '<tr><td style="padding:10px 0;color:#64717b">Preferred time</td><td style="padding:10px 0;text-align:right;font-weight:700">' + safeTime + '</td></tr></table>' +
    '<p style="margin:18px 0 22px;color:#64717b;font-size:12px">Reference: ' + safeReference + '</p>' +
    '<a href="' + inboxUrl + '" style="display:inline-block;background:#102a3a;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:700">Open staff inbox</a>' +
    '</section></main></body></html>';
  const text = 'A new consultation inquiry has arrived.\nClient: ' + name + '\nEmail: ' + String(contact.email || '') +
    '\nTopic: ' + topic + '\nPreferred time: ' + requestedTime +
    '\nReference: ' + reference + '\nOpen the secure staff inbox: ' + inboxUrl +
    '\nThe case summary is not included in this email.';
  return {html, text};
}

exports.sendInquiryReceipt = onDocumentCreated({
  document: 'clientInbox/{messageId}',
  secrets: [resendApiKey],
  retry: true,
  maxInstances: 2
}, async event => {
  const inquiry = event.data?.data();
  if (inquiry?.kind !== 'consultation') return;
  const email = inquiry.contact?.email;
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email)) return;

  const reference = event.params.messageId;
  await sendEmail({
    to: [email],
    subject: 'We received your consultation inquiry',
    text: 'Thank you for submitting a consultation inquiry. Our team will review your request and contact you about next steps. If you requested a date and time, please wait for the team to confirm your appointment.',
    key: 'consultation-receipt/' + reference
  });

  const attorneyEmail = attorneyNotificationTo.value().trim();
  if (!attorneyEmail) {
    logger.warn('Attorney notification email is not configured', {reference});
    return;
  }
  if (!/^[^\\s@,<>]+@[^\\s@,<>]+\\.[^\\s@,<>]+$/.test(attorneyEmail)) {
    logger.error('Attorney notification email is invalid', {reference});
    return;
  }
  const notice = bookingNotice(inquiry, reference);
  await sendEmail({
    to: [attorneyEmail],
    subject: 'New consultation inquiry received',
    text: notice.text,
    html: notice.html,
    key: 'attorney-notification/' + reference
  });
});
