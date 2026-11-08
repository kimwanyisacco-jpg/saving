// Dashboard. Basic shows totals only; Classic adds customer, savings, credit and
// repayment summaries; Enhanced adds the date-filtered view and trend series.
import { Hono } from "npm:hono@4.6.14";
import { auth, isoDate, type Env } from "../http.ts";
import { currentEdition } from "../settings.ts";
import { CAPS, editionCapabilities, hasCap } from "../domain/editions.ts";
import { monthlySeries } from "../domain/compute.ts";
import { monthStart, today } from "../domain/dates.ts";
import { allTransactions, dashboardTotals, recentTransactions } from "../lib/domain.ts";

export const dashboard = new Hono<Env>();
dashboard.use("/dashboard", auth());

dashboard.get("/dashboard", async (c) => {
  const edition = await currentEdition();
  const caps = editionCapabilities(edition);
  const totals = await dashboardTotals();
  const recent = await recentTransactions(8);

  // Basic: the tiles and the last few transactions only.
  const payload: Record<string, unknown> = { edition, capabilities: caps, totals, recent_transactions: recent };

  if (hasCap(edition, CAPS.separateBalances)) {
    payload.savings_credit = {
      savings: totals.savings,
      savings_in: totals.savings_in,
      savings_out: totals.savings_out,
      credit_issued: totals.credit_issued,
      credit_repaid: totals.credit_repaid,
      credit_outstanding: totals.credit_outstanding,
      repayment_rate: totals.credit_issued > 0 ? Math.round((totals.credit_repaid / totals.credit_issued) * 100) : 0,
    };
  }

  if (hasCap(edition, CAPS.reports)) {
    const from = isoDate(c.req.query("from"), "from date", { optional: true }) || monthStart(today());
    const to = isoDate(c.req.query("to"), "to date", { optional: true }) || today();
    const txs = await allTransactions();
    const months = Number(c.req.query("months") ?? 6) || 6;
    payload.range = { from, to };
    payload.trend = monthlySeries(txs, to.slice(0, 7), Math.min(Math.max(months, 3), 24));
    payload.in_range = txs.filter((t) => t.occurred_on >= from && t.occurred_on <= to && !t.voided_at).length;
  }

  return c.json(payload);
});
