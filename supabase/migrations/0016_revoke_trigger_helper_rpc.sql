-- Remove direct RPC access to trigger-only and event-trigger helper functions.
-- Triggers continue to execute these functions automatically.
revoke execute on function public.assign_expense_number() from authenticated;
revoke execute on function public.prevent_overlapping_payroll_runs() from authenticated;
revoke execute on function public.set_attendance_updated_at() from authenticated;
revoke execute on function public.set_employee_updated_at() from authenticated;
revoke execute on function public.rls_auto_enable() from authenticated;
