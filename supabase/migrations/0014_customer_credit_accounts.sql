-- Customer credit sales, accounts receivable and payment allocation.
-- Requires the core POS, customers and role-permission migrations.

alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
  check (payment_method in ('Cash','Card','Bank Transfer','Credit'));

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('Cash','Card','Bank Transfer','Cheque')),
  payment_date date not null default current_date,
  reference_no text,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create sequence if not exists public.customer_payment_no_seq start with 1;
create index if not exists customer_payments_customer_date_idx
  on public.customer_payments(customer_id,payment_date desc);
create index if not exists customer_payments_sale_idx
  on public.customer_payments(sale_id,payment_date desc);

alter table public.customer_payments enable row level security;
drop policy if exists "Sales roles can read customer payments" on public.customer_payments;
create policy "Sales roles can read customer payments"
on public.customer_payments for select to authenticated
using (public.current_employee_role() in ('Admin','Manager','Cashier'));
revoke all on public.customer_payments from anon, authenticated;
grant select on public.customer_payments to authenticated;

create or replace function public.complete_credit_sale(
  p_items jsonb,
  p_discount numeric default 0,
  p_customer_id uuid default null,
  p_amount_received numeric default 0,
  p_initial_payment_method text default 'Cash',
  p_payment_date date default current_date,
  p_reference_no text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_variant record;
  v_qty integer;
  v_subtotal numeric(12,2):=0;
  v_discount numeric(12,2);
  v_total numeric(12,2);
  v_received numeric(12,2);
  v_sale_id uuid;
  v_invoice_no text;
  v_created_at timestamptz;
  v_payment_no text;
  v_payment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if public.current_employee_role() not in ('Admin','Manager','Cashier') then
    raise exception 'Your role cannot process credit sales';
  end if;
  if p_customer_id is null or not exists(select 1 from public.customers where id=p_customer_id) then
    raise exception 'Select a valid customer for a credit sale';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Sale must contain at least one item';
  end if;
  v_discount:=coalesce(p_discount,0);
  v_received:=coalesce(p_amount_received,0);
  if v_discount<0 then raise exception 'Discount cannot be negative'; end if;
  if v_received<0 or v_received<>round(v_received,2) then raise exception 'Initial payment must be a valid non-negative amount'; end if;
  if p_payment_date is null then raise exception 'Payment date is required'; end if;
  if v_received>0 and (p_initial_payment_method is null or p_initial_payment_method not in ('Cash','Card','Bank Transfer','Cheque')) then
    raise exception 'Select a valid initial payment method';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'variant_id','')='' then raise exception 'Invalid product variant'; end if;
    v_qty:=coalesce((v_item->>'quantity')::integer,0);
    if v_qty<=0 then raise exception 'Quantity must be a positive whole number'; end if;
    select pv.id,pv.size,pv.colour,p.product_no,p.name,p.sku,p.selling_price,p.cost_price,sb.quantity
      into v_variant
      from public.product_variants pv
      join public.products p on p.id=pv.product_id
      join public.stock_balances sb on sb.variant_id=pv.id
      where pv.id=(v_item->>'variant_id')::uuid and p.active=true
      for update of sb;
    if not found then raise exception 'Product variant or stock balance not found'; end if;
    if v_variant.quantity<v_qty then raise exception 'Insufficient stock for % / % / %',v_variant.name,v_variant.size,v_variant.colour; end if;
    v_subtotal:=v_subtotal+(v_variant.selling_price*v_qty);
  end loop;

  if v_discount>v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;
  v_total:=round(v_subtotal-v_discount,2);
  if v_total<=0 then raise exception 'A credit sale must have a positive total'; end if;
  if v_received>=v_total then raise exception 'Initial payment must be less than the total. Use a normal sale for fully paid invoices'; end if;

  v_invoice_no:='INV-'||to_char(now(),'YYYYMMDD')||'-'||lpad(nextval('public.invoice_no_seq')::text,6,'0');
  insert into public.sales(invoice_no,subtotal,discount,total,payment_method,amount_received,change_amount,cashier_id,customer_id)
  values(v_invoice_no,v_subtotal,v_discount,v_total,'Credit',v_received,0,auth.uid(),p_customer_id)
  returning id,created_at into v_sale_id,v_created_at;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty:=(v_item->>'quantity')::integer;
    select pv.id,pv.size,pv.colour,p.product_no,p.name,p.sku,p.selling_price,p.cost_price
      into v_variant
      from public.product_variants pv join public.products p on p.id=pv.product_id
      where pv.id=(v_item->>'variant_id')::uuid and p.active=true;
    update public.stock_balances set quantity=quantity-v_qty,updated_at=now()
      where variant_id=v_variant.id and quantity>=v_qty;
    if not found then raise exception 'Stock changed during checkout; please retry'; end if;
    insert into public.sale_items(sale_id,variant_id,product_no,product_name,sku,size,colour,quantity,unit_price,unit_cost,line_total)
    values(v_sale_id,v_variant.id,v_variant.product_no,v_variant.name,v_variant.sku,v_variant.size,v_variant.colour,
      v_qty,v_variant.selling_price,v_variant.cost_price,v_variant.selling_price*v_qty);
    insert into public.stock_movements(variant_id,quantity_change,reason,created_by)
    values(v_variant.id,-v_qty,'Credit sale '||v_invoice_no,auth.uid());
  end loop;

  if v_received>0 then
    v_payment_no:='CP-'||to_char(p_payment_date,'YYYYMMDD')||'-'||lpad(nextval('public.customer_payment_no_seq')::text,6,'0');
    insert into public.customer_payments(payment_no,customer_id,sale_id,amount,payment_method,payment_date,reference_no,created_by)
    values(v_payment_no,p_customer_id,v_sale_id,v_received,p_initial_payment_method,p_payment_date,
      nullif(trim(p_reference_no),''),auth.uid()) returning id into v_payment_id;
  end if;

  return jsonb_build_object('id',v_sale_id,'invoice_no',v_invoice_no,'subtotal',v_subtotal,
    'discount',v_discount,'total',v_total,'amount_received',v_received,'change_amount',0,
    'payment_method','Credit','created_at',v_created_at,'outstanding',round(v_total-v_received,2),
    'initial_payment_no',v_payment_no);
