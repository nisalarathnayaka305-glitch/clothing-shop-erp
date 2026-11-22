-- Generate a unique, human-readable product number for every catalogue item.
-- Example: PRD-00001, PRD-00002, ...
create sequence if not exists public.product_no_seq start with 1;

alter table public.products
  add column if not exists product_no text;

update public.products
set product_no = 'PRD-' || lpad(nextval('public.product_no_seq')::text, 5, '0')
where product_no is null;

alter table public.products
  alter column product_no set default ('PRD-' || lpad(nextval('public.product_no_seq')::text, 5, '0'));

alter table public.products
  alter column product_no set not null;

create unique index if not exists products_product_no_unique
  on public.products (product_no);
