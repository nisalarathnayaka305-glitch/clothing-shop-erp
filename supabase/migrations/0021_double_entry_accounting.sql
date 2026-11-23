-- Double-entry accounting foundation for the clothing retail ERP.
-- All operational postings are created transactionally by database triggers.
-- Manual journals and opening balances are posted through guarded RPCs.

create sequence if not exists public.accounting_entry_no_seq start with 1;

create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  account_type text not null check (account_type in ('Asset','Liability','Equity','Revenue','Expense')),
  normal_balance text not null check (normal_balance in ('debit','credit')),
  parent_id uuid references public.chart_of_accounts(id) on delete restrict,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.chart_of_accounts (code,name,account_type,normal_balance,is_system,description) values
  ('1000','Cash on Hand','Asset','debit',true,'Physical cash held by the shop.'),
  ('1010','Bank Account','Asset','debit',true,'Money held in the shop bank account.'),
  ('1020','Card Settlement Clearing','Asset','debit',true,'Card receipts awaiting bank settlement.'),
  ('1030','Cheques in Hand','Asset','debit',true,'Customer cheques awaiting deposit or clearance.'),
  ('1100','Accounts Receivable','Asset','debit',true,'Outstanding customer credit invoices.'),
  ('1200','Inventory','Asset','debit',true,'Clothing inventory at recorded cost.'),
  ('2000','Accounts Payable','Liability','credit',true,'Outstanding supplier purchase invoices.'),
  ('2100','Payroll Deductions Payable','Liability','credit',true,'Payroll deductions withheld and not yet remitted.'),
  ('2200','Customer Store Credit Liability','Liability','credit',true,'Store credit owed to customers.'),
  ('3000','Owner''s Capital','Equity','credit',true,'Owner contributions to the business.'),
  ('3100','Opening Balance Equity','Equity','credit',true,'Temporary balancing account for opening balances.'),
  ('3200','Retained Earnings','Equity','credit',true,'Accumulated earnings from prior periods.'),
  ('4000','Sales Revenue','Revenue','credit',true,'Revenue from clothing sales before discounts.'),
  ('4010','Sales Discounts','Revenue','debit',true,'Discounts allowed on sales.'),
  ('4020','Sales Returns','Revenue','debit',true,'Refunds and sales returns.'),
  ('4100','Inventory Adjustment Gain','Revenue','credit',true,'Positive stock-count adjustments.'),
  ('5000','Cost of Goods Sold','Expense','debit',true,'Cost of inventory sold.'),
  ('5100','Inventory Adjustment Loss','Expense','debit',true,'Negative stock-count adjustments and shrinkage.'),
  ('5200','Salaries and Wages Expense','Expense','debit',true,'Employee salaries and wages.'),
  ('5300','Rent Expense','Expense','debit',true,'Shop rent and premises costs.'),
  ('5400','Utilities Expense','Expense','debit',true,'Electricity, water, internet and phone.'),
  ('5500','Transport Expense','Expense','debit',true,'Transport and delivery costs.'),
  ('5600','Packaging Expense','Expense','debit',true,'Shopping bags and packaging materials.'),
  ('5700','Maintenance Expense','Expense','debit',true,'Repairs and maintenance.'),
  ('5800','Marketing Expense','Expense','debit',true,'Advertising and promotion.'),
  ('5900','Bank Charges Expense','Expense','debit',true,'Bank and payment processing charges.'),
  ('5990','General and Other Expense','Expense','debit',true,'Other operating expenses.')
on conflict (code) do update set
  name=excluded.name,
  account_type=excluded.account_type,
  normal_balance=excluded.normal_balance,
  is_system=true;

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  period_start date not null,
  period_end date not null,
  status text not null default 'Open' check (status in ('Open','Closed')),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  check (period_end >= period_start)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text not null unique default (
    'JE-' || to_char(current_date,'YYYYMMDD') || '-' ||
    lpad(nextval('public.accounting_entry_no_seq')::text,6,'0')
  ),
  entry_date date not null,
  description text not null,
  source_type text not null,
  source_id uuid,
  status text not null default 'Posted' check (status in ('Posted')),
  created_by uuid references auth.users(id),
  posted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  posted_at timestamptz not null default now()
);

create unique index if not exists journal_entries_source_unique
  on public.journal_entries(source_type,source_id)
  where source_id is not null;
create unique index if not exists journal_entries_opening_inventory_once
  on public.journal_entries(source_type)
  where source_type='opening_inventory' and source_id is null;
create index if not exists journal_entries_date_idx
  on public.journal_entries(entry_date desc,entry_no);
create index if not exists journal_entries_source_type_idx
  on public.journal_entries(source_type,entry_date desc);

create table if not exists public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete restrict,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  description text,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index if not exists journal_entry_lines_entry_idx
  on public.journal_entry_lines(journal_entry_id);
create index if not exists journal_entry_lines_account_idx
  on public.journal_entry_lines(account_id,journal_entry_id);

alter table public.chart_of_accounts enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;

drop policy if exists "Accounting users read chart of accounts" on public.chart_of_accounts;
create policy "Accounting users read chart of accounts"
on public.chart_of_accounts for select to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'));

drop policy if exists "Admins add chart accounts" on public.chart_of_accounts;
create policy "Admins add chart accounts"
on public.chart_of_accounts for insert to authenticated
with check ((select public.current_employee_role())='Admin');

drop policy if exists "Admins update chart accounts" on public.chart_of_accounts;
create policy "Admins update chart accounts"
on public.chart_of_accounts for update to authenticated
using ((select public.current_employee_role())='Admin')
with check ((select public.current_employee_role())='Admin');

drop policy if exists "Accounting users read periods" on public.accounting_periods;
create policy "Accounting users read periods"
on public.accounting_periods for select to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'));

drop policy if exists "Admins create periods" on public.accounting_periods;
create policy "Admins create periods"
on public.accounting_periods for insert to authenticated
with check ((select public.current_employee_role())='Admin' and created_by=(select auth.uid()));

drop policy if exists "Admins update periods" on public.accounting_periods;
create policy "Admins update periods"
on public.accounting_periods for update to authenticated
using ((select public.current_employee_role())='Admin')
with check ((select public.current_employee_role())='Admin');

drop policy if exists "Accounting users read journal entries" on public.journal_entries;
create policy "Accounting users read journal entries"
on public.journal_entries for select to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'));

drop policy if exists "Accounting users read journal lines" on public.journal_entry_lines;
create policy "Accounting users read journal lines"
on public.journal_entry_lines for select to authenticated
using (
  exists (
    select 1 from public.journal_entries je
    where je.id=journal_entry_id
      and je.status='Posted'
      and (select public.current_employee_role()) in ('Admin','Manager')
  )
);

grant select,insert,update on public.chart_of_accounts to authenticated;
grant select,insert,update on public.accounting_periods to authenticated;
grant select on public.journal_entries,public.journal_entry_lines to authenticated;

-- Capture the cost used at the time of a stock movement. Sales, purchases and
-- returns also retain their own source-line costs; this field is essential for
-- valuing manual stock-count adjustments when opening balances are prepared.
alter table public.stock_movements
  add column if not exists unit_cost numeric(12,2);

update public.stock_movements sm
set unit_cost=p.cost_price
from public.product_variants pv
join public.products p on p.id=pv.product_id
where sm.variant_id=pv.id and sm.unit_cost is null;

