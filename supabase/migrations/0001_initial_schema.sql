create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  barcode text unique,
  name text not null,
  category text,
  selling_price numeric(12,2) not null check (selling_price >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
create policy "Authenticated users can read products"
on public.products for select to authenticated using (true);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null,
  colour text not null,
  barcode text unique,
  unique(product_id,size,colour)
);
alter table public.product_variants enable row level security;

create table if not exists public.stock_balances (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  quantity integer not null default 0 check(quantity >= 0),
  reorder_level integer not null default 5 check(reorder_level >= 0),
  updated_at timestamptz not null default now()
);
alter table public.stock_balances enable row level security;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);
alter table public.customers enable row level security;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);
alter table public.suppliers enable row level security;

-- Configure and test role-based policies and authentication before live use.
-- Never expose a Supabase service_role key in browser code.
