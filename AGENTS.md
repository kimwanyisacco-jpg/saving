# Repository notes for agents

Credit & Savings Records Management System — admin web app for a Ugandan
SACCO/microfinance client, built from GSS quotation 71. Three sold packages:
Basic, Classic, Enhanced.

## Layout
- `supabase/functions/api/index.ts` — the one Edge Function (Hono on Deno).
- `supabase/functions/_shared/routes/` — one module per area (customers,
  transactions, reports, statements, import, admin, auth, dashboard).
- `supabase/functions/_shared/domain/` — the pure logic the whole product
  shares: `editions.ts` (packages and capability gates), `compute.ts`
  (balances, reports), `statement.ts` (PDF), `money.ts`, `dates.ts`,
  `demo.ts` (demo dataset), `types.ts`.
- `supabase/migrations/` — schema, applied in filename order.
- `web/` — Next.js static export. `web/lib/demo.ts` is the offline backend used
  by the hosted presentation; `web/lib/api.ts` routes to it when
  `NEXT_PUBLIC_API_URL` is empty.
- `tests/` — `e2e.ts` (API) and `offline.ts` (demo).
- `scripts/` — local helpers.

## Build / test
```bash
# Postgres, then migrations in order
for f in supabase/migrations/*.sql; do psql -h localhost -U postgres -d credit_savings -f "$f"; done

# API
DATABASE_URL=postgres://postgres:postgres@localhost:5432/credit_savings \
  APP_JWT_SECRET=dev-secret-0123456789 MESSAGE_ENC_KEY=dev-enc-key-0123456789 \
  DEMO_MODE=true deno run -A supabase/functions/api/index.ts

cd web && npm run build          # static export to web/out
deno check supabase/functions/api/index.ts

deno run -A --sloppy-imports tests/offline.ts        # no backend needed
API_URL=http://localhost:8000 deno run -A tests/e2e.ts
```

## Conventions
- The server, the tests and the browser demo must run the **same** logic. Put
  shared maths in `_shared/domain/` and import it from `web/lib/` — do not
  reimplement a balance or a report in a page.
- Package capability gating lives in `editions.ts` (`CAPS` / `hasCap`). Every
  gate must exist on **both** sides: the route guards with `guard(cap)` and the
  demo backend checks `hasCap(edition, CAPS[...])` in `web/lib/demo.ts`. A
  feature is gated by what it is called, not by who calls it.
- Every seeded package has its own business, customers and transactions, so
  switching package visibly changes the data. `POST /setup/demo` is a full
  reset.
- Balances are always derived from live (non-voided) transactions. Never store
  a running balance.
- Receipt numbers and references are issued by the system (`domain/refs.ts`): a
  reference is the kind prefix plus the receipt sequence, so the two agree. A
  form must never send a reference; only a spreadsheet import may carry one, so
  an old book reference survives.
- Deno needs `--sloppy-imports` to load `web/lib/demo.ts`, because the web app
  imports the shared modules without a `.ts` extension.
- `tests/e2e.ts` reseeds each package before checking it, so it is repeatable
  against a used database. It needs the API running.
- Commit messages and comments follow the same plain style as the product: say
  what changed and why, no restating the code.
