import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Contra Revenue' | 'Cost of Sales' | 'Expense' | 'Other Income' | 'Other Expense'
type Account = {
  id: string
  code: string
  name: string
  account_type: AccountType
  normal_balance: 'debit' | 'credit'
  description: string | null
  is_system: boolean
  is_active: boolean
}
type Line = {
  id?: string
  account_id: string
  debit: number | string
  credit: number | string
  memo?: string | null
  acct_accounts?: { code: string; name: string; account_type: AccountType } | null
}
type Entry = {
  id: string
  entry_no: string
  entry_date: string
  description: string
  reference: string | null
  source_type: string
  status: string
  created_at: string
  acct_journal_lines: Line[]
}
type Period = { id: string; name: string; period_start: string; period_end: string; status: 'Open' | 'Closed' }
type InventoryRow = { variant_id: string; product_id: string; product_no: string; sku: string; product_name: string; category: string | null; size: string; colour: string; quantity: number; reorder_level: number; unit_cost: number; estimated_value: number; active: boolean }
type Tab = 'overview' | 'profit' | 'balance' | 'trial' | 'inventory' | 'journals' | 'accounts' | 'opening'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date())
const monthStart = () => today().slice(0, 7) + '-01'
const money = (value: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)
const amount = (value: unknown) => Number(value || 0)
const accountTypes: AccountType[] = ['Asset','Liability','Equity','Revenue','Contra Revenue','Cost of Sales','Expense','Other Income','Other Expense']
const defaultNormalBalance = (type: AccountType) => ['Asset','Contra Revenue','Cost of Sales','Expense','Other Expense'].includes(type) ? 'debit' : 'credit'
const nav: { id: Tab; label: string; group: string }[] = [
  { id: 'overview', label: 'Overview', group: 'WORKSPACE' },
  { id: 'profit', label: 'Profit & Loss', group: 'REPORTS' },
  { id: 'balance', label: 'Balance Sheet', group: 'REPORTS' },
  { id: 'trial', label: 'Trial Balance', group: 'REPORTS' },
  { id: 'inventory', label: 'Inventory Valuation', group: 'REPORTS' },
  { id: 'journals', label: 'Journal Entries', group: 'ACCOUNTING' },
  { id: 'opening', label: 'Opening Balances', group: 'ACCOUNTING' },
  { id: 'accounts', label: 'Chart of Accounts', group: 'ACCOUNTING' },
]

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g,'""') + '"').join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [asAtDate, setAsAtDate] = useState(today())
  const [selectedAccount, setSelectedAccount] = useState('')
  const [showJournal, setShowJournal] = useState(false)
  const [journalSource, setJournalSource] = useState<'manual' | 'opening_balance'>('manual')
  const [journalDate, setJournalDate] = useState(today())
  const [journalDescription, setJournalDescription] = useState('')
  const [journalReference, setJournalReference] = useState('')
  const [journalLines, setJournalLines] = useState<Line[]>([
    { account_id: '', debit: '', credit: '', memo: '' },
    { account_id: '', debit: '', credit: '', memo: '' },
  ])
  const [accountForm, setAccountForm] = useState({ code: '', name: '', account_type: 'Expense' as AccountType, description: '' })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data: userResult, error: userError } = await supabase.auth.getUser()
    if (userError || !userResult.user) {
      setUser(null); setRole(null); setLoading(false); return
    }
    setUser(userResult.user)
    const { data: roleResult, error: roleError } = await supabase.rpc('current_employee_role')
    if (roleError || !['Admin','Manager'].includes(String(roleResult || ''))) {
      setRole(String(roleResult || ''))
      setError('This accounting workspace is available to Admin and Manager accounts only.')
      setLoading(false)
      return
    }
    setRole(String(roleResult))
    const [accountResult, entryResult, periodResult, productResult, variantResult, stockResult] = await Promise.all([
      supabase.from('acct_accounts').select('id,code,name,account_type,normal_balance,description,is_system,is_active').order('code'),
      supabase.from('acct_journal_entries').select('id,entry_no,entry_date,description,reference,source_type,status,created_at,acct_journal_lines(id,account_id,debit,credit,memo,acct_accounts(code,name,account_type))').order('entry_date', { ascending: false }).order('entry_no', { ascending: false }).limit(2000),
      supabase.from('acct_fiscal_periods').select('id,name,period_start,period_end,status').order('period_start', { ascending: false }),
      supabase.from('products').select('id,product_no,sku,name,category,cost_price,active').order('product_no'),
      supabase.from('product_variants').select('id,product_id,size,colour'),
      supabase.from('stock_balances').select('variant_id,quantity,reorder_level'),
    ])
    if (accountResult.error) setError(accountResult.error.message)
    else setAccounts((accountResult.data || []) as Account[])
    if (entryResult.error) setError(entryResult.error.message)
    else setEntries((entryResult.data || []) as unknown as Entry[])
    if (periodResult.error) setError(periodResult.error.message)
    else setPeriods((periodResult.data || []) as Period[])
    if (productResult.error) setError(productResult.error.message)
    if (variantResult.error) setError(variantResult.error.message)
    if (stockResult.error) setError(stockResult.error.message)
    if (!productResult.error && !variantResult.error && !stockResult.error) {
      const products = new Map((productResult.data || []).map((product: any) => [product.id, product]))
      const variants = new Map((variantResult.data || []).map((variant: any) => [variant.id, variant]))
      const rows = (stockResult.data || []).flatMap((stock: any) => {
        const variant: any = variants.get(stock.variant_id)
        const product: any = variant ? products.get(variant.product_id) : null
        if (!variant || !product) return []
        const unitCost = amount(product.cost_price)
        const quantity = amount(stock.quantity)
        return [{
          variant_id: variant.id,
          product_id: product.id,
          product_no: product.product_no,
          sku: product.sku,
          product_name: product.name,
          category: product.category,
          size: variant.size,
          colour: variant.colour,
          quantity,
          reorder_level: amount(stock.reorder_level),
          unit_cost: unitCost,
          estimated_value: quantity * unitCost,
          active: Boolean(product.active),
        }]
      })
      setInventoryRows(rows as InventoryRow[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadData()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) { setRole(null); setAccounts([]); setEntries([]); setPeriods([]); setInventoryRows([]) }
      else window.setTimeout(() => void loadData(), 0)
    })
    return () => listener.subscription.unsubscribe()
  }, [loadData])

  const postedEntries = useMemo(() => entries.filter(entry => entry.status === 'Posted'), [entries])
  const activeAccounts = useMemo(() => accounts.filter(account => account.is_active), [accounts])
  const accountById = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts])

  function totalsFor(start: string | null, end: string) {
    const totals = new Map<string, { debit: number; credit: number }>()
    for (const entry of postedEntries) {
      if (entry.entry_date > end || (start && entry.entry_date < start)) continue
      for (const line of entry.acct_journal_lines || []) {
        const current = totals.get(line.account_id) || { debit: 0, credit: 0 }
        current.debit += amount(line.debit)
        current.credit += amount(line.credit)
        totals.set(line.account_id, current)
      }
    }
    return totals
  }

  function pnlFor(start: string, end: string) {
    const totals = totalsFor(start, end)
    const values = accounts.map(account => {
      const total = totals.get(account.id) || { debit: 0, credit: 0 }
      return { account, debit: total.debit, credit: total.credit, balance: total.credit - total.debit }
    })
    const sumType = (type: AccountType, side: 'credit' | 'debit') => values.filter(row => row.account.account_type === type).reduce((sum, row) => sum + (side === 'credit' ? row.credit - row.debit : row.debit - row.credit), 0)
    const revenue = sumType('Revenue','credit')
    const contraRevenue = sumType('Contra Revenue','debit')
    const netSales = revenue - contraRevenue
    const cogs = sumType('Cost of Sales','debit')
    const grossProfit = netSales - cogs
    const operatingExpenses = sumType('Expense','debit')
    const otherIncome = sumType('Other Income','credit')
    const otherExpenses = sumType('Other Expense','debit')
    const netProfit = grossProfit - operatingExpenses + otherIncome - otherExpenses
    return { values, revenue, contraRevenue, netSales, cogs, grossProfit, operatingExpenses, otherIncome, otherExpenses, netProfit }
  }

  const pnl = useMemo(() => pnlFor(fromDate, toDate), [postedEntries, accounts, fromDate, toDate])
  const balance = useMemo(() => {
    const totals = totalsFor(null, asAtDate)
    const rows = accounts.map(account => {
      const total = totals.get(account.id) || { debit: 0, credit: 0 }
      const balanceValue = account.account_type === 'Asset' ? total.debit - total.credit : total.credit - total.debit
      return { account, debit: total.debit, credit: total.credit, balance: balanceValue }
    })
    const assets = rows.filter(row => row.account.account_type === 'Asset')
    const liabilities = rows.filter(row => row.account.account_type === 'Liability')
    const equity = rows.filter(row => row.account.account_type === 'Equity')
    const accumulatedProfit = pnlFor('1900-01-01', asAtDate).netProfit
    const totalAssets = assets.reduce((sum,row)=>sum+row.balance,0)
    const totalLiabilities = liabilities.reduce((sum,row)=>sum+row.balance,0)
    const equityBeforeProfit = equity.reduce((sum,row)=>sum+row.balance,0)
    const totalEquity = equityBeforeProfit + accumulatedProfit
    return { assets, liabilities, equity, accumulatedProfit, totalAssets, totalLiabilities, totalEquity, difference: totalAssets-totalLiabilities-totalEquity }
  }, [postedEntries, accounts, asAtDate])

  const trial = useMemo(() => {
    const totals = totalsFor(null, asAtDate)
    return accounts.map(account => {
      const total = totals.get(account.id) || { debit: 0, credit: 0 }
      const net = total.debit - total.credit
      return { account, debitBalance: Math.max(net,0), creditBalance: Math.max(-net,0) }
    }).filter(row => row.debitBalance > 0 || row.creditBalance > 0)
  }, [postedEntries, accounts, asAtDate])

  const selectedLedger = useMemo(() => {
    if (!selectedAccount) return []
    return postedEntries.flatMap(entry => (entry.acct_journal_lines || [])
      .filter(line => line.account_id === selectedAccount)
      .map(line => ({ entry, line })))
      .sort((a,b)=>a.entry.entry_date.localeCompare(b.entry.entry_date) || a.entry.entry_no.localeCompare(b.entry.entry_no))
  }, [postedEntries, selectedAccount])

  const dashboardPnl = useMemo(() => pnlFor(monthStart(), today()), [postedEntries, accounts])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) setError(loginError.message)
    else await loadData()
    setSaving(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setUser(null); setRole(null); setAccounts([]); setEntries([]); setPeriods([]); setInventoryRows([])
  }

  async function saveJournal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    const lines = journalLines.map(line => ({
      account_id: line.account_id,
      debit: amount(line.debit),
      credit: amount(line.credit),
      memo: line.memo || null,
    }))
    const { data, error: saveError } = await supabase.rpc('acct_create_journal_entry', {
      p_entry_date: journalDate,
      p_description: journalDescription,
      p_reference: journalReference,
      p_lines: lines,
      p_source_type: journalSource,
    })
    if (saveError) setError(saveError.message)
    else {
      setNotice('Journal entry posted successfully.')
      setShowJournal(false); setJournalDescription(''); setJournalReference('')
      setJournalLines([{ account_id:'', debit:'', credit:'', memo:'' },{ account_id:'', debit:'', credit:'', memo:'' }])
      await loadData()
    }
    setSaving(false)
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    const { error: saveError } = await supabase.from('acct_accounts').insert({
      code: accountForm.code.trim(), name: accountForm.name.trim(), account_type: accountForm.account_type,
      normal_balance: defaultNormalBalance(accountForm.account_type), description: accountForm.description.trim() || null,
    })
    if (saveError) setError(saveError.message)
    else {
      setNotice('Account created.')
      setAccountForm({ code:'', name:'', account_type:'Expense', description:'' })
      await loadData()
    }
    setSaving(false)
  }

  async function toggleAccount(account: Account) {
    if (role !== 'Admin' || account.is_system) return
    const { error: updateError } = await supabase.from('acct_accounts').update({ is_active: !account.is_active }).eq('id',account.id)
    if (updateError) setError(updateError.message)
    else { setNotice('Account status updated.'); await loadData() }
  }

  function openNewJournal(source: 'manual' | 'opening_balance') {
    setJournalSource(source)
    setJournalDate(source === 'opening_balance' ? (periods.find(p=>p.status==='Open')?.period_start || today()) : today())
    setJournalDescription(source === 'opening_balance' ? 'Opening balances' : '')
    setJournalReference(source === 'opening_balance' ? 'OPENING' : '')
    setJournalLines([{ account_id:'', debit:'', credit:'', memo:'' },{ account_id:'', debit:'', credit:'', memo:'' }])
    setShowJournal(true)
  }

  const journalDebit = journalLines.reduce((sum,line)=>sum+amount(line.debit),0)
  const journalCredit = journalLines.reduce((sum,line)=>sum+amount(line.credit),0)
  const journalBalanced = journalLines.length >= 2 && journalDebit > 0 && Math.abs(journalDebit-journalCredit) < 0.005 && journalLines.every(line=>line.account_id && ((amount(line.debit)>0 && amount(line.credit)===0)||(amount(line.credit)>0 && amount(line.debit)===0)))

  if (loading) return <div className="loading-screen"><div className="spinner"/><span>Loading accounting workspace…</span></div>

  if (!user) return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">CS</div>
        <p className="eyebrow">CLOTHING SHOP · FINANCE</p>
        <h1>Accounting Workspace</h1>
        <p className="muted">Secure double-entry accounting and financial statements.</p>
        <form onSubmit={handleLogin} className="login-form">
          <label>Email address<input name="email" type="email" autoComplete="username" required placeholder="owner@example.com"/></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required placeholder="Your ERP password"/></label>
          <button className="primary-button" disabled={saving}>{saving?'Signing in…':'Sign in'}</button>
        </form>
        {error && <div className="error-banner">{error}</div>}
        <p className="login-foot">Use the same Admin or Manager login as the ERP.</p>
      </section>
    </main>
  )

  if (!['Admin','Manager'].includes(role || '')) return <main className="login-shell"><section className="login-card"><h1>Access restricted</h1><p>{error || 'Admin or Manager access is required.'}</p><button className="secondary-button" onClick={handleSignOut}>Sign out</button></section></main>

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">CS</div><div><strong>Clothing Shop</strong><small>ACCOUNTING</small></div></div>
        {['WORKSPACE','REPORTS','ACCOUNTING'].map(group=><div className="nav-group" key={group}><p>{group}</p>{nav.filter(item=>item.group===group).map(item=><button key={item.id} className={tab===item.id?'nav-item active':'nav-item'} onClick={()=>setTab(item.id)}><span className="nav-dot"/>{item.label}</button>)}</div>)}
        <div className="sidebar-bottom"><span className="status-dot"/> Supabase connected <small>{role}</small><button onClick={handleSignOut}>Sign out</button></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div><span>Workspace</span><b>/</b><strong>{nav.find(item=>item.id===tab)?.label}</strong></div><div className="top-actions"><span className="user-chip">{user.email}</span><button className="icon-button" onClick={()=>void loadData()} title="Refresh data">↻</button></div></header>
        <div className="page-content">
          <div className="page-heading"><div><p className="eyebrow">FINANCIAL MANAGEMENT</p><h1>{nav.find(item=>item.id===tab)?.label}</h1><p className="muted">Double-entry accounting · Sri Lankan Rupees (LKR)</p></div>{tab==='journals'&&<button className="primary-button" onClick={()=>openNewJournal('manual')}>+ New journal</button>}{tab==='opening'&&<button className="primary-button" onClick={()=>openNewJournal('opening_balance')}>+ Enter opening balances</button>}</div>
          {notice&&<div className="success-banner">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
          {error&&<div className="error-banner">{error}<button onClick={()=>setError('')}>×</button></div>}

          {tab==='overview'&&<section className="view-stack">
            <div className="report-toolbar"><div><b>Current month</b><span>{monthStart()} to {today()}</span></div><button className="secondary-button" onClick={()=>setTab('profit')}>View Profit & Loss</button></div>
            <div className="metric-grid">
              <Metric label="Net sales" value={money(dashboardPnl.netSales)} hint="Revenue less discounts and returns"/>
              <Metric label="Gross profit" value={money(dashboardPnl.grossProfit)} hint="Net sales less cost of sales"/>
              <Metric label="Operating expenses" value={money(dashboardPnl.operatingExpenses)} hint="Posted expense journals"/>
              <Metric label="Net profit / (loss)" value={money(dashboardPnl.netProfit)} hint="For the current month"/>
            </div>
            <div className="panel"><div className="panel-heading"><div><h2>Accounting setup</h2><p>Set opening balances before relying on the Balance Sheet.</p></div><span className="tag">Double entry</span></div><div className="setup-grid"><div><strong>{accounts.length}</strong><span>Accounts in chart</span></div><div><strong>{postedEntries.length}</strong><span>Posted journal entries</span></div><div><strong>{periods.filter(p=>p.status==='Open').length}</strong><span>Open fiscal periods</span></div><div><strong>{money(Math.abs(balance.difference))}</strong><span>Balance sheet difference</span></div></div><p className="helper-text">This workspace is separate from the retail ERP screens. New ERP sales, returns, customer receipts, purchases, supplier payments, expenses and paid payroll are automatically posted to Accounting. Historical transactions are not backfilled; enter and reconcile opening balances before relying on the Balance Sheet.</p></div>
            <div className="panel"><div className="panel-heading"><div><h2>Recent journal entries</h2><p>Latest posted accounting records</p></div><button className="text-button" onClick={()=>setTab('journals')}>View all →</button></div><EntryTable entries={postedEntries.slice(0,6)} /></div>
          </section>}

          {tab==='profit'&&<section className="view-stack">
            <div className="report-toolbar"><div className="date-field"><label>From<input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label><label>To<input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label></div><div className="toolbar-buttons"><button className="secondary-button" onClick={()=>window.print()}>Print</button><button className="secondary-button" onClick={()=>downloadCsv('profit-and-loss.csv',[['Account','Amount'],['Sales Revenue',pnl.revenue],['Sales Discounts and Returns',-pnl.contraRevenue],['Net Sales',pnl.netSales],['Cost of Goods Sold',-pnl.cogs],['Gross Profit',pnl.grossProfit],['Operating Expenses',-pnl.operatingExpenses],['Other Income',pnl.otherIncome],['Other Expenses',-pnl.otherExpenses],['Net Profit / (Loss)',pnl.netProfit]])}>Export CSV</button></div></div>
            <div className="statement panel"><div className="statement-title"><p className="eyebrow">FINANCIAL STATEMENT</p><h2>Profit & Loss Statement</h2><p>For the period {fromDate} to {toDate}</p></div>
              <StatementRow label="Sales Revenue" value={pnl.revenue}/><StatementRow label="Less: Discounts and Returns" value={-pnl.contraRevenue} negative/><StatementTotal label="Net Sales" value={pnl.netSales}/>
              <StatementRow label="Cost of Goods Sold" value={-pnl.cogs} negative/><StatementTotal label="Gross Profit" value={pnl.grossProfit}/>
              <StatementRow label="Operating Expenses" value={-pnl.operatingExpenses} negative/><StatementRow label="Other Income" value={pnl.otherIncome}/><StatementRow label="Other Expenses" value={-pnl.otherExpenses} negative/>
              <StatementTotal label="Net Profit / (Loss)" value={pnl.netProfit} strong/>
              <p className="statement-note">Only posted journal entries dated within the selected period are included. ERP transactions are not automatically synced yet.</p>
            </div>
            <AccountBreakdown title="Revenue and income accounts" rows={pnl.values.filter(row=>['Revenue','Contra Revenue','Other Income'].includes(row.account.account_type))}/>
            <AccountBreakdown title="Cost and expense accounts" rows={pnl.values.filter(row=>['Cost of Sales','Expense','Other Expense'].includes(row.account.account_type))}/>
          </section>}

          {tab==='balance'&&<section className="view-stack">
            <div className="report-toolbar"><label className="single-date">As at date<input type="date" value={asAtDate} onChange={e=>setAsAtDate(e.target.value)}/></label><div className="toolbar-buttons"><button className="secondary-button" onClick={()=>window.print()}>Print</button><button className="secondary-button" onClick={()=>downloadCsv('balance-sheet.csv',[['Section','Account','Amount'],...balance.assets.map(r=>['Assets',r.account.name,r.balance]),...balance.liabilities.map(r=>['Liabilities',r.account.name,r.balance]),...balance.equity.map(r=>['Equity',r.account.name,r.balance]),['Equity','Accumulated profit (unclosed)',balance.accumulatedProfit],['Total assets','',balance.totalAssets],['Total liabilities and equity','',balance.totalLiabilities+balance.totalEquity]])}>Export CSV</button></div></div>
            <div className="metric-grid three"><Metric label="Total assets" value={money(balance.totalAssets)}/><Metric label="Total liabilities" value={money(balance.totalLiabilities)}/><Metric label="Total equity" value={money(balance.totalEquity)}/></div>
            <div className="statement panel"><div className="statement-title"><p className="eyebrow">FINANCIAL POSITION</p><h2>Balance Sheet</h2><p>As at {asAtDate}</p></div>
              <StatementSection title="ASSETS" rows={balance.assets.map(r=>({label:r.account.code+' · '+r.account.name,value:r.balance}))} total={balance.totalAssets}/>
              <StatementSection title="LIABILITIES" rows={balance.liabilities.map(r=>({label:r.account.code+' · '+r.account.name,value:r.balance}))} total={balance.totalLiabilities}/>
              <StatementSection title="EQUITY" rows={[...balance.equity.map(r=>({label:r.account.code+' · '+r.account.name,value:r.balance})),{label:'Accumulated profit (unclosed)',value:balance.accumulatedProfit}]} total={balance.totalEquity}/>
              <StatementTotal label="Total liabilities and equity" value={balance.totalLiabilities+balance.totalEquity} strong/>
              <div className={Math.abs(balance.difference)<0.01?'balance-status ok':'balance-status warning'}>{Math.abs(balance.difference)<0.01?'✓ Balance Sheet is balanced':'! Difference: '+money(balance.difference)}</div>
              <p className="statement-note">Accumulated profit is calculated from all posted income and expense journals since the beginning of the accounting records. Complete opening balances and later ERP synchronisation before using this as a formal statement.</p>
            </div>
          </section>}

          {tab==='trial'&&<section className="view-stack"><div className="report-toolbar"><label className="single-date">As at date<input type="date" value={asAtDate} onChange={e=>setAsAtDate(e.target.value)}/></label><button className="secondary-button" onClick={()=>downloadCsv('trial-balance.csv',[['Code','Account','Debit','Credit'],...trial.map(r=>[r.account.code,r.account.name,r.debitBalance,r.creditBalance])])}>Export CSV</button></div><div className="panel"><div className="panel-heading"><div><h2>Trial Balance</h2><p>Posted account balances up to {asAtDate}</p></div></div><table><thead><tr><th>CODE</th><th>ACCOUNT</th><th className="num">DEBIT</th><th className="num">CREDIT</th></tr></thead><tbody>{trial.map(row=><tr key={row.account.id}><td>{row.account.code}</td><td>{row.account.name}</td><td className="num">{row.debitBalance?money(row.debitBalance):'—'}</td><td className="num">{row.creditBalance?money(row.creditBalance):'—'}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>TOTAL</th><th className="num">{money(trial.reduce((s,r)=>s+r.debitBalance,0))}</th><th className="num">{money(trial.reduce((s,r)=>s+r.creditBalance,0))}</th></tr></tfoot></table></div></section>}

          {tab==='inventory'&&<section className="view-stack">
            <div className="metric-grid">
              <Metric label="Estimated inventory value" value={money(inventoryRows.reduce((sum,row)=>sum+row.estimated_value,0))} hint="Current on-hand quantity × product cost price"/>
              <Metric label="Units on hand" value={inventoryRows.reduce((sum,row)=>sum+row.quantity,0).toLocaleString('en-LK')} hint="Across all stock variants"/>
              <Metric label="Stock variants" value={inventoryRows.length.toLocaleString('en-LK')} hint="Variants with stock balance records"/>
              <Metric label="Low-stock variants" value={inventoryRows.filter(row=>row.quantity<=row.reorder_level).length.toLocaleString('en-LK')} hint="At or below reorder level"/>
            </div>
            <div className="inventory-warning"><strong>Estimated value only — not an opening balance.</strong><span>This view uses the current product cost price multiplied by the current stock balance. It does not post journal entries, change stock, or create opening balances. Confirm purchase costs and the costing method before using this figure as a formal inventory valuation.</span></div>
            <div className="panel">
              <div className="panel-heading"><div><h2>Inventory by product and variant</h2><p>Live stock quantities from the ERP database</p></div><button className="secondary-button" onClick={()=>downloadCsv('inventory-valuation-estimate.csv',[['Product No','SKU','Product','Size','Colour','Quantity','Unit Cost','Estimated Value','Status'],...inventoryRows.map(row=>[row.product_no,row.sku,row.product_name,row.size,row.colour,row.quantity,row.unit_cost,row.estimated_value,row.quantity<=row.reorder_level?'Low stock':'In stock'])])}>Export CSV</button></div>
              {inventoryRows.length===0?<div className="empty-state">No stock balance records found.</div>:<table><thead><tr><th>PRODUCT</th><th>VARIANT</th><th className="num">QTY</th><th className="num">UNIT COST</th><th className="num">ESTIMATED VALUE</th><th>STATUS</th></tr></thead><tbody>{inventoryRows.slice().sort((a,b)=>a.product_no.localeCompare(b.product_no)||a.size.localeCompare(b.size)||a.colour.localeCompare(b.colour)).map(row=><tr key={row.variant_id}><td><strong>{row.product_no} · {row.sku}</strong><small className="cell-sub">{row.product_name}{row.category?' · '+row.category:''}</small></td><td>{row.size} / {row.colour}</td><td className="num">{row.quantity.toLocaleString('en-LK')}</td><td className="num">{money(row.unit_cost)}</td><td className="num"><strong>{money(row.estimated_value)}</strong></td><td><span className={row.quantity<=row.reorder_level?'status-pill':'status-pill active'}>{row.quantity<=row.reorder_level?'Low stock':'In stock'}</span></td></tr>)}</tbody><tfoot><tr><th colSpan={2}>TOTAL</th><th className="num">{inventoryRows.reduce((sum,row)=>sum+row.quantity,0).toLocaleString('en-LK')}</th><th></th><th className="num">{money(inventoryRows.reduce((sum,row)=>sum+row.estimated_value,0))}</th><th></th></tr></tfoot></table>}
            </div>
          </section>}

          {tab==='journals'&&<section className="view-stack"><div className="panel"><div className="panel-heading"><div><h2>Journal Register</h2><p>All posted and reversed journal entries</p></div><span className="tag">{entries.length} entries</span></div><EntryTable entries={entries}/></div><div className="panel"><div className="panel-heading"><div><h2>General Ledger</h2><p>Select an account to view its transaction history.</p></div></div><div className="ledger-filter"><select value={selectedAccount} onChange={e=>setSelectedAccount(e.target.value)}><option value="">Select account</option>{accounts.map(account=><option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></div>{selectedAccount&&<table><thead><tr><th>DATE</th><th>ENTRY</th><th>DESCRIPTION</th><th className="num">DEBIT</th><th className="num">CREDIT</th></tr></thead><tbody>{selectedLedger.map(({entry,line})=><tr key={line.id}><td>{entry.entry_date}</td><td>{entry.entry_no}</td><td>{line.memo||entry.description}</td><td className="num">{amount(line.debit)?money(amount(line.debit)):'—'}</td><td className="num">{amount(line.credit)?money(amount(line.credit)):'—'}</td></tr>)}</tbody></table>}</div></section>}

          {tab==='opening'&&<section className="view-stack"><div className="panel opening-panel"><div className="opening-icon">OB</div><div><h2>Opening Balances</h2><p>Enter the balances that existed when you started using this accounting system. Every opening journal must have equal debit and credit totals.</p><ul><li>Debit: cash, bank, inventory, receivables and other assets.</li><li>Credit: supplier balances, loans, capital and retained earnings.</li><li>Use the correct opening date and keep supporting documents.</li></ul><button className="primary-button" onClick={()=>openNewJournal('opening_balance')}>+ Create opening balance journal</button></div></div><div className="panel"><div className="panel-heading"><div><h2>Existing opening entries</h2><p>Previously posted opening balance journals</p></div></div><EntryTable entries={entries.filter(entry=>entry.source_type==='opening_balance')}/></div></section>}

          {tab==='accounts'&&<section className="view-stack"><div className="panel"><div className="panel-heading"><div><h2>Chart of Accounts</h2><p>Account codes and financial statement classifications</p></div><span className="tag">{accounts.length} accounts</span></div><table><thead><tr><th>CODE</th><th>ACCOUNT NAME</th><th>TYPE</th><th>NORMAL BALANCE</th><th>STATUS</th><th></th></tr></thead><tbody>{accounts.map(account=><tr key={account.id}><td>{account.code}</td><td><strong>{account.name}</strong>{account.description&&<small className="cell-sub">{account.description}</small>}</td><td>{account.account_type}</td><td>{account.normal_balance}</td><td><span className={account.is_active?'status-pill active':'status-pill'}>{account.is_active?'Active':'Inactive'}</span></td><td>{role==='Admin'&&!account.is_system&&<button className="text-button" onClick={()=>void toggleAccount(account)}>{account.is_active?'Deactivate':'Activate'}</button>}</td></tr>)}</tbody></table></div>
            {role==='Admin'&&<form className="panel account-form" onSubmit={saveAccount}><h2>Add account</h2><div className="form-grid"><label>Account code<input required value={accountForm.code} onChange={e=>setAccountForm({...accountForm,code:e.target.value})} placeholder="e.g. 6950"/></label><label>Account name<input required value={accountForm.name} onChange={e=>setAccountForm({...accountForm,name:e.target.value})} placeholder="e.g. Cleaning expense"/></label><label>Account type<select value={accountForm.account_type} onChange={e=>setAccountForm({...accountForm,account_type:e.target.value as AccountType})}>{accountTypes.map(type=><option key={type}>{type}</option>)}</select></label><label>Description<input value={accountForm.description} onChange={e=>setAccountForm({...accountForm,description:e.target.value})} placeholder="Optional"/></label></div><p className="helper-text">Normal balance is selected automatically based on account type. System accounts cannot be deactivated.</p><button className="primary-button" disabled={saving}>Save account</button></form>}
          </section>}
          <footer className="page-footer">Clothing Shop Accounting · LKR · Access restricted to Admin and Manager</footer>
        </div>
      </main>

      {showJournal&&<div className="modal-backdrop"><form className="journal-modal" onSubmit={saveJournal}><div className="modal-heading"><div><p className="eyebrow">{journalSource==='opening_balance'?'OPENING BALANCES':'DOUBLE ENTRY'}</p><h2>{journalSource==='opening_balance'?'Opening Balance Journal':'New Journal Entry'}</h2></div><button type="button" className="icon-button" onClick={()=>setShowJournal(false)}>×</button></div><div className="form-grid"><label>Entry date<input type="date" required value={journalDate} onChange={e=>setJournalDate(e.target.value)}/></label><label>Reference<input value={journalReference} onChange={e=>setJournalReference(e.target.value)} placeholder="Optional reference"/></label><label className="full-span">Description<input required value={journalDescription} onChange={e=>setJournalDescription(e.target.value)} placeholder="Describe this transaction"/></label></div><div className="line-editor"><div className="line-head"><span>ACCOUNT</span><span>DEBIT (LKR)</span><span>CREDIT (LKR)</span><span>MEMO</span><span/></div>{journalLines.map((line,index)=><div className="line-row" key={index}><select required value={line.account_id} onChange={e=>setJournalLines(old=>old.map((item,i)=>i===index?{...item,account_id:e.target.value}:item))}><option value="">Choose account</option>{activeAccounts.map(account=><option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select><input type="number" min="0" step="0.01" value={line.debit} onChange={e=>setJournalLines(old=>old.map((item,i)=>i===index?{...item,debit:e.target.value,credit:e.target.value?'':item.credit}:item))} placeholder="0.00"/><input type="number" min="0" step="0.01" value={line.credit} onChange={e=>setJournalLines(old=>old.map((item,i)=>i===index?{...item,credit:e.target.value,debit:e.target.value?'':item.debit}:item))} placeholder="0.00"/><input value={line.memo||''} onChange={e=>setJournalLines(old=>old.map((item,i)=>i===index?{...item,memo:e.target.value}:item))} placeholder="Optional"/><button type="button" className="remove-line" disabled={journalLines.length<=2} onClick={()=>setJournalLines(old=>old.filter((_,i)=>i!==index))}>×</button></div>)}</div><button type="button" className="text-button add-line" onClick={()=>setJournalLines(old=>[...old,{account_id:'',debit:'',credit:'',memo:''}])}>+ Add line</button><div className="journal-totals"><span>Debits <b>{money(journalDebit)}</b></span><span>Credits <b>{money(journalCredit)}</b></span><strong className={journalBalanced?'balanced':'unbalanced'}>{journalBalanced?'Balanced':'Not balanced'}</strong></div><p className="helper-text">Posted entries are permanent accounting records. To correct one, create a new journal with the opposite debit and credit lines and reference the original entry; never delete posted transactions.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setShowJournal(false)}>Cancel</button><button className="primary-button" disabled={saving||!journalBalanced}>{saving?'Posting…':'Post journal'}</button></div></form></div>}
    </div>
  )
}

function Metric({label,value,hint}:{label:string;value:string;hint?:string}) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong>{hint&&<small>{hint}</small>}</div>
}
function StatementRow({label,value,negative=false}:{label:string;value:number;negative?:boolean}) {
  return <div className="statement-row"><span>{label}</span><strong className={negative?'negative':''}>{money(value)}</strong></div>
}
function StatementTotal({label,value,strong=false}:{label:string;value:number;strong?:boolean}) {
  return <div className={strong?'statement-total strong':'statement-total'}><span>{label}</span><strong>{money(value)}</strong></div>
}
function StatementSection({title,rows,total}:{title:string;rows:{label:string;value:number}[];total:number}) {
  return <div className="statement-section"><h3>{title}</h3>{rows.map((row,index)=><StatementRow key={index} label={row.label} value={row.value}/>) }<StatementTotal label={'Total '+title.toLowerCase()} value={total}/></div>
}
function AccountBreakdown({title,rows}:{title:string;rows:{account:Account;debit:number;credit:number;balance:number}[]}) {
  return <div className="panel"><div className="panel-heading"><div><h2>{title}</h2></div></div><table><thead><tr><th>CODE</th><th>ACCOUNT</th><th className="num">DEBIT</th><th className="num">CREDIT</th><th className="num">NET BALANCE</th></tr></thead><tbody>{rows.filter(row=>row.debit||row.credit).map(row=><tr key={row.account.id}><td>{row.account.code}</td><td>{row.account.name}</td><td className="num">{money(row.debit)}</td><td className="num">{money(row.credit)}</td><td className="num">{money(row.account.account_type==='Revenue'||row.account.account_type==='Other Income'?row.credit-row.debit:row.debit-row.credit)}</td></tr>)}</tbody></table></div>
}
function EntryTable({entries}:{entries:Entry[]}) {
  if(!entries.length) return <div className="empty-state">No journal entries yet. Add opening balances or create a journal to start reporting.</div>
  return <table><thead><tr><th>DATE</th><th>ENTRY NO.</th><th>DESCRIPTION</th><th>REFERENCE</th><th>STATUS</th><th className="num">DEBIT</th><th className="num">CREDIT</th></tr></thead><tbody>{entries.map(entry=>{const debit=(entry.acct_journal_lines||[]).reduce((s,line)=>s+amount(line.debit),0);const credit=(entry.acct_journal_lines||[]).reduce((s,line)=>s+amount(line.credit),0);return <tr key={entry.id}><td>{entry.entry_date}</td><td><strong>{entry.entry_no}</strong></td><td>{entry.description}</td><td>{entry.reference||'—'}</td><td><span className={entry.status==='Posted'?'status-pill active':'status-pill'}>{entry.status}</span></td><td className="num">{money(debit)}</td><td className="num">{money(credit)}</td></tr>})}</tbody></table>
}
export default App
