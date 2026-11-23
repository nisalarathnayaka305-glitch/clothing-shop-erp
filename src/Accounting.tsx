import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, money } from './lib'

type Account = { id:string; code:string; name:string; account_type:string; normal_balance:string; is_active:boolean }
type JournalLine = { id:string; account_id:string; debit:number; credit:number; description:string|null; chart_of_accounts?:Account }
type Journal = { id:string; entry_no:string; entry_date:string; description:string; source_type:string; status:string; journal_entry_lines:JournalLine[] }

const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo'}).format(new Date())
const startOfYear = () => today().slice(0,4)+'-01-01'
const fmt = (n:number) => money(Number(n||0))
const tabs = ['Dashboard','Journal Entries','General Ledger','Trial Balance','Profit & Loss','Balance Sheet','Chart of Accounts','Periods & Opening']

export default function AccountingWorkspace({session,role}:{session:Session|null;role:string|null}) {
  const [tab,setTab]=useState('Dashboard')
  const [accounts,setAccounts]=useState<Account[]>([])
  const [journals,setJournals]=useState<Journal[]>([])
  const [periods,setPeriods]=useState<any[]>([])
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [from,setFrom]=useState(startOfYear())
  const [to,setTo]=useState(today())
  const [accountFilter,setAccountFilter]=useState('')
  const [search,setSearch]=useState('')
  const [opening,setOpening]=useState<any|null>(null)
  const [openingDate,setOpeningDate]=useState('')
  const [periodForm,setPeriodForm]=useState({name:'',period_start:startOfYear(),period_end:today()})
  const [manual,setManual]=useState({entry_date:today(),description:'',lines:[{account_code:'1000',debit:'',credit:'',description:''},{account_code:'3000',debit:'',credit:'',description:''}]})

  async function loadAll() {
    if(!supabase||!session)return
    setBusy(true)
    const [a,p]=await Promise.all([
      supabase.from('chart_of_accounts').select('id,code,name,account_type,normal_balance,is_active').order('code'),
      supabase.from('accounting_periods').select('*').order('period_start',{ascending:false})
    ])
    const journalRows:Journal[]=[]
    let journalError:string|null=null
    for(let offset=0;!journalError;offset+=500){
      const {data,error}=await supabase.from('journal_entries')
        .select('id,entry_no,entry_date,description,source_type,status,journal_entry_lines(id,account_id,debit,credit,description,chart_of_accounts(id,code,name,account_type,normal_balance,is_active))')
        .order('entry_date',{ascending:false}).order('entry_no',{ascending:false})
        .range(offset,offset+499)
      if(error){journalError=error.message;break}
      const page=(data||[]) as unknown as Journal[]
      journalRows.push(...page)
      if(page.length<500)break
    }
    if(a.error||journalError||p.error)setNotice(a.error?.message||journalError||p.error?.message||'Unable to load accounting data.')
    else {setAccounts((a.data||[]) as Account[]);setJournals(journalRows);setPeriods(p.data||[])}
    setBusy(false)
  }
  useEffect(()=>{void loadAll()},[session?.user.id])

  const filteredJournals=useMemo(()=>journals.filter(j=>j.entry_date>=from&&j.entry_date<=to&&(`${j.entry_no} ${j.description} ${j.source_type}`).toLowerCase().includes(search.toLowerCase())),[journals,from,to,search])
  const allLines=useMemo(()=>filteredJournals.flatMap(j=>j.journal_entry_lines.map(l=>({...l,entry_no:j.entry_no,entry_date:j.entry_date,entry_description:j.description,source_type:j.source_type}))),[filteredJournals])
  const totals=useMemo(()=>{
    const map=new Map<string,{debit:number;credit:number;account:Account}>()
    for(const a of accounts)map.set(a.id,{debit:0,credit:0,account:a})
    for(const l of allLines){const row=map.get(l.account_id);if(row){row.debit+=Number(l.debit);row.credit+=Number(l.credit)}}
    return [...map.values()].map(x=>({...x,debit:Number(x.debit.toFixed(2)),credit:Number(x.credit.toFixed(2)),balance:Number((x.account.normal_balance==='debit'?x.debit-x.credit:x.credit-x.debit).toFixed(2))}))
  },[accounts,allLines])
  const debitTotal=allLines.reduce((n,l)=>n+Number(l.debit),0)
  const creditTotal=allLines.reduce((n,l)=>n+Number(l.credit),0)
  const balanceLines=journals.filter(j=>j.entry_date<=to).flatMap(j=>j.journal_entry_lines)
  const balanceTotals=accounts.map(account=>{
    const lines=balanceLines.filter(line=>line.account_id===account.id)
    const debit=lines.reduce((n,line)=>n+Number(line.debit),0)
    const credit=lines.reduce((n,line)=>n+Number(line.credit),0)
    return {account,debit,credit,balance:account.normal_balance==='debit'?debit-credit:credit-debit}
  })
  const balanceAccount=(code:string)=>balanceTotals.filter(x=>x.account.code===code).reduce((n,x)=>n+x.credit-x.debit,0)
  const balanceContraRevenue=balanceTotals.filter(x=>['4010','4020'].includes(x.account.code)).reduce((n,x)=>n+x.debit-x.credit,0)
  const balanceExpense=balanceTotals.filter(x=>x.account.account_type==='Expense').reduce((n,x)=>n+x.debit-x.credit,0)
  const balanceNetProfit=balanceAccount('4000')-balanceContraRevenue+balanceAccount('4100')-balanceExpense
  const salesRevenue=totals.filter(x=>x.account.code==='4000').reduce((n,x)=>n+x.credit-x.debit,0)
  const salesContra=totals.filter(x=>['4010','4020'].includes(x.account.code)).reduce((n,x)=>n+x.debit-x.credit,0)
  const netSales=salesRevenue-salesContra
  const cogs=totals.filter(x=>x.account.code==='5000').reduce((n,x)=>n+x.debit-x.credit,0)
  const grossProfit=netSales-cogs
  const otherIncome=totals.filter(x=>x.account.code==='4100').reduce((n,x)=>n+x.credit-x.debit,0)
  const operatingExpenses=totals.filter(x=>x.account.account_type==='Expense'&&x.account.code!=='5000').reduce((n,x)=>n+x.debit-x.credit,0)
  const netProfit=grossProfit+otherIncome-operatingExpenses
  const balanceType=(type:string)=>balanceTotals.filter(x=>x.account.account_type===type).reduce((n,x)=>n+x.balance,0)
  const balanceAssets=balanceType('Asset'),balanceLiabilities=balanceType('Liability'),balanceEquity=balanceType('Equity')
  const totalBalanceEquity=balanceEquity+balanceNetProfit
  const balanced=Math.abs(debitTotal-creditTotal)<0.005
  const balanced=Math.abs(debitTotal-creditTotal)<0.005

  async function refreshOpening(date=openingDate) {
    if(!supabase)return
    setBusy(true)
    const {data,error}=await supabase.rpc('accounting_inventory_opening_estimate',{p_entry_date:date||null})
    if(error)setNotice(error.message);else setOpening(data)
    setBusy(false)
  }
  async function postOpening() {
    if(!supabase)return
    if(!window.confirm('Post the calculated opening inventory journal? This creates a permanent posted journal entry.'))return
    setBusy(true)
    const {data,error}=await supabase.rpc('post_inventory_opening_balance',{p_entry_date:openingDate||null})
    if(error)setNotice(error.message)
    else {setNotice(`Opening inventory posted: ${data.entry_no} · ${fmt(Number(data.amount))}`);await loadAll();await refreshOpening(openingDate)}
    setBusy(false)
  }
  async function saveManual(e:FormEvent) {
    e.preventDefault()
    if(!supabase)return
    const lines=manual.lines.map(x=>({account_code:x.account_code,debit:Number(x.debit||0),credit:Number(x.credit||0),description:x.description||null}))
    const dr=lines.reduce((n,x)=>n+x.debit,0),cr=lines.reduce((n,x)=>n+x.credit,0)
    if(!manual.description.trim()||lines.length<2||Math.abs(dr-cr)>0.005||dr<=0){setNotice('Enter a description and at least two balanced journal lines.');return}
    setBusy(true)
    const {data,error}=await supabase.rpc('post_manual_journal',{p_entry_date:manual.entry_date,p_description:manual.description.trim(),p_lines:lines})
    if(error)setNotice(error.message)
    else {setNotice(`Journal ${data.entry_no} posted successfully.`);setManual({entry_date:today(),description:'',lines:[{account_code:'1000',debit:'',credit:'',description:''},{account_code:'3000',debit:'',credit:'',description:''}]});await loadAll()}
    setBusy(false)
  }
  async function createPeriod(e:FormEvent) {
    e.preventDefault();if(!supabase)return
    if(!periodForm.name.trim()||periodForm.period_end<periodForm.period_start){setNotice('Enter a valid accounting period.');return}
    setBusy(true)
    const {error}=await supabase.from('accounting_periods').insert({...periodForm,created_by:session?.user.id})
    if(error)setNotice(error.message);else{setNotice('Accounting period created.');setPeriodForm({name:'',period_start:startOfYear(),period_end:today()});await loadAll()}
    setBusy(false)
  }
  async function closePeriod(id:string) {
    if(!supabase||!window.confirm('Close this accounting period? Further journal postings dated within it will be blocked.'))return
    setBusy(true);const {error}=await supabase.rpc('close_accounting_period',{p_period_id:id})
    if(error)setNotice(error.message);else{setNotice('Accounting period closed.');await loadAll()}
    setBusy(false)
  }
  const addLine=()=>setManual(x=>({...x,lines:[...x.lines,{account_code:'1000',debit:'',credit:'',description:''}]}))
  const updateLine=(i:number,key:string,value:string)=>setManual(x=>({...x,lines:x.lines.map((line,n)=>n===i?{...line,[key]:value}:line)}))
  const activePeriod=periods.find(p=>p.status==='Open'&&p.period_start<=today()&&p.period_end>=today())

  return <div className="accounting-workspace">
    <div className="heading"><div><p className="eyebrow">FINANCIAL MANAGEMENT</p><h1>Accounting</h1><p>Double-entry books, automatically posted from ERP transactions.</p></div><button onClick={()=>void loadAll()} disabled={busy}>{busy?'Loading…':'Refresh accounting'}</button></div>
    {notice&&<p className="notice">{notice}<button className="dismiss" onClick={()=>setNotice('')}>×</button></p>}
    <div className="accounting-tabs">{tabs.map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</div>
    <div className="accounting-filters"><label>From<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label><span className="muted">Reports use posted journal entries in this date range.</span></div>

    {tab==='Dashboard'&&<>
      <div className="stats accounting-stats">
        {[[ 'Total Debits',fmt(debitTotal) ],['Total Credits',fmt(creditTotal)],['Net Profit / (Loss)',fmt(netProfit)],['Journal Entries',String(filteredJournals.length)]].map(([label,value])=><article key={label}><small>{label}</small><h2>{value}</h2></article>)}
      </div>
      <div className="dashboard-grid">
        <article><h3>Financial position</h3><div className="performance-list"><div><span>Assets (as at {to})</span><b>{fmt(balanceAssets)}</b></div><div><span>Liabilities</span><b>{fmt(balanceLiabilities)}</b></div><div><span>Equity including current earnings</span><b>{fmt(totalBalanceEquity)}</b></div><div className="performance-total"><span>Liabilities + Equity</span><b>{fmt(balanceLiabilities+totalBalanceEquity)}</b></div></div></article>
        <article><h3>Trial balance control</h3><div className="performance-list"><div><span>Total debits</span><b>{fmt(debitTotal)}</b></div><div><span>Total credits</span><b>{fmt(creditTotal)}</b></div><div className="performance-total"><span>Difference</span><b>{fmt(debitTotal-creditTotal)}</b></div></div><p className={balanced?'stock-ok':'stock-low'}>{balanced?'Debits and credits are balanced':'Trial balance is not balanced'}</p></article>
      </div>
      <article><div className="toolbar"><h3>Recent journal entries</h3><button onClick={()=>setTab('Journal Entries')}>View all</button></div><JournalTable rows={journals.slice(0,12)}/></article>
    </>}
    {tab==='Journal Entries'&&<>
      <article><div className="toolbar"><h3>Posted journal entries</h3><input placeholder="Search entry, source or description…" value={search} onChange={e=>setSearch(e.target.value)}/></div><JournalTable rows={filteredJournals}/></article>
      <article><h3>Post manual journal</h3><p className="muted">Admin and Manager can post balanced adjustment journals. Posted journals cannot be edited or deleted.</p>
        {['Admin','Manager'].includes(role||'')?<form onSubmit={saveManual} className="accounting-manual-form">
          <div className="purchase-meta"><label>Date<input required type="date" value={manual.entry_date} onChange={e=>setManual({...manual,entry_date:e.target.value})}/></label><label>Description<input required value={manual.description} onChange={e=>setManual({...manual,description:e.target.value})}/></label></div>
          <div className="tablewrap"><table><thead><tr><th>ACCOUNT</th><th>DESCRIPTION</th><th>DEBIT (LKR)</th><th>CREDIT (LKR)</th></tr></thead><tbody>{manual.lines.map((line,i)=><tr key={i}><td><select value={line.account_code} onChange={e=>updateLine(i,'account_code',e.target.value)}>{accounts.filter(a=>a.is_active).map(a=><option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></td><td><input value={line.description} onChange={e=>updateLine(i,'description',e.target.value)}/></td><td><input type="number" min="0" step="0.01" value={line.debit} onChange={e=>updateLine(i,'debit',e.target.value)}/></td><td><input type="number" min="0" step="0.01" value={line.credit} onChange={e=>updateLine(i,'credit',e.target.value)}/></td></tr>)}</tbody></table></div>
          <button type="button" onClick={addLine}>Add line</button> <button className="primary" disabled={busy}>Post journal</button>
        </form>:<p className="muted">Accounting journal posting is restricted to Admin and Manager roles.</p>}
      </article>
    </>}
    {tab==='General Ledger'&&<article><div className="toolbar"><h3>General ledger</h3><select value={accountFilter} onChange={e=>setAccountFilter(e.target.value)}><option value="">All accounts</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></div><div className="tablewrap"><table><thead><tr><th>DATE</th><th>ENTRY</th><th>ACCOUNT</th><th>DESCRIPTION</th><th>DEBIT</th><th>CREDIT</th></tr></thead><tbody>{allLines.filter(l=>!accountFilter||l.account_id===accountFilter).map((l:any,i:number)=><tr key={l.id||i}><td>{l.entry_date}</td><td>{l.entry_no}</td><td>{l.chart_of_accounts?.code} · {l.chart_of_accounts?.name}</td><td>{l.description||l.entry_description}</td><td>{fmt(Number(l.debit))}</td><td>{fmt(Number(l.credit))}</td></tr>)}{allLines.filter(l=>!accountFilter||l.account_id===accountFilter).length===0&&<tr><td colSpan={6}>No ledger activity in this period.</td></tr>}</tbody></table></div></article>}
    {tab==='Trial Balance'&&<article><h3>Trial balance</h3><p className="muted">Cumulative posted balances up to {to}.</p><div className="tablewrap"><table><thead><tr><th>CODE</th><th>ACCOUNT</th><th>TYPE</th><th>DEBIT BALANCE</th><th>CREDIT BALANCE</th></tr></thead><tbody>{balanceTotals.filter(x=>x.debit!==x.credit).map(x=><tr key={x.account.id}><td>{x.account.code}</td><td>{x.account.name}</td><td>{x.account.account_type}</td><td>{fmt(Math.max(0,x.debit-x.credit))}</td><td>{fmt(Math.max(0,x.credit-x.debit))}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>TOTAL</th><th>{fmt(balanceTotals.reduce((n,x)=>n+Math.max(0,x.debit-x.credit),0))}</th><th>{fmt(balanceTotals.reduce((n,x)=>n+Math.max(0,x.credit-x.debit),0))}</th></tr></tfoot></table></div></article>}
    {tab==='Profit & Loss'&&<article><h3>Profit & Loss Statement</h3><p className="muted">{from} to {to}</p><div className="financial-statement"><div><span>Sales revenue</span><b>{fmt(salesRevenue)}</b></div><div><span>Less: sales discounts and returns</span><b>{fmt(salesContra)}</b></div><div className="financial-total"><span>Net sales</span><b>{fmt(netSales)}</b></div><div><span>Cost of goods sold</span><b>{fmt(cogs)}</b></div><div className="financial-total"><span>Gross profit</span><b>{fmt(grossProfit)}</b></div><div><span>Other income / inventory adjustment gains</span><b>{fmt(otherIncome)}</b></div><div><span>Operating expenses</span><b>{fmt(operatingExpenses)}</b></div><div className="financial-total"><span>Net profit / (loss)</span><b>{fmt(netProfit)}</b></div></div></article>}
    {tab==='Balance Sheet'&&<article><h3>Balance Sheet</h3><p className="muted">As at {to}. This statement includes all posted activity up to the selected end date.</p><div className="financial-statement"><h3>Assets</h3>{balanceTotals.filter(x=>x.account.account_type==='Asset'&&(x.debit||x.credit)).map(x=><div key={x.account.id}><span>{x.account.code} · {x.account.name}</span><b>{fmt(x.balance)}</b></div>)}<div className="financial-total"><span>Total assets</span><b>{fmt(balanceAssets)}</b></div><h3>Liabilities</h3>{balanceTotals.filter(x=>x.account.account_type==='Liability'&&(x.debit||x.credit)).map(x=><div key={x.account.id}><span>{x.account.code} · {x.account.name}</span><b>{fmt(x.balance)}</b></div>)}<div className="financial-total"><span>Total liabilities</span><b>{fmt(balanceLiabilities)}</b></div><h3>Equity</h3>{balanceTotals.filter(x=>x.account.account_type==='Equity'&&(x.debit||x.credit)).map(x=><div key={x.account.id}><span>{x.account.code} · {x.account.name}</span><b>{fmt(x.balance)}</b></div>)}<div className="financial-total"><span>Total equity</span><b>{fmt(balanceEquity+balanceNetProfit)}</b></div><div className="financial-total"><span>Total liabilities & equity</span><b>{fmt(balanceLiabilities+balanceEquity+balanceNetProfit)}</b></div></div></article>}
    {tab==='Chart of Accounts'&&<article><h3>Chart of accounts</h3><div className="tablewrap"><table><thead><tr><th>CODE</th><th>ACCOUNT</th><th>TYPE</th><th>NORMAL BALANCE</th><th>STATUS</th></tr></thead><tbody>{accounts.map(a=><tr key={a.id}><td>{a.code}</td><td>{a.name}</td><td>{a.account_type}</td><td>{a.normal_balance}</td><td>{a.is_active?'Active':'Inactive'}</td></tr>)}</tbody></table></div></article>}
    {tab==='Periods & Opening'&&<>
      <article><h3>Opening inventory reconciliation</h3><p className="muted">Estimate opening inventory from the current stock value and recorded purchases, sales costs, returns and stock adjustments. Review this with your accountant before posting.</p><div className="purchase-meta"><label>Opening date (must be before first stock activity)<input type="date" value={openingDate} onChange={e=>setOpeningDate(e.target.value)}/></label><button onClick={()=>void refreshOpening()} disabled={busy}>Calculate estimate</button></div>
        {opening&&<><div className="financial-statement"><div><span>Current inventory value</span><b>{fmt(Number(opening.current_inventory_value))}</b></div><div><span>Purchases since opening</span><b>{fmt(Number(opening.purchases_since_opening))}</b></div><div><span>Stock adjustments since opening</span><b>{fmt(Number(opening.stock_adjustments_since_opening))}</b></div><div><span>Sales COGS since opening</span><b>{fmt(Number(opening.sales_cogs_since_opening))}</b></div><div><span>Restocked returns COGS since opening</span><b>{fmt(Number(opening.restocked_returns_cogs_since_opening))}</b></div><div className="financial-total"><span>Estimated opening inventory</span><b>{fmt(Number(opening.opening_inventory_value))}</b></div></div><p className="muted">Earliest recorded stock activity: {opening.earliest_activity_date||'None'}. {opening.already_posted?'Opening inventory has already been posted.':'The estimate has not been posted.'}</p>{role==='Admin'&&!opening.already_posted&&<button className="primary" disabled={busy||Number(opening.opening_inventory_value)===0} onClick={()=>void postOpening()}>Post opening inventory</button>}</>}
      </article>
      {['Admin','Manager'].includes(role||'')&&<article><h3>Create accounting period</h3><form onSubmit={createPeriod} className="purchase-meta"><label>Period name<input required value={periodForm.name} onChange={e=>setPeriodForm({...periodForm,name:e.target.value})}/></label><label>Start date<input required type="date" value={periodForm.period_start} onChange={e=>setPeriodForm({...periodForm,period_start:e.target.value})}/></label><label>End date<input required type="date" value={periodForm.period_end} onChange={e=>setPeriodForm({...periodForm,period_end:e.target.value})}/></label><button className="primary" disabled={busy}>Create period</button></form><div className="tablewrap"><table><thead><tr><th>PERIOD</th><th>START</th><th>END</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{periods.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.period_start}</td><td>{p.period_end}</td><td>{p.status}</td><td>{p.status==='Open'&&role==='Admin'?<button onClick={()=>void closePeriod(p.id)} disabled={busy}>Close period</button>:'—'}</td></tr>)}{!periods.length&&<tr><td colSpan={5}>No accounting periods created.</td></tr>}</tbody></table></div></article>}
    </>}
    <p className="muted accounting-footnote">Financial reports include only posted journals in the selected date range. Tax configuration, statutory Sri Lankan tax calculations, depreciation and bank reconciliation are not included in this initial accounting release.</p>
  </div>
}

function JournalTable({rows}:{rows:Journal[]}) {
  return <div className="tablewrap"><table><thead><tr><th>DATE</th><th>ENTRY NO.</th><th>DESCRIPTION</th><th>SOURCE</th><th>DEBITS</th><th>CREDITS</th><th>STATUS</th></tr></thead><tbody>{rows.map(j=>{const dr=j.journal_entry_lines.reduce((n,l)=>n+Number(l.debit),0),cr=j.journal_entry_lines.reduce((n,l)=>n+Number(l.credit),0);return <tr key={j.id}><td>{j.entry_date}</td><td><b>{j.entry_no}</b></td><td>{j.description}</td><td>{j.source_type.replace(/_/g,' ')}</td><td>{fmt(dr)}</td><td>{fmt(cr)}</td><td><span className="stock-ok">{j.status}</span></td></tr>})}{!rows.length&&<tr><td colSpan={7}>No journal entries for this date range.</td></tr>}</tbody></table></div>
}
