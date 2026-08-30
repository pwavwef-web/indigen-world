/**
 * apps/updates-blog/scripts/validate-theme.mjs
 *
 * Checks the Blogger theme for the mistakes Blogger rejects on upload but a
 * plain XML parser happily accepts. Run this before pasting the theme in.
 *
 *   node apps/updates-blog/scripts/validate-theme.mjs
 *
 * Exits non-zero on any failure so it can gate a commit or CI step.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "..", "theme", "indigen-world-updates.xml");
const src = readFileSync(file, "utf8");

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });

/* Blogger's container rules. A widget that contains anything other than
   settings and includables is rejected with
   "A widget can only contain b:includable elements". */
const CONTAINS = {
  "b:widget": new Set(["b:widget-settings", "b:includable"]),
  "b:section": new Set(["b:widget"]),
  "b:widget-settings": new Set(["b:widget-setting"]),
};

// Strip CDATA so stylesheet and script text is never scanned as markup.
const markup = src.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

const stack = [];
const violations = [];
const TAG = /<(\/?)(b:[a-zA-Z-]+)([^>]*?)(\/?)>/g;
let match;
while ((match = TAG.exec(markup)) !== null) {
  const [, closing, tag, attrs, selfClose] = match;

  if (closing) {
    stack.pop();
    continue;
  }

  const parent = stack[stack.length - 1];
  if (parent) {
    const allowed = CONTAINS[parent.tag];
    if (allowed && !allowed.has(tag)) {
      violations.push(
        `<${parent.tag}${parent.id ? ` id="${parent.id}"` : ""}> may not contain <${tag}> ` +
          `(allowed: ${[...allowed].sort().join(", ")})`
      );
    }
  }

  if (!selfClose) {
    const id = (attrs.match(/\bid='([^']*)'/) || [])[1] || "";
    stack.push({ tag, id });
  }
}

check("Blogger container rules", violations.length === 0, violations.join("\n    "));
check("tags balanced", stack.length === 0, stack.map((s) => s.tag).join(" > "));

/* Every b:include must resolve to an includable we define, or to one of
   Blogger's built-ins that widget default markup supplies. */
