-- Retail ERP: allow signed-in staff to manage core shop records.
-- This first version gives authenticated staff full access; role-based permissions
-- (admin / manager / cashier) should be introduced before adding more staff roles.

drop policy if exists "Authenticated users can read products" on public.products;
drop policy if exists "Authenticated users can manage products" on public.products;
create policy "Authenticated users can manage products"
on public.products for all to authenticated
using (true) with check (true);

drop policy if exists "Authenticated users can manage product variants" on public.product_variants;
create policy "Authenticated users can manage product variants"
on public.product_variants for all to authenticated
using (true) with check (true);

drop policy if exists "Authenticated users can manage stock balances" on public.stock_balances;
create policy "Authenticated users can manage stock balances"
on public.stock_balances for all to authenticated
using (true) with check (true);

drop policy if exists "Authenticated users can manage customers" on public.customers;
create policy "Authenticated users can manage customers"
on public.customers for all to authenticated
using (true) with check (true);

drop policy if exists "Authenticated users can manage suppliers" on public.suppliers;
create policy "Authenticated users can manage suppliers"
on public.suppliers for all to authenticated
using (true) with check (true);
