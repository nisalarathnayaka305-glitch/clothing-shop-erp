-- Supplier purchase receiving and stock ledger.
create sequence if not exists public.purchase_no_seq start with 1;
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  purchase_no text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_reference text,
  purchase_date date not null default current_date,
  total numeric(12,2) not null check (total >= 0),
  status text not null default 'Received' check (status in ('Received')),
  received_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchase_orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  product_no text not null,
  product_name text not null,
  size text not null,
  colour text not null,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
create index if not exists purchase_orders_created_idx on public.purchase_orders(created_at desc);
alter table public.purchase_orders enable row level security;
alter table public.purchase_items enable row level security;
drop policy if exists "Authenticated users can read purchase orders" on public.purchase_orders;
create policy "Authenticated users can read purchase orders" on public.purchase_orders for select to authenticated using (true);
drop policy if exists "Authenticated users can read purchase items" on public.purchase_items;
create policy "Authenticated users can read purchase items" on public.purchase_items for select to authenticated
using (exists(select 1 from public.purchase_orders po where po.id=purchase_id));

create or replace function public.receive_purchase(
  p_supplier_id uuid,
  p_supplier_reference text,
  p_purchase_date date,
  p_items jsonb
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
  v_cost numeric(12,2);
  v_total numeric(12,2):=0;
  v_purchase_id uuid;
  v_purchase_no text;
  v_created_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id) then raise exception 'Supplier not found'; end if;
  if p_purchase_date is null then raise exception 'Purchase date is required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one purchase item'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'variant_id','')='' then raise exception 'Invalid product variant'; end if;
    v_qty:=coalesce((v_item->>'quantity')::integer,0);
    v_cost:=coalesce((v_item->>'unit_cost')::numeric,0);
    if v_qty<=0 then raise exception 'Purchase quantity must be a positive whole number'; end if;
    if v_cost<0 then raise exception 'Unit cost cannot be negative'; end if;
    select pv.id,pv.size,pv.colour,p.product_no,p.name,p.sku
      into v_variant from public.product_variants pv join public.products p on p.id=pv.product_id
      where pv.id=(v_item->>'variant_id')::uuid and p.active=true;
    if not found then raise exception 'Product variant not found or inactive'; end if;
    v_total:=v_total+(v_qty*v_cost);
  end loop;

  v_purchase_no:='PO-'||to_char(now(),'YYYYMMDD')||'-'||lpad(nextval('public.purchase_no_seq')::text,6,'0');
  insert into public.purchase_orders(purchase_no,supplier_id,supplier_reference,purchase_date,total,status,received_by)
  values(v_purchase_no,p_supplier_id,nullif(trim(p_supplier_reference),''),p_purchase_date,v_total,'Received',auth.uid())
  returning id,created_at into v_purchase_id,v_created_at;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty:=(v_item->>'quantity')::integer;
    v_cost:=(v_item->>'unit_cost')::numeric;
    select pv.id,pv.size,pv.colour,p.product_no,p.name,p.sku
      into v_variant from public.product_variants pv join public.products p on p.id=pv.product_id
      where pv.id=(v_item->>'variant_id')::uuid and p.active=true;
    update public.stock_balances set quantity=quantity+v_qty,updated_at=now() where variant_id=v_variant.id;
    if not found then raise exception 'Stock balance missing for variant %',v_variant.id; end if;
    insert into public.purchase_items(purchase_id,variant_id,product_no,product_name,size,colour,quantity,unit_cost,line_total)
    values(v_purchase_id,v_variant.id,v_variant.product_no,v_variant.name,v_variant.size,v_variant.colour,v_qty,v_cost,v_qty*v_cost);
    insert into public.stock_movements(variant_id,quantity_change,reason,created_by)
    values(v_variant.id,v_qty,'Purchase received '||v_purchase_no,auth.uid());
    update public.products set cost_price=v_cost where id=(select product_id from public.product_variants where id=v_variant.id);
  end loop;

  return jsonb_build_object('id',v_purchase_id,'purchase_no',v_purchase_no,'total',v_total,'created_at',v_created_at);
end;
$$;
revoke all on function public.receive_purchase(uuid,text,date,jsonb) from public;
grant execute on function public.receive_purchase(uuid,text,date,jsonb) to authenticated;
