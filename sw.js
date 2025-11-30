self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
});

self.addEventListener('fetch', (e) => {
  // বেসিক ফেচ ইভেন্ট যা PWA এর জন্য জরুরি
});
