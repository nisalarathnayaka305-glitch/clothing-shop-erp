-- Customer loyalty ledger, cashier cash sessions, and purchase request workflow.
create table if not exists public.customer_loyalty_ledger (
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on delete restrict,
 sale_id uuid unique references public.sales(id) on delete restrict, points integer not null check(points<>0),
 entry_type text not null check(entry_type in ('Earned','Redeemed','Adjustment','Expired')), description text,
 created_by uuid references auth.users(id) default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists customer_loyalty_ledger_customer_idx on public.customer_loyalty_ledger(customer_id,created_at desc);
alter table public.customer_loyalty_ledger enable row level security;
create policy "Sales roles read loyalty ledger" on public.customer_loyalty_ledger for select to authenticated using((select public.current_employee_role()) in ('Admin','Manager','Cashier'));
create policy "Managers adjust loyalty ledger" on public.customer_loyalty_ledger for insert to authenticated with check((select public.current_employee_role()) in ('Admin','Manager') and created_by=(select auth.uid()));
create or replace function public.award_customer_loyalty_points() returns trigger language plpgsql security definer set search_path=public as $$
declare v_points integer;
begin
 if new.customer_id is not null then
  v_points:=floor(greatest(new.total,0)/100)::integer;
  if v_points>0 then insert into public.customer_loyalty_ledger(customer_id,sale_id,points,entry_type,description,created_by)
   values(new.customer_id,new.id,v_points,'Earned','1 point per LKR 100 net sale',new.cashier_id) on conflict(sale_id) do nothing; end if;
 end if; return new;
end $$;
drop trigger if exists sales_award_loyalty_points on public.sales;
create trigger sales_award_loyalty_points after insert on public.sales for each row execute function public.award_customer_loyalty_points();
revoke execute on function public.award_customer_loyalty_points() from public,anon,authenticated;

create table if not exists public.cash_sessions (
 id uuid primary key default gen_random_uuid(), cashier_id uuid not null references auth.users(id),
 opened_at timestamptz not null default now(), closed_at timestamptz,
 opening_float numeric(12,2) not null check(opening_float>=0), expected_cash numeric(12,2), counted_cash numeric(12,2), cash_difference numeric(12,2),
 status text not null default 'Open' check(status in ('Open','Closed')), opening_note text, closing_note text
);
create unique index if not exists one_open_cash_session_per_cashier on public.cash_sessions(cashier_id) where status='Open';
create table if not exists public.cash_session_entries (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.cash_sessions(id) on delete restrict,
 entry_type text not null check(entry_type in ('Cash In','Cash Out')), amount numeric(12,2) not null check(amount>0),
 reason text not null, created_by uuid not null references auth.users(id) default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists cash_session_entries_session_idx on public.cash_session_entries(session_id,created_at);
alter table public.cash_sessions enable row level security; alter table public.cash_session_entries enable row level security;
create policy "Cashiers read own cash sessions" on public.cash_sessions for select to authenticated using(cashier_id=(select auth.uid()) or (select public.current_employee_role()) in ('Admin','Manager'));
create policy "Cashiers open own cash sessions" on public.cash_sessions for insert to authenticated with check(cashier_id=(select auth.uid()) and (select public.current_employee_role()) in ('Admin','Manager','Cashier'));
create policy "Cashiers close own cash sessions" on public.cash_sessions for update to authenticated using((cashier_id=(select auth.uid()) or (select public.current_employee_role()) in ('Admin','Manager')) and status='Open') with check(status='Closed');
create policy "Cashiers read session entries" on public.cash_session_entries for select to authenticated using(exists(select 1 from public.cash_sessions s where s.id=session_id and (s.cashier_id=(select auth.uid()) or (select public.current_employee_role()) in ('Admin','Manager'))));
create policy "Cashiers add session entries" on public.cash_session_entries for insert to authenticated with check(created_by=(select auth.uid()) and exists(select 1 from public.cash_sessions s where s.id=session_id and s.cashier_id=(select auth.uid()) and s.status='Open'));

create or replace function public.open_cash_session(p_opening_float numeric,p_note text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; begin
 if coalesce(public.current_employee_role() not in ('Admin','Manager','Cashier'),true) then raise exception 'Not permitted to open a cash session'; end if;
 if p_opening_float<0 then raise exception 'Opening float cannot be negative'; end if;
 insert into public.cash_sessions(cashier_id,opening_float,opening_note) values(auth.uid(),p_opening_float,nullif(trim(p_note),'')) returning id into v_id; return v_id;
end $$;
create or replace function public.record_cash_session_entry(p_session_id uuid,p_type text,p_amount numeric,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; begin
 if coalesce(public.current_employee_role() not in ('Admin','Manager','Cashier'),true) then raise exception 'Not permitted to record cash movements'; end if;
 if p_type not in ('Cash In','Cash Out') or p_amount<=0 or length(trim(coalesce(p_reason,'')))=0 then raise exception 'Enter a valid cash movement'; end if;
 insert into public.cash_session_entries(session_id,entry_type,amount,reason) select s.id,p_type,p_amount,trim(p_reason) from public.cash_sessions s where s.id=p_session_id and s.cashier_id=auth.uid() and s.status='Open' returning id into v_id;
 if v_id is null then raise exception 'Open cash session not found'; end if; return v_id;
end $$;
create or replace function public.close_cash_session(p_session_id uuid,p_counted_cash numeric,p_note text default null) returns void language plpgsql security definer set search_path=public as $$
declare v_expected numeric; begin
 if coalesce(public.current_employee_role() not in ('Admin','Manager','Cashier'),true) then raise exception 'Not permitted to close a cash session'; end if;
 if p_counted_cash<0 then raise exception 'Counted cash cannot be negative'; end if;
 select s.opening_float
 + coalesce((select sum(case when e.entry_type='Cash In' then e.amount else -e.amount end) from public.cash_session_entries e where e.session_id=s.id),0)
 + coalesce((select sum(x.total) from public.sales x where x.cashier_id=s.cashier_id and x.payment_method='Cash' and x.created_at>=s.opened_at and x.created_at<=now()),0)
 - coalesce((select sum(r.refund_amount) from public.sales_returns r where r.created_by=s.cashier_id and r.created_at>=s.opened_at and r.created_at<=now() and r.refund_method='Cash'),0)
 into v_expected from public.cash_sessions s where s.id=p_session_id and s.cashier_id=auth.uid() and s.status='Open' for update;
 if v_expected is null then raise exception 'Open cash session not found'; end if;
 update public.cash_sessions set closed_at=now(),expected_cash=v_expected,counted_cash=p_counted_cash,cash_difference=p_counted_cash-v_expected,status='Closed',closing_note=nullif(trim(p_note),'') where id=p_session_id;
end $$;

create table if not exists public.purchase_requests (
 id uuid primary key default gen_random_uuid(), request_no text not null unique default ('POR-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6))),
 supplier_id uuid not null references public.suppliers(id), supplier_reference text,
 status text not null default 'Draft' check(status in ('Draft','Submitted','Approved','Cancelled','Received')),
 notes text, created_by uuid not null references auth.users(id) default auth.uid(), approved_by uuid references auth.users(id),
 approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.purchase_request_items (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.purchase_requests(id) on delete cascade,
 variant_id uuid not null references public.product_variants(id), quantity integer not null check(quantity>0),
 estimated_unit_cost numeric(12,2) not null check(estimated_unit_cost>=0), unique(request_id,variant_id)
);
alter table public.purchase_requests enable row level security; alter table public.purchase_request_items enable row level security;
create policy "Managers read purchase requests" on public.purchase_requests for select to authenticated using((select public.current_employee_role()) in ('Admin','Manager'));
create policy "Managers create purchase requests" on public.purchase_requests for insert to authenticated with check((select public.current_employee_role()) in ('Admin','Manager') and created_by=(select auth.uid()));
create policy "Managers update draft purchase requests" on public.purchase_requests for update to authenticated using((select public.current_employee_role()) in ('Admin','Manager') and status in ('Draft','Submitted')) with check((select public.current_employee_role()) in ('Admin','Manager'));
create policy "Managers read purchase request items" on public.purchase_request_items for select to authenticated using(exists(select 1 from public.purchase_requests r where r.id=request_id));
create policy "Managers add purchase request items" on public.purchase_request_items for insert to authenticated with check(exists(select 1 from public.purchase_requests r where r.id=request_id and r.status='Draft' and (select public.current_employee_role()) in ('Admin','Manager')));
create policy "Managers update draft purchase request items" on public.purchase_request_items for update to authenticated using(exists(select 1 from public.purchase_requests r where r.id=request_id and r.status='Draft' and (select public.current_employee_role()) in ('Admin','Manager'))) with check(exists(select 1 from public.purchase_requests r where r.id=request_id and r.status='Draft' and (select public.current_employee_role()) in ('Admin','Manager')));
create policy "Managers delete draft purchase request items" on public.purchase_request_items for delete to authenticated using(exists(select 1 from public.purchase_requests r where r.id=request_id and r.status='Draft' and (select public.current_employee_role()) in ('Admin','Manager')));
create or replace function public.submit_purchase_request(p_request_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if coalesce(public.current_employee_role() not in ('Admin','Manager'),true) then raise exception 'Only Admin or Manager can submit purchase requests'; end if;
 if not exists(select 1 from public.purchase_request_items where request_id=p_request_id) then raise exception 'Add at least one item before submitting'; end if;
 update public.purchase_requests set status='Submitted',updated_at=now() where id=p_request_id and created_by=auth.uid() and status='Draft';
 if not found then raise exception 'Draft purchase request not found'; end if;
end $$;
create or replace function public.approve_purchase_request(p_request_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if coalesce(public.current_employee_role() not in ('Admin','Manager'),true) then raise exception 'Only Admin or Manager can approve purchase requests'; end if;
 update public.purchase_requests set status='Approved',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=p_request_id and status='Submitted';
 if not found then raise exception 'Submitted purchase request not found'; end if;
end $$;
revoke execute on function public.open_cash_session(numeric,text) from public,anon;
revoke execute on function public.record_cash_session_entry(uuid,text,numeric,text) from public,anon;
revoke execute on function public.close_cash_session(uuid,numeric,text) from public,anon;
revoke execute on function public.submit_purchase_request(uuid) from public,anon;
revoke execute on function public.approve_purchase_request(uuid) from public,anon;
grant execute on function public.open_cash_session(numeric,text) to authenticated;
grant execute on function public.record_cash_session_entry(uuid,text,numeric,text) to authenticated;
grant execute on function public.close_cash_session(uuid,numeric,text) to authenticated;
grant execute on function public.submit_purchase_request(uuid) to authenticated;
grant execute on function public.approve_purchase_request(uuid) to authenticated;
