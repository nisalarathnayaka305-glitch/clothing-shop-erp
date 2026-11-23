-- Keep ERP-to-Accounting auto-posting paused while POS transactions are still being tested.
-- The posting functions from 0028 remain installed, but no operational records
-- will create accounting journals until the business confirms go-live.

drop trigger if exists acct_sales_to_journal on public.sales;
drop trigger if exists acct_customer_payments_to_journal on public.customer_payments;
drop trigger if exists acct_purchases_to_journal on public.purchase_orders;
drop trigger if exists acct_supplier_payments_to_journal on public.supplier_payments;
drop trigger if exists acct_expenses_to_journal on public.expenses;
drop trigger if exists acct_sales_returns_to_journal on public.sales_returns;
drop trigger if exists acct_paid_payroll_to_journal on public.payroll_runs;

comment on function public.acct_post_erp_journal(uuid,date,text,text,uuid,jsonb)
is 'Internal ERP-to-Accounting journal poster. Auto-posting triggers are intentionally paused during ERP testing; enable only after go-live confirmation.';
