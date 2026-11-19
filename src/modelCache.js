/**
 * High-Performance Dual-Layer Model Cache for Supabase GLB Models
 * - In-memory Blob URL cache (0ms instant retrieval)
 * - CacheStorage layer (browser HTTP cache)
 * - IndexedDB layer (persistent binary storage for all webviews/mobile browsers)
 * - Streaming download with real-time progress reporting
 * - Background prefetching for instantaneous model switching
 */

const CACHE_NAME = "kinetic-glb-v2";
const DB_NAME = "KineticModelDB";
const STORE_NAME = "models";
const DB_VERSION = 1;

// In-memory cache for fast session reuse
const memoryBlobUrls = new Map(); // url -> blobUrl
const inFlightRequests = new Map(); // url -> { promise, listeners: Set<Function> }

/**
 * Open or create IndexedDB instance
 */
function openDB() {
  return new Promise((resolve) => {
    if (!("indexedDB" in self)) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Read Blob from IndexedDB
 */
async function getFromIDB(url) {
  try {
    const db = await openDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Save Blob to IndexedDB
 */
async function saveToIDB(url, blob) {
  try {
    const db = await openDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(blob, url);
  } catch {
    // Ignore IDB write failures (quota, private mode)
  }
}

/**
 * Read Blob from CacheStorage
 */
async function getFromCacheStorage(url) {
  try {
    if ("caches" in self) {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) {
        return await hit.blob();
      }
    }
  } catch {
    // CacheStorage unavailable or restricted
  }
  return null;
}

/**
 * Save Blob to CacheStorage
 */
async function saveToCacheStorage(url, blob) {
  try {
    if ("caches" in self) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(
        url,
        new Response(blob, {
          headers: {
            "Content-Type": "model/gltf-binary",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        }),
      );
    }
  } catch {
    // Ignore cache put failure
  }
}

/**
 * Stream download with real-time progress callbacks
 */
async function downloadAndCache(url, inFlight) {
  // 1. Check CacheStorage first
  const cachedBlob = await getFromCacheStorage(url);
  if (cachedBlob) {
    inFlight.listeners.forEach((fn) => fn(1));
    const blobUrl = URL.createObjectURL(cachedBlob);
    memoryBlobUrls.set(url, blobUrl);
    // Asynchronously back up into IDB if missing
    saveToIDB(url, cachedBlob).catch(() => {});
    return blobUrl;
  }

  // 2. Check IndexedDB
  const idbBlob = await getFromIDB(url);
  if (idbBlob) {
    inFlight.listeners.forEach((fn) => fn(1));
    const blobUrl = URL.createObjectURL(idbBlob);
    memoryBlobUrls.set(url, blobUrl);
    saveToCacheStorage(url, idbBlob).catch(() => {});
    return blobUrl;
  }

  // 3. Network fetch with chunked streaming
  const res = await fetch(url, {
    mode: "cors",
    credentials: "omit",
    cache: "force-cache",
  });

  if (!res.ok) {
    throw new Error(`Download failed for ${url} (HTTP ${res.status})`);
  }

  const contentLength = Number(res.headers.get("content-length")) || 0;
  let finalBlob;

  if (res.body && contentLength > 0) {
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const progress = Math.min(received / contentLength, 1);
      inFlight.listeners.forEach((fn) => fn(progress));
    }

    finalBlob = new Blob(chunks, { type: "model/gltf-binary" });
  } else {
    finalBlob = await res.blob();
    inFlight.listeners.forEach((fn) => fn(1));
  }

  // Store in parallel into both persistent stores
  saveToCacheStorage(url, finalBlob).catch(() => {});
  saveToIDB(url, finalBlob).catch(() => {});

  const blobUrl = URL.createObjectURL(finalBlob);
  memoryBlobUrls.set(url, blobUrl);
  return blobUrl;
}

/**
 * Retrieve blob URL for a model with progress listener
 */
export function getModelBlobUrl(url, onProgress) {
  // Instant in-memory cache hit
  if (memoryBlobUrls.has(url)) {
    if (onProgress) onProgress(1);
    return Promise.resolve(memoryBlobUrls.get(url));
  }

  // Deduplicate in-flight downloads for the same URL
  let inFlight = inFlightRequests.get(url);
  if (!inFlight) {
    inFlight = { listeners: new Set(), promise: null };
    inFlight.promise = downloadAndCache(url, inFlight)
      .finally(() => {
        inFlightRequests.delete(url);
      });
    inFlightRequests.set(url, inFlight);
  }

  if (onProgress) {
    inFlight.listeners.add(onProgress);
    inFlight.promise
      .finally(() => inFlight.listeners.delete(onProgress))
      .catch(() => {});
  }

  return inFlight.promise;
}

/**
 * Background prefetching for built-in models
 * Runs during idle frames to avoid competing with main thread / active model
 */
export function prefetchModels(urls) {
  const conn = navigator.connection;
  if (conn?.saveData || /2g$/.test(conn?.effectiveType || "")) return;

  const runPrefetch = async () => {
    for (const url of urls) {
      if (!memoryBlobUrls.has(url) && !inFlightRequests.has(url)) {
        try {
          await getModelBlobUrl(url);
        } catch (e) {
          // Ignore prefetch errors - will retry when user clicks
        }
      }
    }
  };

  if ("requestIdleCallback" in window) {
    requestIdleCallback(runPrefetch, { timeout: 3000 });
  } else {
    setTimeout(runPrefetch, 1000);
  }
}
