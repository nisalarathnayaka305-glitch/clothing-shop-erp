-- Remove the Accounting workspace and its database objects.
-- Keep all operational ERP data and modules (sales, inventory, customers,
-- loyalty, cash management, purchases, suppliers, expenses, employees,
-- attendance and payroll) intact.
--
-- The stock_movements.unit_cost snapshot and its helper trigger are retained
-- because they preserve useful inventory-cost history for a future integration.
-- payroll_runs.payment_method is also retained.

begin;

set local lock_timeout = '5s';

-- Stop automatic journal creation before removing its functions.
drop trigger if exists accounting_post_sales on public.sales;
drop trigger if exists accounting_post_purchases on public.purchase_orders;
drop trigger if exists accounting_post_returns on public.sales_returns;
drop trigger if exists accounting_post_expenses on public.expenses;
drop trigger if exists accounting_post_customer_payments on public.customer_payments;
drop trigger if exists accounting_post_supplier_payments on public.supplier_payments;
drop trigger if exists accounting_post_stock_movements on public.stock_movements;
drop trigger if exists accounting_post_payroll_paid on public.payroll_runs;
drop trigger if exists accounting_period_no_overlap on public.accounting_periods;

-- Remove Accounting RPCs and trigger functions only.
drop function if exists public.accounting_sales_trigger();
drop function if exists public.accounting_purchase_trigger();
drop function if exists public.accounting_expense_trigger();
drop function if exists public.accounting_customer_payment_trigger();
drop function if exists public.accounting_supplier_payment_trigger();
drop function if exists public.accounting_return_trigger();
drop function if exists public.accounting_stock_movement_trigger();
drop function if exists public.accounting_payroll_trigger();

drop function if exists public.accounting_post_sale(uuid);
drop function if exists public.accounting_post_purchase(uuid);
drop function if exists public.accounting_post_expense(uuid);
drop function if exists public.accounting_post_customer_payment(uuid);
drop function if exists public.accounting_post_supplier_payment(uuid);
drop function if exists public.accounting_post_return(uuid);
drop function if exists public.accounting_post_stock_adjustment(uuid);
drop function if exists public.accounting_post_payroll(uuid);
drop function if exists public.accounting_create_journal(text, uuid, date, text, jsonb, uuid);
drop function if exists public.accounting_assert_open_period(date);
drop function if exists public.accounting_inventory_opening_estimate(date);
drop function if exists public.post_inventory_opening_balance(date);
drop function if exists public.post_manual_journal(date, text, jsonb);
drop function if exists public.close_accounting_period(uuid);
drop function if exists public.prevent_accounting_period_overlap();

-- Remove Accounting-only tables and journal data. No operational ERP tables
-- or their records are dropped or truncated.
drop table if exists public.journal_entry_lines;
drop table if exists public.journal_entries;
drop table if exists public.accounting_periods;
drop table if exists public.chart_of_accounts;
drop sequence if exists public.accounting_entry_no_seq;

commit;
