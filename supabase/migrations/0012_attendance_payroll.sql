-- Attendance and basic payroll for the clothing retail ERP.
-- Apply after 0011_role_based_permissions.sql.

alter table public.employees
  add column if not exists salary_basis text not null default 'Monthly'
    check (salary_basis in ('Monthly','Hourly')),
  add column if not exists base_salary numeric(12,2) not null default 0
    check (base_salary >= 0);

create table if not exists public.employee_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  work_date date not null default current_date,
  check_in timestamptz,
  check_out timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0 and break_minutes <= 600),
  status text not null default 'Present'
    check (status in ('Present','Late','Half-day','Leave','Absent')),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, work_date),
  check (check_out is null or check_in is not null),
  check (check_out is null or check_out > check_in)
);

create index if not exists employee_attendance_date_idx
  on public.employee_attendance(work_date desc);
create index if not exists employee_attendance_employee_date_idx
  on public.employee_attendance(employee_id, work_date desc);

alter table public.employee_attendance enable row level security;

drop policy if exists "Employees can read own attendance" on public.employee_attendance;
create policy "Employees can read own attendance"
on public.employee_attendance for select to authenticated
using (
  public.current_employee_role() in ('Admin','Manager')
  or exists (
    select 1 from public.employees e
    where e.id = employee_id and e.auth_user_id = auth.uid() and e.status = 'Active'
  )
);

drop policy if exists "Employees can insert own attendance" on public.employee_attendance;
drop policy if exists "Employees can update own attendance" on public.employee_attendance;
drop policy if exists "Managers can insert attendance" on public.employee_attendance;
create policy "Managers can insert attendance"
on public.employee_attendance for insert to authenticated
with check (public.current_employee_role() in ('Admin','Manager'));

drop policy if exists "Managers can update attendance" on public.employee_attendance;
create policy "Managers can update attendance"
on public.employee_attendance for update to authenticated
using (public.current_employee_role() in ('Admin','Manager'))
with check (public.current_employee_role() in ('Admin','Manager'));

drop policy if exists "Managers can delete attendance" on public.employee_attendance;
create policy "Managers can delete attendance"
on public.employee_attendance for delete to authenticated
using (public.current_employee_role() in ('Admin','Manager'));

grant select, insert, update, delete on public.employee_attendance to authenticated;

create or replace function public.set_attendance_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employee_attendance_updated_at on public.employee_attendance;
create trigger employee_attendance_updated_at
before update on public.employee_attendance
for each row execute function public.set_attendance_updated_at();

-- Employees can only punch their own attendance through server-timestamped RPCs.
create or replace function public.employee_check_in(p_work_date date)
returns uuid language plpgsql security definer set search_path = public as $
declare v_employee_id uuid; v_attendance_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_work_date <> (now() at time zone 'Asia/Colombo')::date then raise exception 'Employees can only punch attendance for the current Sri Lankan date'; end if;
  select id into v_employee_id from public.employees
   where auth_user_id=auth.uid() and status='Active' limit 1;
  if v_employee_id is null then raise exception 'No active employee profile is linked to this login'; end if;
  insert into public.employee_attendance(employee_id,work_date,check_in,status,created_by)
  values(v_employee_id,p_work_date,now(),'Present',auth.uid())
  on conflict(employee_id,work_date) do update
    set check_in=coalesce(public.employee_attendance.check_in,excluded.check_in),
        status='Present'
  returning id into v_attendance_id;
  return v_attendance_id;
end; $;

create or replace function public.employee_check_out(p_work_date date)
returns uuid language plpgsql security definer set search_path = public as $
declare v_employee_id uuid; v_attendance_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into v_employee_id from public.employees
   where auth_user_id=auth.uid() and status='Active' limit 1;
  if v_employee_id is null then raise exception 'No active employee profile is linked to this login'; end if;
  update public.employee_attendance set check_out=now()
   where employee_id=v_employee_id and work_date=p_work_date
     and check_in is not null and check_out is null
   returning id into v_attendance_id;
  if v_attendance_id is null then raise exception 'No open check-in was found for this date'; end if;
  return v_attendance_id;
