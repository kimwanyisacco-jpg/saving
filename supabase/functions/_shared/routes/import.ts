// Enhanced: import existing records from one clean spreadsheet (CSV, up to 500 rows).
// Nothing is written until the operator confirms the preview.
import { Hono } from "npm:hono@4.6.14";
import { auth, fail, readJson, str, type Env } from "../http.ts";
import { currentEdition } from "../settings.ts";
import { CAPS, hasCap } from "../domain/editions.ts";
import { parseCSV } from "../domain/csv.ts";
import { parseAmount } from "../domain/money.ts";
import { audit } from "../audit.ts";
import { sql } from "../db.ts";
import { today } from "../domain/dates.ts";
import { createTransaction, listCustomers } from "../lib/domain.ts";
import type { TxKind, TxMethod } from "../domain/types.ts";

export const importRoutes = new Hono<Env>();
importRoutes.use("/import/*", auth());

const MAX_ROWS = 500;

const KINDS = ["savings_deposit", "savings_withdrawal", "credit_issued", "credit_repayment"] as const;
const METHODS = ["cash", "bank", "mobile_money", "cheque", "other"] as const;

/** Accepts the words an operator is likely to type in the spreadsheet. */
function normaliseKind(v: string): TxKind | null {
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return null;
  if (KINDS.includes(s as TxKind)) return s as TxKind;
  const map: Record<string, TxKind> = {
    deposit: "savings_deposit", savings: "savings_deposit", saving: "savings_deposit", in: "savings_deposit", "savings_in": "savings_deposit",
    withdrawal: "savings_withdrawal", withdraw: "savings_withdrawal", out: "savings_withdrawal", "savings_out": "savings_withdrawal",
    credit: "credit_issued", loan: "credit_issued", "credit_given": "credit_issued", advance: "credit_issued", issued: "credit_issued",
    repayment: "credit_repayment", repay: "credit_repayment", paid: "credit_repayment", "credit_paid": "credit_repayment", refund: "credit_repayment",
  };
  return map[s] ?? null;
}

function normaliseMethod(v: string): TxMethod {
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (METHODS.includes(s as TxMethod)) return s as TxMethod;
  if (["mobile", "mtn", "airtel", "momo", "mobile_money"].includes(s)) return "mobile_money";
  if (["bank_transfer", "transfer", "bank"].includes(s)) return "bank";
  if (["check", "cheque"].includes(s)) return "cheque";
  return "cash";
}

/** Accepts 2026-03-31, 31/03/2026 or 31-03-2026. */
function normaliseDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const dd = d.padStart(2, "0"), mm = mo.padStart(2, "0");
    if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) return `${y}-${mm}-${dd}`;
  }
  return null;
}

const HEADER_ALIASES: Record<string, string> = {
  customer: "customer", "customer name": "customer", name: "customer", member: "customer", "member name": "customer",
  code: "code", "customer code": "code", "member code": "code", "account": "code",
  phone: "phone", "phone number": "phone", telephone: "phone", mobile: "phone",
  type: "kind", kind: "kind", "transaction type": "kind", nature: "kind", particular: "kind", particulars: "kind",
  amount: "amount", "amount (ugx)": "amount", ugx: "amount", value: "amount", money: "amount",
  date: "date", "transaction date": "date", "date (yyyy-mm-dd)": "date",
  method: "method", "payment method": "method", mode: "method",
  reference: "reference", ref: "reference", "receipt no": "reference", receipt: "reference",
  note: "note", notes: "note", description: "note", remarks: "note",
};

const mapHeaders = (headers: string[]) => headers.map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? "");

interface ParsedRow {
  row: number;
  customer: string;
  code: string;
  phone: string;
  kind: string;
  amount: number;
  date: string;
  method: TxMethod;
  reference: string;
  note: string;
  errors: string[];
  warning: string | null;
}

function parseRows(csv: string): { headers: string[]; mapping: string[]; rows: ParsedRow[]; unknown_headers: string[] } {
  const table = parseCSV(csv);
  if (table.length < 2) fail(400, "That file has no data rows. The first line must be the column headings.", "validation");
  const headers = table[0];
  const mapping = mapHeaders(headers);
  if (!mapping.includes("customer")) fail(400, "No customer column found. Rename the column to 'Customer'.", "validation");
  if (!mapping.includes("amount")) fail(400, "No amount column found. Rename the column to 'Amount'.", "validation");
  if (!mapping.includes("kind")) fail(400, "No transaction type column found. Rename the column to 'Type'.", "validation");

  const body = table.slice(1, MAX_ROWS + 1);
  const rows = body.map((cells, i) => {
    const get = (key: string) => {
      const idx = mapping.indexOf(key);
      return idx === -1 ? "" : (cells[idx] ?? "").trim();
    };
    const errors: string[] = [];
    const customer = get("customer");
    const rawKind = get("kind");
    const kind = normaliseKind(rawKind);
    const amount = parseAmount(get("amount"));
    const rawDate = get("date");
    const date = rawDate ? normaliseDate(rawDate) : today();
    if (!customer) errors.push("customer name is missing");
    if (!rawKind) errors.push("type is missing");
    else if (!kind) errors.push(`type "${rawKind}" is not understood`);
    if (amount == null || amount <= 0) errors.push("amount must be a number greater than zero");
    if (rawDate && !date) errors.push(`date "${rawDate}" is not understood`);
    return {
      row: i + 2,
      customer, code: get("code"), phone: get("phone"),
      kind: kind ?? rawKind, amount: amount ?? 0, date: date ?? today(),
      method: normaliseMethod(get("method")), reference: get("reference"), note: get("note"),
      errors,
      warning: null as string | null,
    };
  });
  const unknown_headers = headers.filter((_, i) => !mapping[i]);
  return { headers, mapping, rows, unknown_headers };
}

