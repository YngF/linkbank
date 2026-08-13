const $ = (id) => document.getElementById(id);

(async () => {
  const { baseUrl, token } = await ext.storage.local.get(['baseUrl', 'token']);
  if (baseUrl) $('baseUrl').value = baseUrl;
  if (token) $('token').value = token;
})();

$('save').addEventListener('click', async () => {
  const baseUrl = $('baseUrl').value.trim().replace(/\/+$/, '');
  const token = $('token').value.trim();
  await ext.storage.local.set({ baseUrl, token });
  setStatus('Saved ✓', 'ok');
});

$('test').addEventListener('click', async () => {
  const baseUrl = $('baseUrl').value.trim().replace(/\/+$/, '');
  const token = $('token').value.trim();
  if (!baseUrl || !token) return setStatus('Enter a URL and token first', 'err');
  setStatus('Testing…', '');
  try {
    // A harmless probe: an ingest with no URL returns 400 "No link found" when
    // the token is valid, or 401 when it isn't — so we can tell them apart.
    const res = await fetch(baseUrl + '/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({})
    });
    if (res.status === 401) setStatus('Token rejected', 'err');
    else if (res.ok || res.status === 400) setStatus('Connection OK ✓', 'ok');
    else setStatus('Unexpected response (' + res.status + ')', 'err');
  } catch (e) {
    setStatus('Could not reach ' + baseUrl, 'err');
  }
});

function setStatus(text, cls) {
  const s = $('status');
  s.textContent = text;
  s.className = 'status ' + cls;
}
