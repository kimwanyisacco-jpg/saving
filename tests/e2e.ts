// End-to-end check of the API against a real Postgres + Edge Function.
//
//   API_URL=http://localhost:8000 deno run -A tests/e2e.ts
//
// It reseeds the demo data for each package before checking it, so the run is
// repeatable: /setup/demo is a full reset.
const BASE = (Deno.env.get("API_URL") ?? "http://localhost:8000") + "/api/v1";

let pass = 0;
let fail = 0;
const ok = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

// deno-lint-ignore no-explicit-any
async function req(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<{ status: number; body: any; text: string; headers: Headers }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = "Bearer " + opts.token;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const text = await r.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: r.status, body, text, headers: r.headers };
}

async function seed(edition: string): Promise<string> {
  const s = await req("POST", "/setup/demo", { body: { edition, reset: true } });
  if (s.status !== 201) throw new Error("could not seed " + edition + ": " + s.text);
  const account = s.body.accounts.find((a: any) => a.role === "admin");
  const l = await req("POST", "/auth/login", { body: { login: account.login, password: account.password } });
  return l.body.token as string;
}

console.log("\n# package terms");
{
  const { editions, features } = (await req("GET", "/editions")).body;
  const by = Object.fromEntries(editions.map((e: any) => [e.id, e]));
  ok("basic support term", by.basic.support_days, 0);
  ok("classic support term is 30 days", by.classic.support_days, 30);
  ok("enhanced support term is 60 days", by.enhanced.support_days, 60);

  const support = features.find((f: any) => f.key === "priority_support");
  ok("support is a Classic feature", support.min, "classic");

  // The 30-day term must show on the licence itself, not only in the price list.
  const token = await seed("classic");
  const me = await req("GET", "/auth/me", { token });
  ok("classic capabilities carry the term", me.body.capabilities.supportDays, 30);
  ok("classic is not the Enhanced package", me.body.edition, "classic");
  const basic = await req("GET", "/settings/public", { token: await seed("basic") });
  ok("basic has no support term", basic.body.capabilities.supportDays, 0);
}

console.log("\n# package gates");
{
  const want: Record<string, Record<string, number>> = {
    basic: { customerStatement: 200, businessStatement: 402, csv: 402, backup: 402, reports: 402, corrections: 402, import: 402 },
    classic: { customerStatement: 200, businessStatement: 402, csv: 200, backup: 200, reports: 402, corrections: 200, import: 402 },
    enhanced: { customerStatement: 200, businessStatement: 200, csv: 200, backup: 200, reports: 200, corrections: 200, import: 200 },
  };
  for (const edition of ["basic", "classic", "enhanced"]) {
    const token = await seed(edition);
    const list = await req("GET", "/customers?limit=1", { token });
    const id = list.body.customers[0].id;
    const got = {
      customerStatement: (await req("GET", `/statements/${id}`, { token })).status,
      businessStatement: (await req("GET", "/statements/business.pdf", { token })).status,
      csv: (await req("GET", "/transactions/export", { token })).status,
      backup: (await req("GET", "/admin/backup.json", { token })).status,
      reports: (await req("GET", "/reports/summary", { token })).status,
      corrections: (await req("GET", "/transactions/corrections", { token })).status,
      import: (await req("GET", "/import/template.csv", { token })).status,
    };
    ok(`${edition} gate`, got, want[edition]);
  }
}

