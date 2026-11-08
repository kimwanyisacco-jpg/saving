# Credit & Savings Records Management System

A records system for a Ugandan SACCO / microfinance business. It keeps customer
records, records savings and credit activity, and prints statements of account.

Built to the GSS quotation of 1 November 2026, which sells three packages:

| Package | Price (UGX) | Scope |
| --- | --- | --- |
| Basic | 900,000 | Admin login, customers, savings and credit entries, basic statement PDF, dashboard totals |
| Classic | 1,500,000 | Adds customer profiles, separate savings/credit balances, statement by date range, CSV export, backup and correction history, **30 days priority bug-fix support** |
| Enhanced | 2,300,000 | Adds date-filtered reports, activity and outstanding-credit reports, spreadsheet import, better search, **60 days priority bug-fix support** |

Prices, delivery times and the support term live in
`supabase/functions/_shared/domain/editions.ts`, so the pricing page and the
licence check always agree.

## Customer email notifications

Classic and Enhanced tell the customer directly: registering a customer emails
them their customer number, and recording a transaction emails them a receipt.
Basic has no email entitlement, and a customer with no email address is simply
not messaged. The window is counted from handover - Classic 1 month (30 days),
Enhanced 2 months (60 days) - and lives as `notify_days` on the edition beside
`support_days`.

Each message carries a branded HTML body and a plain-text fallback. The HTML is
built by `_shared/domain/emailHtml.ts` and mirrors the printed statement header -
the business's own name, contact details and logo initials on the brand green -
so an email and a statement look like they came from the same office. It uses
table layout and inline styles only, which is what mail clients render reliably.
Every value that comes from a user (names, notes) is escaped before it reaches
the markup.

