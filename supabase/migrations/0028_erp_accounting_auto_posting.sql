-- Automatically post future ERP operational transactions into standalone Accounting.
-- Existing transactions are intentionally NOT backfilled. This keeps the six
-- pre-existing POS test invoices out of the accounting ledger.
--
-- Source idempotency is enforced by acct_journal_source_unique
-- (source_type, source_id) WHERE source_id IS NOT NULL.

create or replace function public.acct_post_erp_journal(
  p_source_id uuid,
  p_entry_date date,
  p_description text,
  p_reference text,
  p_actor_id uuid,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_line jsonb;
  v_account_id uuid;
  v_debit numeric(14,2);
  v_credit numeric(14,2);
  v_debits numeric(14,2) := 0;
  v_credits numeric(14,2) := 0;
  v_line_no integer := 0;
  v_entry_id uuid;
  v_entry_no text;
begin
  if p_source_id is null or p_entry_date is null then
    raise exception 'ERP source id and accounting date are required';
  end if;
  if nullif(trim(coalesce(p_description,'')),'') is null then
    raise exception 'ERP journal description is required';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'ERP journal requires at least two lines';
  end if;

  select id into v_entry_id
  from public.acct_journal_entries
  where source_type='erp_sync' and source_id=p_source_id;
  if found then
    return v_entry_id;
  end if;

  if exists (
    select 1 from public.acct_fiscal_periods p
    where p.status='Closed' and p_entry_date between p.period_start and p.period_end
  ) then
    raise exception 'The accounting period for % is closed; reopen it before processing this ERP transaction',p_entry_date;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no := v_line_no + 1;
    select a.id into v_account_id
    from public.acct_accounts a
    where a.code = v_line->>'code' and a.is_active=true;
    if not found then
      raise exception 'Required accounting account % is missing or inactive',v_line->>'code';
    end if;

    v_debit := round(coalesce(nullif(v_line->>'debit','')::numeric,0),2);
    v_credit := round(coalesce(nullif(v_line->>'credit','')::numeric,0),2);
    if v_debit < 0 or v_credit < 0
       or (v_debit > 0 and v_credit > 0)
       or (v_debit = 0 and v_credit = 0) then
      raise exception 'Invalid ERP journal line for account %',v_line->>'code';
    end if;
    v_debits := v_debits + v_debit;
    v_credits := v_credits + v_credit;
  end loop;

  if v_line_no < 2 or v_debits <= 0 or round(v_debits,2) <> round(v_credits,2) then
    raise exception 'ERP journal is not balanced. Debits: %, credits: %',v_debits,v_credits;
  end if;

  v_entry_no := 'JRN-'||to_char(p_entry_date,'YYYYMMDD')||'-'||lpad(nextval('public.acct_journal_entry_seq')::text,6,'0');
  insert into public.acct_journal_entries(
    entry_no,entry_date,description,reference,source_type,source_id,created_by,posted_by
  )
  values (
    v_entry_no,p_entry_date,trim(p_description),nullif(trim(coalesce(p_reference,'')),''),
    'erp_sync',p_source_id,p_actor_id,p_actor_id
  )
  on conflict (source_type,source_id) where source_id is not null do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    select id into v_entry_id
    from public.acct_journal_entries
    where source_type='erp_sync' and source_id=p_source_id;
    return v_entry_id;
  end if;

  v_line_no := 0;
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no := v_line_no + 1;
    select a.id into v_account_id
    from public.acct_accounts a
    where a.code = v_line->>'code' and a.is_active=true;
    insert into public.acct_journal_lines(
      journal_entry_id,account_id,line_no,memo,debit,credit
    )
    values (
      v_entry_id,v_account_id,v_line_no,
      nullif(trim(coalesce(v_line->>'memo','')),''),
      round(coalesce(nullif(v_line->>'debit','')::numeric,0),2),
      round(coalesce(nullif(v_line->>'credit','')::numeric,0),2)
    );
  end loop;

  return v_entry_id;
end;
$function$;

revoke all on function public.acct_post_erp_journal(uuid,date,text,text,uuid,jsonb) from public,anon,authenticated;

-- POS sales are deferred until the transaction commits so all sale_items exist.
create or replace function public.acct_sync_sale_to_journal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lines jsonb := '[]'::jsonb;
  v_cash_account text;
  v_cogs numeric(14,2);
  v_entry_date date;
begin
  if exists (
    select 1 from public.acct_journal_entries
    where source_type='erp_sync' and source_id=new.id
  ) then
    return new;
  end if;

  v_entry_date := (new.created_at at time zone 'Asia/Colombo')::date;
  if new.payment_method='Credit' then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'code','1100','debit',new.total,'credit',0,'memo','Customer receivable'
    ));
  else
    v_cash_account := case new.payment_method
      when 'Cash' then '1000'
      when 'Card' then '1020'
      when 'Bank Transfer' then '1010'
      else null
    end;
    if v_cash_account is null then
      raise exception 'Unsupported POS payment method: %',new.payment_method;
    end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'code',v_cash_account,'debit',new.total,'credit',0,'memo','POS receipt'
    ));
  end if;

  if new.discount > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'code','4010','debit',new.discount,'credit',0,'memo','Sales discount'
    ));
  end if;
  if new.subtotal > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'code','4000','debit',0,'credit',new.subtotal,'memo','Sales revenue'
    ));
  end if;

  select round(coalesce(sum(si.quantity*si.unit_cost),0),2)
  into v_cogs
  from public.sale_items si
  where si.sale_id=new.id;

  if v_cogs > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('code','5000','debit',v_cogs,'credit',0,'memo','Cost of goods sold'),
      jsonb_build_object('code','1200','debit',0,'credit',v_cogs,'memo','Inventory issued')
    );
  end if;

  perform public.acct_post_erp_journal(
    new.id,v_entry_date,'POS sale '||new.invoice_no,new.invoice_no,new.cashier_id,v_lines
  );
  return new;
