// Customer email notifications. Pure functions only: the caller decides whether
// a message should be built and hands it to a sender. Both the Edge Function and
// the offline demo build messages here, so what a customer reads is the same in
// the presentation and in the live product.
import { formatDate } from "./dates.ts";
import { formatUGX } from "./money.ts";
import { notifyDays } from "./editions.ts";
import type { Customer, Edition, Transaction } from "./types.ts";

export interface NotifyContext {
  business_name: string;
  business_phone: string;
  business_email: string;
  edition: Edition;
  /** ISO day the system was handed over. Notifications run for `notify_days` after it. */
  handover_on: string | null;
  /** The business's own time, as an ISO day. Defaults to the real today. */
  today: string;
}

export interface Message {
  to: string;
  to_name: string;
  subject: string;
  text: string;
  kind: "customer_registered" | "transaction_recorded";
  customer_id: string;
  transaction_id?: string;
  /** What a sender should write to the outbox. */
  entry: { kind: string; recipient: string; subject: string; body: string; customer_id: string; transaction_id: string | null; provider: string; status: string; error: string | null };
}

const KIND_LABEL: Record<string, string> = {
  savings_deposit: "savings deposit",
  savings_withdrawal: "savings withdrawal",
  credit_issued: "credit issued",
  credit_repayment: "credit repayment",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "cash",
  bank: "bank transfer",
  mobile_money: "mobile money",
  cheque: "cheque",
  other: "other",
};

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);

/** Is the business still inside its notification window? Basic has none. The
 *  window runs from handover for the days the package includes. With no handover
 *  date on file the window has not started, so nothing is sent. */
export function notificationsOpen(ctx: NotifyContext): boolean {
  const days = notifyDays(ctx.edition);
  if (days <= 0) return false;
  if (!ctx.handover_on) return false;
  const elapsed = daysBetween(ctx.handover_on, ctx.today);
  return elapsed >= 0 && elapsed < days;
}

/** When the window closes, for the screen that shows it. Null when there is none. */
export function notificationWindowEnd(ctx: NotifyContext): string | null {
  const days = notifyDays(ctx.edition);
  if (days <= 0 || !ctx.handover_on) return null;
  const d = new Date(ctx.handover_on + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const money = (n: number) => formatUGX(n);

function signature(ctx: NotifyContext): string {
  const lines = [ctx.business_name, ctx.business_phone, ctx.business_email].filter(Boolean);
  return lines.join("\n");
}

function wrap(ctx: NotifyContext, body: string): string {
  return `${body}\n\n--\n${signature(ctx)}\n\nThis message was sent automatically when a record was entered. Please report any difference at the office.`;
}

/** Sent when the office registers the customer. */
export function customerWelcome(ctx: NotifyContext, customer: Customer): Message | null {
  if (!customer.email) return null;
  const subject = `${ctx.business_name}: your account is open (${customer.code})`;
  const body = wrap(ctx, [
    `Dear ${customer.name},`,
    "",
    `Your account has been opened with us. Your customer number is ${customer.code}.`,
    `Please quote this number whenever you save, borrow or ask for a statement.`,
    "",
    `Opened on: ${formatDate(customer.joined_on)}`,
  ].join("\n"));
  return {
    to: customer.email, to_name: customer.name, subject, text: body,
    kind: "customer_registered", customer_id: customer.id,
    entry: { kind: "customer_registered", recipient: customer.email, subject, body, customer_id: customer.id, transaction_id: null, provider: "email", status: "queued", error: null },
  };
}

/** Sent when the office records savings or credit against the customer. */
export function transactionReceipt(ctx: NotifyContext, customer: Customer, tx: Transaction): Message | null {
  if (!customer.email) return null;
  const what = KIND_LABEL[tx.kind] ?? tx.kind;
  const subject = `${ctx.business_name}: ${money(tx.amount)} ${what} (${tx.reference ?? tx.receipt_no ?? ""})`.trim();
  const body = wrap(ctx, [
    `Dear ${customer.name},`,
    "",
    `We have recorded a ${what} of ${money(tx.amount)} on your account.`,
    "",
    `Date: ${formatDate(tx.occurred_on)}`,
    `Reference: ${tx.reference ?? "-"}`,
    `Receipt number: ${tx.receipt_no ?? "-"}`,
    `Method: ${METHOD_LABEL[tx.method] ?? tx.method}`,
    tx.note ? `Note: ${tx.note}` : "",
  ].filter(Boolean).join("\n"));
  return {
    to: customer.email, to_name: customer.name, subject, text: body,
    kind: "transaction_recorded", customer_id: customer.id, transaction_id: tx.id,
    entry: { kind: "transaction_recorded", recipient: customer.email, subject, body, customer_id: customer.id, transaction_id: tx.id, provider: "email", status: "queued", error: null },
  };
}
