-- Adds subscriptions & EMIs sync support. Safe to run more than once.

-- which subscription / EMI a payment belongs to
alter table public.transactions add column if not exists link_id text;

-- allow the two new record kinds
alter table public.records drop constraint if exists records_kind_check;
alter table public.records add constraint records_kind_check
  check (kind in ('budgets', 'goals', 'assets', 'rules', 'docs', 'categories', 'settings', 'subscriptions', 'emis'));

-- expose link_id in the reporting view (new columns must go at the end)
create or replace view public.transactions_live
  with (security_invoker = true) as
  select id, date, type, amount, payee, category, workspace, method, note, tags, reimbursable, reimbursed, updated_at, link_id
  from public.transactions
  where not deleted;
