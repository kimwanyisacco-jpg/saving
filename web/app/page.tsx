"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Minus, Wallet, Printer, Upload, ShieldCheck, Users, BarChart3 } from "lucide-react";
import { Brand, EditionBadge, Spinner } from "@/components/ui";
import { api, OFFLINE, setSession } from "@/lib/api";
import { formatUGX } from "@/lib/format";
import { EDITIONS, EDITION_META, FEATURES, featureLabel, hasFeature } from "../../supabase/functions/_shared/domain/editions";
import { demoAccounts } from "../../supabase/functions/_shared/domain/demo";
import type { Edition } from "../../supabase/functions/_shared/domain/types";

interface DemoAccount { edition: Edition; role: string; name: string; login: string; password: string; business: string }

export default function Home() {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Demo credentials come from the same generator that seeds the database.
    try {
      setAccounts(EDITIONS.flatMap((e) => demoAccounts(e)) as DemoAccount[]);
    } finally { setLoaded(true); }
  }, []);

  async function openDemo(edition: Edition) {
    setBusy(edition);
    setError(null);
    try {
      const account = demoAccounts(edition).find((a) => a.role === "admin") ?? demoAccounts(edition)[0];
      // Make sure the backend (or the offline demo) holds this package's dataset.
      if (!OFFLINE) await api("/setup/demo", { method: "POST", body: { edition, reset: true }, token: null });
      const res = await api<{ token: string; user: any; edition: Edition; capabilities: any }>("/auth/login", {
        method: "POST", token: null, body: { login: account.login, password: account.password },
      });
      setSession({ token: res.token, user: res.user, edition: res.edition, capabilities: res.capabilities });
      window.location.href = "/dashboard/";
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-sand-50">
      <header className="border-b border-sand-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Brand />
          <nav className="flex items-center gap-2">
            <a href="#packages" className="navlink hidden sm:inline-flex">Packages</a>
            <a href="#demo" className="navlink hidden sm:inline-flex">Demo accounts</a>
            <Link href="/login/" className="btn-primary">Sign in</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="grid gap-8 py-12 md:grid-cols-2 md:items-center">
          <div>
            <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200">Credit &amp; Savings Records Management System</span>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight text-ink md:text-5xl">
              Keep every customer, deposit and loan in one place.
            </h1>
            <p className="mt-4 text-lg text-ink-soft">
              A simple administrator system for savings groups and small lenders. Record savings and credit, print a
              statement of account for any customer, and see the health of the whole business. Pick the package that
              fits today; move up when the reporting needs grow.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => openDemo("classic")} disabled={busy !== null}>
                {busy === "classic" ? <Spinner label="" /> : null} Open the Classic demo
              </button>
              <a href="#packages" className="btn-secondary">Compare packages</a>
            </div>
            {OFFLINE && (
              <p className="mt-3 text-sm text-ink-mute">
                This copy is running the built-in demo: no server needed, and every figure comes from the same code the
                live product uses.
              </p>
            )}
            {error && <p className="mt-3 text-sm font-semibold text-money-out">{error}</p>}
          </div>
          <div className="card p-6">
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: <Users className="h-5 w-5" />, title: "Customer records", text: "Add, edit and search, with a full transaction history." },
                { icon: <Wallet className="h-5 w-5" />, title: "Savings and credit", text: "Deposits, withdrawals, credit issued and repayments." },
                { icon: <Printer className="h-5 w-5" />, title: "Statements", text: "A print-ready statement of account, in one click." },
                { icon: <BarChart3 className="h-5 w-5" />, title: "Reports", text: "Period summaries, activity and outstanding credit." },
              ].map((f) => (
                <div key={f.title} className="rounded-xl border border-sand-200 bg-sand-50 p-4">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">{f.icon}</span>
                  <p className="mt-3 font-display text-sm font-bold text-ink">{f.title}</p>
                  <p className="mt-1 text-xs text-ink-soft">{f.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-ink-mute">
              <ShieldCheck className="h-4 w-4" /> One administrator account per business. No customer self-service.
            </p>
          </div>
        </section>

        <section id="packages" className="scroll-mt-20 py-10">
          <h2 className="font-display text-2xl font-extrabold text-ink">Three packages, one system</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Every package shares the same customer records, savings and credit recording and printable statements. Higher
            packages add reporting depth. Open a live demo of any package below.
          </p>
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {EDITIONS.map((edition) => {
              const meta = EDITION_META[edition];
              return (
                <div key={edition} className={`card relative p-6 ${meta.recommended ? "ring-2 ring-brand-500" : ""}`}>
                  {meta.recommended && <span className="absolute -top-3 left-6 chip bg-brand-600 text-white">Recommended</span>}
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-extrabold text-ink">{meta.name}</h3>
                    <EditionBadge edition={edition} />
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{meta.tagline}</p>
                  <p className="mt-4 font-display text-3xl font-extrabold text-brand-700">{formatUGX(meta.price_ugx)}</p>
                  <p className="text-xs text-ink-mute">one-time development fee · delivery {meta.delivery_days}</p>
                  <p className="mt-1 text-xs font-semibold text-ink-soft">
                    + {formatUGX(meta.maintenance_ugx)} monthly maintenance, if prepared
                  </p>
                  <button className={`mt-5 w-full ${meta.recommended ? "btn-primary" : "btn-secondary"}`} onClick={() => openDemo(edition)} disabled={busy !== null}>
                    {busy === edition ? <Spinner label="" /> : null} Open the {meta.name} demo
                  </button>
                  <ul className="mt-5 space-y-2">
                    {FEATURES.map((f) => {
                      const has = hasFeature(f, edition);
                      return (
                        <li key={f.key} className={`flex gap-2 text-sm ${has ? "text-ink" : "text-ink-mute"}`}>
                          {has ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> : <Minus className="mt-0.5 h-4 w-4 shrink-0 text-sand-300" />}
                          <span>{featureLabel(f, edition)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-5 rounded-xl bg-sand-50 p-3 text-xs text-ink-soft">
                    <p className="font-semibold text-ink">Payment plan</p>
                    <p className="mt-1">50% deposit {formatUGX(meta.deposit_ugx)} · 30% after working demo {formatUGX(meta.demo_ugx)} · 20% on handover {formatUGX(meta.handover_ugx)}</p>
                  </div>
                  <div className="mt-3 rounded-xl border border-sand-200 p-3 text-xs text-ink-soft">
                    <p className="font-semibold text-ink">Monthly fees after handover</p>
                    <dl className="mt-2 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt>Maintenance{meta.maintenance_ugx > 0 ? ", if prepared" : ""}</dt>
                        <dd className="tabular font-semibold text-ink">{formatUGX(meta.maintenance_ugx)}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt>Customer emails{meta.email_fee_ugx > 0 ? " (compulsory)" : ""}</dt>
                        <dd className="tabular font-semibold text-ink">
                          {meta.email_fee_ugx > 0 ? formatUGX(meta.email_fee_ugx) : "Not offered"}
                        </dd>
                      </div>
                    </dl>
                    {meta.email_fee_ugx > 0 && (
                      <p className="mt-2 text-ink-mute">
                        The email fee is separate from maintenance and is required for as long as customer emails run.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section id="demo" className="scroll-mt-20 py-10">
          <h2 className="font-display text-2xl font-extrabold text-ink">Demo accounts</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Each package has its own demo business, customers and transactions. Use the admin account to see everything
            the package can do, or the staff account to see the day-to-day view.
          </p>
          <div className="mt-5 overflow-hidden card">
            <table className="w-full min-w-[46rem]">
              <thead className="bg-sand-50">
                <tr>
                  <th className="th">Package</th><th className="th">Business</th><th className="th">Role</th>
                  <th className="th">Email</th><th className="th">Password</th><th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {!loaded && <tr><td className="td" colSpan={6}><Spinner label="Loading accounts" /></td></tr>}
                {accounts.map((a) => (
                  <tr key={a.edition + a.login} className="hover:bg-sand-50">
                    <td className="td"><EditionBadge edition={a.edition} /></td>
                    <td className="td">{a.business}</td>
                    <td className="td capitalize">{a.role}</td>
                    <td className="td font-mono text-xs">{a.login}</td>
                    <td className="td font-mono text-xs">{a.password}</td>
                    <td className="td text-right">
                      <button className="btn-secondary px-3 py-1 text-xs" onClick={() => openDemo(a.edition)} disabled={busy !== null}>
                        Open demo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-mute">
            Demo mode is on for presentation. Turn it off (DEMO_MODE=false) and change these passwords before real use.
          </p>
        </section>

        <section className="py-10">
          <div className="card p-6">
            <h2 className="font-display text-xl font-extrabold text-ink">What the quotation covers</h2>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div>
                <p className="font-semibold text-ink">Included</p>
                <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
                  <li>Admin login, customer records, savings and credit recording</li>
                  <li>Statements of account and dashboard summaries per package</li>
                  <li>CSV export, backup and transaction correction history (Classic and above)</li>
                  <li>Date-filtered reports and spreadsheet import (Enhanced)</li>
                  <li>Hosting setup, data import guidance and priority bug-fix support (Classic: 30 days, Enhanced: 60 days)</li>
                  <li>Customer email notifications, counted from handover (Classic: 1 month, Enhanced: 2 months)</li>
                  <li>Monthly maintenance and the compulsory customer-email fee are quoted separately, per package</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-ink">Not included</p>
                <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
                  <li>Interest calculations and automated loan schedules</li>
                  <li>Payment gateway, mobile-money processing, SMS or WhatsApp integrations</li>
                  <li>Customer self-service accounts (the system is for one business administrator)</li>
                  <li>Ongoing maintenance and support beyond the package terms (available monthly, see the package cards)</li>
                </ul>
                <p className="mt-3 text-xs text-ink-mute">
                  Customer balances are calculated from recorded transactions. The client reviews and confirms migrated
                  opening balances.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-sand-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-mute">
          <span>Credit &amp; Savings Records Management System</span>
          <span className="flex items-center gap-3">
            <Link href="/login/" className="hover:text-ink">Sign in</Link>
            <Link href="/packages/" className="hover:text-ink">Packages</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
