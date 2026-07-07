// Service Worker for reliable cross-platform desktop notifications
// Works across Chrome, Safari, Firefox on macOS and Windows

const SW_VERSION = "1.0.0";
console.log(`[SW] Meow Workbench SW v${SW_VERSION} loaded`);

self.addEventListener("install", (event) => {
  console.log("[SW] install");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[SW] activate");
  event.waitUntil(self.clients.claim());
});

// Listen for messages from the main thread to show notifications
self.addEventListener("message", (event) => {
  const { type, title, body, tag, requireInteraction } = event.data || {};

  if (type === "SHOW_NOTIFICATION" && title) {
    event.waitUntil(
      self.registration.showNotification(title, {
        body: (body || "").slice(0, 200),
        tag: tag || "meow-workbench",
        requireInteraction: requireInteraction !== false,
        icon: "/file.svg",
        badge: "/file.svg",
        vibrate: [200, 100, 200],
        timestamp: Date.now(),
      })
    );
  }
});

// Handle notification clicks - focus or open the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      if (clients.length > 0) {
        clients[0].focus();
      } else {
        self.clients.openWindow("/");
      }
    })
  );
});
