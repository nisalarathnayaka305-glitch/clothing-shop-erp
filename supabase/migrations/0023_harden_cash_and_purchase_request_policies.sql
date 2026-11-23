-- Harden cash-session ownership checks and allow cleanup of failed draft requests.
-- This migration does not change or delete existing operational records.

begin;

drop policy if exists "Cashiers close own cash sessions" on public.cash_sessions;
create policy "Cashiers close own cash sessions"
on public.cash_sessions
for update
to authenticated
using (
  status = 'Open'
  and (
    cashier_id = (select auth.uid())
    or (select public.current_employee_role()) in ('Admin','Manager')
  )
)
with check (
  status = 'Closed'
  and (
    cashier_id = (select auth.uid())
    or (select public.current_employee_role()) in ('Admin','Manager')
  )
);

drop policy if exists "Managers delete draft purchase requests" on public.purchase_requests;
create policy "Managers delete draft purchase requests"
on public.purchase_requests
for delete
to authenticated
using (
  status = 'Draft'
  and (select public.current_employee_role()) in ('Admin','Manager')
);

commit;
