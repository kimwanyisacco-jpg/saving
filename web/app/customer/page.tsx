"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer, Pencil } from "lucide-react";
import { Authed } from "@/components/Authed";
import { Card, CustomerStatus, Empty, Field, Notice, Spinner, Tile, TxKind, Upgrade, useToast } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { api, openPdf } from "@/lib/api";
import { formatDate, formatNumber, formatUGX, today, addMonths } from "@/lib/format";
import type { Balances, Customer, Transaction } from "../../../supabase/functions/_shared/domain/types";
import type { EditionCapabilities } from "../../../supabase/functions/_shared/domain/editions";

interface Detail {
  customer: Customer;
  balances: Balances;
  transactions: Transaction[];
  full_history: boolean;
  edition: string;
}

export default function CustomerPage() {
  return <Authed title="Customer" wide>{(me) => <DetailView caps={me.capabilities} />}</Authed>;
}

function DetailView({ caps }: { caps: EditionCapabilities }) {
  const [id, setId] = useState("");
  useEffect(() => { setId(new URLSearchParams(window.location.search).get("id") ?? ""); }, []);
  const { data, loading, error, refresh } = useApi<Detail>(id ? `/customers/${id}` : null, [id]);
  const [range, setRange] = useState({ from: addMonths(today(), -5), to: today() });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const { toast, toastView } = useToast();

  async function print() {
    setBusy(true);
    try {
      const q = caps.statementRange ? `?from=${range.from}&to=${range.to}` : "";
      await openPdf(`/statements/${id}.pdf${q}`, `statement-${id}.pdf`);
    } catch (e) {
      toast({ tone: "error", text: (e as Error).message });
    } finally { setBusy(false); }
  }

  if (loading && !data) return <Spinner label="Loading customer" />;
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return null;
  const { customer: c, balances: b } = data;

  return (
    <div className="space-y-5">
      {toastView}
      <Link href="/customers/" className="btn-ghost -ml-2 text-sm"><ArrowLeft className="h-4 w-4" /> All customers</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold text-ink">{c.name}</h1>
            <CustomerStatus status={c.status} />
          </div>
          <p className="mt-1 text-sm text-ink-mute">
            <span className="font-mono">{c.code}</span>
            {c.phone ? ` · ${c.phone}` : ""}{c.email ? ` · ${c.email}` : ""}{c.address ? ` · ${c.address}` : ""}
            {` · joined ${formatDate(c.joined_on)}`}
          </p>
          {c.notes && <p className="mt-1 text-sm text-ink-soft">{c.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setEditing((v) => !v)}><Pencil className="h-4 w-4" /> {editing ? "Close" : "Edit"}</button>
          <Link href={`/transactions/?new=1&customer_id=${id}`} className="btn-secondary">Record transaction</Link>
          <button className="btn-primary" onClick={print} disabled={busy}>{busy ? <Spinner label="" /> : <Printer className="h-4 w-4" />} Print statement</button>
        </div>
      </div>

      {editing && <EditCustomer customer={c} onDone={() => { setEditing(false); refresh(); toast({ tone: "success", text: "Customer updated." }); }} />}

      <div className={`grid gap-4 ${caps.separateBalances ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {caps.separateBalances ? (
          <>
            <Tile label="Savings balance" value={formatUGX(b.savings)} sub={`Deposits ${formatNumber(b.savings_in)} · withdrawals ${formatNumber(b.savings_out)}`} tone="save" />
            <Tile label="Credit outstanding" value={formatUGX(b.credit_outstanding)} sub={`Issued ${formatNumber(b.credit_issued)} · repaid ${formatNumber(b.credit_repaid)}`} tone="credit" />
            <Tile label="Transactions" value={formatNumber(data.transactions.length)} sub={data.full_history ? "Full history shown below" : "Most recent 10 shown"} />
            <Tile label="Net position" value={formatUGX(b.savings - b.credit_outstanding)} sub="Savings less credit outstanding" />
          </>
        ) : (
          <>
            <Tile label="Money in" value={formatUGX(b.savings_in + b.credit_repaid)} sub="Deposits and repayments" tone="save" />
            <Tile label="Money out" value={formatUGX(b.savings_out + b.credit_issued)} sub="Withdrawals and credit issued" tone="credit" />
            <Tile label="Net position" value={formatUGX(b.savings - b.credit_outstanding)} sub="Savings less credit outstanding" />
          </>
        )}
      </div>

      {caps.statementRange && (
        <Card title="Statement period" action={<span className="text-xs text-ink-mute">Classic and above can print any date range</span>}>
          <div className="flex flex-wrap items-end gap-3">
            <div><span className="label">From</span><input type="date" className="input w-auto" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></div>
            <div><span className="label">To</span><input type="date" className="input w-auto" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></div>
            <button className="btn-secondary" onClick={print} disabled={busy}>Print this range</button>
          </div>
        </Card>
      )}
      {!caps.statementRange && (
        <Upgrade feature="Statements by date range and separate balances" edition="basic" />
      )}

      <Card
        title={data.full_history ? "Transaction history" : "Recent transactions"}
        action={<Link href={`/transactions/?customer_id=${id}`} className="btn-ghost text-sm">Open in transactions</Link>}
      >
        {data.transactions.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem]">
              <thead>
                <tr className="border-b border-sand-200">
                  <th className="th">Date</th><th className="th">Type</th><th className="th">Reference</th>
                  <th className="th">Method</th><th className="th text-right">Amount</th><th className="th">Recorded by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {[...data.transactions].sort((a, x) => x.occurred_on.localeCompare(a.occurred_on)).map((tx) => (
                  <tr key={tx.id} className={tx.voided_at ? "bg-sand-50 text-ink-mute" : "hover:bg-sand-50"}>
                    <td className="td text-ink-mute">{formatDate(tx.occurred_on)}</td>
                    <td className="td"><TxKind kind={tx.kind} />{tx.voided_at && <span className="ml-2 chip bg-sand-200 text-ink-soft">voided</span>}</td>
                    <td className="td font-mono text-xs">{tx.reference ?? tx.receipt_no ?? "—"}</td>
                    <td className="td capitalize">{tx.method.replace(/_/g, " ")}</td>
                    <td className="num td font-semibold">{formatUGX(tx.amount)}</td>
                    <td className="td text-ink-mute">{tx.recorded_by_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No transactions yet" hint="Record a savings deposit to begin this customer's history."
            action={<Link href={`/transactions/?new=1&customer_id=${id}`} className="btn-primary">Record transaction</Link>} />
        )}
        {!data.full_history && <p className="mt-3 text-xs text-ink-mute">Showing the most recent 10. The full history on the profile is part of the Classic package.</p>}
      </Card>
    </div>
  );
}

function EditCustomer({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const [form, setForm] = useState({
    name: customer.name, phone: customer.phone ?? "", email: customer.email ?? "", national_id: customer.national_id ?? "",
    address: customer.address ?? "", joined_on: customer.joined_on, status: customer.status, notes: customer.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api(`/customers/${customer.id}`, { method: "PATCH", body: form }); onDone(); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return (
    <Card title="Edit customer">
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
        <Field label="Full name"><input className="input" value={form.name} onChange={set("name")} required /></Field>
        <Field label="Phone"><input className="input" value={form.phone} onChange={set("phone")} /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={set("email")} /></Field>
        <Field label="National ID"><input className="input" value={form.national_id} onChange={set("national_id")} /></Field>
        <Field label="Address"><input className="input" value={form.address} onChange={set("address")} /></Field>
        <Field label="Joined on"><input className="input" type="date" value={form.joined_on} onChange={set("joined_on")} /></Field>
        <Field label="Status">
          <select className="input" value={form.status} onChange={set("status")}>
            <option value="active">Active</option><option value="dormant">Dormant</option><option value="closed">Closed</option>
          </select>
        </Field>
        <Field label="Notes"><input className="input" value={form.notes} onChange={set("notes")} /></Field>
        <div className="md:col-span-2 flex justify-end"><button className="btn-primary" disabled={busy}>{busy ? <Spinner label="" /> : null} Save changes</button></div>
      </form>
    </Card>
  );
}
