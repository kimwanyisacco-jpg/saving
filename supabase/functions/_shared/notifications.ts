// The notification outbox: decide, build, send, record. Called after a customer
// is registered or a transaction is recorded. Never throws into the caller - the
// money is already recorded and a mail problem must not undo it.
import { sql, json } from "./db.ts";
import { audit } from "./audit.ts";
import { allSettings, currentEdition } from "./settings.ts";
import { mailConfigured, sendEmail } from "./mail.ts";
import { customerWelcome, notificationsOpen, notificationWindowEnd, transactionReceipt, type Message, type NotifyContext } from "./domain/notify.ts";
import { notifyDays } from "./domain/editions.ts";
import { today } from "./domain/dates.ts";
import type { Customer, Transaction } from "./domain/types.ts";

async function context(): Promise<NotifyContext> {
  const s = await allSettings();
  return {
    business_name: s.business_name,
    business_address: s.business_address,
    business_phone: s.business_phone,
    business_email: s.business_email,
    business_logo_text: s.business_logo_text,
    edition: await currentEdition(),
    handover_on: s.handover_on || null,
    today: today(),
  };
}

/** Why notifications are on or off right now, for the Admin screen. */
export async function notificationStatus() {
  const ctx = await context();
  const open = notificationsOpen(ctx);
  return {
    open,
    configured: mailConfigured(),
    handover_on: ctx.handover_on,
    window_ends_on: notificationWindowEnd(ctx),
    edition: ctx.edition,
    // The entitlement, so a screen can tell "no window" from "window not started".
    days: notifyDays(ctx.edition),
  };
}

/** Write the message to the outbox, then try to send it and record the outcome. */
async function deliver(msg: Message): Promise<"sent" | "failed" | "skipped"> {
  const result = await sendEmail(msg.to, msg.subject, msg.text, msg.html);
  const [row] = await sql`
    insert into notification_outbox (kind, customer_id, transaction_id, recipient, subject, body, html, provider, status, error, attempts, sent_at)
    values (${msg.entry.kind}, ${msg.entry.customer_id}, ${msg.entry.transaction_id}, ${msg.entry.recipient},
            ${msg.entry.subject}, ${msg.entry.body}, ${msg.entry.html}, ${result.provider}, ${result.status}, ${result.error}, 1,
            ${result.status === "sent" ? sql`now()` : null})
    returning id`;
  if (result.status === "failed") console.error("notification failed", msg.to, result.error);
  await audit(null, "notification." + result.status, "notification", row?.id ?? null, { to: msg.to, kind: msg.kind });
  return result.status;
}

async function notify(build: (ctx: NotifyContext) => Message | null) {
  try {
    const ctx = await context();
    if (!notificationsOpen(ctx)) return;
    const msg = build(ctx);
    if (!msg) return;
    await deliver(msg);
  } catch (e) {
    console.error("notification skipped", e);
  }
}

/** Called right after a customer is created. */
export const notifyCustomerRegistered = (customer: Customer) => notify((ctx) => customerWelcome(ctx, customer));

/** Called right after a transaction is created. */
export const notifyTransactionRecorded = (customer: Customer, tx: Transaction) => notify((ctx) => transactionReceipt(ctx, customer, tx));

/** Outbox rows for the Admin screen. */
export async function listNotifications(limit = 100) {
  const rows = await sql`
    select n.*, c.name as customer_name, c.code as customer_code
    from notification_outbox n
    left join customers c on c.id = n.customer_id
    order by n.created_at desc
    limit ${Math.min(Math.max(limit, 1), 500)}`;
  return rows.map((r) => ({
    id: r.id, kind: r.kind, recipient: r.recipient, subject: r.subject, body: r.body, html: r.html,
    status: r.status, provider: r.provider, error: r.error,
    customer_name: r.customer_name, customer_code: r.customer_code,
    created_at: r.created_at, sent_at: r.sent_at,
  }));
}
