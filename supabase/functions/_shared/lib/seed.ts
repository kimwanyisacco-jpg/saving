// Seeds the demo dataset into Postgres. The dataset itself comes from
// domain/demo.ts so the live database and the offline browser demo always match.
import { sql } from "../db.ts";
import { audit } from "../audit.ts";
import { hashPassword } from "../crypto.ts";
import { buildDemoDataset, demoAccounts } from "../domain/demo.ts";
import { setSetting } from "../settings.ts";
import type { Edition } from "../domain/types.ts";

export async function hasData(): Promise<boolean> {
  const [r] = await sql`select (select count(*) from users) + (select count(*) from customers) as n`;
  return Number(r.n) > 0;
}

/** Wipes business data (not the schema) and installs a fresh demo dataset. */
export async function seedDemo(edition: Edition, opts: { reset?: boolean } = {}) {
  const data = buildDemoDataset(edition);

  if (opts.reset) {
    await sql`truncate table transaction_corrections, transactions, customers, audit_logs restart identity cascade`;
    await sql`delete from users`;
  }

  const staffIds: string[] = [];
  for (const s of data.staff) {
    const [row] = await sql`
      insert into users (role, name, email, phone, password_hash)
      values (${s.role}, ${s.name}, ${s.email}, ${s.phone}, ${await hashPassword(s.password)})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash, role = excluded.role
      returning id`;
    staffIds.push(row.id);
  }

  const customerIds: string[] = [];
  for (const c of data.customers) {
    const [row] = await sql`
      insert into customers (id, code, name, phone, email, national_id, address, joined_on, status, notes, created_by)
      values (${c.id}, ${c.code}, ${c.name}, ${c.phone}, ${c.email}, ${c.national_id}, ${c.address}, ${c.joined_on}, ${c.status}, ${c.notes}, ${staffIds[0]})
      on conflict (id) do update set name = excluded.name, phone = excluded.phone, email = excluded.email,
        national_id = excluded.national_id, address = excluded.address, joined_on = excluded.joined_on,
        status = excluded.status, notes = excluded.notes, updated_at = now()
      returning id`;
    customerIds.push(row.id);
  }

  // Insert transactions in chunks; each row keeps the demo ids so the browser demo
  // and the database describe the very same records.
  const rows = data.transactions.map((t, i) => ({
    id: t.id,
    customer_id: t.customer_id,
    kind: t.kind,
    amount: t.amount,
    occurred_on: t.occurred_on,
    method: t.method,
    reference: t.reference,
    note: t.note,
    receipt_no: t.receipt_no,
    recorded_by: staffIds[i % staffIds.length],
    created_at: t.created_at,
    voided_at: t.voided_at,
    void_reason: t.void_reason,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await sql`insert into transactions ${sql(rows.slice(i, i + 500), "id", "customer_id", "kind", "amount", "occurred_on", "method", "reference", "note", "receipt_no", "recorded_by", "created_at", "voided_at", "void_reason")}
      on conflict (id) do nothing`;
  }

  // Keep the customer code sequence ahead of the seeded codes.
  await sql`select setval('customer_code_seq', greatest((select count(*) from customers), 1))`;
  await sql`select setval('receipt_seq', greatest((select count(*) from transactions) + 100000, 100001))`;

  // The business profile and edition travel with the demo.
  const p = data.profile;
  await setSetting("edition", edition, staffIds[0]);
  await setSetting("business_name", p.name, staffIds[0]);
  await setSetting("business_address", p.address, staffIds[0]);
  await setSetting("business_phone", p.phone, staffIds[0]);
  await setSetting("business_email", p.email, staffIds[0]);
  await setSetting("business_logo_text", p.logo_text, staffIds[0]);
  await setSetting("business_footer_note", p.footer_note, staffIds[0]);
  // A seeded business is presented as already handed over, so the package's
  // customer-email window is open from the day the dataset was generated.
  await setSetting("handover_on", String(data.generated_at).slice(0, 10), staffIds[0]);

  await audit(staffIds[0], "setup.demo_seeded", null, null, { edition, customers: data.customers.length, transactions: rows.length });

  return {
    edition,
    business: p,
    customers: data.customers.length,
    transactions: rows.length,
    accounts: demoAccounts(edition),
  };
}