alter table public.stock_movements
  alter column unit_cost set default 0,
  alter column unit_cost set not null;

create or replace function public.set_stock_movement_unit_cost()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.reason like 'Purchase received %' then
    select pi.unit_cost into new.unit_cost
    from public.purchase_orders po
    join public.purchase_items pi on pi.purchase_id=po.id
    where po.purchase_no=substring(new.reason from '^Purchase received (.+)
$$;

drop trigger if exists stock_movements_set_unit_cost on public.stock_movements;
create trigger stock_movements_set_unit_cost
before insert on public.stock_movements
for each row execute function public.set_stock_movement_unit_cost();

create or replace function public.accounting_assert_open_period(p_entry_date date)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if exists (
    select 1 from public.accounting_periods ap
    where ap.status='Closed'
      and p_entry_date between ap.period_start and ap.period_end
  ) then
    raise exception 'The accounting period containing % is closed.',p_entry_date;
  end if;
end;
$$;

create or replace function public.accounting_create_journal(
  p_source_type text,
  p_source_id uuid,
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_entry_id uuid;
  v_line_count integer;
  v_inserted integer;
  v_debits numeric(14,2);
  v_credits numeric(14,2);
begin
  if p_entry_date is null or nullif(trim(coalesce(p_description,'')),'') is null then
    raise exception 'Journal date and description are required.';
  end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<2 then
    raise exception 'A journal must contain at least two lines.';
  end if;

  select
    count(*)::integer,
    round(coalesce(sum(coalesce((x->>'debit')::numeric,0)),0),2),
    round(coalesce(sum(coalesce((x->>'credit')::numeric,0)),0),2)
  into v_line_count,v_debits,v_credits
  from jsonb_array_elements(p_lines) x;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) x
    where nullif(trim(coalesce(x->>'account_code','')),'') is null
       or coalesce((x->>'debit')::numeric,0)<0
       or coalesce((x->>'credit')::numeric,0)<0
       or (coalesce((x->>'debit')::numeric,0)>0 and coalesce((x->>'credit')::numeric,0)>0)
       or (coalesce((x->>'debit')::numeric,0)=0 and coalesce((x->>'credit')::numeric,0)=0)
  ) then
    raise exception 'Each journal line needs an account and either a debit or a credit amount.';
  end if;

  if v_debits<=0 or v_debits<>v_credits then
    raise exception 'Journal is not balanced. Debits: %, credits: %.',v_debits,v_credits;
  end if;

  perform public.accounting_assert_open_period(p_entry_date);

  insert into public.journal_entries
    (entry_date,description,source_type,source_id,created_by,posted_by,status)
  values
    (p_entry_date,trim(p_description),p_source_type,p_source_id,p_created_by,p_created_by,'Posted')
  on conflict (source_type,source_id) where source_id is not null do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    return null;
  end if;

  insert into public.journal_entry_lines
    (journal_entry_id,account_id,description,debit,credit)
  select
    v_entry_id,
    a.id,
    nullif(trim(x->>'description'),''),
    coalesce((x->>'debit')::numeric,0),
    coalesce((x->>'credit')::numeric,0)
  from jsonb_array_elements(p_lines) x
  join public.chart_of_accounts a
    on a.code=x->>'account_code' and a.is_active=true;

  get diagnostics v_inserted = row_count;
  if v_inserted<>v_line_count then
    raise exception 'One or more journal lines reference an unknown or inactive account.';
  end if;

  return v_entry_id;
end;
$$;

create or replace function public.accounting_post_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sale public.sales%rowtype;
  v_payment_account text;
  v_lines jsonb;
  v_cogs numeric(14,2);
begin
  select * into v_sale from public.sales where id=p_sale_id;
  if not found then return; end if;

  v_payment_account:=case v_sale.payment_method
    when 'Credit' then '1100'
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    else '1000'
  end;

  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code',v_payment_account,'debit',v_sale.total,'credit',0,'description','Sale receipt / receivable'),
    jsonb_build_object('account_code','4000','debit',0,'credit',v_sale.subtotal,'description','Sales revenue')
  );

  if v_sale.discount>0 then
    v_lines:=v_lines || jsonb_build_array(
      jsonb_build_object('account_code','4010','debit',v_sale.discount,'credit',0,'description','Sales discount')
    );
  end if;

  select round(coalesce(sum(si.unit_cost*si.quantity),0),2)
  into v_cogs
  from public.sale_items si
  where si.sale_id=v_sale.id;

  if v_cogs>0 then
    v_lines:=v_lines || jsonb_build_array(
      jsonb_build_object('account_code','5000','debit',v_cogs,'credit',0,'description','Cost of goods sold'),
      jsonb_build_object('account_code','1200','debit',0,'credit',v_cogs,'description','Inventory issued to sale')
    );
  end if;

  perform public.accounting_create_journal(
    'sale',v_sale.id,(v_sale.created_at at time zone 'Asia/Colombo')::date,
    'Sale '||v_sale.invoice_no,v_lines,v_sale.cashier_id
  );
end;
$$;

create or replace function public.accounting_post_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_purchase public.purchase_orders%rowtype;
  v_lines jsonb;
begin
  select * into v_purchase from public.purchase_orders where id=p_purchase_id;
  if not found then return; end if;
  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code','1200','debit',v_purchase.total,'credit',0,'description','Inventory received'),
    jsonb_build_object('account_code','2000','debit',0,'credit',v_purchase.total,'description','Supplier payable')
  );
  perform public.accounting_create_journal(
    'purchase',v_purchase.id,v_purchase.purchase_date,
    'Purchase '||v_purchase.purchase_no,v_lines,v_purchase.received_by
  );
end;
$$;

create or replace function public.accounting_post_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_expense public.expenses%rowtype;
  v_expense_account text;
  v_payment_account text;
  v_lines jsonb;
begin
  select * into v_expense from public.expenses where id=p_expense_id;
  if not found or v_expense.category='Supplier Payment' then return; end if;

  v_expense_account:=case lower(coalesce(v_expense.category,''))
    when 'employee salary' then '5200'
    when 'wages' then '5200'
    when 'rent' then '5300'
    when 'electricity' then '5400'
    when 'water' then '5400'
    when 'internet & phone' then '5400'
    when 'transport' then '5500'
    when 'packaging' then '5600'
    when 'maintenance' then '5700'
    when 'marketing' then '5800'
    when 'bank charges' then '5900'
    else '5990'
  end;

  v_payment_account:=case v_expense.payment_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Cheque' then '1030'
    else '1000'
  end;

  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code',v_expense_account,'debit',v_expense.amount,'credit',0,'description',v_expense.description),
    jsonb_build_object('account_code',v_payment_account,'debit',0,'credit',v_expense.amount,'description','Expense paid')
  );

  perform public.accounting_create_journal(
    'expense',v_expense.id,v_expense.expense_date,
    'Expense '||v_expense.expense_no||' - '||v_expense.description,
    v_lines,v_expense.created_by
  );
end;
$$;

create or replace function public.accounting_post_customer_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_payment public.customer_payments%rowtype;
  v_payment_account text;
  v_lines jsonb;