end;
$$;

create or replace function public.record_customer_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date default current_date,
  p_reference_no text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale record;
  v_paid numeric(12,2);
  v_balance numeric(12,2);
  v_amount numeric(12,2);
  v_payment_id uuid;
  v_payment_no text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if public.current_employee_role() not in ('Admin','Manager','Cashier') then
    raise exception 'Your role cannot record customer payments';
  end if;
  if p_sale_id is null then raise exception 'Select a credit invoice'; end if;
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then
    raise exception 'Payment amount must be greater than zero with no more than two decimal places';
  end if;
  if p_payment_method is null or p_payment_method not in ('Cash','Card','Bank Transfer','Cheque') then
    raise exception 'Select a valid payment method';
  end if;
  if p_payment_date is null then raise exception 'Payment date is required'; end if;

  select s.id,s.invoice_no,s.customer_id,s.total,s.payment_method,c.full_name as customer_name
    into v_sale
    from public.sales s join public.customers c on c.id=s.customer_id
    where s.id=p_sale_id
    for update of s;
  if not found or v_sale.payment_method<>'Credit' then raise exception 'Credit invoice not found'; end if;

  select coalesce(sum(cp.amount),0) into v_paid
    from public.customer_payments cp where cp.sale_id=p_sale_id;
  v_balance:=round(v_sale.total-v_paid,2);
  v_amount:=round(p_amount,2);
  if v_balance<=0 then raise exception 'This invoice is already fully paid'; end if;
  if v_amount>v_balance then raise exception 'Payment exceeds the outstanding balance of %',v_balance; end if;

  v_payment_no:='CP-'||to_char(p_payment_date,'YYYYMMDD')||'-'||lpad(nextval('public.customer_payment_no_seq')::text,6,'0');
  insert into public.customer_payments(payment_no,customer_id,sale_id,amount,payment_method,payment_date,reference_no,notes,created_by)
  values(v_payment_no,v_sale.customer_id,p_sale_id,v_amount,p_payment_method,p_payment_date,
    nullif(trim(p_reference_no),''),nullif(trim(p_notes),''),auth.uid())
  returning id into v_payment_id;

  return jsonb_build_object('id',v_payment_id,'payment_no',v_payment_no,'invoice_no',v_sale.invoice_no,
    'customer_name',v_sale.customer_name,'amount',v_amount,'paid_to_date',round(v_paid+v_amount,2),
    'outstanding',round(v_balance-v_amount,2));
end;
$$;

revoke all on function public.complete_credit_sale(jsonb,numeric,uuid,numeric,text,date,text) from public;
revoke all on function public.record_customer_payment(uuid,numeric,text,date,text,text) from public;
grant execute on function public.complete_credit_sale(jsonb,numeric,uuid,numeric,text,date,text) to authenticated;
grant execute on function public.record_customer_payment(uuid,numeric,text,date,text,text) to authenticated;
