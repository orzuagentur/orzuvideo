import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  /** Show wordmark next to the mark */
  withWordmark?: boolean;
  className?: string;
  /** Mark size in px */
  size?: number;
  /** Accessible label */
  label?: string;
};

/** OrzuAi mark — transparent gold figure for dark UI. */
export function BrandMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-mark.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      draggable={false}
    />
  );
}

/** Header / auth logo: mark + optional OrzuAi text. */
export function BrandLogo({
  href = "/",
  withWordmark = true,
  className = "",
  size = 36,
  label = "OrzuAi",
}: BrandLogoProps) {
  const inner = (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark size={size} />
      {withWordmark ? (
        <span
          className="font-[family-name:var(--font-syne)] tracking-[0.03em]"
          style={{ fontWeight: 800, fontSize: size * 0.58 }}
        >
          OrzuAi
        </span>
      ) : null}
    </span>
  );

  if (!href) {
    return <span className={className}>{inner}</span>;
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={`relative z-10 inline-flex shrink-0 items-center origin-left transition hover:opacity-90 ${className}`}
    >
      {inner}
    </Link>
  );
}

/** Full-width logo for large hero placements. */
export function BrandLogoWide({
  href,
  className = "",
  width = 160,
}: {
  href?: string | null;
  className?: string;
  width?: number;
}) {
  const height = Math.round(width * (398 / 699));
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="OrzuAi"
      width={width}
      height={height}
      className={`object-contain ${className}`}
      draggable={false}
    />
  );
  if (!href) return img;
  return (
    <Link href={href} aria-label="OrzuAi" className="inline-block shrink-0">
      {img}
    </Link>
  );
}
