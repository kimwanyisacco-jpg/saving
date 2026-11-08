"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, TrendingUp, Wallet, Users, ArrowLeftRight, Printer } from "lucide-react";
import { Authed } from "@/components/Authed";
import { Bar, MonthBars } from "@/components/Chart";
import { Card, Empty, Notice, Spinner, Tile, TxKind, Upgrade } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { formatCompact, formatDate, formatNumber, formatUGX, shortMonth, today, addMonths } from "@/lib/format";
import type { EditionCapabilities } from "../../../supabase/functions/_shared/domain/editions";
import type { DashboardTotals, Edition, Transaction } from "../../../supabase/functions/_shared/domain/types";

interface DashboardPayload {
  edition: Edition;
  capabilities: EditionCapabilities;
  totals: DashboardTotals;
  recent_transactions: Transaction[];
  savings_credit?: {
    savings: number; savings_in: number; savings_out: number;
    credit_issued: number; credit_repaid: number; credit_outstanding: number; repayment_rate: number;
  };
  trend?: { period: string; label: string; count: number; savings_in: number; credit_issued: number; credit_outstanding: number }[];
  range?: { from: string; to: string };
  in_range?: number;
}

export default function DashboardPage() {
  return <Authed title="Dashboard" wide>{(me) => <Dashboard caps={me.capabilities} edition={me.edition} name={me.session.user.name} business={me.business.name} />}</Authed>;
}

