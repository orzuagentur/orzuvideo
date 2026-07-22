/** Unified OrzuAi transactional email shell + catalog. */

export type EmailTemplateId =
  | "welcome"
  | "login_otp"
  | "password_reset"
  | "password_reset_success"
  | "new_device_login";

export type EmailTemplateMeta = {
  id: EmailTemplateId;
  name: string;
  when: string;
  subject: string;
  previewBody: string;
};

export const EMAIL_TEMPLATES: EmailTemplateMeta[] = [
  {
    id: "welcome",
    name: "Welcome",
    when: "Sent once when a user successfully creates an account (first registration).",
    subject: "Welcome to OrzuAi",
    previewBody:
      "Thanks for joining OrzuAi. Train once — we create and publish Shorts for you every day.",
  },
  {
    id: "login_otp",
    name: "Login verification code",
    when: "Sent after a correct email/password login, before access to the platform.",
    subject: "Your OrzuAi login code",
    previewBody: "Your verification code is 123456. It expires in 10 minutes.",
  },
  {
    id: "password_reset",
    name: "Password reset link",
    when: "Sent when the user taps Forgot password on the login screen.",
    subject: "Reset your OrzuAi password",
    previewBody: "Use the button below to choose a new password. The link expires in 1 hour.",
  },
  {
    id: "password_reset_success",
    name: "Password changed",
    when: "Sent after a password reset is completed successfully.",
    subject: "Your OrzuAi password was updated",
    previewBody: "Your password was changed. If this wasn’t you, reset it again immediately.",
  },
  {
    id: "new_device_login",
    name: "New device login",
    when: "Sent when someone signs in from a device that hasn’t been seen before.",
    subject: "New sign-in to OrzuAi",
    previewBody:
      "A new device signed in: Chrome on Windows · Approximate location · IP.",
  },
];

export function getEmailTemplate(id: string): EmailTemplateMeta | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id);
}

type ShellOpts = {
  title: string;
  preheader?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
};

