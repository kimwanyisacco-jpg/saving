// Administration: staff accounts, edition and business profile, backups, audit trail.
import { Hono } from "npm:hono@4.6.14";
import { sql } from "../db.ts";
import { auth, fail, isoDate, oneOf, publicUser, readJson, str, uuid, type Env } from "../http.ts";
import { hashPassword, randomCode } from "../crypto.ts";
import { audit } from "../audit.ts";
import { allSettings, businessProfile, currentEdition, setSetting } from "../settings.ts";
import { CAPS, EDITION_META, editionCapabilities, hasCap, isEdition } from "../domain/editions.ts";
import { toCSV } from "../domain/csv.ts";
import { today } from "../domain/dates.ts";
import { dashboardTotals, listCorrections } from "../lib/domain.ts";
import { env } from "../env.ts";
import { hasData, seedDemo } from "../lib/seed.ts";
import { listNotifications, notificationStatus } from "../notifications.ts";
import type { Edition } from "../domain/types.ts";

export const admin = new Hono<Env>();
admin.use("/admin/*", auth("admin"));

admin.get("/admin/overview", async (c) => {
  const [u] = await sql`select count(*)::int as users, count(*) filter (where role='admin')::int as admins from users`;
  const [{ customers }] = await sql`select count(*)::int as customers from customers`;
  const [{ transactions }] = await sql`select count(*)::int as transactions, count(*) filter (where voided_at is not null)::int as voided from transactions`;
  const [k] = await sql`select count(*)::int as corrections from transaction_corrections`;
  const totals = await dashboardTotals();
  const edition = await currentEdition();
  return c.json({
    ...u, customers, transactions, corrections: k.corrections, totals, edition,
    capabilities: editionCapabilities(edition), business: await businessProfile(),
    demo_mode: env.demoMode,
    notifications: await notificationStatus(),
  });
});

admin.get("/admin/users", async (c) => c.json({ users: (await sql`select * from users order by created_at`).map(publicUser) }));

/**
 * Reset someone else's password to a fresh random one and return it once.
 * This is the recovery path for a forgotten password: the hash is one-way, so
 * no one - not even an administrator - can read the old one back.
 */
admin.post("/admin/users/:id/reset-password", async (c) => {
  const id = uuid(c.req.param("id"));
  const [u] = await sql`select id, email from users where id = ${id}`;
  if (!u) fail(404, "That account was not found.", "not_found");
  const password = randomCode(10) + "#1";
  await sql`update users set password_hash = ${await hashPassword(password)}, password_changed_at = now() where id = ${id}`;
  await audit(c.get("user").id, "admin.password_reset", "user", id, {});
  return c.json({ ok: true, email: u.email, password });
});

admin.post("/admin/users", async (c) => {
  const b = await readJson(c);
  const role = oneOf(b.role, "role", ["admin", "staff"] as const, "staff");
  const name = str(b.name, "name", { min: 2, max: 80 });
  const email = str(b.email, "email", { max: 120 }).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, "Enter a valid email address.", "validation");
  const password = str(b.password, "password", { optional: true, max: 200 }) || randomCode(10) + "#1";
  if (password.length < 8) fail(400, "The password must be at least 8 characters.", "validation");
  const [dupe] = await sql`select 1 from users where lower(email) = ${email}`;
  if (dupe) fail(409, "An account with that email already exists.", "conflict");
  const [u] = await sql`insert into users (role, name, email, phone, password_hash)
    values (${role}, ${name}, ${email}, ${str(b.phone, "phone", { optional: true, max: 30 }) || null}, ${await hashPassword(password)}) returning *`;
  await audit(c.get("user").id, "admin.user_created", "user", u.id, { role });
  return c.json({ user: publicUser(u), password }, 201);
});

admin.patch("/admin/users/:id", async (c) => {
  const id = uuid(c.req.param("id"));
  const b = await readJson(c);
  if (id === c.get("user").id && b.is_active === false) fail(400, "You cannot switch off your own account.", "validation");
  if (typeof b.is_active === "boolean") await sql`update users set is_active = ${b.is_active} where id = ${id}`;
  if (b.password) await sql`update users set password_hash = ${await hashPassword(str(b.password, "password", { min: 8, max: 200 }))}, password_changed_at = now() where id = ${id}`;
  if (b.name) await sql`update users set name = ${str(b.name, "name", { min: 2, max: 80 })} where id = ${id}`;
  if (b.role) await sql`update users set role = ${oneOf(b.role, "role", ["admin", "staff"] as const)} where id = ${id}`;
  // Email is the sign-in identity. An administrator sets it here so a mistyped
  // self-service address can be corrected without locking anyone out.
  if (b.email !== undefined) {
    const email = str(b.email, "email", { max: 120 }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, "That does not look like an email address.", "validation");
    const [dupe] = await sql`select 1 from users where lower(email) = ${email} and id <> ${id}`;
    if (dupe) fail(409, "Another account already uses that email.", "conflict");
    await sql`update users set email = ${email} where id = ${id}`;
  }
  const [u] = await sql`select * from users where id = ${id}`;
  if (!u) fail(404, "That account was not found.", "not_found");
  await audit(c.get("user").id, "admin.user_updated", "user", id, { is_active: b.is_active, password_reset: Boolean(b.password), role: b.role, email_changed: b.email !== undefined });
  return c.json({ user: publicUser(u) });
});

// ------------------------------------------------- edition and business profile
admin.get("/admin/settings", async (c) => {
  const edition = await currentEdition();
  return c.json({ settings: await allSettings(), edition, editions: Object.values(EDITION_META), capabilities: editionCapabilities(edition) });
});

