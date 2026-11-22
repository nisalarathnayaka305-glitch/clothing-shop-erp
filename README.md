# Clothing Shop ERP

A React + TypeScript + Vite starter for a single clothing shop. Currency: LKR.

> This is an early starter, not a production-ready ERP. Dashboard figures are demo data. POS checkout, stock posting, full reports, employee management and online ordering still need implementation.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase setup

1. Create a Supabase project.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env.local`.
3. Run `supabase/migrations/0001_initial_schema.sql` in the Supabase SQL Editor.
4. Configure and test Supabase Auth and row-level security before storing real business data.

Never put the Supabase `service_role` key in frontend code or commit it to GitHub.

## Vercel

Import the repository into Vercel. Build command: `npm run build`; output directory: `dist`. Configure the two Vite Supabase environment variables in Vercel.
