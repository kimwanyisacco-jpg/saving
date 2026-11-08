// Balances and report maths. Pure functions over plain rows so the server, the
// tests and the browser demo all agree to the shilling.
import type { Balances, Customer, Transaction, TxKind } from "./types.ts";
import { formatMonth, monthKey } from "./dates.ts";

export const isCredit = (k: TxKind) => k === "credit_issued" || k === "credit_repayment";

/** Movement in shillings for one transaction. Signed: money in is positive. */
export function signedAmount(kind: TxKind, amount: number): number {
  switch (kind) {
    case "savings_deposit": return amount;
    case "savings_withdrawal": return -amount;
    case "credit_issued": return -amount;
    case "credit_repayment": return amount;
  }
}

const live = (txs: Transaction[]) => txs.filter((t) => !t.voided_at);

export function balances(txs: Transaction[]): Balances {
  const b: Balances = { savings: 0, credit_outstanding: 0, savings_in: 0, savings_out: 0, credit_issued: 0, credit_repaid: 0 };
  for (const t of live(txs)) {
    switch (t.kind) {
      case "savings_deposit": b.savings_in += t.amount; b.savings += t.amount; break;
      case "savings_withdrawal": b.savings_out += t.amount; b.savings -= t.amount; break;
      case "credit_issued": b.credit_issued += t.amount; b.credit_outstanding += t.amount; break;
      case "credit_repayment": b.credit_repaid += t.amount; b.credit_outstanding -= t.amount; break;
    }
  }
  return b;
}

export const sortByDate = (txs: Transaction[]) =>
  [...txs].sort((a, b) => (a.occurred_on === b.occurred_on ? a.created_at.localeCompare(b.created_at) : a.occurred_on.localeCompare(b.occurred_on)));

export interface StatementLine extends Transaction {
  savings_running: number;
  credit_running: number;
}

/** Chronological rows with a running savings and credit balance after each line. */
export function statementLines(txs: Transaction[]): StatementLine[] {
  let s = 0, c = 0;
  return sortByDate(live(txs)).map((t) => {
    switch (t.kind) {
      case "savings_deposit": s += t.amount; break;
      case "savings_withdrawal": s -= t.amount; break;
      case "credit_issued": c += t.amount; break;
      case "credit_repayment": c -= t.amount; break;
    }
    return { ...t, savings_running: s, credit_running: c };
  });
}

/** Opening balances immediately before `from` (so a range statement can show b/f). */
export function openingBalances(txs: Transaction[], from: string): Balances {
  return balances(live(txs).filter((t) => t.occurred_on < from));
}

export interface PeriodRow extends Balances {
  period: string;      // "YYYY-MM"
  label: string;       // "March 2026"
  count: number;
}

/** Monthly totals for the last `months` months ending at `endMonth` ("YYYY-MM"). */
export function monthlySeries(txs: Transaction[], endMonth: string, months = 6): PeriodRow[] {
  const rows = new Map<string, PeriodRow>();
  const [ey, em] = endMonth.split("-").map(Number);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ey, em - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    rows.set(key, { period: key, label: formatMonth(key), count: 0, savings: 0, credit_outstanding: 0, savings_in: 0, savings_out: 0, credit_issued: 0, credit_repaid: 0 });
  }
  for (const t of live(txs)) {
    const r = rows.get(monthKey(t.occurred_on));
    if (!r) continue;
    r.count++;
    switch (t.kind) {
      case "savings_deposit": r.savings_in += t.amount; r.savings += t.amount; break;
      case "savings_withdrawal": r.savings_out += t.amount; r.savings -= t.amount; break;
      case "credit_issued": r.credit_issued += t.amount; r.credit_outstanding += t.amount; break;
      case "credit_repayment": r.credit_repaid += t.amount; r.credit_outstanding -= t.amount; break;
    }
  }
  return [...rows.values()];
}

export interface CustomerActivity {
  customer_id: string;
  code: string;
  name: string;
  status: Customer["status"];
  savings: number;
  credit_outstanding: number;
  tx_count: number;
  last_activity: string | null;
}

/** Per-customer balances, most recently active first. Used by the activity report. */
export function customerActivity(customers: Customer[], txs: Transaction[]): CustomerActivity[] {
  const byCustomer = new Map<string, Transaction[]>();
  for (const t of live(txs)) {
    const list = byCustomer.get(t.customer_id);
    if (list) list.push(t); else byCustomer.set(t.customer_id, [t]);
  }
  return customers
    .map((cu) => {
      const list = byCustomer.get(cu.id) ?? [];
      const b = balances(list);
      const last = list.reduce<string | null>((acc, t) => (acc && acc > t.occurred_on ? acc : t.occurred_on), null);
      return { customer_id: cu.id, code: cu.code, name: cu.name, status: cu.status, savings: b.savings, credit_outstanding: b.credit_outstanding, tx_count: list.length, last_activity: last };
    })
    .sort((a, b) => (b.last_activity ?? "").localeCompare(a.last_activity ?? "") || a.name.localeCompare(b.name));
}

/** Simple text search across the fields the operator actually types. */
export function matchesQuery(q: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}
