# Publishing LinkBank to GitHub

A step-by-step guide to get the LinkBank source onto GitHub and turn on the
automatic multi-arch Docker builds. Written for a **headless Linux** box (no
desktop GUI), so authentication uses an **SSH key** rather than a browser login.

The process is two phases: **push the code** (steps 1–4), then **enable the
automatic Docker build** (steps 5–7). Steps 1–6 are one-time; after that,
releasing a new version is just steps 7 onward.

---

## Phase 1 — Push the code to GitHub

### 1. Check git is installed and set your identity

```bash
git --version                     # if "command not found": sudo apt install git
git config --global user.name  "Yngve Fagerheim"
git config --global user.email "yngve.fagerheim@sikri.no"
```

The name/email just label your commits. You only set them once per machine.

### 2. Create an empty repo on GitHub

In a browser (on any device): github.com → the **+** top-right → **New repository**.

- Name: `linkbank`
- Public or Private — either works for Docker publishing.
- **Do NOT** add a README, .gitignore, or license. Leave it completely empty —
  you already have those files locally, and an empty repo avoids a conflict on
  your first push.
- Click **Create repository**.

### 3. Authenticate with an SSH key (headless method)

Because the machine has no GUI, the browser-based logins don't work here. An SSH
key is the reliable path on a headless server, and once set up every future push
is passwordless.

**a. Generate a key** (skip if you already have `~/.ssh/id_ed25519.pub`):

```bash
ssh-keygen -t ed25519 -C "yngve.fagerheim@sikri.no"
```

Press Enter to accept the default path (`~/.ssh/id_ed25519`). A passphrase is
optional — press Enter twice to skip it, or set one for extra safety.

**b. Print the PUBLIC key** and copy the whole line:

```bash
cat ~/.ssh/id_ed25519.pub
```

It looks like `ssh-ed25519 AAAAC3Nza... yngve.fagerheim@sikri.no`. Copy the
entire output. (Only ever share the `.pub` file — never the private key, the
one without `.pub`.)

**c. Add it to GitHub:** in a browser, go to **Settings → SSH and GPG keys →
New SSH key**. Give it a title (e.g. "linkbank server"), leave the type as
"Authentication Key", paste the public key, and click **Add SSH key**.

**d. Test the connection** from the server:

```bash
ssh -T git@github.com
```

The first time it asks to trust GitHub's fingerprint — type `yes`. Success looks
like: `Hi <username>! You've successfully authenticated...` (it's normal that it
then says GitHub "does not provide shell access" — that just means SSH is only
used for git, which is exactly what we want).

### 4. Turn your project folder into a repo and push it

`cd` into the folder that holds `package.json` and the `Dockerfile` (your latest
LinkBank source), then:

```bash
git init -b main
git add .
git commit -m "LinkBank: initial commit with Docker + LAN HTTPS support"
git remote add origin git@github.com:<your-username>/linkbank.git
git push -u origin main
```

Replace `<your-username>` with your GitHub username. Note the remote uses the
**SSH form** `git@github.com:...` (not `https://...`) so it uses the key from
step 3.

Refresh the GitHub page — your files should all be there.

> The included `.gitignore` excludes `node_modules`, `.env`, `data/`, `certs/`,
> etc., so no secrets or bulky folders get uploaded. After pushing, double-check
> that no `.env` or `certs/` file appears in the file list on GitHub.

---

## Phase 2 — Enable automatic Docker builds

### 5. Create a Docker Hub access token

On hub.docker.com → your avatar → **Account Settings → Personal access tokens →
Generate new token**, scope **Read & Write**, and copy it.

### 6. Add two secrets to the GitHub repo

On the repo page: **Settings → Secrets and variables → Actions → New repository
secret**. Add:

- `DOCKERHUB_USERNAME` → your Docker Hub username (`yngf73`)
- `DOCKERHUB_TOKEN` → the token from step 5

### 7. Cut a release to trigger the build

```bash
git tag v1.0.0
git push origin v1.0.0
```

Pushing a `vX.Y.Z` tag fires the workflow (`.github/workflows/docker-publish.yml`).
Watch it under the repo's **Actions** tab. The first run is slow because the
`arm64` layer builds under emulation. When it finishes green,
`yngf73/linkbank:latest` (plus `1.0.0`, `1.0`, `1`) is live on Docker Hub.

---

## Releasing future versions

Steps 1–6 are one-time. After that, each new release is:

```bash
# 1. bump "version" in package.json, then:
git add -A
git commit -m "Release v1.0.1: <what changed>"
git push
git tag v1.0.1
git push origin v1.0.1
```

The tag push rebuilds and republishes the image automatically.

## Everyday git, for reference

```bash
git status                 # what's changed
git add -A                 # stage all changes
git commit -m "message"    # save a snapshot
git push                   # send commits to GitHub
```

## Troubleshooting

- **`Permission denied (publickey)` on push** — the SSH key isn't being used.
  Re-run `ssh -T git@github.com`; if that fails, the public key wasn't added to
  GitHub correctly (step 3c), or your remote uses `https://` instead of the
  `git@github.com:` form (check with `git remote -v`; fix with
  `git remote set-url origin git@github.com:<username>/linkbank.git`).
- **`Repository not found`** — the username or repo name in the remote URL is
  wrong, or the repo is private and the key belongs to a different account.
- **Push rejected / "updates were rejected"** — the GitHub repo wasn't empty
  (you added a README/license in step 2). Easiest fix: `git pull --rebase origin
  main` then push again.
