// Checks the offline demo in web/lib/demo.ts, which is what the hosted
// presentation serves when NEXT_PUBLIC_API_URL is empty. The same flows as
// tests/e2e.ts, driven in-process so the demo cannot drift from the API.
//
//   deno run -A tests/offline.ts
const store = new Map<string, string>();
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { handle } = await import("../web/lib/demo.ts");

let pass = 0;
let fail = 0;
const ok = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

// deno-lint-ignore no-explicit-any
const call = (method: string, path: string, body?: any, actor?: any) => handle(method, path, body, actor);
const signIn = (edition: string) => {
  const r = call("POST", "auth/login", { login: `admin@${edition}.demo`, password: edition[0].toUpperCase() + edition.slice(1) + "#1234" });
  return { token: r.body.token, actor: { id: r.body.user.id, name: r.body.user.name } };
};

console.log("\n# package terms");
{
  const { EDITION_META, EDITIONS, FEATURES, featureLabel, hasFeature, notifyDays, supportDays } = await import("../supabase/functions/_shared/domain/editions.ts");
  ok("basic has no support", supportDays("basic"), 0);
  ok("classic support is 30 days", supportDays("classic"), 30);
  ok("enhanced support is 60 days", supportDays("enhanced"), 60);
  const support = FEATURES.find((f) => f.key === "priority_support")!;
  ok("support starts at Classic", support.min, "classic");
  ok("classic label names 30 days", featureLabel(support, "classic"), "Priority bug-fix support for 30 days after handover");
  ok("enhanced label names 60 days", featureLabel(support, "enhanced"), "Priority bug-fix support for 60 days after handover");
  // Basic must not read the support line as included just because it starts at Classic.
  ok("basic does not list support", hasFeature(support, "basic"), false);
  ok("classic lists support", hasFeature(support, "classic"), true);
  ok("enhanced lists support", hasFeature(support, "enhanced"), true);

  // Customer email notifications are sold in months: Classic 1, Enhanced 2.
  const { notifyLabel } = await import("../supabase/functions/_shared/domain/editions.ts");
  const emails = FEATURES.find((f) => f.key === "customer_emails")!;
  ok("basic has no email window", notifyDays("basic"), 0);
  ok("classic email window is 30 days", notifyDays("classic"), 30);
  ok("enhanced email window is 60 days", notifyDays("enhanced"), 60);
  ok("classic reads as 1 month", notifyLabel("classic"), "1 month");
  ok("enhanced reads as 2 months", notifyLabel("enhanced"), "2 months");
  ok("emails start at Classic", emails.min, "classic");
  ok("classic email label names 1 month", featureLabel(emails, "classic"), "Automatic customer email notifications for 1 month after handover");
  ok("enhanced email label names 2 months", featureLabel(emails, "enhanced"), "Automatic customer email notifications for 2 months after handover");
  ok("basic does not list emails", hasFeature(emails, "basic"), false);
  ok("classic lists emails", hasFeature(emails, "classic"), true);

  // The licence the browser demo issues must carry the same term.
  call("POST", "setup/demo", { edition: "classic" });
  const { actor } = signIn("classic");
  ok("demo licence carries the term", call("GET", "auth/me", undefined, actor).body.capabilities.supportDays, 30);
  ok("price list carries the term", EDITION_META.classic.support_days, 30);
  ok("demo licence carries the email entitlement", call("GET", "auth/me", undefined, actor).body.capabilities.customerEmails, true);
  ok("price list carries the email window", EDITION_META.classic.notify_days, 30);

  // Running costs are quoted separately from the one-time build.
  const { maintenanceUgx, emailFeeUgx } = await import("../supabase/functions/_shared/domain/editions.ts");
  ok("basic maintenance is 100,000", maintenanceUgx("basic"), 100000);
  ok("classic maintenance is 150,000", maintenanceUgx("classic"), 150000);
  ok("enhanced maintenance is 200,000", maintenanceUgx("enhanced"), 200000);
  ok("basic has no email fee", emailFeeUgx("basic"), 0);
  ok("classic email fee is 50,000", emailFeeUgx("classic"), 50000);
  ok("enhanced email fee is 50,000", emailFeeUgx("enhanced"), 50000);
  // The email fee is compulsory wherever emails exist, and nowhere else.
  ok("the email fee follows the entitlement", EDITIONS.every((e) => (emailFeeUgx(e) > 0) === (notifyDays(e) > 0)), true);
}

