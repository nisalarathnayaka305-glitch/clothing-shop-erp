-- Enable ERP -> Accounting auto-posting after successful rollback-only integration validation.
-- This affects new operational transactions only. Existing POS invoices are not backfilled.

create constraint trigger acct_sales_to_journal
after insert on public.sales
deferrable initially deferred
for each row execute function public.acct_sync_sale_to_journal();

create trigger acct_customer_payments_to_journal
after insert on public.customer_payments
for each row execute function public.acct_sync_customer_payment_to_journal();

create constraint trigger acct_purchases_to_journal
after insert on public.purchase_orders
deferrable initially deferred
for each row execute function public.acct_sync_purchase_to_journal();

create trigger acct_supplier_payments_to_journal
after insert on public.supplier_payments
for each row execute function public.acct_sync_supplier_payment_to_journal();

create trigger acct_expenses_to_journal
after insert on public.expenses
for each row execute function public.acct_sync_expense_to_journal();

create constraint trigger acct_sales_returns_to_journal
after insert on public.sales_returns
deferrable initially deferred
for each row execute function public.acct_sync_sales_return_to_journal();

create trigger acct_paid_payroll_to_journal
after update of status on public.payroll_runs
for each row
when (old.status is distinct from new.status and new.status='Paid')
execute function public.acct_sync_paid_payroll_to_journal();

comment on function public.acct_post_erp_journal(uuid,date,text,text,uuid,jsonb)
is 'Internal ERP-to-Accounting journal poster. Auto-posting enabled for new ERP transactions; historical transactions are not backfilled.';