end;
$function$;

drop trigger if exists acct_sales_to_journal on public.sales;
create constraint trigger acct_sales_to_journal
after insert on public.sales
deferrable initially deferred
for each row execute function public.acct_sync_sale_to_journal();

-- Customer credit collections reduce Accounts Receivable.
create or replace function public.acct_sync_customer_payment_to_journal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cash_account text;
  v_invoice_no text;
begin
  v_cash_account := case new.payment_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Cheque' then '1030'
    else null
  end;
  if v_cash_account is null then
    raise exception 'Unsupported customer payment method: %',new.payment_method;
  end if;
  select invoice_no into v_invoice_no from public.sales where id=new.sale_id;

  perform public.acct_post_erp_journal(
    new.id,new.payment_date,'Customer payment '||new.payment_no,
    coalesce(new.payment_no,v_invoice_no),new.created_by,
    jsonb_build_array(
      jsonb_build_object('code',v_cash_account,'debit',new.amount,'credit',0,'memo','Customer collection'),
      jsonb_build_object('code','1100','debit',0,'credit',new.amount,'memo','Reduce receivable')
    )
  );
  return new;
end;
$function$;

drop trigger if exists acct_customer_payments_to_journal on public.customer_payments;
create trigger acct_customer_payments_to_journal
after insert on public.customer_payments
for each row execute function public.acct_sync_customer_payment_to_journal();