console.log("\n# package gates");
{
  const want: Record<string, Record<string, number>> = {
    basic: { customerStatement: 200, businessStatement: 402, csv: 402, backup: 402, reports: 402, corrections: 402, import: 402 },
    classic: { customerStatement: 200, businessStatement: 402, csv: 200, backup: 200, reports: 402, corrections: 200, import: 402 },
    enhanced: { customerStatement: 200, businessStatement: 200, csv: 200, backup: 200, reports: 200, corrections: 200, import: 200 },
  };
  for (const edition of ["basic", "classic", "enhanced"]) {
    call("POST", "setup/demo", { edition });
    const { actor } = signIn(edition);
    const id = call("GET", "customers?limit=1", undefined, actor).body.customers[0].id;
    const got = {
      customerStatement: call("GET", `statements/${id}`, undefined, actor).status,
      businessStatement: call("GET", "statements/business.pdf", undefined, actor).status,
      csv: call("GET", "transactions/export", undefined, actor).status,
      backup: call("GET", "admin/backup.json", undefined, actor).status,
      reports: call("GET", "reports/summary", undefined, actor).status,
      corrections: call("GET", "transactions/corrections", undefined, actor).status,
      import: call("GET", "import/template.csv", undefined, actor).status,
    };
    ok(`${edition} gate`, got, want[edition]);
  }
}

console.log("\n# each package shows its own business and records");
{
  const seen = new Map<string, { name: string; customers: number }>();
  for (const edition of ["basic", "classic", "enhanced"]) {
    call("POST", "setup/demo", { edition });
    const { actor } = signIn(edition);
    const me = call("GET", "auth/me", undefined, actor).body;
    const d = call("GET", "dashboard", undefined, actor).body;
    seen.set(edition, { name: me.business.name, customers: d.totals.customers });
  }
  ok("three different businesses", new Set([...seen.values()].map((v) => v.name)).size, 3);
  ok("customer counts grow with the package", seen.get("basic")!.customers < seen.get("classic")!.customers && seen.get("classic")!.customers < seen.get("enhanced")!.customers, true);
}

console.log("\n# balances are derived from transactions");
{
  call("POST", "setup/demo", { edition: "enhanced" });
  const { actor } = signIn("enhanced");
  const id = call("POST", "customers", { name: "Offline Person", phone: "+256700999777", joined_on: "2026-11-01" }, actor).body.customer.id;
  const dep = call("POST", "transactions", { customer_id: id, kind: "savings_deposit", amount: 250000, occurred_on: "2026-11-02", method: "cash" }, actor);
  ok("deposit recorded", dep.status, 201);
  const tx1 = dep.body.transaction.id;
  call("POST", "transactions", { customer_id: id, kind: "credit_issued", amount: 100000, occurred_on: "2026-11-03" }, actor);
  call("POST", "transactions", { customer_id: id, kind: "credit_repayment", amount: 40000, occurred_on: "2026-11-04" }, actor);

  let b = call("GET", `customers/${id}`, undefined, actor).body.balances;
  ok("savings balance", b.savings, 250000);
  ok("credit outstanding", b.credit_outstanding, 60000);

  call("POST", `transactions/${tx1}/void`, { reason: "duplicate receipt" }, actor);
  b = call("GET", `customers/${id}`, undefined, actor).body.balances;
  ok("savings after void", b.savings, 0);
  const corrections = call("GET", "transactions/corrections", undefined, actor).body.corrections;
  ok("correction logged", corrections.some((c: any) => c.transaction_id === tx1), true);

  call("POST", `transactions/${tx1}/restore`, { reason: "duplicate was ours" }, actor);
  b = call("GET", `customers/${id}`, undefined, actor).body.balances;
  ok("savings after restore", b.savings, 250000);
}

console.log("\n# reference numbers are issued by the system");
{
  call("POST", "setup/demo", { edition: "enhanced" });
  const { actor } = signIn("enhanced");
  const id = call("GET", "customers?limit=1", undefined, actor).body.customers[0].id;
  const dep = call("POST", "transactions", { customer_id: id, kind: "savings_deposit", amount: 5000, occurred_on: "2026-11-02", method: "cash", reference: "HACKED-1" }, actor);
  const tx = dep.body.transaction;
  ok("reference is issued, not accepted", tx.reference.startsWith("HACKED"), false);
  ok("deposit reference prefix", tx.reference.startsWith("DEP-"), true);
  ok("reference agrees with the receipt", tx.reference.slice(4), String(tx.receipt_no).replace("R-", ""));
  for (const [kind, prefix] of Object.entries({ savings_withdrawal: "WDR", credit_issued: "CRD", credit_repayment: "RPY" })) {
    const r = call("POST", "transactions", { customer_id: id, kind, amount: 1000, occurred_on: "2026-11-02", method: "cash" }, actor);
    ok(`${kind} reference prefix`, r.body.transaction.reference.startsWith(prefix + "-"), true);
  }
  const seeded = call("GET", "transactions?limit=200", undefined, actor).body.transactions;
  ok("seeded records all have a reference", seeded.every((t: any) => !!t.reference), true);
}

