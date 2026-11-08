"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, LogOut, Wallet, X } from "lucide-react";
import { OFFLINE, setSession } from "@/lib/api";
import { EDITION_META } from "../../supabase/functions/_shared/domain/editions";
import type { Edition } from "../../supabase/functions/_shared/domain/types";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap font-display font-extrabold text-brand-700">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-white">
        <Wallet className="h-4 w-4" aria-hidden />
      </span>
      <span className={small ? "text-base" : "text-lg"}>Credit <span className="text-brand-500">&amp; Savings</span></span>
    </Link>
  );
}

export function EditionBadge({ edition, className = "" }: { edition: Edition; className?: string }) {
  const tone: Record<Edition, string> = {
    basic: "bg-sand-200 text-ink-soft ring-1 ring-sand-300",
    classic: "bg-brand-50 text-brand-700 ring-1 ring-brand-200",
    enhanced: "bg-gold-100 text-gold-800 ring-1 ring-gold-300",
  };
  return <span className={`chip ${tone[edition]} ${className}`} title={EDITION_META[edition].tagline}>{EDITION_META[edition].name}</span>;
}

export function Shell({ user, title, nav, edition, children, wide = false, publicPage = false }: {
  user: { name: string } | null; title: string; nav?: ReactNode; edition?: Edition;
  children: ReactNode; wide?: boolean; publicPage?: boolean;
}) {
  return (
    <div className="min-h-screen bg-sand-50">
      <header className="sticky top-0 z-30 border-b border-sand-200 bg-sand-50/90 backdrop-blur">
        <div className={`mx-auto flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 ${wide ? "max-w-[1500px]" : "max-w-6xl"}`}>
          <Brand small />
          <span className="hidden text-sm text-ink-mute sm:inline">/ {title}</span>
          {edition && <EditionBadge edition={edition} />}
          {OFFLINE && <span className="chip bg-gold-100 text-gold-800 ring-1 ring-gold-300" title="Running the built-in demo with no backend">Demo mode</span>}
          {nav
            ? <nav className={wide ? "order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-4 pb-1 md:order-none md:mx-0 md:ml-auto md:w-auto md:overflow-visible md:p-0" : "ml-auto flex items-center gap-1"}>{nav}</nav>
            : <span className="ml-auto" />}
          {user && (
            <div className={`flex items-center gap-2 border-l border-sand-200 pl-3 ${wide ? "ml-auto md:ml-0" : ""}`}>
              <span className="hidden text-sm font-semibold text-ink-soft md:inline">{user.name}</span>
              <button className="btn-ghost px-2" aria-label="Sign out" title="Sign out" onClick={() => { setSession(null); window.location.href = "/login/"; }}>
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>
      <main className={`mx-auto px-4 py-6 ${wide ? "max-w-[1500px]" : "max-w-6xl"}`}>{user || publicPage ? children : <Spinner label="Loading" />}</main>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-mute"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || action) && <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-base font-bold text-ink">{title}</h2>{action}</div>}
      {children}
    </section>
  );
}

export function Tile({ label, value, sub, tone = "default" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "save" | "credit" | "gold" }) {
  const tones: Record<string, string> = {
    default: "text-ink", save: "text-money-save", credit: "text-money-credit", gold: "text-gold-700",
  };
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{label}</p>
      <p className={`mt-1 font-display text-xl font-bold tabular ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-mute">{sub}</p>}
    </div>
  );
}

const STATUS: Record<string, string> = {
  active: "bg-green-50 text-green-800 ring-1 ring-green-200",
  dormant: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  closed: "bg-sand-200 text-ink-soft ring-1 ring-sand-300",
};
export const CustomerStatus = ({ status }: { status: string }) => <span className={`chip ${STATUS[status] ?? "bg-sand-100"}`}>{status}</span>;

const KIND: Record<string, { label: string; tone: string }> = {
  savings_deposit: { label: "Savings deposit", tone: "bg-brand-50 text-brand-700 ring-1 ring-brand-200" },
  savings_withdrawal: { label: "Savings withdrawal", tone: "bg-amber-50 text-amber-800 ring-1 ring-amber-200" },
  credit_issued: { label: "Credit issued", tone: "bg-orange-50 text-money-credit ring-1 ring-orange-200" },
  credit_repayment: { label: "Credit repayment", tone: "bg-green-50 text-green-800 ring-1 ring-green-200" },
};
export const TxKind = ({ kind }: { kind: string }) => <span className={`chip ${KIND[kind]?.tone ?? "bg-sand-100"}`}>{KIND[kind]?.label ?? kind}</span>;

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-sand-300 px-6 py-10 text-center">
      <p className="font-semibold text-ink-soft">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-ink-mute">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children, onClose }: { tone?: "info" | "warn" | "error" | "success"; title?: string; children: ReactNode; onClose?: () => void }) {
  const tones = {
    info: "border-brand-200 bg-brand-50 text-brand-800",
    warn: "border-gold-300 bg-gold-50 text-gold-800",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-green-200 bg-green-50 text-green-800",
  };
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
      {onClose && <button onClick={onClose} aria-label="Dismiss" className="rounded p-0.5 hover:bg-black/5"><X className="h-4 w-4" /></button>}
    </div>
  );
}

/** A quiet upsell for a feature the current package does not include. */
export function Upgrade({ feature, edition }: { feature: string; edition: Edition }) {
  return (
    <div className="rounded-xl border border-dashed border-gold-300 bg-gold-50/60 px-5 py-6 text-center">
      <p className="font-display text-base font-bold text-gold-800">{feature} is not in your package</p>
      <p className="mx-auto mt-1 max-w-lg text-sm text-gold-800/80">
        You are on <strong>{EDITION_META[edition].name}</strong>. Upgrade to unlock {feature.toLowerCase()}, or switch the
        package in Admin to preview it with the demo data.
      </p>
      <Link href="/admin/" className="btn-primary mt-3">Open Admin</Link>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-mute">{hint}</span>}
    </label>
  );
}

export function useToast() {
  const [message, setMessage] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  const view = message ? (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2">
      <Notice tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Notice>
    </div>
  ) : null;
  return { toast: setMessage, toastView: view };
}