-- Received purchases are deferred until all purchase_items have been inserted.
create or replace function public.acct_sync_purchase_to_journal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item_total numeric(14,2);
begin
  select round(coalesce(sum(pi.line_total),0),2)
  into v_item_total
  from public.purchase_items pi
  where pi.purchase_id=new.id;

  if v_item_total <= 0 then
    return new;
  end if;
  if round(new.total,2) <> v_item_total then
    raise exception 'Purchase % header total does not match its item total',new.purchase_no;
  end if;

  perform public.acct_post_erp_journal(
    new.id,new.purchase_date,'Stock purchase '||new.purchase_no,
    coalesce(new.supplier_reference,new.purchase_no),new.received_by,
    jsonb_build_array(
      jsonb_build_object('code','1200','debit',v_item_total,'credit',0,'memo','Inventory received'),
      jsonb_build_object('code','2000','debit',0,'credit',v_item_total,'memo','Supplier payable')
    )
  );
  return new;
end;
$function$;

drop trigger if exists acct_purchases_to_journal on public.purchase_orders;
create constraint trigger acct_purchases_to_journal
after insert on public.purchase_orders
deferrable initially deferred
for each row execute function public.acct_sync_purchase_to_journal();

-- Supplier payments reduce Accounts Payable. The matching expense-register row
-- is intentionally excluded from expense posting to prevent double counting.
create or replace function public.acct_sync_supplier_payment_to_journal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cash_account text;
begin
  v_cash_account := case new.payment_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Cheque' then '1030'
    else null
  end;
  if v_cash_account is null then
    raise exception 'Unsupported supplier payment method: %',new.payment_method;
  end if;

  perform public.acct_post_erp_journal(
    new.id,new.payment_date,'Supplier payment '||new.payment_no,
    new.payment_no,new.created_by,
    jsonb_build_array(
      jsonb_build_object('code','2000','debit',new.amount,'credit',0,'memo','Reduce supplier payable'),
      jsonb_build_object('code',v_cash_account,'debit',0,'credit',new.amount,'memo','Supplier payment')
    )
  );
  return new;
end;
$function$;

drop trigger if exists acct_supplier_payments_to_journal on public.supplier_payments;
create trigger acct_supplier_payments_to_journal
after insert on public.supplier_payments
for each row execute function public.acct_sync_supplier_payment_to_journal();

-- Direct operating expenses are posted by category. Supplier payments are
-- already posted from supplier_payments and are deliberately skipped here.
create or replace function public.acct_sync_expense_to_journal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_expense_account text;
  v_cash_account text;
begin
  if new.category='Supplier Payment' then
    return new;
  end if;

  v_expense_account := case new.category
    when 'Employee Salary' then '6000'
    when 'Wages' then '6000'
    when 'Rent' then '6100'
    when 'Electricity' then '6200'
    when 'Water' then '6200'
    when 'Internet & Phone' then '6400'
    when 'Transport' then '6300'
    when 'Maintenance' then '6500'
    when 'Bank Charges' then '6600'
    else '6900'
  end;
  v_cash_account := case new.payment_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Cheque' then '1030'
    else null
  end;
  if v_cash_account is null then
    raise exception 'Unsupported expense payment method: %',new.payment_method;
  end if;

  perform public.acct_post_erp_journal(
    new.id,new.expense_date,'Expense '||new.expense_no||' - '||new.category,
    coalesce(new.reference_no,new.expense_no),new.created_by,
    jsonb_build_array(
      jsonb_build_object('code',v_expense_account,'debit',new.amount,'credit',0,'memo',new.description),
      jsonb_build_object('code',v_cash_account,'debit',0,'credit',new.amount,'memo','Expense payment')
    )
  );
  return new;
end;
$function$;

drop trigger if exists acct_expenses_to_journal on public.expenses;
create trigger acct_expenses_to_journal
after insert on public.expenses
for each row execute function public.acct_sync_expense_to_journal();

-- Sales returns reverse revenue and, only when items are restocked, reverse COGS.
create or replace function public.acct_sync_sales_return_to_journal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lines jsonb := '[]'::jsonb;
  v_refund_account text;
  v_restock_cost numeric(14,2) := 0;
  v_sale_invoice text;
  v_entry_date date;
