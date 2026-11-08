"use client";
// Re-exports of the shared formatters so pages have one short import.
export { formatUGX, formatNumber, formatCompact, parseAmount } from "../../supabase/functions/_shared/domain/money";
export { formatDate, formatMonth, today, addMonths, monthStart, monthEnd } from "../../supabase/functions/_shared/domain/dates";

export const KIND_LABELS: Record<string, string> = {
  savings_deposit: "Savings deposit",
  savings_withdrawal: "Savings withdrawal",
  credit_issued: "Credit issued",
  credit_repayment: "Credit repayment",
};

export const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  mobile_money: "Mobile money",
  cheque: "Cheque",
  other: "Other",
};

/** "1 Mar 2026" -> "Mar" for tight charts. */
export const shortMonth = (iso: string) => formatMonthLabel(iso);
function formatMonthLabel(iso: string) {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = Number(iso.slice(5, 7));
  return names[m - 1] ?? iso;
}
