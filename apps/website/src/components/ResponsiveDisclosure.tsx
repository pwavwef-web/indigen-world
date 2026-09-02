import { useEffect, useState } from "react";
import type { ReactNode } from "react";

const COMPACT_QUERY = "(max-width: 639px)";

/**
 * Keeps supporting content fully visible on larger screens while turning it
 * into a deliberate, user-controlled disclosure on compact screens.
 */
export function ResponsiveDisclosure({
  summary,
  children,
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(() =>
    typeof window === "undefined" ? true : !window.matchMedia(COMPACT_QUERY).matches
  );

  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setOpen(!event.matches);

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return (
    <details
      className={`responsive-disclosure ${className}`.trim()}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>{summary}</span>
        <span className="responsive-disclosure__action" aria-hidden="true">
          {open ? "Hide" : "Explore"}
        </span>
      </summary>
      <div className="responsive-disclosure__content">{children}</div>
    </details>
  );
}
