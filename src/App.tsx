import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured, money, type Product, type ProductVariant } from './lib'
import AccountingWorkspace from './Accounting'

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

const navigation = ['Overview', 'Point of Sale', 'Sales History', 'Returns & Exchanges', 'Products & Stock', 'Purchases', 'Purchase Orders', 'Customers', 'Customer Accounts', 'Loyalty', 'Cash Management', 'Suppliers', 'Supplier Accounts', 'Expenses', 'Reports', 'Employees', 'Attendance', 'Payroll', 'Accounting', 'Settings']
const localBusinessDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date())

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
  const [loyaltyRows, setLoyaltyRows] = useState<any[]>([])
  const [cashSession, setCashSession] = useState<any | null>(null)
  const [cashHistory, setCashHistory] = useState<any[]>([])
  const [cashFloat, setCashFloat] = useState('0')
  const [cashCounted, setCashCounted] = useState('')
  const [cashMovement, setCashMovement] = useState({ type: 'Cash In', amount: '', reason: '' })
  const [purchaseRequests, setPurchaseRequests] = useState<any[]>([])
  const [purchaseRequestForm, setPurchaseRequestForm] = useState({ supplier_id: '', variant_id: '', quantity: '1', unit_cost: '0', notes: '' })
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerForm, setCustomerForm] = useState({ full_name: '', phone: '', email: '' })
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [customerPayments, setCustomerPayments] = useState<any[]>([])
  const [creditPaymentMethod, setCreditPaymentMethod] = useState('Cash')
  const [customerAccountQuery, setCustomerAccountQuery] = useState('')
  const [customerPaymentForm, setCustomerPaymentForm] = useState({ sale_id: '', amount: '', payment_method: 'Cash', payment_date: new Date().toISOString().slice(0,10), reference_no: '', notes: '' })
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
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '' })
  const [supplierQuery, setSupplierQuery] = useState('')
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([])
  const [supplierPayments, setSupplierPayments] = useState<any[]>([])
  const [supplierPaymentForm, setSupplierPaymentForm] = useState({ purchase_id: '', amount: '', payment_method: 'Cash', payment_date: new Date().toISOString().slice(0,10), reference_no: '', notes: '' })
  const [supplierAccountQuery, setSupplierAccountQuery] = useState('')

  const [purchaseSupplier, setPurchaseSupplier] = useState('')
  const [purchaseLines, setPurchaseLines] = useState<Record<string, { quantity: string; unit_cost: string }>>({})
  const [purchaseReference, setPurchaseReference] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0,10))
  const [expenses, setExpenses] = useState<any[]>([])
  const [expenseForm, setExpenseForm] = useState({ category: 'General', description: '', amount: '', payment_method: 'Cash', paid_to: '', supplier_id: '', expense_date: new Date().toISOString().slice(0,10), reference_no: '' })
  const [expenseQuery, setExpenseQuery] = useState('')
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('All')
  const [expenseMonth, setExpenseMonth] = useState(new Date().toISOString().slice(0,7))
  const [reportStart, setReportStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10))
  const [reportEnd, setReportEnd] = useState(new Date().toISOString().slice(0,10))
  const [employees, setEmployees] = useState<any[]>([])
  const [currentEmployeeRole, setCurrentEmployeeRole] = useState<string | null>(null)
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeeEditingId, setEmployeeEditingId] = useState<string | null>(null)
  const [employeeForm, setEmployeeForm] = useState({ full_name: '', email: '', phone: '', job_title: '', department: '', employment_type: 'Full-time', hire_date: new Date().toISOString().slice(0,10), auth_user_id: '', role: 'Staff', status: 'Active', salary_basis: 'Monthly', base_salary: '0', notes: '' })
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([])
  const [attendanceDate, setAttendanceDate] = useState(localBusinessDate())
  const [attendanceEmployeeId, setAttendanceEmployeeId] = useState('')
  const [payrollRuns, setPayrollRuns] = useState<any[]>([])
  const [payrollAttendance, setPayrollAttendance] = useState<any[]>([])
  const [payrollStart, setPayrollStart] = useState(new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10))
  const [payrollEnd, setPayrollEnd] = useState(new Date(new Date().getFullYear(),new Date().getMonth()+1,0).toISOString().slice(0,10))
  const [payrollDeductions, setPayrollDeductions] = useState<Record<string,string>>({})


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

  async function loadEmployees() {
    if (!supabase || !session) return
    const { data: ownProfile, error: ownError } = await supabase.from('employees')
      .select('id,employee_no,role,status,full_name,auth_user_id,salary_basis,base_salary').eq('auth_user_id', session.user.id).maybeSingle()
    if (ownError) { setNotice(ownError.message); return }
    const role = ownProfile?.status === 'Active' ? ownProfile.role : null
    setCurrentEmployeeRole(role)
    if (role === 'Admin' || role === 'Manager') {
      const { data, error } = await supabase.from('employees')
        .select('id,employee_no,full_name,email,phone,job_title,department,employment_type,hire_date,auth_user_id,role,status,salary_basis,base_salary,notes,created_at')
        .order('created_at', { ascending: false })
      if (error) setNotice(error.message)
      else if (data) setEmployees(data)
    } else {
      setEmployees(ownProfile ? [ownProfile] : [])
    }
  }

  async function loadAttendance() {
    if (!supabase || !session) return
    let request = supabase.from('employee_attendance')
      .select('id,employee_id,work_date,check_in,check_out,break_minutes,status,notes,employees(id,employee_no,full_name,job_title,salary_basis,base_salary,auth_user_id)')
      .order('work_date', { ascending: false }).limit(1000)
    if (currentEmployeeRole !== 'Admin' && currentEmployeeRole !== 'Manager') {
      const own = employees.find(e => e.auth_user_id === session.user.id)
      if (!own) { setAttendanceRecords([]); return }
      request = request.eq('employee_id', own.id) as typeof request
    }
    const { data, error } = await request
    if (error) setNotice(error.message)
    else if (data) setAttendanceRecords(data)
  }

  async function loadPayrollAttendance() {
    if (!supabase || !session || !['Admin','Manager'].includes(currentEmployeeRole || '') || !payrollStart || !payrollEnd || payrollEnd < payrollStart) return
    const { data, error } = await supabase.from('employee_attendance')
      .select('employee_id,work_date,check_in,check_out,break_minutes,status')
      .gte('work_date',payrollStart).lte('work_date',payrollEnd).order('work_date').limit(10000)
    if (error) setNotice(error.message)
    else if (data) setPayrollAttendance(data)
  }

  async function loadPayrollRuns() {
    if (!supabase || !session || !['Admin','Manager'].includes(currentEmployeeRole || '')) return
    const { data, error } = await supabase.from('payroll_runs')
      .select('id,period_start,period_end,status,total_gross,total_deductions,total_net,created_at,paid_at,payroll_items(id,employee_id,salary_basis,base_salary,days_present,hours_worked,gross_pay,deductions,net_pay,notes,employees(full_name,employee_no))')
      .order('period_start', { ascending: false }).limit(24)
    if (error) setNotice(error.message)
    else if (data) setPayrollRuns(data)
  }

  async function punchIn(employeeId: string) {
    if (!employeeId || !session) { setNotice('Link this login to an employee record before recording attendance.'); return }
    if (attendanceDate !== localBusinessDate()) { setNotice('Check-in can only be recorded for today.'); return }
    const own = employees.find(e => e.auth_user_id === session.user.id)
    const isManager = ['Admin','Manager'].includes(currentEmployeeRole || '')
    if (!isManager && own?.id !== employeeId) { setNotice('You can only record attendance for your own employee profile.'); return }
    setBusy(true)
    const { error } = isManager
      ? await supabase!.rpc('manager_check_in', { p_employee_id: employeeId, p_work_date: attendanceDate })
      : await supabase!.rpc('employee_check_in', { p_work_date: attendanceDate })
    if (error) setNotice(error.message)
    else { await loadAttendance(); setNotice('Attendance check-in recorded.') }
    setBusy(false)
  }

  async function punchOut(record: any) {
    if (!record?.id || !session) return
    if (attendanceDate !== new Date().toISOString().slice(0,10)) { setNotice('Check-out can only be recorded for today.'); return }
    const isManager = ['Admin','Manager'].includes(currentEmployeeRole || '')
    setBusy(true)
    const { error } = isManager
      ? await supabase!.rpc('manager_check_out', { p_attendance_id: record.id })
      : await supabase!.rpc('employee_check_out', { p_work_date: attendanceDate })
    if (error) setNotice(error.message)
    else { await loadAttendance(); setNotice('Attendance check-out recorded.') }
    setBusy(false)
  }

  async function updateAttendanceStatus(record: any, status: string) {
    if (!['Admin','Manager'].includes(currentEmployeeRole || '')) return
    const { data, error } = await supabase!.from('employee_attendance').update({ status }).eq('id',record.id)
      .select('id,employee_id,work_date,check_in,check_out,break_minutes,status,notes,employees(id,employee_no,full_name,job_title,salary_basis,base_salary,auth_user_id)').single()
    if (error) setNotice(error.message)
    else setAttendanceRecords(current=>current.map(x=>x.id===record.id?data:x))
  }

  async function updateAttendanceBreak(record: any, breakMinutes: number) {
    if (!['Admin','Manager'].includes(currentEmployeeRole || '') || !Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 600) return
    const { data, error } = await supabase!.from('employee_attendance').update({ break_minutes: breakMinutes }).eq('id',record.id)
      .select('id,employee_id,work_date,check_in,check_out,break_minutes,status,notes,employees(id,employee_no,full_name,job_title,salary_basis,base_salary,auth_user_id)').single()
    if (error) setNotice(error.message)
    else setAttendanceRecords(current=>current.map(x=>x.id===record.id?data:x))
  }

  function attendanceHours(record: any) {
    if (!record?.check_in || !record?.check_out) return 0
    return Math.max(0,(new Date(record.check_out).getTime()-new Date(record.check_in).getTime())/3600000-Number(record.break_minutes||0)/60)
  }

  function monthlyPayForPeriod(amount: number, start: string, end: string) {
    let cursor = new Date(start + 'T00:00:00Z')
    const last = new Date(end + 'T00:00:00Z')
    let total = 0
    while (cursor <= last) {
      const year = cursor.getUTCFullYear()
      const month = cursor.getUTCMonth()
      const monthEnd = new Date(Date.UTC(year, month + 1, 0))
      const segmentEnd = last < monthEnd ? last : monthEnd
      const days = Math.floor((segmentEnd.getTime() - cursor.getTime()) / 86400000) + 1
      total += amount * days / monthEnd.getUTCDate()
      cursor = new Date(Date.UTC(year, month + 1, 1))
    }
    return Number(total.toFixed(2))
  }

  async function createPayrollRun() {
    if (!['Admin','Manager'].includes(currentEmployeeRole || '') || !session) { setNotice('Only Admin or Manager can prepare payroll.'); return }
    if (!payrollStart || !payrollEnd || payrollEnd < payrollStart) { setNotice('Enter a valid payroll date range.'); return }
    if (employees.filter(e=>e.status==='Active').length===0) { setNotice('No active employees are available for payroll.'); return }
    const duplicate=payrollRuns.find(r=>r.period_start===payrollStart && r.period_end===payrollEnd)
    if (duplicate) { setNotice(duplicate.status==='Paid'?'This payroll period has already been paid.':'A draft payroll already exists for this period.'); return }
    const overlap=payrollRuns.find(r=>payrollStart<=r.period_end && payrollEnd>=r.period_start)
    if (overlap) { setNotice('This date range overlaps an existing payroll run. Choose a non-overlapping period.'); return }
    setBusy(true)
    const active=employees.filter(e=>e.status==='Active' && (!e.hire_date || e.hire_date<=payrollEnd))
    if (active.length===0) { setNotice('No active employees were employed during this payroll period.'); setBusy(false); return }
    const { data: periodAttendance, error: attendanceError } = await supabase!.from('employee_attendance')
      .select('employee_id,work_date,check_in,check_out,break_minutes,status')
      .gte('work_date',payrollStart).lte('work_date',payrollEnd).limit(10000)
    if (attendanceError) { setNotice(attendanceError.message); setBusy(false); return }
    const items=active.map(employee=>{
      const rows=(periodAttendance||[]).filter(r=>r.employee_id===employee.id)
      const hours=rows.reduce((sum,r)=>sum+attendanceHours(r),0)
      const days=rows.reduce((sum,r)=>sum+(r.status==='Half-day'?0.5:['Present','Late'].includes(r.status)?1:0),0)
      const basis=employee.salary_basis||'Monthly'
      const rate=Number(employee.base_salary||0)
      const gross=basis==='Hourly'?hours*rate:monthlyPayForPeriod(rate,payrollStart,payrollEnd)
      const rawDeduction=Number(payrollDeductions[employee.id]||0); const deduction=Math.min(gross,Math.max(0,Number.isFinite(rawDeduction)?rawDeduction:0))
      return { employee_id:employee.id,salary_basis:basis,base_salary:rate,days_present:days,hours_worked:Number(hours.toFixed(2)),gross_pay:Number(gross.toFixed(2)),deductions:Number(deduction.toFixed(2)),net_pay:Number((gross-deduction).toFixed(2)) }
    })
    const totals={gross:items.reduce((n,x)=>n+x.gross_pay,0),deductions:items.reduce((n,x)=>n+x.deductions,0),net:items.reduce((n,x)=>n+x.net_pay,0)}
    const { data:run,error:runError }=await supabase!.from('payroll_runs').insert({period_start:payrollStart,period_end:payrollEnd,status:'Draft',total_gross:totals.gross,total_deductions:totals.deductions,total_net:totals.net,created_by:session.user.id}).select('id').single()
    if(runError){setNotice(runError.message);setBusy(false);return}
    const {error:itemError}=await supabase!.from('payroll_items').insert(items.map(x=>({...x,payroll_run_id:run.id})))
    if(itemError){await supabase!.from('payroll_runs').delete().eq('id',run.id);setNotice(itemError.message);setBusy(false);return}
    setNotice('Draft payroll created. Review the figures before marking it as paid.')
    setPayrollAttendance(periodAttendance||[])
    setPayrollDeductions({})
    await loadPayrollRuns()
    setBusy(false)
  }

  async function markPayrollPaid(run: any) {
    if (!['Admin','Manager'].includes(currentEmployeeRole || '') || run.status!=='Draft') return
    if (!window.confirm('Confirm that all employees in this payroll run have actually been paid?')) return
    const { error }=await supabase!.from('payroll_runs').update({status:'Paid',paid_at:new Date().toISOString()}).eq('id',run.id)
    if(error) setNotice(error.message)
    else { setPayrollRuns(current=>current.map(x=>x.id===run.id?{...x,status:'Paid',paid_at:new Date().toISOString()}:x));setNotice('Payroll marked as paid.') }
  }

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
      .select('id,invoice_no,customer_id,subtotal,discount,total,payment_method,amount_received,change_amount,created_at,customers(id,full_name,phone),sale_items(id,product_no,product_name,sku,size,colour,quantity,unit_price,unit_cost,line_total),customer_payments(id,payment_no,amount,payment_method,payment_date,reference_no)')
      .order('created_at', { ascending: false }).limit(500)
    if (error) setNotice(error.message)
    else if (data) setSales(data)
  }

  async function loadCustomerPayments() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('customer_payments')
      .select('id,payment_no,customer_id,sale_id,amount,payment_method,payment_date,reference_no,notes,created_at,customers(full_name,phone),sales(invoice_no,total)')
      .order('payment_date', { ascending: false }).limit(2000)
    if (error) setNotice(error.message)
    else if (data) setCustomerPayments(data)
  }

  function salePaidAmount(sale: any) {
    return (sale.customer_payments || []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
  }

  function saleOutstanding(sale: any) {
    return Math.max(0, Number(sale.total || 0) - salePaidAmount(sale))
  }

  async function recordCustomerPayment(event: FormEvent) {
    event.preventDefault()
    const sale = sales.find(item => item.id === customerPaymentForm.sale_id)
    const amount = Number(customerPaymentForm.amount)
    if (!sale || sale.payment_method !== 'Credit') { setNotice('Select a valid credit invoice.'); return }
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount*100)!==amount*100) { setNotice('Enter a valid payment amount with up to two decimal places.'); return }
    if (amount > saleOutstanding(sale)) { setNotice('Payment cannot exceed the outstanding invoice balance.'); return }
    if (!customerPaymentForm.payment_date) { setNotice('Select a payment date.'); return }
    setBusy(true)
    if (supabase && session) {
      const { data, error } = await supabase.rpc('record_customer_payment', {
        p_sale_id: customerPaymentForm.sale_id,
        p_amount: amount,
        p_payment_method: customerPaymentForm.payment_method,
        p_payment_date: customerPaymentForm.payment_date,
        p_reference_no: customerPaymentForm.reference_no.trim() || null,
        p_notes: customerPaymentForm.notes.trim() || null,
      })
      if (error) { setNotice(error.message); setBusy(false); return }
      setNotice(`Customer payment ${data.payment_no} saved. Remaining balance: ${money(Number(data.outstanding))}.`)
      setCustomerPaymentForm({ sale_id: '', amount: '', payment_method: 'Cash', payment_date: new Date().toISOString().slice(0,10), reference_no: '', notes: '' })
      await Promise.all([loadSales(),loadCustomerPayments()])
    } else {
      setNotice('Customer payments require a connected Supabase account; demo mode cannot persist account balances.')
    }
    setBusy(false)
  }

  async function loadExpenses() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('expenses')
      .select('id,expense_no,category,description,amount,payment_method,paid_to,reference_no,expense_date,created_at,supplier_id,suppliers(name)')
      .order('expense_date', { ascending: false }).limit(1000)
    if (error) setNotice(error.message)
    else if (data) setExpenses(data)
  }

  async function saveExpense(event: FormEvent) {
    event.preventDefault()
    if (expenseForm.category === 'Supplier Payment') { setNotice('Use Supplier Accounts to record supplier payments so invoice balances are updated correctly.'); return }
    const amount = Number(expenseForm.amount)
    if (!expenseForm.description.trim() || !Number.isFinite(amount) || amount <= 0 || !expenseForm.expense_date) {
      setNotice('Enter an expense description, a valid amount and date.'); return
    }
    if (expenseForm.category === 'Supplier Payment' && !expenseForm.supplier_id) {
      setNotice('Select a supplier for a supplier payment.'); return
    }
    const row = {
      category: expenseForm.category, description: expenseForm.description.trim(), amount,
      payment_method: expenseForm.payment_method, paid_to: expenseForm.paid_to.trim() || null,
      supplier_id: expenseForm.category === 'Supplier Payment' ? expenseForm.supplier_id : null,
      expense_date: expenseForm.expense_date, reference_no: expenseForm.reference_no.trim() || null,
    }
    setBusy(true)
    if (supabase && session) {
      const { data, error } = await supabase.from('expenses').insert(row)
        .select('id,expense_no,category,description,amount,payment_method,paid_to,reference_no,expense_date,created_at,supplier_id,suppliers(name)').single()
      if (error) { setNotice(error.message); setBusy(false); return }
      setExpenses(current => [data,...current])
      setNotice('Expense saved successfully.')
    } else {
      const supplier = suppliers.find(s => s.id === row.supplier_id)
      setExpenses(current => [{ ...row, id: crypto.randomUUID(), expense_no: `EXP-DEMO-${Date.now()}`, created_at: new Date().toISOString(), suppliers: supplier ? { name: supplier.name } : null },...current])
      setNotice('Demo mode: expense is temporary and is not saved to Supabase.')
    }
    setExpenseForm({ category: 'General', description: '', amount: '', payment_method: 'Cash', paid_to: '', supplier_id: '', expense_date: new Date().toISOString().slice(0,10), reference_no: '' })
    setBusy(false)
  }

  async function loadSuppliers() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('suppliers').select('id,name,phone,email,created_at').order('name')
    if (error) setNotice(error.message)
    else if (data) setSuppliers(data)
  }

  async function loadPurchases() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('purchase_orders')
      .select('id,purchase_no,supplier_id,supplier_reference,purchase_date,total,created_at,suppliers(id,name),purchase_items(id,product_no,product_name,size,colour,quantity,unit_cost,line_total),supplier_payments(id,amount,payment_date,payment_no)')
      .order('purchase_date', { ascending: false }).limit(1000)
    if (error) setNotice(error.message)
    else if (data) setPurchaseHistory(data)
  }

  async function loadSupplierPayments() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('supplier_payments')
      .select('id,payment_no,supplier_id,purchase_id,amount,payment_method,payment_date,reference_no,notes,created_at,suppliers(name),purchase_orders(purchase_no)')
      .order('payment_date', { ascending: false }).limit(2000)
    if (error) setNotice(error.message)
    else if (data) setSupplierPayments(data)
  }

  function purchasePaidAmount(purchase: any) {
    return (purchase.supplier_payments || []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
  }

  function purchaseOutstanding(purchase: any) {
    return Math.max(0, Number(purchase.total || 0) - purchasePaidAmount(purchase))
  }

  async function recordSupplierPayment(event: FormEvent) {
    event.preventDefault()
    const amount = Number(supplierPaymentForm.amount)
    const purchase = purchaseHistory.find(p => p.id === supplierPaymentForm.purchase_id)
    if (!purchase) { setNotice('Select a purchase invoice.'); return }
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount*100)!==amount*100) { setNotice('Enter a valid payment amount with up to two decimal places.'); return }
    if (amount > purchaseOutstanding(purchase)) { setNotice('Payment cannot exceed the invoice outstanding balance.'); return }
    if (!supplierPaymentForm.payment_date) { setNotice('Select a payment date.'); return }
    setBusy(true)
    if (supabase && session) {
      const { data, error } = await supabase.rpc('record_supplier_payment', {
        p_purchase_id: supplierPaymentForm.purchase_id,
        p_amount: amount,
        p_payment_method: supplierPaymentForm.payment_method,
        p_payment_date: supplierPaymentForm.payment_date,
        p_reference_no: supplierPaymentForm.reference_no.trim() || null,
        p_notes: supplierPaymentForm.notes.trim() || null,
      })
      if (error) { setNotice(error.message); setBusy(false); return }
      setNotice(`Supplier payment ${data.payment_no} saved. Remaining invoice balance: ${money(Number(data.outstanding))}.`)
      setSupplierPaymentForm({ purchase_id: '', amount: '', payment_method: 'Cash', payment_date: new Date().toISOString().slice(0,10), reference_no: '', notes: '' })
      await Promise.all([loadPurchases(),loadSupplierPayments(),loadExpenses()])
    } else {
      setNotice('Supplier payments require a connected Supabase account; demo mode cannot persist account balances.')
    }
    setBusy(false)
  }

  async function saveSupplier(event: FormEvent) {
    event.preventDefault()
    const row = { name: supplierForm.name.trim(), phone: supplierForm.phone.trim() || null, email: supplierForm.email.trim() || null }
    if (!row.name) { setNotice('Supplier name is required.'); return }
    setBusy(true)
    if (supabase && session) {
      const { data, error } = await supabase.from('suppliers').insert(row).select('id,name,phone,email,created_at').single()
      if (error) setNotice(error.message)
      else { setSuppliers(current => [...current,data].sort((x,y)=>x.name.localeCompare(y.name))); setSupplierForm({name:'',phone:'',email:''}); setNotice('Supplier saved.') }
    } else {
      setSuppliers(current => [...current,{...row,id:crypto.randomUUID(),created_at:new Date().toISOString()}])
      setSupplierForm({name:'',phone:'',email:''}); setNotice('Demo mode: supplier is temporary and not saved.')
    }
    setBusy(false)
  }

  async function receivePurchase(event: FormEvent) {
    event.preventDefault()
    if (!purchaseSupplier) { setNotice('Select a supplier.'); return }
    const items = Object.entries(purchaseLines).filter(([,line]) => Number(line.quantity)>0).map(([variant_id,line]) => ({variant_id,quantity:Number(line.quantity),unit_cost:Number(line.unit_cost)}))
    if (!items.length || items.some(i => !Number.isInteger(i.quantity) || !Number.isFinite(i.unit_cost) || i.unit_cost<0)) { setNotice('Enter a valid whole quantity and unit cost for at least one variant.'); return }
    setBusy(true)
    if (supabase && session) {
      const { data, error } = await supabase.rpc('receive_purchase', {
        p_supplier_id: purchaseSupplier, p_supplier_reference: purchaseReference.trim() || null,
        p_purchase_date: purchaseDate, p_items: items,
      })
      if (error) { setNotice(error.message); setBusy(false); return }
      setNotice(`Purchase ${data.purchase_no} received. Stock updated by the system.`)
      await Promise.all([loadPurchases(),loadPOSVariants(),loadProducts()])
    } else {
      const selectedSupplier=suppliers.find(s=>s.id===purchaseSupplier)
      const demoLines=items.map(i=>{const v=posVariants.find(x=>x.id===i.variant_id)!;return {id:crypto.randomUUID(),product_no:v.product_no,product_name:v.product_name,size:v.size,colour:v.colour,quantity:i.quantity,unit_cost:i.unit_cost,line_total:i.quantity*i.unit_cost}})
      const demoPurchase={id:crypto.randomUUID(),purchase_no:`PO-DEMO-${Date.now()}`,supplier_reference:purchaseReference,suppliers:selectedSupplier,total:demoLines.reduce((n,i)=>n+i.line_total,0),created_at:new Date().toISOString(),purchase_items:demoLines}
      setPurchaseHistory(current=>[demoPurchase,...current])
      setPosVariants(current=>current.map(v=>{const line=items.find(i=>i.variant_id===v.id);return line?{...v,quantity:v.quantity+line.quantity}:v}))
      setNotice('Demo purchase recorded locally; no database stock was changed.')
    }
    setPurchaseLines({});setPurchaseReference('');setBusy(false)
  }

  async function loadReturns() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('sales_returns')
      .select('id,return_no,sale_id,refund_total,refund_method,reason,restock_items,created_at,sales(invoice_no),sales_return_items(id,sale_item_id,product_no,product_name,size,colour,quantity,unit_price,line_total)')
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

    // Load each table separately so PostgREST relationship embedding cannot
    // silently leave the POS without inventory rows.
    const { data: productRows, error: productError } = await supabase.from('products')
      .select('id,product_no,name,sku,selling_price')
      .eq('active', true)
    if (productError) { setNotice(`Could not load products: ${productError.message}`); return }

    const activeProducts = productRows || []
    if (activeProducts.length === 0) { setPosVariants([]); return }

    const productIds = activeProducts.map((product: any) => product.id)
    const { data: variantRows, error: variantError } = await supabase.from('product_variants')
      .select('id,product_id,size,colour,barcode')
      .in('product_id', productIds)
      .order('size')
    if (variantError) { setNotice(`Could not load size/colour variants: ${variantError.message}`); return }

    const activeVariants = variantRows || []
    if (activeVariants.length === 0) { setPosVariants([]); return }

    const variantIds = activeVariants.map((variant: any) => variant.id)
    const { data: stockRows, error: stockError } = await supabase.from('stock_balances')
      .select('variant_id,quantity,reorder_level')
      .in('variant_id', variantIds)
    if (stockError) { setNotice(`Could not load stock balances: ${stockError.message}`); return }

    const productsById = new Map(activeProducts.map((product: any) => [product.id, product]))
    const stockByVariantId = new Map((stockRows || []).map((stock: any) => [stock.variant_id, stock]))
    const mapped = activeVariants.map((variant: any) => {
      const product: any = productsById.get(variant.product_id)
      const stock: any = stockByVariantId.get(variant.id)
      return {
        id: variant.id, product_id: variant.product_id, size: variant.size, colour: variant.colour,
        barcode: variant.barcode, quantity: Number(stock?.quantity ?? 0),
        reorder_level: Number(stock?.reorder_level ?? 5), product_no: product?.product_no ?? '',
        product_name: product?.name ?? '', sku: product?.sku ?? '',
        selling_price: Number(product?.selling_price ?? 0),
      } as POSVariant
    })
    setPosVariants(mapped)
  }

  useEffect(() => { if (session) { void loadProducts(); void loadPOSVariants(); void loadCustomers(); void loadSales(); void loadCustomerPayments(); void loadReturns(); void loadSuppliers(); void loadPurchases(); void loadSupplierPayments(); void loadExpenses(); void loadEmployees() } else { setEmployees([]); setCurrentEmployeeRole(supabaseConfigured ? null : 'Admin'); setAttendanceRecords([]); setPayrollRuns([]); setPayrollAttendance([]) } }, [session])
  useEffect(() => { if (!session) return; if (page === 'Loyalty') void loadLoyalty(); if (page === 'Cash Management') void loadCashSessions(); if (page === 'Purchase Orders') { void loadPurchaseRequests(); void loadSuppliers(); void loadPOSVariants() } }, [page, session])
  useEffect(() => { if (session && employees.length) { void loadAttendance(); if (['Admin','Manager'].includes(currentEmployeeRole || '')) void loadPayrollRuns() } }, [session, employees.length, currentEmployeeRole])
  useEffect(() => { if (session && employees.length && ['Admin','Manager'].includes(currentEmployeeRole || '')) void loadPayrollAttendance() }, [session, employees.length, currentEmployeeRole, payrollStart, payrollEnd])
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
    const received = Number(amountReceived || 0)
    if (paymentMethod === 'Credit') {
      if (!selectedCustomer) { setNotice('Select a registered customer for a credit sale.'); return }
      if (!Number.isFinite(received) || received < 0 || received >= cartTotal) { setNotice('Enter an initial payment from zero up to less than the invoice total.'); return }
    } else {
      if (!Number.isFinite(received) || received < cartTotal) { setNotice('Amount received must be equal to or greater than the total.'); return }
      if (paymentMethod !== 'Cash' && received !== cartTotal) { setNotice('For card or bank transfer, enter the exact sale total.'); return }
    }
    setBusy(true)
    const invoiceItems = cart.map(line => ({ ...line }))
    if (supabase && session) {
      const { data, error } = paymentMethod === 'Credit'
        ? await supabase.rpc('complete_credit_sale', {
            p_items: cart.map(line => ({ variant_id: line.variant_id, quantity: line.quantity })),
            p_discount: discountValue,
            p_customer_id: selectedCustomer,
            p_amount_received: received,
            p_initial_payment_method: creditPaymentMethod,
            p_payment_date: new Date().toISOString().slice(0,10),
          })
        : await supabase.rpc('complete_sale_for_customer', {
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
      await Promise.all([loadSales(),loadCustomerPayments()])
      if (paymentMethod === 'Credit') setNotice(`Credit invoice ${result.invoice_no} created. Outstanding: ${money(Number(result.outstanding))}.`)
    } else {
      setPosVariants(current => current.map(v => {
        const sold = cart.find(line => line.variant_id === v.id)
        return sold ? { ...v, quantity: v.quantity - sold.quantity } : v
      }))
      const demoInvoiceNo = `DEMO-${Date.now()}`
      const demoCustomer = customers.find(c => c.id === selectedCustomer) || null
      const demoCreatedAt = new Date().toISOString()
      const demoPayment = paymentMethod==='Credit' && received>0 ? { id: crypto.randomUUID(), payment_no: `CP-DEMO-${Date.now()}`, customer_id: demoCustomer?.id, sale_id: demoInvoiceNo, amount: received, payment_method: creditPaymentMethod, payment_date: localBusinessDate(), reference_no: null, customers: demoCustomer, sales: { invoice_no: demoInvoiceNo, total: cartTotal } } : null
      setLastInvoice({ invoice_no: demoInvoiceNo, subtotal: cartSubtotal, discount: discountValue, total: cartTotal,
        amount_received: received, change_amount: paymentMethod==='Credit'?0:received - cartTotal, payment_method: paymentMethod, created_at: demoCreatedAt, items: invoiceItems })
      setSales(current => [{ id: demoInvoiceNo, invoice_no: demoInvoiceNo, subtotal: cartSubtotal, discount: discountValue, total: cartTotal,
        amount_received: received, change_amount: paymentMethod==='Credit'?0:received - cartTotal, payment_method: paymentMethod, customer_id: demoCustomer?.id || null, created_at: demoCreatedAt,
        customer_payments: demoPayment?[demoPayment]:[], customers: demoCustomer, sale_items: invoiceItems.map((line,i) => ({ id: `${demoInvoiceNo}-${i}`, product_no: line.product_no, product_name: line.name, sku: line.sku, size: line.size, colour: line.colour, quantity: line.quantity, unit_price: line.unit_price, line_total: line.unit_price * line.quantity })) }, ...current])
      if (demoPayment) setCustomerPayments(current=>[demoPayment,...current])
      setNotice('Demo sale completed locally only. No data was saved to Supabase.')
    }
    setCart([]); setDiscount('0'); setAmountReceived(''); setSelectedCustomer(''); setBusy(false)
  }

  async function loadLoyalty() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('customer_loyalty_ledger').select('id,customer_id,points,entry_type,description,created_at,customers(full_name,phone)').order('created_at',{ascending:false}).limit(500)
    if (error) setNotice(error.message); else setLoyaltyRows(data || [])
  }

  async function loadCashSessions() {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('cash_sessions').select('*').order('opened_at',{ascending:false}).limit(100)
    if (error) { setNotice(error.message); return }
    setCashHistory(data || [])
    setCashSession((data || []).find((x:any)=>x.status==='Open' && x.cashier_id===session.user.id) || null)
  }

  async function openCashSession(event: FormEvent) {
    event.preventDefault(); if (!supabase) return
    setBusy(true)
    const { data,error } = await supabase.rpc('open_cash_session',{p_opening_float:Number(cashFloat),p_note:null})
    if (error) setNotice(error.message); else { setNotice('Cash drawer opened.'); await loadCashSessions() }
    setBusy(false)
  }

  async function addCashMovement(event: FormEvent) {
    event.preventDefault(); if (!supabase || !cashSession) return
    setBusy(true)
    const {error}=await supabase.rpc('record_cash_session_entry',{p_session_id:cashSession.id,p_type:cashMovement.type,p_amount:Number(cashMovement.amount),p_reason:cashMovement.reason})
    if(error) setNotice(error.message); else { setNotice('Cash movement recorded.'); setCashMovement({type:'Cash In',amount:'',reason:''}); await loadCashSessions() }
    setBusy(false)
  }

  async function closeCashSession(event: FormEvent) {
    event.preventDefault(); if (!supabase || !cashSession) return
    setBusy(true)
    const {error}=await supabase.rpc('close_cash_session',{p_session_id:cashSession.id,p_counted_cash:Number(cashCounted),p_note:null})
    if(error) setNotice(error.message); else { setNotice('Cash drawer closed and variance recorded.'); setCashCounted(''); await loadCashSessions() }
    setBusy(false)
  }

  async function loadPurchaseRequests() {
    if (!supabase || !session) return
    const {data,error}=await supabase.from('purchase_requests').select('*,suppliers(name),purchase_request_items(*,product_variants(size,colour,products(name,product_no)))').order('created_at',{ascending:false}).limit(100)
    if(error) setNotice(error.message); else setPurchaseRequests(data || [])
  }

  async function createPurchaseRequest(event: FormEvent) {
    event.preventDefault(); if(!supabase) return
    if(!purchaseRequestForm.supplier_id || !purchaseRequestForm.variant_id || Number(purchaseRequestForm.quantity)<=0 || Number(purchaseRequestForm.unit_cost)<0) {setNotice('Select supplier and variant and enter valid quantity and cost.');return}
    setBusy(true)
    const {data,error}=await supabase.from('purchase_requests').insert({supplier_id:purchaseRequestForm.supplier_id,notes:purchaseRequestForm.notes.trim()||null}).select('id').single()
    if(error){setNotice(error.message);setBusy(false);return}
    const item=await supabase.from('purchase_request_items').insert({request_id:data.id,variant_id:purchaseRequestForm.variant_id,quantity:Number(purchaseRequestForm.quantity),estimated_unit_cost:Number(purchaseRequestForm.unit_cost)})
    if(item.error){await supabase.from('purchase_requests').delete().eq('id',data.id);setNotice(item.error.message);setBusy(false);return}
    const submit=await supabase.rpc('submit_purchase_request',{p_request_id:data.id})
    if(submit.error)setNotice(submit.error.message);else{setNotice('Purchase request submitted for approval.');setPurchaseRequestForm({supplier_id:'',variant_id:'',quantity:'1',unit_cost:'0',notes:''});await loadPurchaseRequests()}
    setBusy(false)
  }

  async function approvePurchaseRequest(id:string) {
    if(!supabase)return
    setBusy(true);const {error}=await supabase.rpc('approve_purchase_request',{p_request_id:id})
    if(error)setNotice(error.message);else{setNotice('Purchase request approved.');await loadPurchaseRequests()}
    setBusy(false)
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

  async function saveEmployee(event: FormEvent) {
    event.preventDefault()
    if (currentEmployeeRole !== 'Admin') { setNotice('Only an administrator can add or update employees.'); return }
    if (!employeeForm.full_name.trim()) { setNotice('Employee name is required.'); return }
    if (!Number.isFinite(Number(employeeForm.base_salary)) || Number(employeeForm.base_salary) < 0) { setNotice('Enter a valid non-negative pay rate.'); return }
    const row = {
      full_name: employeeForm.full_name.trim(),
      email: employeeForm.email.trim() || null,
      phone: employeeForm.phone.trim() || null,
      job_title: employeeForm.job_title.trim() || null,
      department: employeeForm.department.trim() || null,
      employment_type: employeeForm.employment_type,
      hire_date: employeeForm.hire_date || null,
      auth_user_id: employeeForm.auth_user_id.trim() || null,
      role: employeeForm.role,
      status: employeeForm.status,
      salary_basis: employeeForm.salary_basis,
      base_salary: Number(employeeForm.base_salary || 0),
      notes: employeeForm.notes.trim() || null,
    }
    setBusy(true)
    if (supabase && session) {
      const request = employeeEditingId
        ? supabase.from('employees').update(row).eq('id', employeeEditingId)
        : supabase.from('employees').insert(row)
      const { error } = await request
      if (error) setNotice(error.message)
      else {
        setNotice(employeeEditingId ? 'Employee updated successfully.' : 'Employee added successfully.')
        setEmployeeEditingId(null)
        setEmployeeForm({ full_name: '', email: '', phone: '', job_title: '', department: '', employment_type: 'Full-time', hire_date: new Date().toISOString().slice(0,10), auth_user_id: '', role: 'Staff', status: 'Active', salary_basis: 'Monthly', base_salary: '0', notes: '' })
        await loadEmployees()
      }
    } else {
      const local = { ...row, id: employeeEditingId || crypto.randomUUID(), employee_no: employees.find(e=>e.id===employeeEditingId)?.employee_no || `EMP-${String(employees.length+1).padStart(5,'0')}`, created_at: new Date().toISOString() }
      setEmployees(current => employeeEditingId ? current.map(e=>e.id===employeeEditingId?local:e) : [local,...current])
      setNotice('Demo mode: employee record is temporary.')
      setEmployeeEditingId(null)
      setEmployeeForm({ full_name: '', email: '', phone: '', job_title: '', department: '', employment_type: 'Full-time', hire_date: new Date().toISOString().slice(0,10), auth_user_id: '', role: 'Staff', status: 'Active', salary_basis: 'Monthly', base_salary: '0', notes: '' })
    }
    setBusy(false)
  }

  function editEmployee(employee: any) {
    setEmployeeEditingId(employee.id)
    setEmployeeForm({ full_name: employee.full_name || '', email: employee.email || '', phone: employee.phone || '', job_title: employee.job_title || '', department: employee.department || '', employment_type: employee.employment_type || 'Full-time', hire_date: employee.hire_date || '', auth_user_id: employee.auth_user_id || '', role: employee.role || 'Staff', status: employee.status || 'Active', salary_basis: employee.salary_basis || 'Monthly', base_salary: String(employee.base_salary || 0), notes: employee.notes || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  const [lowStockOnly, setLowStockOnly] = useState(false)

  function exportInventoryCSV() {
    const rows = [['Product No','Product','SKU','Category','Size','Colour','Barcode','On Hand','Reorder Level','Selling Price','Cost Price']]
    for (const product of products) {
      const productVariants = variants.filter(v => v.product_id === product.id)
      if (productVariants.length === 0) rows.push([product.product_no,product.name,product.sku,product.category || '', '', '', '', '0','5',String(product.selling_price),String(product.cost_price)])
      for (const v of productVariants) rows.push([product.product_no,product.name,product.sku,product.category || '',v.size,v.colour,v.barcode || '',String(v.quantity),String(v.reorder_level),String(product.selling_price),String(product.cost_price)])
    }
    const csv = rows.map(row => row.map(value => { const cell=String(value ?? ''); return '"' + (/^[=+@-]/.test(cell) ? "'"+cell : cell).replace(/"/g,'""') + '"' }).join(',')).join('\\r\\n')
    const url=URL.createObjectURL(new Blob(['\\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})); const a=document.createElement('a'); a.href=url; a.download='clothing-erp-inventory.csv'; a.click(); URL.revokeObjectURL(url)
  }

  function printBarcodeLabels(product: Product, productVariants: ProductVariant[]) {
    const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] || char))
    const labels = productVariants.map(v => `<div class="label"><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.product_no)} · ${escapeHtml(v.size)} / ${escapeHtml(v.colour)}</span><b>${escapeHtml(v.barcode || 'BARCODE NOT SET')}</b><small>${v.barcode ? 'Scan code / SKU' : 'Add a barcode before scanning'}</small></div>`).join('')
    const win=window.open('', '_blank', 'width=900,height=650'); if (!win) { setNotice('Allow pop-ups to print barcode labels.'); return }
    win.document.write(`<!doctype html><html><head><title>Product Labels</title><style>body{font-family:Arial;padding:12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.label{border:1px dashed #555;padding:12px;min-height:85px;display:flex;flex-direction:column;gap:5px;break-inside:avoid}.label strong{font-size:13px}.label span,.label small{font-size:10px}.label b{font-family:monospace;font-size:18px;letter-spacing:2px}@media print{@page{margin:6mm}.label{border:1px solid #aaa}}</style></head><body><div class="grid">${labels}</div><script>window.onload=()=>window.print()</script></body></html>`); win.document.close()
  }

  async function exportDataBackup() {
    if (!supabase || !session) { setNotice('Sign in to export a database backup.'); return }
    setBusy(true)
    const tables = ['products','product_variants','stock_balances','stock_movements','customers','suppliers','sales','sale_items','sales_returns','sales_return_items','purchase_orders','purchase_items','supplier_payments','customer_payments','expenses','employees','employee_attendance','payroll_runs','payroll_items']
    const backup: Record<string, unknown> = { exported_at: new Date().toISOString(), format_version: 1, tables: {} }
    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('*').limit(10000)
      if (error) { setNotice('Backup stopped at '+table+': '+error.message); setBusy(false); return }
      ;(backup.tables as Record<string, unknown>)[table] = data || []
    }
    const blob = new Blob([JSON.stringify(backup,null,2)],{type:'application/json'})
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='clothing-erp-backup-'+localBusinessDate()+'.json'; a.click(); URL.revokeObjectURL(url)
    setNotice('Database data export downloaded. Store it securely; this file contains customer and employee information.')
    setBusy(false)
  }

  const filtered = products.filter(p => `${p.product_no} ${p.name} ${p.sku} ${p.category || ''}`.toLowerCase().includes(query.toLowerCase()))
  const todayKey = new Date().toLocaleDateString('en-CA')
  const monthKey = todayKey.slice(0,7)
  const dateInRange = (value: string, start: string, end: string) => {
    const key = String(value || '').slice(0,10)
    return key >= start && key <= end
  }
  const todaySales = sales.filter(s => String(s.created_at).slice(0,10) === todayKey)
  const monthSales = sales.filter(s => String(s.created_at).slice(0,7) === monthKey)
  const todayRevenue = todaySales.reduce((sum,s)=>sum+Number(s.total),0)
  const monthRevenue = monthSales.reduce((sum,s)=>sum+Number(s.total),0)
  const monthReturns = returns.filter(r=>String(r.created_at).slice(0,7)===monthKey)
  const monthRefunds = monthReturns.reduce((sum,r)=>sum+Number(r.refund_total),0)
  const monthCOGS = monthSales.reduce((sum,s)=>sum+(s.sale_items||[]).reduce((n:number,line:any)=>n+Number(line.unit_cost||0)*Number(line.quantity||0),0),0)
    - monthReturns.filter(r=>r.restock_items).reduce((sum,r)=>sum+(r.sales_return_items||[]).reduce((n:number,line:any)=>{const sold=monthSales.flatMap(s=>s.sale_items||[]).find((x:any)=>x.id===line.sale_item_id);return n+Number(sold?.unit_cost||0)*Number(line.quantity||0)},0),0)
  const monthOperatingExpenses = expenses.filter(e=>String(e.expense_date).slice(0,7)===monthKey && e.category!=='Supplier Payment').reduce((sum,e)=>sum+Number(e.amount),0)
  const monthGrossProfit = monthRevenue-monthRefunds-monthCOGS
  const monthEstimatedProfit = monthGrossProfit-monthOperatingExpenses
  const reportSales = sales.filter(s=>dateInRange(s.created_at,reportStart,reportEnd))
  const reportReturns = returns.filter(r=>dateInRange(r.created_at,reportStart,reportEnd))
  const reportExpenses = expenses.filter(e=>dateInRange(e.expense_date,reportStart,reportEnd))
  const reportGrossSales = reportSales.reduce((sum,s)=>sum+Number(s.subtotal),0)
  const reportDiscounts = reportSales.reduce((sum,s)=>sum+Number(s.discount),0)
  const reportRevenue = reportSales.reduce((sum,s)=>sum+Number(s.total),0)
  const reportRefunds = reportReturns.reduce((sum,r)=>sum+Number(r.refund_total),0)
  const reportCOGS = reportSales.reduce((sum,s)=>sum+(s.sale_items||[]).reduce((n:number,line:any)=>n+Number(line.unit_cost||0)*Number(line.quantity||0),0),0)
    - reportReturns.filter(r=>r.restock_items).reduce((sum,r)=>sum+(r.sales_return_items||[]).reduce((n:number,line:any)=>{const sold=reportSales.flatMap(s=>s.sale_items||[]).find((x:any)=>x.id===line.sale_item_id);return n+Number(sold?.unit_cost||0)*Number(line.quantity||0)},0),0)
  const reportOperatingExpenses = reportExpenses.filter(e=>e.category!=='Supplier Payment').reduce((sum,e)=>sum+Number(e.amount),0)
  const reportGrossProfit = reportRevenue-reportRefunds-reportCOGS
  const reportNetProfit = reportGrossProfit-reportOperatingExpenses
  const paymentBreakdown = ['Cash','Card','Bank Transfer'].map(method=>({method,count:reportSales.filter(s=>s.payment_method===method).length,total:reportSales.filter(s=>s.payment_method===method).reduce((sum,s)=>sum+Number(s.total),0)}))
  const topProducts = Object.values(reportSales.flatMap(s=>s.sale_items||[]).reduce((acc:any,line:any)=>{const key=line.product_no||line.product_name;acc[key]??={name:line.product_name,productNo:line.product_no,quantity:0,revenue:0};acc[key].quantity+=Number(line.quantity);acc[key].revenue+=Number(line.line_total);return acc},{})).sort((x:any,y:any)=>y.quantity-x.quantity).slice(0,8)
  const expenseBreakdown = Object.values(reportExpenses.reduce((acc:any,e:any)=>{acc[e.category]??={category:e.category,total:0,count:0};acc[e.category].total+=Number(e.amount);acc[e.category].count++;return acc},{})).sort((x:any,y:any)=>y.total-x.total)
  const lowStockItems = posVariants.filter(v=>v.quantity<=v.reorder_level).sort((x,y)=>x.quantity-y.quantity).slice(0,8)
  const lowStockCount = posVariants.filter(v => v.quantity <= v.reorder_level).length

  if (!authReady) return <div className="auth-screen"><article><h2>Clothing ERP</h2><p>Checking your secure session…</p></article></div>
  if (supabaseConfigured && !session) return <div className="auth-screen"><form className="login-card" onSubmit={signIn}>
    <div className="brand-mark">◈</div><p className="eyebrow">CLOTHING RETAIL MANAGEMENT</p><h1>Welcome back</h1><p className="muted">Sign in to access your shop workspace.</p>
    {notice && <p className="notice">{notice}</p>}
    <label>Email address<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
    <button className="primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><p className="muted hint">User accounts are managed securely in Supabase.</p>
  </form></div>

  return <div className="shell">
    <aside><h2>◈ Clothing ERP</h2><small>RETAIL MANAGEMENT</small>{(supabaseConfigured && session ? (currentEmployeeRole === 'Admin' ? navigation : currentEmployeeRole === 'Manager' ? navigation.filter(item=>item!=='Settings') : currentEmployeeRole === 'Cashier' ? ['Overview','Point of Sale','Sales History','Customers','Customer Accounts','Attendance'] : currentEmployeeRole === 'Staff' ? ['Overview','Products & Stock','Attendance'] : ['Overview','Employees']) : navigation).map(item => <button key={item} className={page === item ? 'active' : ''} onClick={() => setPage(item)}>{item}</button>)}</aside>
    <main><header><b>Workspace / {page}</b><div className="header-actions"><span className={supabaseConfigured ? 'ok' : 'demo'}>{supabaseConfigured ? 'Supabase connected' : 'Demo mode'}</span>{session && <button className="text-button" onClick={() => void signOut()}>Sign out</button>}</div></header>
      <section>
        {notice && <p className="notice">{notice}<button className="dismiss" onClick={() => setNotice('')}>×</button></p>}
                {page === 'Overview' ? <>
          <div className="heading"><div><p className="eyebrow">LIVE SHOP OVERVIEW</p><h1>Good morning 👋</h1><p>Business performance based on the latest loaded transactions.</p></div><button onClick={()=>{void loadSales();void loadExpenses();void loadReturns();void loadPOSVariants();void loadProducts()}}>Refresh data</button></div>
          <div className="stats">
            {[[ 'Today’s Sales', money(todayRevenue) ],[ 'Monthly Sales', money(monthRevenue) ],[ 'Estimated Monthly Profit', money(monthEstimatedProfit) ],[ 'Active Products', String(products.filter(p=>p.active).length) ],[ 'Low Stock Variants', String(lowStockCount) ]].map(([label,value])=><article key={label}><small>{label}</small><h2>{value}</h2></article>)}
          </div>
          <div className="dashboard-grid">
            <article><div className="toolbar"><h3>Monthly performance</h3><span className="muted">{monthKey}</span></div>
              <div className="performance-list"><div><span>Sales total</span><b>{money(monthRevenue)}</b></div><div><span>Refunds</span><b>{money(monthRefunds)}</b></div><div><span>Cost of goods sold</span><b>{money(monthCOGS)}</b></div><div><span>Gross profit</span><b>{money(monthGrossProfit)}</b></div><div><span>Operating expenses</span><b>{money(monthOperatingExpenses)}</b></div><div className="performance-total"><span>Estimated net profit</span><b>{money(monthEstimatedProfit)}</b></div></div>
            </article>
            <article><div className="toolbar"><h3>Low stock alerts</h3><button className="small-action" onClick={()=>setPage('Products & Stock')}>View inventory</button></div>
              <div className="tablewrap"><table><thead><tr><th>PRODUCT</th><th>SIZE / COLOUR</th><th>STOCK</th><th>REORDER</th></tr></thead><tbody>
                {lowStockItems.map(v=><tr key={v.id}><td>{v.product_name}<small>{v.product_no}</small></td><td>{v.size} / {v.colour}</td><td><b>{v.quantity}</b></td><td>{v.reorder_level}</td></tr>)}
                {lowStockItems.length===0&&<tr><td colSpan={4}>No low-stock variants. Great work!</td></tr>}
              </tbody></table></div>
            </article>
          </div>
          <article><div className="toolbar"><h3>Recent sales</h3><button className="small-action" onClick={()=>setPage('Sales History')}>View all sales</button></div>
            <div className="tablewrap"><table><thead><tr><th>DATE</th><th>INVOICE</th><th>PAYMENT</th><th>ITEMS</th><th>TOTAL</th></tr></thead><tbody>
              {sales.slice(0,6).map(s=><tr key={s.id}><td>{new Date(s.created_at).toLocaleString()}</td><td><b>{s.invoice_no}</b></td><td>{s.payment_method}</td><td>{(s.sale_items||[]).reduce((n:number,i:any)=>n+Number(i.quantity),0)}</td><td>{money(Number(s.total))}</td></tr>)}
              {sales.length===0&&<tr><td colSpan={5}>No sales recorded yet.</td></tr>}
            </tbody></table></div>
          </article>
          <p className="muted">Figures use the latest 500 sales, 500 returns and 1,000 expenses loaded by this app. Estimated profit excludes supplier-payment entries to avoid treating inventory settlement as an operating expense. Confirm accounting treatment with your accountant.</p>
        </> : page === 'Reports' ? <>
          <div className="heading"><div><p className="eyebrow">BUSINESS INTELLIGENCE</p><h1>Reports & Analytics</h1><p>Review sales, refunds, estimated profit, payment methods and product performance.</p></div><div className="toolbar"><button onClick={()=>{void loadSales();void loadExpenses();void loadReturns();void loadPOSVariants()}}>Refresh reports</button><button className="primary" onClick={() => {
            const rows: (string | number)[][] = [
              ['CLOTHING SHOP ERP - REPORTS & ANALYTICS'],
              ['Period', reportStart, 'to', reportEnd],
              [],
              ['SUMMARY'],
              ['Sales Subtotal', reportGrossSales],
              ['Discounts', reportDiscounts],
              ['Refunds', reportRefunds],
              ['Net Sales', reportRevenue - reportRefunds],
              ['Estimated Gross Profit', reportGrossProfit],
              ['Operating Expenses', reportOperatingExpenses],
              ['Estimated Net Profit', reportNetProfit],
              [],
              ['SALES BY PAYMENT METHOD'],
              ['Payment Method', 'Transactions', 'Total'],
              ...paymentBreakdown.map(x => [x.method, x.count, x.total] as (string | number)[]),
              [],
              ['EXPENSES BY CATEGORY'],
              ['Category', 'Entries', 'Total'],
              ...expenseBreakdown.map((x:any) => [x.category, x.count, x.total] as (string | number)[]),
              [],
              ['TOP-SELLING PRODUCTS'],
              ['Product', 'Product No.', 'Units Sold', 'Sales Value'],
              ...topProducts.map((x:any) => [x.name, x.productNo || '', x.quantity, x.revenue] as (string | number)[]),
              [],
              ['SALES TRANSACTIONS'],
              ['Date', 'Invoice', 'Items', 'Payment Method', 'Amount'],
              ...reportSales.map(s => [s.created_at, s.invoice_no, (s.sale_items || []).reduce((n:number,i:any)=>n+Number(i.quantity),0), s.payment_method, Number(s.total)] as (string | number)[])
            ];
            const csv = rows.map(row => row.map(value => {
              let cell = String(value ?? '');
              if (/^[=+@-]/.test(cell)) cell = "'" + cell;
              return '"' + cell.replace(/"/g, '""') + '"';
            }).join(',')).join('\\r\\n');
            const blob = new Blob(['\\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `clothing-erp-report-${reportStart}-to-${reportEnd}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
          }}>Export CSV</button></div></div>
          <article className="report-filter"><label>From<input type="date" value={reportStart} max={reportEnd} onChange={e=>setReportStart(e.target.value)}/></label><label>To<input type="date" value={reportEnd} min={reportStart} onChange={e=>setReportEnd(e.target.value)}/></label><button onClick={()=>{const d=new Date();setReportEnd(d.toISOString().slice(0,10));setReportStart(new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10))}}>This month</button><button onClick={()=>{const d=new Date();setReportEnd(d.toISOString().slice(0,10));setReportStart(new Date(d.getFullYear(),0,1).toISOString().slice(0,10))}}>This year</button></article>
          <div className="stats report-stats">{[[ 'Sales Subtotal',money(reportGrossSales) ],[ 'Discounts',money(reportDiscounts) ],[ 'Refunds',money(reportRefunds) ],[ 'Net Sales',money(reportRevenue-reportRefunds) ],[ 'Gross Profit (Est.)',money(reportGrossProfit) ],[ 'Operating Expenses',money(reportOperatingExpenses) ],[ 'Net Profit (Est.)',money(reportNetProfit) ]].map(([label,value])=><article key={label}><small>{label}</small><h2>{value}</h2></article>)}</div>
          <div className="dashboard-grid">
            <article><h3>Sales by payment method</h3><div className="report-list">{paymentBreakdown.map(x=><div key={x.method}><span>{x.method}<small>{x.count} transactions</small></span><b>{money(x.total)}</b></div>)}</div></article>
            <article><h3>Expenses by category</h3><div className="report-list">{expenseBreakdown.map((x:any)=><div key={x.category}><span>{x.category}<small>{x.count} entries</small></span><b>{money(x.total)}</b></div>)}{expenseBreakdown.length===0&&<p className="muted">No expenses for this period.</p>}</div></article>
          </div>
          <article><h3>Top-selling products</h3><div className="tablewrap"><table><thead><tr><th>PRODUCT</th><th>PRODUCT NO.</th><th>UNITS SOLD</th><th>SALES VALUE</th></tr></thead><tbody>
            {topProducts.map((x:any)=><tr key={x.productNo||x.name}><td>{x.name}</td><td>{x.productNo||'—'}</td><td>{x.quantity}</td><td>{money(x.revenue)}</td></tr>)}
            {topProducts.length===0&&<tr><td colSpan={4}>No product sales in this period.</td></tr>}
          </tbody></table></div></article>
          <article><h3>Recent transactions in selected period</h3><div className="tablewrap"><table><thead><tr><th>DATE</th><th>INVOICE</th><th>ITEMS</th><th>PAYMENT</th><th>AMOUNT</th></tr></thead><tbody>
            {reportSales.slice(0,12).map(s=><tr key={s.id}><td>{new Date(s.created_at).toLocaleDateString()}</td><td>{s.invoice_no}</td><td>{(s.sale_items||[]).reduce((n:number,i:any)=>n+Number(i.quantity),0)}</td><td>{s.payment_method}</td><td>{money(Number(s.total))}</td></tr>)}
            {reportSales.length===0&&<tr><td colSpan={5}>No sales in this period.</td></tr>}
          </tbody></table></div></article>
          <p className="muted">Reports use the latest 500 sales, 500 returns and 1,000 expenses loaded by this app. Profit is estimated from recorded sale-item unit costs and restocked returns; supplier-payment expenses are excluded from operating expenses. Export and full accounting reconciliation are not included in this release.</p>
        </> : page === 'Employees' ? <>
          <div className="heading"><div><p className="eyebrow">TEAM & ACCESS CONTROL</p><h1>Employee Management</h1><p>Maintain staff details and connect each employee to a Supabase login account.</p></div><button onClick={()=>void loadEmployees()}>Refresh</button></div>
          {currentEmployeeRole !== 'Admin' && currentEmployeeRole !== 'Manager' ? <article>
            <h3>Administrator setup required</h3>
            <p>Your current login is not linked to an active employee profile with Admin or Manager access. Ask the shop owner to complete the one-time administrator setup described in <code>supabase/migrations/0010_employee_management.sql</code>.</p>
            <p className="muted">Employee records and role changes are protected by Supabase Row Level Security. Do not disable those policies to make this screen work.</p>
          </article> : <>
            {currentEmployeeRole === 'Admin' && <article className="employee-entry"><div className="toolbar"><h3>{employeeEditingId ? 'Update employee' : 'Add new employee'}</h3>{employeeEditingId && <button type="button" onClick={()=>{setEmployeeEditingId(null);setEmployeeForm({ full_name: '', email: '', phone: '', job_title: '', department: '', employment_type: 'Full-time', hire_date: new Date().toISOString().slice(0,10), auth_user_id: '', role: 'Staff', status: 'Active', salary_basis: 'Monthly', base_salary: '0', notes: '' })}}>Cancel edit</button>}</div>
              <form className="employee-form" onSubmit={saveEmployee}>
                <label>Full name<input required value={employeeForm.full_name} onChange={e=>setEmployeeForm({...employeeForm,full_name:e.target.value})}/></label>
                <label>Email<input type="email" value={employeeForm.email} onChange={e=>setEmployeeForm({...employeeForm,email:e.target.value})}/></label>
                <label>Phone<input value={employeeForm.phone} onChange={e=>setEmployeeForm({...employeeForm,phone:e.target.value})}/></label>
                <label>Job title<input value={employeeForm.job_title} onChange={e=>setEmployeeForm({...employeeForm,job_title:e.target.value})} placeholder="e.g. Sales Assistant"/></label>
                <label>Department<input value={employeeForm.department} onChange={e=>setEmployeeForm({...employeeForm,department:e.target.value})} placeholder="e.g. Retail"/></label>
                <label>Employment type<select value={employeeForm.employment_type} onChange={e=>setEmployeeForm({...employeeForm,employment_type:e.target.value})}>{['Full-time','Part-time','Contract','Temporary'].map(x=><option key={x}>{x}</option>)}</select></label>
                <label>Hire date<input type="date" value={employeeForm.hire_date} onChange={e=>setEmployeeForm({...employeeForm,hire_date:e.target.value})}/></label>
                <label>System role<select value={employeeForm.role} onChange={e=>setEmployeeForm({...employeeForm,role:e.target.value})}>{['Admin','Manager','Cashier','Staff'].map(x=><option key={x}>{x}</option>)}</select></label>
                <label>Status<select value={employeeForm.status} onChange={e=>setEmployeeForm({...employeeForm,status:e.target.value})}><option>Active</option><option>Inactive</option></select></label>
                <label>Pay basis<select value={employeeForm.salary_basis} onChange={e=>setEmployeeForm({...employeeForm,salary_basis:e.target.value})}><option>Monthly</option><option>Hourly</option></select></label>
                <label>{employeeForm.salary_basis==='Hourly'?'Hourly rate (LKR)':'Monthly salary (LKR)'}<input type="number" min="0" step="0.01" value={employeeForm.base_salary} onChange={e=>setEmployeeForm({...employeeForm,base_salary:e.target.value})}/></label>
                <label className="employee-wide">Supabase Auth User ID<input value={employeeForm.auth_user_id} onChange={e=>setEmployeeForm({...employeeForm,auth_user_id:e.target.value})} placeholder="Paste the Auth user UUID after creating their login"/></label>
                <label className="employee-wide">Notes<textarea rows={2} value={employeeForm.notes} onChange={e=>setEmployeeForm({...employeeForm,notes:e.target.value})}/></label>
                <div className="employee-wide"><button className="primary" disabled={busy}>{busy?'Saving…':employeeEditingId?'Update employee':'Save employee'}</button></div>
              </form>
              <p className="muted">Create login accounts in Supabase Dashboard → Authentication → Users. Then copy the user's UUID into the Auth User ID field. This app does not create passwords or send invitations.</p>
            </article>}
            <article><div className="toolbar"><div><h3>Employee directory ({employees.length})</h3><p className="muted">Your access level: {currentEmployeeRole}</p></div><input placeholder="Search name, role, department or phone…" value={employeeQuery} onChange={e=>setEmployeeQuery(e.target.value)}/></div>
              <div className="tablewrap"><table><thead><tr><th>EMPLOYEE NO.</th><th>EMPLOYEE</th><th>CONTACT</th><th>DEPARTMENT / TITLE</th><th>ROLE</th><th>STATUS</th><th>PAY BASIS / RATE</th>{currentEmployeeRole==='Admin'&&<th>ACTION</th>}</tr></thead><tbody>
                {employees.filter(e=>`${e.employee_no||''} ${e.full_name||''} ${e.email||''} ${e.phone||''} ${e.department||''} ${e.job_title||''} ${e.role||''}`.toLowerCase().includes(employeeQuery.toLowerCase())).map(e=><tr key={e.id}><td><b>{e.employee_no||'—'}</b></td><td>{e.full_name}<small>{e.email||'No email recorded'}</small></td><td>{e.phone||'—'}</td><td>{e.department||'—'}<small>{e.job_title||''}</small></td><td><span className="employee-role">{e.role}</span>{!e.auth_user_id&&<small>Login not linked</small>}</td><td><span className={e.status==='Active'?'stock-ok':'stock-low'}>{e.status}</span></td><td>{e.salary_basis||'Monthly'}<small>{money(Number(e.base_salary||0))} {e.salary_basis==='Hourly'?'/ hour':'/ month'}</small></td>{currentEmployeeRole==='Admin'&&<td><button className="small-action" onClick={()=>editEmployee(e)}>Edit</button></td>}</tr>)}
                {employees.filter(e=>`${e.employee_no||''} ${e.full_name||''} ${e.email||''} ${e.phone||''} ${e.department||''} ${e.job_title||''} ${e.role||''}`.toLowerCase().includes(employeeQuery.toLowerCase())).length===0&&<tr><td colSpan={currentEmployeeRole==='Admin'?8:7}>No employees found.</td></tr>}
              </tbody></table></div>
            </article>
          </>}
        </> : page === 'Attendance' ? <>
          <div className="heading"><div><p className="eyebrow">TIME & ATTENDANCE</p><h1>Attendance</h1><p>Record daily check-in and check-out times and review worked hours.</p></div><button onClick={()=>{void loadEmployees();void loadAttendance()}}>Refresh</button></div>
          <article className="attendance-punch">
            <div><small>ATTENDANCE DATE</small><input type="date" value={attendanceDate} onChange={e=>setAttendanceDate(e.target.value)}/></div>
            {['Admin','Manager'].includes(currentEmployeeRole||'') && <div><small>EMPLOYEE</small><select value={attendanceEmployeeId || (employees.find(e=>e.auth_user_id===session?.user.id)?.id || '')} onChange={e=>setAttendanceEmployeeId(e.target.value)}><option value="">Select employee</option>{employees.filter(e=>e.status==='Active').map(e=><option key={e.id} value={e.id}>{e.employee_no} – {e.full_name}</option>)}</select></div>}
            <div className="punch-actions">
              {(() => { const own=employees.find(e=>e.auth_user_id===session?.user.id); const targetId=['Admin','Manager'].includes(currentEmployeeRole||'')?(attendanceEmployeeId||own?.id||''):(own?.id||''); const todayRecord=attendanceRecords.find(r=>r.employee_id===targetId&&r.work_date===attendanceDate); return <><button className="primary" disabled={busy||!targetId||!!todayRecord?.check_in||attendanceDate!==localBusinessDate()} onClick={()=>void punchIn(targetId)}>Check in</button><button disabled={busy||!todayRecord?.check_in||!!todayRecord?.check_out||attendanceDate!==new Date().toISOString().slice(0,10)} onClick={()=>void punchOut(todayRecord)}>Check out</button><span className="muted">{attendanceDate!==new Date().toISOString().slice(0,10)?'Punching is available for today only.':todayRecord?.check_in?todayRecord.check_out?'Shift completed': 'Checked in at '+new Date(todayRecord.check_in).toLocaleTimeString('en-LK',{timeZone:'Asia/Colombo'}): 'No check-in recorded for this date.'}</span></> })()}
            </div>
          </article>
          {!session && supabaseConfigured && <article><p>Please sign in to record attendance.</p></article>}
          {session && !employees.some(e=>e.auth_user_id===session.user.id) && !['Admin','Manager'].includes(currentEmployeeRole||'') && <article><p>Your login is not linked to an active employee record. Ask an administrator to link your Supabase Auth User ID in Employee Management.</p></article>}
          <article><div className="toolbar"><div><h3>Daily attendance</h3><p className="muted">{attendanceRecords.filter(r=>r.work_date===attendanceDate).length} records for {attendanceDate}</p></div><button onClick={()=>void loadAttendance()}>Refresh records</button></div>
            <div className="tablewrap"><table><thead><tr><th>EMPLOYEE</th><th>CHECK IN</th><th>CHECK OUT</th><th>BREAK (MIN)</th><th>HOURS</th><th>STATUS</th></tr></thead><tbody>
              {attendanceRecords.filter(r=>r.work_date===attendanceDate).map(r=>{const p=Array.isArray(r.employees)?r.employees[0]:r.employees;return <tr key={r.id}><td><b>{p?.employee_no||'—'} {p?.full_name||'Employee'}</b><small>{p?.job_title||''}</small></td><td>{r.check_in?new Date(r.check_in).toLocaleTimeString('en-LK',{timeZone:'Asia/Colombo'}):'—'}</td><td>{r.check_out?new Date(r.check_out).toLocaleTimeString('en-LK',{timeZone:'Asia/Colombo'}):'—'}</td><td>{['Admin','Manager'].includes(currentEmployeeRole||'')?<input className="break-input" type="number" min="0" max="600" defaultValue={r.break_minutes||0} onBlur={e=>void updateAttendanceBreak(r,Number(e.target.value))}/>:r.break_minutes||0}</td><td>{r.check_out?attendanceHours(r).toFixed(2)+' h':'In progress'}</td><td>{['Admin','Manager'].includes(currentEmployeeRole||'')?<select value={r.status} onChange={e=>void updateAttendanceStatus(r,e.target.value)}>{['Present','Late','Half-day','Leave','Absent'].map(x=><option key={x}>{x}</option>)}</select>:r.status}</td></tr>})}
              {attendanceRecords.filter(r=>r.work_date===attendanceDate).length===0&&<tr><td colSpan={6}>No attendance records for this date.</td></tr>}
            </tbody></table></div>
          </article>
          <article><h3>Attendance history</h3><div className="tablewrap"><table><thead><tr><th>DATE</th><th>EMPLOYEE</th><th>HOURS</th><th>STATUS</th></tr></thead><tbody>{attendanceRecords.slice(0,30).map(r=>{const p=Array.isArray(r.employees)?r.employees[0]:r.employees;return <tr key={r.id}><td>{r.work_date}</td><td>{p?.full_name||'Employee'}</td><td>{r.check_out?attendanceHours(r).toFixed(2)+' h':'—'}</td><td>{r.status}</td></tr>})}{attendanceRecords.length===0&&<tr><td colSpan={4}>No attendance history yet.</td></tr>}</tbody></table></div></article>
        </> : page === 'Payroll' ? <>
          <div className="heading"><div><p className="eyebrow">PAYROLL REGISTER</p><h1>Payroll</h1><p>Prepare a draft gross-pay register from employee pay rates and recorded attendance.</p></div><button onClick={()=>{void loadEmployees();void loadAttendance();void loadPayrollRuns()}}>Refresh</button></div>
          {['Admin','Manager'].includes(currentEmployeeRole||'') ? <>
            <article className="payroll-builder"><h3>Create payroll run</h3><div className="payroll-filters"><label>Period start<input type="date" value={payrollStart} onChange={e=>setPayrollStart(e.target.value)}/></label><label>Period end<input type="date" value={payrollEnd} min={payrollStart} onChange={e=>setPayrollEnd(e.target.value)}/></label><button className="primary" disabled={busy} onClick={()=>void createPayrollRun()}>{busy?'Preparing…':'Generate draft payroll'}</button></div>
              <p className="muted">Monthly employees receive the configured monthly base salary for this run. Hourly employees are calculated from completed attendance hours. Enter any manual deductions below before generating the draft.</p>
              <div className="tablewrap"><table><thead><tr><th>EMPLOYEE</th><th>PAY BASIS</th><th>RATE</th><th>HOURS</th><th>DAYS</th><th>DEDUCTION (LKR)</th><th>EST. GROSS</th><th>EST. NET</th></tr></thead><tbody>
                {employees.filter(e=>e.status==='Active').map(e=>{const rows=payrollAttendance.filter(r=>r.employee_id===e.id);const hours=rows.reduce((n,r)=>n+attendanceHours(r),0);const days=rows.reduce((n,r)=>n+(r.status==='Half-day'?.5:['Present','Late'].includes(r.status)?1:0),0);const gross=(e.salary_basis||'Monthly')==='Hourly'?hours*Number(e.base_salary||0):monthlyPayForPeriod(Number(e.base_salary||0),payrollStart,payrollEnd);return <tr key={e.id}><td><b>{e.employee_no} – {e.full_name}</b></td><td>{e.salary_basis||'Monthly'}</td><td>{money(Number(e.base_salary||0))}</td><td>{hours.toFixed(2)}</td><td>{days.toFixed(1)}</td><td><input className="deduction-input" type="number" min="0" max={gross} step="0.01" value={payrollDeductions[e.id]||'0'} onChange={ev=>setPayrollDeductions(cur=>({...cur,[e.id]:ev.target.value}))}/></td><td>{money(gross)}</td><td>{money(Math.max(0,gross-Number(payrollDeductions[e.id]||0)))}</td></tr>})}
                {employees.filter(e=>e.status==='Active').length===0&&<tr><td colSpan={8}>No active employees.</td></tr>}
              </tbody></table></div>
            </article>
            <div className="payroll-runs"><h3>Payroll history</h3>{payrollRuns.map(run=><article key={run.id}><div className="toolbar"><div><h3>{run.period_start} – {run.period_end}</h3><span className={run.status==='Paid'?'stock-ok':'stock-low'}>{run.status}</span></div><div><b>Net: {money(Number(run.total_net))}</b>{run.status==='Draft'&&<button className="primary" onClick={()=>void markPayrollPaid(run)}>Mark as paid</button>}</div></div><p className="muted">Gross {money(Number(run.total_gross))} · Deductions {money(Number(run.total_deductions))} · Net {money(Number(run.total_net))}</p><div className="tablewrap"><table><thead><tr><th>EMPLOYEE</th><th>BASIS</th><th>HOURS</th><th>GROSS</th><th>DEDUCTIONS</th><th>NET PAY</th></tr></thead><tbody>{(run.payroll_items||[]).map((item:any)=>{const p=Array.isArray(item.employees)?item.employees[0]:item.employees;return <tr key={item.id}><td>{p?.employee_no||''} {p?.full_name||'Employee'}</td><td>{item.salary_basis}</td><td>{Number(item.hours_worked).toFixed(2)}</td><td>{money(Number(item.gross_pay))}</td><td>{money(Number(item.deductions))}</td><td><b>{money(Number(item.net_pay))}</b></td></tr>})}</tbody></table></div></article>)}{payrollRuns.length===0&&<article>No payroll runs have been created yet.</article>}</div>
          </> : <article><p>Payroll access is restricted to Admin and Manager roles.</p></article>}
          <article className="payroll-note"><b>Payroll scope:</b> This is a basic payroll register, not a statutory payroll calculator. EPF/ETF, PAYE, overtime, leave encashment, payslip generation and legal compliance calculations are not included. Verify applicable Sri Lankan requirements before making payments.</article>
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
        </> : page === 'Expenses' ? <>
          <div className="heading"><div><p className="eyebrow">CASH OUTFLOWS</p><h1>Expenses Management</h1><p>Record shop expenses, supplier payments and staff payments.</p></div><button onClick={() => void loadExpenses()}>Refresh</button></div>
          <div className="expense-summary">
            <article><small>Expenses this month</small><h2>{money(expenses.filter(e => String(e.expense_date).slice(0,7) === expenseMonth).reduce((sum,e)=>sum+Number(e.amount),0))}</h2></article>
            <article><small>All recorded expenses</small><h2>{money(expenses.reduce((sum,e)=>sum+Number(e.amount),0))}</h2></article>
            <article><small>Transactions</small><h2>{expenses.length}</h2></article>
          </div>
          <article className="expense-entry"><h3>Record an expense</h3><form onSubmit={saveExpense} className="expense-form">
            <label>Category<select value={expenseForm.category} onChange={e=>setExpenseForm({...expenseForm,category:e.target.value,supplier_id:''})}>{['General','Employee Salary','Wages','Rent','Electricity','Water','Internet & Phone','Transport','Packaging','Maintenance','Marketing','Bank Charges','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
            <label>Description<input required value={expenseForm.description} onChange={e=>setExpenseForm({...expenseForm,description:e.target.value})} placeholder="What was this payment for?" /></label>
            <label>Amount (LKR)<input required type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={e=>setExpenseForm({...expenseForm,amount:e.target.value})} /></label>
            <label>Payment method<select value={expenseForm.payment_method} onChange={e=>setExpenseForm({...expenseForm,payment_method:e.target.value})}><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select></label>
            <label>Paid to<input value={expenseForm.paid_to} onChange={e=>setExpenseForm({...expenseForm,paid_to:e.target.value})} placeholder="Person / company name" /></label>
            {expenseForm.category === 'Supplier Payment' && <label>Supplier<select required value={expenseForm.supplier_id} onChange={e=>setExpenseForm({...expenseForm,supplier_id:e.target.value})}><option value="">Select supplier…</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
            <label>Expense date<input required type="date" value={expenseForm.expense_date} onChange={e=>setExpenseForm({...expenseForm,expense_date:e.target.value})} /></label>
            <label>Reference / Receipt No.<input value={expenseForm.reference_no} onChange={e=>setExpenseForm({...expenseForm,reference_no:e.target.value})} /></label>
            <button className="primary" disabled={busy}>{busy?'Saving…':'Save Expense'}</button>
          </form></article>
          <article><div className="toolbar"><h3>Expense history ({expenses.length})</h3><input placeholder="Search description, paid to or expense no…" value={expenseQuery} onChange={e=>setExpenseQuery(e.target.value)} /></div>
            <div className="expense-filters"><label>Month<input type="month" value={expenseMonth} onChange={e=>setExpenseMonth(e.target.value)} /></label><label>Category<select value={expenseCategoryFilter} onChange={e=>setExpenseCategoryFilter(e.target.value)}><option>All</option>{Array.from(new Set(expenses.map(e=>e.category))).sort().map(x=><option key={x}>{x}</option>)}</select></label></div>
            <div className="tablewrap"><table><thead><tr><th>DATE</th><th>EXPENSE NO.</th><th>CATEGORY</th><th>DESCRIPTION</th><th>PAID TO</th><th>METHOD</th><th>AMOUNT</th></tr></thead><tbody>
              {expenses.filter(e=>String(e.expense_date).slice(0,7)===expenseMonth && (expenseCategoryFilter==='All'||e.category===expenseCategoryFilter) && `${e.expense_no} ${e.description} ${e.paid_to||''} ${e.category}`.toLowerCase().includes(expenseQuery.toLowerCase())).map(e=>{const supplier=Array.isArray(e.suppliers)?e.suppliers[0]:e.suppliers;return <tr key={e.id}><td>{e.expense_date}</td><td><b>{e.expense_no}</b></td><td>{e.category}</td><td>{e.description}{e.reference_no&&<small>Ref: {e.reference_no}</small>}</td><td>{supplier?.name || e.paid_to || '—'}</td><td>{e.payment_method}</td><td><b>{money(Number(e.amount))}</b></td></tr>})}
              {expenses.filter(e=>String(e.expense_date).slice(0,7)===expenseMonth && (expenseCategoryFilter==='All'||e.category===expenseCategoryFilter) && `${e.expense_no} ${e.description} ${e.paid_to||''} ${e.category}`.toLowerCase().includes(expenseQuery.toLowerCase())).length===0&&<tr><td colSpan={7}>No expenses match these filters for this month.</td></tr>}
            </tbody></table></div>
          </article>
          <p className="muted">Supplier and employee payments entered here are expense records only. They do not yet reconcile supplier outstanding balances or payroll records.</p>
        </> : page === 'Purchases' ? <>
          <div className="heading"><div><p className="eyebrow">INBOUND INVENTORY</p><h1>Purchases & Receiving</h1><p>Record supplier deliveries and add received quantities to stock.</p></div><button onClick={() => {void loadPurchases();void loadPOSVariants()}}>Refresh</button></div>
          <article className="purchase-form"><h3>Receive a supplier purchase</h3><form onSubmit={receivePurchase}>
            <div className="purchase-meta"><label>Supplier<select required value={purchaseSupplier} onChange={e=>setPurchaseSupplier(e.target.value)}><option value="">Select supplier…</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Supplier reference<input value={purchaseReference} onChange={e=>setPurchaseReference(e.target.value)} placeholder="Supplier invoice / GRN no. (optional)" /></label><label>Purchase date<input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)} required /></label></div>
            <div className="tablewrap"><table><thead><tr><th>PRODUCT</th><th>SIZE / COLOUR</th><th>AVAILABLE</th><th>RECEIVE QTY</th><th>UNIT COST (LKR)</th></tr></thead><tbody>
              {posVariants.map(v=><tr key={v.id}><td><b>{v.product_name}</b><small>{v.product_no} · {v.sku}</small></td><td>{v.size} / {v.colour}</td><td>{v.quantity}</td><td><input className="purchase-number" type="number" min="0" step="1" value={purchaseLines[v.id]?.quantity || ''} onChange={e=>setPurchaseLines(current=>({...current,[v.id]:{quantity:e.target.value,unit_cost:current[v.id]?.unit_cost ?? String(products.find(p=>p.id===v.product_id)?.cost_price ?? 0)}}))} /></td><td><input className="purchase-number" type="number" min="0" step="0.01" value={purchaseLines[v.id]?.unit_cost ?? ''} onChange={e=>setPurchaseLines(current=>({...current,[v.id]:{quantity:current[v.id]?.quantity || '',unit_cost:e.target.value}}))} /></td></tr>)}
              {posVariants.length===0 && <tr><td colSpan={5}>Create products and size/colour variants before receiving stock.</td></tr>}
            </tbody></table></div><button className="primary" disabled={busy || posVariants.length===0}>{busy?'Saving…':'Confirm Purchase & Add Stock'}</button>
          </form></article>
          <article><div className="toolbar"><h3>Purchase history ({purchaseHistory.length})</h3></div><div className="tablewrap"><table><thead><tr><th>DATE</th><th>PURCHASE NO.</th><th>SUPPLIER</th><th>SUPPLIER REF.</th><th>ITEM TYPES</th><th>TOTAL COST</th><th>PAID</th><th>OUTSTANDING</th><th>STATUS</th></tr></thead><tbody>
            {purchaseHistory.map(p=>{const supplier=Array.isArray(p.suppliers)?p.suppliers[0]:p.suppliers;return <tr key={p.id}><td>{new Date(p.created_at).toLocaleDateString()}</td><td><b>{p.purchase_no}</b></td><td>{supplier?.name || '—'}</td><td>{p.supplier_reference || '—'}</td><td>{p.purchase_items?.length || 0}</td><td>{money(Number(p.total))}</td><td>{money(purchasePaidAmount(p))}</td><td>{money(purchaseOutstanding(p))}</td><td><span className={purchaseOutstanding(p)===0?'stock-ok':'stock-low'}>{purchaseOutstanding(p)===0?'Paid':purchasePaidAmount(p)>0?'Part-paid':'Unpaid'}</span></td></tr>})}
            {purchaseHistory.length===0&&<tr><td colSpan={9}>No purchases recorded yet.</td></tr>}
          </tbody></table></div></article>
        </> : page === 'Supplier Accounts' ? <>
          <div className="heading"><div><p className="eyebrow">ACCOUNTS PAYABLE</p><h1>Supplier Accounts</h1><p>Track supplier invoices, part-payments and outstanding balances.</p></div><button onClick={()=>{void loadPurchases();void loadSupplierPayments();void loadSuppliers()}}>Refresh accounts</button></div>
          <div className="expense-summary supplier-summary">
            <article><small>Total purchases</small><h2>{money(purchaseHistory.reduce((n,p)=>n+Number(p.total||0),0))}</h2></article>
            <article><small>Total paid to suppliers</small><h2>{money(supplierPayments.reduce((n,p)=>n+Number(p.amount||0),0))}</h2></article>
            <article><small>Outstanding payable</small><h2>{money(purchaseHistory.reduce((n,p)=>n+purchaseOutstanding(p),0))}</h2></article>
          </div>
          <article><div className="toolbar"><div><h3>Supplier balances</h3><p className="muted">Totals are based on received purchase invoices and recorded supplier payments.</p></div><input placeholder="Search supplier…" value={supplierAccountQuery} onChange={e=>setSupplierAccountQuery(e.target.value)}/></div>
            <div className="tablewrap"><table><thead><tr><th>SUPPLIER</th><th>INVOICES</th><th>TOTAL PURCHASED</th><th>TOTAL PAID</th><th>OUTSTANDING</th></tr></thead><tbody>
              {suppliers.filter(s=>s.name.toLowerCase().includes(supplierAccountQuery.toLowerCase())).map(s=>{const purchases=purchaseHistory.filter(p=>p.supplier_id===s.id);const total=purchases.reduce((n,p)=>n+Number(p.total||0),0);const paid=supplierPayments.filter(p=>p.supplier_id===s.id).reduce((n,p)=>n+Number(p.amount||0),0);return <tr key={s.id}><td><b>{s.name}</b><small>{s.phone||''}</small></td><td>{purchases.length}</td><td>{money(total)}</td><td>{money(paid)}</td><td><b>{money(Math.max(0,total-paid))}</b></td></tr>})}
              {suppliers.length===0&&<tr><td colSpan={5}>No suppliers registered.</td></tr>}
            </tbody></table></div>
          </article>
          <article className="supplier-payment-entry"><h3>Record supplier payment</h3><p className="muted">Payments are allocated to a specific purchase invoice. The system blocks overpayments and automatically records the transaction in Expenses.</p>
            <form className="supplier-payment-form" onSubmit={recordSupplierPayment}>
              <label>Purchase invoice<select required value={supplierPaymentForm.purchase_id} onChange={e=>setSupplierPaymentForm({...supplierPaymentForm,purchase_id:e.target.value,amount:''})}><option value="">Select unpaid invoice…</option>{purchaseHistory.filter(p=>purchaseOutstanding(p)>0).map(p=>{const supplier=Array.isArray(p.suppliers)?p.suppliers[0]:p.suppliers;return <option key={p.id} value={p.id}>{p.purchase_no} · {supplier?.name||'Supplier'} · Due {money(purchaseOutstanding(p))}</option>})}</select></label>
              <label>Payment amount (LKR)<input required type="number" min="0.01" step="0.01" max={purchaseHistory.find(p=>p.id===supplierPaymentForm.purchase_id)?purchaseOutstanding(purchaseHistory.find(p=>p.id===supplierPaymentForm.purchase_id)):undefined} value={supplierPaymentForm.amount} onChange={e=>setSupplierPaymentForm({...supplierPaymentForm,amount:e.target.value})}/></label>
              <label>Payment method<select value={supplierPaymentForm.payment_method} onChange={e=>setSupplierPaymentForm({...supplierPaymentForm,payment_method:e.target.value})}><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select></label>
              <label>Payment date<input required type="date" value={supplierPaymentForm.payment_date} onChange={e=>setSupplierPaymentForm({...supplierPaymentForm,payment_date:e.target.value})}/></label>
              <label>Reference / Cheque No.<input value={supplierPaymentForm.reference_no} onChange={e=>setSupplierPaymentForm({...supplierPaymentForm,reference_no:e.target.value})}/></label>
              <label>Notes<input value={supplierPaymentForm.notes} onChange={e=>setSupplierPaymentForm({...supplierPaymentForm,notes:e.target.value})}/></label>
              <button className="primary" disabled={busy||!supplierPaymentForm.purchase_id}>{busy?'Saving…':'Record payment'}</button>
            </form>
          </article>
          <article><div className="toolbar"><h3>Supplier payment history ({supplierPayments.length})</h3></div><div className="tablewrap"><table><thead><tr><th>DATE</th><th>PAYMENT NO.</th><th>SUPPLIER</th><th>PURCHASE NO.</th><th>METHOD</th><th>REFERENCE</th><th>AMOUNT</th></tr></thead><tbody>
            {supplierPayments.map(p=>{const supplier=Array.isArray(p.suppliers)?p.suppliers[0]:p.suppliers;const purchase=Array.isArray(p.purchase_orders)?p.purchase_orders[0]:p.purchase_orders;return <tr key={p.id}><td>{p.payment_date}</td><td><b>{p.payment_no}</b></td><td>{supplier?.name||'—'}</td><td>{purchase?.purchase_no||'—'}</td><td>{p.payment_method}</td><td>{p.reference_no||'—'}</td><td><b>{money(Number(p.amount))}</b></td></tr>})}
            {supplierPayments.length===0&&<tr><td colSpan={7}>No supplier payments recorded yet.</td></tr>}
          </tbody></table></div></article>
        </> : page === 'Customer Accounts' ? <>
          <div className="heading"><div><p className="eyebrow">ACCOUNTS RECEIVABLE</p><h1>Customer Credit Accounts</h1><p>Track credit invoices, partial collections and outstanding customer balances.</p></div><button onClick={()=>{void loadSales();void loadCustomerPayments();void loadCustomers()}}>Refresh accounts</button></div>
          <div className="expense-summary customer-credit-summary">
            <article><small>Total credit sales</small><h2>{money(sales.filter(s=>s.payment_method==='Credit').reduce((n,s)=>n+Number(s.total||0),0))}</h2></article>
            <article><small>Total collected</small><h2>{money(customerPayments.reduce((n,p)=>n+Number(p.amount||0),0))}</h2></article>
            <article><small>Outstanding receivables</small><h2>{money(sales.filter(s=>s.payment_method==='Credit').reduce((n,s)=>n+saleOutstanding(s),0))}</h2></article>
          </div>
          <article><div className="toolbar"><div><h3>Customer balances</h3><p className="muted">Credit invoices only. Payments are allocated to individual invoices.</p></div><input placeholder="Search customer name or phone…" value={customerAccountQuery} onChange={e=>setCustomerAccountQuery(e.target.value)}/></div>
            <div className="tablewrap"><table><thead><tr><th>CUSTOMER</th><th>CREDIT INVOICES</th><th>TOTAL CREDIT</th><th>COLLECTED</th><th>OUTSTANDING</th></tr></thead><tbody>
              {customers.filter(c=>`${c.full_name} ${c.phone||''}`.toLowerCase().includes(customerAccountQuery.toLowerCase())).map(c=>{const invoices=sales.filter(s=>s.payment_method==='Credit'&&s.customer_id===c.id);const total=invoices.reduce((n,s)=>n+Number(s.total||0),0);const paid=customerPayments.filter(p=>p.customer_id===c.id).reduce((n,p)=>n+Number(p.amount||0),0);return <tr key={c.id}><td><b>{c.full_name}</b><small>{c.phone||''}</small></td><td>{invoices.length}</td><td>{money(total)}</td><td>{money(paid)}</td><td><b>{money(Math.max(0,total-paid))}</b></td></tr>})}
              {customers.length===0&&<tr><td colSpan={5}>No customers registered.</td></tr>}
            </tbody></table></div>
          </article>
          <article className="customer-credit-payment"><h3>Receive customer payment</h3><p className="muted">Allocate each collection to a specific credit invoice. Overpayments are rejected.</p>
            <form className="customer-credit-form" onSubmit={recordCustomerPayment}>
              <label>Credit invoice<select required value={customerPaymentForm.sale_id} onChange={e=>setCustomerPaymentForm({...customerPaymentForm,sale_id:e.target.value,amount:''})}><option value="">Select unpaid invoice…</option>{sales.filter(s=>s.payment_method==='Credit'&&saleOutstanding(s)>0).map(s=>{const customer=Array.isArray(s.customers)?s.customers[0]:s.customers;return <option key={s.id} value={s.id}>{s.invoice_no} · {customer?.full_name||'Customer'} · Due {money(saleOutstanding(s))}</option>})}</select></label>
              <label>Payment amount (LKR)<input required type="number" min="0.01" step="0.01" max={sales.find(s=>s.id===customerPaymentForm.sale_id)?saleOutstanding(sales.find(s=>s.id===customerPaymentForm.sale_id)):undefined} value={customerPaymentForm.amount} onChange={e=>setCustomerPaymentForm({...customerPaymentForm,amount:e.target.value})}/></label>
              <label>Payment method<select value={customerPaymentForm.payment_method} onChange={e=>setCustomerPaymentForm({...customerPaymentForm,payment_method:e.target.value})}><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select></label>
              <label>Payment date<input required type="date" value={customerPaymentForm.payment_date} onChange={e=>setCustomerPaymentForm({...customerPaymentForm,payment_date:e.target.value})}/></label>
              <label>Reference / Cheque No.<input value={customerPaymentForm.reference_no} onChange={e=>setCustomerPaymentForm({...customerPaymentForm,reference_no:e.target.value})}/></label>
              <label>Notes<input value={customerPaymentForm.notes} onChange={e=>setCustomerPaymentForm({...customerPaymentForm,notes:e.target.value})}/></label>
              <button className="primary" disabled={busy||!customerPaymentForm.sale_id}>{busy?'Saving…':'Receive payment'}</button>
            </form>
          </article>
          <article><div className="toolbar"><h3>Open credit invoices</h3></div><div className="tablewrap"><table><thead><tr><th>DATE</th><th>INVOICE</th><th>CUSTOMER</th><th>TOTAL</th><th>PAID</th><th>OUTSTANDING</th><th>STATUS</th></tr></thead><tbody>
            {sales.filter(s=>s.payment_method==='Credit').map(s=>{const customer=Array.isArray(s.customers)?s.customers[0]:s.customers;const balance=saleOutstanding(s);return <tr key={s.id}><td>{new Date(s.created_at).toLocaleDateString()}</td><td><b>{s.invoice_no}</b></td><td>{customer?.full_name||'—'}</td><td>{money(Number(s.total))}</td><td>{money(salePaidAmount(s))}</td><td>{money(balance)}</td><td><span className={balance===0?'stock-ok':'stock-low'}>{balance===0?'Paid':salePaidAmount(s)>0?'Part-paid':'Unpaid'}</span></td></tr>})}
            {sales.filter(s=>s.payment_method==='Credit').length===0&&<tr><td colSpan={7}>No credit invoices recorded.</td></tr>}
          </tbody></table></div></article>
          <article><div className="toolbar"><h3>Customer payment history ({customerPayments.length})</h3></div><div className="tablewrap"><table><thead><tr><th>DATE</th><th>PAYMENT NO.</th><th>CUSTOMER</th><th>INVOICE</th><th>METHOD</th><th>REFERENCE</th><th>AMOUNT</th></tr></thead><tbody>
            {customerPayments.map(p=>{const customer=Array.isArray(p.customers)?p.customers[0]:p.customers;const sale=Array.isArray(p.sales)?p.sales[0]:p.sales;return <tr key={p.id}><td>{p.payment_date}</td><td><b>{p.payment_no}</b></td><td>{customer?.full_name||'—'}</td><td>{sale?.invoice_no||'—'}</td><td>{p.payment_method}</td><td>{p.reference_no||'—'}</td><td><b>{money(Number(p.amount))}</b></td></tr>})}
            {customerPayments.length===0&&<tr><td colSpan={7}>No customer payments recorded yet.</td></tr>}
          </tbody></table></div></article>
        </> : page === 'Suppliers' ? <>
          <div className="heading"><div><p className="eyebrow">VENDOR DIRECTORY</p><h1>Suppliers</h1><p>Maintain supplier contact details for purchase receiving.</p></div></div>
          <div className="customer-layout"><article><h3>Add supplier</h3><form onSubmit={saveSupplier} className="customer-form">
            <label>Supplier name<input required value={supplierForm.name} onChange={e=>setSupplierForm({...supplierForm,name:e.target.value})}/></label>
            <label>Phone number<input value={supplierForm.phone} onChange={e=>setSupplierForm({...supplierForm,phone:e.target.value})}/></label>
            <label>Email address<input type="email" value={supplierForm.email} onChange={e=>setSupplierForm({...supplierForm,email:e.target.value})}/></label>
            <button className="primary" disabled={busy}>{busy?'Saving…':'Save supplier'}</button>
          </form></article><article><div className="toolbar"><h3>Supplier list ({suppliers.length})</h3><input placeholder="Search supplier / phone / email…" value={supplierQuery} onChange={e=>setSupplierQuery(e.target.value)}/><button onClick={()=>void loadSuppliers()}>Refresh</button></div>
            <div className="tablewrap"><table><thead><tr><th>SUPPLIER</th><th>PHONE</th><th>EMAIL</th><th>PURCHASES</th><th>TOTAL PURCHASED</th><th>TOTAL PAID</th><th>OUTSTANDING</th></tr></thead><tbody>
              {suppliers.filter(s=>`${s.name} ${s.phone||''} ${s.email||''}`.toLowerCase().includes(supplierQuery.toLowerCase())).map(s=>{const ps=purchaseHistory.filter(p=>{const linked=Array.isArray(p.suppliers)?p.suppliers[0]:p.suppliers;return linked?.id===s.id});return <tr key={s.id}><td><b>{s.name}</b></td><td>{s.phone||'—'}</td><td>{s.email||'—'}</td><td>{ps.length}</td><td>{money(ps.reduce((sum,p)=>sum+Number(p.total),0))}</td><td>{money(supplierPayments.filter(p=>p.supplier_id===s.id).reduce((sum,p)=>sum+Number(p.amount||0),0))}</td><td>{money(Math.max(0,ps.reduce((sum,p)=>sum+Number(p.total),0)-supplierPayments.filter(p=>p.supplier_id===s.id).reduce((sum,p)=>sum+Number(p.amount||0),0)))}</td></tr>})}
              {suppliers.length===0&&<tr><td colSpan={7}>No suppliers added yet.</td></tr>}
            </tbody></table></div></article></div>
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
          <article><div className="toolbar"><h3>Product catalogue ({products.length})</h3><input aria-label="Search products" placeholder="Search product no, name or SKU…" value={query} onChange={e => setQuery(e.target.value)} /><label className="inline-check"><input type="checkbox" checked={lowStockOnly} onChange={e=>setLowStockOnly(e.target.checked)} /> Low stock only</label><button onClick={exportInventoryCSV}>Export inventory CSV</button><button onClick={() => void loadProducts()}>Refresh</button></div>
            <div className="tablewrap"><table><thead><tr><th>PRODUCT NO.</th><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>SELLING PRICE</th><th>COST PRICE</th><th>VARIANTS</th><th>ACTION</th></tr></thead>
              <tbody>{filtered.filter(p => !lowStockOnly || variants.some(v => v.product_id === p.id && v.quantity <= v.reorder_level)).map(p => <tr key={p.id}><td><b>{p.product_no}</b></td><td>{p.name}</td><td>{p.sku}</td><td>{p.category}</td><td>{money(p.selling_price)}</td><td>{money(p.cost_price)}</td><td>{variants.filter(v => v.product_id === p.id).length}</td><td><button className="small-action" onClick={() => setActiveProduct(p)}>Manage stock</button></td></tr>)}
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
              <form onSubmit={completeSale} className="checkout-form"><label>Customer<select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}><option value="">Walk-in customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ''}</option>)}</select></label><label>Payment method<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Credit</option></select></label>{paymentMethod==='Credit' && <label>Initial payment method<select value={creditPaymentMethod} onChange={e=>setCreditPaymentMethod(e.target.value)}><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select></label>}<label>Amount received (LKR)<input required type="number" min={paymentMethod==='Credit'?0:cartTotal} max={paymentMethod==='Credit'?Math.max(0,cartTotal-0.01):undefined} step="0.01" value={amountReceived} onChange={e => setAmountReceived(e.target.value)} placeholder={paymentMethod==='Credit'?'0':String(cartTotal)} /></label>{paymentMethod==='Credit' ? <p className="change-due">Outstanding: <b>{money(Math.max(0,cartTotal-(Number(amountReceived)||0)))}</b></p> : <p className="change-due">Change: <b>{money(Math.max(0,(Number(amountReceived)||0)-cartTotal))}</b></p>}<button className="primary full" disabled={busy || cart.length===0}>{busy ? 'Processing…' : 'Complete Sale'}</button></form>
            </article>
          </div>
          {lastInvoice && <div className="invoice-preview"><div className="heading"><div><p className="eyebrow">SALE COMPLETED</p><h2>Invoice {lastInvoice.invoice_no}</h2></div><button className="primary" onClick={() => window.print()}>Print invoice</button></div><p>{new Date(lastInvoice.created_at).toLocaleString()}</p><div className="tablewrap"><table><thead><tr><th>ITEM</th><th>SIZE / COLOUR</th><th>QTY</th><th>PRICE</th><th>AMOUNT</th></tr></thead><tbody>{lastInvoice.items.map((line,i)=><tr key={i}><td>{line.name}<small>{line.product_no}</small></td><td>{line.size} / {line.colour}</td><td>{line.quantity}</td><td>{money(line.unit_price)}</td><td>{money(line.unit_price*line.quantity)}</td></tr>)}</tbody></table></div><p>Subtotal: {money(lastInvoice.subtotal)} · Discount: {money(lastInvoice.discount)} · <b>Total: {money(lastInvoice.total)}</b></p><p>{lastInvoice.payment_method==='Credit' ? <>Credit sale · Initial payment {money(lastInvoice.amount_received)} · <b>Outstanding {money(lastInvoice.total-lastInvoice.amount_received)}</b></> : <>Paid by {lastInvoice.payment_method} · Received {money(lastInvoice.amount_received)} · Change {money(lastInvoice.change_amount)}</>}</p></div>}
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
        </> : page === 'Loyalty' ? <>
          <div className="heading"><div><p className="eyebrow">CUSTOMER RETENTION</p><h1>Customer Loyalty</h1><p>Earn 1 point for every LKR 100 of a linked customer sale. Points are tracked in a ledger.</p></div><button onClick={()=>void loadLoyalty()}>Refresh</button></div>
          <div className="stats"><article><small>Points issued</small><h2>{loyaltyRows.filter(x=>x.points>0).reduce((n,x)=>n+Number(x.points),0)}</h2></article><article><small>Points redeemed / adjusted</small><h2>{Math.abs(loyaltyRows.filter(x=>x.points<0).reduce((n,x)=>n+Number(x.points),0))}</h2></article><article><small>Customers with points</small><h2>{new Set(loyaltyRows.map(x=>x.customer_id)).size}</h2></article></div>
          <article><div className="toolbar"><h3>Points ledger</h3></div><div className="tablewrap"><table><thead><tr><th>DATE</th><th>CUSTOMER</th><th>TYPE</th><th>POINTS</th><th>DESCRIPTION</th></tr></thead><tbody>{loyaltyRows.map(x=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString()}</td><td>{x.customers?.full_name||'—'}</td><td>{x.entry_type}</td><td>{x.points>0?'+':''}{x.points}</td><td>{x.description||'—'}</td></tr>)}{!loyaltyRows.length&&<tr><td colSpan={5}>No loyalty points yet. Link a customer to a sale to earn points automatically.</td></tr>}</tbody></table></div></article>
        </> : page === 'Cash Management' ? <>
          <div className="heading"><div><p className="eyebrow">CASH CONTROL</p><h1>Cash Drawer Management</h1><p>Open a cashier session, record cash movements and reconcile the drawer at closing.</p></div><button onClick={()=>void loadCashSessions()}>Refresh</button></div>
          {!cashSession ? <article><h3>Open cash drawer</h3><form className="inline-form" onSubmit={openCashSession}><label>Opening float (LKR)<input type="number" min="0" step="0.01" required value={cashFloat} onChange={e=>setCashFloat(e.target.value)}/></label><button className="primary" disabled={busy}>Open cash session</button></form></article> : <>
            <div className="stats"><article><small>Opening float</small><h2>{money(Number(cashSession.opening_float))}</h2></article><article><small>Opened</small><h2>{new Date(cashSession.opened_at).toLocaleTimeString()}</h2></article><article><small>Status</small><h2>Open</h2></article></div>
            <article><h3>Cash in / out</h3><form className="inline-form" onSubmit={addCashMovement}><label>Movement<select value={cashMovement.type} onChange={e=>setCashMovement({...cashMovement,type:e.target.value})}><option>Cash In</option><option>Cash Out</option></select></label><label>Amount (LKR)<input type="number" min="0.01" step="0.01" required value={cashMovement.amount} onChange={e=>setCashMovement({...cashMovement,amount:e.target.value})}/></label><label>Reason<input required value={cashMovement.reason} onChange={e=>setCashMovement({...cashMovement,reason:e.target.value})}/></label><button disabled={busy}>Record movement</button></form></article>
            <article><h3>Close cash drawer</h3><form className="inline-form" onSubmit={closeCashSession}><label>Counted cash (LKR)<input type="number" min="0" step="0.01" required value={cashCounted} onChange={e=>setCashCounted(e.target.value)}/></label><button className="primary" disabled={busy}>Close & reconcile</button></form></article>
          </>}
          <article><h3>Recent cash sessions</h3><div className="tablewrap"><table><thead><tr><th>OPENED</th><th>CASHIER</th><th>STATUS</th><th>EXPECTED</th><th>COUNTED</th><th>VARIANCE</th></tr></thead><tbody>{cashHistory.map(x=><tr key={x.id}><td>{new Date(x.opened_at).toLocaleString()}</td><td>{x.cashier_id===session?.user.id?'You':x.cashier_id}</td><td>{x.status}</td><td>{x.expected_cash==null?'—':money(Number(x.expected_cash))}</td><td>{x.counted_cash==null?'—':money(Number(x.counted_cash))}</td><td>{x.cash_difference==null?'—':money(Number(x.cash_difference))}</td></tr>)}</tbody></table></div></article>
        </> : page === 'Purchase Orders' ? <>
          <div className="heading"><div><p className="eyebrow">PROCUREMENT CONTROL</p><h1>Purchase Requests & Approvals</h1><p>Create a request for supplier stock, submit it and approve it before using the existing receiving workflow.</p></div><button onClick={()=>void loadPurchaseRequests()}>Refresh</button></div>
          <article><h3>Create purchase request</h3><form onSubmit={createPurchaseRequest} className="customer-form"><label>Supplier<select required value={purchaseRequestForm.supplier_id} onChange={e=>setPurchaseRequestForm({...purchaseRequestForm,supplier_id:e.target.value})}><option value="">Select supplier</option>{suppliers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Product / variant<select required value={purchaseRequestForm.variant_id} onChange={e=>setPurchaseRequestForm({...purchaseRequestForm,variant_id:e.target.value})}><option value="">Select variant</option>{posVariants.map(x=><option key={x.id} value={x.id}>{x.product_no} · {x.product_name} · {x.size}/{x.colour}</option>)}</select></label><label>Quantity<input type="number" min="1" required value={purchaseRequestForm.quantity} onChange={e=>setPurchaseRequestForm({...purchaseRequestForm,quantity:e.target.value})}/></label><label>Estimated unit cost (LKR)<input type="number" min="0" step="0.01" required value={purchaseRequestForm.unit_cost} onChange={e=>setPurchaseRequestForm({...purchaseRequestForm,unit_cost:e.target.value})}/></label><label>Notes<input value={purchaseRequestForm.notes} onChange={e=>setPurchaseRequestForm({...purchaseRequestForm,notes:e.target.value})}/></label><button className="primary" disabled={busy}>Submit purchase request</button></form></article>
          <article><h3>Purchase requests</h3><div className="tablewrap"><table><thead><tr><th>REQUEST</th><th>SUPPLIER</th><th>ITEMS</th><th>STATUS</th><th>CREATED</th><th>ACTION</th></tr></thead><tbody>{purchaseRequests.map(x=><tr key={x.id}><td><b>{x.request_no}</b></td><td>{x.suppliers?.name||'—'}</td><td>{(x.purchase_request_items||[]).map((i:any)=>`${i.quantity} × ${i.product_variants?.products?.name||'Product'} ${i.product_variants?.size||''}/${i.product_variants?.colour||''}`).join(', ')}</td><td>{x.status}</td><td>{new Date(x.created_at).toLocaleDateString()}</td><td>{x.status==='Submitted'?<button className="small-action" disabled={busy} onClick={()=>void approvePurchaseRequest(x.id)}>Approve</button>:x.status==='Approved'?'Ready to receive':'—'}</td></tr>)}{!purchaseRequests.length&&<tr><td colSpan={6}>No purchase requests recorded.</td></tr>}</tbody></table></div></article>
        </> : page === 'Accounting' ? <AccountingWorkspace session={session} role={currentEmployeeRole} /> : page === 'Settings' ? <>
          <div className="heading"><div><p className="eyebrow">SYSTEM ADMINISTRATION</p><h1>Settings & Data Backup</h1><p>Export operational data for secure offline retention.</p></div></div>
          <article><h3>Database data export</h3><p className="muted">Downloads up to 10,000 rows per operational table in a JSON file. This is a data export, not a full Supabase point-in-time backup; it does not include authentication credentials, database schema, storage files or project settings.</p><button className="primary" disabled={busy || !['Admin'].includes(currentEmployeeRole||'')} onClick={()=>void exportDataBackup()}>{busy?'Preparing export…':'Download data backup (JSON)'}</button>{currentEmployeeRole!=='Admin'&&<p className="muted">Only Admin users can export the database data.</p>}</article>
          <article><h3>Inventory tools</h3><p className="muted">Download product, size, colour, barcode and stock information for spreadsheet review.</p><button onClick={exportInventoryCSV}>Export inventory CSV</button></article>
          <article><h3>Security reminder</h3><p className="muted">Keep downloaded backups in an access-controlled location. They may contain customer contact details, employee records and sales information.</p></article>
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
      <div className="panel-heading"><div><p className="eyebrow">INVENTORY MANAGEMENT</p><h2>{activeProduct.name}</h2><p className="muted">{activeProduct.product_no} · SKU {activeProduct.sku}</p></div><div className="header-actions"><button onClick={() => printBarcodeLabels(activeProduct, variants.filter(v => v.product_id === activeProduct.id))} disabled={!variants.some(v => v.product_id === activeProduct.id)}>Print labels</button><button className="text-button" onClick={() => setActiveProduct(null)}>✕</button></div></div>
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
