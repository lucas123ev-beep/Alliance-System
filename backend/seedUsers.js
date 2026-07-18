// Runs once, automatically, the first time the app boots against a fresh
// `users` table (i.e. right after this deploy goes live) — creates one
// account per person on the INITIAL_USERS list below with a random
// temporary password, and prints the full username/password list to the
// server's console output. There's no signup screen and no admin UI for
// this on purpose: with a fixed team of known people, an admin (Lucas)
// handing out credentials once is both simpler and a smaller attack
// surface than a self-service flow.
//
// After this first run, the `users` table is no longer empty, so the
// function becomes a no-op on every future boot/restart — safe to leave
// wired in permanently.
//
// To read the generated passwords: open the Render dashboard → this
// service → Logs, right after the first deploy with this code finishes
// starting up. They only get printed this one time.
const { hashPassword, generateTempPassword } = require("./auth");

// Fill in the real team here, then deploy — each entry becomes one login.
// `username` is what they'll actually type to sign in (lowercase, no
// spaces/accents); keep it short and something they'll remember.
const INITIAL_USERS = [
  { name: "Lucas", username: "lucas" },
  { name: "Martiello", username: "martiello" },
  { name: "Gabriel", username: "gabriel" },
  { name: "Yukin", username: "yukin" },
  { name: "Keke", username: "keke" },
  { name: "Amber", username: "amber" },
  { name: "Max", username: "max" },
  { name: "Wang", username: "wang" },
  { name: "Juliana", username: "juliana" },
];

function seedInitialUsersIfEmpty(db) {
  if (INITIAL_USERS.length === 0) return;
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM users").get();
  if (count > 0) return;

  const insert = db.prepare(
    "INSERT INTO users (name, username, password_hash, must_change_password) VALUES (?, ?, ?, 1)"
  );
  const created = INITIAL_USERS.map(({ name, username }) => {
    const password = generateTempPassword();
    insert.run(name, username, hashPassword(password));
    return { name, username, password };
  });

  const rows = created.map(u => `  ${u.username.padEnd(14)} ${u.password.padEnd(14)} (${u.name})`).join("\n");
  console.log(
    "\n================ ALLIANCE FLOW — INITIAL LOGINS (shown only this once) ================\n" +
    "  username        password        name\n" +
    rows +
    "\n\nShare these with each person individually. They'll be asked to set a new\n" +
    "password the first time they log in.\n" +
    "=========================================================================================\n"
  );
}

module.exports = { seedInitialUsersIfEmpty };
