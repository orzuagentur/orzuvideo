"use client";

import {
  getPasswordChecks,
  getPasswordStrength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_STRENGTH_LABEL,
  type PasswordStrength,
} from "@/lib/password";

const STRENGTH_COLOR: Record<Exclude<PasswordStrength, "empty">, string> = {
  weak: "var(--danger)",
  fair: "#e8a54b",
  strong: "#3ecf8e",
};

/** Live checklist + strength label under a password field. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const checks = getPasswordChecks(password);
  const strength = getPasswordStrength(password);
  if (!password) {
    return (
      <p className="text-xs text-[color:var(--muted)]">
        At least {PASSWORD_MIN_LENGTH} characters with a letter, number, and
        symbol.
      </p>
    );
  }

  const items = [
    { ok: checks.length, label: `${PASSWORD_MIN_LENGTH}+ characters` },
    { ok: checks.letter, label: "Letter" },
    { ok: checks.number, label: "Number" },
    { ok: checks.symbol, label: "Symbol" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[color:var(--muted)]">
          Password strength
        </span>
        {strength !== "empty" && (
          <span
            className="text-xs font-semibold"
            style={{ color: STRENGTH_COLOR[strength] }}
          >
            {PASSWORD_STRENGTH_LABEL[strength]}
          </span>
        )}
      </div>
      <div className="flex gap-1">
        {([1, 2, 3] as const).map((i) => {
          const filled =
            strength === "strong" ||
            (strength === "fair" && i <= 2) ||
            (strength === "weak" && i === 1);
          return (
            <span
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{
                background: filled
                  ? STRENGTH_COLOR[strength]
                  : "rgba(255,255,255,0.12)",
              }}
            />
          );
        })}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {items.map((item) => (
          <li
            key={item.label}
            style={{ color: item.ok ? "#3ecf8e" : "var(--muted)" }}
          >
            {item.ok ? "✓" : "○"} {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
