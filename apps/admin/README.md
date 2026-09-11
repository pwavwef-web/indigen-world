# Indigen World Admin

The internal administration console for the Indigen World ecosystem. It is a
separate application from **TribeStudio** (`apps/tribestudio`), which is the
workspace for contributors and content creators.

## Responsibilities

- Role and access administration (assigning and auditing role claims)
- Validation oversight across language cells (queues, escalations, quality)
- Moderation of reported content against consent and cultural-permission policy
- Campaign, bounty and reward-integrity oversight
- Audit and accountability (inspecting the append-only audit log)
- Operational reporting and approved, permission-safe exports

## Out of scope

- Creator and contributor production workflows — use `apps/tribestudio`
- Public marketing and partner pages — use `apps/website`
- Everyday consumer learning and exploration — use `apps/mobile`
- Secret-bearing or trusted backend execution — use `services/functions`
- Direct AI provider calls from the browser

## Stack

React + TypeScript + Vite, hosted on Firebase Hosting (site: `indigen-admin`)
in the shared `project-kassena-7e026` project. It consumes
`@indigen-world/contracts` for shared data shapes and enums.

Privileged access must be backed by role claims, Firebase Security Rules and
server-side checks in `services/functions` — never by client-side checks alone.
The console is marked `noindex` and must not be publicly discoverable.

## Console UI

Every screen is built from one kit — [`@indigen-world/console-ui`](../../packages/console-ui),
shared with the TribeStudio workspace — so a new screen inherits the console's
behaviour instead of restating it:

| Piece | What it owns |
|---|---|
| `DataTable` | Sorting, search, paging, row selection, sticky headers, the empty state, and containment — the table scrolls inside `TableShell`, never the page |
| `TableShell` | The one element allowed to scroll sideways; it reports its own overflow so the edge fade appears only when something is hidden |
| `CommandPalette` | ⌘K / Ctrl-K navigation and privileged actions, ranked by subsequence match |
| `primitives.tsx` | `Panel`, `PageHeader`, `Toolbar`, `Stat`, `StatusPill`, `EmptyState`, `Alert`, `Loading`, `CopyId`, `SegmentedControl` |
| `kit.css` | The design system: glass surfaces on a blue-and-white ground, layered elevation, and one control baseline for every button, input and select |

Three rules hold it together, and `npm test --workspace @indigen-world/admin`
enforces them:

1. **Nothing widens the page.** Wide content scrolls or wraps inside its own
   box. `styles.css` contains stray width with `overflow-x: clip` as a backstop,
   but the fix belongs in the component.
2. **One table.** `.data-table` and the legacy `.admin-table`,
   `.collection-table` and `.learning-table` are all styled by the same rules,
   so screens written before the kit still look like the rest of the console.
3. **Controls are not restyled per screen.** The baseline in `kit.css` sits
   inside `:where()`, so it carries zero specificity: it dresses controls
   nobody has styled and loses to any rule that has an opinion. The shell's
   own chrome keeps its look without the kit knowing those class names.

Keyboard: `⌘K` / `Ctrl-K` opens the palette, `/` focuses the rail's screen
filter, and the row-density toggle above any table is remembered per browser.

## Local development

```bash
npm run dev --workspace @indigen-world/admin
npm run build:admin      # from the repo root
```

## Deploy

Served by the `indigen-admin` Hosting site; production custom domain
`admin.indigenworld.com`. See
[`docs/architecture/hosting-and-domains.md`](../../docs/architecture/hosting-and-domains.md) for the
full site/domain map.

```bash
firebase deploy --only hosting:indigen-admin
```
