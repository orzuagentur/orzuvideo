"use client";

/** Browser stub — admin has no Supabase Auth cookies; owner id comes from /api/auth/me. */
export function createClient() {
  return {
    auth: {
      async getUser() {
        try {
          const res = await fetch("/api/auth/me", { cache: "no-store" });
          const data = (await res.json().catch(() => ({}))) as {
            userId?: string;
          };
          if (!res.ok || !data.userId) {
            return { data: { user: null }, error: null };
          }
          return { data: { user: { id: data.userId } }, error: null };
        } catch {
          return { data: { user: null }, error: null };
        }
      },
    },
  };
}
