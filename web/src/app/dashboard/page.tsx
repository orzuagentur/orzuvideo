import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/components/DashboardClient";
import type { AiTraining, Profile, VideoJob } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: training }, { data: jobs }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("ai_training").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("video_jobs")
        .select(
          "id,status,title,script_text,youtube_url,error_message,scheduled_for,created_at,completed_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-8">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4 rise">
        <div>
          <p
            className="font-[family-name:var(--font-syne)] text-2xl"
            style={{ fontWeight: 800 }}
          >
            OrzuVideo
          </p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{user.email}</p>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/training" className="btn btn-ghost text-sm">
            AI training
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost text-sm">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <DashboardClient
        profile={(profile as Profile) ?? null}
        training={(training as AiTraining) ?? null}
        jobs={(jobs as VideoJob[]) ?? []}
      />
    </main>
  );
}
