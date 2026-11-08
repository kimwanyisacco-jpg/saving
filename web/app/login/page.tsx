"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { Brand, Card, Field, Notice, Spinner } from "@/components/ui";
import { api, OFFLINE, setSession } from "@/lib/api";
import { EDITION_META, EDITIONS } from "../../../supabase/functions/_shared/domain/editions";
import { demoAccounts } from "../../../supabase/functions/_shared/domain/demo";
import type { Edition } from "../../../supabase/functions/_shared/domain/types";

export default function Login() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setExpired(p.get("expired") === "1");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: any; edition: Edition; capabilities: any }>("/auth/login", {
        method: "POST", token: null, body: { login, password },
      });
      setSession({ token: res.token, user: res.user, edition: res.edition, capabilities: res.capabilities });
      window.location.href = "/dashboard/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function useAccount(edition: Edition, role: string) {
    const a = demoAccounts(edition).find((x) => x.role === role) ?? demoAccounts(edition)[0];
    setLogin(a.login);
    setPassword(a.password);
    setError(null);
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-700 p-10 text-white md:flex">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-extrabold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/15">C&amp;S</span> Credit &amp; Savings
        </Link>
        <div>
          <h1 className="font-display text-3xl font-extrabold leading-tight">Records you can trust, statements you can print.</h1>
          <p className="mt-3 max-w-md text-brand-100">
            Sign in to record savings and credit, look up a customer, print a statement of account and see how the
            business is doing.
          </p>
        </div>
        <p className="text-xs text-brand-200">One business, one administrator. No customer self-service.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="md:hidden"><Brand /></div>
          <Card className="mt-4 md:mt-0">
            <h1 className="font-display text-xl font-extrabold text-ink">Sign in</h1>
            <p className="mt-1 text-sm text-ink-mute">Use the email and password given to you by the administrator.</p>

            {expired && <div className="mt-4"><Notice tone="warn">Your session ended. Please sign in again.</Notice></div>}
            {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

            <form className="mt-5 space-y-4" onSubmit={submit}>
              <Field label="Email">
                <input className="input" type="email" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="you@business.co.ug" required />
              </Field>
              <Field label="Password">
                <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              <button className="btn-primary w-full" type="submit" disabled={busy}>
                {busy ? <Spinner label="" /> : <LogIn className="h-4 w-4" />} Sign in
              </button>
            </form>

            <div className="mt-6 border-t border-sand-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Demo accounts</p>
              <p className="mt-1 text-xs text-ink-mute">Tap to fill the form, then sign in.</p>
              <div className="mt-3 grid gap-2">
                {EDITIONS.map((edition) => (
                  <div key={edition} className="flex flex-wrap items-center gap-2">
                    <span className="w-20 text-xs font-semibold text-ink-soft">{EDITION_META[edition].name}</span>
                    {demoAccounts(edition).map((a) => (
                      <button key={a.login} type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => useAccount(edition, a.role)}>
                        {a.role} · {a.login}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <p className="mt-4 text-center text-xs text-ink-mute">
            {OFFLINE ? "Demo mode: data is stored in this browser." : "Connected to the records system."}
            {" · "}<Link href="/" className="font-semibold text-brand-700 hover:underline">Back to home</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
