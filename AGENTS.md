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
- Each package carries a priority bug-fix window from handover: Classic 30
  days, Enhanced 60, Basic none. It lives as `support_days` on the edition, not
  as a fixed feature bullet, because the term differs by package. Change it in
  `editions.ts` only; the pricing page, Admin screen and licence all read it.
- Two running costs are quoted on the pricing pages, both on the edition:
  `maintenance_ugx` (monthly, optional, 100k/150k/200k) and `email_fee_ugx`
  (monthly, compulsory, 50k on Classic and Enhanced, none on Basic). The email
  fee is separate from maintenance and must follow the email entitlement, so
  `email_fee_ugx > 0` exactly when `notify_days > 0`.
- Customer email notifications are a package entitlement, sold in months:
  Classic 1, Enhanced 2, Basic none. `notify_days` on the edition is the single
  source of truth (30/60), and the window is counted from the `handover_on`
  setting, not from the transaction date.
- A customer message carries two bodies: branded HTML from
  `_shared/domain/emailHtml.ts`, and a plain-text fallback that reads well on its
  own. The HTML mirrors the statement header and uses table layout with inline
  styles only - no `<style>` block, because mail clients strip it. Escape every
  user-supplied value through `esc()` before it reaches the markup.
- Every message to a customer is built by `_shared/domain/notify.ts` (pure) and
  written to `notification_outbox` by `_shared/notifications.ts` before sending
  through Resend (`_shared/mail.ts`). A failed send is recorded, never thrown -
  it must not undo the recording of money.
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
