# LinkBank

A fast, self-hostable bookmark manager with a proper folder tree. One
container, one SQLite file, no external services.

> **Status: early scaffold (Phase 1).** Renders your folder tree read-only from
> a real database. Auth, bookmark editing, drag-and-drop, and search are on the
> roadmap below.

## Why

Most bookmark managers are either a browser-locked list or a heavy multi-
container stack. LinkBank aims for the Linkding end of the spectrum — a single
lightweight container you can run on a Raspberry Pi — while keeping a real
nested folder tree and a keyboard-driven UI.

## Quick start

### Docker (recommended)

```bash
docker compose up -d
# open http://localhost:3000
```

The entire database is the one file under `./data`. Back that up and you've
backed up everything.

### From source (dev)

```bash
npm install
cp .env.example .env
npm run seed -- scripts/seed-tree.json yngvef   # optional: load a sample tree
npm run dev
```

## How it works

- **SvelteKit** (Node adapter) — server and UI in one app, one origin, no CORS.
- **SQLite via Kysely** — the schema is a normalised folder tree (`branches`
  self-referencing `parent_id`) plus `bookmarks` and `users`. The whole tree
  loads in one recursive CTE. Kysely means PostgreSQL can be added later by
  swapping the dialect, with no query rewrites.
- **Migrations run on boot** — a fresh container provisions its own schema.
- **No hardcoded secrets** — session and notes-encryption keys are generated on
  first run (once auth lands), configurable via env.

## Configuration

See `.env.example`. Key variables: `DATABASE_PATH`, `ORIGIN` (set this behind a
reverse proxy), `REGISTRATION` (`open` / `invite` / `closed`), and optional
`DATABASE_URL` to run on Postgres instead of SQLite.

## Database: SQLite or PostgreSQL

By default LinkBank uses **SQLite** — one file at `DATABASE_PATH`, zero setup,
ideal for a personal instance. Set **`DATABASE_URL`** (e.g.
`postgres://user:pass@host:5432/linkbank`) and it runs on **PostgreSQL** instead
— no code change, migrations run on boot. Handy for multi-user or larger
deployments, or if you already run Postgres. With Docker:

```
docker compose --profile postgres up -d   # app + a Postgres service
```

(uncomment the `DATABASE_URL` line in `docker-compose.yml` first).

### Moving an existing SQLite instance to Postgres

1. Point the app at the empty Postgres database once so it creates the schema:
   `DATABASE_URL=postgres://… node build` (start it, then stop it).
2. Copy your data across:

   ```
   DATABASE_URL=postgres://… npm run migrate:pg -- path/to/data/linkbank.db
   ```

   It preserves ids and realigns Postgres' sequences; it's safe to re-run.
3. Start the app with `DATABASE_URL` set — you're on Postgres.

> SQLite must live on **local disk**, not a CIFS/NFS mount — network file locks
> break SQLite. (Postgres has no such constraint.)

## First run

On a fresh instance the first visit shows a one-time **setup** screen to create
the admin account. After that, `/login` guards everything. Set `REGISTRATION`
to control sign-ups: `closed` (default), `open`, or `invite` (with
`INVITE_CODE`). Passwords use Node's built-in scrypt; sessions are random
tokens stored hashed, delivered as httpOnly cookies.

**Set `ORIGIN`** in production to the exact URL users visit — login and CSRF
protection depend on it.

## Saving from your browser & phone

Links you capture from outside the app land in an **Inbox** folder (created on
first use), so you can triage them later.

- **Browser extension** (`extension/` — Brave/Chrome/Edge + Firefox 121+). Create
  an access token under **Account → Access tokens**, paste it into the
  extension's options along with your LinkBank URL, and then the toolbar button
  or the right-click **Save to LinkBank** saves the current tab/link silently.
  See `extension/README.md`.
- **PWA share target** (mobile / desktop). Install LinkBank as an app (browser →
  "Install" / "Add to Home Screen"); it then appears in the OS **Share** sheet.
  Sharing a page to LinkBank saves it to your Inbox. Needs the production build
  and an HTTPS origin (below).

Both funnel through `POST /api/ingest`, which accepts either your session cookie
or `Authorization: Bearer <token>` and is CORS-enabled for the extension.
Tokens are stored hashed and revocable at any time.

## Running in production

For the PWA (service worker + installability), correct secure cookies, and
performance, run the **built** app rather than the Vite dev server:

```
npm run build
ORIGIN=https://your.domain \
  PROTOCOL_HEADER=x-forwarded-proto \
  HOST_HEADER=x-forwarded-host \
  node build          # serves on :3000 (set PORT to change)
```

Point your reverse proxy at that port. `ORIGIN` must match the public URL, and
`PROTOCOL_HEADER`/`HOST_HEADER` let the app trust the proxy's forwarded https so
Secure cookies are set correctly. (The `docker compose` setup does this for you.)

## Accessibility & display

The top bar has a **dark/light** toggle and **A− / A+** controls that scale the
whole interface — text, icons and tiles — for easier reading. Both preferences
are saved in the browser and applied before first paint (no flash on reload).

