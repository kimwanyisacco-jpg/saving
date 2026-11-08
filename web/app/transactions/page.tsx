"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, Plus, Search, Undo2, Ban } from "lucide-react";
import { Authed } from "@/components/Authed";
import { Card, Empty, Field, Notice, Spinner, TxKind, Upgrade, useToast } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { api, download } from "@/lib/api";
import { KIND_LABELS, METHOD_LABELS, formatDate, formatNumber, formatUGX, today, addMonths } from "@/lib/format";
import type { EditionCapabilities } from "../../../supabase/functions/_shared/domain/editions";
import type { Customer, Transaction, TxKind as Kind } from "../../../supabase/functions/_shared/domain/types";

export default function TransactionsPage() {
  return <Authed title="Transactions" wide>{(me) => <Transactions caps={me.capabilities} />}</Authed>;
}

const KINDS: Kind[] = ["savings_deposit", "savings_withdrawal", "credit_issued", "credit_repayment"];

function Transactions({ caps }: { caps: EditionCapabilities }) {
  const [filters, setFilters] = useState({ q: "", kind: "", method: "", from: "", to: "", include_voided: false });
  const [showNew, setShowNew] = useState(false);
  const [histNonce, setHistNonce] = useState(0);
  const { toast, toastView } = useToast();

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("new") === "1") setShowNew(true);
  }, []);

  const qs = new URLSearchParams();
  if (filters.q) qs.set("q", filters.q);
  if (filters.kind) qs.set("kind", filters.kind);
  if (caps.improvedSearch && filters.method) qs.set("method", filters.method);
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (caps.corrections && filters.include_voided) qs.set("include_voided", "true");
  const path = `/transactions${qs.toString() ? "?" + qs.toString() : ""}`;
  const { data, loading, error, refresh } = useApi<{ transactions: Transaction[] }>(path, [path]);

  const initialCustomer = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("customer_id") ?? "" : "";

  async function exportCsv() {
    try { await download(`/transactions/export${qs.toString() ? "?" + qs.toString() : ""}`, "transactions.csv"); }
    catch (e) { toast({ tone: "error", text: (e as Error).message }); }
  }

  return (
    <div className="space-y-5">
      {toastView}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Transactions</h1>
          <p className="text-sm text-ink-mute">{data ? `${formatNumber(data.transactions.length)} shown` : "Loading"} · savings and credit, newest first</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {caps.csv && <button className="btn-secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</button>}
          <button className="btn-primary" onClick={() => setShowNew((v) => !v)}><Plus className="h-4 w-4" /> {showNew ? "Close" : "Record transaction"}</button>
        </div>
      </div>

      {showNew && (
        <NewTransaction
          initialCustomerId={initialCustomer}
          onDone={() => { setShowNew(false); refresh(); toast({ tone: "success", text: "Transaction recorded." }); }}
        />
      )}

      <Card>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
              <input className="input pl-9" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Customer, receipt or reference" />
            </div>
          </Field>
          <Field label="Type">
            <select className="input" value={filters.kind} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))}>
              <option value="">All types</option>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </Field>
          <Field label="From"><input type="date" className="input" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} /></Field>
          <Field label="To"><input type="date" className="input" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} /></Field>
        </div>
        {caps.improvedSearch ? (
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div className="w-48">
              <Field label="Method">
                <select className="input" value={filters.method} onChange={(e) => setFilters((f) => ({ ...f, method: e.target.value }))}>
                  <option value="">Any method</option>
                  {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            {caps.corrections && (
              <label className="flex items-center gap-2 pb-2 text-sm text-ink-soft">
                <input type="checkbox" checked={filters.include_voided} onChange={(e) => setFilters((f) => ({ ...f, include_voided: e.target.checked }))} />
                Include voided transactions
              </label>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink-mute">Filtering by payment method and showing voided rows are Enhanced and Classic features.</p>
        )}
      </Card>

      {error && <Notice tone="error">{error}</Notice>}
      {loading && !data && <Spinner label="Loading transactions" />}

      {data && (data.transactions.length ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem]">
              <thead>
                <tr className="border-b border-sand-200">
                  <th className="th">Date</th><th className="th">Receipt</th><th className="th">Customer</th><th className="th">Type</th>
                  <th className="th">Method</th><th className="th">Reference</th><th className="th text-right">Amount</th>
                  {caps.corrections && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {data.transactions.map((tx) => (
                  <tr key={tx.id} className={tx.voided_at ? "bg-sand-50 text-ink-mute" : "hover:bg-sand-50"}>
                    <td className="td text-ink-mute">{formatDate(tx.occurred_on)}</td>
                    <td className="td font-mono text-xs">{tx.receipt_no ?? "—"}</td>
                    <td className="td font-semibold">
                      <Link href={`/customer/?id=${tx.customer_id}`} className="hover:underline">{tx.customer_name}</Link>
                      <span className="ml-2 font-mono text-xs text-ink-mute">{tx.customer_code}</span>
                    </td>
                    <td className="td"><TxKind kind={tx.kind} />{tx.voided_at && <span className="ml-2 chip bg-sand-200 text-ink-soft">voided</span>}</td>
                    <td className="td capitalize">{tx.method.replace(/_/g, " ")}</td>
                    <td className="td font-mono text-xs">{tx.reference ?? "—"}</td>
                    <td className="num td font-semibold">{formatUGX(tx.amount)}</td>
                    {caps.corrections && (
                      <td className="td text-right">
                        <VoidButton tx={tx} onDone={() => { refresh(); setHistNonce((n) => n + 1); toast({ tone: "success", text: tx.voided_at ? "Transaction restored." : "Transaction voided." }); }} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Empty title="No transactions match" hint="Clear the filters or record a new transaction." action={<button className="btn-primary" onClick={() => setShowNew(true)}>Record transaction</button>} />
      ))}

      {caps.corrections && (
        <Card title="Correction history" action={<span className="text-xs text-ink-mute">Every void, restore and amendment is recorded</span>}>
          <Corrections version={histNonce} />
        </Card>
      )}
      {!caps.corrections && <Upgrade feature="Transaction corrections and CSV export" edition="basic" />}
    </div>
  );
}

function VoidButton({ tx, onDone }: { tx: Transaction; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState("");

  async function go(action: "void" | "restore") {
    setBusy(true);
    try {
      await api(`/transactions/${tx.id}/${action}`, { method: "POST", body: { reason: reason || (action === "void" ? "Entered in error" : "Reinstated after review") } });
      onDone();
    } finally { setBusy(false); setAsk(false); }
  }

  if (tx.voided_at) return <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => go("restore")}><Undo2 className="h-3.5 w-3.5" /> Restore</button>;
  if (!ask) return <button className="btn-ghost px-2 py-1 text-xs text-money-out" onClick={() => setAsk(true)}><Ban className="h-3.5 w-3.5" /> Void</button>;
  return (
    <div className="flex items-center justify-end gap-1">
      <input className="input w-40 px-2 py-1 text-xs" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-danger px-2 py-1 text-xs" disabled={busy} onClick={() => go("void")}>Void</button>
      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setAsk(false)}>Cancel</button>
    </div>
  );
}

function Corrections({ version }: { version: number }) {
  const { data, loading } = useApi<{ corrections: any[] }>("/transactions/corrections", [version]);
  if (loading && !data) return <Spinner label="Loading history" />;
  if (!data?.corrections.length) return <p className="text-sm text-ink-mute">No corrections recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem]">
        <thead>
          <tr className="border-b border-sand-200">
            <th className="th">When</th><th className="th">Action</th><th className="th">Customer</th><th className="th">Reason</th><th className="th">By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100">
          {data.corrections.map((k) => (
            <tr key={k.id}>
              <td className="td text-ink-mute">{formatDate(String(k.created_at).slice(0, 10))}</td>
              <td className="td capitalize font-semibold">{k.action}</td>
              <td className="td">{k.customer_name ?? "—"}</td>
              <td className="td">{k.reason ?? "—"}</td>
              <td className="td text-ink-mute">{k.actor_name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewTransaction({ initialCustomerId, onDone }: { initialCustomerId?: string; onDone: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState({
    customer_id: initialCustomerId ?? "", kind: "savings_deposit" as Kind, amount: "",
    occurred_on: today(), method: "cash", reference: "", note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ customers: Customer[] }>("/customers?limit=1000").then((r) => setCustomers(r.customers)).catch(() => setCustomers([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api("/transactions", { method: "POST", body: form });
      onDone();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return (
    <Card title="Record a transaction">
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" onSubmit={submit}>
        <Field label="Customer">
          <select className="input" value={form.customer_id} onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))} required>
            <option value="">Choose a customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select className="input" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as Kind }))}>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
        </Field>
        <Field label="Amount (UGX)"><input className="input" inputMode="numeric" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="50,000" required /></Field>
        <Field label="Date"><input className="input" type="date" value={form.occurred_on} max={today()} onChange={(e) => setForm((f) => ({ ...f, occurred_on: e.target.value }))} /></Field>
        <Field label="Method">
          <select className="input" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
            {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Reference"><input className="input" value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Receipt book number" /></Field>
        <div className="lg:col-span-2"><Field label="Note"><input className="input" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="What this money was for" /></Field></div>
        <div className="flex items-end"><button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner label="" /> : null} Save transaction</button></div>
      </form>
      <p className="mt-3 text-xs text-ink-mute">A receipt number is issued automatically. Balances update as soon as you save.</p>
    </Card>
  );
}
