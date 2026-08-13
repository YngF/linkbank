# LinkBank

A fast, self-hostable bookmark manager with a proper nested folder tree. One
container, one SQLite file, no external services.

![LinkBank](docs/screenshot.jpg)

## Why

Most bookmark managers are either a browser-locked list or a heavy multi-
container stack. LinkBank aims for the Linkding end of the spectrum — a single
lightweight container you can run on a Raspberry Pi or a NAS — while keeping a
real nested folder tree and a keyboard-driven UI.

## Features

- **Nested folder tree** with drag-and-drop, rename, move, copy, and trash + undo.
- **Search** across folders and bookmarks; **tags** with coloured labels and
  per-tag pages.
- **Multi-user** with first-run admin setup, invite links, roles, and safe
  user deletion.
- **Capture from anywhere** — browser extension (Chrome/Brave/Edge + Firefox)
  and a PWA share target on mobile/desktop, both landing in an Inbox.
- **Link-rot checking** — scheduled + on-demand, with a Broken-links view.
- **Encrypted notes** at rest (AES-256-GCM), import/export (Netscape HTML),
  self-contained favicon fetching.
- **SQLite or PostgreSQL** — same code, chosen by an env var.
- **Accessible** — dark/light toggle and whole-UI zoom, saved per browser.

## Quick start (Docker)

