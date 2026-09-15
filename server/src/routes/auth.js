const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authService = require('../services/auth/authService');
const { requireAuth } = require('../middleware/auth');
const { SESSION_COOKIE_NAME } = require('../config/authConfig');
const securityAuditLogger = require('../services/security/securityAuditLogger');

/**
 * RAPID Auth Routes. Mounted at /api/auth, deliberately BEFORE the
 * global `requireAuth` gate in index.js (login itself must be
 * reachable while logged out).
 */

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 12 * 60 * 60 * 1000, // 12h, matches TOKEN_EXPIRY
  // Cloud deploy: real hosts (Render, etc.) serve over HTTPS, so require
  // `secure` there. Stays off for local HTTP dev — browsers silently drop
  // `secure` cookies over plain http, which would break login entirely.
  // Set NODE_ENV=production in the host's env vars to enable this.
  secure: process.env.NODE_ENV === 'production'
};

function auditLog(event) {
  securityAuditLogger.logEvent(event).catch(err => console.error('Security audit log write failed:', err.message));
}

// Throttle login attempts per-IP. Deliberately rate-limit-only, not
// account lockout — a mistyped password during an active incident
// must never lock a commander out of their own account, only slow down
// abuse-level attempt volume from one address.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Only failed attempts count toward the budget — a legitimate user
  // logging in and out repeatedly (or several people behind one NAT/IP
  // in production) must never get throttled just for succeeding.
  skipSuccessfulRequests: true,
  handler: (req, res, _next, options) => {
    auditLog({
      action: securityAuditLogger.EVENTS.LOGIN_RATE_LIMITED,
      details: { username: req.body?.username || null, ip: req.ip }
    });
    res.status(options.statusCode).json({ error: 'Too many login attempts from this address. Try again in a few minutes.' });
  }
});

// POST /api/auth/login  { username, password }
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required.' });
    }
    const result = await authService.login(username, password);
    if (!result) {
      auditLog({ action: securityAuditLogger.EVENTS.LOGIN_FAILURE, details: { username, ip: req.ip } });
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    res.cookie(SESSION_COOKIE_NAME, result.token, COOKIE_OPTIONS);
    auditLog({
      action: securityAuditLogger.EVENTS.LOGIN_SUCCESS,
      actor: { userId: result.user.userId, username: result.user.username, role: result.user.role },
      details: { ip: req.ip }
    });
    res.json({ user: result.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  try {
    const token = req.cookies ? req.cookies[SESSION_COOKIE_NAME] : null;
    if (token) {
      const user = authService.verifyToken(token);
      auditLog({ action: securityAuditLogger.EVENTS.LOGOUT, actor: { userId: user.userId, username: user.username, role: user.role } });
    }
  } catch (_) { /* expired/invalid token — nothing meaningful to attribute the logout to */ }
  res.clearCookie(SESSION_COOKIE_NAME);
  res.json({ message: 'Logged out.' });
});

// GET /api/auth/me — used by the client on load to check session state
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
