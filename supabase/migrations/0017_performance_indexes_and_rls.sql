-- Add indexes for foreign keys used by common joins and deletes.
create index if not exists customer_payments_created_by_idx on public.customer_payments(created_by);
create index if not exists employee_attendance_created_by_idx on public.employee_attendance(created_by);
create index if not exists expenses_created_by_idx on public.expenses(created_by);
create index if not exists payroll_runs_created_by_idx on public.payroll_runs(created_by);
create index if not exists purchase_items_purchase_id_idx on public.purchase_items(purchase_id);
create index if not exists purchase_items_variant_id_idx on public.purchase_items(variant_id);
create index if not exists purchase_orders_received_by_idx on public.purchase_orders(received_by);
create index if not exists sale_items_sale_id_idx on public.sale_items(sale_id);
create index if not exists sale_items_variant_id_idx on public.sale_items(variant_id);
create index if not exists sales_cashier_id_idx on public.sales(cashier_id);
create index if not exists sales_return_items_return_id_idx on public.sales_return_items(return_id);
create index if not exists sales_return_items_sale_item_id_idx on public.sales_return_items(sale_item_id);
create index if not exists sales_return_items_variant_id_idx on public.sales_return_items(variant_id);
create index if not exists sales_returns_created_by_idx on public.sales_returns(created_by);
create index if not exists stock_movements_created_by_idx on public.stock_movements(created_by);
create index if not exists stock_movements_variant_id_idx on public.stock_movements(variant_id);
create index if not exists supplier_payments_created_by_idx on public.supplier_payments(created_by);
create index if not exists supplier_payments_expense_id_idx on public.supplier_payments(expense_id);

-- Avoid per-row re-evaluation of auth/role lookups in frequently used RLS policies.
drop policy if exists "Employees can read permitted directory records" on public.employees;
create policy "Employees can read permitted directory records"
on public.employees for select to authenticated
using (
  (select public.current_employee_role()) in ('Admin','Manager')
  or auth_user_id = (select auth.uid())
);

drop policy if exists "Admins can insert employees" on public.employees;
create policy "Admins can insert employees"
on public.employees for insert to authenticated
with check ((select public.current_employee_role()) = 'Admin');

drop policy if exists "Admins can update employees" on public.employees;
create policy "Admins can update employees"
on public.employees for update to authenticated
using ((select public.current_employee_role()) = 'Admin')
with check ((select public.current_employee_role()) = 'Admin');

drop policy if exists "Admins can delete employees" on public.employees;
create policy "Admins can delete employees"
on public.employees for delete to authenticated
using ((select public.current_employee_role()) = 'Admin');

drop policy if exists "Employees can read own attendance" on public.employee_attendance;
create policy "Employees can read own attendance"
on public.employee_attendance for select to authenticated
using (
  (select public.current_employee_role()) in ('Admin','Manager')
  or exists (
    select 1 from public.employees e
    where e.id = employee_id
      and e.auth_user_id = (select auth.uid())
      and e.status = 'Active'
  )
);

drop policy if exists "Managers can insert attendance" on public.employee_attendance;
create policy "Managers can insert attendance"
on public.employee_attendance for insert to authenticated
with check ((select public.current_employee_role()) in ('Admin','Manager'));

drop policy if exists "Managers can update attendance" on public.employee_attendance;
create policy "Managers can update attendance"
on public.employee_attendance for update to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'))
with check ((select public.current_employee_role()) in ('Admin','Manager'));

drop policy if exists "Managers can delete attendance" on public.employee_attendance;
create policy "Managers can delete attendance"
on public.employee_attendance for delete to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'));

drop policy if exists "Managers can create expenses" on public.expenses;
create policy "Managers can create expenses"
on public.expenses for insert to authenticated
with check (
  (select public.current_employee_role()) in ('Admin','Manager')
  and (select auth.uid()) = created_by
);

-- Consolidate product/variant/stock read access into one policy per table.
-- Managers retain write access; Cashier/Staff remain read-only.
drop policy if exists "Active employees can read products" on public.products;
drop policy if exists "Managers can manage products" on public.products;
create policy "Active employees can read products"
on public.products for select to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager','Cashier','Staff'));
create policy "Managers can insert products"
on public.products for insert to authenticated
with check ((select public.current_employee_role()) in ('Admin','Manager'));
create policy "Managers can update products"
on public.products for update to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'))
with check ((select public.current_employee_role()) in ('Admin','Manager'));
create policy "Managers can delete products"
on public.products for delete to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'));

drop policy if exists "Active employees can read variants" on public.product_variants;
drop policy if exists "Managers can manage variants" on public.product_variants;
create policy "Active employees can read variants"
on public.product_variants for select to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager','Cashier','Staff'));
create policy "Managers can insert variants"
on public.product_variants for insert to authenticated
with check ((select public.current_employee_role()) in ('Admin','Manager'));
create policy "Managers can update variants"
on public.product_variants for update to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'))
with check ((select public.current_employee_role()) in ('Admin','Manager'));
create policy "Managers can delete variants"
on public.product_variants for delete to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'));

drop policy if exists "Active employees can read stock balances" on public.stock_balances;
drop policy if exists "Managers can manage stock balances" on public.stock_balances;
create policy "Active employees can read stock balances"
on public.stock_balances for select to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager','Cashier','Staff'));
create policy "Managers can insert stock balances"
on public.stock_balances for insert to authenticated
with check ((select public.current_employee_role()) in ('Admin','Manager'));
create policy "Managers can update stock balances"
on public.stock_balances for update to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'))
with check ((select public.current_employee_role()) in ('Admin','Manager'));
create policy "Managers can delete stock balances"
on public.stock_balances for delete to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'));
