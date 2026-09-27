-- Run once in the Supabase SQL editor for your project.
-- No anonymous access. Every operation is scoped to the authenticated owner.
create table if not exists public.tradecraft_journal (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  record jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint journal_record_object check (jsonb_typeof(record) = 'object'),
  constraint journal_record_id check (record->>'id' = id::text),
  constraint journal_record_size check (octet_length(record::text) <= 32768),
  constraint journal_status check (record->>'status' in ('planned', 'open', 'closed'))
);

alter table public.tradecraft_journal enable row level security;
revoke all on public.tradecraft_journal from anon;
grant select, insert, update, delete on public.tradecraft_journal to authenticated;

drop policy if exists journal_owner_select on public.tradecraft_journal;
create policy journal_owner_select on public.tradecraft_journal for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists journal_owner_insert on public.tradecraft_journal;
create policy journal_owner_insert on public.tradecraft_journal for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists journal_owner_update on public.tradecraft_journal;
create policy journal_owner_update on public.tradecraft_journal for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists journal_owner_delete on public.tradecraft_journal;
create policy journal_owner_delete on public.tradecraft_journal for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.tradecraft_journal_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists tradecraft_journal_revision on public.tradecraft_journal;
create trigger tradecraft_journal_revision before update on public.tradecraft_journal
  for each row execute function public.tradecraft_journal_revision();

create index if not exists journal_owner_created on public.tradecraft_journal (user_id, created_at desc, id);
