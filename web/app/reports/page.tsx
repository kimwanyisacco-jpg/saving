"use client";
import Link from "next/link";
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { Authed } from "@/components/Authed";
import { Bar, MonthBars } from "@/components/Chart";
import { Card, Empty, Notice, Spinner, Tile, Upgrade, useToast } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { download, openPdf } from "@/lib/api";
import { formatCompact, formatDate, formatMonth, formatNumber, formatUGX, shortMonth, today, addMonths } from "@/lib/format";
import type { EditionCapabilities } from "../../../supabase/functions/_shared/domain/editions";
import type { Balances, Edition } from "../../../supabase/functions/_shared/domain/types";

export default function ReportsPage() {
  return <Authed title="Reports" wide>{(me) => <Reports caps={me.capabilities} edition={me.edition} />}</Authed>;
}

interface Summary {
  period: { from: string; to: string };
  opening: Balances;
  movement: Balances;
  closing: { savings: number; credit_outstanding: number };
  months: { period: string; count: number; savings_in: number; savings_out: number; savings: number; credit_issued: number; credit_repaid: number; credit_outstanding: number }[];
}
interface ActivityRow { customer_id: string; code: string; name: string; status: string; savings: number; credit_outstanding: number; tx_count: number; last_activity: string | null }

function Reports({ caps, edition }: { caps: EditionCapabilities; edition: Edition }) {
  const [range, setRange] = useState({ from: addMonths(today(), -5), to: today() });
  const qs = `?from=${range.from}&to=${range.to}`;
  const summary = useApi<Summary>(caps.reports ? `/reports/summary${qs}` : null, [range.from, range.to]);
  const activity = useApi<{ from: string; to: string; rows: ActivityRow[]; totals: { savings: number; credit_outstanding: number; transactions: number } }>(caps.activityReports ? `/reports/activity${qs}` : null, [range.from, range.to]);
  const outstanding = useApi<{ as_at: string; rows: ActivityRow[]; total_outstanding: number }>(caps.activityReports ? "/reports/outstanding" : null, []);
  const { toast, toastView } = useToast();

  if (!caps.reports) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-extrabold text-ink">Reports</h1>
        <Upgrade feature="Date-filtered reports and period summaries" edition={edition} />
      </div>
    );
  }

  const m = summary.data?.movement;
  const maxSavings = Math.max(1, ...(activity.data?.rows ?? []).map((r) => r.savings));
  const maxCredit = Math.max(1, ...(outstanding.data?.rows ?? []).map((r) => r.credit_outstanding));

  async function exportCsv(path: string, name: string) {
    try { await download(path, name); } catch (e) { toast({ tone: "error", text: (e as Error).message }); }
  }
  async function printBusiness() {
    try { await openPdf(`/statements/business.pdf${qs}`, "business-summary.pdf"); } catch (e) { toast({ tone: "error", text: (e as Error).message }); }
  }

  return (
    <div className="space-y-5">
      {toastView}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Reports</h1>
          <p className="text-sm text-ink-mute">Savings and credit summaries across the period you choose</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><span className="label">From</span><input type="date" className="input w-auto" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></div>
          <div><span className="label">To</span><input type="date" className="input w-auto" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></div>
          <button className="btn-secondary" onClick={printBusiness}><Printer className="h-4 w-4" /> Business summary PDF</button>
        </div>
      </div>

      {summary.error && <Notice tone="error">{summary.error}</Notice>}
      {summary.loading && !summary.data && <Spinner label="Building reports" />}

      {m && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Savings in" value={formatUGX(m.savings_in)} sub={`${formatDate(range.from)} – ${formatDate(range.to)}`} tone="save" />
            <Tile label="Savings out" value={formatUGX(m.savings_out)} sub="withdrawals in the period" tone="credit" />
            <Tile label="Credit issued" value={formatUGX(m.credit_issued)} sub={`repaid ${formatCompact(m.credit_repaid)}`} tone="credit" />
            <Tile label="Closing position" value={formatUGX(summary.data!.closing.savings)} sub={`credit outstanding ${formatUGX(summary.data!.closing.credit_outstanding)}`} />
          </div>

          <Card
            title="Savings and credit by month"
            action={<button className="btn-secondary" onClick={() => exportCsv(`/reports/summary/export${qs}`, "summary.csv")}><Download className="h-4 w-4" /> CSV</button>}
          >
            {summary.data!.months.some((x) => x.savings_in || x.credit_issued) ? (
              <MonthBars data={summary.data!.months.map((x) => ({ label: shortMonth(x.period), a: x.savings_in, b: x.credit_issued }))} />
            ) : <Empty title="No movement in this period" />}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[46rem]">
                <thead>
                  <tr className="border-b border-sand-200">
                    <th className="th">Month</th><th className="th text-right">Txns</th><th className="th text-right">Savings in</th><th className="th text-right">Savings out</th>
                    <th className="th text-right">Credit issued</th><th className="th text-right">Repaid</th><th className="th text-right">Net credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {summary.data!.months.map((x) => (
                    <tr key={x.period} className="hover:bg-sand-50">
                      <td className="td font-semibold">{formatMonth(x.period)}</td>
                      <td className="num td">{formatNumber(x.count)}</td>
                      <td className="num td">{formatNumber(x.savings_in)}</td>
                      <td className="num td">{formatNumber(x.savings_out)}</td>
                      <td className="num td">{formatNumber(x.credit_issued)}</td>
                      <td className="num td">{formatNumber(x.credit_repaid)}</td>
                      <td className="num td font-semibold">{formatNumber(x.credit_outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-mute">
              Opening savings {formatUGX(summary.data!.opening.savings)} → closing {formatUGX(summary.data!.closing.savings)}.
              Opening credit outstanding {formatUGX(summary.data!.opening.credit_outstanding)} → closing {formatUGX(summary.data!.closing.credit_outstanding)}.
            </p>
          </Card>
        </>
      )}

      {caps.activityReports && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card
            title="Customer activity"
            action={<button className="btn-secondary" onClick={() => exportCsv(`/reports/activity/export${qs}`, "activity.csv")}><Download className="h-4 w-4" /> CSV</button>}
          >
            {activity.loading && !activity.data ? <Spinner label="Loading" /> : activity.data && activity.data.rows.length ? (
              <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
                {activity.data.rows.slice(0, 20).map((r) => (
                  <div key={r.customer_id}>
                    <div className="flex items-center justify-between text-sm">
                      <Link href={`/customer/?id=${r.customer_id}`} className="font-semibold hover:underline">{r.name}</Link>
                      <span className="tabular text-ink-soft">{formatUGX(r.savings)}</span>
                    </div>
                    <div className="mt-1"><Bar value={r.savings} max={maxSavings} /></div>
                    <p className="mt-1 text-xs text-ink-mute">{r.tx_count} transactions{r.last_activity ? ` · last ${formatDate(r.last_activity)}` : ""}</p>
                  </div>
                ))}
              </div>
            ) : <Empty title="No activity in this period" />}
          </Card>

          <Card
            title="Outstanding credit"
            action={<span className="text-xs font-semibold text-ink-soft">{formatUGX(outstanding.data?.total_outstanding ?? 0)} owed</span>}
          >
            {outstanding.loading && !outstanding.data ? <Spinner label="Loading" /> : outstanding.data && outstanding.data.rows.length ? (
              <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
                {outstanding.data.rows.slice(0, 20).map((r) => (
                  <div key={r.customer_id}>
                    <div className="flex items-center justify-between text-sm">
                      <Link href={`/customer/?id=${r.customer_id}`} className="font-semibold hover:underline">{r.name}</Link>
                      <span className="tabular font-semibold text-money-credit">{formatUGX(r.credit_outstanding)}</span>
                    </div>
                    <div className="mt-1"><Bar value={r.credit_outstanding} max={maxCredit} tone="gold" /></div>
                  </div>
                ))}
              </div>
            ) : <Empty title="No outstanding credit" hint="Every customer has repaid." />}
          </Card>
        </div>
      )}
    </div>
  );
}
