"use client";
// Offline demo backend. It runs the same shared domain code as the Edge Function
// (balances, reports, statements) over a demo dataset held in localStorage, so the
// hosted demo needs no server at all and every number matches the live product.
import { buildDemoDataset, demoAccounts } from "../../supabase/functions/_shared/domain/demo";
import { EDITION_META, EDITIONS, editionCapabilities, hasCap, CAPS } from "../../supabase/functions/_shared/domain/editions";
import { balances, customerActivity, monthlySeries, statementLines } from "../../supabase/functions/_shared/domain/compute";
import { buildStatement, statementFileName } from "../../supabase/functions/_shared/domain/statement";
import { referenceFor } from "../../supabase/functions/_shared/domain/refs";
import { customerWelcome, notificationsOpen, notificationWindowEnd, transactionReceipt } from "../../supabase/functions/_shared/domain/notify";
import { notifyDays } from "../../supabase/functions/_shared/domain/editions";
import { addMonths, today, toISODate } from "../../supabase/functions/_shared/domain/dates";
import type { BusinessProfile, Customer, Edition, Transaction, TxKind, TxMethod } from "../../supabase/functions/_shared/domain/types";

const KEY = "credit-savings.demo.v4";

export interface DemoCorrection {
  id: string; transaction_id: string; action: "void" | "restore" | "amend";
  reason: string | null; actor_name: string | null; created_at: string;
  customer_name: string | null; tx_amount: number | null; tx_kind: string | null;
}

export interface DemoNotification {
  id: string; kind: "customer_registered" | "transaction_recorded";
  recipient: string; subject: string; body: string;
  status: "queued" | "sent" | "failed" | "skipped";
  customer_name: string | null; customer_code: string | null;
  created_at: string; sent_at: string | null;
}

export interface DemoState {
  edition: Edition;
  profile: BusinessProfile;
  /** ISO day the system was handed over; starts the customer-email window. */
  handover_on: string | null;
  notifications: DemoNotification[];
  staff: { id: string; name: string; email: string; phone: string; role: "admin" | "staff"; password: string; is_active?: boolean; last_login_at?: string | null }[];
  customers: Customer[];
  transactions: Transaction[];
  corrections: DemoCorrection[];
  generated_at: string;
}

/** Who is acting, so new records are attributed the same way the server does. */
export interface Actor { id: string; name: string }

const staffId = (i: number) => `00000000-0000-4000-a000-${String(i + 1).padStart(12, "0")}`;

export function freshState(edition: Edition): DemoState {
  const d = buildDemoDataset(edition);
  const staff = d.staff.map((s, i) => ({ ...s, id: staffId(i) }));
  return {
    edition,
    profile: d.profile,
    // The demo is presented as already handed over, so the email window is open.
    handover_on: d.generated_at.slice(0, 10),
    notifications: [],
    staff,
    customers: d.customers,
    // The dataset leaves recorded_by null (the server fills it in on insert);
    // spread the work across the demo staff so "recorded by" is meaningful.
    transactions: d.transactions.map((t, i) => ({ ...t, recorded_by: staff[i % staff.length].id })),
    corrections: [],
    generated_at: d.generated_at,
  };
}

export function loadState(): DemoState {
  if (typeof window === "undefined") return freshState("classic");
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as DemoState;
      if (s?.edition && s.customers?.length) return repair(s);
    }
  } catch { /* fall through to a fresh dataset */ }
  const s = freshState("classic");
  saveState(s);
  return s;
}

/** Fills in fields a dataset saved by an older build may be missing. */
function repair(s: DemoState): DemoState {
  if (s.staff.length && s.transactions.some((t) => !t.recorded_by)) {
    s.transactions = s.transactions.map((t, i) => (t.recorded_by ? t : { ...t, recorded_by: s.staff[i % s.staff.length].id }));
  }
  if (!Array.isArray(s.corrections)) s.corrections = [];
  if (!Array.isArray(s.notifications)) s.notifications = [];
  if (s.handover_on === undefined) s.handover_on = s.generated_at.slice(0, 10);
  return s;
}