console.log("\n# balances are derived from transactions");
{
  const token = await seed("enhanced");
  const created = await req("POST", "/customers", { token, body: { name: "E2E Person", phone: "+256700999888", joined_on: "2026-11-01" } });
  const id = created.body.customer.id;

  const dep = await req("POST", "/transactions", { token, body: { customer_id: id, kind: "savings_deposit", amount: 250000, occurred_on: "2026-11-02", method: "cash" } });
  ok("deposit recorded", dep.status, 201);
  const tx1 = dep.body.transaction.id;
  await req("POST", "/transactions", { token, body: { customer_id: id, kind: "credit_issued", amount: 100000, occurred_on: "2026-11-03" } });
  await req("POST", "/transactions", { token, body: { customer_id: id, kind: "credit_repayment", amount: 40000, occurred_on: "2026-11-04" } });

  let b = (await req("GET", `/customers/${id}`, { token })).body.balances;
  ok("savings balance", b.savings, 250000);
  ok("credit outstanding", b.credit_outstanding, 60000);

  console.log("\n# void, correction and restore");
  await req("POST", `/transactions/${tx1}/void`, { token, body: { reason: "duplicate receipt" } });
  b = (await req("GET", `/customers/${id}`, { token })).body.balances;
  ok("savings after void", b.savings, 0);
  const corrections = (await req("GET", "/transactions/corrections", { token })).body.corrections;
  ok("correction logged", corrections.some((c: any) => c.transaction_id === tx1), true);
  ok("reason kept", corrections.find((c: any) => c.transaction_id === tx1).reason, "duplicate receipt");

  await req("POST", `/transactions/${tx1}/restore`, { token, body: { reason: "duplicate was ours" } });
  b = (await req("GET", `/customers/${id}`, { token })).body.balances;
  ok("savings after restore", b.savings, 250000);
}

console.log("\n# reference numbers are issued by the system");
{
  const token = await seed("enhanced");
  const id = (await req("GET", "/customers?limit=1", { token })).body.customers[0].id;

  // A reference typed by a caller must be ignored.
  const deposit = await req("POST", "/transactions", { token, body: { customer_id: id, kind: "savings_deposit", amount: 5000, occurred_on: "2026-11-02", method: "cash", reference: "HACKED-1" } });
  const tx = deposit.body.transaction;
  ok("reference is issued, not accepted", tx.reference.startsWith("HACKED"), false);
  ok("deposit reference prefix", tx.reference.startsWith("DEP-"), true);
  ok("reference agrees with the receipt", tx.reference.slice(4), String(tx.receipt_no).replace("R-", ""));

  const prefixes: Record<string, string> = { savings_withdrawal: "WDR", credit_issued: "CRD", credit_repayment: "RPY" };
  for (const [kind, prefix] of Object.entries(prefixes)) {
    const r = await req("POST", "/transactions", { token, body: { customer_id: id, kind, amount: 1000, occurred_on: "2026-11-02", method: "cash" } });
    ok(`${kind} reference prefix`, r.body.transaction.reference.startsWith(prefix + "-"), true);
  }

  // An amendment must not be able to rewrite the reference.
  const amended = await req("PATCH", `/transactions/${tx.id}`, { token, body: { reference: "CHANGED-9", note: "edited", reason: "correct the note" } });
  ok("amendment keeps the reference", amended.body.transaction.reference, tx.reference);
  ok("amendment still applies the note", amended.body.transaction.note, "edited");

  // Every seeded record already carries one, so the migration has nothing to do.
  const seeded = (await req("GET", "/transactions?limit=200", { token })).body.transactions;
  ok("seeded records all have a reference", seeded.every((t: any) => !!t.reference), true);
}

console.log("\n# input validation and access control");
{
  const token = await seed("enhanced");
  const id = (await req("GET", "/customers?limit=1", { token })).body.customers[0].id;
  ok("zero amount refused", (await req("POST", "/transactions", { token, body: { customer_id: id, kind: "savings_deposit", amount: 0, occurred_on: "2026-11-05" } })).status, 400);
  ok("negative amount refused", (await req("POST", "/transactions", { token, body: { customer_id: id, kind: "savings_deposit", amount: -5, occurred_on: "2026-11-05" } })).status, 400);
  ok("unknown type refused", (await req("POST", "/transactions", { token, body: { customer_id: id, kind: "loan_shark", amount: 10, occurred_on: "2026-11-05" } })).status, 400);
  ok("no token refused", (await req("GET", "/customers")).status, 401);
  ok("bad token refused", (await req("GET", "/customers", { token: "nope" })).status, 401);
  ok("bad password refused", (await req("POST", "/auth/login", { body: { login: "admin@enhanced.demo", password: "wrong" } })).status, 401);

  console.log("\n# staff accounts");
  await req("POST", "/admin/users", { token, body: { name: "E2E Clerk", email: "e2e.clerk@enhanced.demo", password: "Clerk#12345", role: "staff" } });
  const clerk = await req("POST", "/auth/login", { body: { login: "e2e.clerk@enhanced.demo", password: "Clerk#12345" } });
  ok("staff signs in", clerk.body.user.role, "staff");
  ok("staff blocked from backup", (await req("GET", "/admin/backup.json", { token: clerk.body.token })).status, 403);
  ok("staff blocked from accounts", (await req("GET", "/admin/users", { token: clerk.body.token })).status, 403);
}

