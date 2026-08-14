# Developing LinkBank on Windows

How to set up a Windows PC to edit, build, and publish LinkBank — **natively**,
with no Linux layer. You edit code and push here; GitHub Actions builds the
Docker image; the running instance lives on your server (e.g. TrueNAS). The dev
machine never needs the database, `.env`, or certificates.

## Prerequisites

- **Git for Windows** — <https://git-scm.com/download/win>
- **Node.js LTS** — <https://nodejs.org/> (includes npm)

Check both from PowerShell:

```powershell
git --version
node --version
```

Commands below use **PowerShell**; Git Bash works too and the commands are the
same except where noted.

## 1. Configure Git (one-time on this machine)

```powershell
git config --global user.name  "Yngve Fagerheim"
git config --global user.email "yngve.fagerheim@sikri.no"
git config --global core.autocrlf false
```

`core.autocrlf false` tells Git to leave line endings as committed (Unix LF).
The repo also ships a `.gitattributes` that pins text files to LF regardless of
this setting — together they stop Windows from rewriting files to CRLF, which
would otherwise show every file as "modified" and break `gen-selfsigned-cert.sh`
when it runs on the Linux/TrueNAS side.

## 2. Create an SSH key and add it to GitHub

Each machine gets its own key.

```powershell
ssh-keygen -t ed25519 -C "yngve.fagerheim@sikri.no"
```

Press Enter through the prompts (default location
`C:\Users\<you>\.ssh\id_ed25519`; a passphrase is optional). Print the **public**
key and copy the whole line:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

(In Git Bash: `cat ~/.ssh/id_ed25519.pub`.)

On GitHub → **Settings → SSH and GPG keys → New SSH key**, title it e.g.
"Windows PC", paste the key, and save. Then test:

```powershell
ssh -T git@github.com
```

Type `yes` to trust the fingerprint the first time. Success is
`Hi YngF! You've successfully authenticated...` (it then notes GitHub doesn't
provide shell access — that's expected; SSH is only used for Git).

## 3. Clone the repo

```powershell
mkdir C:\code; cd C:\code
git clone git@github.com:YngF/linkbank.git
cd linkbank
```

## 4. Install dependencies and verify the build

```powershell
npm install
npm run build
npx svelte-check
```

`better-sqlite3` ships prebuilt Windows binaries, so `npm install` doesn't need
a C++ compiler. A clean `build` and zero `svelte-check` errors means you're set.

## 5. Everyday workflow

```powershell
# edit files...
npm run build                       # sanity-check before pushing
git add -A
git commit -m "Describe the change"
git push
```

To cut a release (builds + pushes the Docker image and creates a GitHub Release):

```powershell
# bump "version" in package.json first, then:
git tag v1.1.0
git push origin v1.1.0
```

## Running the app locally (optional)

You don't need this just to edit and push, but to run a dev server on Windows:

```powershell
Copy-Item .env.example .env
npm run dev
```

Then open the URL it prints (usually <http://localhost:5173>). This uses a local
SQLite file under `.\data` — separate from your production instance.

## Troubleshooting

- **`Permission denied (publickey)` on push** — the SSH key isn't being used.
  Re-run `ssh -T git@github.com`; if that fails, the public key wasn't added to
  GitHub, or the remote is using HTTPS. Check with `git remote -v`; fix with
  `git remote set-url origin git@github.com:YngF/linkbank.git`.
- **Files show as modified right after cloning** — a line-ending mismatch. With
  `.gitattributes` in place this shouldn't happen; if it does, run
  `git add --renormalize .` once and commit.
- **`npm install` fails building `better-sqlite3`** — you're likely on a Node
  version without a matching prebuilt binary. Install the current LTS from
  nodejs.org and retry; as a last resort, install the "Desktop development with
  C++" workload from the Visual Studio Build Tools so it can compile.
