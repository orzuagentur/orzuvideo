"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clampMusicVolume,
  clampVoiceVolume,
  demoTextForGroup,
  type CustomMusicGroup,
  type LibraryGenre,
  type MusicPrefs,
  type MusicTrackRef,
  defaultMusicPrefs,
} from "@/lib/music-groups";
import { useToast } from "@/components/ToastNotice";

type Props = {
  value: MusicPrefs;
  onChange: (next: MusicPrefs) => void;
  /** Selected voice from AI Training */
  voiceId?: string;
  required?: boolean;
};

export function MusicTrainingStudio({
  value,
  onChange,
  voiceId = "",
  required = false,
}: Props) {
  const prefs = useMemo(() => ({ ...defaultMusicPrefs(), ...value }), [value]);
  const { show: toast, notice } = useToast();
  const [genres, setGenres] = useState<LibraryGenre[]>([]);
  const [tracks, setTracks] = useState<MusicTrackRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [genresLoading, setGenresLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [demoOn, setDemoOn] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceQ, setSourceQ] = useState("cinematic");
  const [sourceTracks, setSourceTracks] = useState<MusicTrackRef[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceUrlRef = useRef<string | null>(null);

  const activeCustom = prefs.custom_groups.find(
    (g) => g.id === prefs.active_group_id,
  );
  const isCustom = Boolean(activeCustom);

  const demoText = useMemo(
    () => demoTextForGroup(prefs.active_group_id || ""),
    [prefs.active_group_id],
  );

  const displayTracks = isCustom ? activeCustom?.tracks || [] : tracks;
  const musicVolume = clampMusicVolume(Number(prefs.volume ?? 0.58));
  const voiceVolume = clampVoiceVolume(Number(prefs.voice_volume ?? 1.05));

  const patch = useCallback(
    (partial: Partial<MusicPrefs>) => {
      onChange({ ...prefs, ...partial });
    },
    [onChange, prefs],
  );

  const loadGroup = useCallback(async (groupId: string) => {
    if (!groupId || groupId.startsWith("custom:")) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/music/group?group=${encodeURIComponent(groupId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load tracks");
      setTracks((data.tracks || []) as MusicTrackRef[]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load tracks", "error");
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    setGenresLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/music/genres");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setGenres([]);
          return;
        }
        const items = ((data.items || []) as Array<{
          id: string;
          name: string;
          slug: string;
          trackCount?: number;
        }>).map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          trackCount: g.trackCount,
        }));
        setGenres(items);
        if (!prefs.active_group_id && !prefs.custom_groups.length && items[0]) {
          onChange({
            ...prefs,
            active_group_id: items[0].slug,
            selected_track_ids: [],
          });
        }
      } finally {
        if (!cancelled) setGenresLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isCustom) {
      setTracks(activeCustom?.tracks || []);
      return;
    }
    if (prefs.active_group_id) {
      void loadGroup(prefs.active_group_id);
    } else {
      setTracks([]);
    }
  }, [prefs.active_group_id, isCustom, activeCustom, loadGroup]);

  function stopAll() {
    musicRef.current?.pause();
    musicRef.current = null;
    voiceAudioRef.current?.pause();
    voiceAudioRef.current = null;
    if (voiceUrlRef.current) {
      URL.revokeObjectURL(voiceUrlRef.current);
      voiceUrlRef.current = null;
    }
    setPlayingId(null);
    setDemoOn(false);
  }

  function playTrack(track: MusicTrackRef) {
    if (!track.previewUrl) return;
    if (playingId === track.id && !demoOn) {
      stopAll();
      return;
    }
    stopAll();
    const a = new Audio(track.previewUrl);
    a.volume = musicVolume;
    a.onended = () => setPlayingId(null);
    musicRef.current = a;
    void a.play().catch(() =>
      toast("Playback blocked - tap again", "error"),
    );
    setPlayingId(track.id);
  }

  async function playDemo() {
    if (!voiceId.trim()) {
      toast("Choose a voice in the Voice section first", "error");
      return;
    }

    const track =
      displayTracks.find((x) => prefs.selected_track_ids.includes(x.id)) ||
      displayTracks[0];
    if (!track?.previewUrl) {
      toast("Select a track in the group first", "error");
      return;
    }

    stopAll();
    setDemoOn(true);

    try {
      const res = await fetch("/api/elevenlabs/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId,
          groupId: prefs.active_group_id,
          text: demoText,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to create demo",
        );
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      voiceUrlRef.current = url;

      const music = new Audio(track.previewUrl);
      music.volume = musicVolume;
      music.loop = true;
      musicRef.current = music;
      setPlayingId(track.id);

      const voice = new Audio(url);
      voice.volume = Math.min(1, Math.max(0.4, voiceVolume / 1.4));
      voiceAudioRef.current = voice;

      voice.onended = () => {
        music.pause();
        stopAll();
      };

      await music.play();
      await voice.play();
    } catch (e) {
      stopAll();
      toast(e instanceof Error ? e.message : "Failed to create demo", "error");
    }
  }

  useEffect(() => {
    if (musicRef.current) {
      musicRef.current.volume = musicVolume;
    }
    if (voiceAudioRef.current) {
      voiceAudioRef.current.volume = Math.min(
        1,
        Math.max(0.4, voiceVolume / 1.4),
      );
    }
  }, [musicVolume, voiceVolume]);

  useEffect(() => {
    return () => {
      musicRef.current?.pause();
      musicRef.current = null;
      voiceAudioRef.current?.pause();
      voiceAudioRef.current = null;
      if (voiceUrlRef.current) {
        URL.revokeObjectURL(voiceUrlRef.current);
        voiceUrlRef.current = null;
      }
    };
  }, []);

  function toggleSelect(track: MusicTrackRef) {
    const set = new Set(prefs.selected_track_ids);
    if (set.has(track.id)) set.delete(track.id);
    else set.add(track.id);

    if (isCustom && activeCustom) {
      const nextGroups = prefs.custom_groups.map((g) => {
        if (g.id !== activeCustom.id) return g;
        const has = g.tracks.some((t) => t.id === track.id);
        const tracksNext = has
          ? g.tracks.filter((t) => t.id !== track.id)
          : [...g.tracks, track];
        return { ...g, tracks: tracksNext };
      });
      patch({
        selected_track_ids: Array.from(set),
        custom_groups: nextGroups,
      });
      return;
    }

    patch({ selected_track_ids: Array.from(set) });
  }

  async function searchSource() {
    setSourceLoading(true);
    try {
      const res = await fetch(
        `/api/music/group?q=${encodeURIComponent(sourceQ.trim() || "soundtrack")}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setSourceTracks((data.tracks || []) as MusicTrackRef[]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Search failed", "error");
    } finally {
      setSourceLoading(false);
    }
  }

  function createCustomGroup() {
    const name =
      newGroupName.trim() || `My group ${prefs.custom_groups.length + 1}`;
    const id = `custom:${crypto.randomUUID()}`;
    const group: CustomMusicGroup = { id, name, tracks: [] };
    patch({
      custom_groups: [...prefs.custom_groups, group],
      active_group_id: id,
      selected_track_ids: [],
    });
    setNewGroupName("");
    setSourceOpen(true);
  }

  function deleteCustomGroup(groupId: string) {
    if (!confirm("Delete this group?")) return;
    stopAll();
    const next = prefs.custom_groups.filter((g) => g.id !== groupId);
    const switchingAway = prefs.active_group_id === groupId;
    const fallback = genres[0]?.slug || "";
    patch({
      custom_groups: next,
      active_group_id: switchingAway ? fallback : prefs.active_group_id,
      selected_track_ids: switchingAway ? [] : prefs.selected_track_ids,
    });
  }

  function addFromSource(track: MusicTrackRef) {
    if (!activeCustom) return;
    const exists = activeCustom.tracks.some((t) => t.id === track.id);
    const tracksNext = exists
      ? activeCustom.tracks
      : [...activeCustom.tracks, track];
    const nextGroups = prefs.custom_groups.map((g) =>
      g.id === activeCustom.id ? { ...g, tracks: tracksNext } : g,
    );
    const selected = new Set(prefs.selected_track_ids);
    selected.add(track.id);
    patch({
      custom_groups: nextGroups,
      selected_track_ids: Array.from(selected),
    });
  }

  const selectedCount = prefs.selected_track_ids.length;

  return (
    <section className="panel rise relative space-y-4 p-5 sm:p-6">
      {notice}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">
            Background music
            {required ? (
              <span className="ml-1" style={{ color: "var(--accent)" }} aria-hidden>
                *
              </span>
            ) : null}
          </h2>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">
            Pick a genre from your music library and at least one track
          </p>
        </div>
        <div className="shrink-0 rounded-full border border-[color:var(--line)] px-3 py-1.5 text-right">
          <p className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
            Selected
          </p>
          <p
            className="font-[family-name:var(--font-syne)] text-base tabular-nums"
            style={{ color: "var(--accent)", fontWeight: 700 }}
          >
            {selectedCount}
          </p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {genresLoading && (
          <p className="text-xs text-[color:var(--muted)]">Loading genres…</p>
        )}
        {!genresLoading && genres.length === 0 && (
          <p className="text-xs text-[color:var(--muted)]">
            No library genres yet — upload music in the admin Music section.
          </p>
        )}
        {genres.map((g) => {
          const on = prefs.active_group_id === g.slug;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                stopAll();
                patch({
                  active_group_id: g.slug,
                  selected_track_ids: [],
                });
              }}
              className="shrink-0 rounded-xl border px-3 py-2 text-left transition"
              style={{
                borderColor: on ? "rgba(232,165,75,0.55)" : "var(--line)",
                background: on ? "rgba(232,165,75,0.12)" : "transparent",
              }}
            >
              <p className="text-xs font-semibold">{g.name}</p>
              <p className="text-[10px] text-[color:var(--muted)]">
                {typeof g.trackCount === "number"
                  ? `${g.trackCount} track${g.trackCount === 1 ? "" : "s"}`
                  : "Library"}
              </p>
            </button>
          );
        })}
        {prefs.custom_groups.map((g) => {
          const on = prefs.active_group_id === g.id;
          return (
            <div
              key={g.id}
              className="relative shrink-0 rounded-xl border px-3 py-2 pr-8 text-left transition"
              style={{
                borderColor: on ? "rgba(232,165,75,0.55)" : "var(--line)",
                background: on ? "rgba(232,165,75,0.12)" : "transparent",
              }}
            >
              <button
                type="button"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs text-[color:var(--muted)] transition hover:bg-red-500/20 hover:text-[color:var(--danger)]"
                title="Delete group"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteCustomGroup(g.id);
                }}
              >
                ×
              </button>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => {
                  stopAll();
                  patch({
                    active_group_id: g.id,
                    selected_track_ids: g.tracks.map((t) => t.id),
                  });
                }}
              >
                <p className="text-xs font-semibold">{g.name}</p>
                <p className="text-[10px] text-[color:var(--muted)]">
                  Custom · {g.tracks.length}
                </p>
              </button>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-[color:var(--muted)]">
            Music volume · {Math.round(musicVolume * 100)}%
          </span>
          <input
            type="range"
            min={15}
            max={100}
            value={Math.round(musicVolume * 100)}
            onChange={(e) =>
              patch({ volume: clampMusicVolume(Number(e.target.value) / 100) })
            }
            className="w-full accent-[color:var(--accent)]"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-[color:var(--muted)]">
            Voice volume · {Math.round(voiceVolume * 100)}%
          </span>
          <input
            type="range"
            min={50}
            max={140}
            value={Math.round(voiceVolume * 100)}
            onChange={(e) =>
              patch({
                voice_volume: clampVoiceVolume(Number(e.target.value) / 100),
              })
            }
            className="w-full accent-[color:var(--accent)]"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-primary text-sm"
          disabled={demoOn || !displayTracks[0]?.previewUrl}
          onClick={() => void playDemo()}
        >
          {demoOn ? "Demo..." : "Listen to demo"}
        </button>
        {demoOn && (
          <button type="button" className="btn btn-ghost text-sm" onClick={stopAll}>
            Stop
          </button>
        )}
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            className="field !py-2 text-sm sm:max-w-[180px]"
            placeholder="Custom group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary text-sm"
            onClick={createCustomGroup}
          >
            + Custom group
          </button>
          {isCustom && (
            <button
              type="button"
              className="btn btn-ghost text-sm"
              onClick={() => setSourceOpen((v) => !v)}
            >
              {sourceOpen ? "Hide" : "Add tracks"}
            </button>
          )}
        </div>
      </div>

      {sourceOpen && isCustom && (
        <div className="space-y-3 rounded-xl border border-[color:var(--line)] p-3">
          <div className="flex flex-wrap gap-2">
            <input
              className="field !py-2 flex-1 text-sm"
              value={sourceQ}
              onChange={(e) => setSourceQ(e.target.value)}
              placeholder="Search library tracks…"
            />
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={sourceLoading}
              onClick={() => void searchSource()}
            >
              {sourceLoading ? "…" : "Find"}
            </button>
          </div>
          <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {sourceTracks.map((t) => {
              const inGroup = activeCustom?.tracks.some((x) => x.id === t.id);
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-lg border border-[color:var(--line)] px-2 py-1.5"
                >
                  <button
                    type="button"
                    className="btn btn-ghost !px-2 !py-1 text-xs"
                    onClick={() => playTrack(t)}
                    disabled={!t.previewUrl}
                  >
                    {playingId === t.id ? "❚❚" : "▶"}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{t.name}</p>
                    <p className="truncate text-[10px] text-[color:var(--muted)]">
                      {t.artist}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
                    style={{
                      background: inGroup
                        ? "rgba(74,222,128,0.25)"
                        : "rgba(255,255,255,0.06)",
                      color: inGroup ? "var(--success)" : "var(--muted)",
                      border: `1px solid ${
                        inGroup ? "rgba(74,222,128,0.45)" : "var(--line)"
                      }`,
                    }}
                    title={inGroup ? "In group" : "Add to group"}
                    onClick={() => addFromSource(t)}
                  >
                    {inGroup ? "✓" : "+"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-1.5 sm:grid-cols-2">
        {loading && (
          <p className="text-sm text-[color:var(--muted)] sm:col-span-2">
            Loading tracks...
          </p>
        )}
        {!loading &&
          displayTracks.map((t) => {
            const selected = prefs.selected_track_ids.includes(t.id);
            return (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-xl border px-2.5 py-2 transition"
                style={{
                  borderColor: selected
                    ? "rgba(232,165,75,0.5)"
                    : "var(--line)",
                  background: selected
                    ? "rgba(232,165,75,0.08)"
                    : "transparent",
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost !px-2 !py-1 text-xs"
                  disabled={!t.previewUrl}
                  onClick={() => playTrack(t)}
                >
                  {playingId === t.id ? "❚❚" : "▶"}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="truncate text-[11px] text-[color:var(--muted)]">
                    {t.artist}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={selected ? "Deselect" : "Select"}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition"
                  style={{
                    background: selected
                      ? "rgba(74,222,128,0.28)"
                      : "rgba(255,255,255,0.06)",
                    color: selected ? "var(--success)" : "var(--muted)",
                    border: `1px solid ${
                      selected ? "rgba(74,222,128,0.5)" : "var(--line)"
                    }`,
                  }}
                  onClick={() => toggleSelect(t)}
                >
                  {selected ? "✓" : ""}
                </button>
              </div>
            );
          })}
      </div>
    </section>
  );
}
