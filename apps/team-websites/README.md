# Team Websites

Personal websites for members of the Indigen World team. Each member gets their
own small site — a place for their bio, work, and links — living in its own
folder here so it can be built and deployed independently of the others.

> Folder note: named `team-websites` (kebab-case) to match the repo's other app
> folders (`website`, `admin`, `tribestudio`) and to keep paths free of spaces.

## Layout

```
apps/team-websites/
├── _template/        # Copy this to start a new member site
├── <member-name>/    # One folder per member, e.g. francis-pwavwe/
└── README.md
```

Each member site is a standalone Vite + React + TypeScript app, mirroring the
stack used by `apps/website`.

## Adding a member site

1. Copy the template into a new kebab-case folder named after the member:

   ```bash
   cp -r apps/team-websites/_template apps/team-websites/ada-lovelace
   ```

2. In the new folder's `package.json`, set `name` to
   `@indigen-world/team-ada-lovelace` (i.e. `@indigen-world/team-<member>`).

3. Register the workspace in the root `package.json` under `"workspaces"`:

   ```json
   "apps/team-websites/ada-lovelace"
   ```

4. Fill in the member's details in `src/App.tsx` and `index.html`.

5. Install and run:

   ```bash
   npm install
   npm run dev --workspace @indigen-world/team-ada-lovelace
   ```

## Convention

- Folder names: kebab-case of the member's name (`francis-pwavwe`).
- Package names: `@indigen-world/team-<member>`.
- Keep each site self-contained; shared UI can be pulled from
  `@indigen-world/web-ui` if desired.
