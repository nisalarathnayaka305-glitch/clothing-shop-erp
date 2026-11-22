import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)
export const supabase = supabaseConfigured ? createClient(url!, key!) : null

export type Product = {
  id: string; sku: string; name: string; category: string | null
  selling_price: number; cost_price: number; active: boolean
}
export const money = (value: number) => new Intl.NumberFormat('en-LK', {
  style: 'currency', currency: 'LKR', maximumFractionDigits: 0
}).format(value)
