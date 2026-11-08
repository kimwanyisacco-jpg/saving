"use client";
import { useEffect, useState } from "react";
import { Database, Download, RefreshCw, Save, UserPlus } from "lucide-react";
import { Authed } from "@/components/Authed";
import { Card, EditionBadge, Field, Notice, Spinner, Tile, Upgrade, useToast } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { api, download, getSession, setSession, OFFLINE } from "@/lib/api";
import { formatDate, formatNumber, formatUGX } from "@/lib/format";
import { EDITION_META, EDITIONS, FEATURES } from "../../../supabase/functions/_shared/domain/editions";
import type { BusinessProfile, Edition } from "../../../supabase/functions/_shared/domain/types";

interface Overview {
  users: number; admins: number; customers: number; transactions: number; voided: number; corrections: number;
  totals: { savings: number; credit_outstanding: number; customers: number };
  edition: Edition; capabilities: Record<string, boolean>; business: BusinessProfile; demo_mode: boolean;
}

export default function AdminPage() {
  return <Authed title="Admin" wide>{(me) => <Admin role={me.session.user.role} />}</Authed>;
}

function Admin({ role }: { role: "admin" | "staff" }) {
  if (role !== "admin") {
    return (
      <Card title="Administrator only">
        <p className="text-sm text-ink-soft">Staff accounts can record customers and transactions. Package, business profile, backups and user accounts are managed by an administrator.</p>
      </Card>
    );
  }
  return <AdminPanels />;
}

