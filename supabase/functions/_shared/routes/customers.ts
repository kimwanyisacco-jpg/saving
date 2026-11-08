// Customers: add, edit, search. Improved filtering (status, joins, full-text across
// notes and references) is part of the Enhanced package.
import { Hono } from "npm:hono@4.6.14";
import { auth, fail, isoDate, oneOf, readJson, str, uuid, type Env } from "../http.ts";
import { audit } from "../audit.ts";
import { currentEdition } from "../settings.ts";
import { CAPS, hasCap } from "../domain/editions.ts";
import type { CustomerStatus } from "../domain/types.ts";
import { createCustomer, customerBalances, getCustomer, listCustomers, statementFor, updateCustomer } from "../lib/domain.ts";

export const customers = new Hono<Env>();
customers.use("/customers/*", auth());

const STATUSES = ["active", "dormant", "closed"] as const;

const body = (b: Record<string, any>, partial = false) => {
  const input: Record<string, unknown> = {};
  if (!partial || b.name !== undefined) input.name = str(b.name, "name", { min: 2, max: 120 });
  if (!partial || b.phone !== undefined) input.phone = str(b.phone, "phone", { optional: true, max: 30 }) || null;
  if (!partial || b.email !== undefined) {
    const email = str(b.email, "email", { optional: true, max: 120 }).toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, "Enter a valid email address.", "validation");
    input.email = email || null;
  }
  if (!partial || b.national_id !== undefined) input.national_id = str(b.national_id, "national ID", { optional: true, max: 40 }) || null;
  if (!partial || b.address !== undefined) input.address = str(b.address, "address", { optional: true, max: 200 }) || null;
  if (!partial || b.joined_on !== undefined) input.joined_on = isoDate(b.joined_on, "joined date", { optional: true }) || undefined;
  if (!partial || b.status !== undefined) input.status = oneOf<CustomerStatus>(b.status, "status", STATUSES, "active");
  if (!partial || b.notes !== undefined) input.notes = str(b.notes, "notes", { optional: true, max: 1000 }) || null;
  return input as never;
};

customers.get("/customers", async (c) => {
  const edition = await currentEdition();
  const enhanced = hasCap(edition, CAPS.improvedSearch);
  const q = str(c.req.query("q"), "search", { optional: true, max: 120 });
  const status = enhanced ? (c.req.query("status") || null) : null;
  const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 1000);
  const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);
  if (status && !STATUSES.includes(status as never)) fail(400, "status must be active, dormant or closed", "validation");
  const rows = await listCustomers({ q, status, limit, offset });
  return c.json({ customers: rows, edition, filters_applied: enhanced ? { q, status } : { q }, enhanced_search: enhanced });
});

// Search must come before the ":id" route so "/customers/search" is not read as an id.
customers.get("/customers/search", async (c) => {
  const q = str(c.req.query("q"), "search", { optional: true, max: 120 });
  const rows = await listCustomers({ q, limit: 20 });
  return c.json({ customers: rows });
});

customers.get("/customers/:id", async (c) => {
  const id = uuid(c.req.param("id"));
  const edition = await currentEdition();
  const customer = await getCustomer(id);
  const { balances: b, transactions } = await customerBalances(id);
  // Basic returns the record and totals; Classic and above also return the full
  // transaction history on the profile.
  const history = hasCap(edition, CAPS.profiles) ? transactions : transactions.slice(0, 10);
  return c.json({ customer, balances: b, transactions: history, full_history: hasCap(edition, CAPS.profiles), edition });
});

customers.get("/customers/:id/statement-data", async (c) => {
  const id = uuid(c.req.param("id"));
  const edition = await currentEdition();
  const from = hasCap(edition, CAPS.statementRange) ? isoDate(c.req.query("from"), "from date", { optional: true }) || null : null;
  const to = hasCap(edition, CAPS.statementRange) ? isoDate(c.req.query("to"), "to date", { optional: true }) || null : null;
  const s = await statementFor(id, from, to);
  return c.json({ customer: s.customer, lines: s.lines, from, to, edition });
});

customers.post("/customers", async (c) => {
  const input = body(await readJson(c));
  const customer = await createCustomer(input, c.get("user").id);
  return c.json({ customer }, 201);
});

customers.patch("/customers/:id", async (c) => {
  const id = uuid(c.req.param("id"));
  const customer = await updateCustomer(id, body(await readJson(c), true), c.get("user").id);
  return c.json({ customer });
});

customers.post("/customers/:id/status", async (c) => {
  const id = uuid(c.req.param("id"));
  const b = await readJson(c);
  const status = oneOf<CustomerStatus>(b.status, "status", STATUSES);
  const current = await getCustomer(id);
  const customer = await updateCustomer(id, { ...current, status } as never, c.get("user").id);
  await audit(c.get("user").id, "customer.status_changed", "customer", id, { from: current.status, to: status });
  return c.json({ customer });
});