The published image is [`yngf73/linkbank`](https://hub.docker.com/r/yngf73/linkbank)
on Docker Hub — multi-arch, so it runs on both `amd64` and `arm64` (Raspberry
Pi, Apple Silicon, most NAS boxes).

### docker compose (recommended)

Grab [`docker-compose.yml`](./docker-compose.yml) from the repo, set `ORIGIN` to
the URL you'll actually use, and:

```bash
docker compose up -d
# open http://localhost:3000
```

Update to a newer release later:

```bash
docker compose pull && docker compose up -d
```

### docker run (one-off)

```bash
docker run -d --name linkbank \
  -p 3000:3000 \
  -v linkbank-data:/app/data \
  -e ORIGIN=https://links.example.com \
  -e PROTOCOL_HEADER=x-forwarded-proto \
  -e HOST_HEADER=x-forwarded-host \
  yngf73/linkbank:latest
```

The entire database is the one file under the mounted `/app/data` volume. Back
that up and you've backed up everything. Migrations run automatically on start,
so upgrades just work.

### Key environment variables

| Variable | Purpose |
| --- | --- |
| `ORIGIN` | **Required in production.** The exact public URL (login/CSRF depend on it matching the browser). |
| `PROTOCOL_HEADER` / `HOST_HEADER` | Set to `x-forwarded-proto` / `x-forwarded-host` behind a TLS reverse proxy so Secure cookies work. |
| `DATABASE_URL` | Set to a `postgres://…` URL to use PostgreSQL instead of SQLite. |
| `REGISTRATION` | `open` / `invite` / `closed` (default `closed`; admins can always invite). |
| `NOTES_ENCRYPTION_KEY` | 32-byte key (`openssl rand -base64 32`) to encrypt notes at rest. Keep it out of the data volume. |
| `LINK_CHECK_INTERVAL_HOURS` | Link-rot sweep interval in hours (`0` disables it; default 24). |
| `FAVICON_ALLOW_INSECURE_TLS` | `1` to fetch favicons from self-signed LAN https sites. |
| `TLS_KEY_PATH` / `TLS_CERT_PATH` | Serve HTTPS directly with a self-signed cert (no reverse proxy) — see below. |

> **SQLite must live on local disk / a named volume**, not a CIFS/NFS mount —
> network file locking breaks SQLite. Postgres has no such constraint.

**More Docker detail** — including running behind a reverse proxy, the bundled
Postgres profile, publishing your own image, and running on a **LAN over HTTPS
with a self-signed certificate** (no proxy needed) — is in
[**DOCKER.md**](./DOCKER.md).

## Running from source (dev)

```bash
npm install
cp .env.example .env
npm run dev
```

For a production build without Docker:

```bash
npm run build
ORIGIN=https://your.domain \
  PROTOCOL_HEADER=x-forwarded-proto \
  HOST_HEADER=x-forwarded-host \
  node server.js       # serves on :3000 (set PORT to change)
```

`node server.js` is a thin wrapper around the SvelteKit build: with no TLS env
vars it behaves exactly like `node build`; set `TLS_KEY_PATH`/`TLS_CERT_PATH` to
serve HTTPS directly.

## How it works

- **SvelteKit** (Node adapter) — server and UI in one app, one origin, no CORS.
- **SQLite via Kysely** — the schema is a normalised folder tree (`branches`
  self-referencing `parent_id`) plus `bookmarks`, `tags`, and `users`. The whole
  tree loads in one recursive CTE. Kysely means PostgreSQL is a dialect swap,
  with no query rewrites.
- **Migrations run on boot** — a fresh container provisions its own schema.
- **No hardcoded secrets** — session and notes-encryption keys are generated on
  first run, configurable via env.

## Database: SQLite or PostgreSQL

By default LinkBank uses **SQLite** — one file at `DATABASE_PATH`, zero setup,
ideal for a personal instance. Set **`DATABASE_URL`** (e.g.
`postgres://user:pass@host:5432/linkbank`) and it runs on **PostgreSQL** instead
— no code change, migrations run on boot. Handy for multi-user or larger
deployments, or if you already run Postgres. With Docker:

```bash
docker compose --profile postgres up -d   # app + a Postgres service
```

(uncomment the `DATABASE_URL` line in `docker-compose.yml` first).

### Moving an existing SQLite instance to Postgres

1. Point the app at the empty Postgres database once so it creates the schema:
   `DATABASE_URL=postgres://… node server.js` (start it, then stop it).
2. Copy your data across:

   ```bash
   DATABASE_URL=postgres://… npm run migrate:pg -- path/to/data/linkbank.db
   ```

   It preserves ids and realigns Postgres' sequences; it's safe to re-run.
3. Start the app with `DATABASE_URL` set — you're on Postgres.

## First run

On a fresh instance the first visit shows a one-time **setup** screen to create
the admin account. After that, `/login` guards everything. Set `REGISTRATION`
to control sign-ups: `closed` (default), `open`, or `invite` (with
`INVITE_CODE`). Passwords use Node's built-in scrypt; sessions are random tokens
stored hashed, delivered as httpOnly cookies.

**Set `ORIGIN`** in production to the exact URL users visit — login and CSRF
protection depend on it.

## Saving from your browser & phone

Links you capture from outside the app land in an **Inbox** folder (created on
first use), so you can triage them later.

- **Browser extension** (`extension/` — Brave/Chrome/Edge + Firefox). Create an
  access token under **Account → Access tokens**, paste it into the extension's
  options along with your LinkBank URL, and the toolbar button or the right-click
  **Save to LinkBank** saves the current tab/link silently. See
  `extension/README.md`.
- **PWA share target** (mobile / desktop). Install LinkBank as an app (browser →
  "Install" / "Add to Home Screen"); it then appears in the OS **Share** sheet.
  Sharing a page to LinkBank saves it to your Inbox. Needs the production build
  and an HTTPS origin.

Both funnel through `POST /api/ingest`, which accepts either your session cookie
or `Authorization: Bearer <token>` and is CORS-enabled for the extension. Tokens
are stored hashed and revocable at any time.

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
in the app. Non-standard ports work with or without this flag. After enabling
it, use a bookmark's **Reset to automatic** to re-fetch an icon that previously
failed (failures are cached for a day).

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

## License

[AGPL-3.0-or-later](./LICENSE). Use it, host it, modify it; if you run a
modified version as a service, share your changes.
