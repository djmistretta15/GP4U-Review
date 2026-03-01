/**
 * Email delivery — Resend
 *
 * All outbound emails go through this module.
 * Set RESEND_API_KEY to enable. Without it, emails are logged to console (dev mode).
 *
 * Docs: https://resend.com/docs
 */

const FROM_ADDRESS = process.env.GP4U_EMAIL_FROM ?? 'GP4U <no-reply@gp4u.com>'
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gp4u.com'

// ─── Internal send helper ─────────────────────────────────────────────────────

async function sendEmail(opts: {
  to:      string
  subject: string
  html:    string
  text:    string
}): Promise<void> {
  const api_key = process.env.RESEND_API_KEY

  if (!api_key) {
    // Dev fallback — log to console so devs can see the email content
    console.log('\n[email] Would send email:')
    console.log(`  To:      ${opts.to}`)
    console.log(`  Subject: ${opts.subject}`)
    console.log(`  Text:    ${opts.text.slice(0, 200)}`)
    console.log('')
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    FROM_ADDRESS,
      to:      [opts.to],
      subject: opts.subject,
      html:    opts.html,
      text:    opts.text,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend error ${res.status}: ${body}`)
  }
}

// ─── Email templates ──────────────────────────────────────────────────────────

export async function sendVerificationEmail(opts: {
  to:    string
  name:  string
  token: string
}): Promise<void> {
  const link = `${APP_URL}/api/auth/verify-email?token=${opts.token}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 40px 20px; margin: 0;">
  <div style="max-width: 480px; margin: 0 auto; background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; padding: 40px;">
    <div style="margin-bottom: 32px;">
      <span style="font-size: 13px; font-weight: 600; letter-spacing: 0.1em; color: #22c55e;">GP4U</span>
      <span style="font-size: 13px; color: #555; margin-left: 8px;">Trusted GPU Compute</span>
    </div>
    <h1 style="font-size: 22px; font-weight: 600; color: #f5f5f5; margin: 0 0 12px;">Verify your email</h1>
    <p style="font-size: 15px; color: #a3a3a3; line-height: 1.6; margin: 0 0 32px;">
      Hi ${escapeHtml(opts.name)}, click the button below to verify your email address and activate your GP4U account.
    </p>
    <a href="${link}" style="display: inline-block; background: #22c55e; color: #000; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none;">
      Verify email address
    </a>
    <p style="font-size: 12px; color: #555; margin: 32px 0 0; line-height: 1.6;">
      This link expires in 24 hours. If you didn't create a GP4U account, you can safely ignore this email.
    </p>
    <p style="font-size: 12px; color: #333; margin: 16px 0 0; word-break: break-all;">
      Or copy this link: ${link}
    </p>
  </div>
</body>
</html>
  `.trim()

  const text = `Hi ${opts.name},\n\nVerify your GP4U email by visiting:\n${link}\n\nThis link expires in 24 hours.\n\nIf you didn't create a GP4U account, ignore this email.`

  await sendEmail({ to: opts.to, subject: 'Verify your GP4U email', html, text })
}

export async function sendPasswordResetEmail(opts: {
  to:    string
  name:  string
  token: string
}): Promise<void> {
  const link = `${APP_URL}/reset-password?token=${opts.token}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 40px 20px; margin: 0;">
  <div style="max-width: 480px; margin: 0 auto; background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; padding: 40px;">
    <div style="margin-bottom: 32px;">
      <span style="font-size: 13px; font-weight: 600; letter-spacing: 0.1em; color: #22c55e;">GP4U</span>
    </div>
    <h1 style="font-size: 22px; font-weight: 600; color: #f5f5f5; margin: 0 0 12px;">Reset your password</h1>
    <p style="font-size: 15px; color: #a3a3a3; line-height: 1.6; margin: 0 0 32px;">
      Hi ${escapeHtml(opts.name)}, click the button below to reset your password. This link expires in 1 hour.
    </p>
    <a href="${link}" style="display: inline-block; background: #22c55e; color: #000; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none;">
      Reset password
    </a>
    <p style="font-size: 12px; color: #555; margin: 32px 0 0; line-height: 1.6;">
      If you didn't request a password reset, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim()

  const text = `Hi ${opts.name},\n\nReset your GP4U password:\n${link}\n\nThis link expires in 1 hour.\n\nIf you didn't request a reset, ignore this email.`

  await sendEmail({ to: opts.to, subject: 'Reset your GP4U password', html, text })
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}
