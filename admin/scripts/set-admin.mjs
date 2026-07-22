/**
 * Mark a Supabase user as admin (profiles.is_admin = true).
 *
 * Usage (from repo root, with admin/.env.local filled):
 *   node admin/scripts/set-admin.mjs you@example.com
 *   node admin/scripts/set-admin.mjs --id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   node admin/scripts/set-admin.mjs --revoke you@example.com
 */
const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  const raw = fs.readFileSync(file, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const idMode = args.includes("--id");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    console.error(
      "Usage: node admin/scripts/set-admin.mjs <email>\n" +
        "       node admin/scripts/set-admin.mjs --id <user-uuid>\n" +
        "       node admin/scripts/set-admin.mjs --revoke <email>",
    );
    process.exit(1);
  }

  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("Missing admin/.env.local");
    process.exit(1);
  }
  const env = loadEnv(envPath);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const value = !revoke;
  const filter = idMode ? `id=eq.${target}` : `email=eq.${encodeURIComponent(target)}`;
  const res = await fetch(`${url}/rest/v1/profiles?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ is_admin: value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Failed:", data);
    process.exit(1);
  }
  if (!Array.isArray(data) || data.length === 0) {
    console.error("No profile matched:", target);
    process.exit(1);
  }
  for (const row of data) {
    console.log(
      `${value ? "Granted" : "Revoked"} admin → ${row.email || row.id} (${row.id})`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