begin
  select * into v_payment from public.customer_payments where id=p_payment_id;
  if not found then return; end if;
  v_payment_account:=case v_payment.payment_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Cheque' then '1030'
    else '1000'
  end;
  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code',v_payment_account,'debit',v_payment.amount,'credit',0,'description','Customer payment received'),
    jsonb_build_object('account_code','1100','debit',0,'credit',v_payment.amount,'description','Reduce accounts receivable')
  );
  perform public.accounting_create_journal(
    'customer_payment',v_payment.id,v_payment.payment_date,
    'Customer payment '||v_payment.payment_no,v_lines,v_payment.created_by
  );
end;
$$;

create or replace function public.accounting_post_supplier_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_payment public.supplier_payments%rowtype;
  v_payment_account text;
  v_lines jsonb;
begin
  select * into v_payment from public.supplier_payments where id=p_payment_id;
  if not found then return; end if;
  v_payment_account:=case v_payment.payment_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Cheque' then '1030'
    else '1000'
  end;
  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code','2000','debit',v_payment.amount,'credit',0,'description','Reduce supplier payable'),
    jsonb_build_object('account_code',v_payment_account,'debit',0,'credit',v_payment.amount,'description','Supplier payment')
  );
  perform public.accounting_create_journal(
    'supplier_payment',v_payment.id,v_payment.payment_date,
    'Supplier payment '||v_payment.payment_no,v_lines,v_payment.created_by
  );
end;
$$;

create or replace function public.accounting_post_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_return public.sales_returns%rowtype;
  v_refund_account text;
  v_lines jsonb;
  v_restock_cost numeric(14,2);
begin
  select * into v_return from public.sales_returns where id=p_return_id;
  if not found then return; end if;

  v_refund_account:=case v_return.refund_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Store Credit' then '2200'
    else '1000'
  end;

  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code','4020','debit',v_return.refund_total,'credit',0,'description','Sales refund / return'),
    jsonb_build_object('account_code',v_refund_account,'debit',0,'credit',v_return.refund_total,'description','Refund paid or store credit issued')
  );

  if v_return.restock_items then
    select round(coalesce(sum(si.unit_cost*ri.quantity),0),2)
    into v_restock_cost
    from public.sales_return_items ri
    join public.sale_items si on si.id=ri.sale_item_id
    where ri.return_id=v_return.id;

    if v_restock_cost>0 then
      v_lines:=v_lines || jsonb_build_array(
        jsonb_build_object('account_code','1200','debit',v_restock_cost,'credit',0,'description','Returned goods restocked'),
        jsonb_build_object('account_code','5000','debit',0,'credit',v_restock_cost,'description','Reverse cost of returned goods')
      );
    end if;
  end if;

  perform public.accounting_create_journal(
    'sales_return',v_return.id,(v_return.created_at at time zone 'Asia/Colombo')::date,
    'Sales return '||v_return.return_no,v_lines,v_return.created_by
  );
end;
$$;

create or replace function public.accounting_post_stock_adjustment(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_movement public.stock_movements%rowtype;
  v_value numeric(14,2);
  v_lines jsonb;
begin
  select * into v_movement from public.stock_movements where id=p_movement_id;
  if not found then return; end if;

  if v_movement.reason like 'Sale %'
     or v_movement.reason like 'Purchase received %'
     or v_movement.reason like 'Customer return %' then
    return;
  end if;

  v_value:=round(abs(v_movement.quantity_change)*v_movement.unit_cost,2);
  if v_value<=0 then return; end if;

  if v_movement.quantity_change>0 then
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code','1200','debit',v_value,'credit',0,'description','Positive stock count adjustment'),
      jsonb_build_object('account_code','4100','debit',0,'credit',v_value,'description','Inventory adjustment gain')
    );
  else
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code','5100','debit',v_value,'credit',0,'description','Stock count reduction / shrinkage'),
      jsonb_build_object('account_code','1200','debit',0,'credit',v_value,'description','Inventory adjustment reduction')
    );
  end if;

  perform public.accounting_create_journal(
    'stock_adjustment',v_movement.id,(v_movement.created_at at time zone 'Asia/Colombo')::date,
    'Stock adjustment: '||v_movement.reason,v_lines,v_movement.created_by
  );
end;
$$;

