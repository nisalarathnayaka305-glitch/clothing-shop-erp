# Clothing Shop ERP

A single-shop clothing retail ERP built with React, TypeScript, Vite and Supabase. Currency: LKR.

## Implemented modules

- Product catalogue, product numbers, variants and stock balances
- Point of Sale, sales history, invoices and returns
- Suppliers, purchase receiving and stock movements
- Expense register
- Employee directory, role-based access, attendance and basic payroll
- Supplier accounts and invoice-level supplier payments
- Customer credit sales, accounts receivable and payment collection
- Company profile, logo upload, contact details and invoice/receipt branding
- Separate Accounting workspace with automatic posting for new ERP transactions


## Standalone Accounting Workspace

A separate accounting web app is built in `accounting/` and is hosted at:

`https://nisalarathnayaka305-glitch.github.io/clothing-shop-erp/accounting/`

It uses the same Supabase project and Admin/Manager login to keep hosting and database costs low, while keeping accounting UI and data in separate `acct_*` tables. The workspace includes the Chart of Accounts, Journal Entries, General Ledger, Trial Balance, Profit & Loss, Balance Sheet and Opening Balances.

New ERP sales, returns, customer receipts, purchases, supplier payments, expenses and paid payroll are automatically posted to Accounting (migration 0030). Historical transactions are not backfilled. Enter and reconcile opening balances before relying on the Balance Sheet; statements include posted accounting journals only.

Build both applications with `npm run build:all`.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The example environment file is configured for the linked Supabase project. The publishable key is intended for browser use; never place a Supabase `service_role` or secret key in frontend code.

## Supabase database setup

The linked project has migrations `0001` through `0030` applied. For a fresh environment, apply every file in `supabase/migrations` in numeric order.

The migrations create 19 public tables, all with Row Level Security enabled. Migration 0015 hardens nullable employee-role checks and removes anonymous execution from public functions. Migration 0016 removes direct RPC execution from trigger-only helper functions.

## First owner account (required once)

The application uses Supabase email/password sign-in. It does not provide public self-registration.

1. In Supabase Dashboard, open **Authentication → Users → Add user** and create the shop owner's login.
2. Copy the exact email address used for that Auth user.
3. In the SQL Editor, run the following once, replacing the sample name and email:

```sql
insert into public.employees (full_name, email, auth_user_id, role, status)
select 'Shop Owner', email, id, 'Admin', 'Active'
from auth.users
where lower(email) = lower('owner@example.com')
on conflict (auth_user_id) do update
set full_name = excluded.full_name,
    email = excluded.email,
    role = 'Admin',
    status = 'Active';
```

4. Sign in to the ERP with that email and password.
5. Add other staff through the Employee Management module and assign only the roles they need.

Do not share passwords or secret API keys in chat or commit them to GitHub.

## Build

```bash
npm run build
```

A GitHub Actions workflow also runs the production build on pushes and pull requests.

## Vercel deployment

Import this repository into Vercel. Set:

- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`

Use the same linked Supabase project URL and publishable key from `.env.example`. Configure environment variables for Preview and Production deployments as appropriate.

## Production readiness notes

- Create the first owner Auth user and bootstrap the Admin employee before staff sign-in.
- Complete Company Settings with the legal shop name, logo, contact details and receipt footer before printing customer invoices.
- Add the real product catalogue and opening stock quantities before enabling day-to-day POS sales.
- Verify sign-in, employee role assignment and each workflow using real test accounts.
- Payroll is a basic salary register, not a statutory Sri Lankan EPF/ETF/PAYE or overtime calculation engine.
- Take regular database backups and test restore procedures before storing live shop data.
