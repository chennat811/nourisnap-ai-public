# Supabase Custom SMTP Setup (Resend)

This guide explains how to configure a custom SMTP provider for Supabase Auth emails (password reset, signup confirmation), and how to keep those emails out of spam.

## Overview

By default, Supabase sends auth emails (password reset, signup confirmation) through its own built-in mailer, which is intentionally rate-limited to a handful of emails per hour per project — it's only meant for early development, not real usage. You'll see errors like:

```
AuthApiError: For security purposes, you can only request this after N seconds.
AuthApiError: email rate limit exceeded
```

Configuring a custom SMTP provider removes this artificial ceiling. This project uses **Resend**, sending from a dedicated subdomain (e.g. `mail.nourisnap.app`) rather than the bare apex domain, to isolate email sending reputation from the main domain.

**Important:** this project is a **hosted** Supabase project. SMTP settings must be configured in the **Supabase Dashboard** (Project Settings → Authentication → SMTP Settings) — the `[auth.email.smtp]` block in `supabase/config.toml` only affects the local CLI dev stack (`supabase start`), not the hosted project the app actually talks to.

## Setup Steps

### 1. Buy a Domain (if you don't already have one)

Recommended: [Cloudflare Registrar](https://domains.cloudflare.com) — sells at wholesale cost, and keeping DNS + registrar in one dashboard makes adding records in step 3 much simpler.

You don't need to point this domain at your main app/website — it only needs to exist so you can add DNS records for outbound email authentication. Use a dedicated subdomain (e.g. `mail.yourdomain.com`) for sending, to keep transactional-email reputation separate from your main domain.

### 2. Create a Resend Account

1. Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/month, 100/day).
2. Go to **Domains → Add Domain**.
3. Enter your sending subdomain (e.g. `mail.nourisnap.app`), not the bare apex domain.

### 3. Add DNS Records

Resend will show 3 records to add at your DNS host (Cloudflare, in the example above):

- **SPF** — TXT record authorizing Resend to send on your behalf.
- **DKIM** — TXT/CNAME record(s) that cryptographically sign outgoing mail.
- **DMARC** — TXT record telling receiving servers what to do with mail that fails SPF/DKIM.

Add each record exactly as Resend specifies (name, type, value). If using Cloudflare, set these records to **DNS only** — do not proxy them.

Back in Resend, click **Verify DNS Records** and wait for all three to show verified (usually a few minutes on Cloudflare, up to a few hours elsewhere).

### 4. Create a Resend API Key

**Resend → API Keys → Create API Key.** Copy it immediately — it's shown once and doubles as your SMTP password. Never commit it to this repo; it only ever gets pasted into the Supabase Dashboard's SMTP password field.

Resend's SMTP credentials:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `587` (STARTTLS) or `465` (SSL) |
| Username | `resend` |
| Password | *(your Resend API key)* |

### 5. Configure Supabase Dashboard SMTP

Supabase Dashboard → your project → **Project Settings → Authentication → SMTP Settings**:

1. Toggle **Enable Custom SMTP**.
2. Fill in:
   | Field | Value |
   |---|---|
   | Sender email | `no-reply@mail.yourdomain.com` |
   | Sender name | `NouriSnap` |
   | Host | `smtp.resend.com` |
   | Port | `587` |
   | Username | `resend` |
   | Password | *(Resend API key)* |
3. Save, then use the **Send test email** button to confirm delivery (check spam on the first send — see below).

### 6. Review Auth Rate Limits

Dashboard → **Authentication → Rate Limits**. Once custom SMTP is enabled, the low default cap is replaced by whatever's configured here — review/raise the emails-per-hour limit if it's still too restrictive for testing.

### 7. Customize the Email Templates

Supabase's default templates are extremely bare (see "Avoiding Spam Filtering" below for why that matters). Go to Dashboard → **Authentication → Email Templates → Reset Password** and replace the default with something branded. Example:

**Note on localization:** Supabase Dashboard templates are **one global template per project** — there's no per-user locale selection built in, and the app's language preference (`LanguageContext`) is stored only client-side in `AsyncStorage`, never synced to the server, so Supabase has no way to know which language a given recipient prefers when it sends the email. The template below is **bilingual** (English + Traditional Chinese stacked together, matching the pattern already used in `SignUpScreen.tsx`, e.g. "建立帳號 · REGISTER") so every user gets both languages regardless of their in-app setting. True per-user localization would require persisting language preference server-side and intercepting sends via a custom Auth Hook ("Send Email" hook) + your own Edge Function calling Resend's API directly — a larger backend feature, not implemented here.

