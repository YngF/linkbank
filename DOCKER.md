# LinkBank on Docker

Published image: **`yngf/linkbank`** on Docker Hub (multi-arch: `amd64` + `arm64`).

---

## Running it (for anyone deploying LinkBank)

### docker compose (recommended)

Grab `docker-compose.yml` from the repo and:

```bash
docker compose up -d
```

That pulls `yngf/linkbank:latest`, stores the SQLite database in `./data`, and
serves on port 3000. Behind a reverse proxy set at least `ORIGIN` (see below).

Update to a newer version later:

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
  yngf/linkbank:latest
```

### Key environment variables

| Variable | Purpose |
| --- | --- |
| `ORIGIN` | **Required in production.** The exact public URL (login/CSRF depend on it). |
| `PROTOCOL_HEADER` / `HOST_HEADER` | Set to `x-forwarded-proto` / `x-forwarded-host` behind a TLS proxy so Secure cookies work. |
| `NOTES_ENCRYPTION_KEY` | 32-byte key (`openssl rand -base64 32`) to encrypt notes at rest. Keep it out of the data volume. |
| `DATABASE_URL` | Set to a `postgres://…` URL to use PostgreSQL instead of SQLite. |
| `REGISTRATION` | `open` / `invite` / `closed` (default closed; admins can always invite). |
| `LINK_CHECK_INTERVAL_HOURS` | Link-rot sweep interval (0 disables). |
| `FAVICON_ALLOW_INSECURE_TLS` | `1` to fetch favicons from self-signed LAN https sites. |

| `TLS_KEY_PATH` / `TLS_CERT_PATH` | Point at a PEM key + cert to serve **HTTPS directly** (LAN + self-signed, no proxy). See below. |

Migrations run automatically on container start, so upgrades just work.

> **SQLite must be on a local/named volume, not a CIFS/NFS mount** — network
> file locking breaks SQLite. Postgres has no such constraint.

---

## Running on a LAN over HTTPS (self-signed cert)

If you're running LinkBank purely on a home/office network and want `https://`
without a public domain or reverse proxy, the app can terminate TLS itself.

**1. Generate a self-signed certificate** (list every hostname/IP you'll type
into the address bar — browsers match only the SubjectAltName, not the CN):

```bash
./scripts/gen-selfsigned-cert.sh linkbank.lan 10.0.23.103
```

That writes `./certs/linkbank.key` and `./certs/linkbank.crt`.

**2a. With docker compose** — in `docker-compose.yml`, uncomment the certs
volume and the TLS block, and set `ORIGIN` to the https URL you'll visit:

```yaml
    volumes:
      - ./data:/app/data
      - ./certs:/app/certs:ro
    environment:
      ORIGIN: https://10.0.23.103:3000
      TLS_KEY_PATH: /app/certs/linkbank.key
      TLS_CERT_PATH: /app/certs/linkbank.crt
      # remove PROTOCOL_HEADER / HOST_HEADER — those are for a proxy in front
```

```bash
docker compose up -d
```

**2b. With docker run:**

```bash
docker run -d --name linkbank \
  -p 3000:3000 \
  -v linkbank-data:/app/data \
  -v "$(pwd)/certs:/app/certs:ro" \
  -e ORIGIN=https://10.0.23.103:3000 \
  -e TLS_KEY_PATH=/app/certs/linkbank.key \
  -e TLS_CERT_PATH=/app/certs/linkbank.crt \
  yngf/linkbank:latest
```

**2c. Without Docker** (`node build` users) — the same env vars work with the
bundled server entry:

```bash
TLS_KEY_PATH=./certs/linkbank.key \
TLS_CERT_PATH=./certs/linkbank.crt \
ORIGIN=https://10.0.23.103:3000 \
node server.js
```

**3. Trust the cert.** Browsers will warn until you import `linkbank.crt` as a
trusted authority on each device (or click through the warning). Import it via
your OS keychain / browser certificate settings.

Notes:

- Set `ORIGIN` to the **exact** URL (scheme + host + port) users visit — login
  and CSRF depend on it matching the browser's address bar.
- `TLS_KEY_PATH`/`TLS_CERT_PATH` and a reverse proxy are mutually exclusive
  strategies. If you already terminate TLS at nginx/Caddy, leave the TLS vars
  unset and use `PROTOCOL_HEADER`/`HOST_HEADER` instead.
- With no TLS vars set, the container behaves exactly as before (plain HTTP on
  3000) — this feature is fully opt-in.
- `FAVICON_ALLOW_INSECURE_TLS=1` is unrelated: that governs whether LinkBank
  trusts *other* self-signed sites when fetching their favicons.

---

## Publishing new versions (for the maintainer)

Images are built and pushed automatically by GitHub Actions
(`.github/workflows/docker-publish.yml`) whenever you push a `vX.Y.Z` tag.

### One-time setup

1. Push this repo to GitHub (e.g. `github.com/yngf/linkbank`).
2. On Docker Hub → **Account Settings → Personal access tokens**, create a token
   with **Read & Write** scope.
3. In the GitHub repo → **Settings → Secrets and variables → Actions**, add:
   - `DOCKERHUB_USERNAME` — your Docker Hub username (`yngf`)
   - `DOCKERHUB_TOKEN` — the access token from step 2
4. Create the `yngf/linkbank` repository on Docker Hub (or it's created on first push).

### Cut a release

```bash
# bump "version" in package.json to match, commit, then:
git tag v1.0.0
git push origin v1.0.0
```

The workflow builds `linux/amd64` + `linux/arm64` and pushes these tags:
`1.0.0`, `1.0`, `1`, and `latest`.

You can also trigger it by hand from the **Actions** tab (*Run workflow*).

### Manual build & push (no CI)

Needs Docker with Buildx and `docker login`:

```bash
docker buildx create --use   # once, if you don't have a buildx builder
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg VERSION=1.0.0 \
  -t yngf/linkbank:1.0.0 -t yngf/linkbank:latest \
  --push .
```

> The `arm64` build compiles `better-sqlite3` under emulation and is slow on an
> x86 host. Building on an ARM machine (or a native ARM runner) is much faster.
