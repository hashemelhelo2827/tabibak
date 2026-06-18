const dns = require('dns');
const net = require('net');

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function sendRawSmtp(host, port, from, to, data) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, host, () => {
      let buf = '';
      let step = 0;
      let timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('SMTP timeout'));
      }, 15000);

      function send(cmd) {
        if (cmd) socket.write(cmd + '\r\n');
      }

      socket.on('data', (chunk) => {
        buf += chunk.toString();
        const lines = buf.split('\r\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('220') || line.startsWith('250') || line.startsWith('354')) {
            timeout.refresh();
            switch (step) {
              case 0: send('HELO tabibak'); step++; break;
              case 1: send(`MAIL FROM:<${from}>`); step++; break;
              case 2: send(`RCPT TO:<${to}>`); step++; break;
              case 3: send('DATA'); step++; break;
              case 4: send(data + '\r\n.'); step++; break;
              case 5:
                clearTimeout(timeout);
                socket.end();
                resolve();
                break;
            }
          } else if (line.startsWith('5')) {
            clearTimeout(timeout);
            socket.destroy();
            reject(new Error('SMTP error: ' + line));
          } else if (line.startsWith('4')) {
            clearTimeout(timeout);
            socket.destroy();
            reject(new Error('SMTP temp error: ' + line));
          }
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });
}

function buildMime(fromName, fromAddr, to, subject, text, html) {
  const boundary = '----=_Part_' + Date.now();
  let msg = `From: "${fromName}" <${fromAddr}>\r\n`;
  msg += `To: ${to}\r\n`;
  msg += `Subject: ${subject}\r\n`;
  msg += `MIME-Version: 1.0\r\n`;
  msg += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
  msg += `\r\n--${boundary}\r\n`;
  msg += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n${text}\r\n`;
  msg += `\r\n--${boundary}\r\n`;
  msg += `Content-Type: text/html; charset="UTF-8"\r\n\r\n${html}\r\n`;
  msg += `\r\n--${boundary}--`;
  return msg;
}

async function sendVerificationCode(email, code) {
  const text = `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`;
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#2563eb;">Tabibak</h2>
    <p>Your verification code is:</p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:700;color:#2563eb;padding:16px;background:#f0f4ff;border-radius:8px;text-align:center">${code}</div>
    <p style="color:#666;font-size:14px;">This code expires in 10 minutes.</p>
    <hr style="border:none;border-top:1px solid #eee"/>
    <p style="color:#999;font-size:12px;">If you didn't request this, please ignore this email.</p>
  </div>`;

  const fromName = process.env.EMAIL_FROM_NAME || 'Tabibak';
  const fromAddr = process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || 'noreply@tabibak.app';
  const data = buildMime(fromName, fromAddr, email, 'Your Tabibak Verification Code', text, html);

  // Try sending via Gmail SMTP (port 465) if credentials configured
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (smtpUser && smtpPass) {
    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465, secure: true,
        auth: { user: smtpUser, pass: smtpPass },
        connectionTimeout: 10000,
      });
      await t.sendMail({ from: `"${fromName}" <${fromAddr}>`, to: email, subject: 'Your Tabibak Verification Code', text, html });
      return;
    } catch (e) {
      console.error('SMTP failed:', e.message);
    }
  }

  // Try direct MX delivery to gmail.com on port 25
  try {
    const mxs = await new Promise((res, rej) => dns.resolveMx('gmail.com', (e, r) => e ? rej(e) : res(r)));
    mxs.sort((a, b) => a.priority - b.priority);
    for (const mx of mxs) {
      try {
        await sendRawSmtp(mx.exchange, 25, fromAddr, email, data);
        console.log('Delivered via MX:', mx.exchange);
        return;
      } catch (e) {
        console.error('MX failed', mx.exchange, e.message);
      }
    }
  } catch (e) {
    console.error('MX resolution failed:', e.message);
  }

  // Last try: Gmail SMTP port 587
  if (smtpUser && smtpPass) {
    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 587, secure: false,
        requireTLS: true,
        auth: { user: smtpUser, pass: smtpPass },
        connectionTimeout: 10000,
      });
      await t.sendMail({ from: `"${fromName}" <${fromAddr}>`, to: email, subject: 'Your Tabibak Verification Code', text, html });
      return;
    } catch (e) {
      console.error('SMTP 587 failed:', e.message);
    }
  }

  throw new Error('All email methods failed. Please check Railway logs for the code.');
}

module.exports = { sendVerificationCode, generateCode };
