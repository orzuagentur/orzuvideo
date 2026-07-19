import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrainingForm } from "@/components/TrainingForm";
import type { AiTraining } from "@/lib/types";

export default async function TrainingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: training } = await supabase
    .from("ai_training")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between rise">
        <div>
          <p
            className="font-[family-name:var(--font-syne)] text-2xl"
            style={{ fontWeight: 800 }}
          >
            OrzuVideo
          </p>
          <h1 className="mt-2 text-xl font-semibold">AI training</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Write once how your Shorts should sound and look. The engine follows
            this every day.
          </p>
        </div>
        <Link href="/dashboard" className="btn btn-ghost text-sm">
          Dashboard
        </Link>
      </header>

      <TrainingForm initial={(training as AiTraining) ?? null} />
    </main>
  );
}
