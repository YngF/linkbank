# LinkBank — instructions for Claude

Read `HANDOVER.md` first (architecture, conventions, gotchas, env vars). This
file is the short "how we work + where we left off" layer on top of it.

## Where we left off

- **Version 1.7.8**, tagged, built and **deployed** to the live instance at
  <https://linkbank.no>. `main` is clean and pushed; nothing is in flight.
- Recent work (1.7.2 → 1.7.8): password strength meter, currency favourites +
  optional VAT toggle (`da-DK` number format, fixed on purpose), sidebar Tags
  as a tab (setting `tagsDisplay`), compact list view (setting `bookmarkView`),
  version badge in the top bar + login footer, login "self-hosted instance"
  note, one-command TrueNAS deploy.
- No open tasks. Ideas are in `HANDOVER.md` §9.
- The owner is Norwegian, writes casually with emoji, and likes quick
  "yep / ship it" turnarounds. Answer concisely.

## How we work (standing preferences)

- **Do the whole pipeline yourself when asked** — edit, verify, commit, push,
  tag, wait for the build, deploy. Don't hand commands back for the owner to
  run. (This supersedes the old "the human commits + pushes" note in
  `HANDOVER.md` §3, which dates from a sandboxed workflow.)
- Only commit/push/tag/deploy when asked ("bump to vX.Y.Z, commit and push",
  "tag and ship it"). After pushing a commit, **offer** the tag + deploy if
  they didn't ask for it yet.
- **Verify every change** before reporting it done: `npx svelte-check` (0
  errors; ~15 pre-existing warnings are fine) and `npm run build` (exit 0).
  After adding a field to a layout/page load, run `npx svelte-kit sync` first
  or svelte-check reports stale `$types`.
- For UI work, test the **built** app (`node build`) on port 3099 against a
  **scratch DB** (`DATABASE_PATH=<temp>/x.db ORIGIN=http://localhost:3099
  PORT=3099 node build`): create the admin at `/setup`, install modules at
  `/admin`, drive the UI. Delete the scratch DB and kill the server after.
  **Never touch `data/linkbank.db`** — it is the owner's real dev data.
- When the owner wants to try a change themselves, start the dev server
  (`.claude/launch.json` → "dev", port 5173) and leave it running until they
  say ship it; stop it afterwards.
- Never print secrets (API keys, tokens) in chat or commits. Don't commit
  `.env`, `.env.local`, `data/`, or `.claude/` contents other than
  `launch.json`.
- Commit messages: imperative summary + short why; end with the
  `Co-Authored-By` trailer the harness asks for.

## Release & deploy (every release)

1. Bump `version` in `package.json` **and** the two version mentions in
   `HANDOVER.md` (header line + §10). The version shows in the UI
   (`src/lib/server/version.ts` bundles it from `package.json`).
2. `git add` the specific files (never `-A`; `.claude/` stays untracked),
   commit, `git push`.
3. `git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z` → triggers
   `.github/workflows/docker-publish.yml` (multi-arch image to Docker Hub
   `yngf73/linkbank` + GitHub Release, ~5–7 min).
4. `gh run list --limit 2`, then `gh run watch <id> --exit-status`.
5. Deploy only after the build succeeds:
   `set -a && source .env.local && set +a && npm run deploy -- linkbank`
   (`scripts/truenas-deploy.mjs` pulls `:latest` and redeploys the TrueNAS app
   `linkbank` on `truenas3.v33.lan` over its JSON-RPC API).
6. Verify: `curl -sL https://linkbank.no/login | grep -o "LinkBank v[0-9.]*"`.

## The dev machine (Debian 13, since 2026-10-18)

The owner develops on **Debian 13** with **bash** — the old Windows/PowerShell
setup is gone. Use bash syntax and forward slashes everywhere; `WINDOWS_DEV.md`
and any `D:\GitHub repos\…` path in older docs are historical.

- Repos live side by side in `~/projects/`: `linkbank`, `cointoss-admin`,
  `cointoss-auksjon` (same workflow/deploy pattern).
