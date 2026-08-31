// Pulls yngf73/<app>:latest on truenas3 and redeploys it — the same two
// clicks the TrueNAS Apps UI does, just from the command line once a
// GitHub Actions build has finished pushing a new :latest.
//
// Talks to TrueNAS's JSON-RPC 2.0 API over WebSocket (REST was removed in
// 25.04) using an API key bound to a locked-down service account — see
// cointoss-admin's README for how that account/role was set up (shared
// across every app on the box; this repo just reuses it).
// Not a project dependency (kept out of the Docker build, same reasoning
// as sharp): run `npm install ws` locally once before using this.
//
//   TRUENAS_API_KEY=... node scripts/truenas-deploy.mjs linkbank
//
// Reads TRUENAS_URL/TRUENAS_API_KEY from the environment — put them in
// .env.local and `set -a && source .env.local && set +a` first, or export
// them however your shell prefers.

import WebSocket from 'ws';

const URL = process.env.TRUENAS_URL || 'wss://truenas3.v33.lan/api/current';
const API_KEY = process.env.TRUENAS_API_KEY;
const APP = process.argv[2];
const REGISTRY_NAMESPACE = 'yngf73';

if (!API_KEY) {
  console.error('TRUENAS_API_KEY not set.');
  process.exit(1);
}
if (!APP) {
  console.error('usage: node scripts/truenas-deploy.mjs <app-name>');
  console.error('  e.g. node scripts/truenas-deploy.mjs linkbank');
  process.exit(1);
}

const IMAGE = `${REGISTRY_NAMESPACE}/${APP}:latest`;

let nextId = 0;
function call(ws, method, params = []) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id !== id) return;
      ws.off('message', handler);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, jsonrpc: '2.0', method, params }));
  });
}

/** Jobs (image pull, redeploy) return a numeric job id immediately; poll until it settles. */
async function waitForJob(ws, jobId, label) {
  for (;;) {
    const jobs = await call(ws, 'core.get_jobs', [[['id', '=', jobId]]]);
    const job = jobs[0];
    if (!job) throw new Error(`[${label}] job ${jobId} not found`);
    if (job.state === 'SUCCESS') return job.result;
    if (job.state === 'FAILED' || job.state === 'ABORTED') {
      throw new Error(`[${label}] job ${jobId} ${job.state}: ${job.error ?? 'no error message'}`);
    }
    if (job.progress?.description) console.log(`[${label}] ${job.progress.percent ?? '?'}% ${job.progress.description}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const ws = new WebSocket(URL, { rejectUnauthorized: false });

ws.on('open', async () => {
  try {
    await call(ws, 'auth.login_with_api_key', [API_KEY]);
    console.log(`Logged in. Pulling ${IMAGE}...`);

    const pullJob = await call(ws, 'app.image.pull', [{ image: IMAGE }]);
    if (typeof pullJob === 'number') await waitForJob(ws, pullJob, 'pull');

    console.log(`Redeploying ${APP}...`);
    const redeployJob = await call(ws, 'app.redeploy', [APP]);
    if (typeof redeployJob === 'number') await waitForJob(ws, redeployJob, 'redeploy');

    console.log(`${APP} is up on ${IMAGE}.`);
  } catch (err) {
    console.error('Deploy failed:', err.message);
    process.exitCode = 1;
  } finally {
    ws.close();
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exitCode = 1;
});
