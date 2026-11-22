import { useEffect, useState } from 'react'
import { supabase, supabaseConfigured, money, type Product } from './lib'

const demo: Product[] = [
 {id:'1',sku:'TSH-001',name:'Classic Cotton T-Shirt',category:'T-Shirts',selling_price:2500,cost_price:1450,active:true},
 {id:'2',sku:'JNS-014',name:'Slim Fit Denim Jeans',category:'Jeans',selling_price:6500,cost_price:3900,active:true},
 {id:'3',sku:'DRS-008',name:'Floral Summer Dress',category:'Dresses',selling_price:5800,cost_price:3200,active:true}
]
export default function App(){
 const [products,setProducts]=useState<Product[]>(demo)
 const [page,setPage]=useState('Overview')
 const [query,setQuery]=useState('')
 const [show,setShow]=useState(false)
 const [notice,setNotice]=useState('')
 const [form,setForm]=useState({sku:'',name:'',category:'General',selling_price:'',cost_price:''})
 async function load(){
  if(!supabase)return
  const {data,error}=await supabase.from('products').select('id,sku,name,category,selling_price,cost_price,active').order('created_at',{ascending:false})
  if(error)setNotice(error.message); else if(data)setProducts(data as Product[])
 }
 useEffect(()=>{void load()},[])
 async function save(e:React.FormEvent){
  e.preventDefault()
  const row={sku:form.sku.trim(),name:form.name.trim(),category:form.category,selling_price:Number(form.selling_price),cost_price:Number(form.cost_price),active:true}
  if(!row.sku||!row.name||row.selling_price<=0){setNotice('Enter SKU, product name and a valid selling price.');return}
  if(supabase){const {error}=await supabase.from('products').insert(row);if(error){setNotice(error.message);return}await load()}
  else {setProducts(p=>[{...row,id:crypto.randomUUID()},...p]);setNotice('Demo mode: product is saved only in this browser session.')}
  setShow(false);setForm({sku:'',name:'',category:'General',selling_price:'',cost_price:''})
 }
 const filtered=products.filter(p=>(p.name+' '+p.sku+' '+(p.category||'')).toLowerCase().includes(query.toLowerCase()))
 return <div className="shell"><aside><h2>◈ Clothing ERP</h2><small>RETAIL MANAGEMENT</small>{['Overview','Point of Sale','Products & Stock','Purchases','Customers','Suppliers','Reports','Employees','Online Orders','Settings'].map(x=><button className={page===x?'active':''} onClick={()=>setPage(x)}>{x}</button>)}</aside><main><header><b>Workspace / {page}</b><span className={supabaseConfigured?'ok':'demo'}>{supabaseConfigured?'Supabase configured':'Demo mode'}</span></header><section>{notice&&<p className="notice">{notice}<button onClick={()=>setNotice('')}>×</button></p>}{page==='Overview'?<><p className="eyebrow">SHOP OVERVIEW</p><h1>Good morning, Admin 👋</h1><p>Here’s what’s happening with your shop today.</p><div className="stats">{[['Today’s Sales','Rs. 48,650'],['Gross Profit','Rs. 16,420'],['Products in Stock','1,284'],['Orders','36']].map(([a,b])=><article><small>{a}</small><h2>{b}</h2></article>)}</div><article><h3>Quick actions</h3><button onClick={()=>setPage('Products & Stock')}>Manage products</button><button onClick={()=>setPage('Point of Sale')}>Open POS</button><p className="muted">Dashboard figures are sample data and are not connected to live sales yet.</p></article></>:page==='Products & Stock'?<><div className="heading"><div><p className="eyebrow">CATALOGUE</p><h1>Products & Stock</h1><p>Manage your clothing products.</p></div><button className="primary" onClick={()=>setShow(true)}>+ Add Product</button></div><article><div className="toolbar"><h3>Product catalogue ({products.length})</h3><input placeholder="Search products..." value={query} onChange={e=>setQuery(e.target.value)}/><button onClick={()=>void load()}>Refresh</button></div><div className="tablewrap"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>SELLING PRICE</th><th>COST PRICE</th></tr></thead><tbody>{filtered.map(p=><tr><td>{p.name}</td><td>{p.sku}</td><td>{p.category}</td><td>{money(p.selling_price)}</td><td>{money(p.cost_price)}</td></tr>)}</tbody></table></div></article></>:<article className="empty"><h2>{page}</h2><p>This module is planned for a later development phase and is not functional yet.</p></article>}</section></main>{show&&<div className="overlay"><form onSubmit={save}><h2>Add product</h2>{[['name','Product name'],['sku','SKU / Product code'],['category','Category'],['selling_price','Selling price (LKR)'],['cost_price','Cost price (LKR)']].map(([k,label])=><label>{label}<input required={k!=='cost_price'} type={k.includes('price')?'number':'text'} value={(form as any)[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<div className="actions"><button type="button" onClick={()=>setShow(false)}>Cancel</button><button className="primary">Save product</button></div></form></div>}</div>
}