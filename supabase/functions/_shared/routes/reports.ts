// Reports. Every route here is Enhanced-only except the plain transaction list,
// which is available everywhere through /transactions.
import { Hono } from "npm:hono@4.6.14";
import { auth, fail, isoDate, type Env } from "../http.ts";
import { currentEdition } from "../settings.ts";
import { CAPS, hasCap } from "../domain/editions.ts";
import { toCSV } from "../domain/csv.ts";
import { addMonths, today } from "../domain/dates.ts";
import { activityReport, allTransactions, periodReport, savingsCreditSummary } from "../lib/domain.ts";

export const reports = new Hono<Env>();
reports.use("/reports/*", auth());

const requireEnhanced = async (cap: keyof typeof CAPS) => {
  const edition = await currentEdition();
  if (!hasCap(edition, CAPS[cap])) fail(402, "Reports are part of the Enhanced package.", "edition_required");
  return edition;
};

const range = (c: { req: { query: (k: string) => string | undefined } }) => {
  const to = isoDate(c.req.query("to"), "to date", { optional: true }) || today();
  const from = isoDate(c.req.query("from"), "from date", { optional: true }) || addMonths(to, -5);
  return { from, to };
};

/** Savings and credit summaries across the selected period. */
reports.get("/reports/summary", async (c) => {
  await requireEnhanced("reports");
  const { from, to } = range(c);
  const summary = await savingsCreditSummary(from, to);
  return c.json({ ...summary, months: await periodReport(from, to) });
});

reports.get("/reports/summary/export", async (c) => {
  await requireEnhanced("reports");
  const { from, to } = range(c);
  const months = await periodReport(from, to);
  const csv = toCSV(
    ["Month", "Transactions", "Savings in", "Savings out", "Net savings", "Credit issued", "Credit repaid", "Net credit change"],
    months.map((m) => [m.period, m.count, m.savings_in, m.savings_out, m.savings, m.credit_issued, m.credit_repaid, m.credit_outstanding]),
  );
  c.header("content-type", "text/csv; charset=utf-8");
  c.header("content-disposition", `attachment; filename="savings-credit-summary-${from}-to-${to}.csv"`);
  return c.body(csv);
});

/** Customer activity and outstanding credit. */
reports.get("/reports/activity", async (c) => {
  await requireEnhanced("activityReports");
  const { from, to } = range(c);
  const rows = await activityReport(from, to);
  const totals = rows.reduce((a, r) => ({
    savings: a.savings + r.savings,
    credit_outstanding: a.credit_outstanding + r.credit_outstanding,
    transactions: a.transactions + r.tx_count,
  }), { savings: 0, credit_outstanding: 0, transactions: 0 });
  return c.json({ from, to, rows, totals });
});

reports.get("/reports/activity/export", async (c) => {
  await requireEnhanced("activityReports");
  const { from, to } = range(c);
  const rows = await activityReport(from, to);
  const csv = toCSV(
    ["Customer code", "Customer", "Status", "Transactions", "Savings balance", "Credit outstanding", "Last activity"],
    rows.map((r) => [r.code, r.name, r.status, r.tx_count, r.savings, r.credit_outstanding, r.last_activity ?? ""]),
  );
  c.header("content-type", "text/csv; charset=utf-8");
  c.header("content-disposition", `attachment; filename="customer-activity-${from}-to-${to}.csv"`);
  return c.body(csv);
});

/** Outstanding credit, largest first - the collections worklist.
 *  This is a live position, so it is never limited to the report range. */
reports.get("/reports/outstanding", async (c) => {
  await requireEnhanced("activityReports");
  const rows = (await activityReport()).filter((r) => r.credit_outstanding > 0).sort((a, b) => b.credit_outstanding - a.credit_outstanding);
  return c.json({ as_at: today(), rows, total_outstanding: rows.reduce((a, r) => a + r.credit_outstanding, 0) });
});

/** Full customer list export (Classic and above get CSV export generally). */
reports.get("/reports/customers/export", async (c) => {
  const edition = await currentEdition();
  if (!hasCap(edition, CAPS.csv)) fail(402, "CSV export is part of the Classic package.", "edition_required");
  const txs = await allTransactions();
  const rows = await activityReport();
  const balancesByCustomer = new Map<string, { savings: number; credit: number }>();
  for (const t of txs) if (!t.voided_at) {
    const b = balancesByCustomer.get(t.customer_id) ?? { savings: 0, credit: 0 };
    if (t.kind === "savings_deposit") b.savings += t.amount;
    if (t.kind === "savings_withdrawal") b.savings -= t.amount;
    if (t.kind === "credit_issued") b.credit += t.amount;
    if (t.kind === "credit_repayment") b.credit -= t.amount;
    balancesByCustomer.set(t.customer_id, b);
  }
  const csv = toCSV(
    ["Customer code", "Customer", "Phone", "Email", "Address", "Joined", "Status", "Savings balance", "Credit outstanding"],
    rows.map((r) => {
      const b = balancesByCustomer.get(r.customer_id) ?? { savings: 0, credit: 0 };
      return [r.code, r.name, "", "", "", "", r.status, b.savings, b.credit];
    }),
  );
  c.header("content-type", "text/csv; charset=utf-8");
  c.header("content-disposition", `attachment; filename="customers-${today()}.csv"`);
  return c.body(csv);
});
