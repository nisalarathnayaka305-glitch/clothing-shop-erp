-- POS sales, line items and atomic checkout with stock deduction.
create sequence if not exists public.invoice_no_seq start with 1;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total >= 0),
  payment_method text not null check (payment_method in ('Cash','Card','Bank Transfer')),
  amount_received numeric(12,2) not null check (amount_received >= 0),
  change_amount numeric(12,2) not null default 0 check (change_amount >= 0),
  cashier_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.sales enable row level security;
drop policy if exists "Authenticated users can read sales" on public.sales;
create policy "Authenticated users can read sales" on public.sales for select to authenticated using (true);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  product_no text not null,
  product_name text not null,
  sku text not null,
  size text not null,
  colour text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);
alter table public.sale_items enable row level security;
drop policy if exists "Authenticated users can read sale items" on public.sale_items;
create policy "Authenticated users can read sale items" on public.sale_items
for select to authenticated using (
  exists (select 1 from public.sales s where s.id = sale_id)
);

create or replace function public.complete_sale(
  p_items jsonb,
  p_discount numeric default 0,
  p_payment_method text default 'Cash',
  p_amount_received numeric default 0
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
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2);
  v_total numeric(12,2);
  v_received numeric(12,2);
  v_change numeric(12,2);
  v_sale_id uuid;
  v_invoice_no text;
  v_created_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale must contain at least one item';
  end if;
  if p_payment_method not in ('Cash','Card','Bank Transfer') then
    raise exception 'Unsupported payment method';
  end if;
  v_discount := coalesce(p_discount,0);
  v_received := coalesce(p_amount_received,0);
  if v_discount < 0 then raise exception 'Discount cannot be negative'; end if;

  -- Validate all lines, then lock and decrement stock inside this transaction.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'variant_id','') = '' then raise exception 'Invalid product variant'; end if;
    if coalesce((v_item->>'quantity')::integer,0) <= 0 then raise exception 'Quantity must be a positive whole number'; end if;
    select pv.id, pv.size, pv.colour, pv.barcode, p.id as product_id, p.product_no, p.name, p.sku,
           p.selling_price, p.cost_price
      into v_variant
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
     where pv.id = (v_item->>'variant_id')::uuid and p.active = true;
    if not found then raise exception 'Product variant not found or inactive'; end if;
    v_qty := (v_item->>'quantity')::integer;
    if not exists (select 1 from public.stock_balances sb where sb.variant_id = v_variant.id and sb.quantity >= v_qty) then
      raise exception 'Insufficient stock for % / % / %', v_variant.name, v_variant.size, v_variant.colour;
    end if;
    v_subtotal := v_subtotal + (v_variant.selling_price * v_qty);
  end loop;

  if v_discount > v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;
  v_total := v_subtotal - v_discount;
  if v_received < v_total then raise exception 'Amount received is less than sale total'; end if;
  if p_payment_method <> 'Cash' and v_received <> v_total then
    raise exception 'For card or bank transfer, amount received must equal the sale total';
  end if;
  v_change := case when p_payment_method = 'Cash' then v_received - v_total else 0 end;
  v_invoice_no := 'INV-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('public.invoice_no_seq')::text,6,'0');

  insert into public.sales(invoice_no,subtotal,discount,total,payment_method,amount_received,change_amount,cashier_id)
  values(v_invoice_no,v_subtotal,v_discount,v_total,p_payment_method,v_received,v_change,auth.uid())
  returning id,created_at into v_sale_id,v_created_at;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    select pv.id, pv.size, pv.colour, p.product_no, p.name, p.sku, p.selling_price, p.cost_price
      into v_variant
      from public.product_variants pv join public.products p on p.id = pv.product_id
     where pv.id = (v_item->>'variant_id')::uuid and p.active = true;
    update public.stock_balances
       set quantity = quantity - v_qty, updated_at = now()
     where variant_id = v_variant.id and quantity >= v_qty;
    if not found then raise exception 'Stock changed during checkout; please retry'; end if;
    insert into public.sale_items(sale_id,variant_id,product_no,product_name,sku,size,colour,quantity,unit_price,unit_cost,line_total)
    values(v_sale_id,v_variant.id,v_variant.product_no,v_variant.name,v_variant.sku,v_variant.size,v_variant.colour,
      v_qty,v_variant.selling_price,v_variant.cost_price,v_variant.selling_price*v_qty);
    insert into public.stock_movements(variant_id,quantity_change,reason,created_by)
    values(v_variant.id,-v_qty,'Sale ' || v_invoice_no,auth.uid());
  end loop;

  return jsonb_build_object('id',v_sale_id,'invoice_no',v_invoice_no,'subtotal',v_subtotal,
    'discount',v_discount,'total',v_total,'amount_received',v_received,'change_amount',v_change,
    'payment_method',p_payment_method,'created_at',v_created_at);
end;
$$;

revoke all on function public.complete_sale(jsonb,numeric,text,numeric) from public;
grant execute on function public.complete_sale(jsonb,numeric,text,numeric) to authenticated;
