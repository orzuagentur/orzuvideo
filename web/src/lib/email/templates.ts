/** Unified OrzuAi transactional email shell + catalog. */

export const SUPPORT_EMAIL = "support@orzuai.com";
export const SUPPORT_CONTACT = `Support <${SUPPORT_EMAIL}>`;

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
    when: "Sent once after the first successful verification on a new account.",
    subject: "Welcome to OrzuAi",
    previewBody:
      "Your account is ready. Connect YouTube and start training.",
  },
  {
    id: "login_otp",
    name: "Verification code",
    when:
      "Sent when creating an account or logging in with email/password — before access to the platform.",
    subject: "Your OrzuAi verification code",
    previewBody: "Your verification code is 123456. It expires in 10 minutes.",
  },
  {
    id: "password_reset",
    name: "Password reset link",
    when: "Sent when the user requests a password reset from the login screen.",
    subject: "Reset your OrzuAi password",
    previewBody: "Secure link to set a new password. Expires in 1 hour.",
  },
  {
    id: "password_reset_success",
    name: "Password changed",
    when: "Sent after a password reset is completed successfully.",
    subject: "Your OrzuAi password was updated",
    previewBody: "Confirmation that the password change succeeded.",
  },
  {
    id: "new_device_login",
    name: "New device login",
    when:
      "Sent when someone signs in from a new device or a different IP. Not sent on the first login.",
    subject: "Security alert: new sign-in to OrzuAi",
    previewBody: "Device, IP, location, and time of the unexpected sign-in.",
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
  /** Extra security line above the shared contact footer */
  securityNote?: string;
};

function standardFooter(securityNote?: string): string {
  const security = securityNote
    ? `<p style="margin:0 0 10px;color:#9a958c;font-size:12px;line-height:1.5;">${escapeHtml(securityNote)}</p>`
    : "";
  return `${security}
    <p style="margin:0 0 6px;color:#9a958c;font-size:12px;line-height:1.5;">
      OrzuAi — AI YouTube Shorts
    </p>
    <p style="margin:0;color:#9a958c;font-size:12px;line-height:1.5;">
      Questions or this wasn’t you? Contact
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#e8a54b;text-decoration:none;">${SUPPORT_EMAIL}</a>
    </p>`;
}

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
              ${standardFooter(opts.securityNote)}
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
      title: `Welcome to OrzuAi, ${name}`,
      preheader: "Your account is ready.",
      bodyHtml: `<p style="margin:0 0 12px;color:#cfcabe;">Thank you for creating your OrzuAi account. You’re all set to train once and let us create and publish Shorts for you.</p>
        <p style="margin:0;color:#cfcabe;">Open your dashboard to connect YouTube and start training when you’re ready.</p>`,
      ctaLabel: "Open dashboard",
      ctaUrl: `${opts.appUrl.replace(/\/$/, "")}/dashboard`,
      securityNote: `Need help getting started? Write to us at ${SUPPORT_EMAIL}.`,
    }),
  };
}

export function buildLoginOtpEmail(opts: {
  code: string;
  purpose?: "login" | "signup";
}) {
  const code = opts.code.replace(/\D/g, "").slice(0, 6);
  const isSignup = opts.purpose === "signup";
  return {
    subject: isSignup
      ? "Verify your OrzuAi account"
      : "Your OrzuAi verification code",
    html: renderEmailShell({
      title: isSignup ? "Verify your new account" : "Verification code",
      preheader: `Your OrzuAi code is ${code}`,
      bodyHtml: `<p style="margin:0 0 12px;color:#cfcabe;">${
        isSignup
          ? "Enter this code on the verification screen to finish creating your OrzuAi account."
          : "Enter this code on the verification screen to finish signing in to OrzuAi."
      }</p>
        <p style="margin:0 0 16px;color:#cfcabe;">This code expires in <strong style="color:#f2efe8;">10 minutes</strong>.</p>
        <p style="margin:0;font-size:32px;letter-spacing:0.35em;font-weight:700;color:#e8a54b;">${escapeHtml(code)}</p>`,
      securityNote: `If you did not ${
        isSignup ? "create an OrzuAi account" : "try to sign in"
      }, do not share this code. Contact ${SUPPORT_EMAIL} immediately.`,
    }),
  };
}

