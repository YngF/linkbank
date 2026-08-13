// Self-contained so it works both as a Chrome MV3 service worker and a Firefox
// MV3 background script (no importScripts, which is worker-only).
const ext = globalThis.browser ?? globalThis.chrome;

async function getConfig() {
  const { baseUrl, token } = await ext.storage.local.get(['baseUrl', 'token']);
  return { baseUrl: (baseUrl || '').replace(/\/+$/, ''), token: token || '' };
}

async function saveLink({ url, title, tags }) {
  const { baseUrl, token } = await getConfig();
  if (!baseUrl || !token) throw new Error('Not set up — open the extension options.');
  const res = await fetch(baseUrl + '/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ url, title, tags })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Save failed (' + res.status + ')');
  return data;
}

// Right-click → "Save to LinkBank" on any page or link.
ext.runtime.onInstalled.addListener(() => {
  ext.contextMenus.create({ id: 'linkbank-save', title: 'Save to LinkBank', contexts: ['page', 'link'] });
});

ext.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'linkbank-save') return;
  const url = info.linkUrl || info.pageUrl || (tab && tab.url);
  const title = info.linkUrl ? info.linkText || info.linkUrl : (tab && tab.title) || url;
  try {
    await saveLink({ url, title });
    flashBadge('✓', '#22a06b');
  } catch (e) {
    flashBadge('!', '#d23f3f');
  }
});

function flashBadge(text, color) {
  try {
    ext.action.setBadgeBackgroundColor({ color });
    ext.action.setBadgeText({ text });
    setTimeout(() => ext.action.setBadgeText({ text: '' }), 2500);
  } catch (e) {
    /* ignore */
  }
}
