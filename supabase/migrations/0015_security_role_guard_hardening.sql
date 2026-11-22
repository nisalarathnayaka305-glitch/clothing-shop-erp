-- Harden role checks and restrict public RPC execution.
-- Fixes NULL role checks in security-definer functions: SQL NULL must deny access.

do $$
declare
  r record;
  v_definition text;
begin
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and position('if public.current_employee_role() not in' in pg_get_functiondef(p.oid)) > 0
  loop
    v_definition := regexp_replace(
      r.definition,
      'if public\.current_employee_role\(\) not in \(([^)]*)\) then',
      'if coalesce(public.current_employee_role() not in (\1), true) then',
      'g'
    );
    if v_definition = r.definition then
      raise exception 'Could not harden nullable role guard in function %', r.proname;
    end if;
    execute v_definition;
  end loop;
end;
$$;

-- No anonymous client should be able to invoke any public-schema function.
-- Authenticated application RPCs are granted explicitly below.
revoke execute on all functions in schema public from public, anon;

grant execute on function public.current_employee_role() to authenticated;
grant execute on function public.adjust_stock(uuid, integer, text) to authenticated;
grant execute on function public.complete_sale(jsonb, numeric, text, numeric) to authenticated;
grant execute on function public.complete_sale_for_customer(jsonb, numeric, text, numeric, uuid) to authenticated;
grant execute on function public.complete_credit_sale(jsonb, numeric, uuid, numeric, text, date, text) to authenticated;
grant execute on function public.record_customer_payment(uuid, numeric, text, date, text, text) to authenticated;
grant execute on function public.process_sales_return(uuid, jsonb, text, boolean, text) to authenticated;
grant execute on function public.receive_purchase(uuid, text, date, jsonb) to authenticated;
grant execute on function public.employee_check_in(date) to authenticated;
grant execute on function public.employee_check_out(date) to authenticated;
grant execute on function public.manager_check_in(uuid, date) to authenticated;
grant execute on function public.manager_check_out(uuid) to authenticated;
grant execute on function public.record_supplier_payment(uuid, numeric, text, date, text, text) to authenticated;

-- Future public-schema functions do not inherit PUBLIC execution by default.
alter default privileges in schema public revoke execute on functions from public;