function Dashboard({ caps, edition, name, business }: { caps: EditionCapabilities; edition: Edition; name: string; business: string }) {
  const [range, setRange] = useState({ from: addMonths(today(), -5), to: today() });
  const query = caps.reports ? `/dashboard?from=${range.from}&to=${range.to}` : "/dashboard";
  const { data, loading, error } = useApi<DashboardPayload>(query, [range.from, range.to]);

  if (loading && !data) return <Spinner label="Loading dashboard" />;
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return null;
  const t = data.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Good to see you, {name.split(" ")[0]}</h1>
          <p className="text-sm text-ink-mute">{business}{t.last_activity ? ` · last activity ${formatDate(t.last_activity)}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/transactions/?new=1" className="btn-primary">Record a transaction</Link>
          <Link href="/customers/" className="btn-secondary">Customers</Link>
        </div>
      </div>

      {/* Basic: totals only. Classic and Enhanced add the split and more detail. */}
      <div className={`grid gap-4 ${caps.separateBalances ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {caps.separateBalances ? (
          <>
            <Tile label="Savings held" value={formatUGX(t.savings)} sub={`In ${formatCompact(t.savings_in)} · out ${formatCompact(t.savings_out)}`} tone="save" />
            <Tile label="Credit outstanding" value={formatUGX(t.credit_outstanding)} sub={`Issued ${formatCompact(t.credit_issued)} · repaid ${formatCompact(t.credit_repaid)}`} tone="credit" />
            <Tile label="Customers" value={formatNumber(t.customers)} sub={`${formatNumber(t.active_customers)} active`} />
            <Tile label="Transactions" value={formatNumber(t.transactions)} sub={`${formatNumber(t.transactions_30d)} in the last 30 days`} />
          </>
        ) : (
          <>
            <Tile label="Money in (all time)" value={formatUGX(t.savings_in + t.credit_repaid)} sub="Savings deposits and credit repayments" tone="save" />
            <Tile label="Money out (all time)" value={formatUGX(t.savings_out + t.credit_issued)} sub="Withdrawals and credit issued" tone="credit" />
            <Tile label="Customers" value={formatNumber(t.customers)} sub={`${formatNumber(t.transactions)} transactions recorded`} />
          </>
        )}
      </div>

      {caps.separateBalances && data.savings_credit && (
        <Card title="Savings and credit at a glance" action={<Link href="/reports/" className="btn-ghost text-sm">Reports <ArrowRight className="h-4 w-4" /></Link>}>
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-soft"><Wallet className="h-4 w-4" /> Savings</p>
              <p className="mt-2 font-display text-2xl font-extrabold text-money-save tabular">{formatUGX(data.savings_credit.savings)}</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-ink-soft"><span>Deposits</span><span className="tabular font-semibold">{formatUGX(data.savings_credit.savings_in)}</span></div>
                <div className="flex items-center justify-between text-xs text-ink-soft"><span>Withdrawals</span><span className="tabular font-semibold">{formatUGX(data.savings_credit.savings_out)}</span></div>
              </div>
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-soft"><TrendingUp className="h-4 w-4" /> Credit</p>
              <p className="mt-2 font-display text-2xl font-extrabold text-money-credit tabular">{formatUGX(data.savings_credit.credit_outstanding)}</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-ink-soft"><span>Issued</span><span className="tabular font-semibold">{formatUGX(data.savings_credit.credit_issued)}</span></div>
                <div className="flex items-center justify-between text-xs text-ink-soft"><span>Repaid</span><span className="tabular font-semibold">{formatUGX(data.savings_credit.credit_repaid)}</span></div>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-soft">Repayment rate</p>
              <p className="mt-2 font-display text-2xl font-extrabold text-brand-700">{data.savings_credit.repayment_rate}%</p>
              <p className="mt-1 text-xs text-ink-mute">of everything issued has been repaid</p>
              <div className="mt-3"><Bar value={data.savings_credit.credit_repaid} max={Math.max(1, data.savings_credit.credit_issued)} /></div>
            </div>
          </div>
        </Card>
      )}

      {caps.reports ? (
        <Card
          title="Monthly movement"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className="input w-auto" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} aria-label="From date" />
              <span className="text-xs text-ink-mute">to</span>
              <input type="date" className="input w-auto" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} aria-label="To date" />
            </div>
          }
        >
          {data.trend && data.trend.some((m) => m.savings_in || m.credit_issued) ? (
            <>
              <MonthBars data={data.trend.map((m) => ({ label: shortMonth(m.period), a: m.savings_in, b: m.credit_issued }))} />
              <p className="mt-3 text-xs text-ink-mute">{formatNumber(data.in_range ?? 0)} transactions between {formatDate(range.from)} and {formatDate(range.to)}.</p>
            </>
          ) : (
            <Empty title="No movement in this period" hint="Widen the dates or record a transaction." />
          )}
        </Card>
      ) : (
        <Upgrade feature="Date-filtered reports and monthly trends" edition={edition} />
      )}

      <Card
        title="Recent transactions"
        action={<Link href="/transactions/" className="btn-ghost text-sm">All transactions <ArrowRight className="h-4 w-4" /></Link>}
      >
        {data.recent_transactions.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem]">
              <thead>
                <tr className="border-b border-sand-200">
                  <th className="th">Date</th><th className="th">Customer</th><th className="th">Type</th>
                  <th className="th text-right">Amount</th><th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {data.recent_transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-sand-50">
                    <td className="td text-ink-mute">{formatDate(tx.occurred_on)}</td>
                    <td className="td font-semibold">{tx.customer_name}</td>
                    <td className="td"><TxKind kind={tx.kind} /></td>
                    <td className="num td font-semibold">{formatUGX(tx.amount)}</td>
                    <td className="td text-right">
                      <Link href={`/customer/?id=${tx.customer_id}`} className="btn-ghost px-2 py-1 text-xs">
                        <Printer className="h-3.5 w-3.5" /> Statement
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No transactions yet" hint="Record the first savings deposit to get started." action={<Link href="/transactions/?new=1" className="btn-primary">Record a transaction</Link>} />
        )}
      </Card>

      {!caps.separateBalances && (
        <Card>
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
            <Users className="h-4 w-4" /> <span className="font-semibold">Basic package.</span>
            <span>Savings and credit are recorded together and reported as one position.</span>
            <Link href="/packages/" className="btn-secondary px-3 py-1 text-xs">See what Classic adds</Link>
          </div>
        </Card>
      )}
      {caps.separateBalances && !caps.reports && (
        <Card>
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
            <ArrowLeftRight className="h-4 w-4" /> <span className="font-semibold">Classic package.</span>
            <span>You have separate balances, CSV export, backup and correction history. Enhanced adds date-filtered reports.</span>
            <Link href="/packages/" className="btn-secondary px-3 py-1 text-xs">Compare packages</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
