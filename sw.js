// ১. ক্যাশের নাম এবং অফলাইনে দেখানোর জন্য ফাইলের তালিকা
const CACHE_NAME = 'shifat100-daily-gk';
const urlsToCache = [
  '/',                // হোম পেজ
  '/index.html',      // মেইন HTML ফাইল
  '/style.css',       // আপনার CSS ফাইল (নাম চেক করে নিন)
  '/script.js',       // আপনার JS ফাইল (নাম চেক করে নিন)
  '/logo.png'         // কোনো লোগো বা ছবি থাকলে
];

// ২. Install Event: প্রথমবার ভিজিটের সময় ফাইলগুলো ক্যাশে সেভ হবে
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installed');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching all files');
        return cache.addAll(urlsToCache);
      })
  );
});

// ৩. Fetch Event: দ্বিতীয়বার বা অফলাইনে ফাইল ক্যাশ থেকে লোড হবে
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // যদি ক্যাশে ফাইল পাওয়া যায়, তবে তা রিটার্ন করো (অফলাইন মোড)
        if (response) {
          return response;
        }
        // ক্যাশে না থাকলে ইন্টারনেট থেকে আনো
        return fetch(event.request);
      })
  );
});

// ৪. Activate Event: পুরনো ক্যাশ ক্লিয়ার করার জন্য (অপশনাল কিন্তু ভালো)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
});
