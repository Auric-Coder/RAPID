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
        console.log('Auth: Loaded persisted JWT_SECRET from server/.env.');
        return match[1].trim();
      }
    }
  } catch (err) {
    console.error('Auth: Could not read server/.env for JWT_SECRET:', err.message);
  }

  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.appendFileSync(ENV_PATH, `${fs.existsSync(ENV_PATH) && fs.statSync(ENV_PATH).size > 0 ? '\n' : ''}JWT_SECRET=${generated}\n`);
    console.log('Auth: Generated a new JWT_SECRET and saved it to server/.env.');
  } catch (err) {
    console.error('Auth: Could not persist JWT_SECRET to server/.env — sessions will reset on restart:', err.message);
  }
  return generated;
}

const JWT_SECRET = ensurePersistedSecret();
const TOKEN_EXPIRY = '12h';
const SESSION_COOKIE_NAME = 'rapid_session';

module.exports = { JWT_SECRET, TOKEN_EXPIRY, SESSION_COOKIE_NAME };
