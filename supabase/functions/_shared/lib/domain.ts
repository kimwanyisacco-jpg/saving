// Database access for customers, transactions, balances and reports. Everything
// that touches money goes through here so the rules live in one place.
import { sql, type Row } from "../db.ts";
import { fail } from "../http.ts";
import { audit } from "../audit.ts";
import { balances, customerActivity, monthlySeries, statementLines } from "../domain/compute.ts";
import type { Customer, Transaction, TxKind, TxMethod, CustomerStatus, DashboardTotals } from "../domain/types.ts";
import type { PeriodRow } from "../domain/compute.ts";
import { toISODate, toISOStamp, today } from "../domain/dates.ts";

const num = (v: unknown) => Number(v ?? 0);

export const toCustomer = (r: Row): Customer => ({
  id: r.id, code: r.code, name: r.name, phone: r.phone, email: r.email, national_id: r.national_id,
  address: r.address, joined_on: toISODate(r.joined_on), status: r.status, notes: r.notes,
  created_at: toISOStamp(r.created_at) ?? "", updated_at: toISOStamp(r.updated_at) ?? "",
});

export const toTransaction = (r: Row): Transaction => ({
  id: r.id, customer_id: r.customer_id, customer_name: r.customer_name ?? null, customer_code: r.customer_code ?? null,
  kind: r.kind, amount: num(r.amount), occurred_on: toISODate(r.occurred_on), method: r.method,
  reference: r.reference, note: r.note, receipt_no: r.receipt_no, recorded_by: r.recorded_by,
  recorded_by_name: r.recorded_by_name ?? null, created_at: toISOStamp(r.created_at) ?? "",
  voided_at: toISOStamp(r.voided_at), void_reason: r.void_reason ?? null,
});

// ------------------------------------------------------------------ customers
export async function listCustomers(opts: { q?: string; status?: string | null; limit?: number; offset?: number } = {}) {
  const q = (opts.q ?? "").trim().toLowerCase();
  const like = "%" + q + "%";
  const rows = await sql`
    select * from customers
    where (${q} = '' or lower(name) like ${like} or lower(code) like ${like} or coalesce(phone,'') like ${like} or coalesce(national_id,'') like ${like} or coalesce(address,'') like ${like})
      and (${opts.status ?? null}::text is null or status = ${opts.status ?? null})
    order by name
    limit ${Math.min(Math.max(opts.limit ?? 100, 1), 1000)} offset ${Math.max(opts.offset ?? 0, 0)}`;
  return rows.map(toCustomer);
}

export async function countCustomers() {
  const [r] = await sql`select count(*)::int as n, count(*) filter (where status = 'active')::int as active from customers`;
  return { total: num(r.n), active: num(r.active) };
}

export async function getCustomer(id: string): Promise<Customer> {
  const [r] = await sql`select * from customers where id = ${id}`;
  if (!r) fail(404, "Customer not found", "not_found");
  return toCustomer(r);
}

export interface CustomerInput {
  name: string; phone?: string | null; email?: string | null; national_id?: string | null;
  address?: string | null; joined_on?: string; status?: CustomerStatus; notes?: string | null;
}

export async function createCustomer(input: CustomerInput, actorId: string): Promise<Customer> {
  const [r] = await sql`
    insert into customers (name, phone, email, national_id, address, joined_on, status, notes, created_by)
    values (${input.name}, ${input.phone ?? null}, ${input.email ?? null}, ${input.national_id ?? null},
            ${input.address ?? null}, ${input.joined_on || today()}, ${input.status ?? "active"}, ${input.notes ?? null}, ${actorId})
    returning *`;
  await audit(actorId, "customer.created", "customer", r.id, { name: r.name });
  return toCustomer(r);
}

export async function updateCustomer(id: string, input: CustomerInput, actorId: string): Promise<Customer> {
  const before = await getCustomer(id);
  const [r] = await sql`
    update customers set
      name = ${input.name ?? before.name},
      phone = ${input.phone === undefined ? before.phone : input.phone},
      email = ${input.email === undefined ? before.email : input.email},
      national_id = ${input.national_id === undefined ? before.national_id : input.national_id},
      address = ${input.address === undefined ? before.address : input.address},
      joined_on = ${input.joined_on || before.joined_on},
      status = ${input.status ?? before.status},
      notes = ${input.notes === undefined ? before.notes : input.notes},
      updated_at = now()
    where id = ${id} returning *`;
  await audit(actorId, "customer.updated", "customer", id, { name: r.name });
  return toCustomer(r);
}

