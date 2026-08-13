// Shared helpers for the LinkBank extension. Works in Chrome/Brave/Edge and
// Firefox (both expose a `chrome`/`browser` namespace with promise support).
const ext = globalThis.browser ?? globalThis.chrome;

async function getConfig() {
  const { baseUrl, token } = await ext.storage.local.get(['baseUrl', 'token']);
  return { baseUrl: (baseUrl || '').replace(/\/+$/, ''), token: token || '' };
}

/** Save a link to LinkBank's Inbox via the token-authed ingest endpoint. */
async function saveLink({ url, title, tags }) {
  const { baseUrl, token } = await getConfig();
  if (!baseUrl || !token) {
    throw new Error('Not set up — open the extension options and paste your LinkBank URL + token.');
  }
  const res = await fetch(baseUrl + '/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ url, title, tags })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Save failed (' + res.status + ')'));
  return data;
}