end; $;

create or replace function public.manager_check_in(p_employee_id uuid,p_work_date date)
returns uuid language plpgsql security definer set search_path = public as $
declare v_attendance_id uuid;
begin
  if public.current_employee_role() not in ('Admin','Manager') then raise exception 'Only Admin or Manager can record attendance for another employee'; end if;
  if p_work_date <> (now() at time zone 'Asia/Colombo')::date then raise exception 'Attendance punches are only allowed for the current Sri Lankan date'; end if;
  if not exists(select 1 from public.employees where id=p_employee_id and status='Active') then raise exception 'Active employee not found'; end if;
  insert into public.employee_attendance(employee_id,work_date,check_in,status,created_by)
  values(p_employee_id,p_work_date,now(),'Present',auth.uid())
  on conflict(employee_id,work_date) do update
    set check_in=coalesce(public.employee_attendance.check_in,excluded.check_in), status='Present'
  returning id into v_attendance_id;
  return v_attendance_id;
end; $;

create or replace function public.manager_check_out(p_attendance_id uuid)
returns uuid language plpgsql security definer set search_path = public as $
declare v_attendance_id uuid;
begin
  if public.current_employee_role() not in ('Admin','Manager') then raise exception 'Only Admin or Manager can record attendance for another employee'; end if;
  update public.employee_attendance set check_out=now()
   where id=p_attendance_id and work_date=(now() at time zone 'Asia/Colombo')::date and check_in is not null and check_out is null
   returning id into v_attendance_id;
  if v_attendance_id is null then raise exception 'No open check-in was found'; end if;
  return v_attendance_id;
end; $;

revoke all on function public.employee_check_in(date) from public;
revoke all on function public.employee_check_out(date) from public;
revoke all on function public.manager_check_in(uuid,date) from public;
revoke all on function public.manager_check_out(uuid) from public;
grant execute on function public.employee_check_in(date) to authenticated;
grant execute on function public.employee_check_out(date) to authenticated;
grant execute on function public.manager_check_in(uuid,date) to authenticated;
grant execute on function public.manager_check_out(uuid) to authenticated;

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'Draft' check (status in ('Draft','Paid')),
  total_gross numeric(12,2) not null default 0 check (total_gross >= 0),
  total_deductions numeric(12,2) not null default 0 check (total_deductions >= 0),
  total_net numeric(12,2) not null default 0 check (total_net >= 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  check (period_end >= period_start),
  unique(period_start, period_end)
);

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  salary_basis text not null check (salary_basis in ('Monthly','Hourly')),
  base_salary numeric(12,2) not null check (base_salary >= 0),
  days_present numeric(8,2) not null default 0 check (days_present >= 0),
  hours_worked numeric(10,2) not null default 0 check (hours_worked >= 0),
  gross_pay numeric(12,2) not null check (gross_pay >= 0),
  deductions numeric(12,2) not null default 0 check (deductions >= 0),
  net_pay numeric(12,2) not null check (net_pay >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique(payroll_run_id, employee_id)
);

create index if not exists payroll_runs_period_idx on public.payroll_runs(period_start desc, period_end desc);
create index if not exists payroll_items_employee_idx on public.payroll_items(employee_id);

alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;

drop policy if exists "Managers can manage payroll runs" on public.payroll_runs;
create policy "Managers can manage payroll runs"
on public.payroll_runs for all to authenticated
using (public.current_employee_role() in ('Admin','Manager'))
with check (public.current_employee_role() in ('Admin','Manager'));

drop policy if exists "Managers can manage payroll items" on public.payroll_items;
create policy "Managers can manage payroll items"
on public.payroll_items for all to authenticated
using (public.current_employee_role() in ('Admin','Manager'))
with check (public.current_employee_role() in ('Admin','Manager'));

grant select, insert, update, delete on public.payroll_runs to authenticated;
grant select, insert, update, delete on public.payroll_items to authenticated;

-- Payroll is a basic gross-pay register only. Statutory EPF/ETF, PAYE,
-- overtime rules, leave encashment and payslip delivery require separate
-- configuration and should be reviewed for current Sri Lankan requirements.