admin.put("/admin/settings", async (c) => {
  const b = await readJson(c);
  const actor = c.get("user").id;
  if (b.edition !== undefined) {
    if (!isEdition(b.edition)) fail(400, "The package must be basic, classic or enhanced.", "validation");
    await setSetting("edition", b.edition, actor);
    await audit(actor, "admin.edition_changed", "app_settings", null, { edition: b.edition });
  }
  for (const [key, label] of [["business_name", "business name"], ["business_address", "address"], ["business_phone", "phone"], ["business_email", "email"], ["business_logo_text", "logo text"], ["business_footer_note", "statement footer"]] as const) {
    if (b[key] !== undefined) await setSetting(key, str(b[key], label, { optional: true, max: 300 }), actor);
  }
  // The handover date starts the package's customer-email window.
  if (b.handover_on !== undefined) {
    await setSetting("handover_on", isoDate(b.handover_on, "handover date", { optional: true }) || null, actor);
    await audit(actor, "admin.handover_set", "app_settings", null, { handover_on: b.handover_on });
  }
  await audit(actor, "admin.settings_updated", "app_settings", null, { keys: Object.keys(b) });
  return c.json({ settings: await allSettings(), edition: await currentEdition(), business: await businessProfile() });
});

// ------------------------------------------------------------------- backups
/** Backup download and correction history are Classic features. */
async function guardBackup() {
  if (!hasCap(await currentEdition(), CAPS.backup)) fail(402, "Database backup is part of the Classic package.", "edition_required");
}

/** A full JSON backup: every table, ready to be stored off-site. */
admin.get("/admin/backup.json", async (c) => {
  await guardBackup();
  const [users, customers, transactions, corrections, settings, auditRows] = await Promise.all([
    sql`select id, role, name, email, phone, is_active, created_at from users order by created_at`,
    sql`select * from customers order by code`,
    sql`select * from transactions order by occurred_on, created_at`,
    sql`select * from transaction_corrections order by created_at`,
    sql`select key, value, updated_at from app_settings order by key`,
    sql`select id, actor_id, action, object_type, object_id, metadata, created_at from audit_logs order by id`,
  ]);
  const payload = {
    product: "Credit & Savings Records Management System",
    version: 1,
    generated_at: new Date().toISOString(),
    edition: await currentEdition(),
    counts: { users: users.length, customers: customers.length, transactions: transactions.length, corrections: corrections.length, audit: auditRows.length },
    tables: { users, customers, transactions, transaction_corrections: corrections, app_settings: settings, audit_logs: auditRows },
  };
  await audit(c.get("user").id, "admin.backup_downloaded", null, null, { counts: payload.counts });
  c.header("content-type", "application/json");
  c.header("content-disposition", `attachment; filename="backup-${today()}.json"`);
  return c.body(JSON.stringify(payload, null, 2));
});

/** Human-readable CSV copies of the two tables that matter most. */
admin.get("/admin/backup/:table.csv", async (c) => {
  await guardBackup();
  const table = c.req.param("table");
  if (table === "customers") {
    const rows = await sql`select code, name, phone, email, national_id, address, joined_on, status, notes from customers order by code`;
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", `attachment; filename="customers-backup-${today()}.csv"`);
    return c.body(toCSV(["code", "name", "phone", "email", "national_id", "address", "joined_on", "status", "notes"], rows.map((r) => [r.code, r.name, r.phone, r.email, r.national_id, r.address, String(r.joined_on).slice(0, 10), r.status, r.notes])));
  }
  if (table === "transactions") {
    const rows = await sql`select t.receipt_no, t.occurred_on, cu.code, cu.name, t.kind, t.amount, t.method, t.reference, t.note, t.voided_at, t.void_reason
      from transactions t join customers cu on cu.id = t.customer_id order by t.occurred_on, t.created_at`;
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", `attachment; filename="transactions-backup-${today()}.csv"`);
    return c.body(toCSV(
      ["receipt_no", "occurred_on", "customer_code", "customer", "kind", "amount", "method", "reference", "note", "voided_at", "void_reason"],
      rows.map((r) => [r.receipt_no, String(r.occurred_on).slice(0, 10), r.code, r.name, r.kind, r.amount, r.method, r.reference, r.note, r.voided_at ? String(r.voided_at).slice(0, 10) : "", r.void_reason]),
    ));
  }
  fail(404, "Choose customers or transactions.", "not_found");
});

admin.get("/admin/corrections", async (c) => {
  await guardBackup();
  return c.json({ corrections: await listCorrections() });
});

// --------------------------------------------------- customer email notifications
admin.get("/admin/notifications", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);
  return c.json({ status: await notificationStatus(), notifications: await listNotifications(limit) });
});

admin.get("/admin/audit", async (c) => {
  const q = c.req.query("q");
  const rows = await sql`select a.*, u.name as actor_name from audit_logs a left join users u on u.id = a.actor_id
    where (${q ?? null}::text is null or a.action like ${"%" + (q ?? "") + "%"} or a.object_id = ${q ?? null})
    order by a.id desc limit 300`;
  return c.json({ audit: rows });
});

// -------------------------------------------------------- demo data (reseed)
admin.post("/admin/demo/seed", async (c) => {
  if (!env.demoMode) fail(403, "Demo mode is off (DEMO_MODE=false).", "forbidden");
  const b = await readJson(c).catch(() => ({} as Record<string, unknown>));
  const edition: Edition = isEdition(b.edition) ? b.edition : await currentEdition();
  const result = await seedDemo(edition, { reset: true });
  return c.json({ ok: true, ...result });
});

admin.get("/admin/demo/status", async (c) => c.json({ demo_mode: env.demoMode, has_data: await hasData() }));
