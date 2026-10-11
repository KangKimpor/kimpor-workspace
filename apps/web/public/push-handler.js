/* Payloads are display text only. Never eval or fetch URLs supplied by a push. */
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { /* Generic reminder for malformed payloads. */ }
  const safePath = typeof payload.url === 'string' && payload.url.startsWith('/') && !payload.url.startsWith('//') ? payload.url : './';
  event.waitUntil(self.registration.showNotification(typeof payload.title === 'string' ? payload.title.slice(0, 160) : 'Kimpor Workspace reminder', {
    body: typeof payload.body === 'string' ? payload.body.slice(0, 300) : 'An event is coming up.',
    icon: new URL('icon-192.png', self.registration.scope).href,
    badge: new URL('icon-192.png', self.registration.scope).href,
    data: { url: new URL(safePath, self.registration.scope).href },
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 100) : undefined
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? './', self.registration.scope);
  if (target.origin !== new URL(self.registration.scope).origin) return;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows => {
    const client = windows.find(window => new URL(window.url).origin === target.origin);
    if (client) { await client.navigate(target.href); return client.focus(); }
    return self.clients.openWindow(target.href);
  }));
});
