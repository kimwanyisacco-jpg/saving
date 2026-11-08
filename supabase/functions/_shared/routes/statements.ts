// Printable statements of account. The PDF is produced by the shared renderer, so
// the file the API streams is byte-identical to the one the offline demo builds.
import { Hono } from "npm:hono@4.6.14";
import { auth, fail, isoDate, uuid, type Env } from "../http.ts";
import { currentEdition, businessProfile } from "../settings.ts";
import { CAPS, hasCap } from "../domain/editions.ts";
import { buildStatement, statementFileName } from "../domain/statement.ts";
import { formatDate, today } from "../domain/dates.ts";
import { allTransactions, statementFor } from "../lib/domain.ts";

export const statements = new Hono<Env>();
statements.use("/statements/*", auth());

/** A one-page summary of the whole business for the selected period (Enhanced). */
statements.get("/statements/business.pdf", async (c) => {
  const edition = await currentEdition();
  if (!hasCap(edition, CAPS.reports)) fail(402, "This summary is part of the Enhanced package.", "edition_required");
  const to = isoDate(c.req.query("to"), "to date", { optional: true }) || today();
  const from = isoDate(c.req.query("from"), "from date", { optional: true }) || null;
  const txs = (await allTransactions()).filter((t) => (!from || t.occurred_on >= from) && t.occurred_on <= to);
  const profile = await businessProfile();
  const bytes = buildStatement({
    profile,
    customer: { code: "ALL", name: "All customers (business summary)", phone: null, email: null, address: null, status: "active", joined_on: from ?? "2000-01-01" },
    transactions: txs,
    from,
    to,
    edition,
    generatedAt: new Date().toISOString(),
    preparedBy: c.get("user").name,
  });
  c.header("content-type", "application/pdf");
  c.header("content-disposition", `attachment; filename="business-summary-${from ?? "start"}-to-${to}.pdf"`);
  return c.body(bytes.buffer as ArrayBuffer);
});

statements.get("/statements/:id", async (c) => {
  const id = uuid((c.req.param("id") ?? "").replace(/\.pdf$/, ""), "customer");
  const edition = await currentEdition();
  const ranged = hasCap(edition, CAPS.statementRange);
  const from = ranged ? isoDate(c.req.query("from"), "from date", { optional: true }) || null : null;
  const to = ranged ? isoDate(c.req.query("to"), "to date", { optional: true }) || null : null;
  if (from && to && from > to) fail(400, "The 'from' date is after the 'to' date.", "validation");

  const s = await statementFor(id, from, to);
  const bytes = buildStatement({
    profile: await businessProfile(),
    customer: s.customer,
    transactions: s.all,
    from,
    to,
    edition,
    generatedAt: new Date().toISOString(),
    preparedBy: c.get("user").name,
  });
  c.header("content-type", "application/pdf");
  c.header("content-disposition", `attachment; filename="${statementFileName(s.customer, from, to)}"`);
  return c.body(bytes.buffer as ArrayBuffer);
});

export { formatDate };
