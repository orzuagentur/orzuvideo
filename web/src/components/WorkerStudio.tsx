"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FLOW_EDGES,
  FLOW_NODES,
  type FlowNodeDef,
  type NodeKind,
} from "@/lib/worker-flow";

type WorkerStatus = {
  checkedAt: string;
  worker: {
    online: boolean;
    source: string;
    lastSeenAt: string | null;
    hostname: string | null;
    hint: string;
  };
  profile: {
    youtubeConnected: boolean;
    channelTitle: string | null;
    dailyEnabled: boolean;
    videosPerDay: number;
  };
  training: {
    ready: boolean;
    niche: string | null;
    language: string | null;
    durationSeconds: number | null;
  };
  schedule: {
    enabled: boolean;
    mode: string;
    times: string[];
    timezone: string;
    videosPerDay: number;
  };
  pipeline24h: {
    queued: number;
    processing: number;
    ready: number;
    published: number;
    failed: number;
  };
  integrations: Array<{
    id: string;
    label: string;
    ok: boolean;
    scope: string;
    note?: string;
  }>;
};

const COL_W = 200;
const ROW_H = 130;
const NODE_W = 168;
const NODE_H = 72;
const PAD_X = 48;
const PAD_Y = 40;

function kindColor(kind: NodeKind): string {
  switch (kind) {
    case "trigger":
      return "#7eb6ff";
    case "queue":
      return "#e8a54b";
    case "worker":
      return "#5ecf8a";
    case "ai":
      return "#c4a0ff";
    case "media":
      return "#5ecfc4";
    case "edit":
      return "#e8a54b";
    case "output":
      return "#5ecf8a";
    case "account":
      return "#9a958c";
    default:
      return "var(--muted)";
  }
}

function nodeCenter(n: FlowNodeDef) {
  return {
    x: PAD_X + n.col * COL_W + NODE_W / 2,
    y: PAD_Y + n.row * ROW_H + NODE_H / 2,
  };
}

function statusForNode(
  node: FlowNodeDef,
  data: WorkerStatus | null,
): "ok" | "warn" | "off" | "unknown" {
  if (!data) return "unknown";
  if (node.id === "worker") return data.worker.online ? "ok" : "off";
  if (node.id === "training") return data.training.ready ? "ok" : "warn";
  if (node.id === "youtube_auth" || node.id === "youtube_upload") {
    return data.profile.youtubeConnected ? "ok" : "warn";
  }
  if (node.id === "schedule") return data.schedule.enabled ? "ok" : "warn";
  if (node.id === "supabase_queue") {
    const integ = data.integrations.find((i) => i.id === "supabase");
    return integ?.ok ? "ok" : "off";
  }
  if (node.integrationId) {
    const integ = data.integrations.find((i) => i.id === node.integrationId);
    if (!integ) return "unknown";
    return integ.ok ? "ok" : "warn";
  }
  if (node.id === "draft_ready") {
    return data.pipeline24h.ready > 0 ? "ok" : "unknown";
  }
  if (node.id === "content_plus" || node.id === "generate_now" || node.id === "preview") {
    return "ok";
  }
  return "unknown";
}

function statusDot(s: "ok" | "warn" | "off" | "unknown") {
  if (s === "ok") return "var(--success)";
  if (s === "warn") return "var(--accent)";
  if (s === "off") return "var(--danger)";
  return "var(--muted)";
}

