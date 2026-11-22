-- Role-based access for Admin, Manager, Cashier and Staff.
-- Requires 0010_employee_management.sql and an active Admin employee linked to auth.users.

-- Replace the original broad "any authenticated user" table policies.
drop policy if exists "Authenticated users can manage products" on public.products;
drop policy if exists "Authenticated users can manage product variants" on public.product_variants;
drop policy if exists "Authenticated users can manage stock balances" on public.stock_balances;
drop policy if exists "Authenticated users can manage customers" on public.customers;
drop policy if exists "Authenticated users can manage suppliers" on public.suppliers;
drop policy if exists "Authenticated users can read stock movements" on public.stock_movements;
drop policy if exists "Authenticated users can read sales" on public.sales;
drop policy if exists "Authenticated users can read sale items" on public.sale_items;
drop policy if exists "Authenticated users can read sales returns" on public.sales_returns;
drop policy if exists "Authenticated users can read sales return items" on public.sales_return_items;
drop policy if exists "Authenticated users can read purchase orders" on public.purchase_orders;
drop policy if exists "Authenticated users can read purchase items" on public.purchase_items;
drop policy if exists "Authenticated users can read expenses" on public.expenses;
drop policy if exists "Authenticated users can create expenses" on public.expenses;

-- Products and stock: all linked active roles can read; only Admin/Manager can maintain catalogue.
create policy "Active employees can read products" on public.products
for select to authenticated using (public.current_employee_role() in ('Admin','Manager','Cashier','Staff'));
create policy "Managers can manage products" on public.products
for all to authenticated using (public.current_employee_role() in ('Admin','Manager'))
with check (public.current_employee_role() in ('Admin','Manager'));

create policy "Active employees can read variants" on public.product_variants
for select to authenticated using (public.current_employee_role() in ('Admin','Manager','Cashier','Staff'));
create policy "Managers can manage variants" on public.product_variants
for all to authenticated using (public.current_employee_role() in ('Admin','Manager'))
with check (public.current_employee_role() in ('Admin','Manager'));

create policy "Active employees can read stock balances" on public.stock_balances
for select to authenticated using (public.current_employee_role() in ('Admin','Manager','Cashier','Staff'));
create policy "Managers can manage stock balances" on public.stock_balances
for all to authenticated using (public.current_employee_role() in ('Admin','Manager'))
with check (public.current_employee_role() in ('Admin','Manager'));

-- Customer records are available to front-desk and management roles.
create policy "Sales roles can read customers" on public.customers
for select to authenticated using (public.current_employee_role() in ('Admin','Manager','Cashier'));
create policy "Sales roles can add customers" on public.customers
for insert to authenticated with check (public.current_employee_role() in ('Admin','Manager','Cashier'));
create policy "Managers can update customers" on public.customers
for update to authenticated using (public.current_employee_role() in ('Admin','Manager'))
with check (public.current_employee_role() in ('Admin','Manager'));
create policy "Admins can delete customers" on public.customers
for delete to authenticated using (public.current_employee_role() = 'Admin');

-- Supplier, purchasing, returns and expenses are management-only.
create policy "Managers can read suppliers" on public.suppliers
for select to authenticated using (public.current_employee_role() in ('Admin','Manager'));
create policy "Managers can add suppliers" on public.suppliers
for insert to authenticated with check (public.current_employee_role() in ('Admin','Manager'));
create policy "Managers can update suppliers" on public.suppliers
for update to authenticated using (public.current_employee_role() in ('Admin','Manager'))
with check (public.current_employee_role() in ('Admin','Manager'));
create policy "Admins can delete suppliers" on public.suppliers
for delete to authenticated using (public.current_employee_role() = 'Admin');

create policy "Managers can read stock movements" on public.stock_movements
for select to authenticated using (public.current_employee_role() in ('Admin','Manager'));

create policy "Sales roles can read sales" on public.sales
for select to authenticated using (public.current_employee_role() in ('Admin','Manager','Cashier'));
create policy "Sales roles can read sale items" on public.sale_items
for select to authenticated using (
  public.current_employee_role() in ('Admin','Manager','Cashier')
  and exists (select 1 from public.sales s where s.id = sale_id)
);

create policy "Managers can read returns" on public.sales_returns
for select to authenticated using (public.current_employee_role() in ('Admin','Manager'));
create policy "Managers can read return items" on public.sales_return_items
for select to authenticated using (
  public.current_employee_role() in ('Admin','Manager')
  and exists (select 1 from public.sales_returns r where r.id = return_id)
);

