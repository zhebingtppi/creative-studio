const CACHE='creative-studio-v15-flat-20261007';
const ASSETS=['./','./index.html','./config.js','./cloud-sync.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const isNav=e.request.mode==='navigate';
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(async()=>{
    const cached=await caches.match(e.request);if(cached)return cached;
    if(isNav)return caches.match('./index.html');
    return Response.error();
  }));
});
