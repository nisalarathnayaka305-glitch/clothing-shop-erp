-- Expense register for shop operating costs and payment records.
create sequence if not exists public.expense_no_seq start with 1;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text not null unique,
  category text not null check (category in (
    'General','Supplier Payment','Employee Salary','Wages','Rent','Electricity','Water',
    'Internet & Phone','Transport','Packaging','Maintenance','Marketing','Bank Charges','Other'
  )),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('Cash','Card','Bank Transfer','Cheque')),
  paid_to text,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  reference_no text,
  expense_date date not null default current_date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  constraint supplier_payment_requires_supplier check (category <> 'Supplier Payment' or supplier_id is not null)
);

create index if not exists expenses_date_idx on public.expenses(expense_date desc);
create index if not exists expenses_category_date_idx on public.expenses(category,expense_date desc);
create index if not exists expenses_supplier_idx on public.expenses(supplier_id);

alter table public.expenses enable row level security;
drop policy if exists "Authenticated users can read expenses" on public.expenses;
create policy "Authenticated users can read expenses"
on public.expenses for select to authenticated using (true);
drop policy if exists "Authenticated users can create expenses" on public.expenses;
create policy "Authenticated users can create expenses"
on public.expenses for insert to authenticated with check (auth.uid() = created_by);

create or replace function public.assign_expense_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.expense_no is null or trim(new.expense_no) = '' then
    new.expense_no := 'EXP-' || to_char(coalesce(new.expense_date,current_date),'YYYYMMDD') || '-' ||
      lpad(nextval('public.expense_no_seq')::text,6,'0');
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_assign_number on public.expenses;
create trigger expenses_assign_number
before insert on public.expenses
for each row execute function public.assign_expense_number();
