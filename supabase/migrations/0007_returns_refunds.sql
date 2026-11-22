-- Returns and refunds against original POS invoices.
create table if not exists public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  return_no text not null unique,
  sale_id uuid not null references public.sales(id) on delete restrict,
  refund_total numeric(12,2) not null check (refund_total >= 0),
  refund_method text not null check (refund_method in ('Cash','Card','Bank Transfer','Store Credit')),
  reason text not null,
  restock_items boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.sales_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sales_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  product_no text not null,
  product_name text not null,
  size text not null,
  colour text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);
create index if not exists sales_returns_sale_id_idx on public.sales_returns(sale_id);
create index if not exists sales_returns_created_at_idx on public.sales_returns(created_at desc);
alter table public.sales_returns enable row level security;
alter table public.sales_return_items enable row level security;
drop policy if exists "Authenticated users can read sales returns" on public.sales_returns;
create policy "Authenticated users can read sales returns" on public.sales_returns for select to authenticated using (true);
drop policy if exists "Authenticated users can read sales return items" on public.sales_return_items;
create policy "Authenticated users can read sales return items" on public.sales_return_items
for select to authenticated using (exists (select 1 from public.sales_returns r where r.id = return_id));

create sequence if not exists public.return_no_seq start with 1;

create or replace function public.process_sales_return(
  p_sale_id uuid,
  p_items jsonb,
  p_reason text,
  p_restock_items boolean default true,
  p_refund_method text default 'Cash'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_sale_item record;
  v_qty integer;
  v_previously_returned integer;
  v_refund numeric(12,2) := 0;
  v_return_id uuid;
  v_return_no text;
  v_created_at timestamptz;
  v_seen uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Return reason is required'; end if;
  if p_refund_method not in ('Cash','Card','Bank Transfer','Store Credit') then raise exception 'Unsupported refund method'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Select at least one item to return'; end if;

  perform 1 from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Original sale was not found'; end if;

  for v_line in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_line->>'sale_item_id','') = '' then raise exception 'Invalid sale item'; end if;
    if coalesce((v_line->>'quantity')::integer,0) <= 0 then raise exception 'Return quantity must be a positive whole number'; end if;
    if (v_line->>'sale_item_id')::uuid = any(v_seen) then raise exception 'Duplicate sale item in return request'; end if;
    v_seen := array_append(v_seen,(v_line->>'sale_item_id')::uuid);
    select si.*, pv.id as stock_variant_id
      into v_sale_item
      from public.sale_items si
      join public.product_variants pv on pv.id = si.variant_id
     where si.id = (v_line->>'sale_item_id')::uuid and si.sale_id = p_sale_id
     for update of si;
    if not found then raise exception 'Selected item does not belong to this invoice'; end if;
    v_qty := (v_line->>'quantity')::integer;
    select coalesce(sum(ri.quantity),0)::integer into v_previously_returned
      from public.sales_return_items ri
      join public.sales_returns sr on sr.id = ri.return_id
     where ri.sale_item_id = v_sale_item.id;
    if v_qty + v_previously_returned > v_sale_item.quantity then
      raise exception 'Return quantity exceeds the remaining quantity for %',v_sale_item.product_name;
    end if;
    v_refund := v_refund + (v_sale_item.unit_price * v_qty);
  end loop;

  v_return_no := 'RET-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('public.return_no_seq')::text,6,'0');
  insert into public.sales_returns(return_no,sale_id,refund_total,refund_method,reason,restock_items,created_by)
  values(v_return_no,p_sale_id,v_refund,p_refund_method,trim(p_reason),coalesce(p_restock_items,true),auth.uid())
  returning id,created_at into v_return_id,v_created_at;

  for v_line in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_line->>'quantity')::integer;
    select si.*, pv.id as stock_variant_id
      into v_sale_item
      from public.sale_items si join public.product_variants pv on pv.id = si.variant_id
     where si.id = (v_line->>'sale_item_id')::uuid and si.sale_id = p_sale_id;
    insert into public.sales_return_items(return_id,sale_item_id,variant_id,product_no,product_name,size,colour,quantity,unit_price,line_total)
    values(v_return_id,v_sale_item.id,v_sale_item.stock_variant_id,v_sale_item.product_no,v_sale_item.product_name,
      v_sale_item.size,v_sale_item.colour,v_qty,v_sale_item.unit_price,v_sale_item.unit_price*v_qty);
    if coalesce(p_restock_items,true) then
      update public.stock_balances set quantity = quantity + v_qty, updated_at = now()
       where variant_id = v_sale_item.stock_variant_id;
      if not found then raise exception 'Stock balance not found for returned item'; end if;
      insert into public.stock_movements(variant_id,quantity_change,reason,created_by)
      values(v_sale_item.stock_variant_id,v_qty,'Customer return ' || v_return_no,auth.uid());
    end if;
  end loop;

  return jsonb_build_object('id',v_return_id,'return_no',v_return_no,'refund_total',v_refund,'refund_method',p_refund_method,'created_at',v_created_at);
end;
$$;

revoke all on function public.process_sales_return(uuid,jsonb,text,boolean,text) from public;
grant execute on function public.process_sales_return(uuid,jsonb,text,boolean,text) to authenticated;
