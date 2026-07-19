import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-16 pt-8">
      <header className="flex items-center justify-between rise">
        <p
          className="font-[family-name:var(--font-syne)] text-2xl font-800 tracking-tight"
          style={{ fontWeight: 800 }}
        >
          OrzuVideo
        </p>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn btn-ghost text-sm">
            Log in
          </Link>
          <Link href="/signup" className="btn btn-primary text-sm">
            Start free
          </Link>
        </div>
      </header>

      <section className="relative mt-20 flex flex-1 flex-col justify-center rise-delay">
        <div
          className="pointer-events-none absolute inset-x-0 -top-10 h-[55vh] rounded-[2rem] opacity-80"
          style={{
            background:
              "linear-gradient(160deg, rgba(232,165,75,0.18), transparent 45%), url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E\")",
          }}
        />
        <p
          className="relative font-[family-name:var(--font-syne)] text-5xl leading-[1.05] tracking-tight sm:text-7xl"
          style={{ fontWeight: 800 }}
        >
          OrzuVideo
        </p>
        <h1 className="relative mt-5 max-w-2xl text-2xl leading-snug text-[color:var(--fg)] sm:text-3xl">
          Train your AI once. Wake up to two Shorts already published.
        </h1>
        <p className="relative mt-4 max-w-xl text-base text-[color:var(--muted)] sm:text-lg">
          Script · voice · Pexels footage · karaoke captions · YouTube upload —
          on autopilot every day.
        </p>
        <div className="relative mt-10 flex flex-wrap gap-3">
          <Link href="/signup" className="btn btn-primary">
            Create account
          </Link>
          <Link href="/login" className="btn btn-ghost">
            I already have one
          </Link>
        </div>
      </section>
    </main>
  );
}
