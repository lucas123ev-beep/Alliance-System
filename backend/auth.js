// Authentication helpers: password hashing, session tokens, and the Express
// middleware that protects every /api/* route. Replaces the old setup where
// a single password was hardcoded in the frontend bundle and the backend
// had no login/auth check at all — every route was reachable by anyone who
// found the API URL, including full supplier bank details.
//
// Sessions are opaque random tokens stored server-side (in the `sessions`
// table), not JWTs — logging out (or an admin revoking access) is just
// deleting the row, with no secret-key rotation or expiry math to get
// wrong. Every request from the frontend sends `Authorization: Bearer
// <token>`; the middleware looks it up and attaches `req.user = { id, name,
// username }` for the rest of the route to use (e.g. writing `updated_by`).
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const SALT_ROUNDS = 10;

function hashPassword(plain) {
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Temporary passwords handed out to each of the 9 accounts on creation —
// not meant to be memorized long-term (must_change_password forces a reset
// on first login), just easy enough to read aloud/type once. Avoids
// visually-ambiguous characters (0/O, 1/l/I) since these get typed by hand
// off a shared list rather than pasted.
const READABLE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generateTempPassword(length = 10) {
  let out = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) out += READABLE_CHARS[bytes[i] % READABLE_CHARS.length];
  return out;
}

// Applied to every /api/* route except /api/login. Reads the bearer token,
// looks up the session, and rejects with 401 if it's missing/invalid —
// nothing past this point in server.js should be reachable without it.
//
// PDF and Excel report downloads open via `window.open(url)` (a plain
// browser navigation to a new tab) instead of the `api()` fetch helper —
// that's the only way to let the browser natively handle the resulting
// file, but it means there's no way to attach an Authorization header to
// that request. Those routes pass the token as `?token=` instead, so it's
// accepted as a fallback here when the header isn't present.
function requireAuth(db) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = (header.startsWith("Bearer ") ? header.slice(7) : null) || req.query.token || null;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const session = db.prepare(`
      SELECT s.token, u.id, u.name, u.username
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `).get(token);
    if (!session) return res.status(401).json({ error: "Session expired or invalid" });

    db.prepare(`UPDATE sessions SET last_seen_at = datetime('now') WHERE token = ?`).run(token);
    req.user = { id: session.id, name: session.name, username: session.username };
    next();
  };
}

// Convenience accessor used by every write route when filling in
// `updated_by` — falls back to "Unknown" rather than throwing if somehow
// called on an unauthenticated request (shouldn't happen once requireAuth
// is wired in front of it, but a write route should never crash over this).
function actorName(req) {
  return (req.user && req.user.name) || "Unknown";
}

module.exports = { hashPassword, verifyPassword, generateToken, generateTempPassword, requireAuth, actorName };
