# Standalone Accounting Workspace

This is a separate React/Vite application hosted at:

`/clothing-shop-erp/accounting/`

It shares the existing Clothing Shop ERP Supabase project and authentication, so it does not require another Supabase project or paid hosting. Its code and accounting data are separated from the retail ERP interface.

## Access

- Sign in with the same Supabase email/password account used by the ERP.
- Only active Admin and Manager employees can access the accounting workspace.
- Journal posting is enforced by a database RPC with role validation and double-entry balancing.

## Current features

- Chart of Accounts
- Journal Entries
- General Ledger
- Trial Balance
- Profit & Loss Statement
- Balance Sheet
- Opening Balance journals
- CSV export and print layouts

## Important reporting scope

The accounting tables use the `acct_*` prefix and do not change the existing ERP operational tables. At this stage, financial statements use only posted accounting journal entries.

ERP transaction auto-posting is enabled for new sales, returns, inventory/COGS, customer receipts, purchases, supplier payments, expenses and payroll runs marked Paid. Historical transactions are not backfilled. Enter and reconcile opening balances before relying on the Balance Sheet. Financial statements are based on posted accounting journals and should be reviewed by the shop's accountant before being used as statutory reports.

## Database

Migration `0025_standalone_accounting_core.sql` creates the accounting tables and initial chart of accounts. Migration `0026_harden_accounting_journal_role_guard.sql` hardens the journal-posting role check.

All accounting tables have RLS enabled. Anonymous access is revoked. Only Admin and Manager roles can read accounting records; journal creation is performed through the guarded database function.

## Build

From the repository root:

```bash
npm run build:accounting
```

The GitHub Pages deployment builds both the retail ERP and this standalone accounting app.
