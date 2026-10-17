-- SpendWise database schema for Supabase.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.

-- ============================================================
-- Transactions: one row per money movement, with real columns
-- so you can query / chart / export them directly.
-- ============================================================
create table if not exists public.transactions (
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id            text        not null,
  date          date        not null,
  amount        numeric(14, 2) not null default 0 check (amount >= 0),
  type          text        not null default 'expense' check (type in ('expense', 'income', 'investment', 'saving')),
  category      text,
  payee         text,
  workspace     text        not null default 'personal' check (workspace in ('personal', 'work')),
  method        text,
  note          text,
  tags          text[]      not null default '{}',
  reimbursable  boolean     not null default false,
  reimbursed    boolean     not null default false,
  goal_id       text,
  link_id       text,                                 -- subscription / EMI this payment belongs to
  doc_ids       text[]      not null default '{}',
  source        text,
  created_ms    bigint,
  deleted       boolean     not null default false,   -- soft delete so other devices learn about it
  updated_at    timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists transactions_user_updated_idx on public.transactions (user_id, updated_at);
create index if not exists transactions_user_date_idx    on public.transactions (user_id, date);

-- ============================================================
-- Everything else (budgets, goals, accounts, rules, documents,
-- categories, settings) as JSON documents keyed by kind + id.
-- ============================================================
create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null constraint records_kind_check
             check (kind in ('budgets', 'goals', 'assets', 'rules', 'docs', 'categories', 'settings', 'subscriptions', 'emis')),
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);
create index if not exists records_user_updated_idx on public.records (user_id, updated_at);

-- updated_at is always the server's clock, so devices with wrong clocks can't confuse sync
create or replace function public.spendwise_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before insert or update on public.transactions
  for each row execute function public.spendwise_touch();

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.spendwise_touch();

-- ============================================================
-- Row Level Security: every user can only ever see their own rows.
-- ============================================================
alter table public.transactions enable row level security;
alter table public.records      enable row level security;

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Handy read-only view of live (not deleted) transactions for reports / exports.
create or replace view public.transactions_live
  with (security_invoker = true) as
  select id, date, type, amount, payee, category, workspace, method, note, tags, reimbursable, reimbursed, updated_at, link_id
  from public.transactions
  where not deleted;

-- ============================================================
-- Storage: private bucket for receipts, bills and statements.
-- Files live at documents/<user id>/<document id>.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 15728640)   -- 15 MB per file
on conflict (id) do nothing;

drop policy if exists "own documents read"   on storage.objects;
drop policy if exists "own documents write"  on storage.objects;
drop policy if exists "own documents update" on storage.objects;
drop policy if exists "own documents delete" on storage.objects;

create policy "own documents read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own documents write" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own documents update" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own documents delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