Sending goes through [Resend](https://resend.com). Set `RESEND_API_KEY` and
`MAIL_FROM` on the Edge Function; with no key the message is still written to the
outbox as `skipped`, so the presentation shows what would have gone out. Every
message is stored in `notification_outbox` with its outcome, and Admin shows the
handover date and the messages sent. A send that fails is recorded, never
thrown: a mail problem must not undo the recording of money.

## Support after handover

Each package carries a priority bug-fix window, counted from handover: Classic
30 days, Enhanced 60 days, Basic none. The term is a property of the package
(`support_days`), not a fixed bullet, because the two differ. It is served on the
licence (`GET /auth/me`, `GET /settings/public`), on the price list
(`GET /editions`) and on the Admin package screen, so the client sees the same
number everywhere. A fix inside the window is a correction to what was sold; new
features are out of scope and must be agreed in writing.

## What is in the box

- `supabase/functions/api/index.ts` - the one API function (Hono on Deno), which
  mounts the route modules in `supabase/functions/_shared/routes/`.
- `supabase/functions/_shared/domain/` - the calculations every screen shares:
  balances, reports, CSV, and the PDF statement renderer.
- `supabase/migrations/` - the Postgres schema, applied in filename order.
- `web/` - the Next.js app. It is a static export, so it hosts anywhere.
- `scripts/reset_local_db.sh` - drops and recreates the local database.

## Receipt numbers and references

Every transaction gets two identifiers from the system, so an operator never
types one:

- a receipt number, `R-100496`, drawn from the `receipt_seq` sequence; and
- a reference, `DEP-100496`, which puts the kind of movement (`DEP`, `WDR`,
  `CRD`, `RPY`) in front of the same sequence number.

Both come from one sequence, so a reference and its receipt always agree, and the
reference says at a glance what the money did. The rule lives in
`domain/refs.ts`, and the server, the offline demo and the seeded dataset all
use it.

A reference typed on the transaction form is ignored, and an amendment cannot
change one. The one exception is a spreadsheet import: a file may carry an old
book reference, and that value is kept so the record can be reconciled against
the old book. A row with no reference is given one by the system.

## Package control

The licensed package is one row in `app_settings` and is read on every request.
`hasCap()` in `domain/editions.ts` is the single gate; a Basic deployment cannot
serve a Classic report even if the caller asks for it. The web app mirrors the
same table to hide or grey out screens, but the server is the authority.

Change the package in Admin under **Package and business profile**. Changing the
package only changes what is served - records are never deleted.

## Run it locally

```bash
# 1. Postgres (pgvector image is fine), then apply migrations in order
for f in supabase/migrations/*.sql; do
  psql -h localhost -U postgres -d credit_savings -f "$f"
done

# 2. API
DATABASE_URL=postgres://postgres:postgres@localhost:5432/credit_savings \
  APP_JWT_SECRET=dev-secret-0123456789 MESSAGE_ENC_KEY=dev-enc-key-0123456789 \
  deno run -A supabase/functions/api/index.ts

# 3. Seed the demo business, then start the web app
curl -X POST http://localhost:8000/api/v1/setup/demo
cd web && npm install && npm run dev
```

`MESSAGE_ENC_KEY` encrypts customer contact details at rest. Set a real value in
production and keep it safe: without it, encrypted columns cannot be read.

## Hosting the front end

`web/` is a static export, so it needs no server of its own.

```bash
cd web && npm install && npm run build   # writes web/out
```

- **Vercel**: import the repository and leave the **Root Directory** as the repo
  root. `vercel.json` at the root installs `web/`, builds the static export and
  publishes `web/out`.
- **Any static host**: upload `web/out`.

Set `NEXT_PUBLIC_API_URL` to your deployed API (`https://<project-ref>.supabase.co/functions/v1`)
as a Vercel environment variable. Leave it empty and the app runs the built-in
offline demo instead, which needs no backend at all.

## Demo mode for presentations

The demo dataset is generated by `_shared/domain/demo.ts`, so the hosted demo and
the live product show the same figures. Sign in from the buttons on the login
page:

| Package | Role | Email | Password | Business |
| --- | --- | --- | --- | --- |
| Basic | admin | `admin@basic.demo` | `Basic#1234` | Nakawa Traders Savings Group |
| Classic | admin | `admin@classic.demo` | `Classic#1234` | Kampala Community Savings & Credit |
| Classic | staff | `staff@classic.demo` | `Classic#5678` | Kampala Community Savings & Credit |
| Enhanced | admin | `admin@enhanced.demo` | `Enhanced#1234` | Wakiso Enterprise Savings & Credit Ltd |
| Enhanced | staff | `staff@enhanced.demo` | `Enhanced#5678` | Wakiso Enterprise Savings & Credit Ltd |

Each package has its own business name, customer list and transaction history, so
switching packages shows a real difference rather than the same screen with a
label changed. Admin has a **Demo data** panel that rebuilds any package's
dataset on demand.

In the offline demo, changes are saved in the browser (`localStorage`), so a
presentation can add customers and transactions freely and reset from Admin.

## Tests

```bash
cd web && npm run typecheck
deno check supabase/functions/api/index.ts

# the offline demo the hosted presentation serves (no backend needed)
deno run -A --sloppy-imports tests/offline.ts

# the API against a running Postgres and Edge Function; it reseeds each package
API_URL=http://localhost:8000 deno run -A tests/e2e.ts
```

`tests/e2e.ts` covers the package gates, balances derived from transactions, the
void/correction/restore trail, input validation and access control, staff
accounts, settings, backup, CSV export, reports and spreadsheet import.

`tests/offline.ts` runs the same flows through `web/lib/demo.ts` in-process, so
the browser demo cannot drift from the API.

## Security notes

- Customer email, phone and national ID are encrypted at rest with
  `MESSAGE_ENC_KEY`; passwords are hashed, never stored in clear.
- RLS is on with no policies, and `anon`/`authenticated` hold no grants on the
  application tables. Only the API function reaches the database.
- Every void, restore, settings change and account change is written to
  `audit_logs`, and transaction changes are written to `transaction_corrections`.
- Balances are always calculated from recorded transactions. Nothing is stored
  as a running total, so a corrected entry always produces the right balance.