console.log("\n# customer email notifications");
{
  call("POST", "setup/demo", { edition: "classic" });
  const { actor } = signIn("classic");

  // Registering a customer emails them their number.
  const created = call("POST", "customers", { name: "Notify Test", email: "notify@example.com" }, actor).body.customer;
  let out = call("GET", "admin/notifications", undefined, actor).body;
  ok("registration queues one message", out.notifications.length, 1);
  ok("registration message goes to the customer", out.notifications[0].recipient, "notify@example.com");
  ok("registration message names the number", out.notifications[0].subject.includes(created.code), true);

  // Recording a transaction emails the customer a receipt. Use the customer that
  // has an email; the seeded ones may not, and no address means no message.
  call("POST", "transactions", { customer_id: created.id, kind: "savings_deposit", amount: 5000, occurred_on: "2026-11-02" }, actor);
  out = call("GET", "admin/notifications", undefined, actor).body;
  ok("deposit queues a receipt", out.notifications.length, 2);
  ok("receipt is the newest", out.notifications[0].kind, "transaction_recorded");
  ok("receipt names the amount", out.notifications[0].body.includes("UGX 5,000"), true);
  // The message carries a branded HTML body and a plain-text fallback, and both
  // say the same thing.
  ok("the message is branded html", out.notifications[0].html.includes("<!doctype html>"), true);
  // The business name contains "&", which is escaped in html - as it must be.
  ok("the html names the business", out.notifications[0].html.includes("Kampala Community Savings &amp; Credit"), true);
  ok("the html shows the amount", out.notifications[0].html.includes("UGX 5,000"), true);
  ok("the html is a receipt", out.notifications[0].html.includes("Keep this message as your receipt."), true);
  ok("the plain text is a receipt too", out.notifications[0].body.includes("Keep this message as your receipt."), true);
  ok("the window is open on Classic", out.status.open, true);
  ok("the window closes 30 days after handover", out.status.window_ends_on.slice(0, 4), out.status.handover_on.slice(0, 4));

  // A name is user input. Markup in it must be escaped in the html body.
  const { customerWelcome } = await import("../supabase/functions/_shared/domain/notify.ts");
  const { esc } = await import("../supabase/functions/_shared/domain/emailHtml.ts");
  ok("esc escapes a tag", esc("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  ok("esc escapes an ampersand", esc("Kaggwa & Sons"), "Kaggwa &amp; Sons");
  const hostile = call("POST", "customers", { name: "<b>Bold</b> & Co", email: "hostile@example.com" }, actor).body.customer;
  const hostileMsg = call("GET", "admin/notifications", undefined, actor).body.notifications[0];
  ok("a hostile name is escaped in html", hostileMsg.html.includes("&lt;b&gt;Bold&lt;/b&gt; &amp; Co"), true);
  ok("a hostile name is not raw html", hostileMsg.html.includes("<b>Bold</b>"), false);
  ok("the plain text keeps the name as written", hostileMsg.body.includes("<b>Bold</b> & Co"), true);
  void hostile; void customerWelcome;

  // A customer with no email is simply not messaged.
  call("POST", "customers", { name: "No Email" }, actor);
  ok("customer without an email gets nothing", call("GET", "admin/notifications", undefined, actor).body.notifications.length, 3);

  // Moving the handover date forward closes the window.
  call("PUT", "admin/settings", { handover_on: "2020-01-01" }, actor);
  ok("an old handover closes the window", call("GET", "admin/notifications", undefined, actor).body.status.open, false);
  call("POST", "transactions", { customer_id: created.id, kind: "savings_deposit", amount: 1000, occurred_on: "2026-11-02" }, actor);
  ok("nothing is sent once closed", call("GET", "admin/notifications", undefined, actor).body.notifications.length, 3);
}

console.log("\n# import keeps the file's reference");
{
  call("POST", "setup/demo", { edition: "enhanced" });
  const { actor } = signIn("enhanced");
  const csv = ["Customer,Type,Amount,Date,Reference", "Imported One,Savings deposit,50000,2026-10-01,DEP-90001"].join("\n");
  const commit = call("POST", "import/commit", { csv }, actor);
  ok("row imports", commit.body.imported, 1);
  const imported = call("GET", "transactions?q=DEP-90001", undefined, actor).body.transactions;
  ok("import keeps the file's reference", imported[0]?.reference, "DEP-90001");
  const noRef = call("POST", "import/commit", { csv: ["Customer,Type,Amount,Date", "Imported Two,Savings deposit,1000,2026-10-03"].join("\n") }, actor);
  ok("row without a reference still imports", noRef.body.imported, 1);
  const issued = call("GET", "transactions?q=Imported%20Two", undefined, actor).body.transactions;
  ok("missing reference is issued by the system", /^DEP-\d+$/.test(String(issued[0]?.reference)), true);
}

console.log("\n# statements render the package's own business");
{
  call("POST", "setup/demo", { edition: "enhanced" });
  const { actor } = signIn("enhanced");
  const id = call("GET", "customers?limit=1", undefined, actor).body.customers[0].id;
  const r = call("GET", `statements/${id}?from=2026-01-01&to=2026-11-08`, undefined, actor);
  ok("customer statement is a pdf", r.blob?.type, "application/pdf");
  ok("statement filename ends in .pdf", (r.filename ?? "").endsWith(".pdf"), true);
  const business = call("GET", "statements/business.pdf?from=2026-01-01&to=2026-11-08", undefined, actor);
  ok("business statement is a pdf", business.blob?.type, "application/pdf");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) Deno.exit(1);