// --------------------------------------------------------------- transactions
export interface TxQuery {
  customer_id?: string | null; kind?: string | null; method?: string | null;
  from?: string | null; to?: string | null; q?: string | null;
  include_voided?: boolean; limit?: number; offset?: number;
}

export async function listTransactions(q: TxQuery = {}) {
  const search = (q.q ?? "").trim().toLowerCase();
  const like = "%" + search + "%";
  const rows = await sql`
    select t.*, c.name as customer_name, c.code as customer_code, u.name as recorded_by_name
    from transactions t
    join customers c on c.id = t.customer_id
    left join users u on u.id = t.recorded_by
    where (${q.customer_id ?? null}::uuid is null or t.customer_id = ${q.customer_id ?? null})
      and (${q.kind ?? null}::text is null or t.kind = ${q.kind ?? null})
      and (${q.method ?? null}::text is null or t.method = ${q.method ?? null})
      and (${q.from ?? null}::date is null or t.occurred_on >= ${q.from ?? null})
      and (${q.to ?? null}::date is null or t.occurred_on <= ${q.to ?? null})
      and (${q.include_voided ? true : false} or t.voided_at is null)
      and (${search} = '' or lower(coalesce(t.reference,'')) like ${like} or lower(coalesce(t.note,'')) like ${like}
           or lower(coalesce(t.receipt_no,'')) like ${like} or lower(c.name) like ${like} or lower(c.code) like ${like})
    order by t.occurred_on desc, t.created_at desc
    limit ${Math.min(Math.max(q.limit ?? 200, 1), 5000)} offset ${Math.max(q.offset ?? 0, 0)}`;
  return rows.map(toTransaction);
}

export async function getTransaction(id: string): Promise<Transaction> {
  const [r] = await sql`select t.*, c.name as customer_name, c.code as customer_code from transactions t join customers c on c.id = t.customer_id where t.id = ${id}`;
  if (!r) fail(404, "Transaction not found", "not_found");
  return toTransaction(r);
}

export interface TxInput {
  customer_id: string; kind: TxKind; amount: number; occurred_on?: string;
  method?: TxMethod; reference?: string | null; note?: string | null;
}

export async function createTransaction(input: TxInput, actorId: string): Promise<Transaction> {
  await getCustomer(input.customer_id); // 404s early if the customer is gone
  const [r] = await sql`
    insert into transactions (customer_id, kind, amount, occurred_on, method, reference, note, recorded_by, receipt_no)
    values (${input.customer_id}, ${input.kind}, ${input.amount}, ${input.occurred_on || today()},
            ${input.method ?? "cash"}, ${input.reference ?? null}, ${input.note ?? null}, ${actorId},
            'R-' || nextval('receipt_seq'))
    returning *`;
  await audit(actorId, "transaction.created", "transaction", r.id, { kind: r.kind, amount: num(r.amount) });
  return toTransaction(r);
}

async function recordCorrection(txId: string, action: "void" | "restore" | "amend", before: Row, after: Row, reason: string | null, actorId: string) {
  await sql`insert into transaction_corrections (transaction_id, action, before, after, reason, actor_id)
    values (${txId}, ${action}, ${sql.json(before as never)}, ${sql.json(after as never)}, ${reason}, ${actorId})`;
}

export async function voidTransaction(id: string, reason: string, actorId: string): Promise<Transaction> {
  const before = await getTransaction(id);
  if (before.voided_at) fail(409, "That transaction is already voided.", "conflict");
  const [r] = await sql`update transactions set voided_at = now(), void_reason = ${reason} where id = ${id} returning *`;
  await recordCorrection(id, "void", before as unknown as Row, toTransaction(r) as unknown as Row, reason, actorId);
  await audit(actorId, "transaction.voided", "transaction", id, { reason, amount: before.amount });
  return toTransaction(r);
}

export async function restoreTransaction(id: string, reason: string, actorId: string): Promise<Transaction> {
  const before = await getTransaction(id);
  if (!before.voided_at) fail(409, "That transaction is not voided.", "conflict");
  const [r] = await sql`update transactions set voided_at = null, void_reason = null where id = ${id} returning *`;
  await recordCorrection(id, "restore", before as unknown as Row, toTransaction(r) as unknown as Row, reason, actorId);
  await audit(actorId, "transaction.restored", "transaction", id, { reason });
  return toTransaction(r);
}

