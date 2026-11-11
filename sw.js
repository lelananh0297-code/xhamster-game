// English Dino Speaking Challenge service worker.
// Works under a sub-folder such as https://<user>.github.io/<repo>/ because every path is relative.
// Whisper model files are NOT handled here: Transformers.js stores them itself in Cache Storage
// ("transformers-cache"), which this worker never deletes.
const V = { shell: 'dino-shell-v3', lib: 'dino-lib-v1' };
const SHELL = ['./', './index.html'];
const PAGE = './index.html';

self.addEventListener('install', e => {
  // No catch: if a required file is missing (404) the install fails visibly instead of being hidden.
  e.waitUntil(caches.open(V.shell).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => e.waitUntil((async () => {
  const keep = new Set(Object.values(V));
  // Remove only our own obsolete caches (e.g. dino-shell-v1/v2); never the model cache.
  for (const k of await caches.keys()) if (k.startsWith('dino-') && !keep.has(k)) await caches.delete(k);
  await self.clients.claim();
})()));

async function store(cache, req, res) {
  if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
    try { await (await caches.open(cache)).put(req, res.clone()); }
    catch (err) { console.error('[sw] cache put failed:', req.url, err); }
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {            // game files: stale-while-revalidate
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      const net = fetch(req).then(r => store(V.shell, req, r)).catch(err => { console.warn('[sw] network failed:', req.url, err); return null; });
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || (req.mode === 'navigate' ? caches.match(PAGE) : Response.error());
    })());
  } else if (url.hostname === 'cdn.jsdelivr.net') { // Transformers.js + ONNX WASM: cache-first
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      return store(V.lib, req, await fetch(req));
    })());
  }                                                 // everything else (Hugging Face): untouched
});
