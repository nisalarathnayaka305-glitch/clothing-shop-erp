import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured, money, type Product } from './lib'

const demo: Product[] = [
  { id: '1', sku: 'TSH-001', name: 'Classic Cotton T-Shirt', category: 'T-Shirts', selling_price: 2500, cost_price: 1450, active: true },
  { id: '2', sku: 'JNS-014', name: 'Slim Fit Denim Jeans', category: 'Jeans', selling_price: 6500, cost_price: 3900, active: true },
  { id: '3', sku: 'DRS-008', name: 'Floral Summer Dress', category: 'Dresses', selling_price: 5800, cost_price: 3200, active: true },
]

const navigation = ['Overview', 'Point of Sale', 'Products & Stock', 'Purchases', 'Customers', 'Suppliers', 'Expenses', 'Reports', 'Employees', 'Settings']

export default function App() {
  const [products, setProducts] = useState<Product[]>(demo)
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
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function loadProducts() {
    if (!supabase || !session) return
    const { data, error } = await supabase
      .from('products')
      .select('id,sku,name,category,selling_price,cost_price,active')
      .order('created_at', { ascending: false })
    if (error) setNotice(error.message)
    else if (data) setProducts(data as Product[])
  }

  useEffect(() => {
    if (session) void loadProducts()
  }, [session])

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setNotice('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setNotice(error.message)
    setBusy(false)
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setNotice(error.message)
    else {
      setProducts(demo)
      setPage('Overview')
    }
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault()
    const row = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category.trim() || 'General',
      selling_price: Number(form.selling_price),
      cost_price: Number(form.cost_price || 0),
      active: true,
    }
    if (!row.sku || !row.name || !Number.isFinite(row.selling_price) || row.selling_price <= 0 || row.cost_price < 0) {
      setNotice('Enter a product name, SKU and valid prices.')
      return
    }
    setBusy(true)
    if (supabase && session) {
      const { error } = await supabase.from('products').insert(row)
      if (error) setNotice(error.message)
      else {
        await loadProducts()
        setNotice('Product saved successfully.')
        setShow(false)
        setForm({ sku: '', name: '', category: 'General', selling_price: '', cost_price: '' })
      }
    } else {
      setProducts(current => [{ ...row, id: crypto.randomUUID() }, ...current])
      setNotice('Demo mode: this product is temporary and is not stored in Supabase.')
      setShow(false)
      setForm({ sku: '', name: '', category: 'General', selling_price: '', cost_price: '' })
    }
    setBusy(false)
  }

  const filtered = products.filter(product =>
    `${product.name} ${product.sku} ${product.category || ''}`.toLowerCase().includes(query.toLowerCase()),
  )

  if (!authReady) return <div className="auth-screen"><article><h2>Clothing ERP</h2><p>Checking your secure session…</p></article></div>

  if (supabaseConfigured && !session) {
    return <div className="auth-screen">
      <form className="login-card" onSubmit={signIn}>
        <div className="brand-mark">◈</div>
        <p className="eyebrow">CLOTHING RETAIL MANAGEMENT</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to access your shop workspace.</p>
        {notice && <p className="notice">{notice}</p>}
        <label>Email address<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <button className="primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted hint">User accounts are managed securely in your Supabase project.</p>
      </form>
    </div>
  }

  return <div className="shell">
    <aside>
      <h2>◈ Clothing ERP</h2><small>RETAIL MANAGEMENT</small>
      {navigation.map(item => <button key={item} className={page === item ? 'active' : ''} onClick={() => setPage(item)}>{item}</button>)}
    </aside>
    <main>
      <header>
        <b>Workspace / {page}</b>
        <div className="header-actions">
          <span className={supabaseConfigured ? 'ok' : 'demo'}>{supabaseConfigured ? 'Supabase connected' : 'Demo mode'}</span>
          {session && <button className="text-button" onClick={() => void signOut()}>Sign out</button>}
        </div>
      </header>
      <section>
        {notice && <p className="notice">{notice}<button className="dismiss" onClick={() => setNotice('')}>×</button></p>}
        {page === 'Overview' ? <>
          <p className="eyebrow">SHOP OVERVIEW</p><h1>Good morning 👋</h1><p>Here’s what’s happening with your shop.</p>
          <div className="stats">
            {[[ 'Today’s Sales', 'Rs. 48,650' ], [ 'Gross Profit', 'Rs. 16,420' ], [ 'Products', String(products.length) ], [ 'Orders', '—' ]].map(([label, value]) =>
              <article key={label}><small>{label}</small><h2>{value}</h2></article>)}
          </div>
          <article><h3>Quick actions</h3><button onClick={() => setPage('Products & Stock')}>Manage products</button><button onClick={() => setPage('Point of Sale')}>Open POS</button><p className="muted">Sales, profit and order figures will become live when the POS module is connected. Other dashboard figures are sample data.</p></article>
        </> : page === 'Products & Stock' ? <>
          <div className="heading"><div><p className="eyebrow">CATALOGUE</p><h1>Products & Stock</h1><p>Manage clothing products and selling prices.</p></div><button className="primary" onClick={() => setShow(true)}>+ Add Product</button></div>
          <article>
            <div className="toolbar"><h3>Product catalogue ({products.length})</h3><input aria-label="Search products" placeholder="Search products…" value={query} onChange={event => setQuery(event.target.value)} /><button onClick={() => void loadProducts()}>Refresh</button></div>
            <div className="tablewrap"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>SELLING PRICE</th><th>COST PRICE</th></tr></thead>
              <tbody>{filtered.map(product => <tr key={product.id}><td>{product.name}</td><td>{product.sku}</td><td>{product.category}</td><td>{money(product.selling_price)}</td><td>{money(product.cost_price)}</td></tr>)}
                {filtered.length === 0 && <tr><td colSpan={5}>No products found.</td></tr>}</tbody></table></div>
          </article>
        </> : <article className="empty"><h2>{page}</h2><p>This module is on the retail ERP roadmap and will be developed in the next phases.</p></article>}
      </section>
    </main>
    {show && <div className="overlay"><form onSubmit={saveProduct}>
      <h2>Add product</h2>
      <label>Product name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label>SKU / Product code<input required value={form.sku} onChange={event => setForm({ ...form, sku: event.target.value })} /></label>
      <label>Category<input value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} /></label>
      <label>Selling price (LKR)<input required min="0.01" step="0.01" type="number" value={form.selling_price} onChange={event => setForm({ ...form, selling_price: event.target.value })} /></label>
      <label>Cost price (LKR)<input min="0" step="0.01" type="number" value={form.cost_price} onChange={event => setForm({ ...form, cost_price: event.target.value })} /></label>
      <div className="actions"><button type="button" onClick={() => setShow(false)}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></div>
    </form></div>}
  </div>
}
