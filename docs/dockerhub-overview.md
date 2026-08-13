# LinkBank

A fast, self-hostable bookmark manager with a proper nested folder tree. One
container, one SQLite file, no external services — runs happily on a Raspberry
Pi, a NAS, or any small VPS.

![LinkBank](https://raw.githubusercontent.com/YngF/linkbank/main/docs/screenshot.jpg)

## Features

- Nested **folder tree** with drag-and-drop, rename, move/copy, trash + undo
- **Search** across folders and bookmarks; **tags** with coloured labels
- **Multi-user** — first-run admin setup, invite links, roles, safe deletion
- **Capture** from a browser extension and a PWA share target (→ Inbox)
- **Link-rot checking** (scheduled + on-demand) with a Broken-links view
- **Encrypted notes** at rest (AES-256-GCM); import/export (Netscape HTML)
- **SQLite or PostgreSQL** — same image, chosen by an env var
- Dark/light theme and whole-UI zoom

## Quick start

```bash
docker run -d --name linkbank \
  -p 3000:3000 \
  -v linkbank-data:/app/data \
  -e ORIGIN=https://links.example.com \
  -e PROTOCOL_HEADER=x-forwarded-proto \
  -e HOST_HEADER=x-forwarded-host \
  yngf73/linkbank:latest
```

Or with Compose — grab `docker-compose.yml` from the repo, set `ORIGIN`, and
`docker compose up -d`. The whole database is the single file under the
`/app/data` volume; back that up and you're safe. Migrations run automatically
on start, so upgrades are just `docker compose pull && docker compose up -d`.

On first visit you'll get a one-time setup screen to create the admin account.

## Supported tags & architectures

Images are multi-arch: **`linux/amd64`** and **`linux/arm64`**.

- `latest` — the newest release
- `1`, `1.2`, `1.2.3` — pin to a major / minor / exact version

## Key environment variables

| Variable | Purpose |
| --- | --- |
| `ORIGIN` | **Required in production** — the exact public URL (login/CSRF depend on it). |
| `PROTOCOL_HEADER` / `HOST_HEADER` | `x-forwarded-proto` / `x-forwarded-host` behind a TLS proxy so Secure cookies work. |
| `DATABASE_URL` | A `postgres://…` URL to use PostgreSQL instead of SQLite. |
| `REGISTRATION` | `open` / `invite` / `closed` (default `closed`). |
| `NOTES_ENCRYPTION_KEY` | 32-byte key (`openssl rand -base64 32`) to encrypt notes at rest. |
| `LINK_CHECK_INTERVAL_HOURS` | Link-rot sweep interval (`0` disables; default 24). |
| `FAVICON_ALLOW_INSECURE_TLS` | `1` to fetch favicons from self-signed LAN https sites. |
| `TLS_KEY_PATH` / `TLS_CERT_PATH` | Serve HTTPS directly with a self-signed cert (no proxy). |

> SQLite must live on local disk / a named volume, **not** a CIFS/NFS mount —
> network file locking breaks SQLite. Postgres has no such constraint.

## Links

- **Source & full docs:** https://github.com/YngF/linkbank
- **Deployment guide** (reverse proxy, Postgres, LAN HTTPS): see `DOCKER.md` in the repo

## License

[AGPL-3.0-or-later](https://github.com/YngF/linkbank/blob/main/LICENSE)
