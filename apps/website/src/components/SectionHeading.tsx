/**
 * src/components/SectionHeading.tsx
 *
 * The title + optional body pattern used at the top of almost every
 * section on the site. Since the 2026-10-31 redesign the heading carries
 * its own weight: `eyebrow` is still accepted so existing pages compile,
 * but it is no longer rendered above the title.
 */
export function SectionHeading({
  title,
  body,
  light = false,
  as = "h2",
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  light?: boolean;
  as?: "h1" | "h2";
}) {
  const Heading = as;

  return (
    <div className={`section-heading${light ? " section-heading--light" : ""}`}>
      <Heading>{title}</Heading>
      {body ? <p className="section-heading__body">{body}</p> : null}
    </div>
  );
}
