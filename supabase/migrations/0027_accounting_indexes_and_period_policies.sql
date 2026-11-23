-- Add covering indexes for standalone accounting foreign keys and avoid overlapping SELECT policies.
create index if not exists acct_accounts_parent_id_idx
  on public.acct_accounts(parent_id);
create index if not exists acct_fiscal_periods_created_by_idx
  on public.acct_fiscal_periods(created_by);
create index if not exists acct_fiscal_periods_closed_by_idx
  on public.acct_fiscal_periods(closed_by);
create index if not exists acct_journal_entries_created_by_idx
  on public.acct_journal_entries(created_by);
create index if not exists acct_journal_entries_posted_by_idx
  on public.acct_journal_entries(posted_by);

drop policy if exists "Accounting admins manage fiscal periods" on public.acct_fiscal_periods;

drop policy if exists "Accounting admins insert fiscal periods" on public.acct_fiscal_periods;
create policy "Accounting admins insert fiscal periods"
on public.acct_fiscal_periods for insert to authenticated
with check ((select public.current_employee_role())='Admin');

drop policy if exists "Accounting admins update fiscal periods" on public.acct_fiscal_periods;
create policy "Accounting admins update fiscal periods"
on public.acct_fiscal_periods for update to authenticated
using ((select public.current_employee_role())='Admin')
with check ((select public.current_employee_role())='Admin');
