-- Customer email notifications.
--
-- Each message the system builds for a customer is written here before it is
-- sent, and its outcome recorded. The outbox is the record of what the customer
-- was told, so an operator can answer "did they get the receipt?" without asking
-- the mail provider. A send that fails never blocks the recording of money.
create table if not exists notification_outbox (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('customer_registered','transaction_recorded')),
  customer_id    uuid references customers(id) on delete set null,
  transaction_id uuid references transactions(id) on delete set null,
  recipient      text not null,
  subject        text not null,
  body           text not null,
  html           text,
  provider       text not null default 'none',
  status         text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  error          text,
  attempts       int not null default 0,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz
);
-- Older installs of this migration predate the branded body; add it if missing.
alter table notification_outbox add column if not exists html text;

create index if not exists notification_outbox_created_idx on notification_outbox (created_at desc);
create index if not exists notification_outbox_customer_idx on notification_outbox (customer_id, created_at desc);
create index if not exists notification_outbox_pending_idx on notification_outbox (created_at) where status in ('queued','failed');

-- The handover date starts the package's notification window. It is a plain
-- setting so an operator can set or move it from Admin; null means not handed
-- over yet, and nothing is sent until it is set.
insert into app_settings (key, value) values ('handover_on', null)
on conflict (key) do nothing;
