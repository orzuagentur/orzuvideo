import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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

/** Cookie-aware Supabase client (user session from admin login). */
export async function createUserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;

  const cookieStore = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — middleware refreshes sessions.
        }
      },
    },
  });
}

export async function getAdminUser(): Promise<{
  id: string;
  email: string | null;
} | null> {
  try {
    const supabase = await createUserClient();
    if (!supabase) return null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Service role — authoritative is_admin (avoids RLS/column edge cases)
    const service = createServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("is_admin,email")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_admin) return null;

    return {
      id: user.id,
      email: profile.email || user.email || null,
    };
  } catch {
    return null;
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  return Boolean(await getAdminUser());
}

export async function requireAdminApi(): Promise<NextResponse | null> {
  if (await isAdminAuthenticated()) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Service-role client for admin APIs, scoped so auth.getUser() returns
 * the signed-in admin (for music/media library ownership).
 * Keep the real auth object — replacing it breaks getSession and other methods.
 */
export async function createClient() {
  const admin = await getAdminUser();
  const sb = createServiceClient();

  const getUser = async () => {
    if (!admin) {
      return { data: { user: null }, error: null };
    }
    return {
      data: {
        user: {
          id: admin.id,
          email: admin.email ?? undefined,
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: "",
        },
      },
      error: null,
    };
  };

  // Override only getUser; leave getSession / signOut / etc. intact.
  (sb.auth as { getUser: typeof getUser }).getUser = getUser;

  return sb;
}
