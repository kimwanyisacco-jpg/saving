// Savings and credit transactions. Recording is in every package; voiding,
// correcting and exporting are Classic and above.
import { Hono } from "npm:hono@4.6.14";
import { auth, fail, isoDate, oneOf, readJson, str, uuid, type Env } from "../http.ts";
import { currentEdition } from "../settings.ts";
import { CAPS, hasCap } from "../domain/editions.ts";
import { parseAmount } from "../domain/money.ts";
import { toCSV } from "../domain/csv.ts";
import { formatDate } from "../domain/dates.ts";
import type { TxKind, TxMethod } from "../domain/types.ts";
import { amendTransaction, createTransaction, getTransaction, listCorrections, listTransactions, restoreTransaction, voidTransaction } from "../lib/domain.ts";

export const transactions = new Hono<Env>();
transactions.use("/transactions/*", auth());
transactions.use("/transactions", auth());

export const KINDS = ["savings_deposit", "savings_withdrawal", "credit_issued", "credit_repayment"] as const;
export const METHODS = ["cash", "bank", "mobile_money", "cheque", "other"] as const;

const amount = (v: unknown) => {
  const n = parseAmount(v);
  if (n == null) fail(400, "Enter the amount in shillings.", "validation");
  if (n <= 0) fail(400, "The amount must be more than zero.", "validation");
  if (n > 5_000_000_000) fail(400, "That amount looks too large. Please check it.", "validation");
  return n;
};

const guard = async (cap: keyof typeof CAPS) => {
  const edition = await currentEdition();
  if (!hasCap(edition, CAPS[cap])) fail(402, "This action is part of a higher package.", "edition_required");
  return edition;
};

transactions.get("/transactions", async (c) => {
  const edition = await currentEdition();
  const enhanced = hasCap(edition, CAPS.improvedSearch);
  const q = str(c.req.query("q"), "search", { optional: true, max: 120 });
  const customer_id = c.req.query("customer_id") ? uuid(c.req.query("customer_id"), "customer") : null;
  const kind = c.req.query("kind") ? oneOf<TxKind>(c.req.query("kind"), "type", KINDS) : null;
  const method = enhanced && c.req.query("method") ? oneOf<TxMethod>(c.req.query("method"), "method", METHODS) : null;
  const from = isoDate(c.req.query("from"), "from date", { optional: true }) || null;
  const to = isoDate(c.req.query("to"), "to date", { optional: true }) || null;
  const include_voided = hasCap(edition, CAPS.corrections) && c.req.query("include_voided") === "true";
  const rows = await listTransactions({
    q, customer_id, kind, method, from, to, include_voided,
    limit: Math.min(Number(c.req.query("limit") ?? 200) || 200, 5000),
    offset: Math.max(Number(c.req.query("offset") ?? 0) || 0, 0),
  });
  return c.json({ transactions: rows, edition, enhanced_filters: enhanced });
});

transactions.post("/transactions", async (c) => {
  const b = await readJson(c);
  const tx = await createTransaction({
    customer_id: uuid(b.customer_id, "customer"),
    kind: oneOf<TxKind>(b.kind, "type", KINDS),
    amount: amount(b.amount),
    occurred_on: isoDate(b.occurred_on, "date", { optional: true }) || undefined,
    method: oneOf<TxMethod>(b.method, "method", METHODS, "cash"),
    reference: str(b.reference, "reference", { optional: true, max: 60 }) || null,
    note: str(b.note, "note", { optional: true, max: 400 }) || null,
  }, c.get("user").id);
  return c.json({ transaction: tx }, 201);
});

transactions.get("/transactions/export", async (c) => {
  await guard("csv");
  const customer_id = c.req.query("customer_id") ? uuid(c.req.query("customer_id"), "customer") : null;
  const kind = c.req.query("kind") ? oneOf<TxKind>(c.req.query("kind"), "type", KINDS) : null;
  const from = isoDate(c.req.query("from"), "from date", { optional: true }) || null;
  const to = isoDate(c.req.query("to"), "to date", { optional: true }) || null;
  const rows = await listTransactions({ customer_id, kind, from, to, include_voided: true, limit: 5000 });
  const csv = toCSV(
    ["Receipt", "Date", "Customer code", "Customer", "Type", "Amount (UGX)", "Method", "Reference", "Note", "Recorded by", "Voided"],
    rows.map((t) => [t.receipt_no, t.occurred_on, t.customer_code, t.customer_name, t.kind, t.amount, t.method, t.reference, t.note, t.recorded_by_name, t.voided_at ? formatDate(t.voided_at.slice(0, 10)) : ""]),
  );
  c.header("content-type", "text/csv; charset=utf-8");
  c.header("content-disposition", `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.body(csv);
});

transactions.get("/transactions/corrections", async (c) => {
  await guard("corrections");
  const txId = c.req.query("transaction_id") ? uuid(c.req.query("transaction_id"), "transaction") : undefined;
  return c.json({ corrections: await listCorrections(txId) });
});

transactions.get("/transactions/:id", async (c) => {
  const id = uuid(c.req.param("id"));
  return c.json({ transaction: await getTransaction(id) });
});

transactions.post("/transactions/:id/void", async (c) => {
  await guard("corrections");
  const id = uuid(c.req.param("id"));
  const b = await readJson(c);
  const reason = str(b.reason, "reason", { min: 3, max: 300 });
  return c.json({ transaction: await voidTransaction(id, reason, c.get("user").id) });
});

transactions.post("/transactions/:id/restore", async (c) => {
  await guard("corrections");
  const id = uuid(c.req.param("id"));
  const b = await readJson(c);
  const reason = str(b.reason, "reason", { min: 3, max: 300 });
  return c.json({ transaction: await restoreTransaction(id, reason, c.get("user").id) });
});

transactions.patch("/transactions/:id", async (c) => {
  await guard("corrections");
  const id = uuid(c.req.param("id"));
  const b = await readJson(c);
  const reason = str(b.reason, "reason", { min: 3, max: 300 });
  const tx = await amendTransaction(id, {
    amount: b.amount === undefined ? undefined : amount(b.amount),
    occurred_on: isoDate(b.occurred_on, "date", { optional: true }) || undefined,
    method: b.method === undefined ? undefined : oneOf<TxMethod>(b.method, "method", METHODS),
    reference: b.reference === undefined ? undefined : (str(b.reference, "reference", { optional: true, max: 60 }) || null),
    note: b.note === undefined ? undefined : (str(b.note, "note", { optional: true, max: 400 }) || null),
  }, reason, c.get("user").id);
  return c.json({ transaction: tx });
});
