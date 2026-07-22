import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 (S3-compatible) — all large media lives here.
 * Supabase is auth + Postgres only.
 */
export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

export function r2Bucket(): string {
  const bucket = (process.env.R2_BUCKET || "").trim();
  if (!bucket) throw new Error("R2_BUCKET is not configured");
  return bucket;
}

export function r2PublicBaseUrl(): string {
  const base = (process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (base) return base;
  const account = (process.env.R2_ACCOUNT_ID || "").trim();
  const bucket = r2Bucket();
  // Fallback: R2 S3 API URL is not publicly browsable; require R2_PUBLIC_BASE_URL
  // for public playback. Signed URLs still work without it.
  if (account) {
    return `https://${bucket}.${account}.r2.cloudflarestorage.com`;
  }
  throw new Error("R2_PUBLIC_BASE_URL is not configured");
}

let _client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (_client) return _client;
  const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Cloudflare R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)",
    );
  }
  const endpoint =
    (process.env.R2_ENDPOINT || "").trim() ||
    `https://${accountId}.r2.cloudflarestorage.com`;

  _client = new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
  return _client;
}

export function publicObjectUrl(key: string): string {
  const clean = key.replace(/^\/+/, "");
  return `${r2PublicBaseUrl()}/${clean}`;
}

export async function uploadObject(opts: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}): Promise<{ bucket: string; key: string; publicUrl: string }> {
  const bucket = r2Bucket();
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    }),
  );
  return {
    bucket,
    key: opts.key,
    publicUrl: publicObjectUrl(opts.key),
  };
}

export async function deleteObject(key: string): Promise<void> {
  const bucket = r2Bucket();
  await getR2Client().send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key }),
  );
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const bucket = r2Bucket();
  // S3 DeleteObjects max 1000
  for (let i = 0; i < keys.length; i += 900) {
    const chunk = keys.slice(i, i + 900);
    await getR2Client().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }
}

export async function listPrefix(prefix: string): Promise<string[]> {
  const bucket = r2Bucket();
  const client = getR2Client();
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix.replace(/\/?$/, "/"),
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents || []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function deletePrefix(prefix: string): Promise<number> {
  const keys = await listPrefix(prefix);
  await deleteObjects(keys);
  return keys.length;
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getR2Client().send(
      new HeadObjectCommand({ Bucket: r2Bucket(), Key: key }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Content-Length from R2, or null if missing / error. */
export async function objectSizeBytes(key: string): Promise<number | null> {
  try {
    const res = await getR2Client().send(
      new HeadObjectCommand({ Bucket: r2Bucket(), Key: key }),
    );
    const n = res.ContentLength;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function signedGetUrl(
  key: string,
  expiresInSec = 3600,
): Promise<string> {
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: r2Bucket(), Key: key }),
    { expiresIn: expiresInSec },
  );
}

export async function signedPutUrl(
  key: string,
  contentType: string,
  expiresInSec = 3600,
): Promise<string> {
  return getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: r2Bucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresInSec },
  );
}
