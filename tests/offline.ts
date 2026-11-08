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
