# @indigen-world/console-ui

The shared kit behind the Indigen World operator surfaces — the admin console
(`apps/admin`) and the TribeStudio creator workspace (`apps/tribestudio`).

These two products are not marketing pages. They are dense, table-heavy places
where staff and creators work for hours, and they had drifted into separate
table styles, separate control baselines and separate ideas of what an empty
state looks like. This package is the one answer to those questions.

| Export | What it owns |
|---|---|
| `DataTable` | Sorting, client search, paging, row selection, sticky headers, skeleton and empty states, a remembered row density |
| `TableShell` | The only element allowed to scroll sideways; it measures its own overflow so the edge fade appears only when content is hidden |
| `CommandPalette` / `useCommandPalette` | ⌘K / Ctrl-K navigation and actions, ranked by subsequence match |
| `Panel`, `PageHeader`, `Toolbar`, `SearchInput`, `SegmentedControl` | The furniture every screen repeats |
| `Stat`, `StatGrid`, `StatusPill`, `toneForStatus` | Numbers and state, said the same way twice |
| `EmptyState`, `Alert`, `Loading`, `Spinner`, `CopyId`, `Kbd` | The small pieces screens otherwise reinvent |

## Using it

```tsx
import { DataTable, PageHeader, Panel } from '@indigen-world/console-ui';
```

```ts
// In the app's entry point, after the design tokens:
import '@indigen-world/console-ui/kit.css';
```

Every rule in `kit.css` is scoped to `.iwx`. Put that class on your shell's
root element and nothing in the kit reaches a page that did not ask for it:

```tsx
<div className="admin-app-shell iwx">   {/* apps/admin */}
<div className="studio iwx">            {/* apps/tribestudio */}
```

## The three rules

1. **Nothing widens the page.** Wide content scrolls or wraps inside its own
   box. A table that overflows does it inside `TableShell`, never by pushing
   the viewport sideways.
2. **One table.** `.data-table` and the apps' older table class names are
   styled by the same rules, so screens written before the kit still belong.
3. **Controls are not restyled per screen.** The baseline uses `:where()`, so
   it carries zero specificity and any app or screen rule still wins.

Both consuming apps enforce these in their own validators
(`apps/admin/scripts/validate-admin.mjs`, `apps/tribestudio/scripts/validate-studio.mjs`).
