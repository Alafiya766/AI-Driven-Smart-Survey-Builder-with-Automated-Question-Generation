const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const APP_URL  = process.env.APP_URL  || 'http://localhost:5000';
const APP_NAME = 'QueryCraft';

/* ── Welcome email ─────────────────────────────────────────────── */
async function sendWelcomeEmail(user) {
  const roleLabel = user.role === 'creator' ? 'Creator' : 'Respondent';
  const roleDesc  = user.role === 'creator'
    ? 'You can build forms, use AI Assist to generate questions, assign respondents, and review submissions.'
    : 'You will receive questionnaires assigned to you. Complete and submit them directly from your dashboard.';

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#f8f9fa;padding:32px 16px">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
      <div style="background:#1a6fff;padding:28px 32px;text-align:center">
        <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px">
          <span style="background:#fff;color:#1a6fff;border-radius:6px;padding:2px 8px;margin-right:6px;font-size:18px">Q</span>
          Query<span style="color:#93c5fd">Craft</span>
        </div>
        <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px">Questionnaire Management Platform</p>
      </div>
      <div style="padding:32px">
        <h2 style="margin:0 0 8px;color:#1e293b;font-size:22px">Welcome to QueryCraft, ${user.name}! 🎉</h2>
        <p style="color:#475569;font-size:15px;line-height:1.6">
          Your account has been created successfully as a <strong>${roleLabel}</strong>.
        </p>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0;color:#1d4ed8;font-size:14px;line-height:1.6">
            <strong>What you can do:</strong><br/>${roleDesc}
          </p>
        </div>
        <div style="margin:20px 0">
          <p style="color:#64748b;font-size:14px;margin:0 0 4px"><strong>Your account details:</strong></p>
          <p style="color:#64748b;font-size:14px;margin:2px 0">📧 Email: <strong>${user.email}</strong></p>
          <p style="color:#64748b;font-size:14px;margin:2px 0">🏷️ Role: <strong>${roleLabel}</strong></p>
        </div>
        <a href="${APP_URL}/login" style="display:inline-block;background:#1a6fff;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;margin-top:8px">
          Sign In to QueryCraft →
        </a>
      </div>
      <div style="border-top:1px solid #f1f5f9;padding:16px 32px;text-align:center">
        <p style="color:#94a3b8;font-size:12px;margin:0">© ${new Date().getFullYear()} QueryCraft. All rights reserved.</p>
      </div>
    </div>
  </div>`;

  await transporter.sendMail({
    from:    `"${APP_NAME}" <${process.env.SMTP_USER}>`,
    to:      user.email,
    subject: `Welcome to QueryCraft — You're registered as a ${roleLabel}!`,
    html,
  });
}

/* ── Forgot-password / reset email ────────────────────────────── */
async function sendPasswordResetEmail(user, resetToken) {
  const link = `${APP_URL}/reset-password?token=${resetToken}`;

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#f8f9fa;padding:32px 16px">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
      <div style="background:#1a6fff;padding:28px 32px;text-align:center">
        <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px">
          <span style="background:#fff;color:#1a6fff;border-radius:6px;padding:2px 8px;margin-right:6px;font-size:18px">Q</span>
          Query<span style="color:#93c5fd">Craft</span>
        </div>
      </div>
      <div style="padding:32px">
        <h2 style="margin:0 0 8px;color:#1e293b;font-size:22px">Reset your password 🔒</h2>
        <p style="color:#475569;font-size:15px;line-height:1.6">
          Hi <strong>${user.name}</strong>, we received a request to reset your QueryCraft password.
          Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${link}" style="display:inline-block;background:#1a6fff;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;margin:16px 0">
          Reset Password →
        </a>
        <p style="color:#94a3b8;font-size:13px;margin-top:20px">
          If you didn't request this, you can safely ignore this email. Your password will not change.
        </p>
        <p style="color:#94a3b8;font-size:12px;word-break:break-all">
          Or copy this link: ${link}
        </p>
      </div>
      <div style="border-top:1px solid #f1f5f9;padding:16px 32px;text-align:center">
        <p style="color:#94a3b8;font-size:12px;margin:0">© ${new Date().getFullYear()} QueryCraft. All rights reserved.</p>
      </div>
    </div>
  </div>`;

  await transporter.sendMail({
    from:    `"${APP_NAME}" <${process.env.SMTP_USER}>`,
    to:      user.email,
    subject: 'Reset your QueryCraft password',
    html,
  });
}

module.exports = { sendWelcomeEmail, sendPasswordResetEmail };
