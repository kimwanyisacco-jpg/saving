import { Hono } from "npm:hono@4.6.14";
import { sql } from "../db.ts";
import { auth, fail, publicUser, readJson, str, type Env } from "../http.ts";
import { hashPassword, signJwt, verifyPassword, epochOf } from "../crypto.ts";
import { audit } from "../audit.ts";
import { env } from "../env.ts";
import { businessProfile, currentEdition } from "../settings.ts";
import { editionCapabilities, isEdition, EDITION_META } from "../domain/editions.ts";
import type { Edition } from "../domain/types.ts";
import { hasData, seedDemo } from "../lib/seed.ts";

export const authRoutes = new Hono<Env>();

const attempts = new Map<string, { n: number; until: number }>();

authRoutes.post("/auth/login", async (c) => {
  const b = await readJson(c);
  const login = str(b.login ?? b.email, "email", { max: 120 }).toLowerCase();
  const password = str(b.password, "password", { max: 200 });
  const a = attempts.get(login);
  if (a && a.until > Date.now()) fail(429, "Too many tries. Wait a minute and try again.");
  const [u] = await sql`select * from users where lower(email) = ${login} and is_active`;
  if (!u || !(await verifyPassword(password, u.password_hash))) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(login, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    await audit(u?.id ?? null, "auth.login_failed", "user", u?.id ?? null, { login });
    fail(401, "That email or password is not right.");
  }
  attempts.delete(login);
  await sql`update users set last_login_at = now() where id = ${u.id}`;
  await audit(u.id, "auth.login", "user", u.id, {});
  const edition = await currentEdition();
  return c.json({
    token: await signJwt({ sub: u.id, role: u.role, typ: "user", pwd: epochOf(u.password_changed_at) }),
    user: publicUser({ ...u, last_login_at: new Date().toISOString() }),
    edition,
    capabilities: editionCapabilities(edition),
    business: await businessProfile(),
  });
});

authRoutes.get("/auth/me", auth(), async (c) => {
  const edition = await currentEdition();
  return c.json({ user: c.get("user"), edition, capabilities: editionCapabilities(edition), business: await businessProfile() });
});

authRoutes.post("/auth/logout", auth(), async (c) => {
  await audit(c.get("user").id, "auth.logout", "user", c.get("user").id, {});
  return c.json({ ok: true });
});

// --------------------------------------------------------------- public setup
authRoutes.get("/setup/status", async (c) => {
  const edition = await currentEdition();
  const [{ n }] = await sql`select count(*)::int as n from users`;
  return c.json({
    service: "credit-savings",
    edition,
    editions: Object.values(EDITION_META),
    business: await businessProfile(),
    users: n,
    demo_mode: env.demoMode,
    can_seed: env.demoMode && !(await hasData()),
    capabilities: editionCapabilities(edition),
  });
});

/** One-click demo seed. Optional `edition` (basic|classic|enhanced) reseeds that package. */
authRoutes.post("/setup/demo", async (c) => {
  const b = await readJson(c).catch(() => ({} as Record<string, unknown>));
  const edition: Edition = isEdition(b.edition) ? b.edition : await currentEdition();
  const reset = b.reset === true || b.reset === "true";
  if (!env.demoMode) fail(403, "Demo mode is off (DEMO_MODE=false).", "forbidden");
  if (!reset && (await hasData())) fail(409, "The database already has records. Send { reset: true } to replace them with a fresh demo.", "conflict");
  const result = await seedDemo(edition, { reset: true });
  return c.json({ ok: true, ...result, login_url: env.appUrl + "/login" }, 201);
});
