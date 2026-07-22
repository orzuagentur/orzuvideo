"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  checkExistingHashes,
  hashFile,
  uploadTrackToLibrary,
} from "@/lib/music-upload";

export type MusicUploadJob = {
  id: string;
  genreId: string;
  genreName: string;
  status: "running" | "done" | "error";
  /** Audio files found in the folder. */
  total: number;
  /** Files handled so far (hash or upload). */
  processed: number;
  /** 0–100 overall progress (hash + upload). */
  pct: number;
  uploaded: number;
  /** Same file appeared more than once inside the folder (kept 1). */
  folderDuplicates: number;
  /** Already in the user's library (any genre). */
  skipped: number;
  failed: number;
  error?: string;
};

type Ctx = {
  jobs: MusicUploadJob[];
  startUpload: (opts: {
    genreId: string;
    genreName: string;
    files: File[];
  }) => void;
  dismissJob: (id: string) => void;
};

const MusicUploadContext = createContext<Ctx | null>(null);

export function useMusicUpload() {
  const ctx = useContext(MusicUploadContext);
  if (!ctx) {
    throw new Error("useMusicUpload must be used within MusicUploadProvider");
  }
  return ctx;
}

type QueueItem = {
  id: string;
  genreId: string;
  genreName: string;
  files: File[];
};

export function MusicUploadProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<MusicUploadJob[]>([]);
  const runningRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);

  const patchJob = useCallback((id: string, patch: Partial<MusicUploadJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const runOne = useCallback(
    async (task: QueueItem) => {
      const { id, genreId, genreName, files } = task;
      const n = files.length;
      const toPct = (stepsDone: number) =>
        n > 0 ? Math.min(100, Math.round((stepsDone / (n * 2)) * 100)) : 100;

      try {
        const {
          data: { user },
        } = await createClient().auth.getUser();
        if (!user) throw new Error("Sign in required");

        const hashed: { file: File; hash: string }[] = [];
        let failed = 0;
        for (let i = 0; i < files.length; i++) {
          try {
            hashed.push({ file: files[i], hash: await hashFile(files[i]) });
          } catch {
            failed += 1;
          }
          patchJob(id, {
            processed: i + 1,
            pct: toPct(i + 1),
            failed,
          });
        }

        // Keep one copy per content hash inside this folder
        const uniqueByHash = new Map<string, File>();
        let folderDuplicates = 0;
        for (const { file, hash } of hashed) {
          if (uniqueByHash.has(hash)) {
            folderDuplicates += 1;
            continue;
          }
          uniqueByHash.set(hash, file);
        }
        const unique = [...uniqueByHash.entries()].map(([hash, file]) => ({
          hash,
          file,
        }));

        patchJob(id, { folderDuplicates });

        const existing = await checkExistingHashes(unique.map((h) => h.hash));
        let uploaded = 0;
        let skipped = 0;
        let uploadIndex = 0;
        const uploadTotal = unique.length || 1;

        for (const { file, hash } of unique) {
          uploadIndex += 1;
          if (existing.has(hash)) {
            skipped += 1;
            patchJob(id, {
              processed: uploadIndex,
              pct: toPct(n + Math.round((uploadIndex / uploadTotal) * n)),
              uploaded,
              skipped,
              folderDuplicates,
              failed,
            });
            continue;
          }
          try {
            const result = await uploadTrackToLibrary({
              file,
              userId: user.id,
              genreId,
              fileHash: hash,
            });
            if (result === "skipped") skipped += 1;
            else {
              uploaded += 1;
              existing.add(hash);
            }
          } catch (e) {
            console.error(e);
            failed += 1;
          }
          patchJob(id, {
            processed: uploadIndex,
            pct: toPct(n + Math.round((uploadIndex / uploadTotal) * n)),
            uploaded,
            skipped,
            folderDuplicates,
            failed,
          });
        }

        patchJob(id, {
          status: "done",
          processed: n,
          pct: 100,
          uploaded,
          skipped,
          folderDuplicates,
          failed,
        });
      } catch (e) {
        patchJob(id, {
          status: "error",
          error: e instanceof Error ? e.message : "Upload failed",
        });
      }
      window.dispatchEvent(
        new CustomEvent("orzu-music-library-changed", {
          detail: { genreId, genreName },
        }),
      );
    },
    [patchJob],
  );

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length) {
        const next = queueRef.current.shift()!;
        await runOne(next);
      }
    } finally {
      runningRef.current = false;
    }
  }, [runOne]);

  const startUpload = useCallback(
    (opts: { genreId: string; genreName: string; files: File[] }) => {
      const files = opts.files.filter(Boolean);
      if (!files.length) return;
      const id = crypto.randomUUID();
      setJobs((prev) =>
        [
          {
            id,
            genreId: opts.genreId,
            genreName: opts.genreName,
            status: "running" as const,
            total: files.length,
            processed: 0,
            pct: 0,
            uploaded: 0,
            folderDuplicates: 0,
            skipped: 0,
            failed: 0,
          },
          ...prev,
        ].slice(0, 8),
      );
      queueRef.current.push({
        id,
        genreId: opts.genreId,
        genreName: opts.genreName,
        files,
      });
      void pump();
    },
    [pump],
  );

  const dismissJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const value = useMemo(
    () => ({ jobs, startUpload, dismissJob }),
    [jobs, startUpload, dismissJob],
  );

  return (
    <MusicUploadContext.Provider value={value}>
      {children}
    </MusicUploadContext.Provider>
  );
}
