// Service worker for the web app: shows Weekmenu's push notifications (also on an iPhone, when
// the app is on the home screen) and opens the right screen when one is tapped. It also keeps the
// app itself on the device, so it opens without internet. The family's data stays out of this:
// that goes to Supabase, on another address, and the app keeps what it needs itself.

const APP_CACHE = 'weekmenu-app-v1';
const STATIC = /^\/(_expo\/static|assets)\//;
// Bad reception in the shop shouldn't mean staring at a white screen.
const NETWORK_WAIT_MS = 3000;

/** A new version only counts once all it needs is here, so a dropped connection can't leave half an app. */
async function saveApp(response) {
  const html = await response.clone().text();
  const files = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((match) => match[1]);
  const cache = await caches.open(APP_CACHE);
  const missing = [];
  for (const file of files) if (!(await cache.match(file))) missing.push(file);
  await cache.addAll(missing);
  await cache.put('/', response);
  // Earlier versions of the app.
  for (const request of await cache.keys()) {
    const { pathname } = new URL(request.url);
    if (pathname.endsWith('.js') && !files.includes(pathname)) await cache.delete(request);
  }
}

async function openApp(event) {
  const cache = await caches.open(APP_CACHE);
  const stored = await cache.match('/');
  const network = fetch(event.request);
  event.waitUntil(
    network
      .then((response) => (response.ok ? saveApp(response.clone()) : undefined))
      .catch(() => {}),
  );
  if (!stored) return network;
  const waited = new Promise((resolve) => setTimeout(() => resolve(stored), NETWORK_WAIT_MS));
  return Promise.race([network, waited]).catch(() => stored);
}

async function storedFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const stored = await cache.match(request);
  if (stored) return stored;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Notifications must keep working if this fails; the app is then stored on the next visit.
  event.waitUntil(
    fetch('/', { cache: 'no-cache' })
      .then((response) => (response.ok ? saveApp(response) : undefined))
      .catch(() => {}),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== APP_CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(openApp(event));
  else if (STATIC.test(url.pathname)) event.respondWith(storedFirst(request));
  else event.respondWith(fetch(request).catch(async () => (await caches.match(request)) ?? Response.error()));
});

self.addEventListener('push', (event) => {
  let message = { title: 'Weekmenu', body: '', url: '/week', weekStart: '' };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // Not JSON: show the text as it is.
    if (event.data) message.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: '/logo192.png',
      badge: '/favicon.png',
      data: { url: message.url, weekStart: message.weekStart },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url, weekStart } = event.notification.data ?? {};
  const target = `${url || '/week'}${weekStart ? `?week=${weekStart}` : ''}`;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => 'focus' in w);
      if (open) {
        open.navigate(target);
        return open.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
