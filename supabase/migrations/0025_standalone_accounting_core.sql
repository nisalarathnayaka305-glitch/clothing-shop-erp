-- Standalone Accounting app foundation. Operational ERP tables are not altered.
create sequence if not exists public.acct_journal_entry_seq start with 1;

create table if not exists public.acct_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  account_type text not null check (account_type in
    ('Asset','Liability','Equity','Revenue','Contra Revenue','Cost of Sales','Expense','Other Income','Other Expense')),
  normal_balance text not null check (normal_balance in ('debit','credit')),
  parent_id uuid references public.acct_accounts(id) on delete restrict,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.acct_fiscal_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  period_start date not null,
  period_end date not null,
  status text not null default 'Open' check (status in ('Open','Closed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  check (period_end >= period_start)
);

create table if not exists public.acct_journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text not null unique,
  entry_date date not null,
  description text not null,
  reference text,
  source_type text not null default 'manual' check (source_type in ('manual','opening_balance','erp_sync')),
  source_id uuid,
  status text not null default 'Posted' check (status in ('Posted','Reversed')),
  created_by uuid references auth.users(id),
  posted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  posted_at timestamptz not null default now()
);

create unique index if not exists acct_journal_source_unique
  on public.acct_journal_entries(source_type,source_id)
  where source_id is not null;
create index if not exists acct_journal_date_idx
  on public.acct_journal_entries(entry_date desc,entry_no);
create index if not exists acct_journal_status_date_idx
  on public.acct_journal_entries(status,entry_date);

create table if not exists public.acct_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.acct_journal_entries(id) on delete restrict,
  account_id uuid not null references public.acct_accounts(id) on delete restrict,
  line_no integer not null,
  memo text,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0)),
  unique (journal_entry_id,line_no)
);
create index if not exists acct_journal_lines_entry_idx
  on public.acct_journal_lines(journal_entry_id,line_no);
create index if not exists acct_journal_lines_account_idx
  on public.acct_journal_lines(account_id,journal_entry_id);

alter table public.acct_accounts enable row level security;
alter table public.acct_fiscal_periods enable row level security;
alter table public.acct_journal_entries enable row level security;
alter table public.acct_journal_lines enable row level security;

drop policy if exists "Accounting managers read accounts" on public.acct_accounts;
create policy "Accounting managers read accounts"
on public.acct_accounts for select to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'));

drop policy if exists "Accounting admins insert accounts" on public.acct_accounts;
create policy "Accounting admins insert accounts"
on public.acct_accounts for insert to authenticated
with check ((select public.current_employee_role())='Admin');

drop policy if exists "Accounting admins update accounts" on public.acct_accounts;
create policy "Accounting admins update accounts"
on public.acct_accounts for update to authenticated
using ((select public.current_employee_role())='Admin')
with check ((select public.current_employee_role())='Admin');

drop policy if exists "Accounting managers read fiscal periods" on public.acct_fiscal_periods;
create policy "Accounting managers read fiscal periods"
on public.acct_fiscal_periods for select to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'));

drop policy if exists "Accounting admins manage fiscal periods" on public.acct_fiscal_periods;
create policy "Accounting admins manage fiscal periods"
on public.acct_fiscal_periods for all to authenticated
using ((select public.current_employee_role())='Admin')
with check ((select public.current_employee_role())='Admin');

drop policy if exists "Accounting managers read journal entries" on public.acct_journal_entries;
create policy "Accounting managers read journal entries"
on public.acct_journal_entries for select to authenticated
using ((select public.current_employee_role()) in ('Admin','Manager'));

drop policy if exists "Accounting managers read journal lines" on public.acct_journal_lines;
create policy "Accounting managers read journal lines"
on public.acct_journal_lines for select to authenticated
using (
  exists (
    select 1 from public.acct_journal_entries e
    where e.id=journal_entry_id
      and (select public.current_employee_role()) in ('Admin','Manager')
  )
);

revoke all on public.acct_accounts,public.acct_fiscal_periods,public.acct_journal_entries,public.acct_journal_lines from anon,authenticated;
grant select on public.acct_accounts,public.acct_fiscal_periods,public.acct_journal_entries,public.acct_journal_lines to authenticated;
grant insert,update on public.acct_accounts to authenticated;
grant select,insert,update on public.acct_fiscal_periods to authenticated;

