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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase anon credentials are not configured");
  }

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
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin,email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) return null;

  return {
    id: user.id,
    email: profile.email || user.email || null,
  };
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
 */
export async function createClient() {
  const admin = await getAdminUser();
  const sb = createServiceClient();

  return Object.assign(sb, {
    auth: {
      getUser: async () => ({
        data: {
          user: admin ? ({ id: admin.id } as { id: string }) : null,
        },
        error: null,
      }),
    },
  });
}
