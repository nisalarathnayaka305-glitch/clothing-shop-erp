import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createClient, type Session } from '@supabase/supabase-js'
import { Html5Qrcode } from 'html5-qrcode'
import { QRCodeSVG } from 'qrcode.react'
import { CalendarDays, CheckCircle2, Clock3, LogOut, QrCode, RefreshCw, ShieldCheck, Users, Wallet } from 'lucide-react'
import './styles.css'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string
const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date())
const leaveYearStart = (date = today()) => {
  const year = Number(date.slice(0,4))
  return date.slice(5,7) >= '04' ? `${year}-04-01` : `${year-1}-04-01`
}
const moneyDays = (n: unknown) => Number(n || 0).toLocaleString('en-LK',{maximumFractionDigits:2})
type Employee = { id:string; employee_no:string; full_name:string; auth_user_id:string|null; role:string; status:string }
type LeaveType = { id:string; code:string; name:string; entitlement_days:number; is_paid:boolean; is_active:boolean }
type LeaveRequest = { id:string; employee_id:string; leave_type_id:string; start_date:string; end_date:string; days_requested:number; reason:string; status:string; rejection_reason:string|null; created_at:string; employees?:any; leave_types?:any }
type Balance = { id:string; employee_id:string; leave_type_id:string; leave_year_start:string; entitlement_days:number; used_days:number; adjustment_days:number; employees?:any; leave_types?:any }
type Nav = 'Dashboard'|'Apply Leave'|'My Requests'|'Approvals'|'Leave Balances'|'Leave Types'|'Attendance QR'|'Scan Attendance'|'Attendance Log'
export default function App() {
  const [session,setSession]=useState<Session|null>(null)
  const [role,setRole]=useState('')
  const [employee,setEmployee]=useState<Employee|null>(null)
  const [employees,setEmployees]=useState<Employee[]>([])
  const [types,setTypes]=useState<LeaveType[]>([])
  const [requests,setRequests]=useState<LeaveRequest[]>([])
  const [balances,setBalances]=useState<Balance[]>([])
  const [attendance,setAttendance]=useState<any[]>([])
  const [page,setPage]=useState<Nav>('Dashboard')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [qrToken,setQrToken]=useState('')
  const [form,setForm]=useState({leave_type_id:'',start_date:today(),end_date:today(),days_requested:'1',reason:''})
  const [typeEdits,setTypeEdits]=useState<Record<string,string>>({})
  const [balanceEdits,setBalanceEdits]=useState<Record<string,string>>({})
  const isManager=['Admin','Manager'].includes(role)
  const yearStart=leaveYearStart()

  async function loadData(currentSession:Session|null) {
    if(!currentSession){setEmployee(null);setEmployees([]);setTypes([]);setRequests([]);setBalances([]);setAttendance([]);setLoading(false);return}
    setLoading(true);setError('')
    const [{data:roleData,error:roleError},{data:own,error:ownError},{data:typeRows,error:typeError}] = await Promise.all([
      supabase.rpc('current_employee_role'),
      supabase.from('employees').select('id,employee_no,full_name,auth_user_id,role,status').eq('auth_user_id',currentSession.user.id).maybeSingle(),
      supabase.from('leave_types').select('id,code,name,entitlement_days,is_paid,is_active').eq('is_active',true).order('name')
    ])
    if(roleError) setError(roleError.message)
    const currentRole=String(roleData||'');setRole(currentRole)
    const {error:balanceInitError}=await supabase.rpc('ensure_leave_year_balances')
    if(balanceInitError) setError(balanceInitError.message)
    if(ownError) setError(ownError.message)
    setEmployee(own as Employee|null)
    if(typeError) setError(typeError.message); else setTypes((typeRows||[]) as LeaveType[])
    if(['Admin','Manager'].includes(currentRole)){
      const [{data:staff,error:staffError},{data:req,error:reqError},{data:bal,error:balError},{data:att,error:attError}] = await Promise.all([
        supabase.from('employees').select('id,employee_no,full_name,auth_user_id,role,status').order('full_name'),
        supabase.from('leave_requests').select('*,employees(full_name,employee_no),leave_types(name,code)').order('created_at',{ascending:false}).limit(500),
        supabase.from('leave_balances').select('*,employees(full_name,employee_no),leave_types(name,code)').eq('leave_year_start',yearStart).order('employee_id'),
        supabase.from('employee_attendance').select('id,employee_id,work_date,check_in,check_out,status,employees(full_name,employee_no)').order('work_date',{ascending:false}).limit(300)
      ])
      if(staffError) setError(staffError.message); else setEmployees((staff||[]) as Employee[])
      if(reqError) setError(reqError.message); else setRequests((req||[]) as LeaveRequest[])
      if(balError) setError(balError.message); else setBalances((bal||[]) as Balance[])
      if(attError) setError(attError.message); else setAttendance(att||[])
    } else if(own) {
      const [{data:req,error:reqError},{data:bal,error:balError},{data:att,error:attError}] = await Promise.all([
        supabase.from('leave_requests').select('*,leave_types(name,code)').eq('employee_id',own.id).order('created_at',{ascending:false}).limit(200),
        supabase.from('leave_balances').select('*,leave_types(name,code)').eq('employee_id',own.id).eq('leave_year_start',yearStart),
        supabase.from('employee_attendance').select('id,employee_id,work_date,check_in,check_out,status').eq('employee_id',own.id).order('work_date',{ascending:false}).limit(100)
      ])
      if(reqError) setError(reqError.message); else setRequests((req||[]) as LeaveRequest[])
      if(balError) setError(balError.message); else setBalances((bal||[]) as Balance[])
      if(attError) setError(attError.message); else setAttendance(att||[])
    }
    setLoading(false)
  }

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);void loadData(data.session)})
    const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);window.setTimeout(()=>void loadData(next),0)})
    return ()=>listener.subscription.unsubscribe()
  },[])

  const myRequests=useMemo(()=>requests.filter(r=>r.employee_id===employee?.id),[requests,employee])
  const pending=requests.filter(r=>r.status==='Pending')
  const approvedDays=myRequests.filter(r=>r.status==='Approved').reduce((s,r)=>s+Number(r.days_requested),0)
  const getBalance=(typeId:string)=>balances.find(b=>b.leave_type_id===typeId)
  const remaining=(type:LeaveType)=>{const b=getBalance(type.id);return Number(b?.entitlement_days??type.entitlement_days)+Number(b?.adjustment_days||0)-Number(b?.used_days||0)}

  async function submitLeave(e:FormEvent){
    e.preventDefault()
    if(!employee){setError('Your login is not linked to an active employee profile. Ask an administrator to link it in Employee Management.');return}
    setBusy(true);setError('');setNotice('')
    const {error:saveError}=await supabase.from('leave_requests').insert({
      employee_id:employee.id,leave_type_id:form.leave_type_id,start_date:form.start_date,end_date:form.end_date,
      days_requested:Number(form.days_requested),reason:form.reason.trim(),status:'Pending'
    })
    if(saveError) setError(saveError.message)
    else {setNotice('Leave request submitted for approval.');setForm({...form,reason:''});await loadData(session)}
    setBusy(false)
  }

  async function reviewRequest(row:LeaveRequest,status:'Approved'|'Rejected'){
    let rejection_reason:string|null=null
    if(status==='Rejected'){rejection_reason=window.prompt('Enter the reason for rejecting this leave request:')?.trim()||'';if(!rejection_reason){setNotice('Rejection cancelled. Please provide a reason.');return}}
    setBusy(true);setError('');setNotice('')
    const {error:reviewError}=await supabase.from('leave_requests').update({status,rejection_reason}).eq('id',row.id).eq('status','Pending')
    if(reviewError) setError(reviewError.message)
    else {setNotice(`Leave request ${status.toLowerCase()}.`);await loadData(session)}
    setBusy(false)
  }

  async function saveType(type:LeaveType){
    const value=Number(typeEdits[type.id]??type.entitlement_days)
    if(!Number.isFinite(value)||value<0){setError('Entitlement must be zero or more days.');return}
    setBusy(true)
    const {error:saveError}=await supabase.from('leave_types').update({entitlement_days:value}).eq('id',type.id)
    if(saveError)setError(saveError.message);else{setNotice(`${type.name} entitlement updated.`);await loadData(session)}
    setBusy(false)
  }

  async function saveBalance(row:Balance){
    const value=Number(balanceEdits[row.id]??row.adjustment_days)
    if(!Number.isFinite(value)){setError('Enter a valid adjustment.');return}
    if(Number(row.entitlement_days)+value<Number(row.used_days)){setError('Adjustment cannot reduce the balance below leave already used.');return}
    setBusy(true)
    const {error:saveError}=await supabase.from('leave_balances').update({adjustment_days:value}).eq('id',row.id)
    if(saveError)setError(saveError.message);else{setNotice('Leave balance adjustment saved.');await loadData(session)}
    setBusy(false)
  }

  async function loadQr(regenerate=false){
    setBusy(true);setError('');setNotice('')
    const {data,error:qrError}=await supabase.rpc(regenerate?'regenerate_daily_attendance_qr':'get_or_create_daily_attendance_qr')
    if(qrError)setError(qrError.message);else{setQrToken(String(data));setNotice(regenerate?'A new QR has been generated. The previous QR is now invalid.':'Today’s attendance QR is ready.')}
    setBusy(false)
  }

  async function scanToken(token:string){
    setBusy(true);setError('');setNotice('')
    const {data,error:scanError}=await supabase.rpc('scan_daily_attendance_qr',{p_token:token.trim()})
    if(scanError)setError(scanError.message)
    else {const result=Array.isArray(data)?data[0]:data;setNotice(`${result?.action||'Attendance'} recorded for ${result?.employee_name||'you'} at ${new Date(result?.punch_time||Date.now()).toLocaleTimeString('en-LK',{timeZone:'Asia/Colombo'})}.`);await loadData(session)}
    setBusy(false)
  }

  useEffect(()=>{if(page==='Attendance QR'&&isManager&&!qrToken)void loadQr(false)},[page,isManager])
  useEffect(()=>{if(page!=='Scan Attendance'||!session)return;let scanner:Html5Qrcode|null=null;let active=true
    const start=async()=>{try{scanner=new Html5Qrcode('leave-qr-reader');await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:250}},async(decoded)=>{if(!active)return;active=false;try{await scanner?.stop()}catch{};await scanToken(decoded)},()=>{})}catch(e){setError(e instanceof Error?e.message:'Unable to start the camera. Check camera permission and use HTTPS.')}}
    void start();return()=>{active=false;if(scanner?.isScanning)void scanner.stop().catch(()=>{})}
  },[page,session])

  async function signOut(){await supabase.auth.signOut();setPage('Dashboard')}
  async function signIn(e:FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget);setBusy(true);setError('');const {error:loginError}=await supabase.auth.signInWithPassword({email:String(fd.get('email')),password:String(fd.get('password'))});if(loginError)setError(loginError.message);setBusy(false)}

  if(loading)return <div className="center-screen"><div className="loader"/>Loading Leave Management…</div>
  if(!session)return <div className="login-screen"><form className="login-card" onSubmit={signIn}><div className="brand-icon"><CalendarDays/></div><p className="eyebrow">PEOPLE OPERATIONS</p><h1>Leave Management</h1><p className="muted">Sign in with your existing ERP employee account.</p><label>Email address<input name="email" type="email" required autoComplete="username"/></label><label>Password<input name="password" type="password" required autoComplete="current-password"/></label><button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>{error&&<p className="error">{error}</p>}</form></div>

  const nav:Nav[]=['Dashboard','Apply Leave','My Requests',...(isManager?['Approvals','Leave Balances','Leave Types','Attendance QR','Attendance Log'] as Nav[]:[]),'Scan Attendance',...(isManager?[]:['Attendance Log'] as Nav[])]
  return <div className="leave-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-icon"><CalendarDays/></div><div><strong>People & Leave</strong><small>MANAGEMENT PORTAL</small></div></div>
      <nav>{nav.map(item=><button key={item} className={page===item?'active':''} onClick={()=>setPage(item)}>{item==='Attendance QR'||item==='Scan Attendance'?<QrCode size={17}/>:item==='Approvals'?<ShieldCheck size={17}/>:item==='Leave Balances'?<Wallet size={17}/>:item==='Attendance Log'?<Clock3 size={17}/>:<CalendarDays size={17}/>}<span>{item}</span>{item==='Approvals'&&pending.length>0&&<b className="count">{pending.length}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="user-chip"><span>{employee?.full_name?.slice(0,1)||'U'}</span><div><b>{employee?.full_name||session.user.email}</b><small>{role||'Employee'}</small></div></div><button className="signout" onClick={signOut}><LogOut size={16}/> Sign out</button></div>
    </aside>
    <main className="main-area"><header className="topbar"><div><b>Leave Management</b><span> / {page}</span></div><div className="top-actions"><span className="fy-chip">Leave year · {yearStart} – {Number(yearStart.slice(0,4))+1}-03-31</span><button onClick={()=>void loadData(session)} title="Refresh"><RefreshCw size={17}/></button></div></header>
      <div className="content">
        {notice&&<div className="notice">{notice}<button onClick={()=>setNotice('')}>×</button></div>}{error&&<div className="error-banner">{error}<button onClick={()=>setError('')}>×</button></div>}
        {page==='Dashboard'&&<><div className="page-heading"><div><p className="eyebrow">PEOPLE OPERATIONS</p><h1>Good {Number(new Intl.DateTimeFormat('en',{hour:'2-digit',hourCycle:'h23',timeZone:'Asia/Colombo'}).format(new Date()))<12?'morning':Number(new Intl.DateTimeFormat('en',{hour:'2-digit',hourCycle:'h23',timeZone:'Asia/Colombo'}).format(new Date()))<17?'afternoon':'evening'}, {employee?.full_name?.split(' ')[0]||'there'} 👋</h1><p>Manage leave requests, balances and attendance in one place.</p></div></div><div className="stats-grid"><article><small>Available Annual Leave</small><h2>{moneyDays(Math.max(0,remaining(types.find(t=>t.code==='ANNUAL')||{id:'',entitlement_days:7} as LeaveType))) } days</h2></article><article><small>Available Casual Leave</small><h2>{moneyDays(Math.max(0,remaining(types.find(t=>t.code==='CASUAL')||{id:'',entitlement_days:14} as LeaveType)))} days</h2></article><article><small>Pending Requests</small><h2>{isManager?pending.length:myRequests.filter(r=>r.status==='Pending').length}</h2></article><article><small>Approved Leave Taken</small><h2>{moneyDays(approvedDays)} days</h2></article></div><div className="panel-grid"><section className="panel"><div className="panel-heading"><div><h2>My leave balances</h2><p>Leave year runs from 1 April to 31 March.</p></div></div><div className="balance-cards">{types.map(t=><div key={t.id}><span>{t.name}</span><b>{moneyDays(Math.max(0,remaining(t)))} <small>days left</small></b><div className="progress"><i style={{width:`${Math.min(100,Math.max(0,100*Number(getBalance(t.id)?.used_days||0)/Math.max(1,Number(getBalance(t.id)?.entitlement_days??t.entitlement_days))))}%`}}/></div></div>)}</div></section><section className="panel"><div className="panel-heading"><div><h2>Recent requests</h2><p>Your latest leave applications.</p></div><button className="text-button" onClick={()=>setPage('My Requests')}>View all</button></div><RequestTable rows={myRequests.slice(0,5)}/></section></div></>}
        {page==='Apply Leave'&&<section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">NEW APPLICATION</p><h2>Apply for leave</h2><p>Select the leave type and dates, then submit for approval.</p></div></div><form className="leave-form" onSubmit={submitLeave}><label>Leave type<select required value={form.leave_type_id} onChange={e=>setForm({...form,leave_type_id:e.target.value})}><option value="">Select leave type</option>{types.map(t=><option key={t.id} value={t.id}>{t.name} · {t.code==='NO_PAY'?'No entitlement limit':`${moneyDays(remaining(t))} days available`}</option>)}</select></label><div className="form-row"><label>Start date<input required type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></label><label>End date<input required type="date" min={form.start_date} value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/></label><label>Leave days<input required type="number" min="0.5" step="0.5" value={form.days_requested} onChange={e=>setForm({...form,days_requested:e.target.value})}/></label></div><p className="hint">Enter the actual number of working leave days according to your shop's weekly schedule. The dates must remain within one leave year.</p><label>Reason<textarea required rows={4} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="Briefly explain the reason for your leave."/></label><button className="primary" disabled={busy||!employee}>{busy?'Submitting…':'Submit leave request'}</button></form></section>}
        {page==='My Requests'&&<section className="panel"><div className="panel-heading"><div><h2>My leave requests</h2><p>All applications and their approval status.</p></div></div><RequestTable rows={myRequests}/></section>}
        {page==='Approvals'&&isManager&&<section className="panel"><div className="panel-heading"><div><h2>Leave approvals</h2><p>Review employee requests and approve or reject them.</p></div><span className="status pending">{pending.length} pending</span></div><div className="table-wrap"><table><thead><tr><th>EMPLOYEE</th><th>LEAVE TYPE</th><th>DATES</th><th>DAYS</th><th>REASON</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{requests.map(r=><tr key={r.id}><td><b>{r.employees?.full_name||'Employee'}</b><small>{r.employees?.employee_no||''}</small></td><td>{r.leave_types?.name||'—'}</td><td>{r.start_date} – {r.end_date}</td><td>{moneyDays(r.days_requested)}</td><td>{r.reason}</td><td><span className={`status ${r.status.toLowerCase()}`}>{r.status}</span>{r.rejection_reason&&<small>{r.rejection_reason}</small>}</td><td>{r.status==='Pending'?<div className="action-group"><button className="approve" disabled={busy} onClick={()=>void reviewRequest(r,'Approved')}>Approve</button><button className="reject" disabled={busy} onClick={()=>void reviewRequest(r,'Rejected')}>Reject</button></div>:'—'}</td></tr>)}{requests.length===0&&<tr><td colSpan={7}>No leave requests yet.</td></tr>}</tbody></table></div></section>}
        {page==='Leave Balances'&&isManager&&<section className="panel"><div className="panel-heading"><div><h2>Employee leave balances</h2><p>Current leave year: {yearStart} to {Number(yearStart.slice(0,4))+1}-03-31. Adjustments are in days.</p></div></div><div className="table-wrap"><table><thead><tr><th>EMPLOYEE</th><th>LEAVE TYPE</th><th>ENTITLEMENT</th><th>USED</th><th>ADJUSTMENT</th><th>AVAILABLE</th><th></th></tr></thead><tbody>{balances.map(b=><tr key={b.id}><td>{b.employees?.full_name||'—'}<small>{b.employees?.employee_no||''}</small></td><td>{b.leave_types?.name||'—'}</td><td>{moneyDays(b.entitlement_days)}</td><td>{moneyDays(b.used_days)}</td><td><input className="short-input" type="number" step="0.5" value={balanceEdits[b.id]??String(b.adjustment_days)} onChange={e=>setBalanceEdits({...balanceEdits,[b.id]:e.target.value})}/></td><td><b>{moneyDays(Number(b.entitlement_days)+Number(balanceEdits[b.id]??b.adjustment_days)-Number(b.used_days))}</b></td><td><button className="small-button" disabled={busy} onClick={()=>void saveBalance(b)}>Save</button></td></tr>)}{balances.length===0&&<tr><td colSpan={7}>Balances appear when an employee submits a request for a leave type.</td></tr>}</tbody></table></div></section>}
        {page==='Leave Types'&&isManager&&<section className="panel"><div className="panel-heading"><div><h2>Leave type settings</h2><p>Entitlements reset on 1 April each year. Annual and Casual are preconfigured as requested.</p></div></div><div className="table-wrap"><table><thead><tr><th>LEAVE TYPE</th><th>PAID</th><th>ANNUAL ENTITLEMENT (DAYS)</th><th></th></tr></thead><tbody>{types.map(t=><tr key={t.id}><td><b>{t.name}</b><small>{t.code}</small></td><td>{t.is_paid?'Paid':'Unpaid'}</td><td><input className="short-input" type="number" min="0" step="0.5" value={typeEdits[t.id]??String(t.entitlement_days)} onChange={e=>setTypeEdits({...typeEdits,[t.id]:e.target.value})}/></td><td><button className="small-button" disabled={busy} onClick={()=>void saveType(t)}>Save</button></td></tr>)}</tbody></table></div></section>}
        {page==='Attendance QR'&&isManager&&<section className="qr-layout"><article className="panel qr-card"><div className="panel-heading"><div><p className="eyebrow">DAILY ATTENDANCE</p><h2>Today's employee QR code</h2><p>All employees scan this same code for check-in and check-out.</p></div><span className="status approved">Active today</span></div>{qrToken?<><div className="qr-frame"><QRCodeSVG value={qrToken} size={260} level="H" includeMargin/></div><p className="qr-date">{today()} · Sri Lanka time</p><p className="hint">Keep this page open or print the QR code at the workplace. Employees must sign in to this portal before scanning.</p><button className="danger-outline" disabled={busy} onClick={()=>{if(window.confirm('Regenerate today’s QR? The current QR will immediately stop working.'))void loadQr(true)}}><RefreshCw size={16}/> Regenerate today's QR</button></>:<button className="primary" onClick={()=>void loadQr(false)}>Generate today's QR</button>}</article><article className="panel"><h2>How it works</h2><ol className="steps"><li>Admin displays the QR code at the workplace.</li><li>Employees sign in on their phones and open Scan Attendance.</li><li>First scan records check-in; second scan records check-out.</li><li>Regenerating the code invalidates the previous QR immediately.</li></ol><p className="hint">The attendance time is recorded by Supabase using Sri Lanka server time. One employee can have one attendance record per day.</p></article></section>}
        {page==='Scan Attendance'&&<section className="panel scanner-panel"><div className="panel-heading"><div><p className="eyebrow">MOBILE ATTENDANCE</p><h2>Scan workplace QR</h2><p>Allow camera access and point your phone at today's QR code.</p></div></div><div id="leave-qr-reader" className="qr-reader"/><p className="hint">Use the rear camera on your phone. This page requires HTTPS and camera permission.</p></section>}
        {page==='Attendance Log'&&<section className="panel"><div className="panel-heading"><div><h2>{isManager?'Daily attendance log':'My attendance history'}</h2><p>Check-in and check-out times recorded by the QR system.</p></div><button className="small-button" onClick={()=>void loadData(session)}>Refresh</button></div><div className="table-wrap"><table><thead><tr><th>DATE</th>{isManager&&<th>EMPLOYEE</th>}<th>CHECK IN</th><th>CHECK OUT</th><th>HOURS</th><th>STATUS</th></tr></thead><tbody>{attendance.map(row=>{const hours=row.check_in&&row.check_out?Math.max(0,(new Date(row.check_out).getTime()-new Date(row.check_in).getTime())/3600000):null;return <tr key={row.id}><td>{row.work_date}</td>{isManager&&<td>{row.employees?.full_name||'—'}<small>{row.employees?.employee_no||''}</small></td>}<td>{row.check_in?new Date(row.check_in).toLocaleTimeString('en-LK',{timeZone:'Asia/Colombo'}):'—'}</td><td>{row.check_out?new Date(row.check_out).toLocaleTimeString('en-LK',{timeZone:'Asia/Colombo'}):'—'}</td><td>{hours===null?'In progress':hours.toFixed(2)+' h'}</td><td><span className="status approved">{row.status}</span></td></tr>})}{attendance.length===0&&<tr><td colSpan={isManager?6:5}>No attendance records found.</td></tr>}</tbody></table></div></section>}
      </div>
    </main>
  </div>
}

function RequestTable({rows}:{rows:LeaveRequest[]}){
  if(!rows.length)return <div className="empty">No leave requests found.</div>
  return <div className="table-wrap"><table><thead><tr><th>LEAVE TYPE</th><th>DATES</th><th>DAYS</th><th>REASON</th><th>STATUS</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.leave_types?.name||'—'}</td><td>{r.start_date} – {r.end_date}</td><td>{moneyDays(r.days_requested)}</td><td>{r.reason}</td><td><span className={`status ${r.status.toLowerCase()}`}>{r.status}</span>{r.rejection_reason&&<small>{r.rejection_reason}</small>}</td></tr>)}</tbody></table></div>
}
