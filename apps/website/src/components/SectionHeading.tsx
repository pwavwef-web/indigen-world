/**
 * src/components/SectionHeading.tsx
 *
 * The eyebrow + title + optional body pattern used at the top of
 * almost every section on the site. Carried over from the template
 * unchanged (it was already a clean, reusable component there).
 */
export function SectionHeading({
  eyebrow,
  title,
  body,
  light = false,
  as = "h2",
}: {
  eyebrow: string;
  title: string;
  body?: string;
  light?: boolean;
  as?: "h1" | "h2";
}) {
  const Heading = as;

  return (
    <div className={`section-heading${light ? " section-heading--light" : ""}`}>
      <p className="eyebrow">{eyebrow}</p>
      <Heading>{title}</Heading>
      {body ? <p className="section-heading__body">{body}</p> : null}
    </div>
  );
}
