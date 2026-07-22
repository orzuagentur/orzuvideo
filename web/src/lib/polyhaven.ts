/** Poly Haven public API helpers (https://api.polyhaven.com). */

export const POLYHAVEN_API = "https://api.polyhaven.com";
export const POLYHAVEN_CDN = "https://cdn.polyhaven.com";
export const POLYHAVEN_SITE = "https://polyhaven.com";

/** Required when calling the live API — identify the product. */
export const POLYHAVEN_UA =
  "OrzuAi/1.0 (+https://orzuai.com; Poly Haven asset browser)";

export type PolyHavenType = "all" | "hdris" | "textures" | "models";

export type PolyHavenAssetMeta = {
  id: string;
  name: string;
  type: PolyHavenType;
  typeCode: number;
  categories: string[];
  tags: string[];
  authors: string[];
  description: string;
  datePublished: number | null;
  downloadCount: number;
  polycount: number | null;
  thumbUrl: string;
  primaryUrl: string;
  pageUrl: string;
};

export type PolyPreviewSide = {
  id: string;
  label: string;
  url: string;
};

export type PolyPackage = {
  id: string;
  label: string;
  format: string;
  resolution: string;
  /** Main file + includes — zip as one download. */
  files: Array<{ path: string; url: string; size: number }>;
  totalSize: number;
};

const TYPE_CODE: Record<number, Exclude<PolyHavenType, "all">> = {
  0: "hdris",
  1: "textures",
  2: "models",
};

export function typeFromCode(code: unknown): Exclude<PolyHavenType, "all"> {
  const n = Number(code);
  return TYPE_CODE[n] || "models";
}

export function thumbUrl(id: string, size = 512): string {
  return `${POLYHAVEN_CDN}/asset_img/thumbs/${encodeURIComponent(id)}.png?width=${size}&height=${size}`;
}

export function primaryUrl(id: string, width = 1280): string {
  return `${POLYHAVEN_CDN}/asset_img/primary/${encodeURIComponent(id)}.png?width=${width}`;
}

export function assetPageUrl(id: string): string {
  return `${POLYHAVEN_SITE}/a/${encodeURIComponent(id)}`;
}

type AssetsCache = {
  at: number;
  byType: Record<string, Record<string, unknown>>;
};

declare global {
  // eslint-disable-next-line no-var
  var __orzuPolyHavenAssets: AssetsCache | undefined;
}

const ASSETS_TTL_MS = 60 * 60 * 1000;