## Users & access

Admins get a **Users & access** page (shield icon, top-right) to manage the
instance:

- **Invite links.** Generate a one-time link (optionally pre-set an email, a
  note, an expiry, or "make this user an admin"); the invitee opens it and
  chooses their own username and password. Only the link's hash is stored, so a
  leaked database can't yield a usable invite, and the raw link is shown once.
  Invites work regardless of the `REGISTRATION` setting — so you can keep public
  sign-up `closed` and still add people.
- **Roles.** Grant or revoke admin. The last remaining admin can't be demoted or
  deleted, so you can't lock yourself out.
- **Deleting users** is *block-unless-empty*: a user who still owns bookmarks or
  folders (including trashed ones) can't be removed until those are cleared —
  nothing is silently destroyed. Deleting an empty user also cleans up their
  root folder, sessions and invites.

Every signed-in user has an **Account** page (person icon) to change their own
email and password.

`REGISTRATION` (`open` / `invite` / `closed`) still governs the public
`/register` page; the shared `INVITE_CODE` applies only there. Admin-generated
invite links are the recommended way to add users.

## Security

- **Passwords** are hashed with scrypt (salted). **Sessions** are random tokens
  stored hashed, in httpOnly + SameSite cookies (Secure over https).
- **Bookmark notes are encrypted at rest** with AES-256-GCM, so a leaked
  database file or backup can't reveal passwords kept in notes. Provide
  `NOTES_ENCRYPTION_KEY` (`openssl rand -base64 32`) via the environment — keep
  it *out* of the data volume so a backup leak doesn't include the key. If you
  don't set one, a key is generated into `<data>/notes.key` on first run (works
  out of the box, but only protects a partial leak). **Losing the key makes
  encrypted notes unrecoverable — back it up.**

  What this protects: someone who obtains the raw DB / a backup. What it can't:
  a compromised *running* server, which by necessity holds the key to show you
  your notes. Titles and URLs are not encrypted (needed for display and search).

### Favicons for self-signed LAN sites

The favicon fetcher validates TLS certificates like any browser, so internal
`https` services with self-signed certs won't return an icon by default. If you
bookmark such sites, set `FAVICON_ALLOW_INSECURE_TLS=1` to skip cert
verification **for favicon fetches only** — it doesn't weaken TLS anywhere else
in the app. Non-standard ports work with or without this flag; they're part of
the cache key and fetch target.
After enabling it, use a bookmark's **Reset to automatic** to re-fetch an icon
that previously failed (failures are cached for a day).

### Link health (link-rot)

A background sweep (every `LINK_CHECK_INTERVAL_HOURS`, default 24; `0` disables
it) plus an on-demand **Check now** button probe each bookmark and flag dead
links in the **Broken** view, with a warning badge on the tile. The rule is
"reachable = healthy": only DNS/connection/timeout errors, `404`/`410`, and
`5xx` count as broken — auth walls (`401`/`403`) and redirects are fine. HEAD is
tried first, but a broken-looking HEAD is confirmed with a real GET, so servers
that mishandle HEAD aren't wrongly flagged. Self-signed https honours
`FAVICON_ALLOW_INSECURE_TLS`.

- **Exempt a link** (e.g. a site only reachable from certain networks) from the
  edit dialog, the tile's right-click menu, or the broken-links row. Exempt
  links are never checked or flagged.
- **Note cards:** set a bookmark's URL to `note` or `memo` to make a notes-only
  card — clicking it shows the note instead of navigating, and it's never
  link-checked.

## Roadmap

- [x] **Phase 1** — normalised tree, SQLite, read-only tree UI, container
- [x] **Phase 2** — bookmarks + views, search across folders & bookmarks
- [x] **Phase 3** — editing: create/rename/move/delete, drag-and-drop
- [x] **Phase 4** — multi-user auth (scrypt sessions), first-run setup
- [x] **Phase 5** — notes encrypted at rest (AES-256-GCM)
- [x] **Phase 6** — import/export (Netscape HTML), trash + undo
- [x] **Phase 7** — self-contained favicon fetching + cache
- [x] **Phase 8** — link-rot checking (scheduled + on-demand, broken-links view)
- [x] **Phase 9** — PostgreSQL dialect + SQLite→Postgres migration
- [x] **Phase 10** — tags: coloured labels, sidebar list, per-tag pages, search
- [x] **Phase 11** — bulk operations: multi-select, move / tag / open / delete
- [x] **Phase 12** — keyboard navigation, type-ahead, "?" cheat sheet, marquee select
- [x] **Phase 13** — admin UI: invite links, roles, safe user deletion, self-service account
- [x] **Phase 14** — capture: PWA share target, browser extension, token API, Inbox

## Migrating from the old LinkBank

`scripts/seed.ts` imports a jsTree blob (the old `usertrees` format) into the
new `branches` table — the same logic used to migrate the original instance.

## License

[AGPL-3.0-or-later](./LICENSE). Use it, host it, modify it; if you run a
modified version as a service, share your changes.