function AdminPanels() {
  const overview = useApi<Overview>("/admin/overview");
  const settings = useApi<{ settings: Record<string, string>; edition: Edition; editions: { id: Edition; name: string; tagline: string }[]; capabilities: Record<string, boolean> }>("/admin/settings");
  const users = useApi<{ users: { id: string; name: string; email: string | null; role: string; is_active: boolean; last_login_at: string | null }[] }>("/admin/users");
  const { toast, toastView } = useToast();

  if (overview.loading && !overview.data) return <Spinner label="Loading admin" />;
  if (overview.error) return <Notice tone="error">{overview.error}</Notice>;
  const o = overview.data!;

  return (
    <div className="space-y-5">
      {toastView}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Administration</h1>
          <p className="text-sm text-ink-mute">{o.business.name} · <EditionBadge edition={o.edition} /></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {o.capabilities.backup ? (
            <>
              <button className="btn-secondary" onClick={() => download("/admin/backup.json", `backup-${new Date().toISOString().slice(0, 10)}.json`)}><Database className="h-4 w-4" /> Download backup</button>
              <button className="btn-secondary" onClick={() => download("/admin/backup/transactions.csv", "transactions-backup.csv")}><Download className="h-4 w-4" /> Transactions CSV</button>
            </>
          ) : (
            <span className="text-xs text-ink-mute">Backup download is part of the Classic package.</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Customers" value={formatNumber(o.customers)} sub={`${formatNumber(o.users)} staff accounts`} />
        <Tile label="Transactions" value={formatNumber(o.transactions)} sub={`${formatNumber(o.voided)} voided · ${formatNumber(o.corrections)} corrections`} />
        <Tile label="Savings held" value={formatUGX(o.totals.savings)} tone="save" />
        <Tile label="Credit outstanding" value={formatUGX(o.totals.credit_outstanding)} tone="credit" />
      </div>

      <EditionPanel
        current={o.edition}
        settings={settings.data?.settings ?? {}}
        onSaved={() => { settings.refresh(); overview.refresh(); toast({ tone: "success", text: "Settings saved." }); }}
        toast={toast}
      />

      <Card title="Staff accounts" action={<span className="text-xs text-ink-mute">One business, administrator plus staff</span>}>
        <NewStaff onDone={() => { users.refresh(); overview.refresh(); toast({ tone: "success", text: "Account created." }); }} />
        {users.loading && !users.data ? <Spinner label="Loading accounts" /> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem]">
              <thead>
                <tr className="border-b border-sand-200"><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Last sign-in</th><th className="th">Active</th></tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {users.data?.users.map((u) => (
                  <tr key={u.id} className="hover:bg-sand-50">
                    <td className="td font-semibold">{u.name}</td>
                    <td className="td font-mono text-xs">{u.email}</td>
                    <td className="td capitalize">{u.role}</td>
                    <td className="td text-ink-mute">{u.last_login_at ? formatDate(String(u.last_login_at).slice(0, 10)) : "never"}</td>
                    <td className="td">{u.is_active ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {o.demo_mode && <DemoPanel edition={o.edition} onSeeded={() => { overview.refresh(); settings.refresh(); users.refresh(); toast({ tone: "success", text: "Demo data rebuilt." }); }} />}
    </div>
  );
}

function EditionPanel({ current, settings, onSaved, toast }: { current: Edition; settings: Record<string, string>; onSaved: () => void; toast: (t: { tone: "success" | "error"; text: string }) => void }) {
  const [edition, setEdition] = useState<Edition>(current);
  const [profile, setProfile] = useState({ business_name: "", business_address: "", business_phone: "", business_email: "", business_logo_text: "", business_footer_note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setEdition(current); }, [current]);
  useEffect(() => {
    setProfile({
      business_name: settings.business_name ?? "", business_address: settings.business_address ?? "",
      business_phone: settings.business_phone ?? "", business_email: settings.business_email ?? "",
      business_logo_text: settings.business_logo_text ?? "", business_footer_note: settings.business_footer_note ?? "",
    });
  }, [settings]);

  async function save() {
    setBusy(true); setError(null);
    try {
      await api("/admin/settings", { method: "PUT", body: { edition, ...profile } });
      onSaved();
    } catch (e) { setError((e as Error).message); toast({ tone: "error", text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <Card title="Package and business profile" action={<button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner label="" /> : <Save className="h-4 w-4" />} Save</button>}>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="label">Licensed package</p>
          <div className="grid gap-2">
            {EDITIONS.map((e) => (
              <label key={e} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${edition === e ? "border-brand-500 bg-brand-50" : "border-sand-200"}`}>
                <input type="radio" name="edition" className="mt-1" checked={edition === e} onChange={() => setEdition(e)} />
                <span>
                  <span className="flex items-center gap-2"><span className="font-semibold text-ink">{EDITION_META[e].name}</span>{EDITION_META[e].recommended && <span className="chip bg-brand-600 text-white">Recommended</span>}</span>
                  <span className="mt-0.5 block text-xs text-ink-mute">{EDITION_META[e].tagline} · {formatUGX(EDITION_META[e].price_ugx)}</span>
                  <span className="mt-1 block text-xs text-ink-soft">{FEATURES.filter((f) => f.min === e).map((f) => f.label).join(" · ")}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-mute">
            Switching the package changes what the system will serve immediately. Data is never deleted.
          </p>
        </div>
        <div className="grid gap-3">
          <Field label="Business name" hint="Printed on every statement"><input className="input" value={profile.business_name} onChange={(e) => setProfile((p) => ({ ...p, business_name: e.target.value }))} /></Field>
          <Field label="Address"><input className="input" value={profile.business_address} onChange={(e) => setProfile((p) => ({ ...p, business_address: e.target.value }))} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone"><input className="input" value={profile.business_phone} onChange={(e) => setProfile((p) => ({ ...p, business_phone: e.target.value }))} /></Field>
            <Field label="Email"><input className="input" value={profile.business_email} onChange={(e) => setProfile((p) => ({ ...p, business_email: e.target.value }))} /></Field>
          </div>
          <Field label="Logo initials" hint="Two or three letters shown in the statement header"><input className="input" maxLength={3} value={profile.business_logo_text} onChange={(e) => setProfile((p) => ({ ...p, business_logo_text: e.target.value.toUpperCase() }))} /></Field>
          <Field label="Statement footer note"><input className="input" value={profile.business_footer_note} onChange={(e) => setProfile((p) => ({ ...p, business_footer_note: e.target.value }))} /></Field>
        </div>
      </div>
    </Card>
  );
}

function NewStaff({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", role: "staff", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setCreated(null);
    try {
      const r = await api<{ user: { email: string }; password: string }>("/admin/users", { method: "POST", body: form });
      setCreated({ email: r.user.email, password: r.password });
      setForm({ name: "", email: "", role: "staff", phone: "" });
      onDone();
    }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <form className="grid gap-3 rounded-xl border border-sand-200 bg-sand-50 p-4 md:grid-cols-4" onSubmit={submit}>
      <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></Field>
      <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required /></Field>
      <Field label="Role">
        <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
          <option value="staff">Staff</option><option value="admin">Administrator</option>
        </select>
      </Field>
      <div className="flex items-end"><button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner label="" /> : <UserPlus className="h-4 w-4" />} Add account</button></div>
      {error && <div className="md:col-span-4"><Notice tone="error">{error}</Notice></div>}
      {created && (
        <div className="md:col-span-4">
          <Notice tone="success">Account created. Sign in as {created.email} with the password {created.password} - write it down now, it is shown once.</Notice>
        </div>
      )}
    </form>
  );
}

function DemoPanel({ edition, onSeeded }: { edition: Edition; onSeeded: () => void }) {
  const [busy, setBusy] = useState(false);
  async function seed(e: Edition) {
    setBusy(true);
    try {
      await api("/admin/demo/seed", { method: "POST", body: { edition: e } });
      // The dataset was replaced for this package, so keep the signed-in session
      // (and therefore the whole shell) in step with it.
      const session = getSession();
      if (session) setSession({ ...session, edition: e });
      onSeeded();
      // The whole shell (nav, badges, which pages are offered) is built from the
      // package, so reload once the new dataset is in place.
      window.location.reload();
    } finally { setBusy(false); }
  }
  return (
    <Card title="Demo data" action={<span className="text-xs text-ink-mute">Presentation only · replaces all records</span>}>
      <p className="text-sm text-ink-soft">Rebuild the demo dataset for any package. This wipes the current records and installs the standard demo business, customers and transactions.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {EDITIONS.map((e) => (
          <button key={e} className={e === edition ? "btn-primary" : "btn-secondary"} disabled={busy} onClick={() => seed(e)}>
            {busy ? <Spinner label="" /> : <RefreshCw className="h-4 w-4" />} Seed {EDITION_META[e].name}
          </button>
        ))}
      </div>
      {OFFLINE && <p className="mt-3 text-xs text-ink-mute">You are running the offline demo, so the dataset is rebuilt in this browser.</p>}
    </Card>
  );
}