export function saveState(s: DemoState) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full */ }
}

export function resetState(edition: Edition): DemoState {
  const s = freshState(edition);
  saveState(s);
  return s;
}

const uuid = () => "xxxxxxxx-xxxx-4xxx-axxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

function withNames(s: DemoState, t: Transaction): Transaction {
  const c = s.customers.find((x) => x.id === t.customer_id);
  const u = s.staff.find((x) => x.id === t.recorded_by);
  return { ...t, customer_name: c?.name ?? null, customer_code: c?.code ?? null, recorded_by_name: u?.name ?? null };
}

const live = (txs: Transaction[]) => txs.filter((t) => !t.voided_at);

function totals(s: DemoState) {
  const b = balances(s.transactions);
  const t = live(s.transactions);
  const thirty = toISODate(new Date(Date.now() - 30 * 86400000));
  return {
    ...b,
    customers: s.customers.length,
    active_customers: s.customers.filter((c) => c.status === "active").length,
    transactions: t.length,
    transactions_30d: t.filter((x) => x.occurred_on >= thirty).length,
    last_activity: t.reduce<string | null>((a, x) => (a && a > x.occurred_on ? a : x.occurred_on), null),
  };
}

export interface DemoResponse { status: number; body: any; blob?: Blob; filename?: string }

const ok = (body: any): DemoResponse => ({ status: 200, body });
const err = (status: number, error: string, code = "error"): DemoResponse => ({ status, body: { error, code } });

/** The next receipt sequence, shared by the receipt number and the reference. */
function nextReceiptSeq(s: DemoState) {
  return s.transactions.reduce((a, t) => {
    const m = /^R-(\d+)$/.exec(t.receipt_no ?? "");
    return m ? Math.max(a, Number(m[1])) : a;
  }, 100000) + 1;
}

/** The demo's mail sender: it records what would go to the customer, exactly as
 *  the server records it in the outbox, so the presentation can show the inbox. */
function notifyCustomer(s: DemoState, build: (ctx: Parameters<typeof customerWelcome>[0]) => ReturnType<typeof customerWelcome>) {
  const ctx = {
    business_name: s.profile.name, business_phone: s.profile.phone, business_email: s.profile.email,
    edition: s.edition, handover_on: s.handover_on, today: today(),
  };
  if (!notificationsOpen(ctx)) return;
  const msg = build(ctx);
  if (!msg) return;
  const c = s.customers.find((x) => x.id === msg.customer_id);
  s.notifications.unshift({
    id: uuid(), kind: msg.kind, recipient: msg.to, subject: msg.subject, body: msg.text,
    status: "sent", customer_name: c?.name ?? null, customer_code: c?.code ?? null,
    created_at: new Date().toISOString(), sent_at: new Date().toISOString(),
  });
}

function notificationStatus(s: DemoState) {
  const ctx = { business_name: s.profile.name, business_phone: s.profile.phone, business_email: s.profile.email, edition: s.edition, handover_on: s.handover_on, today: today() };
  return {
    open: notificationsOpen(ctx),
    configured: true,
    handover_on: s.handover_on,
    window_ends_on: notificationWindowEnd(ctx),
    edition: s.edition,
    days: notifyDays(s.edition),
  };
}

function nextCode(s: DemoState) {
  const max = s.customers.reduce((a, c) => {
    const m = /^C-(\d+)$/.exec(c.code);
    return m ? Math.max(a, Number(m[1])) : a;
  }, 0);
  return "C-" + String(max + 1).padStart(4, "0");
}

