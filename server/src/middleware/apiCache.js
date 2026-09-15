/**
 * Lightweight in-process response cache.
 *
 * One Map, not Redis. render.yaml runs a single web service with no horizontal
 * scaling, so an in-memory cache is correct today. It stops being correct the
 * moment a second instance runs behind a load balancer, since each would hold
 * its own copy and they could disagree.
 *
 * Read this before adding a route. `keyFn` receives the full `req`, so a route
 * whose response depends on req.user can be cached safely, but only if the key
 * includes the caller's organisationId, scopeType and scopeId rather than just
 * the URL. Keying a scoped route by URL alone serves one caller's response to
 * another. routes/metrics.js's cacheKeyForUser() is the correct shape;
 * routes/geo.js's /bases is excluded entirely instead of keyed.
 */

const store = new Map(); // key -> { expires: epoch ms, body: parsed JSON }

/**
 * Express middleware factory. Wrap a GET route with:
 *   router.get('/path', cacheGet(ttlMs, req => 'cache:key'), handler)
 *
 * @param {number} ttlMs - how long a cached response stays fresh
 * @param {(req: import('express').Request) => string} keyFn - derives the
 *   cache key from the request (e.g. include relevant query params so
 *   different filters don't collide)
 */
function cacheGet(ttlMs, keyFn) {
  return (req, res, next) => {
    const key = keyFn(req);
    const hit = store.get(key);

    if (hit && hit.expires > Date.now()) {
      res.set('X-Cache', 'HIT');
      return res.json(hit.body);
    }

    // Not cached, or expired: let the real handler run, but intercept
    // res.json so a successful response gets stored before it's sent.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        store.set(key, { expires: Date.now() + ttlMs, body });
      }
      res.set('X-Cache', 'MISS');
      return originalJson(body);
    };
    next();
  };
}

/**
 * Remove every cached entry whose key starts with `prefix`. Called from a
 * write route to keep a short-TTL cache correct immediately, rather than
 * waiting out the TTL — the TTL then exists only as a safety net for any
 * invalidation path this misses.
 */
function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

module.exports = { cacheGet, invalidate };
