"use client";
import Link from "next/link";
import { useState } from "react";
import { Search, UserPlus, Printer, Filter } from "lucide-react";
import { Authed } from "@/components/Authed";
import { Card, CustomerStatus, Empty, Field, Notice, Spinner, useToast } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/api";
import { formatDate, formatNumber, formatUGX } from "@/lib/format";
import type { Customer } from "../../../supabase/functions/_shared/domain/types";

interface Row extends Customer { savings?: number; credit_outstanding?: number }

export default function CustomersPage() {
  return <Authed title="Customers" wide>{(me) => <Customers enhanced={me.capabilities.improvedSearch} />}</Authed>;
}

function Customers({ enhanced }: { enhanced: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const { toast, toastView } = useToast();
  const path = `/customers?q=${encodeURIComponent(q)}${enhanced && status ? `&status=${status}` : ""}`;
  const { data, loading, error, refresh } = useApi<{ customers: Row[] }>(path, [q, status]);

  return (
    <div className="space-y-5">
      {toastView}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Customers</h1>
          <p className="text-sm text-ink-mute">{data ? `${formatNumber(data.customers.length)} shown` : "Loading"} · balances are calculated from recorded transactions</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating((v) => !v)}>
          <UserPlus className="h-4 w-4" /> {creating ? "Close" : "Add customer"}
        </button>
      </div>

      {creating && <NewCustomer onDone={() => { setCreating(false); refresh(); toast({ tone: "success", text: "Customer added." }); }} />}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
                <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, code, phone or ID" />
              </div>
            </Field>
          </div>
          {enhanced && (
            <div className="w-44">
              <Field label="Status">
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="dormant">Dormant</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
            </div>
          )}
          {!enhanced && (
            <p className="flex items-center gap-2 text-xs text-ink-mute"><Filter className="h-3.5 w-3.5" /> Status filtering is part of the Enhanced package.</p>
          )}
        </div>
      </Card>

      {error && <Notice tone="error">{error}</Notice>}
      {loading && !data && <Spinner label="Loading customers" />}

      {data && (data.customers.length ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem]">
              <thead>
                <tr className="border-b border-sand-200">
                  <th className="th">Code</th><th className="th">Name</th><th className="th">Phone</th>
                  <th className="th">Joined</th><th className="th">Status</th><th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {data.customers.map((c) => (
                  <tr key={c.id} className="hover:bg-sand-50">
                    <td className="td font-mono text-xs text-ink-mute">{c.code}</td>
                    <td className="td font-semibold">{c.name}</td>
                    <td className="td">{c.phone ?? "—"}</td>
                    <td className="td text-ink-mute">{formatDate(c.joined_on)}</td>
                    <td className="td"><CustomerStatus status={c.status} /></td>
                    <td className="td text-right">
                      <Link href={`/customer/?id=${c.id}`} className="btn-secondary px-3 py-1 text-xs">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Empty
          title={q ? `No customer matches "${q}"` : "No customers yet"}
          hint={q ? "Try a shorter search, or clear the box." : "Add your first customer to start recording savings and credit."}
        />
      ))}
    </div>
  );
}

function NewCustomer({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", national_id: "", address: "", joined_on: new Date().toISOString().slice(0, 10), status: "active", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/customers", { method: "POST", body: form });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card title="Add a customer">
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
        <Field label="Full name"><input className="input" value={form.name} onChange={set("name")} required minLength={2} placeholder="e.g. Amara Nakato" /></Field>
        <Field label="Phone" hint="Ugandan format, e.g. 0772 123456"><input className="input" value={form.phone} onChange={set("phone")} placeholder="0772 123456" /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={set("email")} /></Field>
        <Field label="National ID"><input className="input" value={form.national_id} onChange={set("national_id")} placeholder="CF1234567UG" /></Field>
        <Field label="Address / village"><input className="input" value={form.address} onChange={set("address")} /></Field>
        <Field label="Joined on"><input className="input" type="date" value={form.joined_on} onChange={set("joined_on")} /></Field>
        <Field label="Status">
          <select className="input" value={form.status} onChange={set("status")}>
            <option value="active">Active</option><option value="dormant">Dormant</option><option value="closed">Closed</option>
          </select>
        </Field>
        <Field label="Notes"><input className="input" value={form.notes} onChange={set("notes")} placeholder="Occupation, guarantor, anything useful" /></Field>
        <div className="md:col-span-2 flex justify-end gap-2">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner label="" /> : null} Save customer</button>
        </div>
      </form>
      <p className="mt-3 text-xs text-ink-mute">The customer code is assigned automatically and cannot be edited.</p>
    </Card>
  );
}