/** The demo equivalent of the REST surface the real app calls. */
export function handle(method: string, path: string, body: any, actor?: Actor): DemoResponse {
  const s = loadState();
  const [rawRoute, qs] = path.split("?");
  const q = new URLSearchParams(qs ?? "");
  const edition = s.edition;
  const caps = editionCapabilities(edition);
  const parts = rawRoute.replace(/^\/+|\/+$/g, "").split("/");
  const route = parts.join("/");

  if (route === "auth/login" && method === "POST") {
    const email = String(body?.login ?? "").toLowerCase();
    // A demo account may belong to a different package than the one currently
    // loaded, so look the credentials up across every package and switch if needed.
    const account = EDITIONS.flatMap((e) => demoAccounts(e)).find(
      (a) => a.login.toLowerCase() === email && a.password === body?.password,
    );
    if (account && account.edition !== s.edition) {
      const switched = resetState(account.edition);
      s.staff = switched.staff; s.customers = switched.customers; s.transactions = switched.transactions;
      s.profile = switched.profile; s.edition = switched.edition;
    }
    const u = s.staff.find((x) => x.email.toLowerCase() === email && x.password === body?.password);
    if (!u) return err(401, "That email or password is not right.");
    if (u.is_active === false) return err(403, "That account has been switched off.", "forbidden");
    u.last_login_at = new Date().toISOString();
    saveState(s);
    return ok({ token: "demo." + u.id, user: { ...u, is_active: true, created_at: s.generated_at }, edition: s.edition, capabilities: editionCapabilities(s.edition), business: s.profile });
  }
  if (route === "auth/me") {
    const u = s.staff.find((x) => "demo." + x.id === body?.token) ?? s.staff[0];
    return ok({ user: { ...u, is_active: true, last_login_at: null, created_at: s.generated_at }, edition, capabilities: caps, business: s.profile });
  }
  if (route === "auth/logout") return ok({ ok: true });

  if (route === "setup/status") {
    return ok({ service: "credit-savings", edition, editions: Object.values(EDITION_META), business: s.profile, users: s.staff.length, demo_mode: true, can_seed: false, capabilities: caps, offline: true });
  }
  if (route === "setup/demo" && method === "POST") {
    const next = resetState((body?.edition as Edition) ?? edition);
    return ok({ ok: true, edition: next.edition, business: next.profile, customers: next.customers.length, transactions: next.transactions.length, accounts: demoAccounts(next.edition) });
  }

  if (route === "dashboard") {
    const t = totals(s);
    const payload: any = {
      edition, capabilities: caps, totals: t,
      recent_transactions: [...s.transactions].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).slice(0, 8).map((x) => withNames(s, x)),
    };
    if (hasCap(edition, CAPS.separateBalances)) {
      payload.savings_credit = {
        savings: t.savings, savings_in: t.savings_in, savings_out: t.savings_out,
        credit_issued: t.credit_issued, credit_repaid: t.credit_repaid, credit_outstanding: t.credit_outstanding,
        repayment_rate: t.credit_issued > 0 ? Math.round((t.credit_repaid / t.credit_issued) * 100) : 0,
      };
    }
    if (hasCap(edition, CAPS.reports)) {
      const to = q.get("to") || today();
      const from = q.get("from") || addMonths(to, -5);
      payload.range = { from, to };
      payload.trend = monthlySeries(s.transactions, to.slice(0, 7), 6);
      payload.in_range = live(s.transactions).filter((x) => x.occurred_on >= from && x.occurred_on <= to).length;
    }
    return ok(payload);
  }

  if (parts[0] === "customers") {
    const enhanced = hasCap(edition, CAPS.improvedSearch);
    if (parts.length === 1 && method === "GET") {
      const search = (q.get("q") ?? "").toLowerCase();
      const status = enhanced ? q.get("status") : null;
      const rows = s.customers
        .filter((c) => (!status || c.status === status))
        .filter((c) => !search || [c.name, c.code, c.phone, c.national_id, c.address].some((v) => (v ?? "").toLowerCase().includes(search)))
        .sort((a, b) => a.name.localeCompare(b.name));
      return ok({ customers: rows, edition, filters_applied: { q: search, status }, enhanced_search: enhanced });
    }
    if (parts.length === 1 && method === "POST") {
      const c: Customer = {
        id: uuid(), code: nextCode(s), name: String(body.name ?? "").trim(),
        phone: body.phone || null, email: body.email || null, national_id: body.national_id || null,
        address: body.address || null, joined_on: body.joined_on || today(), status: body.status || "active",
        notes: body.notes || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      s.customers.push(c);
      notifyCustomer(s, (ctx) => customerWelcome(ctx, c));
      saveState(s);
      return { status: 201, body: { customer: c } };
    }
    const c = s.customers.find((x) => x.id === parts[1].replace(/\.pdf$/, ""));
    if (!c) return err(404, "Customer not found", "not_found");
    if (parts.length === 2 && method === "GET") {
      const txs = s.transactions.filter((t) => t.customer_id === c.id).map((t) => withNames(s, t));
      const full = hasCap(edition, CAPS.profiles);
      return ok({ customer: c, balances: balances(txs), transactions: full ? txs : txs.slice(0, 10), full_history: full, edition });
    }
    if (parts.length === 2 && (method === "PATCH" || method === "PUT")) {
      Object.assign(c, {
        name: body.name ?? c.name, phone: body.phone === undefined ? c.phone : body.phone,
        email: body.email === undefined ? c.email : body.email,
        national_id: body.national_id === undefined ? c.national_id : body.national_id,
        address: body.address === undefined ? c.address : body.address,
        status: body.status ?? c.status, notes: body.notes === undefined ? c.notes : body.notes,
        updated_at: new Date().toISOString(),
      });
      saveState(s);
      return ok({ customer: c });
    }
    if (parts[2] === "statement-data") {
      const from = hasCap(edition, CAPS.statementRange) ? q.get("from") : null;
      const to = hasCap(edition, CAPS.statementRange) ? q.get("to") : null;
      const all = s.transactions.filter((t) => t.customer_id === c.id);
      return ok({ customer: c, lines: statementLines(all), from, to, edition });
    }
    return err(404, "Not found", "not_found");
  }

  if (parts[0] === "transactions") {
    if (parts[1] === "corrections") {
      if (!hasCap(edition, CAPS.corrections)) return err(402, "This history is part of the Classic package.", "edition_required");
      return ok({ corrections: [...s.corrections].sort((a, b) => b.created_at.localeCompare(a.created_at)) });
    }
    if (parts[1] === "export") {
      if (!hasCap(edition, CAPS.csv)) return err(402, "CSV export is part of the Classic package.", "edition_required");
      const rows = s.transactions.map((t) => withNames(s, t));
      const csv = [["Receipt", "Date", "Customer code", "Customer", "Type", "Amount (UGX)", "Method", "Reference", "Note", "Recorded by", "Voided"],
        ...rows.map((t) => [t.receipt_no, t.occurred_on, t.customer_code, t.customer_name, t.kind, t.amount, t.method, t.reference, t.note, t.recorded_by_name, t.voided_at ? "yes" : ""])]
        .map((r) => r.map((v) => (String(v ?? "").match(/[",\n]/) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? ""))).join(",")).join("\r\n") + "\r\n";
      return { status: 200, body: null, blob: new Blob([csv], { type: "text/csv" }), filename: "transactions.csv" };
    }
    if (parts.length === 1 && method === "GET") {
      const search = (q.get("q") ?? "").toLowerCase();
      const kind = q.get("kind");
      const customer_id = q.get("customer_id");
      const from = q.get("from");
      const to = q.get("to");
      const includeVoided = hasCap(edition, CAPS.corrections) && q.get("include_voided") === "true";
      const rows = s.transactions
        .filter((t) => includeVoided || !t.voided_at)
        .filter((t) => (!kind || t.kind === kind) && (!customer_id || t.customer_id === customer_id))
        .filter((t) => (!from || t.occurred_on >= from) && (!to || t.occurred_on <= to))
        .map((t) => withNames(s, t))
        .filter((t) => !search || [t.customer_name, t.customer_code, t.reference, t.note, t.receipt_no].some((v) => (v ?? "").toLowerCase().includes(search)))
        .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at));
      return ok({ transactions: rows, edition, enhanced_filters: hasCap(edition, CAPS.improvedSearch) });
    }
    if (parts.length === 1 && method === "POST") {
      const amount = Math.round(Number(String(body.amount ?? "").replace(/[^0-9.]/g, "")) || 0);
      if (!(amount > 0)) return err(400, "Enter the amount in shillings.", "validation");
      const seq = nextReceiptSeq(s);
      const t: Transaction = {
        id: uuid(), customer_id: body.customer_id, kind: body.kind, amount,
        occurred_on: body.occurred_on || today(), method: body.method || "cash",
        reference: referenceFor(body.kind as TxKind, seq), note: body.note || null,
        receipt_no: "R-" + seq, recorded_by: actor?.id ?? s.staff[0].id,
        created_at: new Date().toISOString(), voided_at: null, void_reason: null,
      };
      s.transactions.push(t);
      const customer = s.customers.find((x) => x.id === t.customer_id);
      if (customer) notifyCustomer(s, (ctx) => transactionReceipt(ctx, customer, t));
      saveState(s);
      return { status: 201, body: { transaction: withNames(s, t) } };
    }
    const t = s.transactions.find((x) => x.id === parts[1]);
    if (!t) return err(404, "Transaction not found", "not_found");
    if (parts.length === 3 && (parts[2] === "void" || parts[2] === "restore")) {
      if (!hasCap(edition, CAPS.corrections)) return err(402, "Corrections are part of the Classic package.", "edition_required");
      const c = s.customers.find((x) => x.id === t.customer_id);
      if (parts[2] === "void") { t.voided_at = new Date().toISOString(); t.void_reason = body?.reason ?? null; }
      else { t.voided_at = null; t.void_reason = null; }
      s.corrections.push({
        id: uuid(), transaction_id: t.id, action: parts[2] as "void" | "restore",
        reason: body?.reason ?? null, actor_name: actor?.name ?? null, created_at: new Date().toISOString(),
        customer_name: c?.name ?? null, tx_amount: t.amount, tx_kind: t.kind,
      });
      saveState(s);
      return ok({ transaction: withNames(s, t) });
    }
    return err(404, "Not found", "not_found");
  }

  if (parts[0] === "reports") {
    if (!hasCap(edition, CAPS.reports)) return err(402, "Reports are part of the Enhanced package.", "edition_required");
    const to = q.get("to") || today();
    const from = q.get("from") || addMonths(to, -5);
    if (parts[1] === "summary") {
      const inRange = live(s.transactions).filter((t) => t.occurred_on >= from && t.occurred_on <= to);
      const before = live(s.transactions).filter((t) => t.occurred_on < from);
      const opening = balances(before), movement = balances(inRange);
      return ok({
        period: { from, to }, opening, movement,
        closing: { savings: opening.savings + movement.savings, credit_outstanding: opening.credit_outstanding + movement.credit_outstanding },
        months: monthlySeries(s.transactions, to.slice(0, 7), 6),
      });
    }
    if (parts[1] === "activity" || parts[1] === "outstanding") {
      if (parts[1] === "outstanding") {
        // A live position: never limited to the report range.
        const owing = customerActivity(s.customers, live(s.transactions)).filter((r) => r.credit_outstanding > 0).sort((a, b) => b.credit_outstanding - a.credit_outstanding);
        return ok({ as_at: today(), rows: owing, total_outstanding: owing.reduce((a, r) => a + r.credit_outstanding, 0) });
      }
      const rows = customerActivity(s.customers, live(s.transactions).filter((t) => t.occurred_on >= from && t.occurred_on <= to));
      return ok({ from, to, rows, totals: rows.reduce((a, r) => ({ savings: a.savings + r.savings, credit_outstanding: a.credit_outstanding + r.credit_outstanding, transactions: a.transactions + r.tx_count }), { savings: 0, credit_outstanding: 0, transactions: 0 }) });
    }
    return err(404, "Not found", "not_found");
  }

  if (parts[0] === "statements") {
    const to = q.get("to") || today();
    if (parts[1] === "business.pdf" || parts[1] === "business") {
      if (!hasCap(edition, CAPS.reports)) return err(402, "This summary is part of the Enhanced package.", "edition_required");
      const from = q.get("from") || null;
      const txs = s.transactions.filter((t) => (!from || t.occurred_on >= from) && t.occurred_on <= to);
      const bytes = buildStatement({
        profile: s.profile,
        customer: { code: "ALL", name: "All customers (business summary)", phone: null, email: null, address: null, status: "active", joined_on: from ?? "2000-01-01" },
        transactions: txs, from, to, edition, generatedAt: new Date().toISOString(), preparedBy: "Demo operator",
      });
      return { status: 200, body: null, blob: new Blob([bytes], { type: "application/pdf" }), filename: `business-summary-to-${to}.pdf` };
    }
    const c = s.customers.find((x) => x.id === parts[1].replace(/\.pdf$/, ""));
    if (!c) return err(404, "Customer not found", "not_found");
    const from = hasCap(edition, CAPS.statementRange) ? q.get("from") : null;
    const toDate = hasCap(edition, CAPS.statementRange) ? q.get("to") : null;
    const bytes = buildStatement({
      profile: s.profile,
      customer: c,
      transactions: s.transactions.filter((t) => t.customer_id === c.id),
      from, to: toDate, edition, generatedAt: new Date().toISOString(), preparedBy: "Demo operator",
    });
    return { status: 200, body: null, blob: new Blob([bytes], { type: "application/pdf" }), filename: statementFileName(c, from, toDate) };
  }

  if (parts[0] === "import") {
    if (!hasCap(edition, CAPS.import)) return err(402, "Spreadsheet import is part of the Enhanced package.", "edition_required");
    if (parts[1] === "template.csv") {
      const rows = [
        ["Customer", "Phone", "Type", "Amount", "Date", "Method", "Reference", "Note"],
        ["Amara Nakato", "+256772123456", "Savings deposit", "50000", today(), "cash", "DEP-00001", "Opening balance"],
        ["Brian Okello", "+256701234567", "Credit issued", "200000", today(), "mobile_money", "CRD-00001", "School fees loan"],
      ];
      return { status: 200, body: null, blob: new Blob([rows.map((r) => r.join(",")).join("\r\n") + "\r\n"], { type: "text/csv" }), filename: "import-template.csv" };
    }
    const parsed = parseImport(String(body?.csv ?? ""));
    if ("error" in parsed) return err(400, parsed.error, "validation");
    if (parts[1] === "preview") {
      const known = new Set(s.customers.map((c) => c.name.trim().toLowerCase()));
      const rows = parsed.rows.map((r) => ({ ...r, warning: known.has(r.customer.trim().toLowerCase()) ? null : `"${r.customer}" is not on file yet; a customer record will be created.` }));
      return ok({ headers: parsed.headers, mapping: parsed.mapping, unknown_headers: parsed.unknown_headers, rows, total_rows: rows.length, valid_rows: rows.filter((r) => !r.errors.length).length, invalid_rows: rows.filter((r) => r.errors.length).length, limit: 500, truncated: false });
    }
    if (parts[1] === "commit") {
      let imported = 0, created = 0;
      for (const r of parsed.rows.filter((x) => !x.errors.length)) {
        let c = s.customers.find((x) => x.name.trim().toLowerCase() === r.customer.trim().toLowerCase());
        if (!c) {
          c = { id: uuid(), code: nextCode(s), name: r.customer, phone: r.phone || null, email: null, national_id: null, address: null, joined_on: today(), status: "active", notes: "Created during spreadsheet import", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          s.customers.push(c); created++;
        }
        const seq = nextReceiptSeq(s);
        s.transactions.push({ id: uuid(), customer_id: c.id, kind: r.kind as TxKind, amount: r.amount, occurred_on: r.date, method: r.method, reference: r.reference || referenceFor(r.kind as TxKind, seq), note: r.note || "Imported from spreadsheet", receipt_no: "R-" + seq, recorded_by: actor?.id ?? s.staff[0].id, created_at: new Date().toISOString(), voided_at: null, void_reason: null });
        imported++;
      }
      saveState(s);
      return ok({ ok: true, imported, created_customers: created, skipped: parsed.rows.length - imported, failures: [] });
    }
  }

  if (parts[0] === "admin") {
    if (parts[1] === "overview") {
      const t = totals(s);
      return ok({
        users: s.staff.length, admins: s.staff.filter((x) => x.role === "admin").length,
        customers: s.customers.length, transactions: s.transactions.length,
        voided: s.transactions.filter((x) => x.voided_at).length, corrections: s.corrections.length,
        totals: t, edition, capabilities: caps, business: s.profile, demo_mode: true,
        notifications: notificationStatus(s),
      });
    }
    if (parts[1] === "users") {
      if (method === "GET") return ok({ users: s.staff.map((u) => ({ ...u, is_active: u.is_active !== false, last_login_at: u.last_login_at ?? null, created_at: s.generated_at })) });
      if (method === "POST") {
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err(400, "Enter a valid email address.", "validation");
        const name = String(body.name ?? "").trim();
        if (name.length < 2) return err(400, "Enter the person's name.", "validation");
        if (s.staff.some((u) => u.email.toLowerCase() === email)) return err(409, "An account with that email already exists.", "conflict");
        const u = { id: uuid(), name, email, phone: body.phone ?? "", role: (body.role === "admin" ? "admin" : "staff") as "admin" | "staff", password: body.password || "Demo#1234" };
        s.staff.push(u); saveState(s);
        return { status: 201, body: { user: { ...u, is_active: true, last_login_at: null, created_at: s.generated_at }, password: u.password } };
      }
      const target = s.staff.find((x) => x.id === parts[2]);
      if (method === "PATCH" && target) {
        if (typeof body?.is_active === "boolean") target.is_active = body.is_active;
        if (body?.name) target.name = String(body.name);
        if (body?.role) target.role = body.role === "admin" ? "admin" : "staff";
        if (body?.password) target.password = String(body.password);
        saveState(s);
        return ok({ user: { ...target, is_active: target.is_active !== false, last_login_at: target.last_login_at ?? null, created_at: s.generated_at } });
      }
    }
    if (parts[1] === "settings" && method === "GET") {
      return ok({ settings: { edition, handover_on: s.handover_on ?? "", business_name: s.profile.name, business_address: s.profile.address, business_phone: s.profile.phone, business_email: s.profile.email, business_logo_text: s.profile.logo_text, business_footer_note: s.profile.footer_note }, edition, editions: Object.values(EDITION_META), capabilities: caps });
    }
    if (parts[1] === "settings" && (method === "PUT" || method === "POST")) {
      // Changing package only changes what is served - records are kept, exactly
      // like the server. Use "Seed ..." below to load a package's standard dataset.
      if (body?.edition) s.edition = body.edition as Edition;
      if (body?.handover_on !== undefined) s.handover_on = body.handover_on || null;
      for (const [key, field] of [["business_name", "name"], ["business_address", "address"], ["business_phone", "phone"], ["business_email", "email"], ["business_logo_text", "logo_text"], ["business_footer_note", "footer_note"]] as const) {
        if (body?.[key] !== undefined) s.profile = { ...s.profile, [field]: body[key] };
      }
      saveState(s);
      return ok({ settings: {}, edition: s.edition, business: s.profile });
    }
    if (parts[1] === "corrections") return ok({ corrections: s.corrections });
    if (parts[1] === "notifications") {
      return ok({ status: notificationStatus(s), notifications: s.notifications });
    }
    if (parts[1] === "backup.json") {
      if (!hasCap(edition, CAPS.backup)) return err(402, "Backup download is part of the Classic package.", "edition_required");
      const payload = {
        product: "Credit & Savings Records Management System",
        version: 1,
        generated_at: new Date().toISOString(),
        edition: s.edition,
        counts: { users: s.staff.length, customers: s.customers.length, transactions: s.transactions.length, corrections: s.corrections.length, audit: 0 },
        tables: {
          users: s.staff.map(({ password, ...u }) => u),
          customers: s.customers,
          transactions: s.transactions,
          transaction_corrections: s.corrections,
          app_settings: [{ key: "edition", value: s.edition }],
          audit_logs: [],
        },
      };
      return { status: 200, body: null, blob: new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), filename: `backup-${today()}.json` };
    }
    if (parts[1] === "demo" && parts[2] === "seed") {
      const next = resetState((body?.edition as Edition) ?? edition);
      return ok({ ok: true, edition: next.edition, customers: next.customers.length, transactions: next.transactions.length });
    }
  }

  return err(404, "Not found", "not_found");
}

const HEADER_ALIASES: Record<string, string> = {
  customer: "customer", "customer name": "customer", name: "customer", member: "customer",
  code: "code", "customer code": "code",
  phone: "phone", "phone number": "phone", mobile: "phone",
  type: "kind", kind: "kind", "transaction type": "kind", particulars: "kind",
  amount: "amount", "amount (ugx)": "amount", ugx: "amount", value: "amount",
  date: "date", "transaction date": "date", method: "method", "payment method": "method",
  reference: "reference", ref: "reference", note: "note", notes: "note", description: "note",
};

const KINDS: Record<string, TxKind> = {
  deposit: "savings_deposit", savings: "savings_deposit", "savings deposit": "savings_deposit", in: "savings_deposit",
  withdrawal: "savings_withdrawal", "savings withdrawal": "savings_withdrawal", out: "savings_withdrawal",
  credit: "credit_issued", loan: "credit_issued", "credit issued": "credit_issued", advance: "credit_issued",
  repayment: "credit_repayment", "credit repayment": "credit_repayment", repay: "credit_repayment",
};

function parseImport(csv: string): { headers: string[]; mapping: string[]; rows: any[]; unknown_headers: string[] } | { error: string } {
  const rows = parseCsvText(csv);
  if (rows.length < 2) return { error: "That file has no data rows. The first line must be the column headings." };
  const headers = rows[0];
  const mapping = headers.map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? "");
  if (!mapping.includes("customer")) return { error: "No customer column found. Rename the column to 'Customer'." };
  if (!mapping.includes("amount")) return { error: "No amount column found. Rename the column to 'Amount'." };
  if (!mapping.includes("kind")) return { error: "No transaction type column found. Rename the column to 'Type'." };
  const out = rows.slice(1, 501).map((cells, i) => {
    const get = (k: string) => { const idx = mapping.indexOf(k); return idx === -1 ? "" : (cells[idx] ?? "").trim(); };
    const errors: string[] = [];
    const rawKind = get("kind").toLowerCase().replace(/[\s-]+/g, " ");
    const kind = KINDS[rawKind];
    const amount = Math.round(Number(get("amount").replace(/[^0-9.]/g, "")) || 0);
    const rawDate = get("date");
    const date = !rawDate ? today() : /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : (() => {
      const m = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
    })();
    if (!get("customer")) errors.push("customer name is missing");
    if (!rawKind) errors.push("type is missing"); else if (!kind) errors.push(`type "${get("kind")}" is not understood`);
    if (!(amount > 0)) errors.push("amount must be a number greater than zero");
    if (!date) errors.push(`date "${rawDate}" is not understood`);
    const m = get("method").toLowerCase().replace(/[\s-]+/g, "_");
    const method = (["cash", "bank", "mobile_money", "cheque", "other"].includes(m) ? m : "cash") as TxMethod;
    return {
      row: i + 2, customer: get("customer"), code: get("code"), phone: get("phone"),
      kind: kind ?? get("kind"), amount, date: date || today(), method,
      reference: get("reference"), note: get("note"), errors, warning: null,
    };
  });
  return { headers, mapping, rows: out, unknown_headers: headers.filter((_, i) => !mapping[i]) };
}

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(cell); cell = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
