/**
 * RAPID Auth — Configuration (Phase 6, persistent secret added Phase 8)
 *
 * Custom JWT auth (per the user's choice over Supabase Auth — no
 * Supabase project is configured anywhere in this repo). The session
 * token travels as an httpOnly cookie, not a header, specifically so
 * none of the existing ~50+ `fetch()` call sites across the client
 * needed to change — the browser attaches same-origin cookies
 * automatically.
 *
 * Phase 6 generated a fresh JWT_SECRET every process start, so
 * restarting the server invalidated every session. Phase 8 fixes that
 * without requiring manual setup: if JWT_SECRET isn't set in the
 * environment, this reads one previously self-generated into server/.env,
 * or generates and persists one on first boot. A real deployment should
 * still set JWT_SECRET explicitly (e.g. from a secrets manager) — this
 * is a self-provisioning fallback appropriate for a local prototype, not
 * a substitute for real secret management in production.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

function ensurePersistedSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  try {
    if (fs.existsSync(ENV_PATH)) {
      const match = fs.readFileSync(ENV_PATH, 'utf8').match(/^JWT_SECRET=(.+)$/m);
      if (match && match[1].trim()) {
        console.log('🔑 Auth: Loaded persisted JWT_SECRET from server/.env — existing sessions survive this restart.');
        return match[1].trim();
      }
    }
  } catch (err) {
    console.error('🔑 Auth: Could not read server/.env for JWT_SECRET:', err.message);
  }

  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.appendFileSync(ENV_PATH, `${fs.existsSync(ENV_PATH) && fs.statSync(ENV_PATH).size > 0 ? '\n' : ''}JWT_SECRET=${generated}\n`);
    console.log('🔑 Auth: Generated a new JWT_SECRET and saved it to server/.env — future restarts will reuse it.');
  } catch (err) {
    console.error('🔑 Auth: Could not persist JWT_SECRET to server/.env — sessions will reset on restart:', err.message);
  }
  return generated;
}

const JWT_SECRET = ensurePersistedSecret();
const TOKEN_EXPIRY = '12h';
const SESSION_COOKIE_NAME = 'rapid_session';

module.exports = { JWT_SECRET, TOKEN_EXPIRY, SESSION_COOKIE_NAME };
