// Customer email notifications. Pure functions only: the caller decides whether
// a message should be built and hands it to a sender. Both the Edge Function and
// the offline demo build messages here, so what a customer reads is the same in
// the presentation and in the live product.
//
// Every message carries two bodies: branded HTML, and plain text for the clients
// that ask for it. The text is not a stripped copy - it is written to read well
// on its own, because some customers will only ever see that version.
import { formatDate } from "./dates.ts";
import { formatUGX } from "./money.ts";
import { notifyDays } from "./editions.ts";
import { brandedEmail } from "./emailHtml.ts";
import type { Customer, Edition, Transaction } from "./types.ts";

export interface NotifyContext {
  business_name: string;
  business_address: string;
  business_phone: string;
  business_email: string;
  business_logo_text: string;
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
  html: string;
  kind: "customer_registered" | "transaction_recorded";
  customer_id: string;
  transaction_id?: string;
  /** What a sender should write to the outbox. */
  entry: { kind: string; recipient: string; subject: string; body: string; html: string; customer_id: string; transaction_id: string | null; provider: string; status: string; error: string | null };
}

/** How each record reads in the subject line, as a noun. */
const KIND_LABEL: Record<string, string> = {
  savings_deposit: "savings deposit",
  savings_withdrawal: "savings withdrawal",
  credit_issued: "credit issued",
  credit_repayment: "credit repayment",
};

/** The same record as a full sentence, so "credit issued" does not read as
 *  "a credit issued of UGX ...". */
const KIND_SENTENCE: Record<string, (amount: string) => string> = {
  savings_deposit: (m) => `We have recorded a savings deposit of ${m} on your account.`,
  savings_withdrawal: (m) => `We have recorded a savings withdrawal of ${m} on your account.`,
  credit_issued: (m) => `We have issued credit of ${m} to your account.`,
  credit_repayment: (m) => `We have recorded a credit repayment of ${m} on your account.`,
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
const profileOf = (ctx: NotifyContext) => ({
  name: ctx.business_name, address: ctx.business_address, phone: ctx.business_phone,
  email: ctx.business_email, logo_text: ctx.business_logo_text,
});

const textFooter = (ctx: NotifyContext, closing: string) =>
  [closing, "", "--", ctx.business_name, ctx.business_phone, ctx.business_email,
   "", "This message was sent automatically when a record was entered. Please report any difference at the office."]
    .filter((l, i) => l !== "" || i === 1)
    .join("\n");

/** Sent when the office registers the customer. */
export function customerWelcome(ctx: NotifyContext, customer: Customer): Message | null {
  if (!customer.email) return null;
  const closing = "Keep this message as your receipt.";
  const subject = `${ctx.business_name}: your account is open (${customer.code})`;
  const heading = `Welcome, ${customer.name}`;
  const intro = "Your account has been opened with us. Please quote this number whenever you save, borrow or ask for a statement.";
  const text = [
    `Dear ${customer.name},`, "",
    "Your account has been opened with us. Your customer number is " + customer.code + ".",
    "Please quote this number whenever you save, borrow or ask for a statement.", "",
    `Opened on: ${formatDate(customer.joined_on)}`, "",
    textFooter(ctx, closing),
  ].join("\n");
  const html = brandedEmail({
    profile: profileOf(ctx), badge: "ACCOUNT OPENED",
    preheader: `Your customer number is ${customer.code}.`,
    heading, intro,
    primary: { label: "Customer number", value: customer.code },
    secondary: { label: "Opened on", value: formatDate(customer.joined_on) },
    rows: [["Name", customer.name], ["Account status", customer.status]],
    closing,
  });
  return {
    to: customer.email, to_name: customer.name, subject, text, html,
    kind: "customer_registered", customer_id: customer.id,
    entry: { kind: "customer_registered", recipient: customer.email, subject, body: text, html, customer_id: customer.id, transaction_id: null, provider: "email", status: "queued", error: null },
  };
}

/** Sent when the office records savings or credit against the customer. */
export function transactionReceipt(ctx: NotifyContext, customer: Customer, tx: Transaction): Message | null {
  if (!customer.email) return null;
  const what = KIND_LABEL[tx.kind] ?? tx.kind;
  const sentence = (KIND_SENTENCE[tx.kind] ?? ((m: string) => `We have recorded ${what} of ${m} on your account.`))(money(tx.amount));
  const closing = "Keep this message as your receipt.";
  const subject = `${ctx.business_name}: ${money(tx.amount)} ${what} (${tx.reference ?? tx.receipt_no ?? ""})`.trim();
  const rows: [string, string][] = [
    ["Date", formatDate(tx.occurred_on)],
    ["Reference", tx.reference ?? "-"],
    ["Receipt number", tx.receipt_no ?? "-"],
    ["Method", METHOD_LABEL[tx.method] ?? tx.method],
  ];
  if (tx.note) rows.push(["Note", tx.note]);
  const text = [
    `Dear ${customer.name},`, "",
    sentence, "",
    ...rows.map(([k, v]) => `${k}: ${v}`), "",
    textFooter(ctx, closing),
  ].join("\n");
  const html = brandedEmail({
    profile: profileOf(ctx), badge: "RECEIPT",
    preheader: `${money(tx.amount)} ${what} on ${formatDate(tx.occurred_on)}.`,
    heading: customer.name, intro: sentence,
    primary: { label: what, value: money(tx.amount) },
    secondary: { label: "Date", value: formatDate(tx.occurred_on) },
    rows, closing,
  });
  return {
    to: customer.email, to_name: customer.name, subject, text, html,
    kind: "transaction_recorded", customer_id: customer.id, transaction_id: tx.id,
    entry: { kind: "transaction_recorded", recipient: customer.email, subject, body: text, html, customer_id: customer.id, transaction_id: tx.id, provider: "email", status: "queued", error: null },
  };
}
