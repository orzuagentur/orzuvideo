import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  getOwnerUserId,
  isAdminAuthenticated,
} from "@/lib/admin-auth";

/**
 * Server Supabase client for admin APIs.
 * Uses the service role (bypasses RLS) and exposes auth.getUser() as the
 * configured ADMIN_OWNER_USER_ID when the admin session cookie is valid.
 * Completely independent from the client app's cookie/auth stack.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service credentials are not configured");
  }

  const sb = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ok = await isAdminAuthenticated();
  let ownerId: string | null = null;
  if (ok) {
    try {
      ownerId = getOwnerUserId();
    } catch {
      ownerId = null;
    }
  }

  return Object.assign(sb, {
    auth: {
      getUser: async () => ({
        data: {
          user: ownerId ? ({ id: ownerId } as { id: string }) : null,
        },
        error: null,
      }),
    },
  });
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service credentials are not configured");
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