begin
  v_refund_account := case new.refund_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Store Credit' then '2100'
    else null
  end;
  if v_refund_account is null then
    raise exception 'Unsupported sales refund method: %',new.refund_method;
  end if;

  select invoice_no into v_sale_invoice from public.sales where id=new.sale_id;
  v_entry_date := (new.created_at at time zone 'Asia/Colombo')::date;

  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'code','4010','debit',new.refund_total,'credit',0,'memo','Sales return / refund'
  ));
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'code',v_refund_account,'debit',0,'credit',new.refund_total,'memo','Refund issued'
  ));

  if new.restock_items then
    select round(coalesce(sum(ri.quantity*si.unit_cost),0),2)
    into v_restock_cost
    from public.sales_return_items ri
    join public.sale_items si on si.id=ri.sale_item_id
    where ri.return_id=new.id;
    if v_restock_cost > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('code','1200','debit',v_restock_cost,'credit',0,'memo','Returned goods restocked'),
        jsonb_build_object('code','5000','debit',0,'credit',v_restock_cost,'memo','Reverse cost of goods sold')
      );
    end if;
  end if;

  perform public.acct_post_erp_journal(
    new.id,v_entry_date,'Sales return '||new.return_no,
    coalesce(v_sale_invoice,new.return_no),new.created_by,v_lines
  );
  return new;
end;
$function$;

drop trigger if exists acct_sales_returns_to_journal on public.sales_returns;
create constraint trigger acct_sales_returns_to_journal
after insert on public.sales_returns
deferrable initially deferred
for each row execute function public.acct_sync_sales_return_to_journal();

-- Payroll is recognized only when the ERP run is explicitly marked Paid.
create or replace function public.acct_sync_paid_payroll_to_journal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cash_account text;
  v_lines jsonb := '[]'::jsonb;
begin
  if old.status='Paid' or new.status<>'Paid' then
    return new;
  end if;
  if new.total_gross <= 0 or new.total_net <= 0 then
    raise exception 'Paid payroll must have positive gross and net pay';
  end if;

  v_cash_account := case new.payment_method
    when 'Cash' then '1000'
    when 'Card' then '1020'
    when 'Bank Transfer' then '1010'
    when 'Cheque' then '1030'
    else null
  end;
  if v_cash_account is null then
    raise exception 'Unsupported payroll payment method: %',new.payment_method;
  end if;

  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'code','6000','debit',new.total_gross,'credit',0,'memo','Gross payroll expense'
  ));
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'code',v_cash_account,'debit',0,'credit',new.total_net,'memo','Net salaries paid'
  ));
  if new.total_deductions > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'code','2300','debit',0,'credit',new.total_deductions,'memo','Payroll deductions payable'
    ));
  end if;

  perform public.acct_post_erp_journal(
    new.id,new.period_end,'Payroll paid '||to_char(new.period_start,'YYYY-MM-DD')||' to '||to_char(new.period_end,'YYYY-MM-DD'),
    'PAYROLL-'||new.id::text,new.created_by,v_lines
  );
  return new;
end;
$function$;

drop trigger if exists acct_paid_payroll_to_journal on public.payroll_runs;
create trigger acct_paid_payroll_to_journal
after update of status on public.payroll_runs
for each row
when (old.status is distinct from new.status and new.status='Paid')
execute function public.acct_sync_paid_payroll_to_journal();

-- Trigger functions are callable only by PostgreSQL trigger execution.
revoke all on function public.acct_sync_sale_to_journal() from public,anon,authenticated;
revoke all on function public.acct_sync_customer_payment_to_journal() from public,anon,authenticated;
revoke all on function public.acct_sync_purchase_to_journal() from public,anon,authenticated;
revoke all on function public.acct_sync_supplier_payment_to_journal() from public,anon,authenticated;
revoke all on function public.acct_sync_expense_to_journal() from public,anon,authenticated;
revoke all on function public.acct_sync_sales_return_to_journal() from public,anon,authenticated;
revoke all on function public.acct_sync_paid_payroll_to_journal() from public,anon,authenticated;