export function buildPasswordResetEmail(opts: { resetUrl: string }) {
  return {
    subject: "Reset your OrzuAi password",
    html: renderEmailShell({
      title: "Password reset request",
      preheader: "Secure link to choose a new OrzuAi password.",
      bodyHtml: `<p style="margin:0 0 12px;color:#cfcabe;">We received a request to reset the password for your OrzuAi account.</p>
        <p style="margin:0;color:#cfcabe;">Click the button below to choose a new password. This link expires in <strong style="color:#f2efe8;">1 hour</strong> and can be used only once.</p>`,
      ctaLabel: "Choose a new password",
      ctaUrl: opts.resetUrl,
      securityNote: `If you did not request a password reset, you can ignore this email — your password will stay the same. For help, contact ${SUPPORT_EMAIL}.`,
    }),
  };
}

export function buildPasswordResetSuccessEmail(opts: { appUrl: string }) {
  return {
    subject: "Your OrzuAi password was updated",
    html: renderEmailShell({
      title: "Password updated successfully",
      preheader: "Your OrzuAi password has been changed.",
      bodyHtml: `<p style="margin:0 0 12px;color:#cfcabe;">Your OrzuAi password was changed successfully.</p>
        <p style="margin:0;color:#cfcabe;">You can now sign in with your new password. If you did not make this change, secure your account right away.</p>`,
      ctaLabel: "Go to log in",
      ctaUrl: `${opts.appUrl.replace(/\/$/, "")}/login`,
      securityNote: `If this wasn’t you, reset your password again and contact ${SUPPORT_EMAIL} immediately.`,
    }),
  };
}

export function buildNewDeviceEmail(opts: {
  action: string;
  deviceName: string;
  deviceType: string;
  ip: string;
  location: string;
  when: string;
  reason: string;
  appUrl: string;
}) {
  return {
    subject: "Security alert: new sign-in to OrzuAi",
    html: renderEmailShell({
      title: "New sign-in detected",
      preheader: `${opts.deviceName} · ${opts.ip}`,
      bodyHtml: `<p style="margin:0 0 12px;color:#cfcabe;">A sign-in to your OrzuAi account does not match a device or IP address we have on file.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;color:#cfcabe;">
          <tr><td style="padding:6px 0;width:130px;color:#9a958c;">Reason</td><td style="padding:6px 0;color:#f2efe8;">${escapeHtml(opts.reason)}</td></tr>
          <tr><td style="padding:6px 0;color:#9a958c;">Action</td><td style="padding:6px 0;color:#f2efe8;">${escapeHtml(opts.action)}</td></tr>
          <tr><td style="padding:6px 0;color:#9a958c;">Device</td><td style="padding:6px 0;color:#f2efe8;">${escapeHtml(opts.deviceName)}</td></tr>
          <tr><td style="padding:6px 0;color:#9a958c;">Type</td><td style="padding:6px 0;color:#f2efe8;">${escapeHtml(opts.deviceType)}</td></tr>
          <tr><td style="padding:6px 0;color:#9a958c;">IP address</td><td style="padding:6px 0;color:#f2efe8;">${escapeHtml(opts.ip)}</td></tr>
          <tr><td style="padding:6px 0;color:#9a958c;">Location</td><td style="padding:6px 0;color:#f2efe8;">${escapeHtml(opts.location)}</td></tr>
          <tr><td style="padding:6px 0;color:#9a958c;">When</td><td style="padding:6px 0;color:#f2efe8;">${escapeHtml(opts.when)}</td></tr>
        </table>
        <p style="margin:16px 0 0;color:#cfcabe;">If this was you, no action is needed. If it was not you, change your password and contact Support.</p>`,
      ctaLabel: "Open OrzuAi",
      ctaUrl: `${opts.appUrl.replace(/\/$/, "")}/dashboard`,
      securityNote: `Report suspicious activity to ${SUPPORT_EMAIL}.`,
    }),
  };
}

/** Preview HTML for admin Email section. */
export function previewEmailHtml(id: EmailTemplateId, appUrl: string): string {
  switch (id) {
    case "welcome":
      return buildWelcomeEmail({ name: "Alex", appUrl }).html;
    case "login_otp":
      return buildLoginOtpEmail({ code: "123456", purpose: "login" }).html;
    case "password_reset":
      return buildPasswordResetEmail({
        resetUrl: `${appUrl.replace(/\/$/, "")}/auth/reset-password?token=preview`,
      }).html;
    case "password_reset_success":
      return buildPasswordResetSuccessEmail({ appUrl }).html;
    case "new_device_login":
      return buildNewDeviceEmail({
        action: "Google sign-in",
        deviceName: "Chrome on Windows",
        deviceType: "Desktop",
        ip: "203.0.113.42",
        location: "Berlin, Germany (approx.)",
        when: "22 Jul 2026, 21:15 UTC",
        reason: "New device (not on your saved list)",
        appUrl,
      }).html;
    default:
      return renderEmailShell({
        title: "OrzuAi",
        bodyHtml: "<p>Unknown template</p>",
      });
  }
}
