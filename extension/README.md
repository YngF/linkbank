# LinkBank browser extension

Save the current tab (or any link) straight to your LinkBank **Inbox** — no tab
switching, no copy-paste.

## Setup

1. In LinkBank, go to **Account → Access tokens**, create a token, and copy it.
2. Load the extension (below), open its **Options**, and enter your LinkBank URL
   (e.g. `https://yngf.no`) and the token. Click **Test** to confirm, then
   **Save**.
3. Click the toolbar icon to save the current page, or right-click a page/link
   and choose **Save to LinkBank**.

## Install (unpacked)

**Brave / Chrome / Edge**
1. Go to `chrome://extensions` (or `brave://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select this `extension/` folder.

**Firefox** (142+)
- *Temporary (dev):* `about:debugging#/runtime/this-firefox` → **Load Temporary
  Add-on…** → select `manifest.json`. Cleared on restart.
- *Permanent:* sign it once (automated, free) and install the `.xpi` — see
  [`SIGNING.md`](./SIGNING.md).

## How it works

The extension POSTs to `POST /api/ingest` on your LinkBank with
`Authorization: Bearer <token>`. That endpoint is token-authed and CORS-enabled,
so no cookies or extra browser permissions are needed. Tokens are stored hashed
on the server and can be revoked any time from **Account → Access tokens**.
