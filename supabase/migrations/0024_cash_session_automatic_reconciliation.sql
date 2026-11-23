-- Make cash drawer reconciliation transaction-aware and prevent untracked cash activity.
-- Every cash sale, cash customer payment, cash refund and cash expense is recorded
-- once in the active drawer session. Manual cash in/out remains available for
-- movements that are not represented elsewhere in the ERP.

begin;

alter table public.cash_session_entries
  add column source_type text,
  add column source_id uuid;

alter table public.cash_session_entries
  add constraint cash_session_entries_source_pair_check
  check ((source_type is null) = (source_id is null));

create unique index cash_session_entries_source_unique
  on public.cash_session_entries(source_type, source_id)
  where source_type is not null and source_id is not null;

create or replace function public.capture_cash_transaction_in_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cashier_id uuid;
  v_session_id uuid;
  v_entry_type text;
  v_amount numeric(12,2);
  v_reason text;
  v_source_type text;
  v_source_id uuid;
begin
  if tg_table_name = 'sales' then
    if new.payment_method <> 'Cash' then return new; end if;
    v_cashier_id := new.cashier_id;
    v_entry_type := 'Cash In';
    v_amount := new.total;
    v_reason := 'Cash sale ' || new.invoice_no;
    v_source_type := 'Sale';
    v_source_id := new.id;
  elsif tg_table_name = 'customer_payments' then
    if new.payment_method <> 'Cash' then return new; end if;
    v_cashier_id := new.created_by;
    v_entry_type := 'Cash In';
    v_amount := new.amount;
    v_reason := 'Customer payment ' || new.payment_no;
    v_source_type := 'Customer Payment';
    v_source_id := new.id;
  elsif tg_table_name = 'sales_returns' then
    if new.refund_method <> 'Cash' then return new; end if;
    v_cashier_id := new.created_by;
    v_entry_type := 'Cash Out';
    v_amount := new.refund_total;
    v_reason := 'Cash refund ' || new.return_no;
    v_source_type := 'Sales Return';
    v_source_id := new.id;
  elsif tg_table_name = 'expenses' then
    if new.payment_method <> 'Cash' then return new; end if;
    v_cashier_id := new.created_by;
    v_entry_type := 'Cash Out';
    v_amount := new.amount;
    v_reason := 'Cash expense ' || new.expense_no;
    v_source_type := 'Expense';
    v_source_id := new.id;
  else
    raise exception 'Unsupported cash transaction source: %', tg_table_name;
  end if;

  -- Zero-value cash sales/refunds do not change the physical drawer.
  if coalesce(v_amount, 0) = 0 then return new; end if;
  if v_cashier_id is null then
    raise exception 'A cashier must be assigned to a cash transaction';
  end if;

  select s.id
    into v_session_id
    from public.cash_sessions s
    where s.cashier_id = v_cashier_id
      and s.status = 'Open'
    order by s.opened_at desc
    limit 1
    for update;

  if v_session_id is null then
    raise exception 'Open a cash drawer session before recording cash transactions';
  end if;

  insert into public.cash_session_entries(
    session_id, entry_type, amount, reason, created_by, source_type, source_id
  )
  values (
    v_session_id, v_entry_type, v_amount, v_reason, v_cashier_id, v_source_type, v_source_id
  )
  on conflict (source_type, source_id)
    where source_type is not null and source_id is not null
    do nothing;

  return new;
end;
$$;

drop trigger if exists cash_session_track_sales on public.sales;
create trigger cash_session_track_sales
after insert on public.sales
for each row execute function public.capture_cash_transaction_in_session();

drop trigger if exists cash_session_track_customer_payments on public.customer_payments;
create trigger cash_session_track_customer_payments
after insert on public.customer_payments
for each row execute function public.capture_cash_transaction_in_session();

drop trigger if exists cash_session_track_sales_returns on public.sales_returns;
create trigger cash_session_track_sales_returns
after insert on public.sales_returns
for each row execute function public.capture_cash_transaction_in_session();

drop trigger if exists cash_session_track_expenses on public.expenses;
create trigger cash_session_track_expenses
after insert on public.expenses
for each row execute function public.capture_cash_transaction_in_session();

create or replace function public.open_cash_session(
  p_opening_float numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(public.current_employee_role() not in ('Admin','Manager','Cashier'), true) then
    raise exception 'Not permitted to open a cash session';
  end if;
  if p_opening_float is null or p_opening_float < 0 or p_opening_float <> round(p_opening_float, 2) then
    raise exception 'Opening float must be a non-negative amount with up to two decimal places';
  end if;

  insert into public.cash_sessions(cashier_id, opening_float, opening_note)
  values (auth.uid(), p_opening_float, nullif(trim(p_note), ''))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.record_cash_session_entry(
  p_session_id uuid,
  p_type text,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(public.current_employee_role() not in ('Admin','Manager','Cashier'), true) then
    raise exception 'Not permitted to record cash movements';
  end if;
  if p_session_id is null
    or p_type not in ('Cash In','Cash Out')
    or p_amount is null
    or p_amount <= 0
    or p_amount <> round(p_amount, 2)
    or length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Enter a valid cash movement';
  end if;

  insert into public.cash_session_entries(session_id, entry_type, amount, reason)
  select s.id, p_type, p_amount, trim(p_reason)
  from public.cash_sessions s
  where s.id = p_session_id
    and s.cashier_id = auth.uid()
    and s.status = 'Open'
  returning id into v_id;

  if v_id is null then
    raise exception 'Open cash session not found';
  end if;

  return v_id;
end;
$$;

create or replace function public.close_cash_session(
  p_session_id uuid,
  p_counted_cash numeric,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(public.current_employee_role() not in ('Admin','Manager','Cashier'), true) then
    raise exception 'Not permitted to close a cash session';
  end if;
  if p_session_id is null
    or p_counted_cash is null
    or p_counted_cash < 0
    or p_counted_cash <> round(p_counted_cash, 2) then
    raise exception 'Counted cash must be a non-negative amount with up to two decimal places';
  end if;

  select round(
    s.opening_float
    + coalesce((
      select sum(case when e.entry_type = 'Cash In' then e.amount else -e.amount end)
      from public.cash_session_entries e
      where e.session_id = s.id
    ), 0),
    2
  )
  into v_expected
  from public.cash_sessions s
  where s.id = p_session_id
    and s.cashier_id = auth.uid()
    and s.status = 'Open'
  for update;

  if v_expected is null then
    raise exception 'Open cash session not found';
  end if;

  update public.cash_sessions
  set closed_at = now(),
      expected_cash = v_expected,
      counted_cash = p_counted_cash,
      cash_difference = round(p_counted_cash - v_expected, 2),
      status = 'Closed',
      closing_note = nullif(trim(p_note), '')
  where id = p_session_id;
end;
$$;

revoke all on function public.capture_cash_transaction_in_session() from public, anon, authenticated;
revoke all on function public.open_cash_session(numeric, text) from public, anon;
revoke all on function public.record_cash_session_entry(uuid, text, numeric, text) from public, anon;
revoke all on function public.close_cash_session(uuid, numeric, text) from public, anon;

grant execute on function public.open_cash_session(numeric, text) to authenticated;
grant execute on function public.record_cash_session_entry(uuid, text, numeric, text) to authenticated;
grant execute on function public.close_cash_session(uuid, numeric, text) to authenticated;

commit;
