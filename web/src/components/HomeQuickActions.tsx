"use client";

import Link from "next/link";

type HomeQuickActionsProps = {
  youtubeConnected: boolean;
  isTrained: boolean;
  aiEnabled: boolean;
};

type ActionCard = {
  key: string;
  href: string;
  title: string;
  body: string;
  icon: "youtube" | "creators" | "clip" | "create" | "library";
};

function YouTubeMark() {
  return (
    <svg width="22" height="16" viewBox="0 0 28 20" aria-hidden>
      <path
        fill="#fff"
        d="M27.43 3.13A3.52 3.52 0 0 0 24.95.64C22.74 0 14 0 14 0S5.26 0 3.05.64A3.52 3.52 0 0 0 .57 3.13 36.8 36.8 0 0 0 0 10a36.8 36.8 0 0 0 .57 6.87 3.52 3.52 0 0 0 2.48 2.49C5.26 20 14 20 14 20s8.74 0 10.95-.64a3.52 3.52 0 0 0 2.48-2.49A36.8 36.8 0 0 0 28 10a36.8 36.8 0 0 0-.57-6.87Z"
      />
      <path fill="#FF0000" d="M11.2 14.29V5.71L18.4 10l-7.2 4.29Z" />
    </svg>
  );
}

function CardIcon({ name }: { name: ActionCard["icon"] }) {
  if (name === "youtube") {
    return (
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{ background: "#FF0000" }}
      >
        <YouTubeMark />
      </span>
    );
  }

  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line)] bg-white/5 text-[color:var(--accent)]">
      {name === "creators" && (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <circle cx="16.5" cy="9.5" r="2.4" />
          <path d="M3.5 19c.8-3.2 2.9-5 5.5-5s4.7 1.8 5.5 5" />
          <path d="M14 19c.4-1.8 1.6-3 3.2-3 1.4 0 2.5.8 3.1 2.2" />
        </svg>
      )}
      {name === "clip" && (
        <svg {...common}>
          <circle cx="7" cy="7" r="2.6" />
          <circle cx="7" cy="17" r="2.6" />
          <path d="M9.2 8.5 18 4M9.2 15.5 18 20M18 4v16" />
        </svg>
      )}
      {name === "create" && (
        <svg {...common}>
          <path d="M12 3.5 13.6 9H19l-4.3 3.2L16.3 18 12 14.9 7.7 18l1.6-5.8L5 9h5.4L12 3.5Z" />
        </svg>
      )}
      {name === "library" && (
        <svg {...common}>
          <path d="M5 4.5h10.5A1.5 1.5 0 0 1 17 6v13.2l-5.5-2.6L6 19.2V6A1.5 1.5 0 0 1 7.5 4.5" />
          <path d="M17 7.2h1.5A1.5 1.5 0 0 1 20 8.7v10.5" />
        </svg>
      )}
    </span>
  );
}

function youtubeCard(props: HomeQuickActionsProps): ActionCard {
  if (!props.youtubeConnected) {
    return {
      key: "youtube",
      href: "/dashboard/channel",
      title: "YouTube channel",
      body: "Connect your channel. Professional AI will study it and help you grow with Shorts, replies, and daily publishing.",
      icon: "youtube",
    };
  }
  if (!props.isTrained) {
    return {
      key: "youtube",
      href: "/dashboard/channel",
      title: "YouTube channel",
      body: "Set up your AI content so it can create videos every day and reply to comments for you.",
      icon: "youtube",
    };
  }
  return {
    key: "youtube",
    href: "/dashboard/channel",
    title: "YouTube channel",
    body: props.aiEnabled
      ? "Your AI assistant is ready — review results on your channel and keep publishing."
      : "AI is trained. Turn on AI content so it creates and replies for you every day.",
    icon: "youtube",
  };
}

/** Home shortcuts — phone + desktop. */
export function HomeQuickActions(props: HomeQuickActionsProps) {
  const cards: ActionCard[] = [
    youtubeCard(props),
    {
      key: "creators",
      href: "/dashboard/creators",
      title: "For creators",
      body: "Browse CC0 3D, HDRIs, and maps for your next edit.",
      icon: "creators",
    },
    {
      key: "clip",
      href: "/dashboard/clipping",
      title: "AI Clipping",
      body: "Turn long videos into vertical Shorts with AI.",
      icon: "clip",
    },
    {
      key: "create",
      href: "/dashboard/content",
      title: "AI Video",
      body: "Generate new videos from a prompt — ready to download or publish.",
      icon: "create",
    },
    {
      key: "library",
      href: "/dashboard/favorites",
      title: "Library",
      body: "Watch and download your clips, videos, and favorites.",
      icon: "library",
    },
  ];

  return (
    <section className="space-y-4">
      <div>
        <h1
          className="font-[family-name:var(--font-syne)] text-2xl tracking-tight sm:text-3xl"
          style={{ fontWeight: 800 }}
        >
          Home
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[color:var(--muted)] sm:text-base">
          Your AI studio for YouTube — connect a channel, create Shorts, clip
          long videos, and manage everything in one place.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="flex min-h-[9.5rem] flex-col gap-2.5 rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]/90 p-3.5 text-left transition hover:border-[color:rgba(232,165,75,0.4)] active:scale-[0.98] sm:min-h-[10.5rem] sm:p-4"
          >
            <CardIcon name={card.icon} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight sm:text-base">
                {card.title}
              </p>
              <p className="mt-1 line-clamp-4 text-[11px] leading-snug text-[color:var(--muted)] sm:text-xs">
                {card.body}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
