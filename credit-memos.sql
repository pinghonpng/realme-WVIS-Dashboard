begin;
-- Permission is off for all viewers until an existing administrator approves it.
-- Existing service-role-only table access and RLS remain unchanged.
alter table public.wvis_accounts add column if not exists credit_memos boolean not null default false;
notify pgrst, 'reload schema';
commit;
