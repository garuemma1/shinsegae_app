/**
 * 🔔 365메가스타약국 실시간 웹 푸시 & 백그라운드 알림 서비스 워커 (Service Worker)
 * 카카오톡 방식 스마트폰 알림바 배너 & 폰 시스템 알림음 제어 모듈
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 📩 백그라운드 푸시 알림 수신 이벤트
self.addEventListener('push', (event) => {
  let data = {
    title: '📢 365메가스타약국 알림',
    body: '새로운 업무일지 또는 소모품 요청 변동사항이 있습니다.',
    icon: 'logo.jpg',
    badge: 'logo.jpg',
    url: 'https://ganumma1.github.io/shinsegae_app/',
    tag: 'ssg-notification'
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || 'logo.jpg',
    badge: data.badge || 'logo.jpg',
    tag: data.tag || 'ssg-notification',
    data: { url: data.url || 'https://ganumma1.github.io/shinsegae_app/' },
    vibrate: [100, 50, 100, 50, 200], // 스마트폰 진동 패턴
    requireInteraction: false
  };

  // 📱 백그라운드 푸시 수신 시 스마트폰 홈 화면 앱 아이콘 N 배지 세팅
  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    const unreadNum = Number(data.unreadCount) || 1;
    navigator.setAppBadge(unreadNum).catch(() => {});
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 🖱️ 스마트폰 상단 알림 배너 터치/클릭 이벤트
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || 'https://ganumma1.github.io/shinsegae_app/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes('shinsegae_app') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