create or replace function public.accounting_post_payroll(p_payroll_run_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run public.payroll_runs%rowtype;
  v_payment_account text;
  v_lines jsonb:='[]'::jsonb;
begin
  select * into v_run from public.payroll_runs where id=p_payroll_run_id;
  if not found or v_run.status<>'Paid' then return; end if;
  if coalesce(v_run.total_gross,0)<=0 then return; end if;

  v_payment_account:=case v_run.payment_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Cheque' then '1030'
    else '1010'
  end;

  v_lines:=v_lines || jsonb_build_array(
    jsonb_build_object('account_code','5200','debit',v_run.total_gross,'credit',0,'description','Gross payroll expense')
  );
  if coalesce(v_run.total_deductions,0)>0 then
    v_lines:=v_lines || jsonb_build_array(
      jsonb_build_object('account_code','2100','debit',0,'credit',v_run.total_deductions,'description','Payroll deductions payable')
    );
  end if;
  if coalesce(v_run.total_net,0)>0 then
    v_lines:=v_lines || jsonb_build_array(
      jsonb_build_object('account_code',v_payment_account,'debit',0,'credit',v_run.total_net,'description','Net salaries paid')
    );
  end if;

  perform public.accounting_create_journal(
    'payroll',v_run.id,coalesce((v_run.paid_at at time zone 'Asia/Colombo')::date,current_date),
    'Payroll paid '||v_run.period_start||' to '||v_run.period_end,
    v_lines,v_run.created_by
  );
end;
$$;

-- Trigger wrappers. Sales, purchases and returns are deferred until transaction
-- commit so their line items have been inserted before accounting is calculated.
create or replace function public.accounting_sales_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_sale(new.id);
  return new;
end;
$$;

create or replace function public.accounting_purchase_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_purchase(new.id);
  return new;
end;
$$;

create or replace function public.accounting_expense_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_expense(new.id);
  return new;
end;
$$;

create or replace function public.accounting_customer_payment_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_customer_payment(new.id);
  return new;
end;
$$;

create or replace function public.accounting_supplier_payment_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_supplier_payment(new.id);
  return new;
end;
$$;

create or replace function public.accounting_return_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_return(new.id);
  return new;
end;
$$;

create or replace function public.accounting_stock_movement_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_stock_adjustment(new.id);
  return new;
end;
$$;

create or replace function public.accounting_payroll_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='Paid' and old.status is distinct from new.status then
    perform public.accounting_post_payroll(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists accounting_post_sales on public.sales;
create constraint trigger accounting_post_sales
after insert on public.sales
deferrable initially deferred
for each row execute function public.accounting_sales_trigger();

drop trigger if exists accounting_post_purchases on public.purchase_orders;
create constraint trigger accounting_post_purchases
after insert on public.purchase_orders
deferrable initially deferred
for each row execute function public.accounting_purchase_trigger();

drop trigger if exists accounting_post_returns on public.sales_returns;
create constraint trigger accounting_post_returns
after insert on public.sales_returns
deferrable initially deferred
for each row execute function public.accounting_return_trigger();

drop trigger if exists accounting_post_expenses on public.expenses;
create trigger accounting_post_expenses
after insert on public.expenses
for each row execute function public.accounting_expense_trigger();

drop trigger if exists accounting_post_customer_payments on public.customer_payments;
create trigger accounting_post_customer_payments
after insert on public.customer_payments
for each row execute function public.accounting_customer_payment_trigger();

drop trigger if exists accounting_post_supplier_payments on public.supplier_payments;
create trigger accounting_post_supplier_payments
after insert on public.supplier_payments
for each row execute function public.accounting_supplier_payment_trigger();

drop trigger if exists accounting_post_stock_movements on public.stock_movements;
create trigger accounting_post_stock_movements
after insert on public.stock_movements
for each row execute function public.accounting_stock_movement_trigger();

alter table public.payroll_runs
  add column if not exists payment_method text not null default 'Bank Transfer'
  check (payment_method in ('Cash','Card','Bank Transfer','Cheque'));

drop trigger if exists accounting_post_payroll_paid on public.payroll_runs;
create trigger accounting_post_payroll_paid
after update of status on public.payroll_runs
for each row
when (new.status='Paid' and old.status is distinct from new.status)
execute function public.accounting_payroll_trigger();

create or replace function public.post_manual_journal(
  p_entry_date date,
  p_description text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_entry_id uuid;
  v_entry_no text;
begin
  if auth.uid() is null or coalesce(public.current_employee_role() not in ('Admin','Manager'),true) then
    raise exception 'Only Admin or Manager can post manual journals.';
  end if;

  v_entry_id:=public.accounting_create_journal(
    'manual',null,p_entry_date,p_description,p_lines,auth.uid()
  );
  select entry_no into v_entry_no from public.journal_entries where id=v_entry_id;
  return jsonb_build_object('id',v_entry_id,'entry_no',v_entry_no);
end;
$$;

create or replace function public.accounting_inventory_opening_estimate(p_entry_date date default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_earliest date;
  v_entry_date date;
  v_stock_value numeric(14,2);
  v_purchase_value numeric(14,2);
  v_sales_cogs numeric(14,2);
  v_return_cogs numeric(14,2);
  v_adjustment_value numeric(14,2);
  v_opening_value numeric(14,2);
begin
  if auth.uid() is null or coalesce(public.current_employee_role() not in ('Admin','Manager'),true) then
    raise exception 'Only Admin or Manager can view opening inventory estimates.';
  end if;

  select min(activity_date) into v_earliest
  from (
    select (sm.created_at at time zone 'Asia/Colombo')::date as activity_date from public.stock_movements sm
    union all
    select (s.created_at at time zone 'Asia/Colombo')::date from public.sales s
    union all
    select po.purchase_date from public.purchase_orders po
    union all
    select (sr.created_at at time zone 'Asia/Colombo')::date from public.sales_returns sr
  ) activity;

  v_entry_date:=coalesce(p_entry_date,case when v_earliest is not null then v_earliest-1 else current_date end);
  if v_earliest is not null and v_entry_date>=v_earliest then
    raise exception 'Opening inventory date must be before the first inventory transaction (%).',v_earliest;
  end if;

  select round(coalesce(sum(sb.quantity*p.cost_price),0),2)
  into v_stock_value
  from public.stock_balances sb
  join public.product_variants pv on pv.id=sb.variant_id
  join public.products p on p.id=pv.product_id;

  select round(coalesce(sum(pi.line_total),0),2)
  into v_purchase_value
  from public.purchase_items pi
  join public.purchase_orders po on po.id=pi.purchase_id
  where po.purchase_date>v_entry_date;

  select round(coalesce(sum(si.unit_cost*si.quantity),0),2)
  into v_sales_cogs
  from public.sale_items si
  join public.sales s on s.id=si.sale_id
  where (s.created_at at time zone 'Asia/Colombo')::date>v_entry_date;

  select round(coalesce(sum(si.unit_cost*ri.quantity),0),2)
  into v_return_cogs
  from public.sales_return_items ri
  join public.sale_items si on si.id=ri.sale_item_id
  join public.sales_returns sr on sr.id=ri.return_id
  where sr.restock_items=true
    and (sr.created_at at time zone 'Asia/Colombo')::date>v_entry_date;

  select round(coalesce(sum(sm.quantity_change*sm.unit_cost),0),2)
  into v_adjustment_value
  from public.stock_movements sm
  where sm.reason not like 'Sale %'
    and sm.reason not like 'Purchase received %'
    and sm.reason not like 'Customer return %'
    and (sm.created_at at time zone 'Asia/Colombo')::date>v_entry_date;

  v_opening_value:=round(v_stock_value-v_purchase_value-v_adjustment_value+v_sales_cogs-v_return_cogs,2);

  return jsonb_build_object(
    'suggested_date',case when p_entry_date is null then v_entry_date else v_entry_date end,
    'earliest_activity_date',v_earliest,
    'current_inventory_value',v_stock_value,
    'purchases_since_opening',v_purchase_value,
    'stock_adjustments_since_opening',v_adjustment_value,
    'sales_cogs_since_opening',v_sales_cogs,
    'restocked_returns_cogs_since_opening',v_return_cogs,
    'opening_inventory_value',v_opening_value,
    'already_posted',exists(select 1 from public.journal_entries je where je.source_type='opening_inventory' and je.source_id is null)
  );
end;
$$;

create or replace function public.post_inventory_opening_balance(p_entry_date date default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_estimate jsonb;
  v_entry_date date;
  v_amount numeric(14,2);
  v_lines jsonb;
  v_entry_id uuid;
  v_entry_no text;
begin
  if auth.uid() is null or public.current_employee_role()<>'Admin' then
    raise exception 'Only Admin can post opening inventory balances.';
  end if;
  if exists(select 1 from public.journal_entries where source_type='opening_inventory' and source_id is null) then
    raise exception 'Opening inventory has already been posted. Use a manual journal for later corrections.';
  end if;

  v_estimate:=public.accounting_inventory_opening_estimate(p_entry_date);
  v_entry_date:=(v_estimate->>'suggested_date')::date;
  v_amount:=round((v_estimate->>'opening_inventory_value')::numeric,2);
  if v_amount=0 then
    raise exception 'The calculated opening inventory balance is zero; no journal was created.';
  end if;

  if v_amount>0 then
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code','1200','debit',v_amount,'credit',0,'description','Opening inventory at recorded cost'),
      jsonb_build_object('account_code','3100','debit',0,'credit',v_amount,'description','Opening balance equity')
    );
  else
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code','3100','debit',abs(v_amount),'credit',0,'description','Opening balance equity adjustment'),
      jsonb_build_object('account_code','1200','debit',0,'credit',abs(v_amount),'description','Opening inventory adjustment')
    );
  end if;

  v_entry_id:=public.accounting_create_journal(
    'opening_inventory',null,v_entry_date,'Opening inventory balance',v_lines,auth.uid()
  );
  select entry_no into v_entry_no from public.journal_entries where id=v_entry_id;
  return jsonb_build_object('id',v_entry_id,'entry_no',v_entry_no,'amount',v_amount,'entry_date',v_entry_date);
end;
$$;

create or replace function public.close_accounting_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or public.current_employee_role()<>'Admin' then
    raise exception 'Only Admin can close an accounting period.';
  end if;
  update public.accounting_periods
  set status='Closed',closed_by=auth.uid(),closed_at=now()
  where id=p_period_id and status='Open';
  if not found then
    raise exception 'Open accounting period not found.';
  end if;
end;
$$;

create or replace function public.prevent_accounting_period_overlap()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if exists (
    select 1 from public.accounting_periods ap
    where ap.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
      and new.period_start<=ap.period_end
      and new.period_end>=ap.period_start
  ) then
    raise exception 'Accounting periods cannot overlap.';
  end if;
  return new;
end;
$$;

drop trigger if exists accounting_period_no_overlap on public.accounting_periods;
create trigger accounting_period_no_overlap
before insert or update of period_start,period_end on public.accounting_periods
for each row execute function public.prevent_accounting_period_overlap();

-- Backfill all existing operational transactions once. Source-key uniqueness
-- makes this safe if the migration is ever carefully re-run in a restored copy.
do $$
declare r record;
begin
  for r in select id from public.sales order by created_at loop
    perform public.accounting_post_sale(r.id);
  end loop;
  for r in select id from public.purchase_orders order by purchase_date loop
    perform public.accounting_post_purchase(r.id);
  end loop;
  for r in select id from public.sales_returns order by created_at loop
    perform public.accounting_post_return(r.id);
  end loop;
  for r in select id from public.expenses order by expense_date loop
    perform public.accounting_post_expense(r.id);
  end loop;
  for r in select id from public.customer_payments order by payment_date loop
    perform public.accounting_post_customer_payment(r.id);
  end loop;
  for r in select id from public.supplier_payments order by payment_date loop
    perform public.accounting_post_supplier_payment(r.id);
  end loop;
  for r in
    select id from public.stock_movements
    where reason not like 'Sale %'
      and reason not like 'Purchase received %'
      and reason not like 'Customer return %'
    order by created_at
  loop
    perform public.accounting_post_stock_adjustment(r.id);
  end loop;
  for r in select id from public.payroll_runs where status='Paid' order by paid_at loop
    perform public.accounting_post_payroll(r.id);
  end loop;
end;
$$;

-- Only the guarded, user-facing RPCs are callable from the client. Trigger
-- helpers and SECURITY DEFINER internals are intentionally not exposed.
revoke all on function public.set_stock_movement_unit_cost() from public,anon,authenticated;
revoke all on function public.accounting_assert_open_period(date) from public,anon,authenticated;
revoke all on function public.accounting_create_journal(text,uuid,date,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_sale(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_purchase(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_expense(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_customer_payment(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_supplier_payment(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_return(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_stock_adjustment(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_payroll(uuid) from public,anon,authenticated;
revoke all on function public.accounting_sales_trigger() from public,anon,authenticated;
revoke all on function public.accounting_purchase_trigger() from public,anon,authenticated;
revoke all on function public.accounting_expense_trigger() from public,anon,authenticated;
revoke all on function public.accounting_customer_payment_trigger() from public,anon,authenticated;
revoke all on function public.accounting_supplier_payment_trigger() from public,anon,authenticated;
revoke all on function public.accounting_return_trigger() from public,anon,authenticated;
revoke all on function public.accounting_stock_movement_trigger() from public,anon,authenticated;
revoke all on function public.accounting_payroll_trigger() from public,anon,authenticated;
revoke all on function public.prevent_accounting_period_overlap() from public,anon,authenticated;
revoke all on function public.post_manual_journal(date,text,jsonb) from public,anon;
revoke all on function public.accounting_inventory_opening_estimate(date) from public,anon;
revoke all on function public.post_inventory_opening_balance(date) from public,anon;
revoke all on function public.close_accounting_period(uuid) from public,anon;

grant execute on function public.post_manual_journal(date,text,jsonb) to authenticated;
grant execute on function public.accounting_inventory_opening_estimate(date) to authenticated;
grant execute on function public.post_inventory_opening_balance(date) to authenticated;
grant execute on function public.close_accounting_period(uuid) to authenticated;
)
      and pi.variant_id=new.variant_id
    order by pi.id desc
    limit 1;
  end if;
  if new.unit_cost is null or new.unit_cost=0 then
    select p.cost_price into new.unit_cost
    from public.product_variants pv
    join public.products p on p.id=pv.product_id
    where pv.id=new.variant_id;
  end if;
  new.unit_cost:=coalesce(new.unit_cost,0);
  return new;
end;
$$;

drop trigger if exists stock_movements_set_unit_cost on public.stock_movements;
create trigger stock_movements_set_unit_cost
before insert on public.stock_movements
for each row execute function public.set_stock_movement_unit_cost();

create or replace function public.accounting_assert_open_period(p_entry_date date)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if exists (
    select 1 from public.accounting_periods ap
    where ap.status='Closed'
      and p_entry_date between ap.period_start and ap.period_end
  ) then
    raise exception 'The accounting period containing % is closed.',p_entry_date;
  end if;
end;
$$;

create or replace function public.accounting_create_journal(
  p_source_type text,
  p_source_id uuid,
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_entry_id uuid;
  v_line_count integer;
  v_inserted integer;
  v_debits numeric(14,2);
  v_credits numeric(14,2);
begin
  if p_entry_date is null or nullif(trim(coalesce(p_description,'')),'') is null then
    raise exception 'Journal date and description are required.';
  end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<2 then
    raise exception 'A journal must contain at least two lines.';
  end if;

  select
    count(*)::integer,
    round(coalesce(sum(coalesce((x->>'debit')::numeric,0)),0),2),
    round(coalesce(sum(coalesce((x->>'credit')::numeric,0)),0),2)
  into v_line_count,v_debits,v_credits
  from jsonb_array_elements(p_lines) x;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) x
    where nullif(trim(coalesce(x->>'account_code','')),'') is null
       or coalesce((x->>'debit')::numeric,0)<0
       or coalesce((x->>'credit')::numeric,0)<0
       or (coalesce((x->>'debit')::numeric,0)>0 and coalesce((x->>'credit')::numeric,0)>0)
       or (coalesce((x->>'debit')::numeric,0)=0 and coalesce((x->>'credit')::numeric,0)=0)
  ) then
    raise exception 'Each journal line needs an account and either a debit or a credit amount.';
  end if;

  if v_debits<=0 or v_debits<>v_credits then
    raise exception 'Journal is not balanced. Debits: %, credits: %.',v_debits,v_credits;
  end if;

  perform public.accounting_assert_open_period(p_entry_date);

  insert into public.journal_entries
    (entry_date,description,source_type,source_id,created_by,posted_by,status)
  values
    (p_entry_date,trim(p_description),p_source_type,p_source_id,p_created_by,p_created_by,'Posted')
  on conflict (source_type,source_id) where source_id is not null do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    return null;
  end if;

  insert into public.journal_entry_lines
    (journal_entry_id,account_id,description,debit,credit)
  select
    v_entry_id,
    a.id,
    nullif(trim(x->>'description'),''),
    coalesce((x->>'debit')::numeric,0),
    coalesce((x->>'credit')::numeric,0)
  from jsonb_array_elements(p_lines) x
  join public.chart_of_accounts a
    on a.code=x->>'account_code' and a.is_active=true;

  get diagnostics v_inserted = row_count;
  if v_inserted<>v_line_count then
    raise exception 'One or more journal lines reference an unknown or inactive account.';
  end if;

  return v_entry_id;
end;
$$;

create or replace function public.accounting_post_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sale public.sales%rowtype;
  v_payment_account text;
  v_lines jsonb;
  v_cogs numeric(14,2);
begin
  select * into v_sale from public.sales where id=p_sale_id;
  if not found then return; end if;

  v_payment_account:=case v_sale.payment_method
    when 'Credit' then '1100'
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    else '1000'
  end;

  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code',v_payment_account,'debit',v_sale.total,'credit',0,'description','Sale receipt / receivable'),
    jsonb_build_object('account_code','4000','debit',0,'credit',v_sale.subtotal,'description','Sales revenue')
  );

  if v_sale.discount>0 then
    v_lines:=v_lines || jsonb_build_array(
      jsonb_build_object('account_code','4010','debit',v_sale.discount,'credit',0,'description','Sales discount')
    );
  end if;

  select round(coalesce(sum(si.unit_cost*si.quantity),0),2)
  into v_cogs
  from public.sale_items si
  where si.sale_id=v_sale.id;

  if v_cogs>0 then
    v_lines:=v_lines || jsonb_build_array(
      jsonb_build_object('account_code','5000','debit',v_cogs,'credit',0,'description','Cost of goods sold'),
      jsonb_build_object('account_code','1200','debit',0,'credit',v_cogs,'description','Inventory issued to sale')
    );
  end if;

  perform public.accounting_create_journal(
    'sale',v_sale.id,(v_sale.created_at at time zone 'Asia/Colombo')::date,
    'Sale '||v_sale.invoice_no,v_lines,v_sale.cashier_id
  );
end;
$$;

create or replace function public.accounting_post_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_purchase public.purchase_orders%rowtype;
  v_lines jsonb;
begin
  select * into v_purchase from public.purchase_orders where id=p_purchase_id;
  if not found then return; end if;
  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code','1200','debit',v_purchase.total,'credit',0,'description','Inventory received'),
    jsonb_build_object('account_code','2000','debit',0,'credit',v_purchase.total,'description','Supplier payable')
  );
  perform public.accounting_create_journal(
    'purchase',v_purchase.id,v_purchase.purchase_date,
    'Purchase '||v_purchase.purchase_no,v_lines,v_purchase.received_by
  );
end;
$$;

create or replace function public.accounting_post_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_expense public.expenses%rowtype;
  v_expense_account text;
  v_payment_account text;
  v_lines jsonb;
begin
  select * into v_expense from public.expenses where id=p_expense_id;
  if not found or v_expense.category='Supplier Payment' then return; end if;

  v_expense_account:=case lower(coalesce(v_expense.category,''))
    when 'employee salary' then '5200'
    when 'wages' then '5200'
    when 'rent' then '5300'
    when 'electricity' then '5400'
    when 'water' then '5400'
    when 'internet & phone' then '5400'
    when 'transport' then '5500'
    when 'packaging' then '5600'
    when 'maintenance' then '5700'
    when 'marketing' then '5800'
    when 'bank charges' then '5900'
    else '5990'
  end;

  v_payment_account:=case v_expense.payment_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Cheque' then '1030'
    else '1000'
  end;

  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code',v_expense_account,'debit',v_expense.amount,'credit',0,'description',v_expense.description),
    jsonb_build_object('account_code',v_payment_account,'debit',0,'credit',v_expense.amount,'description','Expense paid')
  );

  perform public.accounting_create_journal(
    'expense',v_expense.id,v_expense.expense_date,
    'Expense '||v_expense.expense_no||' - '||v_expense.description,
    v_lines,v_expense.created_by
  );
end;
$$;

create or replace function public.accounting_post_customer_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_payment public.customer_payments%rowtype;
  v_payment_account text;
  v_lines jsonb;
begin
  select * into v_payment from public.customer_payments where id=p_payment_id;
  if not found then return; end if;
  v_payment_account:=case v_payment.payment_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Cheque' then '1030'
    else '1000'
  end;
  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code',v_payment_account,'debit',v_payment.amount,'credit',0,'description','Customer payment received'),
    jsonb_build_object('account_code','1100','debit',0,'credit',v_payment.amount,'description','Reduce accounts receivable')
  );
  perform public.accounting_create_journal(
    'customer_payment',v_payment.id,v_payment.payment_date,
    'Customer payment '||v_payment.payment_no,v_lines,v_payment.created_by
  );
end;
$$;

create or replace function public.accounting_post_supplier_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_payment public.supplier_payments%rowtype;
  v_payment_account text;
  v_lines jsonb;
begin
  select * into v_payment from public.supplier_payments where id=p_payment_id;
  if not found then return; end if;
  v_payment_account:=case v_payment.payment_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Cheque' then '1030'
    else '1000'
  end;
  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code','2000','debit',v_payment.amount,'credit',0,'description','Reduce supplier payable'),
    jsonb_build_object('account_code',v_payment_account,'debit',0,'credit',v_payment.amount,'description','Supplier payment')
  );
  perform public.accounting_create_journal(
    'supplier_payment',v_payment.id,v_payment.payment_date,
    'Supplier payment '||v_payment.payment_no,v_lines,v_payment.created_by
  );
end;
$$;

create or replace function public.accounting_post_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_return public.sales_returns%rowtype;
  v_refund_account text;
  v_lines jsonb;
  v_restock_cost numeric(14,2);
begin
  select * into v_return from public.sales_returns where id=p_return_id;
  if not found then return; end if;

  v_refund_account:=case v_return.refund_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Store Credit' then '2200'
    else '1000'
  end;

  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code','4020','debit',v_return.refund_total,'credit',0,'description','Sales refund / return'),
    jsonb_build_object('account_code',v_refund_account,'debit',0,'credit',v_return.refund_total,'description','Refund paid or store credit issued')
  );

  if v_return.restock_items then
    select round(coalesce(sum(si.unit_cost*ri.quantity),0),2)
    into v_restock_cost
    from public.sales_return_items ri
    join public.sale_items si on si.id=ri.sale_item_id
    where ri.return_id=v_return.id;

    if v_restock_cost>0 then
      v_lines:=v_lines || jsonb_build_array(
        jsonb_build_object('account_code','1200','debit',v_restock_cost,'credit',0,'description','Returned goods restocked'),
        jsonb_build_object('account_code','5000','debit',0,'credit',v_restock_cost,'description','Reverse cost of returned goods')
      );
    end if;
  end if;

  perform public.accounting_create_journal(
    'sales_return',v_return.id,(v_return.created_at at time zone 'Asia/Colombo')::date,
    'Sales return '||v_return.return_no,v_lines,v_return.created_by
  );
end;
$$;

create or replace function public.accounting_post_stock_adjustment(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_movement public.stock_movements%rowtype;
  v_value numeric(14,2);
  v_lines jsonb;
begin
  select * into v_movement from public.stock_movements where id=p_movement_id;
  if not found then return; end if;

  if v_movement.reason like 'Sale %'
     or v_movement.reason like 'Purchase received %'
     or v_movement.reason like 'Customer return %' then
    return;
  end if;

  v_value:=round(abs(v_movement.quantity_change)*v_movement.unit_cost,2);
  if v_value<=0 then return; end if;

  if v_movement.quantity_change>0 then
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code','1200','debit',v_value,'credit',0,'description','Positive stock count adjustment'),
      jsonb_build_object('account_code','4100','debit',0,'credit',v_value,'description','Inventory adjustment gain')
    );
  else
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code','5100','debit',v_value,'credit',0,'description','Stock count reduction / shrinkage'),
      jsonb_build_object('account_code','1200','debit',0,'credit',v_value,'description','Inventory adjustment reduction')
    );
  end if;

  perform public.accounting_create_journal(
    'stock_adjustment',v_movement.id,(v_movement.created_at at time zone 'Asia/Colombo')::date,
    'Stock adjustment: '||v_movement.reason,v_lines,v_movement.created_by
  );
end;
$$;

create or replace function public.accounting_post_payroll(p_payroll_run_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run public.payroll_runs%rowtype;
  v_payment_account text;
  v_lines jsonb:='[]'::jsonb;
begin
  select * into v_run from public.payroll_runs where id=p_payroll_run_id;
  if not found or v_run.status<>'Paid' then return; end if;
  if coalesce(v_run.total_gross,0)<=0 then return; end if;

  v_payment_account:=case v_run.payment_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Cheque' then '1030'
    else '1010'
  end;

  v_lines:=v_lines || jsonb_build_array(
    jsonb_build_object('account_code','5200','debit',v_run.total_gross,'credit',0,'description','Gross payroll expense')
  );
  if coalesce(v_run.total_deductions,0)>0 then
    v_lines:=v_lines || jsonb_build_array(
      jsonb_build_object('account_code','2100','debit',0,'credit',v_run.total_deductions,'description','Payroll deductions payable')
    );
  end if;
  if coalesce(v_run.total_net,0)>0 then
    v_lines:=v_lines || jsonb_build_array(
      jsonb_build_object('account_code',v_payment_account,'debit',0,'credit',v_run.total_net,'description','Net salaries paid')
    );
  end if;

  perform public.accounting_create_journal(
    'payroll',v_run.id,coalesce((v_run.paid_at at time zone 'Asia/Colombo')::date,current_date),
    'Payroll paid '||v_run.period_start||' to '||v_run.period_end,
    v_lines,v_run.created_by
  );
end;
$$;

-- Trigger wrappers. Sales, purchases and returns are deferred until transaction
-- commit so their line items have been inserted before accounting is calculated.
create or replace function public.accounting_sales_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_sale(new.id);
  return new;
end;
$$;

create or replace function public.accounting_purchase_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_purchase(new.id);
  return new;
end;
$$;

create or replace function public.accounting_expense_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_expense(new.id);
  return new;
end;
$$;

create or replace function public.accounting_customer_payment_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_customer_payment(new.id);
  return new;
end;
$$;

create or replace function public.accounting_supplier_payment_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_supplier_payment(new.id);
  return new;
end;
$$;

create or replace function public.accounting_return_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_return(new.id);
  return new;
end;
$$;

create or replace function public.accounting_stock_movement_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.accounting_post_stock_adjustment(new.id);
  return new;
end;
$$;

create or replace function public.accounting_payroll_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='Paid' and old.status is distinct from new.status then
    perform public.accounting_post_payroll(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists accounting_post_sales on public.sales;
create constraint trigger accounting_post_sales
after insert on public.sales
deferrable initially deferred
for each row execute function public.accounting_sales_trigger();

drop trigger if exists accounting_post_purchases on public.purchase_orders;
create constraint trigger accounting_post_purchases
after insert on public.purchase_orders
deferrable initially deferred
for each row execute function public.accounting_purchase_trigger();

drop trigger if exists accounting_post_returns on public.sales_returns;
create constraint trigger accounting_post_returns
after insert on public.sales_returns
deferrable initially deferred
for each row execute function public.accounting_return_trigger();

drop trigger if exists accounting_post_expenses on public.expenses;
create trigger accounting_post_expenses
after insert on public.expenses
for each row execute function public.accounting_expense_trigger();

drop trigger if exists accounting_post_customer_payments on public.customer_payments;
create trigger accounting_post_customer_payments
after insert on public.customer_payments
for each row execute function public.accounting_customer_payment_trigger();

drop trigger if exists accounting_post_supplier_payments on public.supplier_payments;
create trigger accounting_post_supplier_payments
after insert on public.supplier_payments
for each row execute function public.accounting_supplier_payment_trigger();

drop trigger if exists accounting_post_stock_movements on public.stock_movements;
create trigger accounting_post_stock_movements
after insert on public.stock_movements
for each row execute function public.accounting_stock_movement_trigger();

alter table public.payroll_runs
  add column if not exists payment_method text not null default 'Bank Transfer'
  check (payment_method in ('Cash','Card','Bank Transfer','Cheque'));

drop trigger if exists accounting_post_payroll_paid on public.payroll_runs;
create trigger accounting_post_payroll_paid
after update of status on public.payroll_runs
for each row
when (new.status='Paid' and old.status is distinct from new.status)
execute function public.accounting_payroll_trigger();

create or replace function public.post_manual_journal(
  p_entry_date date,
  p_description text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_entry_id uuid;
  v_entry_no text;
begin
  if auth.uid() is null or coalesce(public.current_employee_role() not in ('Admin','Manager'),true) then
    raise exception 'Only Admin or Manager can post manual journals.';
  end if;

  v_entry_id:=public.accounting_create_journal(
    'manual',null,p_entry_date,p_description,p_lines,auth.uid()
  );
  select entry_no into v_entry_no from public.journal_entries where id=v_entry_id;
  return jsonb_build_object('id',v_entry_id,'entry_no',v_entry_no);
end;
$$;

create or replace function public.accounting_inventory_opening_estimate(p_entry_date date default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_earliest date;
  v_entry_date date;
  v_stock_value numeric(14,2);
  v_purchase_value numeric(14,2);
  v_sales_cogs numeric(14,2);
  v_return_cogs numeric(14,2);
  v_adjustment_value numeric(14,2);
  v_opening_value numeric(14,2);
begin
  if auth.uid() is null or coalesce(public.current_employee_role() not in ('Admin','Manager'),true) then
    raise exception 'Only Admin or Manager can view opening inventory estimates.';
  end if;

  select min(activity_date) into v_earliest
  from (
    select (sm.created_at at time zone 'Asia/Colombo')::date as activity_date from public.stock_movements sm
    union all
    select (s.created_at at time zone 'Asia/Colombo')::date from public.sales s
    union all
    select po.purchase_date from public.purchase_orders po
    union all
    select (sr.created_at at time zone 'Asia/Colombo')::date from public.sales_returns sr
  ) activity;

  v_entry_date:=coalesce(p_entry_date,case when v_earliest is not null then v_earliest-1 else current_date end);
  if v_earliest is not null and v_entry_date>=v_earliest then
    raise exception 'Opening inventory date must be before the first inventory transaction (%).',v_earliest;
  end if;

  select round(coalesce(sum(sb.quantity*p.cost_price),0),2)
  into v_stock_value
  from public.stock_balances sb
  join public.product_variants pv on pv.id=sb.variant_id
  join public.products p on p.id=pv.product_id;

  select round(coalesce(sum(pi.line_total),0),2)
  into v_purchase_value
  from public.purchase_items pi
  join public.purchase_orders po on po.id=pi.purchase_id
  where po.purchase_date>v_entry_date;

  select round(coalesce(sum(si.unit_cost*si.quantity),0),2)
  into v_sales_cogs
  from public.sale_items si
  join public.sales s on s.id=si.sale_id
  where (s.created_at at time zone 'Asia/Colombo')::date>v_entry_date;

  select round(coalesce(sum(si.unit_cost*ri.quantity),0),2)
  into v_return_cogs
  from public.sales_return_items ri
  join public.sale_items si on si.id=ri.sale_item_id
  join public.sales_returns sr on sr.id=ri.return_id
  where sr.restock_items=true
    and (sr.created_at at time zone 'Asia/Colombo')::date>v_entry_date;

  select round(coalesce(sum(sm.quantity_change*sm.unit_cost),0),2)
  into v_adjustment_value
  from public.stock_movements sm
  where sm.reason not like 'Sale %'
    and sm.reason not like 'Purchase received %'
    and sm.reason not like 'Customer return %'
    and (sm.created_at at time zone 'Asia/Colombo')::date>v_entry_date;

  v_opening_value:=round(v_stock_value-v_purchase_value-v_adjustment_value+v_sales_cogs-v_return_cogs,2);

  return jsonb_build_object(
    'suggested_date',case when p_entry_date is null then v_entry_date else v_entry_date end,
    'earliest_activity_date',v_earliest,
    'current_inventory_value',v_stock_value,
    'purchases_since_opening',v_purchase_value,
    'stock_adjustments_since_opening',v_adjustment_value,
    'sales_cogs_since_opening',v_sales_cogs,
    'restocked_returns_cogs_since_opening',v_return_cogs,
    'opening_inventory_value',v_opening_value,
    'already_posted',exists(select 1 from public.journal_entries je where je.source_type='opening_inventory' and je.source_id is null)
  );
end;
$$;

create or replace function public.post_inventory_opening_balance(p_entry_date date default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_estimate jsonb;
  v_entry_date date;
  v_amount numeric(14,2);
  v_lines jsonb;
  v_entry_id uuid;
  v_entry_no text;
begin
  if auth.uid() is null or public.current_employee_role()<>'Admin' then
    raise exception 'Only Admin can post opening inventory balances.';
  end if;
  if exists(select 1 from public.journal_entries where source_type='opening_inventory' and source_id is null) then
    raise exception 'Opening inventory has already been posted. Use a manual journal for later corrections.';
  end if;

  v_estimate:=public.accounting_inventory_opening_estimate(p_entry_date);
  v_entry_date:=(v_estimate->>'suggested_date')::date;
  v_amount:=round((v_estimate->>'opening_inventory_value')::numeric,2);
  if v_amount=0 then
    raise exception 'The calculated opening inventory balance is zero; no journal was created.';
  end if;

  if v_amount>0 then
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code','1200','debit',v_amount,'credit',0,'description','Opening inventory at recorded cost'),
      jsonb_build_object('account_code','3100','debit',0,'credit',v_amount,'description','Opening balance equity')
    );
  else
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code','3100','debit',abs(v_amount),'credit',0,'description','Opening balance equity adjustment'),
      jsonb_build_object('account_code','1200','debit',0,'credit',abs(v_amount),'description','Opening inventory adjustment')
    );
  end if;

  v_entry_id:=public.accounting_create_journal(
    'opening_inventory',null,v_entry_date,'Opening inventory balance',v_lines,auth.uid()
  );
  select entry_no into v_entry_no from public.journal_entries where id=v_entry_id;
  return jsonb_build_object('id',v_entry_id,'entry_no',v_entry_no,'amount',v_amount,'entry_date',v_entry_date);
end;
$$;

create or replace function public.close_accounting_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or public.current_employee_role()<>'Admin' then
    raise exception 'Only Admin can close an accounting period.';
  end if;
  update public.accounting_periods
  set status='Closed',closed_by=auth.uid(),closed_at=now()
  where id=p_period_id and status='Open';
  if not found then
    raise exception 'Open accounting period not found.';
  end if;
end;
$$;

create or replace function public.prevent_accounting_period_overlap()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if exists (
    select 1 from public.accounting_periods ap
    where ap.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
      and new.period_start<=ap.period_end
      and new.period_end>=ap.period_start
  ) then
    raise exception 'Accounting periods cannot overlap.';
  end if;
  return new;
end;
$$;

drop trigger if exists accounting_period_no_overlap on public.accounting_periods;
create trigger accounting_period_no_overlap
before insert or update of period_start,period_end on public.accounting_periods
for each row execute function public.prevent_accounting_period_overlap();

-- Backfill all existing operational transactions once. Source-key uniqueness
-- makes this safe if the migration is ever carefully re-run in a restored copy.
do $$
declare r record;
begin
  for r in select id from public.sales order by created_at loop
    perform public.accounting_post_sale(r.id);
  end loop;
  for r in select id from public.purchase_orders order by purchase_date loop
    perform public.accounting_post_purchase(r.id);
  end loop;
  for r in select id from public.sales_returns order by created_at loop
    perform public.accounting_post_return(r.id);
  end loop;
  for r in select id from public.expenses order by expense_date loop
    perform public.accounting_post_expense(r.id);
  end loop;
  for r in select id from public.customer_payments order by payment_date loop
    perform public.accounting_post_customer_payment(r.id);
  end loop;
  for r in select id from public.supplier_payments order by payment_date loop
    perform public.accounting_post_supplier_payment(r.id);
  end loop;
  for r in
    select id from public.stock_movements
    where reason not like 'Sale %'
      and reason not like 'Purchase received %'
      and reason not like 'Customer return %'
    order by created_at
  loop
    perform public.accounting_post_stock_adjustment(r.id);
  end loop;
  for r in select id from public.payroll_runs where status='Paid' order by paid_at loop
    perform public.accounting_post_payroll(r.id);
  end loop;
end;
$$;

-- Only the guarded, user-facing RPCs are callable from the client. Trigger
-- helpers and SECURITY DEFINER internals are intentionally not exposed.
revoke all on function public.set_stock_movement_unit_cost() from public,anon,authenticated;
revoke all on function public.accounting_assert_open_period(date) from public,anon,authenticated;
revoke all on function public.accounting_create_journal(text,uuid,date,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_sale(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_purchase(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_expense(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_customer_payment(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_supplier_payment(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_return(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_stock_adjustment(uuid) from public,anon,authenticated;
revoke all on function public.accounting_post_payroll(uuid) from public,anon,authenticated;
revoke all on function public.accounting_sales_trigger() from public,anon,authenticated;
revoke all on function public.accounting_purchase_trigger() from public,anon,authenticated;
revoke all on function public.accounting_expense_trigger() from public,anon,authenticated;
revoke all on function public.accounting_customer_payment_trigger() from public,anon,authenticated;
revoke all on function public.accounting_supplier_payment_trigger() from public,anon,authenticated;
revoke all on function public.accounting_return_trigger() from public,anon,authenticated;
revoke all on function public.accounting_stock_movement_trigger() from public,anon,authenticated;
revoke all on function public.accounting_payroll_trigger() from public,anon,authenticated;
revoke all on function public.prevent_accounting_period_overlap() from public,anon,authenticated;
revoke all on function public.post_manual_journal(date,text,jsonb) from public,anon;
revoke all on function public.accounting_inventory_opening_estimate(date) from public,anon;
revoke all on function public.post_inventory_opening_balance(date) from public,anon;
revoke all on function public.close_accounting_period(uuid) from public,anon;

grant execute on function public.post_manual_journal(date,text,jsonb) to authenticated;
grant execute on function public.accounting_inventory_opening_estimate(date) to authenticated;
grant execute on function public.post_inventory_opening_balance(date) to authenticated;
grant execute on function public.close_accounting_period(uuid) to authenticated;