**Subject:**
```
Reset your NouriSnap password · 重設您的密碼
```

**Body (HTML):**
```html
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
  <h2 style="color: #1F6252; margin-bottom: 4px;">NouriSnap</h2>
  <p style="font-size: 12px; color: #888; margin-top: 0;">拍食記 · Snap your meal, know your nutrition</p>

  <h3 style="margin-top: 32px;">Reset your password · 重設您的密碼</h3>
  <p>
    We received a request to reset the password for the NouriSnap account
    associated with <strong>{{ .Email }}</strong>. Click the button below to
    choose a new password:
    <br /><br />
    我們收到了重設此帳號（<strong>{{ .Email }}</strong>）密碼的請求。請點擊下方按鈕設定新密碼：
  </p>

  <p style="text-align: center; margin: 32px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="background-color: #1F6252; color: #ffffff; padding: 12px 28px;
              border-radius: 8px; text-decoration: none; font-weight: 600;
              display: inline-block;">
      Reset Password · 重設密碼
    </a>
  </p>

  <p style="font-size: 13px; color: #666;">
    This link will expire soon and can only be used once. If you didn't
    request a password reset, you can safely ignore this email — your
    password won't be changed.
    <br /><br />
    此連結將在短時間內失效，且僅能使用一次。若您並未提出此請求，可安全地忽略此郵件，您的密碼將不會被更改。
  </p>

  <p style="font-size: 13px; color: #666;">
    If the button above doesn't work, copy and paste this link into your
    browser:<br />
    <a href="{{ .ConfirmationURL }}" style="color: #1F6252; word-break: break-all;">{{ .ConfirmationURL }}</a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 16px;" />
  <p style="font-size: 11px; color: #999; text-align: center;">
    This email was sent by NouriSnap because a password reset was requested
    for this address. If you have questions, contact us at
    support@nourisnap.app.
    <br />
    此郵件由 NouriSnap 系統寄出，因為有人為此電子郵件地址申請重設密碼。如有疑問，請聯絡 support@nourisnap.app。
  </p>
</div>
```

Replace `support@nourisnap.app` with a real monitored inbox (or remove those lines) before using this in production. The same bilingual pattern (personalize with `{{ .Email }}`, explain why the recipient received it, include an "if you didn't request this" disclaimer, add a real footer, in both languages) should be applied to the other auth templates (Confirm Signup, Magic Link, etc.) for the same deliverability and localization reasons.

## Avoiding Spam Filtering

A brand-new sending domain has zero reputation, and password-reset emails are a classic phishing vector — so don't be surprised if your first test emails land in spam (e.g. Gmail's "This message might be dangerous" banner). This is expected and self-resolves over time, but there are concrete things you can do:

1. **Customize the email template** (see step 7 above). Supabase's default template ("Follow this link to reset the password for your user:") is extremely bare and itself resembles generic phishing templates to spam classifiers. This is the single highest-leverage fix available immediately.
2. **Verify SPF/DKIM/DMARC actually pass on the message itself**, not just that Resend shows the DNS records as verified. In Gmail: open the email → **⋮ → Show original** → confirm `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
3. **Keep DMARC at `p=none`** (monitor-only) while the domain is new. Don't jump to `p=reject` immediately.
4. **Register the domain with [Google Postmaster Tools](https://postmaster.google.com)** for visibility into Gmail-specific reputation data as sending volume grows.
5. **Avoid sending bursts** while the domain is new — steady, gradual volume builds reputation faster than sporadic spikes (relevant during heavy manual testing).
6. **Short-term workaround for your own testing:** mark the message "Not spam" / add the sender to contacts in your test inbox. This only affects your own account's filtering, not real users'.

## Troubleshooting

**Still hitting rate limit errors after enabling custom SMTP:**
- Confirm the SMTP toggle actually saved (re-open the settings page to check).
- Check Dashboard → Authentication → Rate Limits — a low limit may still be configured there independently of SMTP.

**Test email never arrives:**
- Check spam folder first.
- Re-verify DNS records in Resend — a record can silently fail to propagate.
- Check Resend's dashboard → Logs for the send attempt and any provider-side error.

**Email arrives but looks unbranded / like phishing:**
- Customize the template per "Avoiding Spam Filtering" step 1 above.