- Old drive letters now map to: `D:\` → `/mnt/data1`, `Z:` →
  `/mnt/truenas3/data/shared/cointoss`, `R:` (`\\truenas\Projects`) →
  `/mnt/truenas/projects`.
- In dev mode the app's data dir is `./data` (`DATABASE_PATH` in `.env`).
- Installed: git 2.47, Node 24 + npm 11, `cc`/`make`/`python3`, SSH key
  authenticating to GitHub as `YngF`, and `gh` 2.46 authenticated as `YngF`
  (protocol SSH, `repo` scope) — so `gh run list` / `gh run watch` work for
  release builds.
- With npm 11, `npm ci` warns that install scripts for `better-sqlite3` and
  `esbuild` were skipped. Harmless: both ship prebuilt binaries
  (`better-sqlite3/prebuilds/linux-x64.node`), so nothing has to compile.

### New machine checklist

Things not in git, so they must be recreated or copied over:

- **Tools:** git, Node 22+ (Docker image uses 22; dev runs on 24), npm, the
  GitHub CLI `gh` (`gh auth login`, protocol SSH). `better-sqlite3` is native —
  prebuilt binaries normally work; if `npm install` has to compile, install
  `build-essential python3`.
- **Git over SSH:** new key (`ssh-keygen -t ed25519`), add to GitHub →
  Settings → SSH keys, `ssh -T git@github.com`. Remote is
  `git@github.com:YngF/linkbank.git`. Identity: `YngF` / `yngvef@yngf.no`.
  Keep `core.autocrlf false` (repo is LF-only, see `.gitattributes`).
- **Setup:** `git clone`, `npm ci`, `npx svelte-kit sync`,
  `npm install ws --no-save` (needed only by the deploy script; intentionally
  *not* a dependency), then `npm run build` + `npx svelte-check`.
- **`.env`** — copy from `.env.example` (defaults are fine for dev).
- **`.env.local`** (gitignored) needs `TRUENAS_API_KEY=…`. The same shared
  service-account key lives in the `cointoss-admin` repo's `.env.local`
  (`TRUENAS_API_KEY`); copy it file-to-file, or mint a new API key in the
  TrueNAS UI (account icon → My API Keys, user `claude-deploy`, role
  APPS_WRITE only). `TRUENAS_URL` defaults to
  `wss://truenas3.v33.lan/api/current`, so the machine must be on the LAN (or
  VPN) and resolve `truenas3.v33.lan`. Keep the key out of `.env` — one copy,
  in `.env.local`.
- **`data/linkbank.db`** (dev database, gitignored): copy it if the dev data
  matters; otherwise a fresh one is created on first run.
- **Claude's auto-memory is machine-local** and won't follow the owner; the
  durable parts are written into this file instead.

## Gotchas learned recently

- **Number formatting is a fixed locale on purpose** (`da-DK` in
  `CurrencyConverter.svelte`: `39.169,19`). `nb-NO` uses a space for
  thousands, and Brave's anti-fingerprinting ("farbling") makes
  `Intl…(undefined)` unreliable, so don't switch to the browser locale.
- Per-user settings go through `src/lib/server/prefs.ts` (interface + default +
  `sanitize()`, no migration). Current keys: `landOnLastFolder`,
  `searchEngine`, `showCurrency`, `showPassword`, `tagsDisplay`
  (`tree|tabs`), `bookmarkView` (`grid|list`). Settings that change the
  sidebar should call `invalidateAll()` after saving so they apply instantly.
- `list` view is a pure CSS re-layout of the tile markup in `FolderView.svelte`
  (`.grid.list …`) so drag/drop, multi-select and keyboard nav keep working.
- Removing an item from a keyed `{#each}` inside a popover detaches its DOM
  node before the click bubbles to the window outside-click handler — call
  `e.stopPropagation()` on such remove buttons (see currency favourites).
- Browser-pane quirks when testing: screenshots can time out ("pane not
  displayed"); drive and assert via `javascript_tool` with dispatched
  `MouseEvent`s and read DOM state instead. Wrap snippets in an IIFE (top
  level `const` redeclaration errors across calls).
- If action tools fail with "auto mode classifier gave no verdict", it is a
  transient outage — retry later, don't loop.