console.log("\n# settings, backup and exports");
{
  const token = await seed("enhanced");
  await req("PUT", "/admin/settings", { token, body: { business_name: "E2E Savings Test", business_footer_note: "E2E footer" } });
  ok("settings saved", (await req("GET", "/auth/me", { token })).body.business.name, "E2E Savings Test");

  const csv = await req("GET", "/transactions/export", { token });
  ok("csv header", csv.text.split("\n")[0].slice(0, 5), "Recei");
  ok("csv is attachment", (csv.headers.get("content-disposition") ?? "").startsWith("attachment"), true);

  const backup = (await req("GET", "/admin/backup.json", { token })).body;
  ok("backup tables", ["users", "customers", "transactions", "transaction_corrections", "app_settings", "audit_logs"].every((k) => k in backup.tables), true);
  ok("backup audit rows", backup.counts.audit > 0, true);
}

console.log("\n# reports");
{
  const token = await seed("enhanced");
  const s = (await req("GET", "/reports/summary?from=2026-06-01&to=2026-11-08", { token })).body;
  ok("six months", s.months.length, 6);
  ok("month label is a name", /^[A-Z][a-z]+ \d{4}$/.test(s.months[0].label), true);
  ok("opening plus movement is closing", s.opening.savings + s.movement.savings, s.closing.savings);
  ok("credit: opening plus movement is closing", s.opening.credit_outstanding + s.movement.credit_outstanding, s.closing.credit_outstanding);
  const activity = (await req("GET", "/reports/activity?from=2026-06-01&to=2026-11-08", { token })).body;
  ok("activity rows", activity.rows.length > 0, true);
  ok("activity totals add up", activity.totals.transactions, activity.rows.reduce((a: number, r: any) => a + r.tx_count, 0));
  const outstanding = (await req("GET", "/reports/outstanding", { token })).body;
  ok("outstanding rows", outstanding.rows.length > 0, true);
  ok("outstanding is largest first", outstanding.rows.every((r: any, i: number, a: any[]) => i === 0 || a[i - 1].credit_outstanding >= r.credit_outstanding), true);
}