insert into public.acct_accounts(code,name,account_type,normal_balance,is_system,description) values
 ('1000','Cash on Hand','Asset','debit',true,'Physical cash held by the business.'),
 ('1010','Bank Account','Asset','debit',true,'Business bank balances.'),
 ('1020','Card Settlement Clearing','Asset','debit',true,'Card receipts awaiting settlement.'),
 ('1030','Cheques in Hand','Asset','debit',true,'Customer cheques awaiting clearance.'),
 ('1100','Accounts Receivable','Asset','debit',true,'Outstanding customer invoices.'),
 ('1200','Inventory','Asset','debit',true,'Stock held for resale at cost.'),
 ('1300','Prepaid Expenses','Asset','debit',true,'Payments made in advance.'),
 ('1500','Equipment and Fixtures','Asset','debit',true,'Long-term shop equipment and fixtures.'),
 ('1590','Accumulated Depreciation','Asset','credit',true,'Accumulated depreciation of fixed assets.'),
 ('2000','Accounts Payable','Liability','credit',true,'Outstanding supplier balances.'),
 ('2100','Customer Store Credit','Liability','credit',true,'Store credit owed to customers.'),
 ('2200','Salaries Payable','Liability','credit',true,'Unpaid employee salaries.'),
 ('2300','Taxes Payable','Liability','credit',true,'Taxes payable to authorities.'),
 ('3000','Owner Capital','Equity','credit',true,'Owner contributions.'),
 ('3100','Retained Earnings','Equity','credit',true,'Accumulated profits from prior periods.'),
 ('3200','Owner Drawings','Equity','debit',true,'Amounts withdrawn by the owner.'),
 ('4000','Sales Revenue','Revenue','credit',true,'Revenue from product sales.'),
 ('4010','Sales Discounts and Returns','Contra Revenue','debit',true,'Sales discounts and returns.'),
 ('5000','Cost of Goods Sold','Cost of Sales','debit',true,'Cost of inventory sold.'),
 ('6000','Salaries and Wages','Expense','debit',true,'Employee salary and wage costs.'),
 ('6100','Rent Expense','Expense','debit',true,'Shop rent and premises costs.'),
 ('6200','Utilities Expense','Expense','debit',true,'Electricity and water costs.'),
 ('6300','Transport Expense','Expense','debit',true,'Transport and delivery costs.'),
 ('6400','Internet and Phone','Expense','debit',true,'Internet and telephone costs.'),
 ('6500','Repairs and Maintenance','Expense','debit',true,'Repairs and maintenance.'),
 ('6600','Bank Charges','Expense','debit',true,'Bank and payment processing charges.'),
 ('6900','Other Operating Expenses','Expense','debit',true,'Other operating expenses.'),
 ('7000','Other Income','Other Income','credit',true,'Income outside normal sales.')
on conflict(code) do nothing;

insert into public.acct_fiscal_periods(name,period_start,period_end,status)
values (
  'FY '||extract(year from (now() at time zone 'Asia/Colombo'))::integer,
  make_date(extract(year from (now() at time zone 'Asia/Colombo'))::integer,1,1),
  make_date(extract(year from (now() at time zone 'Asia/Colombo'))::integer,12,31),
  'Open'
)
on conflict(name) do nothing;

create or replace function public.acct_create_journal_entry(
  p_entry_date date,
  p_description text,
  p_reference text,
  p_lines jsonb,
  p_source_type text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_line jsonb;
  v_account_id uuid;
  v_debit numeric(14,2);
  v_credit numeric(14,2);
  v_debits numeric(14,2):=0;
  v_credits numeric(14,2):=0;
  v_count integer:=0;
  v_entry_id uuid;
  v_entry_no text;
  v_line_no integer:=0;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  v_role := public.current_employee_role();
  if v_role not in ('Admin','Manager') then
    raise exception 'Only Admin or Manager can create accounting journals';
  end if;
  if p_entry_date is null or nullif(trim(coalesce(p_description,'')),'') is null then
    raise exception 'Journal date and description are required';
  end if;
  if p_source_type not in ('manual','opening_balance') then
    raise exception 'Unsupported journal source type';
  end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<2 then
    raise exception 'A journal must contain at least two lines';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_count:=v_count+1;
    v_account_id:=nullif(v_line->>'account_id','')::uuid;
    v_debit:=coalesce(nullif(v_line->>'debit','')::numeric,0);
    v_credit:=coalesce(nullif(v_line->>'credit','')::numeric,0);
    if v_account_id is null or v_debit<0 or v_credit<0
       or (v_debit>0 and v_credit>0)
       or (v_debit=0 and v_credit=0)
       or v_debit<>round(v_debit,2) or v_credit<>round(v_credit,2) then
      raise exception 'Each journal line needs a valid account and either a debit or a credit amount';
    end if;
    if not exists(select 1 from public.acct_accounts a where a.id=v_account_id and a.is_active=true) then
      raise exception 'One or more accounts are missing or inactive';
    end if;
    v_debits:=v_debits+v_debit;
    v_credits:=v_credits+v_credit;
  end loop;

  if v_count<2 or v_debits<=0 or round(v_debits,2)<>round(v_credits,2) then
    raise exception 'Journal is not balanced. Debits: %, credits: %',v_debits,v_credits;
  end if;

  if exists (
    select 1 from public.acct_fiscal_periods p
    where p.status='Closed' and p_entry_date between p.period_start and p.period_end
  ) then
    raise exception 'The accounting period containing this date is closed';
  end if;

  v_entry_no:='JRN-'||to_char(p_entry_date,'YYYYMMDD')||'-'||lpad(nextval('public.acct_journal_entry_seq')::text,6,'0');
  insert into public.acct_journal_entries(entry_no,entry_date,description,reference,source_type,created_by,posted_by)
  values(v_entry_no,p_entry_date,trim(p_description),nullif(trim(coalesce(p_reference,'')),''),p_source_type,auth.uid(),auth.uid())
  returning id into v_entry_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no:=v_line_no+1;
    insert into public.acct_journal_lines(journal_entry_id,account_id,line_no,memo,debit,credit)
    values(
      v_entry_id,
      (v_line->>'account_id')::uuid,
      v_line_no,
      nullif(trim(coalesce(v_line->>'memo','')),''),
      coalesce(nullif(v_line->>'debit','')::numeric,0),
      coalesce(nullif(v_line->>'credit','')::numeric,0)
    );
  end loop;

  return v_entry_id;
end;
$function$;

revoke all on function public.acct_create_journal_entry(date,text,text,jsonb,text) from public,anon;
grant execute on function public.acct_create_journal_entry(date,text,text,jsonb,text) to authenticated;