/** Single visual template for every OrzuAi transactional email. */
export function renderEmailShell(opts: ShellOpts): string {
  const preheader = opts.preheader || opts.title;
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<p style="margin:28px 0 8px;">
          <a href="${escapeHtml(opts.ctaUrl)}"
             style="display:inline-block;background:#e8a54b;color:#0c0c0c;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px;">
            ${escapeHtml(opts.ctaLabel)}
          </a>
        </p>`
      : "";
  const footer = opts.footerNote
    ? `<p style="margin:0;color:#9a958c;font-size:12px;line-height:1.5;">${escapeHtml(opts.footerNote)}</p>`
    : `<p style="margin:0;color:#9a958c;font-size:12px;line-height:1.5;">OrzuAi — AI YouTube Shorts</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#0c0c0c;color:#f2efe8;font-family:DM Sans,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0c0c0c;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#14161c;border:1px solid rgba(242,239,232,0.12);border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px;">
              <div style="font-family:Syne,Arial,sans-serif;font-weight:800;font-size:22px;letter-spacing:0.02em;color:#f2efe8;">OrzuAi</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;">
              <h1 style="margin:0 0 14px;font-family:Syne,Arial,sans-serif;font-size:22px;line-height:1.25;color:#f2efe8;">${escapeHtml(opts.title)}</h1>
              <div style="font-size:15px;line-height:1.6;color:#f2efe8;">${opts.bodyHtml}</div>
              ${cta}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px;border-top:1px solid rgba(242,239,232,0.1);">
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildWelcomeEmail(opts: { name?: string; appUrl: string }) {
  const name = opts.name?.trim() || "there";
  return {
    subject: "Welcome to OrzuAi",
    html: renderEmailShell({
      title: `Welcome, ${name}`,
      preheader: "Your OrzuAi account is ready.",
      bodyHtml: `<p style="margin:0 0 12px;color:#cfcabe;">Thanks for joining OrzuAi. Train once — we create and publish Shorts for you every day.</p>
        <p style="margin:0;color:#cfcabe;">Open your dashboard to connect YouTube and start training.</p>`,
      ctaLabel: "Open dashboard",
      ctaUrl: `${opts.appUrl.replace(/\/$/, "")}/dashboard`,
    }),
  };
}

export function buildLoginOtpEmail(opts: { code: string }) {
  const code = opts.code.replace(/\D/g, "").slice(0, 6);
  return {
    subject: "Your OrzuAi login code",
    html: renderEmailShell({
      title: "Confirm it’s you",
      preheader: `Your login code is ${code}`,
      bodyHtml: `<p style="margin:0 0 16px;color:#cfcabe;">Enter this code to finish signing in. It expires in 10 minutes.</p>
        <p style="margin:0;font-size:32px;letter-spacing:0.35em;font-weight:700;color:#e8a54b;">${escapeHtml(code)}</p>`,
      footerNote: "If you didn’t try to sign in, you can ignore this email.",
    }),
  };
}

export function buildPasswordResetEmail(opts: { resetUrl: string }) {
  return {
    subject: "Reset your OrzuAi password",
    html: renderEmailShell({
      title: "Reset your password",
      preheader: "Choose a new password for OrzuAi.",
      bodyHtml: `<p style="margin:0;color:#cfcabe;">We received a request to reset your password. The link expires in 1 hour.</p>`,
      ctaLabel: "Choose new password",
      ctaUrl: opts.resetUrl,
      footerNote: "If you didn’t ask for this, you can safely ignore this email.",
    }),
  };
}

export function buildPasswordResetSuccessEmail(opts: { appUrl: string }) {
  return {
    subject: "Your OrzuAi password was updated",
    html: renderEmailShell({
      title: "Password updated",
      preheader: "Your OrzuAi password was changed.",
      bodyHtml: `<p style="margin:0;color:#cfcabe;">Your password was changed successfully. You can now sign in with the new password.</p>`,
      ctaLabel: "Log in",
      ctaUrl: `${opts.appUrl.replace(/\/$/, "")}/login`,
      footerNote: "If this wasn’t you, reset your password again immediately.",
    }),
  };
}

export function buildNewDeviceEmail(opts: {
  action: string;
  deviceName: string;
  deviceType: string;
  location: string;
  appUrl: string;
}) {
  return {
    subject: "New sign-in to OrzuAi",
    html: renderEmailShell({
      title: "New device sign-in",
      preheader: `${opts.deviceName} signed in to OrzuAi`,
      bodyHtml: `<p style="margin:0 0 12px;color:#cfcabe;">Someone signed in to your account from a device we haven’t seen before.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;color:#cfcabe;">
          <tr><td style="padding:6px 0;width:120px;color:#9a958c;">Action</td><td style="padding:6px 0;color:#f2efe8;">${escapeHtml(opts.action)}</td></tr>
          <tr><td style="padding:6px 0;color:#9a958c;">Device</td><td style="padding:6px 0;color:#f2efe8;">${escapeHtml(opts.deviceName)}</td></tr>
          <tr><td style="padding:6px 0;color:#9a958c;">Type</td><td style="padding:6px 0;color:#f2efe8;">${escapeHtml(opts.deviceType)}</td></tr>
          <tr><td style="padding:6px 0;color:#9a958c;">Location</td><td style="padding:6px 0;color:#f2efe8;">${escapeHtml(opts.location)}</td></tr>
        </table>`,
      ctaLabel: "Open OrzuAi",
      ctaUrl: `${opts.appUrl.replace(/\/$/, "")}/dashboard`,
      footerNote: "If this wasn’t you, change your password right away.",
    }),
  };
}

/** Preview HTML for admin Email section. */
export function previewEmailHtml(id: EmailTemplateId, appUrl: string): string {
  switch (id) {
    case "welcome":
      return buildWelcomeEmail({ name: "Alex", appUrl }).html;
    case "login_otp":
      return buildLoginOtpEmail({ code: "123456" }).html;
    case "password_reset":
      return buildPasswordResetEmail({
        resetUrl: `${appUrl.replace(/\/$/, "")}/auth/reset-password?token=preview`,
      }).html;
    case "password_reset_success":
      return buildPasswordResetSuccessEmail({ appUrl }).html;
    case "new_device_login":
      return buildNewDeviceEmail({
        action: "Email & password login",
        deviceName: "Chrome on Windows",
        deviceType: "Desktop",
        location: "Berlin, Germany (approx.)",
        appUrl,
      }).html;
    default:
      return renderEmailShell({
        title: "OrzuAi",
        bodyHtml: "<p>Unknown template</p>",
      });
  }
}