console.log("\n# customer email notifications");
{
  const token = await seed("classic");
  const created = (await req("POST", "/customers", { token, body: { name: "Notify Test", email: "notify@example.com" } })).body.customer;
  let out = (await req("GET", "/admin/notifications", { token })).body;
  ok("registration records a message", out.notifications.length, 1);
  ok("registration message goes to the customer", out.notifications[0].recipient, "notify@example.com");
  ok("registration message names the number", out.notifications[0].subject.includes(created.code), true);
  ok("no mail provider is configured locally", out.notifications[0].status, "skipped");
  ok("the message carries a branded html body", out.notifications[0].html.includes("<!doctype html>"), true);
  ok("the branded body is a receipt", out.notifications[0].html.includes("Keep this message as your receipt."), true);
  ok("the plain text fallback is a receipt too", out.notifications[0].body.includes("Keep this message as your receipt."), true);

  await req("POST", "/transactions", { token, body: { customer_id: created.id, kind: "savings_deposit", amount: 5000, occurred_on: "2026-11-02" } });
  out = (await req("GET", "/admin/notifications", { token })).body;
  ok("deposit records a receipt", out.notifications.length, 2);
  ok("receipt is the newest", out.notifications[0].kind, "transaction_recorded");
  ok("receipt names the amount", out.notifications[0].body.includes("UGX 5,000"), true);
  ok("receipt is addressed to the customer", out.notifications[0].recipient, "notify@example.com");
  ok("the window is open on Classic", out.status.open, true);
  ok("the window closes 30 days after handover", out.status.window_ends_on.slice(0, 4), out.status.handover_on.slice(0, 4));
  ok("Classic entitlement is 30 days", out.status.days, 30);

  // A customer with no email is simply not messaged.
  await req("POST", "/customers", { token, body: { name: "No Email" } });
  ok("customer without an email gets nothing", (await req("GET", "/admin/notifications", { token })).body.notifications.length, 2);

  // Basic has no email entitlement at all.
  const basic = await seed("basic");
  const bc = (await req("POST", "/customers", { token: basic, body: { name: "Basic Test", email: "basic@example.com" } })).body.customer;
  await req("POST", "/transactions", { token: basic, body: { customer_id: bc.id, kind: "savings_deposit", amount: 1000, occurred_on: "2026-11-02" } });
  const bout = (await req("GET", "/admin/notifications", { token: basic })).body;
  ok("Basic sends nothing", bout.notifications.length, 0);
  ok("Basic has no window", bout.status.window_ends_on, null);
  ok("Basic entitlement is zero days", bout.status.days, 0);

  // Moving the handover date into the past closes the window on Classic. Seeding
  // Basic replaced every account, so sign in to Classic again first.
  const ctoken = await seed("classic");
  const cc = (await req("POST", "/customers", { token: ctoken, body: { name: "Window Test", email: "window@example.com" } })).body.customer;
  await req("PUT", "/admin/settings", { token: ctoken, body: { handover_on: "2020-01-01" } });
  ok("an old handover closes the window", (await req("GET", "/admin/notifications", { token: ctoken })).body.status.open, false);
  await req("POST", "/transactions", { token: ctoken, body: { customer_id: cc.id, kind: "savings_deposit", amount: 1000, occurred_on: "2026-11-02" } });
  ok("nothing is recorded once closed", (await req("GET", "/admin/notifications", { token: ctoken })).body.notifications.length, 1);
}

console.log("\n# import (Enhanced)");
{
  const token = await seed("enhanced");
  const csv = [
    "Customer,Phone,Type,Amount,Date,Method,Reference,Note",
    "Imported One,+256700111222,Savings deposit,50000,2026-10-01,cash,DEP-90001,Opening",
    "Imported Two,+256700111333,Savings deposit,75000,2026-10-02,cash,DEP-90002,Opening",
  ].join("\n");
  const preview = await req("POST", "/import/preview", { token, body: { csv } });
  ok("preview parses both rows", preview.body.rows.length, 2);
  ok("preview writes nothing", (await req("GET", "/customers?q=Imported%20One", { token })).body.customers.length, 0);

  const commit = await req("POST", "/import/commit", { token, body: { csv } });
  ok("commit accepted both", commit.body.imported, 2);
  ok("commit created the customers", commit.body.created_customers, 2);
  ok("imported rows are on file", (await req("GET", "/customers?q=Imported%20One", { token })).body.customers.length, 1);
  const imported = (await req("GET", "/transactions?q=DEP-90001", { token })).body.transactions;
  ok("imported transaction is recorded", imported.length, 1);
  ok("import keeps the file's reference", imported[0]?.reference, "DEP-90001");
  ok("import still issues a receipt", /^R-\d+$/.test(String(imported[0]?.receipt_no)), true);

  // A row with no reference gets one from the system, so nothing is left blank.
  const noRef = await req("POST", "/import/commit", { token, body: { csv: ["Customer,Type,Amount,Date", "Imported Three,Savings deposit,1000,2026-10-03"].join("\n") } });
  ok("row without a reference still imports", noRef.body.imported, 1);
  const issued = (await req("GET", "/transactions?q=Imported%20Three", { token })).body.transactions;
  ok("missing reference is issued by the system", /^DEP-\d+$/.test(String(issued[0]?.reference)), true);
}

