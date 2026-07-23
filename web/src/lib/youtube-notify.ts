import { createServiceClient } from "@/lib/supabase/middleware";
import { appUrl, sendTransactionalEmail } from "@/lib/email/send";
import {
  buildYoutubeChannelConnectedEmail,
  buildYoutubeChannelTransferredEmail,
} from "@/lib/email/templates";

/** Google account email for the OAuth token (channel owner / manager). */
export async function fetchGoogleAccountEmail(
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    const email = (data.email || "").trim().toLowerCase();
    return email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

async function orzuOwnerEmailsForChannel(
  channelId: string,
  excludeUserId?: string,
): Promise<string[]> {
  const sb = createServiceClient();
  let q = sb
    .from("youtube_channels")
    .select("user_id")
    .eq("channel_id", channelId);
  if (excludeUserId) q = q.neq("user_id", excludeUserId);
  const { data: rows } = await q;
  const userIds = [...new Set((rows || []).map((r) => r.user_id as string))];
  if (!userIds.length) return [];

  const { data: profiles } = await sb
    .from("profiles")
    .select("email")
    .in("id", userIds);

  return (profiles || [])
    .map((p) => String(p.email || "").trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

function uniqueEmails(list: Array<string | null | undefined>): string[] {
  return [...new Set(list.filter((e): e is string => Boolean(e && e.includes("@"))))];
}

/**
 * Notify channel owners that a YouTube channel was linked to OrzuAi.
 * Recipients: Google account email (even if not on OrzuAi) + any other OrzuAi owners.
 */
export async function notifyYoutubeChannelConnected(opts: {
  channelId: string;
  channelTitle: string;
  accessToken?: string | null;
  /** OrzuAi user who just connected — excluded from “other owner” emails for connected notice */
  connectedByUserId: string;
  connectedByEmail?: string | null;
}): Promise<void> {
  const googleEmail = opts.accessToken
    ? await fetchGoogleAccountEmail(opts.accessToken)
    : null;

  // Other OrzuAi accounts that still have / had this channel (before delete on transfer use before)
  const otherOwners = await orzuOwnerEmailsForChannel(
    opts.channelId,
    opts.connectedByUserId,
  );

  const recipients = uniqueEmails([googleEmail, ...otherOwners]);
  if (!recipients.length) return;

  const mail = buildYoutubeChannelConnectedEmail({
    channelTitle: opts.channelTitle,
    channelId: opts.channelId,
    connectedByEmail: opts.connectedByEmail || null,
    appUrl: appUrl(),
  });

  await Promise.all(
    recipients.map((to) =>
      sendTransactionalEmail({
        to,
        subject: mail.subject,
        html: mail.html,
      }),
    ),
  );
}

/** After transfer: tell the previous OrzuAi owner the channel left their account. */
export async function notifyYoutubeChannelTransferred(opts: {
  toEmails: string[];
  channelTitle: string;
  channelId: string;
}): Promise<void> {
  const recipients = uniqueEmails(opts.toEmails);
  if (!recipients.length) return;

  const mail = buildYoutubeChannelTransferredEmail({
    channelTitle: opts.channelTitle,
    channelId: opts.channelId,
    appUrl: appUrl(),
  });

  await Promise.all(
    recipients.map((to) =>
      sendTransactionalEmail({
        to,
        subject: mail.subject,
        html: mail.html,
      }),
    ),
  );
}

/** Raw emails of OrzuAi users who own this channel (for transfer notify). */
export async function listOrzuOwnerEmails(
  channelId: string,
  excludeUserId?: string,
): Promise<string[]> {
  return orzuOwnerEmailsForChannel(channelId, excludeUserId);
}
