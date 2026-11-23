-- 0032_complete_remaining_foreign_key_indexes
create index if not exists cash_session_entries_created_by_idx on public.cash_session_entries(created_by);
create index if not exists company_settings_updated_by_idx on public.company_settings(updated_by);
create index if not exists customer_loyalty_ledger_created_by_idx on public.customer_loyalty_ledger(created_by);
create index if not exists purchase_request_items_variant_id_idx on public.purchase_request_items(variant_id);
create index if not exists purchase_requests_approved_by_idx on public.purchase_requests(approved_by);
create index if not exists purchase_requests_created_by_idx on public.purchase_requests(created_by);
create index if not exists purchase_requests_supplier_id_idx on public.purchase_requests(supplier_id);
