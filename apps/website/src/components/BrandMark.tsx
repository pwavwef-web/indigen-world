/**
 * src/components/BrandMark.tsx
 *
 * The Indigen World logo mark (a simple woven/roof-line motif),
 * carried over unchanged from the uploaded template. `compact` shrinks
 * it for use inside the hero visual instead of the header.
 */
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-mark${compact ? " brand-mark--compact" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path className="brand-mark__frame" d="M15 47V23l17-9 17 9v24" />
        <path className="brand-mark__line" d="M24 44V29m8 15V24m8 20V29" />
        <circle className="brand-mark__sun" cx="32" cy="14" r="4" />
      </svg>
    </span>
  );
}