/** Parses and validates without writing anything. */
importRoutes.post("/import/preview", async (c) => {
  const edition = await currentEdition();
  if (!hasCap(edition, CAPS.import)) fail(402, "Spreadsheet import is part of the Enhanced package.", "edition_required");
  const b = await readJson(c);
  const csv = str(b.csv, "file contents", { min: 5, max: 2_000_000 });
  const parsed = parseRows(csv);

  // Flag rows whose customer is not on file yet, and rows that look like duplicates
  // of a transaction already recorded.
  const existing = await listCustomers({ limit: 1000 });
  const byName = new Map(existing.map((cu) => [cu.name.trim().toLowerCase(), cu]));
  const byCode = new Map(existing.map((cu) => [cu.code.toLowerCase(), cu]));
  for (const r of parsed.rows) {
    const match = byCode.get(r.code.toLowerCase()) ?? byName.get(r.customer.trim().toLowerCase());
    if (!match) r.warning = `"${r.customer}" is not on file yet; a customer record will be created.`;
  }

  const valid = parsed.rows.filter((r) => !r.errors.length);
  return c.json({
    headers: parsed.headers,
    mapping: parsed.mapping,
    unknown_headers: parsed.unknown_headers,
    rows: parsed.rows,
    total_rows: parsed.rows.length,
    valid_rows: valid.length,
    invalid_rows: parsed.rows.length - valid.length,
    limit: MAX_ROWS,
    truncated: parseCSV(csv).length - 1 > MAX_ROWS,
  });
});

/** Applies the import. Creates missing customers, then records each transaction. */
importRoutes.post("/import/commit", async (c) => {
  const edition = await currentEdition();
  if (!hasCap(edition, CAPS.import)) fail(402, "Spreadsheet import is part of the Enhanced package.", "edition_required");
  const b = await readJson(c);
  const csv = str(b.csv, "file contents", { min: 5, max: 2_000_000 });
  const parsed = parseRows(csv);
  const good = parsed.rows.filter((r) => !r.errors.length);
  if (!good.length) fail(400, "No valid rows to import. Fix the errors shown in the preview and try again.", "validation");

  const actorId = c.get("user").id;
  const existing = await listCustomers({ limit: 1000 });
  const byName = new Map(existing.map((cu) => [cu.name.trim().toLowerCase(), cu]));
  const byCode = new Map(existing.map((cu) => [cu.code.toLowerCase(), cu]));

  let createdCustomers = 0;
  let imported = 0;
  const failures: { row: number; error: string }[] = [];

  for (const r of good) {
    try {
      let customer = byCode.get(r.code.toLowerCase()) ?? byName.get(r.customer.trim().toLowerCase());
      if (!customer) {
        const [row] = await sql`insert into customers (name, phone, status, notes, created_by)
          values (${r.customer}, ${r.phone || null}, 'active', 'Created during spreadsheet import', ${actorId})
          returning id, code, name, phone, email, national_id, address, joined_on, status, notes, created_at, updated_at`;
        customer = {
          id: row.id, code: row.code, name: row.name, phone: row.phone, email: row.email, national_id: row.national_id,
          address: row.address, joined_on: String(row.joined_on).slice(0, 10), status: row.status, notes: row.notes,
          created_at: row.created_at, updated_at: row.updated_at,
        };
        byName.set(customer.name.trim().toLowerCase(), customer);
        byCode.set(customer.code.toLowerCase(), customer);
        createdCustomers++;
      }
      await createTransaction({
        customer_id: customer.id,
        kind: r.kind as TxKind,
        amount: r.amount,
        occurred_on: r.date,
        method: r.method,
        reference: r.reference || null,
        note: r.note || "Imported from spreadsheet",
      }, actorId);
      imported++;
    } catch (e) {
      failures.push({ row: r.row, error: (e as Error).message });
    }
  }

  await audit(actorId, "import.committed", null, null, { imported, created_customers: createdCustomers, failed: failures.length });
  return c.json({ ok: true, imported, created_customers: createdCustomers, skipped: parsed.rows.length - good.length, failures });
});

/** A sample file the operator can download and fill in. */
importRoutes.get("/import/template.csv", async (c) => {
  const edition = await currentEdition();
  if (!hasCap(edition, CAPS.import)) fail(402, "Spreadsheet import is part of the Enhanced package.", "edition_required");
  const rows = [
    ["Customer", "Phone", "Type", "Amount", "Date", "Method", "Reference", "Note"],
    ["Amara Nakato", "+256772123456", "Savings deposit", "50000", today(), "cash", "DEP-00001", "Opening balance"],
    ["Brian Okello", "+256701234567", "Credit issued", "200000", today(), "mobile_money", "CRD-00001", "School fees loan"],
    ["Brian Okello", "+256701234567", "Credit repayment", "50000", today(), "cash", "RPY-00001", "First instalment"],
  ];
  const { toCSV } = await import("../domain/csv.ts");
  c.header("content-type", "text/csv; charset=utf-8");
  c.header("content-disposition", 'attachment; filename="import-template.csv"');
  return c.body(toCSV(rows[0], rows.slice(1)));
});
