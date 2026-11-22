-- Fix loyalty awards for customer-linked sales and safely backfill sales created since feature launch.
create or replace function public.award_customer_loyalty_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points integer;
begin
  if new.customer_id is not null then
    v_points := floor(greatest(coalesce(new.total, 0), 0) / 100)::integer;
    if v_points > 0 then
      insert into public.customer_loyalty_ledger
        (customer_id, sale_id, points, entry_type, description, created_by)
      values
        (new.customer_id, new.id, v_points, 'Earned',
         '1 point per LKR 100 net sale', auth.uid())
      on conflict (sale_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sales_award_loyalty_points on public.sales;
create trigger sales_award_loyalty_points
after insert on public.sales
for each row execute function public.award_customer_loyalty_points();

-- Idempotently award points for customer-linked sales already present.
insert into public.customer_loyalty_ledger
  (customer_id, sale_id, points, entry_type, description, created_by)
select
  s.customer_id,
  s.id,
  floor(greatest(coalesce(s.total, 0), 0) / 100)::integer,
  'Earned',
  '1 point per LKR 100 net sale (backfilled)',
  s.cashier_id
from public.sales s
where s.customer_id is not null
  and floor(greatest(coalesce(s.total, 0), 0) / 100)::integer > 0
on conflict (sale_id) do nothing;
