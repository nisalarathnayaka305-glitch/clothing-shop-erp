-- Employee directory and application roles.
-- Apply this migration after 0009_expenses.sql.

create sequence if not exists public.employee_number_seq start 1;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_no text not null unique default ('EMP-' || lpad(nextval('public.employee_number_seq')::text, 5, '0')),
  full_name text not null,
  email text,
  phone text,
  job_title text,
  department text,
  employment_type text not null default 'Full-time'
    check (employment_type in ('Full-time','Part-time','Contract','Temporary')),
  hire_date date,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  role text not null default 'Staff'
    check (role in ('Admin','Manager','Cashier','Staff')),
  status text not null default 'Active'
    check (status in ('Active','Inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employees_name_idx on public.employees (lower(full_name));
create index if not exists employees_status_idx on public.employees (status);
create index if not exists employees_auth_user_idx on public.employees (auth_user_id);

create or replace function public.current_employee_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select e.role
  from public.employees e
  where e.auth_user_id = auth.uid()
    and e.status = 'Active'
  limit 1;
$$;

revoke all on function public.current_employee_role() from public;
grant execute on function public.current_employee_role() to authenticated;

create or replace function public.set_employee_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at
before update on public.employees
for each row execute function public.set_employee_updated_at();

alter table public.employees enable row level security;

drop policy if exists "Employees can read permitted directory records" on public.employees;
create policy "Employees can read permitted directory records"
on public.employees for select to authenticated
using (
  public.current_employee_role() in ('Admin','Manager')
  or auth_user_id = auth.uid()
);

drop policy if exists "Admins can insert employees" on public.employees;
create policy "Admins can insert employees"
on public.employees for insert to authenticated
with check (public.current_employee_role() = 'Admin');

drop policy if exists "Admins can update employees" on public.employees;
create policy "Admins can update employees"
on public.employees for update to authenticated
using (public.current_employee_role() = 'Admin')
with check (public.current_employee_role() = 'Admin');

drop policy if exists "Admins can delete employees" on public.employees;
create policy "Admins can delete employees"
on public.employees for delete to authenticated
using (public.current_employee_role() = 'Admin');

grant select, insert, update, delete on public.employees to authenticated;
grant usage, select on sequence public.employee_number_seq to authenticated;

-- Bootstrap the first administrator after creating the owner's Auth account.
-- Replace the email with the owner's actual Supabase Auth email, then run this
-- statement once in the Supabase SQL Editor:
-- insert into public.employees (full_name, email, auth_user_id, role, status)
-- select 'Shop Owner', email, id, 'Admin', 'Active'
-- from auth.users
-- where lower(email) = lower('owner@example.com')
-- on conflict (auth_user_id) do update set role = 'Admin', status = 'Active';
