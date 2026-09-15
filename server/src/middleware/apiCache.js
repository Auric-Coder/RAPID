/**
 * RAPID — Lightweight in-process response cache (Step 5: API response caching)
 *
 * A single Map-based cache, not Redis and not a caching library. This is a
 * single Express process (see render.yaml — one web service, no horizontal
 * scaling), so an in-memory cache is the simplest CORRECT choice today. It
 * would stop being correct the moment a second instance runs behind a load
 * balancer, since each instance would then hold its own independent cache
 * and could disagree with the others — that trade-off belongs to whatever
 * decides to add a load balancer (see PERF_BASELINE.md's Step 20 write-up),
 * not to this middleware.
 *
 * SAFETY RULE — read before adding a new route to this cache:
 * Only wrap a route whose response is identical for every caller. If the
 * handler reads req.user, or filters its result by organisation/scope in
 * any way, do NOT cache it here — caching by URL alone would serve one
 * user's response to a different user with a different scope. See
 * routes/geo.js's `/bases` route for a documented example of a route that
 * was deliberately excluded for exactly this reason.
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
