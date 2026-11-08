// Credit & Savings Records Management System API - a single Supabase Edge Function.
// Deployed: https://<project-ref>.supabase.co/functions/v1/api/v1/...
// Local:    deno run -A supabase/functions/api/index.ts  ->  http://localhost:8000/api/v1/...
import { Hono } from "npm:hono@4.6.14";
import { cors } from "npm:hono@4.6.14/cors";
import { ApiError } from "../_shared/http.ts";
import { env } from "../_shared/env.ts";
import { sql } from "../_shared/db.ts";
import { currentEdition, businessProfile } from "../_shared/settings.ts";
import { editionCapabilities, EDITION_META, FEATURES } from "../_shared/domain/editions.ts";
import { authRoutes } from "../_shared/routes/auth.ts";
import { customers } from "../_shared/routes/customers.ts";
import { transactions } from "../_shared/routes/transactions.ts";
import { dashboard } from "../_shared/routes/dashboard.ts";
import { reports } from "../_shared/routes/reports.ts";
import { statements } from "../_shared/routes/statements.ts";
import { importRoutes } from "../_shared/routes/import.ts";
import { admin } from "../_shared/routes/admin.ts";

const v1 = new Hono();

v1.get("/health", async (c) => {
  let db = false;
  try { await sql`select 1`; db = true; } catch { /* database down */ }
  return c.json({ ok: db, service: "credit-savings", version: "1.0.0", db, edition: await currentEdition(), time: new Date().toISOString() });
});

// Public: what the app needs before anyone signs in.
v1.get("/editions", (c) => c.json({ editions: Object.values(EDITION_META), features: FEATURES }));
v1.get("/settings/public", async (c) => c.json({ business: await businessProfile(), edition: await currentEdition(), capabilities: editionCapabilities(await currentEdition()) }));

for (const r of [authRoutes, customers, transactions, dashboard, reports, statements, importRoutes, admin]) {
  v1.route("/", r as unknown as Hono);
}

const app = new Hono();
const origins = env.corsOrigins === "*" ? "*" : env.corsOrigins.split(",").map((s) => s.trim());
app.use("*", cors({
  origin: origins as string,
  allowHeaders: ["Authorization", "Content-Type", "X-API-Key", "apikey", "x-client-info"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 86400,
}));
app.route("/api/v1", v1);
app.get("/", (c) => c.json({ service: "credit-savings", docs: "/api/v1/health" }));
app.get("/api", (c) => c.json({ service: "credit-savings", docs: "/api/v1/health" }));
app.notFound((c) => c.json({ error: "Not found", code: "not_found" }, 404));
app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: err.message, code: err.code }, err.status as 400);
  const pgCode = (err as { code?: string }).code;
  if (pgCode === "22P02") return c.json({ error: "That id is not valid", code: "bad_request" }, 400);
  if (pgCode === "23505") return c.json({ error: "That record already exists", code: "conflict" }, 409);
  if (pgCode === "23503") return c.json({ error: "That record is still in use", code: "conflict" }, 409);
  console.error("unhandled", err);
  return c.json({ error: "Something went wrong on our side. Please try again.", code: "server_error" }, 500);
});

const port = Number(Deno.env.get("PORT") ?? 8000);
Deno.serve({ port }, app.fetch);
