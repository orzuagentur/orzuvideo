/** Build Resend "From" header: Display Name <addr@domain.com> */

export function parseEmailAddress(from: string): string {
  const raw = from.trim();
  const m = raw.match(/<([^>]+)>/);
  if (m?.[1]) return m[1].trim();
  if (raw.includes("@")) return raw.replace(/^"|"$/g, "").trim();
  return raw;
}

export function parseDisplayName(from: string): string {
  const raw = from.trim();
  const m = raw.match(/^(.*?)\s*<[^>]+>\s*$/);
  if (m) return m[1].replace(/^"|"$/g, "").trim();
  return "";
}

export function composeFromHeader(displayName: string, addressOrFrom: string): string {
  const address = parseEmailAddress(addressOrFrom);
  const name = displayName.trim();
  if (!address) return name || "Support <support@orzuai.com>";
  if (!name) return address;
  return `${name} <${address}>`;
}