export function WorkerStudio() {
  const [data, setData] = useState<WorkerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>("worker");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/worker/status");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load worker status");
        return;
      }
      setData(json);
    } catch {
      setError("Failed to load worker status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const byId = useMemo(() => {
    const m = new Map<string, FlowNodeDef>();
    FLOW_NODES.forEach((n) => m.set(n.id, n));
    return m;
  }, []);

  const selected = selectedId ? byId.get(selectedId) || null : null;
  const selectedStatus = selected ? statusForNode(selected, data) : "unknown";

  const maxCol = Math.max(...FLOW_NODES.map((n) => n.col));
  const maxRow = Math.max(...FLOW_NODES.map((n) => n.row));
  const svgW = PAD_X * 2 + (maxCol + 1) * COL_W;
  const svgH = PAD_Y * 2 + (maxRow + 1) * ROW_H;

  const integMap = useMemo(() => {
    const m = new Map<string, WorkerStatus["integrations"][0]>();
    (data?.integrations || []).forEach((i) => m.set(i.id, i));
    return m;
  }, [data]);

  return (
    <div className="space-y-5">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Worker</h1>
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--muted)]">
            Full system map — click any node for how it works, what is connected, and how
            data flows (n8n-style).
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </header>

      {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Worker"
          value={data?.worker.online ? "Online" : "Offline"}
          tone={data?.worker.online ? "var(--success)" : "var(--danger)"}
          sub={data?.worker.hint}
        />
        <StatCard
          label="Queue (24h)"
          value={String(data?.pipeline24h.queued ?? "—")}
          tone="var(--accent)"
          sub={`${data?.pipeline24h.processing ?? 0} processing · ${data?.pipeline24h.failed ?? 0} failed`}
        />
        <StatCard
          label="Schedule"
          value={data?.schedule.enabled ? "Enabled" : "Off"}
          tone={data?.schedule.enabled ? "var(--success)" : "var(--muted)"}
          sub={
            data?.schedule.times?.length
              ? `${data.schedule.mode} · ${data.schedule.times.join(", ")} (${data.schedule.timezone})`
              : "Set times in Schedule"
          }
        />
        <StatCard
          label="YouTube"
          value={data?.profile.youtubeConnected ? "Connected" : "Missing"}
          tone={data?.profile.youtubeConnected ? "var(--success)" : "var(--danger)"}
          sub={data?.profile.channelTitle || "Connect in Channel"}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="panel rise overflow-hidden">
          <div className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3">
            <p className="text-sm font-medium">Pipeline graph</p>
            <p className="text-xs text-[color:var(--muted)]">
              {data?.worker.lastSeenAt
                ? `Last seen ${new Date(data.worker.lastSeenAt).toLocaleString()}`
                : "No heartbeat yet"}
              {data?.worker.hostname ? ` · ${data.worker.hostname}` : ""}
            </p>
          </div>

          <div className="overflow-auto p-3">
            <div className="relative min-w-[720px]" style={{ width: svgW, height: svgH }}>
              <svg
                className="pointer-events-none absolute inset-0"
                width={svgW}
                height={svgH}
                aria-hidden
              >
                {FLOW_EDGES.map((e) => {
                  const a = byId.get(e.from);
                  const b = byId.get(e.to);
                  if (!a || !b) return null;
                  const p1 = nodeCenter(a);
                  const p2 = nodeCenter(b);
                  const midY = (p1.y + p2.y) / 2;
                  const d =
                    Math.abs(p1.y - p2.y) < 20
                      ? `M ${p1.x} ${p1.y} C ${p1.x} ${p1.y + 40}, ${p2.x} ${p2.y - 40}, ${p2.x} ${p2.y}`
                      : `M ${p1.x} ${p1.y} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y}`;
                  const active =
                    selectedId === e.from || selectedId === e.to;
                  return (
                    <g key={`${e.from}-${e.to}-${e.label || ""}`}>
                      <path
                        d={d}
                        fill="none"
                        stroke={active ? "rgba(232,165,75,0.85)" : "rgba(242,239,232,0.18)"}
                        strokeWidth={active ? 2.5 : 1.5}
                      />
                      {e.label && (
                        <text
                          x={(p1.x + p2.x) / 2}
                          y={(p1.y + p2.y) / 2 - 6}
                          textAnchor="middle"
                          fill="rgba(154,149,140,0.95)"
                          fontSize="10"
                        >
                          {e.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {FLOW_NODES.map((node) => {
                const st = statusForNode(node, data);
                const active = selectedId === node.id;
                const accent = kindColor(node.kind);
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedId(node.id)}
                    className="absolute text-left transition"
                    style={{
                      left: PAD_X + node.col * COL_W,
                      top: PAD_Y + node.row * ROW_H,
                      width: NODE_W,
                      height: NODE_H,
                      borderRadius: 14,
                      border: `1px solid ${active ? accent : "var(--line)"}`,
                      background: active
                        ? "rgba(232,165,75,0.1)"
                        : "rgba(12,13,16,0.92)",
                      boxShadow: active ? `0 0 0 1px ${accent}55` : "none",
                      padding: "10px 12px",
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{
                          background: statusDot(st),
                          boxShadow: st === "ok" ? `0 0 8px ${statusDot(st)}` : "none",
                        }}
                      />
                      <span
                        className="text-[10px] uppercase tracking-wide"
                        style={{ color: accent }}
                      >
                        {node.kind}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-sm font-semibold leading-tight">
                      {node.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[color:var(--muted)]">
                      {node.short}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="panel rise-delay flex max-h-[78vh] flex-col overflow-hidden xl:sticky xl:top-4">
          {!selected ? (
            <p className="p-5 text-sm text-[color:var(--muted)]">Select a node.</p>
          ) : (
            <>
              <div className="border-b border-[color:var(--line)] px-5 py-4">
                <p
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: kindColor(selected.kind) }}
                >
                  {selected.kind}
                </p>
                <h2 className="mt-1 text-lg font-semibold">{selected.title}</h2>
                <p className="mt-2 flex items-center gap-2 text-xs text-[color:var(--muted)]">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: statusDot(selectedStatus) }}
                  />
                  Status: {selectedStatus}
                  {selected.integrationId && integMap.get(selected.integrationId)
                    ? ` · ${integMap.get(selected.integrationId)!.ok ? "keys OK" : "check keys"}`
                    : ""}
                </p>
              </div>
              <div className="space-y-4 overflow-auto px-5 py-4 text-sm leading-relaxed">
                <Block title="How it works" body={selected.how} />
                <List title="Connections" items={selected.connects} />
                <List title="Requirements" items={selected.needs} />
                <List title="Tips" items={selected.tips} />
                {selected.integrationId && integMap.get(selected.integrationId)?.note && (
                  <Block
                    title="Note"
                    body={integMap.get(selected.integrationId)!.note!}
                  />
                )}
                {selected.id === "worker" && data && (
                  <Block
                    title="Live"
                    body={`${data.worker.online ? "Online" : "Offline"} via ${data.worker.source}. ${data.worker.hint}`}
                  />
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <section className="panel rise p-5">
        <h3 className="font-semibold">Integrations checklist</h3>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Platform keys live on Vercel; AI/media keys must also be in worker/.env on the
          machine that runs FFmpeg.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(data?.integrations || []).map((i) => (
            <li
              key={i.id}
              className="flex items-start gap-2 rounded-xl border border-[color:var(--line)] px-3 py-2.5"
            >
              <span
                className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: i.ok ? "var(--success)" : "var(--danger)" }}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">{i.label}</p>
                <p className="text-[11px] text-[color:var(--muted)]">
                  {i.scope}
                  {i.note ? ` · ${i.note}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel rise p-5">
        <h3 className="font-semibold">How to run the worker</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[color:var(--muted)]">
          <li>
            Open a terminal:{" "}
            <code className="text-[color:var(--fg)]">cd worker</code>
          </li>
          <li>
            Activate venv:{" "}
            <code className="text-[color:var(--fg)]">.\.venv\Scripts\Activate.ps1</code>
          </li>
          <li>
            Start: <code className="text-[color:var(--fg)]">python main.py</code>
          </li>
          <li>
            Leave it open. This page should flip Worker to{" "}
            <span style={{ color: "var(--success)" }}>Online</span> within ~15s (after
            migration 004).
          </li>
        </ol>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: string;
  sub?: string;
}) {
  return (
    <div className="panel rise p-4">
      <p className="text-xs uppercase tracking-wide text-[color:var(--muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold" style={{ color: tone }}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-[color:var(--muted)]">{sub}</p>}
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-[color:var(--muted)]">
        {title}
      </p>
      <p className="text-[color:var(--fg)]">{body}</p>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-[color:var(--muted)]">
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[color:var(--accent)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