console.log("\n# statements");
{
  const token = await seed("enhanced");
  const id = (await req("GET", "/customers?limit=1", { token })).body.customers[0].id;
  const r = await req("GET", `/statements/${id}?from=2026-01-01&to=2026-11-08`, { token });
  ok("customer statement is a pdf", r.text.slice(0, 5), "%PDF-");
  ok("statement is an attachment", (r.headers.get("content-disposition") ?? "").includes(".pdf"), true);
  const business = await req("GET", "/statements/business.pdf?from=2026-01-01&to=2026-11-08", { token });
  ok("business statement is a pdf", business.text.slice(0, 5), "%PDF-");
  ok("business statement names the business", business.text.includes("Wakiso"), true);
}

console.log("\n# profile and password");
{
  // Seed once and keep both the token and the account, so the password here is
  // the one the server actually stored.
  const seeded = await req("POST", "/setup/demo", { body: { edition: "classic", reset: true } });
  const account = seeded.body.accounts.find((a: any) => a.role === "admin");
  const original = account.password;
  const token = (await req("POST", "/auth/login", { body: { login: account.login, password: original } })).body.token;

  const me = await req("GET", "/auth/profile", { token });
  ok("profile reads back the signed-in account", me.body.user.email, account.login);
  ok("profile never returns a password hash", "password_hash" in me.body.user, false);

  const named = await req("PATCH", "/auth/profile", { token, body: { name: "Renamed Admin", phone: "+256700999999" } });
  ok("name is saved", named.body.user.name, "Renamed Admin");

  // Email is the sign-in identity, so it needs the current password.
  const noPw = await req("PATCH", "/auth/profile", { token, body: { email: "moved@classic.demo" } });
  ok("email change without the password is refused", noPw.status, 400);
  const wrongPw = await req("PATCH", "/auth/profile", { token, body: { email: "moved@classic.demo", current_password: "nope" } });
  ok("email change with a wrong password is refused", wrongPw.status, 403);
  const moved = await req("PATCH", "/auth/profile", { token, body: { email: "moved@classic.demo", current_password: original } });
  ok("email change with the right password is accepted", moved.status, 200);
  ok("the new email signs in", (await req("POST", "/auth/login", { body: { login: "moved@classic.demo", password: original } })).status, 200);
  const dupe = await req("PATCH", "/auth/profile", { token, body: { email: account.login, current_password: original } });
  ok("changing back to the original email is accepted", dupe.status, 200);

  // Password change.
  const wrongCurrent = await req("POST", "/auth/password", { token, body: { current_password: "nope", new_password: "BrandNew#2026" } });
  ok("wrong current password is refused", wrongCurrent.status, 403);
  const tooShort = await req("POST", "/auth/password", { token, body: { current_password: original, new_password: "short" } });
  ok("a short new password is refused", tooShort.status, 400);
  const same = await req("POST", "/auth/password", { token, body: { current_password: original, new_password: original } });
  ok("reusing the same password is refused", same.status, 400);

  const changed = await req("POST", "/auth/password", { token, body: { current_password: original, new_password: "BrandNew#2026" } });
  ok("the password changes", changed.status, 200);
  ok("a fresh token is issued", typeof changed.body.token, "string");

  // The change signs out other devices but keeps the caller signed in.
  const oldToken = await req("GET", "/auth/me", { token });
  ok("the old token is now refused", oldToken.status, 401);
  const newToken = await req("GET", "/auth/me", { token: changed.body.token });
  ok("the freshly issued token still works", newToken.status, 200);
  ok("the new password signs in", (await req("POST", "/auth/login", { body: { login: account.login, password: "BrandNew#2026" } })).status, 200);
  ok("the old password no longer signs in", (await req("POST", "/auth/login", { body: { login: account.login, password: original } })).status, 401);
}

console.log("\n# admin resets another account's password");
{
  const token = await seed("classic");
  const staff = (await req("GET", "/admin/users", { token })).body.users.find((u: any) => u.role === "staff");
  const reset = await req("POST", `/admin/users/${staff.id}/reset-password`, { token });
  ok("reset returns a password once", typeof reset.body.password, "string");
  ok("reset targets the right account", reset.body.email, staff.email);
  ok("the issued password signs in", (await req("POST", "/auth/login", { body: { login: staff.email, password: reset.body.password } })).status, 200);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) Deno.exit(1);