export async function amendTransaction(id: string, patch: { amount?: number; occurred_on?: string; method?: TxMethod; reference?: string | null; note?: string | null }, reason: string, actorId: string): Promise<Transaction> {
  const before = await getTransaction(id);
  const [r] = await sql`
    update transactions set
      amount = ${patch.amount ?? before.amount},
      occurred_on = ${patch.occurred_on || before.occurred_on},
      method = ${patch.method ?? before.method},
      reference = ${patch.reference === undefined ? before.reference : patch.reference},
      note = ${patch.note === undefined ? before.note : patch.note}
    where id = ${id} returning *`;
  await recordCorrection(id, "amend", before as unknown as Row, toTransaction(r) as unknown as Row, reason, actorId);
  await audit(actorId, "transaction.amended", "transaction", id, { reason, from: before.amount, to: num(r.amount) });
  return toTransaction(r);
}

export async function listCorrections(txId?: string, limit = 200) {
  const rows = await sql`
    select k.*, u.name as actor_name, c.name as customer_name, t.amount as tx_amount, t.kind as tx_kind
    from transaction_corrections k
    join transactions t on t.id = k.transaction_id
    join customers c on c.id = t.customer_id
    left join users u on u.id = k.actor_id
    where (${txId ?? null}::uuid is null or k.transaction_id = ${txId ?? null})
    order by k.created_at desc limit ${Math.min(limit, 1000)}`;
  return rows.map((r) => ({
    id: r.id, transaction_id: r.transaction_id, action: r.action, before: r.before, after: r.after,
    reason: r.reason, actor_id: r.actor_id, actor_name: r.actor_name, created_at: toISOStamp(r.created_at) ?? "",
    customer_name: r.customer_name, tx_amount: num(r.tx_amount), tx_kind: r.tx_kind,
  }));
}

// ------------------------------------------------------------------- balances
export async function allTransactions(): Promise<Transaction[]> {
  const rows = await sql`select t.*, c.name as customer_name, c.code as customer_code from transactions t join customers c on c.id = t.customer_id order by t.occurred_on, t.created_at`;
  return rows.map(toTransaction);
}

export async function customerBalances(customerId: string) {
  const txs = (await listTransactions({ customer_id: customerId, include_voided: true, limit: 5000 })).reverse();
  return { balances: balances(txs), transactions: txs };
}

export async function dashboardTotals(): Promise<DashboardTotals> {
  const txs = await allTransactions();
  const b = balances(txs);
  const { total, active } = await countCustomers();
  const thirtyDaysAgo = toISODate(new Date(Date.now() - 30 * 86400000));
  const live = txs.filter((t) => !t.voided_at);
  const last = live.reduce<string | null>((acc, t) => (acc && acc > t.occurred_on ? acc : t.occurred_on), null);
  return {
    ...b,
    customers: total,
    active_customers: active,
    transactions: live.length,
    transactions_30d: live.filter((t) => t.occurred_on >= thirtyDaysAgo).length,
    last_activity: last,
  };
}

export async function recentTransactions(limit = 10) {
  return listTransactions({ limit });
}

export async function statementFor(customerId: string, from?: string | null, to?: string | null) {
  const customer = await getCustomer(customerId);
  const all = (await listTransactions({ customer_id: customerId, include_voided: true, limit: 5000 })).reverse();
  const inRange = all.filter((t) => (!from || t.occurred_on >= from) && (!to || t.occurred_on <= to));
  return { customer, all, inRange, lines: statementLines(all) };
}

// -------------------------------------------------------------------- reports
export async function periodReport(from: string, to: string): Promise<PeriodRow[]> {
  const txs = await allTransactions();
  const months = monthsBetween(from, to);
  return monthlySeries(txs, to.slice(0, 7), Math.max(1, Math.min(months, 36)));
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

export async function activityReport(from?: string | null, to?: string | null) {
  const customers = await listCustomers({ limit: 1000 });
  const txs = (await allTransactions()).filter((t) => (!from || t.occurred_on >= from) && (!to || t.occurred_on <= to));
  return customerActivity(customers, txs);
}

export async function savingsCreditSummary(from: string, to: string) {
  const txs = (await allTransactions()).filter((t) => t.occurred_on >= from && t.occurred_on <= to && !t.voided_at);
  const b = balances(txs);
  const opening = balances((await allTransactions()).filter((t) => t.occurred_on < from && !t.voided_at));
  return { period: { from, to }, opening, movement: b, closing: { savings: opening.savings + b.savings, credit_outstanding: opening.credit_outstanding + b.credit_outstanding } };
}
