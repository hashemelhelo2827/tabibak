const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  } else {
    console.warn('SMTP not configured — email sending will fail. Set SMTP_HOST, SMTP_USER, SMTP_PASS.');
    transporter = nodemailer.createTransport({
      host: 'localhost',
      port: 25,
      ignoreTLS: true,
    });
  }
  return transporter;
}

async function sendVerificationCode(email, code) {
  const t = getTransporter();
  const fromName = process.env.EMAIL_FROM_NAME || 'Tabibak';
  const fromAddr = process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || 'noreply@tabibak.app';

  await t.sendMail({
    from: `"${fromName}" <${fromAddr}>`,
    to: email,
    subject: 'Your Tabibak Verification Code',
    text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, please ignore this email.`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#2563eb;">Tabibak</h2>
      <p>Your verification code is:</p>
      <div style="font-size:32px;letter-spacing:8px;font-weight:700;color:#2563eb;padding:16px;background:#f0f4ff;border-radius:8px;text-align:center">${code}</div>
      <p style="color:#666;font-size:14px;">This code expires in 10 minutes.</p>
      <hr style="border:none;border-top:1px solid #eee"/>
      <p style="color:#999;font-size:12px;">If you didn't request this, please ignore this email.</p>
    </div>`,
  });
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { sendVerificationCode, generateCode };
