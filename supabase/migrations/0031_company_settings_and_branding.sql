-- 0031_company_settings_and_branding
-- One-row business profile used by the retail and accounting workspaces.

create table if not exists public.company_settings (
  id boolean primary key default true check (id = true),
  company_name text not null default 'Your Clothing Store',
  tagline text not null default 'Clothing & Retail',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  website text not null default '',
  logo_data_url text not null default '',
  currency_code text not null default 'LKR' check (currency_code = 'LKR'),
  receipt_footer text not null default 'Thank you for shopping with us!',
  invoice_note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint company_settings_logo_size check (length(logo_data_url) <= 1400000)
);

alter table public.company_settings enable row level security;

drop policy if exists "Active employees can read company settings" on public.company_settings;
create policy "Active employees can read company settings"
on public.company_settings for select
to authenticated
using (public.current_employee_role() is not null);

drop policy if exists "Admins can insert company settings" on public.company_settings;
create policy "Admins can insert company settings"
on public.company_settings for insert
to authenticated
with check (public.current_employee_role() = 'Admin');

drop policy if exists "Admins can update company settings" on public.company_settings;
create policy "Admins can update company settings"
on public.company_settings for update
to authenticated
using (public.current_employee_role() = 'Admin')
with check (public.current_employee_role() = 'Admin');

grant select, insert, update on public.company_settings to authenticated;

insert into public.company_settings (id)
values (true)
on conflict (id) do nothing;