const BUILTIN = new Set(["all-head-content", "comments", "threaded_comments", "comment-form"]);
const defined = new Set([...markup.matchAll(/<b:includable\b[^>]*\bid='([^']+)'/g)].map((m) => m[1]));
const included = new Set([...markup.matchAll(/<b:include\b[^>]*\bname='([^']+)'/g)].map((m) => m[1]));
const missing = [...included].filter((n) => !defined.has(n) && !BUILTIN.has(n));
check("every b:include resolves", missing.length === 0, missing.join(", "));

/* Blogger serves the theme as HTML. A self-closed non-void element such as
   <div/> parses as an OPEN div in the browser and swallows the rest. */
// The (?![-:\w]) guard stops "b" matching the "b:" namespace prefix, whose
// tags are Blogger's own and are correctly self-closing.
const NON_VOID =
  /<(div|span|i|b|p|a|nav|section|article|aside|header|footer|main|button|form|label|ul|ol|li|h[1-6]|time|small|strong|em|figure|figcaption|blockquote|pre|code|table|thead|tbody|tr|td|th|select|textarea)(?![-:\w])[^>]*\/>/;
const selfClosed = markup.match(NON_VOID);
check("no self-closed non-void HTML", !selfClosed, selfClosed ? selfClosed[0] : "");

/* $(name) substitution only happens inside b:skin. */
const afterSkin = src.split("]]></b:skin>")[1] || "";
check("no $( outside b:skin", !afterSkin.includes("$("));

check("exactly one b:skin", (src.match(/<b:skin>/g) || []).length === 1);
check(
  "CDATA balanced",
  (src.match(/<!\[CDATA\[/g) || []).length === (src.match(/\]\]>/g) || []).length
);

/* Blogger expressions use and/or/not, never && or ||. */
check("no &&/|| in b: expressions", !/(?:cond|expr)='[^']*(?:&&|\|\|)/.test(src));

/* XML allows only these named entities without a DTD. */
const entities = new Set([...src.matchAll(/&([a-zA-Z][a-zA-Z0-9]*);/g)].map((m) => m[1]));
const badEntities = [...entities].filter((e) => !["amp", "lt", "gt", "quot", "apos"].includes(e));
check("only XML-safe named entities", badEntities.length === 0, badEntities.join(", "));

/* Every widget needs the attributes Blogger writes back. */
const badWidgets = [];
for (const w of markup.match(/<b:widget(?![-\w])[^>]*>/g) || []) {
  const need = ["id=", "type=", "version=", "locked=", "visible="].filter((a) => !w.includes(a));
  if (need.length) badWidgets.push(`${w.slice(0, 60)}... missing ${need.join(" ")}`);
}
check("widget attributes complete", badWidgets.length === 0, badWidgets.join("\n    "));

/* Only these b: elements exist. An unknown one fails the upload. */
const KNOWN_B = new Set([
  "b:skin", "b:section", "b:widget", "b:widget-settings", "b:widget-setting",
  "b:includable", "b:include", "b:if", "b:else", "b:elseif", "b:loop",
  "b:eval", "b:class", "b:attr", "b:with", "b:switch", "b:case", "b:default",
  "b:comment", "b:template-skeleton", "b:defaultmarkup", "b:tag", "b:text",
]);
const unknownB = [
  ...new Set([...markup.matchAll(/<\/?(b:[a-zA-Z-]+)/g)].map((m) => m[1])),
].filter((t) => !KNOWN_B.has(t));
check("no unknown b: elements", unknownB.length === 0, unknownB.join(", "));

/* expr: belongs on HTML attributes, never on a b: element. */
const exprOnB = (markup.match(/<b:[a-zA-Z-]+[^>]*\bexpr:[a-zA-Z-]+=/g) || []).map((s) =>
  s.slice(0, 70)
);
check("no expr: on b: elements", exprOnB.length === 0, exprOnB.join("\n    "));

/* Includable ids must be unique within each widget. */
const dupIncludables = [];
for (const w of markup.split("<b:widget").slice(1)) {
  const body = w.split("</b:widget>")[0];
  const wid = (body.match(/\bid='([^']+)'/) || [])[1] || "?";
  const ids = [...body.matchAll(/<b:includable\b[^>]*\bid='([^']+)'/g)].map((m) => m[1]);
  const dupes = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  if (dupes.length) dupIncludables.push(`${wid}: ${dupes.join(", ")}`);
}
check("includable ids unique per widget", dupIncludables.length === 0, dupIncludables.join("; "));

/* Blogger only accepts alphanumeric section and widget ids. */
const badIds = [
  ...[...markup.matchAll(/<b:section\b[^>]*\bid='([^']+)'/g)].map((m) => m[1]),
  ...[...markup.matchAll(/<b:widget(?![-\w])[^>]*\bid='([^']+)'/g)].map((m) => m[1]),
].filter((id) => !/^[A-Za-z0-9]+$/.test(id));
check("section and widget ids alphanumeric", badIds.length === 0, badIds.join(", "));

/* Widget settings are type-specific. Blogger rejects unknown names with an
   HTTP 400 response even though the theme is otherwise valid XML. */
const WIDGET_SETTINGS = {
  BlogArchive: new Set([
    "frequency",
    "chronological",
    "showStyle",
    "showWeekEnd",
    "showPosts",
    "yearPattern",
    "monthPattern",
    "weekPattern",
    "dayPattern",
  ]),
};
const badWidgetSettings = [];
const WIDGET = /<b:widget(?![-\w])([^>]*)>([\s\S]*?)<\/b:widget>/g;
let widgetMatch;
while ((widgetMatch = WIDGET.exec(markup)) !== null) {
  const [, attrs, body] = widgetMatch;
  const type = (attrs.match(/\btype='([^']+)'/) || [])[1] || "";
  const allowed = WIDGET_SETTINGS[type];
  if (!allowed) continue;

  const id = (attrs.match(/\bid='([^']+)'/) || [])[1] || "?";
  const names = [...body.matchAll(/<b:widget-setting\b[^>]*\bname='([^']+)'/g)].map(
    (setting) => setting[1]
  );
  const invalid = names.filter((name) => !allowed.has(name));
  if (invalid.length) badWidgetSettings.push(`${id}: ${invalid.join(", ")}`);
}
check(
  "known widget settings valid",
  badWidgetSettings.length === 0,
  badWidgetSettings.join("; ")
);

/* Ids must be unique or Blogger drops the duplicates. */
for (const [what, re] of [
  ["widget", /<b:widget(?![-\w])[^>]*\bid='([^']+)'/g],
  ["section", /<b:section\b[^>]*\bid='([^']+)'/g],
]) {
  const ids = [...markup.matchAll(re)].map((m) => m[1]);
  const dupes = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  check(`${what} ids unique`, dupes.length === 0, dupes.join(", "));
}

/* ------------------------------------------------------------------ report */

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "  ok  " : " FAIL "} ${r.name}`);
  if (!r.ok && r.detail) console.log(`    ${r.detail}`);
  if (!r.ok) failed += 1;
}
console.log(
  failed === 0
    ? `\nvalidate-theme: all ${results.length} checks passed`
    : `\nvalidate-theme: ${failed} of ${results.length} checks FAILED`
);
process.exit(failed === 0 ? 0 : 1);
