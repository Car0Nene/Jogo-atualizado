// O deploy substitui o número da versão pelo ID da execução do GitHub Actions.
const CACHE_NAME = 'familia-fighter-v19';

// Baixado na instalação (o jogo abre offline). Músicas entram no cache na primeira vez que tocam.
const APP_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/game.js',
  './js/audio.js',
  './js/account.js',
  './js/sprite-data.js',
  './js/dialogue.js',
  './supabase-config.js',
  './manifest.webmanifest',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/menu/menu.webp',
  './assets/stages/bar.webp',
  './assets/stages/praia.webp',
  './assets/portraits/juraci.png',
  './assets/portraits/carlos.png',
  './assets/portraits/pedro.png',
  './assets/portraits/daniel.png',
  './assets/portraits/franciely.png',
  './assets/portraits/gabi.png',
  './assets/voice/franciely-isso.mp3',
  './assets/voice/franciely-ferrinho.mp3',
  './assets/voice/franciely-desarma.mp3',
  './assets/voice/franciely-montar.mp3'
];

// Código e dados: rede primeiro (sempre a versão mais nova, todos do mesmo deploy).
// Imagens e áudio: cache primeiro (o atlas tem ?v= no endereço, então nunca mistura versões).
const NETWORK_FIRST = /\.(?:html|js|css|webmanifest|json)$|\/$/;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_ASSETS.map(asset => new Request(asset, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('familia-fighter-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(event, cacheKey) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(event.request, { cache: 'no-cache' });
    if (response.ok && response.type === 'basic') event.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    const cached = await cache.match(cacheKey) || await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  // 206 (pedaço de arquivo) não pode ser guardado; só respostas completas
  if (response.status === 200 && response.type === 'basic') event.waitUntil(cache.put(event.request, response.clone()));
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase/CDN nunca passam pelo cache

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, './index.html'));
    return;
  }
  if (NETWORK_FIRST.test(url.pathname)) {
    event.respondWith(networkFirst(event, request));
    return;
  }
  event.respondWith(cacheFirst(event));
});
