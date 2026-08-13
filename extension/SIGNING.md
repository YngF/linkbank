# Signing the extension for Firefox (permanent install)

Chrome/Brave/Edge run the unpacked extension straight from the folder. Firefox
only keeps unsigned add-ons until you restart — for a **permanent** install you
need a Mozilla-signed `.xpi`. For a self-hosted personal add-on the right route
is **unlisted (self-distribution) signing**: it's automated (no review), not
listed on the public store, and produces an `.xpi` you install yourself.

The extension already passes `web-ext lint` with **0 errors**, so signing will
go through.

## One-time: get Mozilla API credentials

1. Sign in / create an account at <https://addons.mozilla.org>.
2. Go to <https://addons.mozilla.org/developers/addon/api/key/>.
3. Generate credentials — you'll get a **JWT issuer** (looks like
   `user:12345:67`) and a **JWT secret** (a long hex string). Copy both.

## Sign

From this `extension/` folder:

```
npm install          # first time only — installs web-ext locally
WEB_EXT_API_KEY="<JWT issuer>" \
WEB_EXT_API_SECRET="<JWT secret>" \
  npm run sign
```

(`npm run sign` = `web-ext sign --channel=unlisted`.) web-ext uploads the add-on
to AMO, waits for automated signing, and drops the signed file in
`web-ext-artifacts/linkbank-<version>.xpi`.

> If you don't want a local install, run it with `npx`:
> `WEB_EXT_API_KEY=… WEB_EXT_API_SECRET=… npx web-ext sign --channel=unlisted`

## Install the signed .xpi in Firefox

1. Open `about:addons`.
2. Click the gear ⚙ → **Install Add-on From File…**
3. Pick `web-ext-artifacts/linkbank-<version>.xpi`. It stays installed across
   restarts.

Then set it up: **Options** → your LinkBank URL (`https://yngf.no`) + an access
token from **Account → Access tokens**.

## Updating later

AMO rejects re-signing the **same** version, so bump `"version"` in both
`manifest.json` and `package.json` (e.g. `1.0.1`) before signing a new build,
then re-run `npm run sign` and install the new `.xpi` the same way.

## Test without signing (temporary)

`npm start` (=`web-ext run`) launches a scratch Firefox with the extension
loaded, handy for development. `about:debugging` → *Load Temporary Add-on* works
too, but is cleared on restart.
