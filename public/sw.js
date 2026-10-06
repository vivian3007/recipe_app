// Service worker for the web app: shows Weekmenu's push notifications (also on an iPhone, when
// the app is on the home screen) and opens the right screen when one is tapped.

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
