/**
 * RAPID Auth Middleware (Phase 6)
 *
 * `requireAuth` reads the session from an httpOnly cookie, not an
 * Authorization header — deliberately, so none of the client's
 * existing ~50+ `fetch()` calls needed to change to send a token; the
 * browser attaches same-origin cookies automatically. See
 * config/authConfig.js and routes/auth.js.
 */
const { verifyToken } = require('../services/auth/authService');
const { SESSION_COOKIE_NAME } = require('../config/authConfig');
const securityAuditLogger = require('../services/security/securityAuditLogger');

function isPublicCitizenEndpoint(req) {
  // Citizen web emergency submission: POST /api/incidents
  if (req.method === 'POST' && req.path === '/incidents') return true;
  // Citizen incident tracking: GET /api/incidents/:id
  if (req.method === 'GET' && /^\/incidents\/[^/]+$/.test(req.path)) return true;
  // Citizen incident log trail: GET /api/incidents/:id/logs
  if (req.method === 'GET' && /^\/incidents\/[^/]+\/logs$/.test(req.path)) return true;
  // Citizen tracking assigned drone telemetry: GET /api/drones/:id
  if (req.method === 'GET' && /^\/drones\/[^/]+$/.test(req.path)) return true;
  return false;
}

function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[SESSION_COOKIE_NAME] : null;

  if (token) {
    try {
      req.user = verifyToken(token);
      return next();
    } catch (err) {
      if (isPublicCitizenEndpoint(req)) {
        return next();
      }
      return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    }
  }

  if (isPublicCitizenEndpoint(req)) {
    return next();
  }

  return res.status(401).json({ error: 'Not authenticated. Please log in.' });
}

/**
 * @param  {...string} roles - allowed roles; the request is rejected
 *   with 403 if req.user.role isn't one of them. Must run after
 *   requireAuth.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      // Fire-and-forget: an audit-log write failure must never block the
      // (already-being-rejected) request itself.
      securityAuditLogger.logEvent({
        action: securityAuditLogger.EVENTS.UNAUTHORIZED_ATTEMPT,
        actor: req.user ? { userId: req.user.userId, username: req.user.username, role: req.user.role } : null,
        target: { method: req.method, path: req.originalUrl },
        details: { requiredRoles: roles }
      }).catch(err => console.error('Security audit log write failed:', err.message));

      return res.status(403).json({ error: `Requires one of these roles: ${roles.join(', ')}` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
