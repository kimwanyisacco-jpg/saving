-- Lock every table down. The API connects as the service role and enforces access
-- itself; the anon/authenticated roles (used by the public anon key) get nothing.
-- Guarded so the migration also applies to a plain local Postgres without those roles.
do $$
declare t text; r text;
begin
  foreach t in array array['users','app_settings','customers','transactions','transaction_corrections','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    foreach r in array array['anon','authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on public.%I from %I', t, r);
      end if;
    end loop;
  end loop;
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all sequences in schema public from %I', r);
    end if;
  end loop;
end $$;
