import { parseBlob } from "music-metadata";

export type ParsedTrackMeta = {
  title: string;
  durationSec: number | null;
};

const AUDIO_RE = /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i;

export function isAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  return AUDIO_RE.test(file.name);
}

function titleFromFilename(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/^\d+[\s.\-_]+/, "")
      .replace(/[_]+/g, " ")
      .replace(/\s*\(\d+\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200) || "Track"
  );
}

export async function parseAudioMeta(file: File): Promise<ParsedTrackMeta> {
  let title = titleFromFilename(file.name);
  let durationSec: number | null = null;

  try {
    const meta = await parseBlob(file);
    if (meta.common.title?.trim()) {
      title = meta.common.title.trim().slice(0, 200);
    }
    if (typeof meta.format.duration === "number" && meta.format.duration > 0) {
      durationSec = Math.round(meta.format.duration);
    }
  } catch {
    /* filename fallback */
  }

  if (durationSec == null) {
    durationSec = await probeDurationFallback(file);
  }

  return { title, durationSec };
}

function probeDurationFallback(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? Math.round(d) : null);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    audio.src = url;
  });
}

/** SHA-256 hex of file bytes — stable duplicate key. */
export async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkExistingHashes(
  hashes: string[],
): Promise<Set<string>> {
  if (!hashes.length) return new Set();
  const existing = new Set<string>();
  // chunk requests
  for (let i = 0; i < hashes.length; i += 200) {
    const chunk = hashes.slice(i, i + 200);
    const res = await fetch("/api/music/tracks/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes: chunk }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Hash check failed");
    for (const h of data.existing || []) {
      existing.add(String(h).toLowerCase());
    }
  }
  return existing;
}

/**
 * Collect only audio files from a FileList / drag folder.
 * Nested folders are flattened — R2 never mirrors OS folder tree.
 */
export async function collectAudioFilesFromList(
  list: FileList | File[],
): Promise<File[]> {
  const out: File[] = [];
  for (const f of Array.from(list)) {
    if (isAudioFile(f)) out.push(f);
  }
  return out;
}

/** Recursively read a dropped directory entry (Chrome/Edge). */
export async function collectAudioFromDataTransfer(
  dt: DataTransfer,
): Promise<File[]> {
  const items = dt.items;
  if (!items?.length) {
    return collectAudioFilesFromList(dt.files);
  }

  const files: File[] = [];

  async function walkEntry(entry: FileSystemEntry | null): Promise<void> {
    if (!entry) return;
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });
      if (isAudioFile(file)) files.push(file);
      return;
    }
    if (entry.isDirectory) {
      const dir = entry as FileSystemDirectoryEntry;
      const reader = dir.createReader();
      const readBatch = (): Promise<FileSystemEntry[]> =>
        new Promise((resolve, reject) => {
          reader.readEntries(resolve, reject);
        });
      let batch = await readBatch();
      while (batch.length) {
        for (const child of batch) {
          await walkEntry(child);
        }
        batch = await readBatch();
      }
    }
  }

  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.() || null;
    if (entry) entries.push(entry);
  }

  if (!entries.length) {
    return collectAudioFilesFromList(dt.files);
  }

  for (const e of entries) {
    await walkEntry(e);
  }
  return files;
}

export type UploadOneResult = "uploaded" | "skipped" | "failed";

export async function uploadTrackToLibrary(opts: {
  file: File;
  userId: string;
  genreId: string;
  fileHash: string;
}): Promise<UploadOneResult> {
  if (opts.file.size > 50 * 1024 * 1024) {
    throw new Error(`${opts.file.name}: max 50 MB`);
  }

  const meta = await parseAudioMeta(opts.file);
  const title = meta.title.slice(0, 200);
  const safeName = opts.file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  // Flat key under genre — no nested user folder names in R2
  const key = `${opts.userId}/music/${opts.genreId}/${crypto.randomUUID()}-${safeName}`;
  const contentType = opts.file.type || "audio/mpeg";

  const presignRes = await fetch("/api/storage/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key,
      contentType,
      contentLength: opts.file.size,
    }),
  });
  const presign = await presignRes.json().catch(() => ({}));
  if (!presignRes.ok) {
    throw new Error(presign.error || `Presign failed (${opts.file.name})`);
  }

  const put = await fetch(presign.uploadUrl as string, {
    method: "PUT",
    body: opts.file,
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) {
    throw new Error(`R2 upload failed (${opts.file.name}, ${put.status})`);
  }

  const reg = await fetch("/api/music/tracks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      artist: "",
      mood: "",
      genre_id: opts.genreId,
      duration_sec: meta.durationSec,
      storage_path: key,
      public_url: presign.publicUrl,
      file_hash: opts.fileHash,
      file_size_bytes: opts.file.size,
    }),
  });
  const regData = await reg.json().catch(() => ({}));
  if (reg.status === 409 || regData.duplicate) {
    return "skipped";
  }
  if (!reg.ok) {
    throw new Error(regData.error || `Register failed (${opts.file.name})`);
  }
  return "uploaded";
}

export function formatBytes(n: number): string {
  if (!n || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
