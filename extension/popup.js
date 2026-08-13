const $ = (id) => document.getElementById(id);

function openOptions() {
  ext.runtime.openOptionsPage();
}
$('opts').addEventListener('click', (e) => { e.preventDefault(); openOptions(); });

async function init() {
  const { baseUrl, token } = await getConfig();
  if (!baseUrl || !token) {
    $('needsSetup').style.display = 'block';
    $('openOptions').addEventListener('click', (e) => { e.preventDefault(); openOptions(); });
    return;
  }
  $('form').style.display = 'flex';

  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  $('url').textContent = url;
  $('title').value = tab?.title || '';

  const save = $('save');
  save.addEventListener('click', async () => {
    const status = $('status');
    status.className = 'status';
    status.textContent = 'Saving…';
    save.disabled = true;
    const tags = $('tags').value.split(',').map((t) => t.trim()).filter(Boolean);
    try {
      const r = await saveLink({ url, title: $('title').value, tags });
      status.className = 'status ok';
      status.textContent = 'Saved to ' + (r.folder || 'Inbox') + ' ✓';
      setTimeout(() => window.close(), 800);
    } catch (e) {
      status.className = 'status err';
      status.textContent = e.message;
      save.disabled = false;
    }
  });
}

init();