create policy "Managers can read purchases" on public.purchase_orders
for select to authenticated using (public.current_employee_role() in ('Admin','Manager'));
create policy "Managers can read purchase items" on public.purchase_items
for select to authenticated using (
  public.current_employee_role() in ('Admin','Manager')
  and exists (select 1 from public.purchase_orders po where po.id = purchase_id)
);

create policy "Managers can read expenses" on public.expenses
for select to authenticated using (public.current_employee_role() in ('Admin','Manager'));
create policy "Managers can create expenses" on public.expenses
for insert to authenticated with check (
  public.current_employee_role() in ('Admin','Manager') and auth.uid() = created_by
);

-- Move privileged RPC implementations behind role-checking wrappers.
alter function public.adjust_stock(uuid, integer, text) rename to adjust_stock_unchecked;
create or replace function public.adjust_stock(p_variant_id uuid,p_quantity_change integer,p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_employee_role() not in ('Admin','Manager') then raise exception 'Only Admin or Manager can adjust stock'; end if;
  perform public.adjust_stock_unchecked(p_variant_id,p_quantity_change,p_reason);
end; $$;
revoke all on function public.adjust_stock_unchecked(uuid,integer,text) from public, authenticated;
revoke all on function public.adjust_stock(uuid,integer,text) from public;
grant execute on function public.adjust_stock(uuid,integer,text) to authenticated;

alter function public.complete_sale(jsonb, numeric, text, numeric) rename to complete_sale_unchecked;
create or replace function public.complete_sale(p_items jsonb,p_discount numeric default 0,p_payment_method text default 'Cash',p_amount_received numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.current_employee_role() not in ('Admin','Manager','Cashier') then raise exception 'Your role cannot process sales'; end if;
  return public.complete_sale_unchecked(p_items,p_discount,p_payment_method,p_amount_received);
end; $$;
revoke all on function public.complete_sale_unchecked(jsonb,numeric,text,numeric) from public, authenticated;
revoke all on function public.complete_sale(jsonb,numeric,text,numeric) from public;
grant execute on function public.complete_sale(jsonb,numeric,text,numeric) to authenticated;

create or replace function public.complete_sale_for_customer(
  p_items jsonb,p_discount numeric default 0,p_payment_method text default 'Cash',
  p_amount_received numeric default 0,p_customer_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb; v_sale_id uuid;
begin
  if public.current_employee_role() not in ('Admin','Manager','Cashier') then raise exception 'Your role cannot process sales'; end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id=p_customer_id) then
    raise exception 'Selected customer was not found';
  end if;
  v_result := public.complete_sale(p_items,p_discount,p_payment_method,p_amount_received);
  v_sale_id := (v_result->>'id')::uuid;
  update public.sales set customer_id=p_customer_id where id=v_sale_id;
  return v_result;
end; $$;
revoke all on function public.complete_sale_for_customer(jsonb,numeric,text,numeric,uuid) from public;
grant execute on function public.complete_sale_for_customer(jsonb,numeric,text,numeric,uuid) to authenticated;

alter function public.process_sales_return(uuid, jsonb, text, boolean, text) rename to process_sales_return_unchecked;
create or replace function public.process_sales_return(
  p_sale_id uuid,p_items jsonb,p_reason text,p_restock_items boolean default true,p_refund_method text default 'Cash'
)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.current_employee_role() not in ('Admin','Manager') then raise exception 'Only Admin or Manager can process returns'; end if;
  return public.process_sales_return_unchecked(p_sale_id,p_items,p_reason,p_restock_items,p_refund_method);
end; $$;
revoke all on function public.process_sales_return_unchecked(uuid,jsonb,text,boolean,text) from public, authenticated;
revoke all on function public.process_sales_return(uuid,jsonb,text,boolean,text) from public;
grant execute on function public.process_sales_return(uuid,jsonb,text,boolean,text) to authenticated;

alter function public.receive_purchase(uuid, text, date, jsonb) rename to receive_purchase_unchecked;
create or replace function public.receive_purchase(p_supplier_id uuid,p_supplier_reference text,p_purchase_date date,p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.current_employee_role() not in ('Admin','Manager') then raise exception 'Only Admin or Manager can receive purchases'; end if;
  return public.receive_purchase_unchecked(p_supplier_id,p_supplier_reference,p_purchase_date,p_items);
end; $$;
revoke all on function public.receive_purchase_unchecked(uuid,text,date,jsonb) from public, authenticated;
revoke all on function public.receive_purchase(uuid,text,date,jsonb) from public;
grant execute on function public.receive_purchase(uuid,text,date,jsonb) to authenticated;
