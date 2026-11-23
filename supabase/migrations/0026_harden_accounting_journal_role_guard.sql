-- Harden role checks for the standalone accounting journal RPC.
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
  if coalesce(v_role not in ('Admin','Manager'),true) then
    raise exception 'Only Admin or Manager can create accounting journals';
  end if;
  if p_entry_date is null or nullif(trim(coalesce(p_description,'')),'') is null then
    raise exception 'Journal date and description are required';
  end if;
  if p_source_type is null or p_source_type not in ('manual','opening_balance') then
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
