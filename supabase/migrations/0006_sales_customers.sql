-- Link POS invoices to optional customers and expose sales history/customer reporting.
alter table public.sales
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists sales_customer_id_idx on public.sales(customer_id);
create index if not exists sales_created_at_idx on public.sales(created_at desc);
create index if not exists customers_phone_idx on public.customers(phone);

-- Wrap the existing atomic checkout so customer assignment remains in the same
-- transaction. The original complete_sale RPC still handles stock locking,
-- stock deduction, sale items and movement audit records.
create or replace function public.complete_sale_for_customer(
  p_items jsonb,
  p_discount numeric default 0,
  p_payment_method text default 'Cash',
  p_amount_received numeric default 0,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_sale_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers where id = p_customer_id
  ) then
    raise exception 'Selected customer was not found';
  end if;

  v_result := public.complete_sale(p_items,p_discount,p_payment_method,p_amount_received);
  v_sale_id := (v_result->>'id')::uuid;

  update public.sales
     set customer_id = p_customer_id
   where id = v_sale_id;

  return v_result;
end;
$$;

revoke all on function public.complete_sale_for_customer(jsonb,numeric,text,numeric,uuid) from public;
grant execute on function public.complete_sale_for_customer(jsonb,numeric,text,numeric,uuid) to authenticated;
