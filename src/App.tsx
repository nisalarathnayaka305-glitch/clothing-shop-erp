import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured, money, type Product, type ProductVariant } from './lib'

const demo: Product[] = [
  { id: '1', product_no: 'PRD-00001', sku: 'TSH-001', name: 'Classic Cotton T-Shirt', category: 'T-Shirts', selling_price: 2500, cost_price: 1450, active: true },
  { id: '2', product_no: 'PRD-00002', sku: 'JNS-014', name: 'Slim Fit Denim Jeans', category: 'Jeans', selling_price: 6500, cost_price: 3900, active: true },
  { id: '3', product_no: 'PRD-00003', sku: 'DRS-008', name: 'Floral Summer Dress', category: 'Dresses', selling_price: 5800, cost_price: 3200, active: true },
]
const demoVariants: ProductVariant[] = [
  { id: 'v1', product_id: '1', size: 'M', colour: 'Black', barcode: '200000000001', quantity: 12, reorder_level: 5 },
  { id: 'v2', product_id: '1', size: 'L', colour: 'Black', barcode: '200000000002', quantity: 3, reorder_level: 5 },
]
const navigation = ['Overview', 'Point of Sale', 'Products & Stock', 'Purchases', 'Customers', 'Suppliers', 'Expenses', 'Reports', 'Employees', 'Settings']

