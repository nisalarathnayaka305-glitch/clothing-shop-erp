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
type POSVariant = ProductVariant & { product_no: string; product_name: string; sku: string; selling_price: number }
type CartLine = { variant_id: string; product_no: string; name: string; sku: string; size: string; colour: string; unit_price: number; quantity: number; available: number }
type Invoice = { invoice_no: string; subtotal: number; discount: number; total: number; amount_received: number; change_amount: number; payment_method: string; created_at: string; items: CartLine[] }

const navigation = ['Overview', 'Point of Sale', 'Sales History', 'Returns & Exchanges', 'Products & Stock', 'Purchases', 'Customers', 'Suppliers', 'Expenses', 'Reports', 'Employees', 'Settings']

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
  const [posVariants, setPosVariants] = useState<POSVariant[]>(demoVariants.map(v => { const p = demo.find(item => item.id === v.product_id)!; return { ...v, product_no: p.product_no, product_name: p.name, sku: p.sku, selling_price: p.selling_price } }))
  const [posQuery, setPosQuery] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [amountReceived, setAmountReceived] = useState('')
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerForm, setCustomerForm] = useState({ full_name: '', phone: '', email: '' })
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [sales, setSales] = useState<any[]>([])
  const [salesQuery, setSalesQuery] = useState('')
  const [salesDate, setSalesDate] = useState('')
  const [selectedSale, setSelectedSale] = useState<any | null>(null)
  const [returnSale, setReturnSale] = useState<any | null>(null)
  const [returnLines, setReturnLines] = useState<Record<string, string>>({})
  const [returnReason, setReturnReason] = useState('Customer changed mind')
  const [restockReturned, setRestockReturned] = useState(true)
  const [refundMethod, setRefundMethod] = useState('Cash')
  const [returns, setReturns] = useState<any[]>([])

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

  async function loadCustomers() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('customers')
      .select('id,full_name,phone,email,created_at').order('full_name')
    if (error) setNotice(error.message)
    else if (data) setCustomers(data)
  }

  async function loadSales() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('sales')
      .select('id,invoice_no,subtotal,discount,total,payment_method,amount_received,change_amount,created_at,customers(id,full_name,phone),sale_items(id,product_no,product_name,sku,size,colour,quantity,unit_price,line_total)')
      .order('created_at', { ascending: false }).limit(500)
    if (error) setNotice(error.message)
    else if (data) setSales(data)
  }

  async function loadReturns() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('sales_returns')
      .select('id,return_no,sale_id,refund_total,refund_method,reason,restock_items,created_at,sales(invoice_no),sales_return_items(id,product_no,product_name,size,colour,quantity,unit_price,line_total)')
      .order('created_at', { ascending: false }).limit(500)
    if (error) setNotice(error.message)
    else if (data) setReturns(data)
  }

  async function processReturn(event: FormEvent) {
    event.preventDefault()
    if (!returnSale) { setNotice('Select the original invoice first.'); return }
    const items = Object.entries(returnLines).filter(([,qty]) => Number(qty) > 0).map(([sale_item_id,qty]) => ({ sale_item_id, quantity: Number(qty) }))
    if (!items.length || items.some(item => !Number.isInteger(item.quantity))) { setNotice('Enter a whole-number return quantity for at least one item.'); return }
    if (!returnReason.trim()) { setNotice('Enter a reason for the return.'); return }
    setBusy(true)
    if (supabase && session) {
      const { data, error } = await supabase.rpc('process_sales_return', {
        p_sale_id: returnSale.id, p_items: items, p_reason: returnReason.trim(),
        p_restock_items: restockReturned, p_refund_method: refundMethod,
      })
      if (error) { setNotice(error.message); setBusy(false); return }
      setNotice(`Return ${data.return_no} processed. Refund: ${money(Number(data.refund_total))}.`)
      await Promise.all([loadReturns(), loadPOSVariants(), loadSales()])
    } else {
      const refund = items.reduce((sum,item) => {
        const line = returnSale.sale_items.find((x:any) => x.id === item.sale_item_id)
        return sum + Number(line.unit_price) * item.quantity
      },0)
      const demoReturn = { id: crypto.randomUUID(), return_no: `RET-DEMO-${Date.now()}`, sale_id: returnSale.id,
        sales: { invoice_no: returnSale.invoice_no }, refund_total: refund, refund_method: refundMethod,
        reason: returnReason, restock_items: restockReturned, created_at: new Date().toISOString(),
        sales_return_items: items.map(item => { const line = returnSale.sale_items.find((x:any) => x.id === item.sale_item_id); return { ...line, quantity: item.quantity, line_total: item.quantity * Number(line.unit_price) } }) }
      setReturns(current => [demoReturn,...current])
      setNotice('Demo return recorded locally only. No Supabase data or stock was changed.')
    }
    setReturnSale(null); setReturnLines({}); setReturnReason('Customer changed mind'); setRestockReturned(true); setBusy(false)
  }

  async function loadPOSVariants() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('product_variants')
      .select('id,product_id,size,colour,barcode,products!inner(id,product_no,name,sku,selling_price,active),stock_balances(quantity,reorder_level)')
      .eq('products.active', true).order('size')
    if (error) { setNotice(error.message); return }
    const mapped = (data || []).map((row: any) => {
      const product = Array.isArray(row.products) ? row.products[0] : row.products
      const stock = Array.isArray(row.stock_balances) ? row.stock_balances[0] : row.stock_balances
      return { id: row.id, product_id: row.product_id, size: row.size, colour: row.colour, barcode: row.barcode,
        quantity: stock?.quantity ?? 0, reorder_level: stock?.reorder_level ?? 5,
        product_no: product?.product_no ?? '', product_name: product?.name ?? '', sku: product?.sku ?? '',
        selling_price: Number(product?.selling_price ?? 0) } as POSVariant
    })
    setPosVariants(mapped)
  }

  useEffect(() => { if (session) { void loadProducts(); void loadPOSVariants(); void loadCustomers(); void loadSales(); void loadReturns() } }, [session])
  useEffect(() => { if (activeProduct) void loadVariants(activeProduct.id) }, [activeProduct?.id, session])

  function addToCart(variant: POSVariant) {
    if (variant.quantity < 1) { setNotice('This size and colour is out of stock.'); return }
    setCart(current => {
      const existing = current.find(line => line.variant_id === variant.id)
      if (existing) {
        if (existing.quantity >= variant.quantity) { setNotice('Not enough stock available.'); return current }
        return current.map(line => line.variant_id === variant.id ? { ...line, quantity: line.quantity + 1 } : line)
      }
      return [...current, { variant_id: variant.id, product_no: variant.product_no, name: variant.product_name, sku: variant.sku,
        size: variant.size, colour: variant.colour, unit_price: variant.selling_price, quantity: 1, available: variant.quantity }]
    })
    setNotice('')
  }

  function addBarcode(event: FormEvent) {
    event.preventDefault()
    const code = barcodeInput.trim().toLowerCase()
    const matches = posVariants.filter(v => (v.barcode || '').toLowerCase() === code || v.sku.toLowerCase() === code || v.product_no.toLowerCase() === code)
    if (matches.length === 0) { setNotice('No matching variant found. Check the barcode or product number.'); return }
    if (matches.length > 1) { setNotice('This code matches multiple sizes/colours. Select the correct variant from the product list.'); return }
    addToCart(matches[0])
    setBarcodeInput('')
  }

  function updateCartQuantity(variantId: string, quantity: number) {
    if (quantity <= 0) { setCart(current => current.filter(line => line.variant_id !== variantId)); return }
    const available = posVariants.find(v => v.id === variantId)?.quantity ?? 0
    if (quantity > available) { setNotice('Quantity exceeds available stock.'); return }
    setCart(current => current.map(line => line.variant_id === variantId ? { ...line, quantity } : line))
  }

  const cartSubtotal = cart.reduce((sum, line) => sum + line.unit_price * line.quantity, 0)
  const discountValue = Math.max(0, Number(discount) || 0)
  const cartTotal = Math.max(0, cartSubtotal - discountValue)

  async function completeSale(event: FormEvent) {
    event.preventDefault()
    if (!cart.length) { setNotice('Add at least one item to the cart.'); return }
    if (discountValue > cartSubtotal) { setNotice('Discount cannot exceed the subtotal.'); return }
    const received = Number(amountReceived)
    if (!Number.isFinite(received) || received < cartTotal) { setNotice('Amount received must be equal to or greater than the total.'); return }
    if (paymentMethod !== 'Cash' && received !== cartTotal) { setNotice('For card or bank transfer, enter the exact sale total.'); return }
    setBusy(true)
    const invoiceItems = cart.map(line => ({ ...line }))
    if (supabase && session) {
      const { data, error } = await supabase.rpc('complete_sale_for_customer', {
        p_items: cart.map(line => ({ variant_id: line.variant_id, quantity: line.quantity })),
        p_discount: discountValue,
        p_payment_method: paymentMethod,
        p_amount_received: received,
        p_customer_id: selectedCustomer || null,
      })
      if (error) { setNotice(error.message); setBusy(false); return }
      const result = data as any
      setLastInvoice({ invoice_no: result.invoice_no, subtotal: Number(result.subtotal), discount: Number(result.discount),
        total: Number(result.total), amount_received: Number(result.amount_received), change_amount: Number(result.change_amount),
        payment_method: result.payment_method, created_at: result.created_at, items: invoiceItems })
      await loadPOSVariants()
      await loadSales()
    } else {
      setPosVariants(current => current.map(v => {
        const sold = cart.find(line => line.variant_id === v.id)
        return sold ? { ...v, quantity: v.quantity - sold.quantity } : v
      }))
      const demoInvoiceNo = `DEMO-${Date.now()}`
      const demoCustomer = customers.find(c => c.id === selectedCustomer) || null
      const demoCreatedAt = new Date().toISOString()
      setLastInvoice({ invoice_no: demoInvoiceNo, subtotal: cartSubtotal, discount: discountValue, total: cartTotal,
        amount_received: received, change_amount: received - cartTotal, payment_method: paymentMethod, created_at: demoCreatedAt, items: invoiceItems })
      setSales(current => [{ id: demoInvoiceNo, invoice_no: demoInvoiceNo, subtotal: cartSubtotal, discount: discountValue, total: cartTotal,
        amount_received: received, change_amount: received - cartTotal, payment_method: paymentMethod, created_at: demoCreatedAt,
        customers: demoCustomer, sale_items: invoiceItems.map((line,i) => ({ id: `${demoInvoiceNo}-${i}`, product_no: line.product_no, product_name: line.name, sku: line.sku, size: line.size, colour: line.colour, quantity: line.quantity, unit_price: line.unit_price, line_total: line.unit_price * line.quantity })) }, ...current])
      setNotice('Demo sale completed locally only. No data was saved to Supabase.')
    }
    setCart([]); setDiscount('0'); setAmountReceived(''); setSelectedCustomer(''); setBusy(false)
  }

  async function saveCustomer(event: FormEvent) {
    event.preventDefault()
    const row = { full_name: customerForm.full_name.trim(), phone: customerForm.phone.trim() || null, email: customerForm.email.trim() || null }
    if (!row.full_name) { setNotice('Customer name is required.'); return }
    setBusy(true)
    if (supabase && session) {
      const { data, error } = await supabase.from('customers').insert(row).select('id,full_name,phone,email,created_at').single()
      if (error) setNotice(error.message)
      else { setCustomers(current => [...current, data].sort((x,y) => x.full_name.localeCompare(y.full_name))); setCustomerForm({ full_name: '', phone: '', email: '' }); setNotice('Customer saved successfully.') }
    } else {
      const customer = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() }
      setCustomers(current => [...current, customer]); setCustomerForm({ full_name: '', phone: '', email: '' }); setNotice('Demo mode: customer is temporary and not saved to Supabase.')
    }
    setBusy(false)
  }

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
        </> : page === 'Sales History' ? <>
          <div className="heading"><div><p className="eyebrow">TRANSACTIONS</p><h1>Sales History</h1><p>Search invoices and review completed sales.</p></div><button onClick={() => void loadSales()}>Refresh</button></div>
          <article>
            <div className="sales-filters"><input placeholder="Search invoice number or customer…" value={salesQuery} onChange={e => setSalesQuery(e.target.value)} /><label>Sale date<input type="date" value={salesDate} onChange={e => setSalesDate(e.target.value)} /></label></div>
            <div className="tablewrap"><table><thead><tr><th>DATE</th><th>INVOICE</th><th>CUSTOMER</th><th>PAYMENT</th><th>ITEMS</th><th>TOTAL</th><th>ACTION</th></tr></thead><tbody>
              {sales.filter(s => {
                const customer = Array.isArray(s.customers) ? s.customers[0] : s.customers
                const term = `${s.invoice_no} ${customer?.full_name || 'Walk-in'} ${customer?.phone || ''}`.toLowerCase()
                return term.includes(salesQuery.toLowerCase()) && (!salesDate || new Date(s.created_at).toLocaleDateString('en-CA') === salesDate)
              }).map(s => { const customer = Array.isArray(s.customers) ? s.customers[0] : s.customers; return <tr key={s.id}><td>{new Date(s.created_at).toLocaleString()}</td><td><b>{s.invoice_no}</b></td><td>{customer?.full_name || 'Walk-in customer'}</td><td>{s.payment_method}</td><td>{s.sale_items?.reduce((n:number,i:any)=>n+i.quantity,0) || 0}</td><td>{money(Number(s.total))}</td><td><button className="small-action" onClick={() => setSelectedSale(s)}>View invoice</button></td></tr> })}
              {sales.length === 0 && <tr><td colSpan={7}>No sales recorded yet.</td></tr>}
            </tbody></table></div>
          </article>
          {selectedSale && <div className="invoice-preview"><div className="heading"><div><p className="eyebrow">INVOICE DETAILS</p><h2>{selectedSale.invoice_no}</h2></div><button onClick={() => setSelectedSale(null)}>Close</button><button className="primary" onClick={() => window.print()}>Print</button></div><p>{new Date(selectedSale.created_at).toLocaleString()} · {selectedSale.payment_method}</p><div className="tablewrap"><table><thead><tr><th>PRODUCT</th><th>SIZE / COLOUR</th><th>QTY</th><th>UNIT PRICE</th><th>LINE TOTAL</th></tr></thead><tbody>{(selectedSale.sale_items || []).map((i:any)=><tr key={i.id}><td>{i.product_name}<small>{i.product_no} · {i.sku}</small></td><td>{i.size} / {i.colour}</td><td>{i.quantity}</td><td>{money(Number(i.unit_price))}</td><td>{money(Number(i.line_total))}</td></tr>)}</tbody></table></div><p>Subtotal: {money(Number(selectedSale.subtotal))} · Discount: {money(Number(selectedSale.discount))} · <b>Total: {money(Number(selectedSale.total))}</b></p><p>Received: {money(Number(selectedSale.amount_received))} · Change: {money(Number(selectedSale.change_amount))}</p></div>}
        </> : page === 'Returns & Exchanges' ? <>
          <div className="heading"><div><p className="eyebrow">AFTER-SALES</p><h1>Returns & Exchanges</h1><p>Process item returns against an original invoice and record refunds.</p></div><button onClick={() => { void loadSales(); void loadReturns() }}>Refresh</button></div>
          <article className="return-workflow">
            <h3>Process a return</h3>
            <form onSubmit={processReturn}>
              <label>Original invoice<select value={returnSale?.id || ''} onChange={e => { const sale = sales.find(s => s.id === e.target.value) || null; setReturnSale(sale); setReturnLines({}) }}><option value="">Select invoice…</option>{sales.map(s => <option key={s.id} value={s.id}>{s.invoice_no} · {new Date(s.created_at).toLocaleDateString()} · {money(Number(s.total))}</option>)}</select></label>
              {returnSale && <div className="tablewrap"><table><thead><tr><th>PRODUCT</th><th>SIZE / COLOUR</th><th>SOLD QTY</th><th>UNIT PRICE</th><th>RETURN QTY</th></tr></thead><tbody>
                {(returnSale.sale_items || []).map((line:any) => <tr key={line.id}><td>{line.product_name}<small>{line.product_no}</small></td><td>{line.size} / {line.colour}</td><td>{line.quantity}</td><td>{money(Number(line.unit_price))}</td><td><input className="return-qty" aria-label={`Return quantity for ${line.product_name}`} type="number" min="0" max={line.quantity} step="1" value={returnLines[line.id] || '0'} onChange={e => setReturnLines(current => ({ ...current, [line.id]: e.target.value }))} /></td></tr>)}
              </tbody></table></div>}
              <div className="return-options"><label>Reason<select value={returnReason} onChange={e => setReturnReason(e.target.value)}><option>Customer changed mind</option><option>Wrong size</option><option>Wrong colour</option><option>Defective item</option><option>Incorrect item supplied</option><option>Other</option></select></label>
                <label>Refund method<select value={refundMethod} onChange={e => setRefundMethod(e.target.value)}><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Store Credit</option></select></label>
                <label className="check-label"><input type="checkbox" checked={restockReturned} onChange={e => setRestockReturned(e.target.checked)} /> Returned items are resalable and should be added back to stock</label>
              </div>
              <button className="primary" disabled={busy || !returnSale}>{busy ? 'Processing…' : 'Process Return & Refund'}</button>
            </form>
          </article>
          <article><div className="toolbar"><h3>Return history ({returns.length})</h3></div><div className="tablewrap"><table><thead><tr><th>DATE</th><th>RETURN NO.</th><th>ORIGINAL INVOICE</th><th>ITEMS</th><th>REFUND</th><th>METHOD</th><th>RESTOCKED</th></tr></thead><tbody>
            {returns.map(r => { const original = Array.isArray(r.sales) ? r.sales[0] : r.sales; return <tr key={r.id}><td>{new Date(r.created_at).toLocaleString()}</td><td><b>{r.return_no}</b></td><td>{original?.invoice_no || '—'}</td><td>{(r.sales_return_items || []).reduce((n:number,i:any)=>n+i.quantity,0)}</td><td>{money(Number(r.refund_total))}</td><td>{r.refund_method}</td><td>{r.restock_items ? 'Yes' : 'No'}</td></tr> })}
            {returns.length === 0 && <tr><td colSpan={7}>No returns recorded yet.</td></tr>}
          </tbody></table></div></article>
        </> : page === 'Products & Stock' ? <>
          <div className="heading"><div><p className="eyebrow">CATALOGUE & INVENTORY</p><h1>Products & Stock</h1><p>Manage products, size/colour variants and stock quantities.</p></div><button className="primary" onClick={() => setShow(true)}>+ Add Product</button></div>
          <article><div className="toolbar"><h3>Product catalogue ({products.length})</h3><input aria-label="Search products" placeholder="Search product no, name or SKU…" value={query} onChange={e => setQuery(e.target.value)} /><button onClick={() => void loadProducts()}>Refresh</button></div>
            <div className="tablewrap"><table><thead><tr><th>PRODUCT NO.</th><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>SELLING PRICE</th><th>COST PRICE</th><th>VARIANTS</th><th>ACTION</th></tr></thead>
              <tbody>{filtered.map(p => <tr key={p.id}><td><b>{p.product_no}</b></td><td>{p.name}</td><td>{p.sku}</td><td>{p.category}</td><td>{money(p.selling_price)}</td><td>{money(p.cost_price)}</td><td>{variants.filter(v => v.product_id === p.id).length}</td><td><button className="small-action" onClick={() => setActiveProduct(p)}>Manage stock</button></td></tr>)}
              {filtered.length === 0 && <tr><td colSpan={8}>No products found.</td></tr>}</tbody></table></div>
          </article>
        </> : page === 'Point of Sale' ? <>
          <div className="heading"><div><p className="eyebrow">CHECKOUT</p><h1>Point of Sale</h1><p>Scan a barcode or select a size and colour variant.</p></div><span className={supabaseConfigured ? 'ok' : 'demo'}>{supabaseConfigured ? 'Live inventory' : 'Demo inventory'}</span></div>
          <div className="pos-layout">
            <div className="pos-products">
              <form className="barcode-form" onSubmit={addBarcode}><input autoFocus aria-label="Barcode, SKU or product number" placeholder="Scan barcode / enter SKU / Product No." value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)} /><button className="primary">Add</button></form>
              <input className="pos-search" placeholder="Search products, product no. or colour…" value={posQuery} onChange={e => setPosQuery(e.target.value)} />
              <div className="pos-grid">{posVariants.filter(v => `${v.product_no} ${v.product_name} ${v.sku} ${v.size} ${v.colour}`.toLowerCase().includes(posQuery.toLowerCase())).map(v =>
                <article className="pos-item" key={v.id}><small>{v.product_no} · {v.sku}</small><h3>{v.product_name}</h3><p>{v.size} / {v.colour}</p><b>{money(v.selling_price)}</b><div className="pos-item-bottom"><span>{v.quantity} in stock</span><button disabled={v.quantity < 1} onClick={() => addToCart(v)}>Add +</button></div></article>)}
                {posVariants.length === 0 && <p className="muted">No variants with stock data found. Add products and size/colour variants first.</p>}
              </div>
            </div>
            <article className="cart-panel"><h2>Current bill</h2><p className="muted">{cart.length} item type(s)</p>
              <div className="cart-lines">{cart.map(line => <div className="cart-line" key={line.variant_id}><div><b>{line.name}</b><small>{line.product_no} · {line.size} / {line.colour}</small><small>{money(line.unit_price)} each</small></div><div className="qty-control"><button type="button" onClick={() => updateCartQuantity(line.variant_id,line.quantity-1)}>−</button><span>{line.quantity}</span><button type="button" onClick={() => updateCartQuantity(line.variant_id,line.quantity+1)}>+</button></div><b>{money(line.unit_price*line.quantity)}</b></div>)}
                {cart.length === 0 && <p className="muted">Your cart is empty. Add products to begin.</p>}</div>
              <div className="bill-summary"><div><span>Subtotal</span><b>{money(cartSubtotal)}</b></div><label>Discount (LKR)<input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} /></label><div className="grand-total"><span>Total</span><strong>{money(cartTotal)}</strong></div></div>
              <form onSubmit={completeSale} className="checkout-form"><label>Customer<select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}><option value="">Walk-in customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ''}</option>)}</select></label><label>Payment method<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option>Cash</option><option>Card</option><option>Bank Transfer</option></select></label><label>Amount received (LKR)<input required type="number" min={cartTotal} step="0.01" value={amountReceived} onChange={e => setAmountReceived(e.target.value)} placeholder={String(cartTotal)} /></label><p className="change-due">Change: <b>{money(Math.max(0,(Number(amountReceived)||0)-cartTotal))}</b></p><button className="primary full" disabled={busy || cart.length===0}>{busy ? 'Processing…' : 'Complete Sale'}</button></form>
            </article>
          </div>
          {lastInvoice && <div className="invoice-preview"><div className="heading"><div><p className="eyebrow">SALE COMPLETED</p><h2>Invoice {lastInvoice.invoice_no}</h2></div><button className="primary" onClick={() => window.print()}>Print invoice</button></div><p>{new Date(lastInvoice.created_at).toLocaleString()}</p><div className="tablewrap"><table><thead><tr><th>ITEM</th><th>SIZE / COLOUR</th><th>QTY</th><th>PRICE</th><th>AMOUNT</th></tr></thead><tbody>{lastInvoice.items.map((line,i)=><tr key={i}><td>{line.name}<small>{line.product_no}</small></td><td>{line.size} / {line.colour}</td><td>{line.quantity}</td><td>{money(line.unit_price)}</td><td>{money(line.unit_price*line.quantity)}</td></tr>)}</tbody></table></div><p>Subtotal: {money(lastInvoice.subtotal)} · Discount: {money(lastInvoice.discount)} · <b>Total: {money(lastInvoice.total)}</b></p><p>Paid by {lastInvoice.payment_method} · Received {money(lastInvoice.amount_received)} · Change {money(lastInvoice.change_amount)}</p></div>}
        </> : page === 'Customers' ? <>
          <div className="heading"><div><p className="eyebrow">CUSTOMER DIRECTORY</p><h1>Customers</h1><p>Save customer contact details and see their purchase totals.</p></div></div>
          <div className="customer-layout">
            <article><h3>Add customer</h3><form onSubmit={saveCustomer} className="customer-form">
              <label>Full name<input required value={customerForm.full_name} onChange={e => setCustomerForm({ ...customerForm, full_name: e.target.value })} /></label>
              <label>Phone number<input value={customerForm.phone} onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value })} /></label>
              <label>Email address<input type="email" value={customerForm.email} onChange={e => setCustomerForm({ ...customerForm, email: e.target.value })} /></label>
              <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save customer'}</button>
            </form></article>
            <article><div className="toolbar"><h3>Customer list ({customers.length})</h3><input placeholder="Search name, phone or email…" value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} /><button onClick={() => void loadCustomers()}>Refresh</button></div>
              <div className="tablewrap"><table><thead><tr><th>CUSTOMER</th><th>PHONE</th><th>EMAIL</th><th>ORDERS</th><th>TOTAL SPENT</th><th>PURCHASE HISTORY</th></tr></thead><tbody>
                {customers.filter(c => `${c.full_name} ${c.phone || ''} ${c.email || ''}`.toLowerCase().includes(customerQuery.toLowerCase())).map(c => { const customerSales = sales.filter(s => { const linked = Array.isArray(s.customers) ? s.customers[0] : s.customers; return linked?.id === c.id }); return <tr key={c.id}><td><b>{c.full_name}</b></td><td>{c.phone || '—'}</td><td>{c.email || '—'}</td><td>{customerSales.length}</td><td>{money(customerSales.reduce((sum,s)=>sum+Number(s.total),0))}</td><td><button className="small-action" onClick={() => { setSalesQuery(c.full_name); setPage('Sales History') }}>View sales</button></td></tr> })}
                {customers.length === 0 && <tr><td colSpan={6}>No customers added yet.</td></tr>}
              </tbody></table></div>
            </article>
          </div>
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
