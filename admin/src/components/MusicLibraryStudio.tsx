"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/ToastNotice";
import { useMusicUpload } from "@/components/MusicUploadProvider";
import {
  collectAudioFilesFromList,
  collectAudioFromDataTransfer,
  formatBytes,
} from "@/lib/music-upload";

type Genre = {
  id: string;
  name: string;
  slug: string;
  trackCount: number;
  totalBytes: number;
};

type Track = {
  id: string;
  title: string;
  durationSec: number | null;
  fileSizeBytes: number;
  previewUrl: string | null;
};

type ModalMode =
  | null
  | { type: "create" }
  | { type: "add-music"; genre: Genre };

function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MusicLibraryStudio() {
  const { show: toast, notice } = useToast();
  const { startUpload } = useMusicUpload();
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalMode>(null);
  const [openGenre, setOpenGenre] = useState<Genre | null>(null);

  const loadGenres = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/music/genres");
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      toast(data.error || "Failed to load genres", "error");
      setGenres([]);
      return;
    }
    const items = ((data.items || []) as Genre[]).map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      trackCount: Number(g.trackCount || 0),
      totalBytes: Number(g.totalBytes || 0),
    }));
    setGenres(items);
    setOpenGenre((prev) => {
      if (!prev) return null;
      return items.find((g) => g.id === prev.id) || null;
    });
  }, [toast]);

  useEffect(() => {
    void loadGenres();
  }, [loadGenres]);

  useEffect(() => {
    function onChanged() {
      void loadGenres();
    }
    window.addEventListener("orzu-music-library-changed", onChanged);
    return () =>
      window.removeEventListener("orzu-music-library-changed", onChanged);
  }, [loadGenres]);

  async function deleteGenre(g: Genre) {
    if (
      !confirm(
        `Delete genre “${g.name}” and all its tracks from the library?`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/music/genres?id=${encodeURIComponent(g.id)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || "Delete failed", "error");
      return;
    }
    toast("Genre deleted", "ok");
    if (openGenre?.id === g.id) setOpenGenre(null);
    await loadGenres();
  }

  if (openGenre) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        {notice}
        <GenreDetail
          genre={openGenre}
          toast={toast}
          onBack={() => setOpenGenre(null)}
          onAddMusic={() => setModal({ type: "add-music", genre: openGenre })}
          onDeleteGenre={() => void deleteGenre(openGenre)}
          onChanged={() => void loadGenres()}
        />
        {modal && (
          <UploadModal
            mode={modal}
            onClose={() => setModal(null)}
            onCreated={async (genre) => {
              await loadGenres();
              return genre;
            }}
            onStart={(genreId, genreName, files) => {
              startUpload({ genreId, genreName, files });
              setModal(null);
              toast("Upload started — see progress bottom-right", "ok");
            }}
            toast={toast}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {notice}
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
            Music
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Platform library — used as background music for every video on
            OrzuAi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ type: "create" })}
          className="shrink-0 rounded-xl bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-black"
        >
          Add genre
        </button>
      </header>

      {loading ? (
        <p className="text-sm text-[color:var(--muted)]">Loading…</p>
      ) : genres.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--line)] px-6 py-16 text-center">
          <p className="text-sm text-[color:var(--muted)]">
            No genres yet. Click <strong>Add genre</strong> to create one and
            upload a music folder.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {genres.map((g) => (
            <article
              key={g.id}
              className="flex flex-col rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-4 transition hover:border-[color:rgba(232,165,75,0.45)]"
            >
              <button
                type="button"
                onClick={() => setOpenGenre(g)}
                className="flex flex-1 flex-col text-left"
              >
                <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold leading-tight">
                  {g.name}
                </h2>
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  {g.trackCount} track{g.trackCount === 1 ? "" : "s"}
                  {" · "}
                  {g.totalBytes > 0 ? formatBytes(g.totalBytes) : "—"}
                </p>
                <p className="mt-3 text-xs text-[color:var(--accent)]">
                  Open list →
                </p>
              </button>
              <div className="mt-3 flex items-center gap-2 border-t border-[color:var(--line)] pt-3">
                <button
                  type="button"
                  onClick={() => setModal({ type: "add-music", genre: g })}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[color:var(--line)] px-3 py-2 text-sm font-medium transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                >
                  <span aria-hidden>+</span> Music
                </button>
                <button
                  type="button"
                  title="Delete genre"
                  onClick={() => void deleteGenre(g)}
                  className="rounded-xl px-3 py-2 text-xs text-[color:var(--muted)] hover:text-[color:var(--danger)]"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {modal && (
        <UploadModal
          mode={modal}
          onClose={() => setModal(null)}
          onCreated={async (genre) => {
            await loadGenres();
            return genre;
          }}
          onStart={(genreId, genreName, files) => {
            startUpload({ genreId, genreName, files });
            setModal(null);
            toast("Upload started — see progress bottom-right", "ok");
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

function GenreDetail({
  genre,
  toast,
  onBack,
  onAddMusic,
  onDeleteGenre,
  onChanged,
}: {
  genre: Genre;
  toast: (msg: string, tone?: "ok" | "error" | "info") => void;
  onBack: () => void;
  onAddMusic: () => void;
  onDeleteGenre: () => void;
  onChanged: () => void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/music/tracks?genre_id=${encodeURIComponent(genre.id)}&pageSize=200`,
    );
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      toast(data.error || "Failed to load tracks", "error");
      setTracks([]);
      return;
    }
    setTracks(
      ((data.items || []) as Track[]).map((t) => ({
        id: t.id,
        title: t.title,
        durationSec: t.durationSec ?? null,
        fileSizeBytes: Number(t.fileSizeBytes || 0),
        previewUrl: t.previewUrl || null,
      })),
    );
    setTotal(Number(data.total || 0));
  }, [genre.id, toast]);

  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

  useEffect(() => {
    function onLib() {
      void loadTracks();
    }
    window.addEventListener("orzu-music-library-changed", onLib);
    return () =>
      window.removeEventListener("orzu-music-library-changed", onLib);
  }, [loadTracks]);

  async function deleteTrack(t: Track) {
    if (!confirm(`Remove “${t.title}” from this genre?`)) return;
    const res = await fetch(`/api/music/tracks?id=${encodeURIComponent(t.id)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || "Delete failed", "error");
      return;
    }
    toast("Track removed", "ok");
    await loadTracks();
    onChanged();
  }

  const listBytes = tracks.reduce((s, t) => s + (t.fileSizeBytes || 0), 0);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--fg)]"
          >
            ← All genres
          </button>
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
            {genre.name}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {total} track{total === 1 ? "" : "s"}
            {" · "}
            {listBytes > 0
              ? formatBytes(listBytes)
              : genre.totalBytes > 0
                ? formatBytes(genre.totalBytes)
                : "—"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onAddMusic}
            className="rounded-xl bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-black"
          >
            + Music
          </button>
          <button
            type="button"
            onClick={onDeleteGenre}
            className="rounded-xl border border-[color:var(--line)] px-3 py-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--danger)]"
          >
            Delete genre
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-[color:var(--muted)]">Loading tracks…</p>
      ) : tracks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--line)] px-6 py-12 text-center">
          <p className="text-sm text-[color:var(--muted)]">
            No tracks yet. Click <strong>+ Music</strong> and drop a folder.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--line)] overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)]">
          {tracks.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.title}</p>
                <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                  {formatDuration(t.durationSec)}
                  {" · "}
                  {t.fileSizeBytes > 0 ? formatBytes(t.fileSizeBytes) : "—"}
                </p>
              </div>
              {t.previewUrl ? (
                <audio
                  controls
                  preload="none"
                  src={t.previewUrl}
                  className="h-8 max-w-[140px] sm:max-w-[180px]"
                />
              ) : null}
              <button
                type="button"
                onClick={() => void deleteTrack(t)}
                className="shrink-0 text-xs text-[color:var(--muted)] hover:text-[color:var(--danger)]"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function UploadModal({
  mode,
  onClose,
  onCreated,
  onStart,
  toast,
}: {
  mode: Exclude<ModalMode, null>;
  onClose: () => void;
  onCreated: (g: Genre) => Promise<Genre | void>;
  onStart: (genreId: string, genreName: string, files: File[]) => void;
  toast: (msg: string, tone?: "ok" | "error" | "info") => void;
}) {
  const isCreate = mode.type === "create";
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pickFilesFromInput(list: FileList | null) {
    if (!list?.length) return;
    const audio = await collectAudioFilesFromList(list);
    setFiles(audio);
    if (!audio.length) toast("No audio files in that folder", "error");
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    try {
      const audio = await collectAudioFromDataTransfer(e.dataTransfer);
      setFiles(audio);
      if (!audio.length) toast("No audio files found", "error");
    } catch {
      toast("Could not read folder", "error");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isCreate && !name.trim()) {
      toast("Enter a genre name", "error");
      return;
    }
    if (!isCreate && !files.length) {
      toast("Add a music folder first", "error");
      return;
    }
    setBusy(true);
    try {
      if (isCreate) {
        const n = name.trim();
        const res = await fetch("/api/music/genres", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: n }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not create genre");
        const genre = data.item as Genre;
        await onCreated(genre);
        if (files.length) {
          onStart(genre.id, genre.name, files);
        } else {
          onClose();
          toast("Genre created", "ok");
        }
      } else {
        onStart(mode.genre.id, mode.genre.name, files);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <form
        onSubmit={(e) => void onSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-elevated)] p-5 shadow-2xl"
      >
        <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
          {isCreate ? "Add genre" : `Add music · ${mode.genre.name}`}
        </h2>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Only files inside the folder are uploaded. Folder name is not created
          in R2. Duplicates are skipped.
        </p>

        {isCreate && (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs text-[color:var(--muted)]">
              Genre name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Punk & alternative"
              autoFocus
              className="w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--bg)] px-3 py-2.5 text-sm outline-none focus:border-[color:rgba(232,165,75,0.55)]"
            />
          </label>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => void onDrop(e)}
          className="mt-4 rounded-xl border border-dashed px-4 py-8 text-center transition"
          style={{
            borderColor: dragOver ? "var(--accent)" : "var(--line)",
            background: dragOver ? "rgba(232,165,75,0.08)" : "var(--bg)",
          }}
        >
          <p className="text-sm">
            {files.length
              ? `${files.length} audio file${files.length === 1 ? "" : "s"} ready`
              : "Drop a music folder here"}
          </p>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            or choose a folder
          </p>
          <input
            ref={(el) => {
              if (el) {
                el.setAttribute("webkitdirectory", "");
                el.setAttribute("directory", "");
              }
            }}
            type="file"
            multiple
            className="mt-3 text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5"
            onChange={(e) => void pickFilesFromInput(e.target.files)}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--fg)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              busy ||
              (!isCreate && !files.length) ||
              (isCreate && !name.trim())
            }
            className="rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            {busy
              ? "Starting…"
              : isCreate && !files.length
                ? "Create"
                : "Upload"}
          </button>
        </div>
      </form>
    </div>
  );
}