export default function App() {
  const [products, setProducts] = useState<Product[]>(demo)
  const [variants, setVariants] = useState<ProductVariant[]>(demoVariants)
  const [page, setPage] = useState('Overview')
  const [query, setQuery] = useState('')
  const [show, setShow] = useState(false)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!supabaseConfigured)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [form, setForm] = useState({ sku: '', name: '', category: 'General', selling_price: '', cost_price: '' })
  const [activeProduct, setActiveProduct] = useState<Product | null>(null)
  const [variantForm, setVariantForm] = useState({ size: 'M', colour: '', barcode: '', quantity: '0', reorder_level: '5' })
  const [adjustments, setAdjustments] = useState<Record<string, { change: string; reason: string }>>({})

  useEffect(() => {
    if (!supabase) return
    let mounted = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) setNotice(error.message)
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  async function loadProducts() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('products')
      .select('id,product_no,sku,name,category,selling_price,cost_price,active')
      .order('created_at', { ascending: false })
    if (error) setNotice(error.message)
    else if (data) setProducts(data as Product[])
  }

  async function loadVariants(productId: string) {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('product_variants')
      .select('id,product_id,size,colour,barcode,stock_balances(quantity,reorder_level)')
      .eq('product_id', productId).order('size')
    if (error) { setNotice(error.message); return }
    const mapped = (data || []).map((item: any) => {
      const stock = Array.isArray(item.stock_balances) ? item.stock_balances[0] : item.stock_balances
      return { id: item.id, product_id: item.product_id, size: item.size, colour: item.colour, barcode: item.barcode, quantity: stock?.quantity ?? 0, reorder_level: stock?.reorder_level ?? 5 }
    }) as ProductVariant[]
    setVariants(current => [...current.filter(v => v.product_id !== productId), ...mapped])
  }

  useEffect(() => { if (session) void loadProducts() }, [session])
  useEffect(() => { if (activeProduct) void loadVariants(activeProduct.id) }, [activeProduct?.id, session])

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setNotice('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setNotice(error.message)
    setBusy(false)
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setNotice(error.message)
    else { setProducts(demo); setVariants(demoVariants); setPage('Overview'); setActiveProduct(null) }
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault()
    const row = { sku: form.sku.trim(), name: form.name.trim(), category: form.category.trim() || 'General', selling_price: Number(form.selling_price), cost_price: Number(form.cost_price || 0), active: true }
    if (!row.sku || !row.name || !Number.isFinite(row.selling_price) || row.selling_price <= 0 || row.cost_price < 0) { setNotice('Enter a product name, SKU and valid prices.'); return }
    setBusy(true)
    if (supabase && session) {
      const { error } = await supabase.from('products').insert(row)
      if (error) setNotice(error.message)
      else { await loadProducts(); setNotice('Product saved. Product No. generated automatically.'); setShow(false); setForm({ sku: '', name: '', category: 'General', selling_price: '', cost_price: '' }) }
    } else {
      const nextNumber = Math.max(0, ...products.map(p => Number(p.product_no?.replace('PRD-', '') || 0))) + 1
      setProducts(current => [{ ...row, product_no: `PRD-${String(nextNumber).padStart(5, '0')}`, id: crypto.randomUUID() }, ...current])
      setNotice('Demo mode: product is temporary and is not stored in Supabase.')
      setShow(false); setForm({ sku: '', name: '', category: 'General', selling_price: '', cost_price: '' })
    }
    setBusy(false)
  }

  async function saveVariant(event: FormEvent) {
    event.preventDefault()
    if (!activeProduct) return
    const initialQty = Number(variantForm.quantity)
    const reorder = Number(variantForm.reorder_level)
    if (!variantForm.size.trim() || !variantForm.colour.trim() || !Number.isInteger(initialQty) || initialQty < 0 || !Number.isInteger(reorder) || reorder < 0) {
      setNotice('Enter size, colour and valid whole-number stock quantities.'); return
    }
    setBusy(true)
    if (supabase && session) {
      const { data, error } = await supabase.from('product_variants').insert({
        product_id: activeProduct.id, size: variantForm.size.trim(), colour: variantForm.colour.trim(),
        barcode: variantForm.barcode.trim() || null,
      }).select('id').single()
      if (error) { setNotice(error.message); setBusy(false); return }
      const { error: stockError } = await supabase.from('stock_balances').insert({ variant_id: data.id, quantity: initialQty, reorder_level: reorder })
      if (stockError) setNotice(`Variant created, but stock setup failed: ${stockError.message}. Please refresh and complete stock setup.`)
      else setNotice('Size and colour variant saved.')
      await loadVariants(activeProduct.id)
    } else {
      const duplicate = variants.some(v => v.product_id === activeProduct.id && v.size.toLowerCase() === variantForm.size.trim().toLowerCase() && v.colour.toLowerCase() === variantForm.colour.trim().toLowerCase())
      if (duplicate) { setNotice('This size and colour combination already exists.'); setBusy(false); return }
      setVariants(current => [...current, { id: crypto.randomUUID(), product_id: activeProduct.id, size: variantForm.size.trim(), colour: variantForm.colour.trim(), barcode: variantForm.barcode.trim() || null, quantity: initialQty, reorder_level: reorder }])
      setNotice('Demo mode: variant is temporary and is not stored in Supabase.')
    }
    setVariantForm({ size: 'M', colour: '', barcode: '', quantity: '0', reorder_level: '5' })
    setBusy(false)
  }

  async function adjustStock(event: FormEvent, variant: ProductVariant) {
    event.preventDefault()
    const adjustment = adjustments[variant.id] || { change: '', reason: 'Stock count correction' }
    const change = Number(adjustment.change)
    if (!Number.isInteger(change) || change === 0 || variant.quantity + change < 0 || !adjustment.reason.trim()) {
      setNotice('Enter a non-zero whole-number adjustment that does not make stock negative, and provide a reason.'); return
    }
    setBusy(true)
    if (supabase && session) {
      const { error } = await supabase.rpc('adjust_stock', { p_variant_id: variant.id, p_quantity_change: change, p_reason: adjustment.reason.trim() })
      if (error) setNotice(error.message)
      else { setNotice('Stock quantity adjusted and recorded.'); await loadVariants(variant.product_id) }
    } else {
      setVariants(current => current.map(v => v.id === variant.id ? { ...v, quantity: v.quantity + change } : v))
      setNotice('Demo mode: stock adjustment is temporary.')
    }
    setAdjustments(current => ({ ...current, [variant.id]: { change: '', reason: 'Stock count correction' } }))
    setBusy(false)
  }

  const filtered = products.filter(p => `${p.product_no} ${p.name} ${p.sku} ${p.category || ''}`.toLowerCase().includes(query.toLowerCase()))
  const lowStockCount = variants.filter(v => v.quantity <= v.reorder_level).length

  if (!authReady) return <div className="auth-screen"><article><h2>Clothing ERP</h2><p>Checking your secure session…</p></article></div>
  if (supabaseConfigured && !session) return <div className="auth-screen"><form className="login-card" onSubmit={signIn}>
    <div className="brand-mark">◈</div><p className="eyebrow">CLOTHING RETAIL MANAGEMENT</p><h1>Welcome back</h1><p className="muted">Sign in to access your shop workspace.</p>
    {notice && <p className="notice">{notice}</p>}
    <label>Email address<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
    <button className="primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><p className="muted hint">User accounts are managed securely in Supabase.</p>
  </form></div>

  return <div className="shell">
    <aside><h2>◈ Clothing ERP</h2><small>RETAIL MANAGEMENT</small>{navigation.map(item => <button key={item} className={page === item ? 'active' : ''} onClick={() => setPage(item)}>{item}</button>)}</aside>
    <main><header><b>Workspace / {page}</b><div className="header-actions"><span className={supabaseConfigured ? 'ok' : 'demo'}>{supabaseConfigured ? 'Supabase connected' : 'Demo mode'}</span>{session && <button className="text-button" onClick={() => void signOut()}>Sign out</button>}</div></header>
      <section>
        {notice && <p className="notice">{notice}<button className="dismiss" onClick={() => setNotice('')}>×</button></p>}
        {page === 'Overview' ? <>
          <p className="eyebrow">SHOP OVERVIEW</p><h1>Good morning 👋</h1><p>Here’s what’s happening with your shop.</p>
          <div className="stats">{[[ 'Today’s Sales', 'Rs. 48,650' ], [ 'Gross Profit', 'Rs. 16,420' ], [ 'Products', String(products.length) ], [ 'Low Stock Variants', String(lowStockCount) ]].map(([label, value]) => <article key={label}><small>{label}</small><h2>{value}</h2></article>)}</div>
          <article><h3>Quick actions</h3><button onClick={() => setPage('Products & Stock')}>Manage products & stock</button><button onClick={() => setPage('Point of Sale')}>Open POS</button><p className="muted">Sales and profit are sample figures until POS is implemented.</p></article>
        </> : page === 'Products & Stock' ? <>
          <div className="heading"><div><p className="eyebrow">CATALOGUE & INVENTORY</p><h1>Products & Stock</h1><p>Manage products, size/colour variants and stock quantities.</p></div><button className="primary" onClick={() => setShow(true)}>+ Add Product</button></div>
          <article><div className="toolbar"><h3>Product catalogue ({products.length})</h3><input aria-label="Search products" placeholder="Search product no, name or SKU…" value={query} onChange={e => setQuery(e.target.value)} /><button onClick={() => void loadProducts()}>Refresh</button></div>
            <div className="tablewrap"><table><thead><tr><th>PRODUCT NO.</th><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>SELLING PRICE</th><th>COST PRICE</th><th>VARIANTS</th><th>ACTION</th></tr></thead>
              <tbody>{filtered.map(p => <tr key={p.id}><td><b>{p.product_no}</b></td><td>{p.name}</td><td>{p.sku}</td><td>{p.category}</td><td>{money(p.selling_price)}</td><td>{money(p.cost_price)}</td><td>{variants.filter(v => v.product_id === p.id).length}</td><td><button className="small-action" onClick={() => setActiveProduct(p)}>Manage stock</button></td></tr>)}
              {filtered.length === 0 && <tr><td colSpan={8}>No products found.</td></tr>}</tbody></table></div>
          </article>
        </> : <article className="empty"><h2>{page}</h2><p>This module is planned for a later development phase.</p></article>}
      </section>
    </main>
    {show && <div className="overlay"><form onSubmit={saveProduct}><h2>Add product</h2><p className="muted">A unique Product No. will be generated automatically.</p>
      <label>Product name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label>SKU / Product code<input required value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></label>
      <label>Category<input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></label>
      <label>Selling price (LKR)<input required min="0.01" step="0.01" type="number" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })} /></label>
      <label>Cost price (LKR)<input min="0" step="0.01" type="number" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} /></label>
      <div className="actions"><button type="button" onClick={() => setShow(false)}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></div>
    </form></div>}
    {activeProduct && <div className="overlay"><div className="variant-panel">
      <div className="panel-heading"><div><p className="eyebrow">INVENTORY MANAGEMENT</p><h2>{activeProduct.name}</h2><p className="muted">{activeProduct.product_no} · SKU {activeProduct.sku}</p></div><button className="text-button" onClick={() => setActiveProduct(null)}>✕</button></div>
      <form className="variant-form" onSubmit={saveVariant}><h3>Add size / colour</h3>
        <div className="form-grid"><label>Size<select value={variantForm.size} onChange={e => setVariantForm({ ...variantForm, size: e.target.value })}>{['Free Size','XS','S','M','L','XL','XXL','XXXL'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Colour<input required placeholder="e.g. Black" value={variantForm.colour} onChange={e => setVariantForm({ ...variantForm, colour: e.target.value })} /></label>
        <label>Barcode (optional)<input value={variantForm.barcode} onChange={e => setVariantForm({ ...variantForm, barcode: e.target.value })} /></label>
        <label>Opening stock<input required type="number" min="0" step="1" value={variantForm.quantity} onChange={e => setVariantForm({ ...variantForm, quantity: e.target.value })} /></label>
        <label>Low stock alert at<input required type="number" min="0" step="1" value={variantForm.reorder_level} onChange={e => setVariantForm({ ...variantForm, reorder_level: e.target.value })} /></label></div>
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Add variant'}</button>
      </form>
      <h3>Size & colour stock</h3><div className="tablewrap"><table><thead><tr><th>SIZE</th><th>COLOUR</th><th>BARCODE</th><th>ON HAND</th><th>STATUS</th><th>ADJUST STOCK</th></tr></thead><tbody>
        {variants.filter(v => v.product_id === activeProduct.id).map(v => <tr key={v.id}><td>{v.size}</td><td>{v.colour}</td><td>{v.barcode || '—'}</td><td><b>{v.quantity}</b></td><td><span className={v.quantity <= v.reorder_level ? 'stock-low' : 'stock-ok'}>{v.quantity <= v.reorder_level ? 'Low stock' : 'In stock'}</span></td>
          <td><form className="adjust-form" onSubmit={e => void adjustStock(e, v)}><input aria-label="Quantity adjustment" type="number" step="1" placeholder="+ / − qty" value={adjustments[v.id]?.change || ''} onChange={e => setAdjustments(current => ({ ...current, [v.id]: { change: e.target.value, reason: current[v.id]?.reason || 'Stock count correction' } }))} /><input aria-label="Adjustment reason" placeholder="Reason" value={adjustments[v.id]?.reason || 'Stock count correction'} onChange={e => setAdjustments(current => ({ ...current, [v.id]: { change: current[v.id]?.change || '', reason: e.target.value } }))} /><button disabled={busy}>Apply</button></form></td></tr>)}
        {variants.filter(v => v.product_id === activeProduct.id).length === 0 && <tr><td colSpan={6}>No variants yet. Add a size and colour above.</td></tr>}
      </tbody></table></div><p className="muted">Stock adjustments are recorded with a reason. Negative stock is not allowed.</p>
    </div></div>}
  </div>
}
