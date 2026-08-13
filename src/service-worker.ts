/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

// A minimal service worker: it exists mainly so LinkBank is an installable PWA
// (a prerequisite for the share target). It also caches the built app shell so
// static assets load fast; navigations and API calls always go to the network.
const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `linkbank-${version}`;
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Serve hashed build assets from cache; everything else hits the network
  // (so pages, /share, and the API are always fresh).
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
  }
});