/** Cached Poly Haven /assets list (shared by API routes). */
export async function fetchPolyHavenAssets(
  type: Exclude<PolyHavenType, "all"> | "all",
): Promise<Record<string, unknown>> {
  const cache = globalThis.__orzuPolyHavenAssets || { at: 0, byType: {} };
  globalThis.__orzuPolyHavenAssets = cache;

  const hit = cache.byType[type];
  if (hit && Date.now() - cache.at < ASSETS_TTL_MS) return hit;

  const url =
    type === "all"
      ? `${POLYHAVEN_API}/assets`
      : `${POLYHAVEN_API}/assets?t=${encodeURIComponent(type)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": POLYHAVEN_UA,
      Accept: "application/json",
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Poly Haven assets ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  cache.at = Date.now();
  cache.byType[type] = data;
  return data;
}

export function formatBytes(n: number): string {
  if (!n || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type FileLeaf = {
  url?: string;
  size?: number;
  md5?: string;
  include?: Record<string, { url?: string; size?: number }>;
};

export function parseAssetEntry(
  id: string,
  raw: Record<string, unknown>,
): PolyHavenAssetMeta {
  const authorsObj = (raw.authors || {}) as Record<string, string>;
  const typeCode = Number(raw.type);
  const type = typeFromCode(typeCode);
  return {
    id,
    name: String(raw.name || id),
    type,
    typeCode,
    categories: Array.isArray(raw.categories)
      ? raw.categories.map(String)
      : [],
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    authors: Object.keys(authorsObj),
    description: String(raw.description || ""),
    datePublished:
      raw.date_published != null ? Number(raw.date_published) : null,
    downloadCount: Number(raw.download_count || 0),
    polycount:
      raw.polycount != null && Number.isFinite(Number(raw.polycount))
        ? Number(raw.polycount)
        : null,
    thumbUrl: String(raw.thumbnail_url || thumbUrl(id)),
    primaryUrl: primaryUrl(id),
    pageUrl: assetPageUrl(id),
  };
}

/** Preview sides / poses from CDN + map previews in the files payload. */
export function buildPreviewSides(
  asset: PolyHavenAssetMeta,
  files: Record<string, unknown>,
): PolyPreviewSide[] {
  const sides: PolyPreviewSide[] = [
    { id: "primary", label: "Main", url: asset.primaryUrl },
    { id: "thumb", label: "Thumb", url: asset.thumbUrl },
  ];

  const tone = files.tonemapped as FileLeaf | undefined;
  if (tone?.url) {
    sides.push({ id: "tonemap", label: "Tonemap", url: String(tone.url) });
  }

  for (const [group, label] of [
    ["Diffuse", "Diffuse"],
    ["nor_gl", "Normal"],
    ["Rough", "Rough"],
    ["AO", "AO"],
    ["arm", "ARM"],
    ["Displacement", "Height"],
  ] as const) {
    const block = files[group] as
      | Record<string, Record<string, FileLeaf>>
      | undefined;
    if (!block) continue;
    const res = block["1k"] || block["2k"] || Object.values(block)[0];
    if (!res) continue;
    const leaf = res.jpg || res.png || Object.values(res)[0];
    if (leaf?.url) {
      sides.push({ id: group, label, url: String(leaf.url) });
    }
  }

  // unique by url
  const seen = new Set<string>();
  return sides.filter((s) => {
    if (!s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

/**
 * Whole-asset packages (gltf/fbx/blend/hdri) with includes —
 * intended for a single ZIP download.
 */
export function listPackages(
  files: Record<string, unknown>,
  assetType: Exclude<PolyHavenType, "all">,
): PolyPackage[] {
  const out: PolyPackage[] = [];

  function addPackage(
    group: string,
    resolution: string,
    format: string,
    leaf: FileLeaf | null | undefined,
  ) {
    if (!leaf?.url) return;
    const filesList: PolyPackage["files"] = [
      {
        path: `${group}.${format}`,
        url: String(leaf.url),
        size: Number(leaf.size || 0),
      },
    ];
    if (leaf.include && typeof leaf.include === "object") {
      for (const [path, inc] of Object.entries(leaf.include)) {
        if (!inc?.url) continue;
        filesList.push({
          path,
          url: String(inc.url),
          size: Number(inc.size || 0),
        });
      }
    }
    const totalSize = filesList.reduce((s, f) => s + f.size, 0);
    out.push({
      id: `${group}:${resolution}:${format}`,
      label: `${group.toUpperCase()} · ${resolution}`,
      format,
      resolution,
      files: filesList,
      totalSize,
    });
  }

  if (assetType === "hdris") {
    const hdri = files.hdri as Record<string, Record<string, FileLeaf>> | undefined;
    if (hdri) {
      for (const res of ["1k", "2k", "4k", "8k", "16k"]) {
        const formats = hdri[res];
        if (!formats) continue;
        for (const fmt of ["hdr", "exr"] as const) {
          addPackage("hdri", res, fmt, formats[fmt]);
        }
      }
    }
    return out;
  }

  for (const group of ["gltf", "fbx", "blend", "usd"] as const) {
    const block = files[group] as
      | Record<string, Record<string, FileLeaf>>
      | undefined;
    if (!block) continue;
    for (const res of ["1k", "2k", "4k", "8k"]) {
      const formats = block[res];
      if (!formats) continue;
      const leaf = formats[group] || formats.gltf || formats.fbx || formats.blend || formats.usd;
      if (leaf) addPackage(group, res, group === "gltf" ? "gltf" : group, leaf);
    }
  }

  return out;
}

/** Prefer a mid-size glTF package for 3D preview. */
export function pickGltfPackage(
  packages: PolyPackage[],
): PolyPackage | null {
  return (
    packages.find((p) => p.format === "gltf" && p.resolution === "1k") ||
    packages.find((p) => p.format === "gltf" && p.resolution === "2k") ||
    packages.find((p) => p.format === "gltf") ||
    null
  );
}

/**
 * Build a blob: URL for model-viewer — rewrites relative glTF URIs
 * to absolute Poly Haven CDN URLs from the package includes.
 */
export async function buildGltfObjectUrl(
  pack: PolyPackage,
): Promise<string> {
  const main = pack.files[0];
  if (!main) throw new Error("Empty package");
  const text = await fetch(main.url).then((r) => {
    if (!r.ok) throw new Error("Could not load glTF");
    return r.text();
  });

  const byName = new Map<string, string>();
  for (const f of pack.files) {
    byName.set(f.path.replace(/^.*\//, ""), f.url);
    byName.set(f.path, f.url);
  }

  let json: {
    buffers?: Array<{ uri?: string }>;
    images?: Array<{ uri?: string }>;
  };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    // Already a binary glb — just return the remote URL
    return main.url;
  }

  const resolveUri = (uri: string | undefined) => {
    if (!uri || uri.startsWith("data:") || uri.startsWith("http")) return uri;
    const clean = uri.replace(/^\.\//, "");
    return (
      byName.get(clean) ||
      byName.get(clean.replace(/^.*\//, "")) ||
      pack.files.find((f) => f.path.endsWith(clean))?.url ||
      uri
    );
  };

  for (const b of json.buffers || []) {
    if (b.uri) b.uri = resolveUri(b.uri);
  }
  for (const img of json.images || []) {
    if (img.uri) img.uri = resolveUri(img.uri);
  }

  const blob = new Blob([JSON.stringify(json)], {
    type: "model/gltf+json",
  });
  return URL.createObjectURL(blob);
}
