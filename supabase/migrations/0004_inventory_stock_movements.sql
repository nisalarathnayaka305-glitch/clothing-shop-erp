-- Retail inventory: record stock changes and expose a transactional adjustment RPC.
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity_change integer not null check (quantity_change <> 0),
  reason text not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.stock_movements enable row level security;
drop policy if exists "Authenticated users can read stock movements" on public.stock_movements;
create policy "Authenticated users can read stock movements"
on public.stock_movements for select to authenticated using (true);

create or replace function public.adjust_stock(
  p_variant_id uuid,
  p_quantity_change integer,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'Stock adjustment must be a non-zero whole number';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required';
  end if;

  update public.stock_balances
  set quantity = quantity + p_quantity_change,
      updated_at = now()
  where variant_id = p_variant_id
    and quantity + p_quantity_change >= 0;

  if not found then
    raise exception 'Stock balance not found or adjustment would make stock negative';
  end if;

  insert into public.stock_movements (variant_id, quantity_change, reason, created_by)
  values (p_variant_id, p_quantity_change, trim(p_reason), auth.uid());
end;
$$;

revoke all on function public.adjust_stock(uuid, integer, text) from public;
grant execute on function public.adjust_stock(uuid, integer, text) to authenticated;
