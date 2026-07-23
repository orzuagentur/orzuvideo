/** Shared password policy for signup + reset. */

export const PASSWORD_MIN_LENGTH = 11;

export type PasswordChecks = {
  length: boolean;
  letter: boolean;
  number: boolean;
  symbol: boolean;
};

export type PasswordStrength = "empty" | "weak" | "fair" | "strong";

export function getPasswordChecks(password: string): PasswordChecks {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    letter: /[A-Za-zА-Яа-яЁё]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-zА-Яа-яЁё0-9\s]/.test(password),
  };
}

export function isPasswordValid(password: string): boolean {
  const c = getPasswordChecks(password);
  return c.length && c.letter && c.number && c.symbol;
}

export function passwordValidationError(password: string): string | null {
  if (!password) return "Password is required";
  const c = getPasswordChecks(password);
  if (!c.length) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (!c.letter) return "Password must include a letter";
  if (!c.number) return "Password must include a number";
  if (!c.symbol) return "Password must include a symbol (!@#$%…)";
  return null;
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return "empty";
  const c = getPasswordChecks(password);
  const score =
    Number(c.length) + Number(c.letter) + Number(c.number) + Number(c.symbol);
  if (score <= 2) return "weak";
  if (score === 3) return "fair";
  return "strong";
}

export const PASSWORD_STRENGTH_LABEL: Record<
  Exclude<PasswordStrength, "empty">,
  string
> = {
  weak: "Weak",
  fair: "Fair",
  strong: "Strong",
};
