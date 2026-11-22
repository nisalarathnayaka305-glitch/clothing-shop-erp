-- Supplier accounts and purchase invoice payment ledger.
-- Requires 0008_supplier_purchases.sql, 0009_expenses.sql and 0011_role_based_permissions.sql.

create sequence if not exists public.supplier_payment_no_seq start with 1;

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_id uuid not null references public.purchase_orders(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('Cash','Card','Bank Transfer','Cheque')),
  payment_date date not null default current_date,
  reference_no text,
  notes text,
  expense_id uuid references public.expenses(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists supplier_payments_supplier_date_idx
  on public.supplier_payments(supplier_id,payment_date desc);
create index if not exists supplier_payments_purchase_idx
  on public.supplier_payments(purchase_id,payment_date desc);

alter table public.supplier_payments enable row level security;

drop policy if exists "Managers can read supplier payments" on public.supplier_payments;
create policy "Managers can read supplier payments"
on public.supplier_payments for select to authenticated
using (public.current_employee_role() in ('Admin','Manager'));

revoke all on public.supplier_payments from anon, authenticated;
grant select on public.supplier_payments to authenticated;

create or replace function public.record_supplier_payment(
  p_purchase_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date,
  p_reference_no text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase record;
  v_paid numeric(12,2);
  v_outstanding numeric(12,2);
  v_payment_id uuid;
  v_payment_no text;
  v_expense_id uuid;
  v_amount numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(public.current_employee_role() not in ('Admin','Manager'),true) then
    raise exception 'Only Admin or Manager can record supplier payments';
  end if;
  if p_purchase_id is null then raise exception 'Select a purchase invoice'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) then
    raise exception 'Payment amount must be greater than zero and have no more than two decimal places';
  end if;
  if p_payment_method not in ('Cash','Card','Bank Transfer','Cheque') then
    raise exception 'Select a valid payment method';
  end if;
  if p_payment_date is null then raise exception 'Payment date is required'; end if;

  select po.id,po.purchase_no,po.supplier_id,po.total,s.name as supplier_name
    into v_purchase
    from public.purchase_orders po
    join public.suppliers s on s.id=po.supplier_id
    where po.id=p_purchase_id
    for update of po;
  if not found then raise exception 'Purchase invoice not found'; end if;

  select coalesce(sum(sp.amount),0) into v_paid
    from public.supplier_payments sp
    where sp.purchase_id=p_purchase_id;
  v_outstanding:=round(v_purchase.total-v_paid,2);
  v_amount:=round(p_amount,2);
  if v_outstanding <= 0 then raise exception 'This purchase invoice is already fully paid'; end if;
  if v_amount > v_outstanding then
    raise exception 'Payment exceeds the outstanding balance of %',v_outstanding;
  end if;

  v_payment_no:='SP-'||to_char(p_payment_date,'YYYYMMDD')||'-'||
    lpad(nextval('public.supplier_payment_no_seq')::text,6,'0');

  insert into public.supplier_payments(
    payment_no,supplier_id,purchase_id,amount,payment_method,payment_date,
    reference_no,notes,created_by
  ) values (
    v_payment_no,v_purchase.supplier_id,p_purchase_id,v_amount,p_payment_method,p_payment_date,
    nullif(trim(p_reference_no),''),nullif(trim(p_notes),''),auth.uid()
  ) returning id into v_payment_id;

  -- Mirror the payment into the existing expense register in the same transaction.
  insert into public.expenses(
    category,description,amount,payment_method,paid_to,supplier_id,reference_no,expense_date,created_by
  ) values (
    'Supplier Payment',
    'Payment for purchase '||v_purchase.purchase_no||' ('||v_payment_no||')',
    v_amount,p_payment_method,v_purchase.supplier_name,v_purchase.supplier_id,
    nullif(trim(p_reference_no),''),p_payment_date,auth.uid()
  ) returning id into v_expense_id;

  update public.supplier_payments set expense_id=v_expense_id where id=v_payment_id;

  return jsonb_build_object(
    'id',v_payment_id,'payment_no',v_payment_no,'purchase_no',v_purchase.purchase_no,
    'supplier_name',v_purchase.supplier_name,'amount',v_amount,
    'paid_to_date',round(v_paid+v_amount,2),
    'outstanding',round(v_outstanding-v_amount,2),'expense_id',v_expense_id
  );
end;
$$;

revoke all on function public.record_supplier_payment(uuid,numeric,text,date,text,text) from public;
grant execute on function public.record_supplier_payment(uuid,numeric,text,date,text,text) to authenticated;
