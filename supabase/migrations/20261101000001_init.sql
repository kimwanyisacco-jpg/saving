-- Credit & Savings Records Management System: core schema.
-- All application tables live in "public" and are locked down: RLS is ON with no
-- policies and anon/authenticated have no grants. Only the Edge Function (service
-- connection) reads and writes them, after enforcing the application's own checks.

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ staff
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  role          text not null check (role in ('admin','staff')),
  name          text not null,
  email         text unique,
  phone         text,
  password_hash text not null,
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

-- -------------------------------------------------------------- settings
-- Single place for the licensed edition and the business profile printed on
-- statements. One row per key; `value` is plain text (no secrets are stored here).
create table if not exists app_settings (
  key        text primary key,
  value      text,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------- customers
create sequence if not exists customer_code_seq start 1;

create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique default 'C-' || lpad(nextval('customer_code_seq')::text, 4, '0'),
  name        text not null,
  phone       text,
  email       text,
  national_id text,
  address     text,
  joined_on   date not null default current_date,
  status      text not null default 'active' check (status in ('active','dormant','closed')),
  notes       text,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists customers_name_idx on customers (lower(name));
create index if not exists customers_phone_idx on customers (phone);
create index if not exists customers_status_idx on customers (status);

-- ---------------------------------------------------------- transactions
create sequence if not exists receipt_seq start 100001;

create table if not exists transactions (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  kind        text not null check (kind in ('savings_deposit','savings_withdrawal','credit_issued','credit_repayment')),
  amount      bigint not null check (amount > 0),
  occurred_on date not null default current_date,
  method      text not null default 'cash' check (method in ('cash','bank','mobile_money','cheque','other')),
  reference   text,
  note        text,
  receipt_no  text unique,
  recorded_by uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  voided_at   timestamptz,
  void_reason text
);
create index if not exists transactions_customer_idx on transactions (customer_id, occurred_on desc);
create index if not exists transactions_date_idx on transactions (occurred_on desc);
create index if not exists transactions_kind_idx on transactions (kind);
create index if not exists transactions_live_idx on transactions (occurred_on desc) where voided_at is null;

-- ------------------------------------------------- corrections & audit
-- Every void / restore / amend is recorded with the before and after image so the
-- operator can explain any change to a balance. Classic and Enhanced include this.
create table if not exists transaction_corrections (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  action         text not null check (action in ('void','restore','amend')),
  before         jsonb not null default '{}'::jsonb,
  after          jsonb not null default '{}'::jsonb,
  reason         text,
  actor_id       uuid references users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists corrections_tx_idx on transaction_corrections (transaction_id, created_at desc);

create table if not exists audit_logs (
  id          bigserial primary key,
  actor_id    uuid references users(id) on delete set null,
  action      text not null,
  object_type text,
  object_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);
