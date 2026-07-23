"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, VideoJob } from "@/lib/types";
import { YouTubeVideoCards } from "@/components/YouTubeVideoCards";
import { CardMenu, CardMenuSlot } from "@/components/CardMenu";
import {
  JOB_STATUS_LABEL,
  QUEUE_STATUSES,
  jobProgressPercent,
} from "@/lib/job-status";
import { useToast } from "@/components/ToastNotice";

type PubStep = "closed" | "root" | "ai" | "device" | "prompt";

function isYoutubeQueueJob(job: VideoJob) {
  const src = String(job.metadata?.source || "");
  const pipeline = String(job.metadata?.pipeline || "");
  if (src === "creativity" || pipeline === "creativity") return false;
  return QUEUE_STATUSES.has(job.status);
}

export function ChannelStudio({
  profile,
  videos,
  initialQueue = [],
  isTrained = false,
  aiContentEnabled = false,
  youtubeUnauthorized = false,
  needsAutoSync = false,
}: {
  profile: Profile | null;
  videos: VideoJob[];
  initialQueue?: VideoJob[];
  isTrained?: boolean;
  aiContentEnabled?: boolean;
  youtubeUnauthorized?: boolean;
  /** True when DB cache is older than 24h — one quiet YouTube sync on mount. */
  needsAutoSync?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { show: toast, notice } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(
    profile?.youtube_banner_url || null,
  );
  const [step, setStep] = useState<PubStep>("closed");
  const [prompt, setPrompt] = useState("");
  const [deviceTitle, setDeviceTitle] = useState("");
  const [queue, setQueue] = useState<VideoJob[]>(initialQueue);
  const [aiOn, setAiOn] = useState(aiContentEnabled);
  const [unauthorized, setUnauthorized] = useState(youtubeUnauthorized);
  const [channelStats, setChannelStats] = useState(() => ({
    subscribers: profile?.youtube_subscriber_count ?? 0,
    views: profile?.youtube_view_count ?? 0,
    videos: profile?.youtube_video_count ?? 0,
    likes:
      profile?.youtube_like_count ??
      videos.reduce((s, v) => s + Number(v.like_count || 0), 0),
    comments:
      profile?.youtube_comment_count ??
      videos.reduce((s, v) => s + Number(v.comment_count || 0), 0),
    title: profile?.youtube_channel_title || null,
    customUrl: profile?.youtube_custom_url || null,
    thumbnailUrl: profile?.youtube_thumbnail_url || null,
  }));
  const autoSyncDone = useRef(false);
  const pubMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQueue(initialQueue);
  }, [initialQueue]);

  useEffect(() => {
    setUnauthorized(youtubeUnauthorized);
  }, [youtubeUnauthorized]);

  useEffect(() => {
    setChannelStats({
      subscribers: profile?.youtube_subscriber_count ?? 0,
      views: profile?.youtube_view_count ?? 0,
      videos: profile?.youtube_video_count ?? 0,
      likes:
        profile?.youtube_like_count ??
        videos.reduce((s, v) => s + Number(v.like_count || 0), 0),
      comments:
        profile?.youtube_comment_count ??
        videos.reduce((s, v) => s + Number(v.comment_count || 0), 0),
      title: profile?.youtube_channel_title || null,
      customUrl: profile?.youtube_custom_url || null,
      thumbnailUrl: profile?.youtube_thumbnail_url || null,
    });
    if (profile?.youtube_banner_url) {
      setBannerUrl(profile.youtube_banner_url);
    }
  }, [profile, videos]);

  useEffect(() => {
    if (step !== "root") return;
    function onDoc(e: MouseEvent) {
      if (!pubMenuRef.current?.contains(e.target as Node)) {
        setStep("closed");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [step]);

  useEffect(() => {
    setAiOn(aiContentEnabled);
  }, [aiContentEnabled]);

  const activeJobs = useMemo(
    () => queue.filter((j) => isYoutubeQueueJob(j)),
    [queue],
  );

  const refreshQueue = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    let q = supabase
      .from("video_jobs")
      .select(
        "id,status,title,script_text,youtube_url,youtube_video_id,error_message,scheduled_for,created_at,completed_at,thumbnail_url,preview_url,duration_seconds,metadata",
      )
      .eq("user_id", user.id)
      .in("status", Array.from(QUEUE_STATUSES))
      .order("created_at", { ascending: false })
      .limit(20);
    if (profile?.youtube_channel_id) {
      q = q.eq("youtube_channel_id", profile.youtube_channel_id);
    }
    const { data } = await q;
    if (data) setQueue((data as VideoJob[]).filter(isYoutubeQueueJob));
  }, [profile?.youtube_channel_id]);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const t = window.setInterval(() => {
      void refreshQueue();
    }, 2500);
    return () => window.clearInterval(t);
  }, [activeJobs.length, refreshQueue]);

  async function toggleAiContent() {
    if (!aiOn && !isTrained) {
      router.push("/dashboard/channel/training?enableAi=1");
      return;
    }

    setBusy("ai_toggle");
    const next = !aiOn;
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      if (data.error === "complete_training" && data.redirect) {
        router.push(String(data.redirect));
        return;
      }
      toast(data.message || data.error || "Failed to toggle AI", "error");
      return;
    }
    setAiOn(next);
    toast(next ? "AI content enabled." : "AI content disabled.");
    router.refresh();
  }

  const applySyncPayload = useCallback(
    (data: {
      bannerUrl?: string | null;
      channel?: {
        title?: string | null;
        customUrl?: string | null;
        thumbnailUrl?: string | null;
        subscriberCount?: number;
        viewCount?: number;
        videoCount?: number;
        likeCount?: number;
        commentCount?: number;
      };
    }) => {
      if (data.bannerUrl) setBannerUrl(String(data.bannerUrl));
      const ch = data.channel;
      if (ch) {
        setChannelStats({
          subscribers: Number(ch.subscriberCount ?? 0),
          views: Number(ch.viewCount ?? 0),
          videos: Number(ch.videoCount ?? 0),
          likes: Number(ch.likeCount ?? 0),
          comments: Number(ch.commentCount ?? 0),
          title: ch.title ?? null,
          customUrl: ch.customUrl ?? null,
          thumbnailUrl: ch.thumbnailUrl ?? null,
        });
      }
    },
    [],
  );

  const runSync = useCallback(
    async (force: boolean, quiet = false) => {
      setBusy("sync");
      try {
        const res = await fetch("/api/youtube/stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = String(data.error || "Failed to refresh");
          if (
            /token|unauthorized|expired|not connected|refresh failed|session/i.test(
              msg,
            ) ||
            res.status === 401
          ) {
            setUnauthorized(true);
          }
          if (!quiet) toast(msg, "error");
          return;
        }

        setUnauthorized(false);
        applySyncPayload(data);

        if (!data.cached) {
          await refreshQueue();
          router.refresh();
        }

        if (!quiet) {
          if (data.cached) {
            toast("Showing cached channel data (updated within 24h).");
          } else {
            const imported = Number(data.imported || 0);
            const updated = Number(data.updated || 0);
            toast(
              imported > 0
                ? `Fetched ${imported} new videos from YouTube` +
                  (updated ? `, updated ${updated}.` : ".")
                : updated > 0
                  ? `Updated ${updated} videos.`
                  : "Channel data updated.",
            );
          }
        } else if (!data.cached) {
          toast("Channel stats refreshed.", "info");
        }
      } finally {
        setBusy(null);
      }
    },
    [applySyncPayload, refreshQueue, router, toast],
  );

  // Auto-sync once per visit only when DB cache is older than 24h
  useEffect(() => {
    if (!needsAutoSync || !profile?.youtube_connected || autoSyncDone.current) {
      return;
    }
    autoSyncDone.current = true;
    void runSync(false, true);
  }, [needsAutoSync, profile?.youtube_connected, runSync]);

  async function sync() {
    await runSync(true, false);
  }

  async function disconnect() {
    if (!confirm("Disconnect this YouTube channel?")) return;
    setBusy("disconnect");
    const res = await fetch("/api/youtube/disconnect", { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toast(data.error || "Failed to disconnect", "error");
      return;
    }
    toast("Channel disconnected.");
    router.refresh();
  }

  async function removeVideo(youtubeVideoId: string) {
    if (!confirm("Delete this video from YouTube?")) return;
    setBusy(youtubeVideoId);
    const res = await fetch("/api/youtube/videos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeVideoId }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toast(data.error || "Failed to delete", "error");
      return;
    }
    toast("Video deleted.");
    router.refresh();
  }

  async function startAiAuto() {
    if (!isTrained) {
      toast("Save AI Training for this channel first.", "error");
      return;
    }
    setBusy("ai_auto");
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "ai_auto",
        source: "youtube_ai",
        pipeline: "youtube",
        publish: true,
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toast(data.error || "Failed to start", "error");
      return;
    }
    setStep("closed");
    toast("AI is creating a video and will publish it to YouTube.", "info");
    await refreshQueue();
    router.refresh();
  }

  async function startAiPrompt() {
    const text = prompt.trim();
    if (text.length < 8) {
      toast("Write a prompt in at least one sentence.", "error");
      return;
    }
    if (!isTrained) {
      toast("Save AI Training for this channel first.", "error");
      return;
    }
    setBusy("ai_prompt");
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "ai_prompt",
        source: "youtube_prompt",
        pipeline: "youtube",
        publish: true,
        brief: text,
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toast(data.error || "Failed to start", "error");
      return;
    }
    setPrompt("");
    setStep("closed");
    toast("AI is creating a video from your prompt and will publish it to YouTube.", "info");
    await refreshQueue();
    router.refresh();
  }

  async function startDeviceUpload(file: File) {
    setBusy("device");
    const fd = new FormData();
    fd.set("file", file);
    if (deviceTitle.trim()) fd.set("title", deviceTitle.trim());
    const res = await fetch("/api/jobs/upload", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toast(data.error || "Failed to upload", "error");
      return;
    }
    setDeviceTitle("");
    setStep("closed");
    toast("Video uploaded - publishing to YouTube.", "info");
    await refreshQueue();
    router.refresh();
  }

  if (!profile?.youtube_connected) {
    return (
      <div className="panel rise space-y-4 p-6">
        <h1 className="text-xl font-semibold sm:text-2xl">Home</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Connect a YouTube channel to publish videos and see stats. Use the red
          YouTube button above to connect or switch channels.
        </p>
        <a href="/api/youtube/connect" className="btn btn-primary inline-flex">
          Connect YouTube
        </a>
      </div>
    );
  }

  return (
    <div className="relative space-y-6 pb-28">
      {notice}

      {/* Centered publication modals */}
      {step === "ai" && (
        <PubModal
          title="AI publish"
          subtitle="Create a video from Training or a prompt"
          onClose={() => setStep("closed")}
        >
          <div className="grid gap-2">
            <button
              type="button"
              disabled={busy === "ai_auto"}
              className="rounded-xl border border-[color:var(--line)] px-3.5 py-3 text-left transition hover:border-[color:rgba(232,165,75,0.45)] disabled:opacity-50"
              onClick={() => void startAiAuto()}
            >
              <p className="text-sm font-semibold">AI auto</p>
              <p className="mt-0.5 text-[11px] text-[color:var(--muted)]">
                Uses niche / style from AI Training and publishes right away
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--accent)" }}>
                {busy === "ai_auto" ? "Starting..." : "Create and publish"}
              </p>
            </button>
            <button
              type="button"
              className="rounded-xl border border-[color:var(--line)] px-3.5 py-3 text-left transition hover:border-[color:rgba(232,165,75,0.45)]"
              onClick={() => setStep("prompt")}
            >
              <p className="text-sm font-semibold">Prompt</p>
              <p className="mt-0.5 text-[11px] text-[color:var(--muted)]">
                You write the idea — AI makes a video and publishes
              </p>
            </button>
          </div>
        </PubModal>
      )}

      {step === "prompt" && (
        <PubModal
          title="Prompt"
          subtitle="Describe the video — AI will create and publish it"
          onClose={() => setStep("closed")}
          onBack={() => setStep("ai")}
        >
          <textarea
            className="field min-h-[110px] w-full text-sm"
            placeholder="Topic, hook, tone..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={busy === "ai_prompt"}
            autoFocus
          />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={busy === "ai_prompt" || prompt.trim().length < 8}
              onClick={() => void startAiPrompt()}
            >
              {busy === "ai_prompt" ? "Starting..." : "Create and publish"}
            </button>
          </div>
        </PubModal>
      )}

      {step === "device" && (
        <PubModal
          title="From device"
          subtitle="Upload an MP4 and publish to YouTube"
          onClose={() => setStep("closed")}
        >
          <input
            className="field w-full text-sm"
            placeholder="YouTube title (optional)"
            value={deviceTitle}
            onChange={(e) => setDeviceTitle(e.target.value)}
            disabled={busy === "device"}
          />
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void startDeviceUpload(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn-primary mt-3 w-full text-sm"
            disabled={busy === "device"}
            onClick={() => fileRef.current?.click()}
          >
            {busy === "device" ? "Uploading..." : "Choose video from device"}
          </button>
        </PubModal>
      )}

      <section className="panel rise relative">
        <CardMenuSlot>
          <div className="relative flex flex-col items-end gap-1.5">
            <div className="relative flex items-center gap-1.5">
              <div className="relative" ref={pubMenuRef}>
                <button
                  type="button"
                  title="Publications"
                  aria-label="Publications"
                  aria-expanded={step === "root"}
                  onClick={() =>
                    setStep((s) => (s === "closed" ? "root" : "closed"))
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur transition hover:bg-black/80"
                  style={{
                    boxShadow:
                      step !== "closed"
                        ? "0 0 0 2px rgba(232,165,75,0.55)"
                        : undefined,
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 3v12" />
                    <path d="m7 8 5-5 5 5" />
                    <path d="M5 21h14" />
                    <path d="M5 17h14" />
                  </svg>
                </button>

                {/* Compact chooser under the icon */}
                {step === "root" && (
                  <div
                    className="absolute right-0 top-10 z-30 w-56 overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-1.5 shadow-2xl"
                    role="menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5"
                      onClick={() => setStep("ai")}
                    >
                      <span className="text-sm font-semibold">AI publish</span>
                      <span className="text-[11px] text-[color:var(--muted)]">
                        Training niche or your prompt
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5"
                      onClick={() => setStep("device")}
                    >
                      <span className="text-sm font-semibold">From device</span>
                      <span className="text-[11px] text-[color:var(--muted)]">
                        Upload MP4 from phone or PC
                      </span>
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                title="Refresh"
                aria-label="Refresh"
                disabled={busy === "sync"}
                onClick={() => void sync()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur transition hover:bg-black/80 disabled:opacity-50"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className={busy === "sync" ? "animate-spin" : undefined}
                >
                  <path d="M21 12a9 9 0 1 1-2.6-6.4" />
                  <path d="M21 3v6h-6" />
                </svg>
              </button>
              <CardMenu
                items={[
                  { label: "+ YouTube channel", href: "/api/youtube/connect" },
                  {
                    label:
                      busy === "disconnect" ? "Disconnecting..." : "Disconnect",
                    danger: true,
                    disabled: busy === "disconnect",
                    onClick: () => void disconnect(),
                  },
                ]}
              />
            </div>
            {unauthorized && (
              <a
                href="/api/youtube/connect"
                className="inline-flex min-w-[9.5rem] items-center justify-center rounded-full px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
                style={{ background: "#FF0000" }}
              >
                Авторизоваться
              </a>
            )}
          </div>
        </CardMenuSlot>

        <div className="relative h-28 w-full overflow-hidden rounded-t-[inherit] bg-gradient-to-br from-[#1a1a1a] via-[#2a1810] to-[#0d0d0d] sm:h-36">
          {bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--bg-elevated)] via-transparent to-black/20" />
        </div>

        <div className="relative -mt-10 space-y-4 px-3 pb-4 sm:px-6 sm:pb-5">
          <div className="flex flex-wrap items-end gap-3 sm:gap-4">
            {channelStats.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={channelStats.thumbnailUrl}
                alt=""
                className="h-16 w-16 rounded-full border-4 border-[color:var(--bg-elevated)] object-cover sm:h-20 sm:w-20"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-[color:var(--bg-elevated)] bg-black/40 text-sm sm:h-20 sm:w-20">
                YT
              </div>
            )}
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold sm:text-xl">
                  {channelStats.title || "YouTube channel"}
                </h2>
                {unauthorized && (
                  <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-400">
                    Unauthorized
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-[color:var(--muted)]">
                {channelStats.customUrl || profile.youtube_channel_id}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center sm:max-w-2xl sm:grid-cols-5 sm:gap-3">
              <Stat label="Subscribers" value={channelStats.subscribers} />
              <Stat label="Views" value={channelStats.views} />
              <Stat label="Videos" value={channelStats.videos} />
              <Stat label="Likes" value={channelStats.likes} />
              <Stat label="Comments" value={channelStats.comments} />
            </div>

            {/* AI Training + AI content toggle */}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <a
                href="/dashboard/channel/training"
                className="rounded-xl border border-[color:var(--line)] bg-[color:var(--bg)]/80 px-3 py-2 text-sm font-semibold transition hover:border-[color:rgba(232,165,75,0.45)]"
              >
                AI Training
              </a>
              <div className="flex items-center gap-2.5 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg)]/80 px-2.5 py-2">
                <div className="min-w-0 text-right">
                  <p className="text-[11px] font-semibold leading-tight">AI content</p>
                  <p className="text-[9px] text-[color:var(--muted)]">
                    {aiOn ? "On schedule" : "Off"}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={aiOn}
                  disabled={busy === "ai_toggle"}
                  onClick={() => void toggleAiContent()}
                  className="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50"
                  style={{
                    background: aiOn
                      ? "rgba(232,165,75,0.95)"
                      : "rgba(255,255,255,0.12)",
                  }}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition"
                    style={{ left: aiOn ? "1.25rem" : "0.15rem" }}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Published videos</h3>
        <YouTubeVideoCards
          jobs={videos}
          onDelete={removeVideo}
          busyId={busy}
          emptyLabel="No published videos yet."
        />
      </section>

      {activeJobs.length > 0 && (
        <div className="pointer-events-none fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-40 flex w-[min(100%-1.5rem,300px)] flex-col gap-2 sm:right-4 lg:bottom-6 lg:right-6">
          {activeJobs.map((job) => {
            const pct = jobProgressPercent(job.status);
            return (
              <div
                key={job.id}
                className="pointer-events-auto rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]/95 p-3 shadow-xl backdrop-blur-md"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">YouTube video</p>
                    <p className="truncate text-[10px] text-[color:var(--muted)]">
                      {JOB_STATUS_LABEL[job.status] || job.status}
                      {job.title ? ` · ${job.title}` : ""}
                    </p>
                  </div>
                  <span
                    className="font-[family-name:var(--font-syne)] text-base tabular-nums"
                    style={{ color: "var(--accent)", fontWeight: 700 }}
                  >
                    {pct}%
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${pct}%`,
                      background:
                        "linear-gradient(90deg, var(--accent-dim), var(--accent))",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PubModal({
  title,
  subtitle,
  onClose,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pub-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-[340px] overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {onBack && (
              <button
                type="button"
                className="mb-1 text-[11px] text-[color:var(--muted)] transition hover:text-[color:var(--fg)]"
                onClick={onBack}
              >
                ← Back
              </button>
            )}
            <h2
              id="pub-modal-title"
              className="font-[family-name:var(--font-syne)] text-base leading-tight"
              style={{ fontWeight: 700 }}
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-[color:var(--muted)]">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--muted)] transition hover:bg-white/8 hover:text-[color:var(--fg)]"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const text =
    value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : value >= 1_000
        ? `${(value / 1_000).toFixed(1)}K`
        : String(value);
  return (
    <div className="rounded-xl border border-[color:var(--line)] px-1.5 py-2.5 sm:px-2 sm:py-3">
      <p className="text-base font-semibold tabular-nums sm:text-lg">{text}</p>
      <p className="truncate text-[10px] text-[color:var(--muted)] sm:text-[11px]">
        {label}
      </p>
    </div>
  );
}
