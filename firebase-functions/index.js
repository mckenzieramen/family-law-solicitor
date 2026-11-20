const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const resendApiKey = defineSecret('RESEND_API_KEY');
const receiptFrom = defineString('INQUIRY_RECEIPT_FROM');

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
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + resendApiKey.value(),
      'Content-Type': 'application/json',
      'Idempotency-Key': 'consultation-receipt/' + reference
    },
    body: JSON.stringify({
      from: receiptFrom.value(),
      to: [email],
      subject: 'We received your consultation inquiry',
      text: 'Thank you for submitting a consultation inquiry. Our team will review your request and contact you about next steps. If you requested a date and time, please wait for the team to confirm your appointment.'
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (response.ok) return;
  if ([408, 409, 429].includes(response.status) || response.status >= 500) {
    throw new Error('Receipt provider temporarily unavailable (' + response.status + ')');
  }
  logger.error('Receipt rejected by email provider', { reference, status: response.status });
});
