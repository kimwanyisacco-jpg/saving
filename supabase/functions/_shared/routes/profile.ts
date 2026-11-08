// The signed-in user's own account: their details and their password.
//
// Separate from /admin/users, which an administrator uses to manage other
// people. These routes act only on the caller, so a staff account can change
// its own password without being able to touch anyone else's.
import { Hono } from "npm:hono@4.6.14";
import { sql } from "../db.ts";
import { auth, fail, publicUser, readJson, str, type Env } from "../http.ts";
import { hashPassword, signJwt, verifyPassword, epochOf } from "../crypto.ts";
import { audit } from "../audit.ts";
import { businessProfile, currentEdition } from "../settings.ts";
import { editionCapabilities } from "../domain/editions.ts";

export const profileRoutes = new Hono<Env>();

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Reads the caller's full row, including the hash, which `userFromToken` omits. */
async function loadSelf(id: string) {
  const [u] = await sql`select * from users where id = ${id} and is_active`;
  if (!u) fail(401, "Please sign in again.", "unauthenticated");
  return u;
}

profileRoutes.get("/auth/profile", auth(), async (c) => {
  const edition = await currentEdition();
  const [u] = await sql`select * from users where id = ${c.get("user").id}`;
  return c.json({ user: publicUser(u), edition, capabilities: editionCapabilities(edition), business: await businessProfile() });
});

/**
 * Change your own name, phone or email. Email is the sign-in identity, so it
 * asks for the current password: an unattended browser must not be enough to
 * move an account to an address the attacker controls.
 */
profileRoutes.patch("/auth/profile", auth(), async (c) => {
  const b = await readJson(c);
  const me = await loadSelf(c.get("user").id);

  const name = b.name === undefined ? me.name : str(b.name, "name", { min: 2, max: 80 });
  const phone = b.phone === undefined ? me.phone : (str(b.phone, "phone", { optional: true, max: 30 }) || null);

  let email = me.email as string | null;
  const wantsEmail = b.email !== undefined && String(b.email).trim().toLowerCase() !== String(me.email ?? "").toLowerCase();
  if (wantsEmail) {
    email = str(b.email, "email", { max: 120 }).toLowerCase();
    if (!EMAIL_RE.test(email)) fail(400, "That does not look like an email address.", "validation");
    if (!(await verifyPassword(str(b.current_password, "current password", { max: 200 }), me.password_hash))) {
      await audit(me.id, "auth.profile_email_change_failed", "user", me.id, {});
      fail(403, "That is not your current password.", "bad_password");
    }
    const [dupe] = await sql`select 1 from users where lower(email) = ${email} and id <> ${me.id}`;
    if (dupe) fail(409, "Another account already uses that email.", "conflict");
  }

  await sql`update users set name = ${name}, phone = ${phone}, email = ${email} where id = ${me.id}`;
  await audit(me.id, "auth.profile_updated", "user", me.id, { email_changed: wantsEmail, name_changed: name !== me.name });
  const [u] = await sql`select * from users where id = ${me.id}`;
  return c.json({ user: publicUser(u) });
});

/**
 * Change your own password. Requires the current one, and returns a fresh token
 * because the change invalidates every token minted before it - including the
 * caller's own. Other devices are signed out; this one stays signed in.
 */
profileRoutes.post("/auth/password", auth(), async (c) => {
  const b = await readJson(c);
  const me = await loadSelf(c.get("user").id);

  const current = str(b.current_password, "current password", { max: 200 });
  const next = str(b.new_password, "new password", { min: MIN_PASSWORD, max: 200 });

  if (!(await verifyPassword(current, me.password_hash))) {
    await audit(me.id, "auth.password_change_failed", "user", me.id, {});
    fail(403, "That is not your current password.", "bad_password");
  }
  if (next === current) fail(400, "Choose a password you have not used here before.", "validation");

  // The stamp is taken from the database so the token's `pwd` claim matches the
  // value the next request will compare against.
  const [row] = await sql`update users set password_hash = ${await hashPassword(next)}, password_changed_at = now() where id = ${me.id} returning password_changed_at`;
  await audit(me.id, "auth.password_changed", "user", me.id, {});
  const token = await signJwt({ sub: me.id, role: me.role, typ: "user", pwd: epochOf(row.password_changed_at) });
  return c.json({ ok: true, token, message: "Password changed. Other devices have been signed out." });
});
