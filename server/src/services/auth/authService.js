/**
 * RAPID Auth Service (Phase 6)
 *
 * Custom JWT auth — password check + token issuance/verification.
 * The token payload carries everything downstream middleware/routes
 * need (organisation + role + scope) so they never have to re-fetch
 * the user record just to make an authorization decision.
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const { JWT_SECRET, TOKEN_EXPIRY } = require('../../config/authConfig');

async function login(username, password) {
  const user = await db.users.getByUsername(username);
  if (!user) return null;

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return null;

  const organisation = await db.organisations.get(user.organisation_id);
  const payload = {
    userId: user.id,
    username: user.username,
    fullName: user.full_name,
    organisationId: user.organisation_id,
    organisationCode: organisation ? organisation.code : null,
    role: user.role,
    scopeType: user.scope_type,
    scopeId: user.scope_id
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  return { token, user: payload };
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { login, verifyToken };
