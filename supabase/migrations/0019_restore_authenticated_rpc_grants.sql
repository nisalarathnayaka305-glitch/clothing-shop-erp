-- Restore authenticated grants for existing ERP RPCs after migration 0018.
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
grant execute on function public.open_cash_session(numeric,text) to authenticated;
grant execute on function public.record_cash_session_entry(uuid,text,numeric,text) to authenticated;
grant execute on function public.close_cash_session(uuid,numeric,text) to authenticated;
grant execute on function public.submit_purchase_request(uuid) to authenticated;
grant execute on function public.approve_purchase_request(uuid) to authenticated;
