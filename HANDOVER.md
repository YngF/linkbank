# LinkBank — Developer Handover

A running context document so a fresh Claude session (or any developer) can pick
up LinkBank exactly where the previous work left off. Read this first, then skim
`README.md`, `DOCKER.md`, and `WINDOWS_DEV.md`.

**Current version:** `1.7.0` · **Image:** `yngf73/linkbank` (Docker Hub) ·
**Repo:** `github.com/YngF/linkbank` · **Live instance:** runs as a container on
a TrueNAS box, exposed at `https://yngf.no`.

---

## 1. What LinkBank is

A fast, self-hostable **bookmark manager** with a real nested folder tree. One
container, one SQLite file by default (Postgres optional), no external services
required. Think "Linkding, but with a proper folder tree + a keyboard-driven UI"
plus optional admin-installable **modules** (currency converter, password
generator, …).

It is a finished, shipping product — not a prototype. Treat existing code and
conventions as load-bearing.

---

## 2. Tech stack

- **SvelteKit 2 + Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`,
  `$bindable`), `adapter-node`, **Vite 6**, **Tailwind 4**.
- **Kysely** (type-safe query builder). Dialect chosen at boot from
  `DATABASE_URL`: **better-sqlite3** (default) or **pg** (Postgres).
- **Node crypto**: scrypt (passwords), AES-256-GCM (note encryption), sha256
  (session/token/invite hashing).
- Runtime entry is **`server.js`** (a thin wrapper over the adapter build that
  optionally terminates HTTPS itself — see §7). `npm start` → `node server.js`.

TypeScript throughout. `svelte-check` must stay at **0 errors** (a handful of
benign warnings are pre-existing and acceptable — unused-CSS and
"reference only captures initial value" on intentional prop→state seeds).

---

## 3. How development actually works (important)

This project was built in a **Cowork/Claude Code** loop with a specific,
proven workflow. Keep to it:

1. **The GitHub repo is the source of truth.** The owner develops on a Windows
   PC with the repo at `D:\GitHub repos\linkbank`, cloned over SSH.
2. **Claude edits + verifies; the human commits + pushes.** Claude writes files
   into the repo folder (via the desktop file bridge) and builds/tests in its
   own sandbox, but does **not** run git — the git bridge on the device leaves
   stale `.git/index.lock` files. All `git add/commit/push/tag` is done by the
   human in their terminal.
3. **Every change is verified before delivery:** `npm run build` (must exit 0)
   **and** `npx svelte-check` (0 errors). For anything with runtime behaviour,
   boot `node build` against a scratch DB and exercise it with `curl` (see the
   e2e recipes that have been used: create admin via `POST /setup`, then hit the
   relevant routes with the session cookie).
4. **Releasing** = bump `version` in `package.json`, commit, then push a
   `vX.Y.Z` **tag**. The tag triggers `.github/workflows/docker-publish.yml`,
   which builds a multi-arch (amd64 + arm64) image, pushes it to Docker Hub, and
   creates a GitHub Release with auto-generated notes. **Commits and tags push
   separately** — `git push` then `git push origin vX.Y.Z`.
5. Deploy to the live box: `docker compose pull && docker compose up -d`.
   Migrations run automatically on boot.

### Build / verify commands

```bash
npm install          # first time (needs a compiler for better-sqlite3 if no prebuilt binary)
npm run build        # vite build — must exit 0
npx svelte-check     # must report 0 errors
npm start            # node server.js  (serves the built app on :3000)
npm run dev          # vite dev server (HMR)
```

---

## 4. Architecture & core conventions

### Data / DB

- Schema lives in `src/lib/server/db/types.ts` (Kysely `Database` interface).
- **Migrations run on boot**, once per process, from `src/hooks.server.ts`
  `init()` → `runMigrations()`. Migrations are an append-only array in
  `src/lib/server/db/migrate.ts`; each has a unique `name` recorded in the
  `_migrations` table. **Never edit an applied migration — always add a new
  one.** Latest is `0013_app_settings`.
- Migrations are **dialect-aware** via `PK`, `TS_DEFAULT`, `BLOB` SQL fragments
  (SQLite vs Postgres). Use those fragments, not raw type names.
- `pg` is loaded **lazily** (`createRequire(import.meta.url)('pg')`) only when
  `DATABASE_URL` is set, so the Rollup build never tries to bundle it. Do not
  add a static `import 'pg'` anywhere. Same lesson applies to any optional native
  dep — keep it out of the static import graph.

### Two settings stores

- **Per-user preferences** → JSON blob in `users.settings`, handled by
  `src/lib/server/prefs.ts` (`UserSettings`, `DEFAULT_SETTINGS`, `getSettings`,
  `updateSettings`, and a `sanitize()` that only accepts known keys/types).
  Adding a user preference = extend the interface + default + `sanitize()`; **no
  migration needed.** Current keys: `landOnLastFolder`, `searchEngine`,
  `showCurrency`, `showPassword`.
- **Instance-wide (admin) settings** → key/value in the `app_settings` table,
  handled by `src/lib/server/appSettings.ts` (`getJson`/`setJson` + module
  enablement helpers). This is also where cached exchange rates live.

### The Modules ("plugin") system — how to add one

This is the active development pattern. A **module** is a built-in optional
feature an **admin installs instance-wide**, and each **user chooses to show**.
To add a new module, e.g. `foo`:

1. **Register it** in `src/lib/modules.ts` — add `{ id: 'foo', name, description }`
   to `MODULES`. (This alone makes it appear in **Admin → Modules** with an
   Install/Uninstall button — the admin page iterates the registry.)
2. **Per-user visibility flag** in `src/lib/server/prefs.ts`: add
   `showFoo: boolean` (default `true`) to the interface, defaults, and
   `sanitize()`.
3. **Expose enablement to the UI**: the root layout already provides
   `data.modules` (enabled ids) and `data.settings`. Gate the top-bar widget on
   `data.modules.includes('foo') && data.settings.showFoo`.
4. **Build the widget** as a self-contained component (see
   `CurrencyConverter.svelte` / `PasswordGenerator.svelte`), a top-bar popover
   pattern: an `.iconbtn` + an absolutely-positioned `.pop` at `top:38px`,
   closed by a `svelte:window` outside-click handler.
5. **Settings toggle**: add a conditional card in
   `src/routes/settings/+page.svelte` gated on `data.modules.includes('foo')`
   (the settings load returns `modules: string[]`).
6. If the module needs **server data** (like currency rates), add a server
   module + a `GET /api/...` route guarded by `isModuleEnabled('foo')`, and (if
   scheduled) a scheduler started from `hooks.server.ts` that no-ops unless the
   module is enabled. Admin toggle endpoint is `PATCH /api/admin/modules`.

Purely client-side modules (like the password generator) need **no** server,
migration, admin, or API changes beyond steps 1–5.

### UI conventions

- Icons: single-path SVGs in `src/lib/components/Icon.svelte` (a `paths` map;
  `sun`/`key` are special-cased with an extra `<circle>`). Add new glyphs there.
- Client-side actions/toasts/dialogs go through `src/lib/client/ui.svelte.ts`
  (`ui.toast`, `ui.openDialog`, `ui.openMenu`, selection sets, `zoom`, …) and
  `src/lib/client/api.ts` (thin `mutate()` wrapper that calls the API,
  `invalidateAll()`, and toasts).
- Top-bar dropdowns must render above the main content: `.topbar` has
  `position: relative; z-index: 20` because the frosted-background feature
  (`backdrop-filter`) makes panels their own stacking context. Keep it.

---

## 5. Feature inventory (all shipped)

Folder tree (drag/drop, rename, move/copy, trash + undo) · search across
folders/bookmarks · tags (coloured, per-tag pages) · multi-user auth
(scrypt sessions, first-run `/setup`, `/login`) · **admin** page (invite links,
roles, safe user deletion) · self-service **Settings** page (email, password,
API tokens, personalization) · **capture**: browser extension (`extension/`,
MV3 Chrome+Firefox, token/`Bearer` auth on `POST /api/ingest`) and PWA share
target (`/share`) → Inbox · **link-rot** checking (scheduled + on-demand,
`/links` Broken view, exempt list) · **notes encrypted at rest** (AES-256-GCM) ·
import/export (Netscape HTML) · self-contained favicon fetch/cache · **SQLite
or Postgres** · dark/light theme + whole-UI zoom (CSS `zoom`) ·
open-last-folder-on-launch · **custom background image** (frosted tree/top-bar) ·
top-bar **web search** (selectable engine, opens new tab) · **Modules**:
currency converter (exchangerate-api.com, full currency list incl. UAH;
optional admin-supplied API key for more frequent updates) and password
generator.

---

## 6. Key files map

```
src/hooks.server.ts              migrations-on-boot + auth guard + scheduler start
src/routes/+layout.server.ts     loads tree, tags, counts, settings, bgVersion, modules
src/routes/+layout.svelte        app shell: sidebar tree, top bar, all popovers, CSS
src/routes/+page.server.ts       home (root folder); "open last folder" redirect
src/routes/f/[branchid]/         a folder view (+ sets the last-folder cookie)
src/routes/settings/             the user Settings page (personalization + account)
src/routes/admin/                admin: members, invites, Modules install/uninstall
src/routes/api/…                 all JSON endpoints (bookmarks, branches, tags, bulk,
                                 ingest, links, rates, admin/*, account, import/export)
src/routes/background/+server.ts serves/stores the per-user background image (BLOB)
src/lib/server/db/{types,migrate,index}.ts   schema, migrations, dialect switch
src/lib/server/prefs.ts          per-user settings JSON
src/lib/server/appSettings.ts    instance key/value + module enablement
src/lib/server/currency.ts       exchangerate-api.com fetch/cache + scheduler + admin API key (currency module)
src/lib/{modules,currency,searchEngines}.ts  shared (client+server) registries/helpers
src/lib/components/*.svelte      Icon, TreeNode, FolderView, Search, WebSearch,
                                 CurrencyConverter, PasswordGenerator, Dialogs, Toasts…
src/lib/client/{ui.svelte.ts,api.ts}  client state + API wrapper
extension/                       cross-browser MV3 capture extension (+ SIGNING.md)
Dockerfile, docker-compose.yml, .github/workflows/docker-publish.yml
```

---

## 7. Environment variables

| Var | Purpose |
| --- | --- |
| `ORIGIN` | **Required in prod** — exact public URL (login/CSRF depend on it). |
| `PROTOCOL_HEADER` / `HOST_HEADER` | `x-forwarded-proto` / `x-forwarded-host` behind a TLS proxy. |
| `DATABASE_PATH` | SQLite file path (default `/app/data/linkbank.db` in Docker). |
| `DATABASE_URL` | `postgres://…` to use Postgres instead of SQLite. |
| `NOTES_ENCRYPTION_KEY` | 32-byte base64 key for note encryption (else auto-generated into data dir). |
| `REGISTRATION` | `open` / `invite` / `closed` (default closed). `INVITE_CODE` for invite mode. |
| `LINK_CHECK_INTERVAL_HOURS` | Link-rot sweep interval (0 disables). |
| `CURRENCY_REFRESH_HOURS` / `CURRENCY_API_URL` | Rate refresh cadence / full override of the exchange-rate endpoint (beats any admin-set API key). |
| `FAVICON_ALLOW_INSECURE_TLS` | `1` to fetch favicons from self-signed LAN https sites. |
| `TLS_KEY_PATH` / `TLS_CERT_PATH` | Make `server.js` serve HTTPS directly (LAN self-signed, no proxy). |

Note: in `vite dev`, `.env` is only read via `$env/dynamic/private` — plain
`process.env` does **not** see `.env` at dev time.

---

## 8. Gotchas & hard-won lessons

- **CSS `zoom`** (the A−/A+ UI scaling) does not scale viewport units or
  `clientX`. Heights use `calc(100dvh / var(--ui-zoom))`; overlays/menus divide
  pointer coords by `ui.zoom`. Don't reintroduce raw `100dvh` on the shell.
- **`backdrop-filter` creates a stacking context.** The frosted top bar/sidebar
  (background-image feature) trapped popovers; fixed by `.topbar { z-index: 20 }`.
  Any new full-screen overlay should render as a sibling of `#app` (like
  `Dialogs`/`SearchModal` did) with a high `z-index`.
- **`better-sqlite3` is native.** In a network-restricted sandbox `npm install`
  can fail to fetch node headers — reuse a working `node_modules` if needed. On
  Windows it uses prebuilt binaries (no compiler required). SQLite must live on
  **local disk**, never a CIFS/NFS mount (network locking breaks it).
- **Claude's cloud sandbox can fully block `registry.npmjs.org` tarball
  downloads** (not just flaky — every package 403s, `npm`/`bun` alike), so
  `npm run build` / `svelte-check` sometimes can't run there at all. When that
  happens: edit carefully, syntax-check `.ts`/the `<script>` block of touched
  `.svelte` files with `node --experimental-strip-types --check`, and have the
  human run the real build/svelte-check locally before committing.
- **Currency rates come from exchangerate-api.com** (`open.er-api.com`,
  key-less, by default; `v6.exchangerate-api.com/v6/{key}/...` if an admin sets
  a key in Admin → Modules). ECB/Frankfurter was dropped — it doesn't publish a
  UAH rate. The two response shapes differ (`rates` vs `conversion_rates`),
  and this provider includes the base currency inside its own `rates` object —
  `currencyCodes()` in `src/lib/currency.ts` dedupes with a `Set` because of
  that; don't remove it.
- **Line endings**: `.gitattributes` pins everything to LF so Windows checkouts
  don't rewrite the bash scripts (`gen-selfsigned-cert.sh`) to CRLF.
- **Device git bridge** leaves stale `.git/index.lock` and can't delete files —
  which is exactly why git stays in the human's hands (see §3).

---

## 9. Suggested backlog / ideas (not committed)

- Password generator: optional strength meter or pronounceable-passphrase mode.
- Currency: remember more pairs / a small favourites row.
- README on GitHub could use a screenshot-forward polish; Docker Hub "Overview"
  is in `docs/dockerhub-overview.md` (paste it into the Docker Hub UI on change).
- More modules are easy now (unit converter, QR generator, notes scratchpad…) —
  follow the §4 recipe.

---

## 10. How to start the next session

Tell the new Claude: *"This is LinkBank — read `HANDOVER.md` and the repo. I
develop on Windows at `D:\GitHub repos\linkbank`; you edit + verify, I commit +
push. Current version 1.7.0. Here's what I want next: …"* Then hand it the repo
(or a connected folder) so it can read the actual code before changing anything.
