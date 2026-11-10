/* Thuisbios service worker. Generated at build time by sw/plugin.mjs: the two placeholders below are
 * replaced with the list of build files and the cache version. Plain JS, no build step of its own. */
'use strict';

var VERSION = __VERSION__;
var ASSETS = __ASSETS__;
var PREFIX = 'thuisbios-shell-';
var CACHE = PREFIX + VERSION;
var NAV_TIMEOUT_MS = 3000;

function scopeUrl(path) {
  return new URL(path, self.registration.scope).href;
}

var precached = {};
ASSETS.forEach(function (path) {
  precached[scopeUrl(path)] = true;
});
var INDEX = scopeUrl('index.html');

/** Whether this worker answers the request: own origin, inside the scope, GET only. */
function inScope(request) {
  if (request.method !== 'GET') return false;
  var url = new URL(request.url);
  return url.origin === self.location.origin && request.url.indexOf(self.registration.scope) === 0;
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      reject(new Error('timeout'));
    }, ms);
    promise.then(
      function (value) {
        clearTimeout(timer);
        resolve(value);
      },
      function (error) {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        // Bypass the HTTP cache so a half-stale copy never lands in the shell.
        return Promise.all(
          ASSETS.map(function (path) {
            return fetch(scopeUrl(path), { cache: 'reload' }).then(function (response) {
              if (!response.ok) throw new Error('Precache failed: ' + path + ' ' + response.status);
              return cache.put(scopeUrl(path), response);
            });
          }),
        );
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        // Only older shell caches: the offline test downloads and anything else stay untouched.
        return Promise.all(
          names
            .filter(function (name) {
              return name.indexOf(PREFIX) === 0 && name !== CACHE;
            })
            .map(function (name) {
              return caches.delete(name);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

function navigate(request) {
  var cached = function () {
    return caches.open(CACHE).then(function (cache) {
      return cache.match(INDEX).then(function (hit) {
        return hit || Response.error();
      });
    });
  };
  return withTimeout(fetch(request), NAV_TIMEOUT_MS).then(function (response) {
    return response;
  }, cached);
}

function cacheFirst(request) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request.url).then(function (hit) {
      return hit || fetch(request);
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (!inScope(request)) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  var url = new URL(request.url);
  url.search = '';
  url.hash = '';
  if (precached[url.href]) event.respondWith(cacheFirst(request));
  // Anything else (relay calls under /api, other files) goes to the network untouched.
});
