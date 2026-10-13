const CFG = window.WVIS_CONFIG || {};
const state = { raw:{sales:[],stores:[],promoters:[],targets:[],inventory:[],models:[]}, filteredSales:[], charts:{}, live:false, uploads:{fixed:null,current:null} };

Chart.defaults.font.family='"Montserrat", Arial, sans-serif';
document.fonts?.ready.then(()=>Object.values(state.charts).forEach(chart=>chart.update('none')));

const $ = (id)=>document.getElementById(id);
const n = (v)=>Number(String(v ?? 0).replace(/,/g,'')) || 0;
const fmt = (v,d=0)=>Number(v||0).toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d});
const pct = (v)=>`${fmt(v,1)}%`;
const normalize = s => String(s ?? '').trim();

function sheetIdFromUrl(url){ const m=String(url||'').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); return m?m[1]:''; }
function csvUrl(sheetId, tab){ return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`; }

function parseCSV(text){
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], next=text[i+1];
    if(c==='"' && quoted && next==='"'){cell+='"';i++;continue;}
    if(c==='"'){quoted=!quoted;continue;}
    if(c===','&&!quoted){row.push(cell);cell='';continue;}
    if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&next==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell='';continue;}
    cell+=c;
  }
  row.push(cell); if(row.some(x=>x!==''))rows.push(row);
  if(!rows.length)return [];
  const headers=rows[0].map(h=>normalize(h));
  return rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,normalize(r[i])] )));
}

async function loadGoogleSheets(){
  const id=sheetIdFromUrl(CFG.googleSheetUrl);
  if(!id) throw new Error('No Google Sheet URL configured.');
  const entries=Object.entries(CFG.sheets||{});
  const loaded={sales:[],stores:[],promoters:[],targets:[],inventory:[],models:[]};
  await Promise.all(entries.map(async([key,tab])=>{
    const res=await fetch(csvUrl(id,tab),{cache:'no-store'});
    if(!res.ok) throw new Error(`Unable to read tab: ${tab}`);
    loaded[key]=parseCSV(await res.text());
  }));
  return loaded;
}

function demoData(){
  const stores=[
    ['S001','SM Bacolod','Prime Mobile','Bacolod','ASM Cruz','Mall'],['S002','Ayala Bacolod','Prime Mobile','Bacolod','ASM Cruz','Mall'],['S003','888 Chinatown','Mobile Hub','Bacolod','ASM Lim','Sidestreet'],['S004','SM Iloilo','Tech Zone','Iloilo','ASM Tan','Mall'],['S005','Robinsons Iloilo','Tech Zone','Iloilo','ASM Tan','Mall'],['S006','Cadiz Central','North Mobile','Negros North','ASM Go','Sidestreet'],['S007','Sagay Plaza','North Mobile','Negros North','ASM Go','Sidestreet'],['S008','Roxas City Center','Panay Digital','Capiz','ASM Uy','Sidestreet'],['S009','Kalibo Mall','Panay Digital','Aklan','ASM Uy','Mall'],['S010','San Carlos Mobile','North Mobile','Negros North','ASM Go','Sidestreet']
  ].map(x=>({'Store ID':x[0],'Store Name':x[1],'Customer':x[2],'Area':x[3],'ASM':x[4],'Channel':x[5]}));
  const models=['realme 16T 5G','Note 80 4+64','C75','C71','14T 5G'];
  const sales=[]; const today=new Date(); const y=today.getFullYear(),m=today.getMonth(); const day=Math.max(14,today.getDate());
  for(let d=1;d<=Math.min(day,28);d++) stores.forEach((s,si)=>models.forEach((model,mi)=>{
    const qty=(d*3+si*5+mi*2)%5===0?0:((d+si+mi)%4);
    if(qty>0) sales.push({'Date':`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,'Store ID':s['Store ID'],'PS ID':`PS${String(si+1).padStart(3,'0')}`,'Model':model,'Qty':String(qty)});
  }));
  const promoters=stores.map((s,i)=>({'PS ID':`PS${String(i+1).padStart(3,'0')}`,'PS Name':['Angela','Marco','Jessa','Kevin','Lara','Nico','Trish','Paolo','Mika','Andre'][i],'Store ID':s['Store ID'],'Status':'Active'}));
  const targets=models.flatMap((model,mi)=>stores.map((s,si)=>({'Month':`${y}-${String(m+1).padStart(2,'0')}`,'Store ID':s['Store ID'],'Model':model,'Target':String(32+((mi+si)%4)*8)})));
  const inventory=models.flatMap((model,mi)=>stores.map((s,si)=>({'Store ID':s['Store ID'],'Model':model,'Inventory':String((mi*7+si*3+11)%34)})));
  return {sales,stores,promoters,targets,inventory,models:models.map((x,i)=>({'Model':x,'Series':['Number','Note','C','C','Number'][i],'SRP':['15999','6999','7999','5999','13999'][i]}))};
}


function parseDate(v){
  if(v instanceof Date) return v;
  if(typeof v==='number' && window.XLSX){ const d=XLSX.SSF.parse_date_code(v); if(d) return new Date(d.y,d.m-1,d.d); }
  const s=normalize(v); if(!s) return new Date(NaN);
  let d=new Date(s); if(!isNaN(d)) return d;
  const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if(m){ const y=+m[3]<100?2000+(+m[3]):+m[3]; d=new Date(y,+m[1]-1,+m[2]); }
  return d;
}
function baseRaw(){return {sales:[],stores:[],promoters:[],targets:[],inventory:[],models:[]}}
function headersOf(rows){return rows&&rows.length?Object.keys(rows[0]).map(normalize).filter(Boolean):[]}
function sameHeaders(a,b){return a.length===b.length && a.every((x,i)=>x.toLowerCase()===b[i].toLowerCase())}
function dateRange(rows){
  const ds=(rows||[]).map(r=>parseDate(find(r,'Date','Sales Date','date','Sellout Date','Transaction Date'))).filter(d=>!isNaN(d)).sort((a,b)=>a-b);
  if(!ds.length)return 'Date column not detected';
  const f=d=>d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  return `${f(ds[0])} – ${f(ds[ds.length-1])}`;
}
function synthesizeReferences(raw){
  const stores=new Map(), promoters=new Map();
  (raw.sales||[]).forEach((r,i)=>{
    const store=find(r,'Store Name','Store','Outlet','Shop'); const sid=find(r,'Store ID','StoreID','store_id','Store Code','Outlet ID')||store||`STORE-${i+1}`;
    if(!stores.has(sid)) stores.set(sid,{'Store ID':sid,'Store Name':store||sid,'Customer':find(r,'Customer','Account','Dealer','Client'),'Area':find(r,'Area','Province','Territory'),'ASM':find(r,'ASM','Manager','Sales Manager'),'Channel':find(r,'Customer Type')||'Unclassified'});
    const pid=find(r,'PS ID','Promoter ID','Frontliner ID','PS','Promoter'); if(pid&&!promoters.has(pid)) promoters.set(pid,{'PS ID':pid,'PS Name':find(r,'PS Name','Promoter Name','Frontliner Name')||pid,'Store ID':sid,'Status':'Active'});
  });
  if(!(raw.stores||[]).length)raw.stores=[...stores.values()]; if(!(raw.promoters||[]).length)raw.promoters=[...promoters.values()]; return raw;
}
function openUploadDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('realme-wvis-dashboard',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('uploads'))req.result.createObjectStore('uploads')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function idbGet(key){const db=await openUploadDB();return new Promise((res,rej)=>{const tx=db.transaction('uploads','readonly'),rq=tx.objectStore('uploads').get(key);rq.onsuccess=()=>res(rq.result||null);rq.onerror=()=>rej(rq.error)})}
async function idbSet(key,val){const db=await openUploadDB();return new Promise((res,rej)=>{const tx=db.transaction('uploads','readwrite');tx.objectStore('uploads').put(val,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function idbDelete(key){const db=await openUploadDB();return new Promise((res,rej)=>{const tx=db.transaction('uploads','readwrite');tx.objectStore('uploads').delete(key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function parseSalesFile(file){
  const data=await file.arrayBuffer(); const wb=XLSX.read(data,{type:'array',cellDates:true}); const ws=wb.Sheets[wb.SheetNames[0]]; if(!ws)throw new Error('The workbook has no readable worksheet.');
  const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false}).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[normalize(k),normalize(v)])));
  if(!rows.length)throw new Error('The selected file contains no sales rows.');
  return {name:file.name,size:file.size,uploadedAt:new Date().toISOString(),headers:headersOf(rows),rows};
}
function combinedUploads(){
  const f=state.uploads.fixed,c=state.uploads.current; if(f&&c&&!sameHeaders(f.headers,c.headers))return [];
  return [...(f?.rows||[]).map(r=>({...r,_DataSource:'Fixed Monthly Data'})),...(c?.rows||[]).map(r=>({...r,_DataSource:'Current Month Running Sales'}))].filter(r=>normalize(find(r,'Date','Sales Date','Sellout Date','Transaction Date','Store ID','Store Code','Store Name','Model','Qty'))!=='');
}
function renderUploadUI(){
  const f=state.uploads.fixed,c=state.uploads.current,combined=combinedUploads();
  const meta=(obj)=>obj?`<span class="file-name">${escapeHtml(obj.name)}</span><div class="file-stats"><span>${fmt(obj.rows.length)} rows</span><span>${escapeHtml(dateRange(obj.rows))}</span><span>${fmt(obj.headers.length)} columns</span></div>`:'<span class="meta-empty">No file uploaded</span>';
  $('fixedMeta').innerHTML=meta(f); $('currentMeta').innerHTML=meta(c); $('fixedRows').textContent=fmt(f?.rows.length||0); $('currentRows').textContent=fmt(c?.rows.length||0); $('combinedRows').textContent=fmt(combined.length); $('combinedRows2').textContent=fmt(combined.length);
  const badge=$('schemaBadge'); badge.className='badge';
  if(f&&c){const ok=sameHeaders(f.headers,c.headers);badge.textContent=ok?'Headers matched':'Header mismatch';badge.classList.add(ok?'good':'bad');$('schemaMessage').textContent=ok?`Both files contain the same ${f.headers.length} columns and are ready to combine.`:'The two files do not use the exact same column order/names. Replace one file before combining.'}
  else if(f||c){badge.textContent='One file loaded';badge.classList.add('good');$('schemaMessage').textContent='This file is active now. Upload the second file when available; its headers will be checked automatically.'}
  else{badge.textContent='Waiting for files';$('schemaMessage').textContent='Upload either sales file to begin.'}
}
function toast(msg,bad=false){const old=document.querySelector('.upload-toast');if(old)old.remove();const el=document.createElement('div');el.className=`upload-toast${bad?' bad':''}`;el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),3000)}
async function applyUploadedSales(){
  const rows=combinedUploads(); if(!rows.length)return false; const raw=baseRaw(); raw.sales=rows; state.raw=synthesizeReferences(raw); state.live=true; $('connectionDot').classList.add('live'); $('connectionText').textContent='Uploaded sales data'; buildFilters(); render(); renderUploadUI(); $('lastUpdated').textContent=new Date().toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); return true;
}
async function handleUpload(kind,file){
  if(!file)return; try{const parsed=await parseSalesFile(file),other=kind==='fixed'?state.uploads.current:state.uploads.fixed;if(other&&!sameHeaders(parsed.headers,other.headers))throw new Error(`Header mismatch: this file has ${parsed.headers.length} columns while the other upload uses a different schema.`);state.uploads[kind]=parsed;await idbSet(kind,parsed);renderUploadUI();await applyUploadedSales();toast(`${kind==='fixed'?'Fixed historical':'Current-month'} sales loaded: ${fmt(parsed.rows.length)} rows.`)}catch(e){toast(e.message,true);showError(e.message)}
}
async function clearUpload(kind){state.uploads[kind]=null;await idbDelete(kind);renderUploadUI();if(!(await applyUploadedSales()))await refresh();toast(`${kind==='fixed'?'Fixed historical':'Current-month'} file removed.`)}
async function restoreUploads(){try{state.uploads.fixed=await idbGet('fixed');state.uploads.current=await idbGet('current');renderUploadUI();return await applyUploadedSales()}catch(e){console.warn('Could not restore browser uploads',e);renderUploadUI();return false}}

function find(obj,...names){ const keys=Object.keys(obj||{}), label=k=>String(k).replace(/^.*[^\x00-\x7F]/,'').trim().replace(/\s+/g,' ').toLowerCase(), aliases={'qty':['sell out'],'ps id':['sr code'],'ps name':['sr name'],'customer':['short name'],'asm':['sub region'],'area':['region']}; for(const name of names){const key=keys.find(k=>k.toLowerCase()===name.toLowerCase());if(key!==undefined && normalize(obj[key])!=='')return obj[key];} for(const name of names){for(const wanted of [name.toLowerCase(),...(aliases[name.toLowerCase()]||[])]){const key=keys.find(k=>label(k)===wanted);if(key!==undefined && normalize(obj[key])!=='')return obj[key];}} return ''; }
function storeMap(){ return new Map((state.raw.stores||[]).map(s=>[find(s,'Store ID','StoreID','store_id','Store Code','Outlet ID'),s])); }
function salesProductFields(row){
 const code=normalize(find(row,'Model','SKU','Product','Model Name')),type=/^ACSR/i.test(code)?'AIOT':/^HP/i.test(code)?'SMARTPHONE':'Unclassified';
 const name=normalize(find(row,'Material Name'));
 let unified=name.replace(/\s+(?:RM|TL|NXL|TD)[A-Z0-9][\s\S]*$/i,'').trim();
 const color=normalize(find(row,'Color')),dash=unified.lastIndexOf('-'),suffix=dash>=0?unified.slice(dash+1).trim():'';
 if(suffix&&((color&&!/^not applicable$/i.test(color)&&suffix.toLowerCase()===color.toLowerCase())||/^(?:white|black|blue|red|green|yellow|pink|purple|silver|gold|golden|gray|grey|orange|brown|cream|rosegold)$/i.test(suffix)))unified=unified.slice(0,dash).trim();
 const model=type==='AIOT'?(unified||code):code;
 return {_modelCode:code,_productType:type,_model:model};
}
function productFilterOptions(){
 const type=selected('productTypeFilter'),rows=salesEnriched().filter(r=>passes(r._productType,type));
 const catalog=typeof scoreCatalog==='undefined'?[]:[...scoreCatalog.values()].filter(m=>passes(/^HP/i.test(m.model)?'SMARTPHONE':/^realme/i.test(m.series)?'realme AIOT':'TL AIOT (non-realme)',type));
 setOptions('modelFilter',uniq([...catalog.map(m=>m.model),...rows.map(r=>r._model)]),'models');
 if($('seriesFilter'))setOptions('seriesFilter',uniq([...catalog.map(m=>m.series),...rows.map(r=>r._series)]),'series');
}
function salesEnriched(){
  const sm=storeMap();
  return (state.raw.sales||[]).map(r=>{ const sid=find(r,'Store ID','StoreID','store_id','Store Code','Outlet ID') || find(r,'Store Name','Store','Outlet','Shop'); const s=sm.get(sid)||{}; return {...r,_sid:sid,_date:parseDate(find(r,'Date','Sales Date','date','Sellout Date','Transaction Date')),_qty:n(find(r,'Qty','Quantity','Sales','Units','Sellout Qty','Sales Qty')),...salesProductFields(r),_area:find(r,'Area','Province','Territory')||find(s,'Area','Province','Territory'),_asm:find(r,'ASM','Manager','Sales Manager')||find(s,'ASM','Manager'),_customer:find(r,'Customer','Account','Dealer','Client')||find(s,'Customer','Account','Dealer'),_channel:find(r,'Customer Type')||'Unclassified',_store:find(r,'Store Name','Store','Outlet','Shop')||find(s,'Store Name','Store','Outlet'),_ps:find(r,'PS ID','Promoter ID','Frontliner ID','PS','Promoter')}; });
}
function selected(id){return $(id).value||'ALL'}
function passes(v,sel){return sel==='ALL'||v===sel}
function filterData(){
  const month=selected('monthFilter'), area=selected('areaFilter'), asm=selected('asmFilter'), customer=selected('customerFilter'), channel=selected('channelFilter'), model=selected('modelFilter');
  state.filteredSales=salesEnriched().filter(r=>{
    const rm=!isNaN(r._date)?`${r._date.getFullYear()}-${String(r._date.getMonth()+1).padStart(2,'0')}`:'';
    return passes(r._productType,selected('productTypeFilter'))&&passes(rm,month)&&passes(r._area,area)&&passes(r._asm,asm)&&passes(r._customer,customer)&&passes(r._channel,channel)&&passes(r._model,model);
  });
}
function uniq(arr){return [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)))}
function setOptions(id,values,label){ const el=$(id),cur=el.value; el.innerHTML=`<option value="ALL">All ${label}</option>`+values.map(v=>`<option>${escapeHtml(v)}</option>`).join(''); if([...el.options].some(o=>o.value===cur))el.value=cur; }
function buildFilters(){
  const rows=salesEnriched(); const months=uniq(rows.map(r=>!isNaN(r._date)?`${r._date.getFullYear()}-${String(r._date.getMonth()+1).padStart(2,'0')}`:'' )).reverse();
  const m=$('monthFilter'); const prev=m.value; m.innerHTML=months.map(x=>`<option value="${x}">${monthName(x)}</option>`).join(''); if(months.includes(prev))m.value=prev;
  setOptions('areaFilter',uniq(rows.map(r=>r._area)),'areas'); setOptions('asmFilter',uniq(rows.map(r=>r._asm)),'subregions'); setOptions('customerFilter',uniq(rows.map(r=>r._customer)),'customers'); setOptions('channelFilter',uniq(rows.map(r=>r._channel)),'channels'); setOptions('modelFilter',uniq(rows.map(r=>r._model)),'models');
}
function monthName(ym){ if(!ym)return '—'; const [y,m]=ym.split('-'); return new Date(+y,+m-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'}); }
function sumBy(rows,key,val='_qty'){ const map=new Map(); rows.forEach(r=>map.set(r[key]||'Unknown',(map.get(r[key]||'Unknown')||0)+n(r[val]))); return [...map.entries()].sort((a,b)=>b[1]-a[1]); }
function filteredStoreIds(){ return new Set(state.filteredSales.map(r=>r._sid)); }

function relevantTargets(){
  const month=selected('monthFilter'), ids=filteredStoreIds(), model=selected('modelFilter');
  return (state.raw.targets||[]).filter(t=>{
    const tm=normalize(find(t,'Month','YYYY-MM','Period')).slice(0,7), sid=find(t,'Store ID','StoreID','store_id'), mod=find(t,'Model','SKU','Product');
    return tm===month && (ids.size===0||ids.has(sid)) && (model==='ALL'||mod===model);
  });
}
function totalTarget(){return relevantTargets().reduce((s,t)=>s+n(find(t,'Target','Qty Target','Sales Target')),0)}
function inventoryRows(){
  const sm=storeMap(); const area=selected('areaFilter'),asm=selected('asmFilter'),customer=selected('customerFilter'),channel=selected('channelFilter'),model=selected('modelFilter');
  return (state.raw.inventory||[]).map(r=>{const sid=find(r,'Store ID','StoreID','store_id'),s=sm.get(sid)||{};return {...r,_sid:sid,_model:find(r,'Model','SKU','Product'),_inv:n(find(r,'Inventory','Stock','SOH')),_area:find(s,'Area','Province','Territory'),_asm:find(s,'ASM','Manager'),_customer:find(s,'Customer','Account','Dealer'),_channel:find(s,'Channel','Store Type'),_store:find(s,'Store Name','Store','Outlet')}}).filter(r=>passes(r._area,area)&&passes(r._asm,asm)&&passes(r._customer,customer)&&passes(r._channel,channel)&&passes(r._model,model));
}

function chart(id,type,labels,data,opts={}){
  if(state.charts[id])state.charts[id].destroy();
  const ctx=$(id); state.charts[id]=new Chart(ctx,{type,data:{labels,datasets:data},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:opts.legend??false,position:'bottom'}},scales:opts.scales??{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'#f0f1f3'}}},...opts.extra}});
}
function render(){ filterData(); const rows=state.filteredSales; const sales=rows.reduce((s,r)=>s+r._qty,0), target=totalTarget(), ach=target?sales/target*100:0, gap=Math.max(target-sales,0);
  const dates=uniq(rows.map(r=>r._date.toISOString().slice(0,10))); const elapsed=Math.max(dates.length,1); const [yy,mm]=(selected('monthFilter')||'').split('-').map(Number); const daysInMonth=yy&&mm?new Date(yy,mm,0).getDate():30; const remaining=Math.max(daysInMonth-elapsed,1);
  $('salesKpi').textContent=fmt(sales); $('targetKpi').textContent=fmt(target); $('achievementKpi').textContent=pct(ach); $('gapKpi').textContent=fmt(gap); $('runRateKpi').textContent=fmt(sales/elapsed,1); $('requiredRunRateKpi').textContent=fmt(gap/remaining,1); $('achievementBar').style.width=`${Math.min(ach,100)}%`; $('periodLabel').textContent=`${monthName(selected('monthFilter'))} performance`;

  renderOverviewTrend();
  renderDealerTrend();
  const cust=sumBy(rows,'_customer').slice(0,7); chart('customerChart','bar',cust.map(x=>x[0]),[{data:cust.map(x=>x[1]),backgroundColor:'#111214',borderRadius:6}],{});
  renderOverviewMix(rows);
  const ch=sumBy(rows,'_channel').slice(0,6); chart('channelChart','bar',ch.map(x=>x[0]),[{data:ch.map(x=>x[1]),backgroundColor:'#ffc915',borderRadius:6}],{});

  renderModelTable(rows); renderStores(rows); renderPromoters(rows); renderInventory(rows);
}
function renderModelTable(rows){
  const totalModelSales=rows.reduce((sum,row)=>sum+row._qty,0); const salesMap=new Map(sumBy(rows,'_model')); const invMap=new Map(sumBy(inventoryRows().map(r=>({...r,_qty:r._inv})),'_model')); const targetMap=new Map(); relevantTargets().forEach(t=>{const m=find(t,'Model','SKU','Product');targetMap.set(m,(targetMap.get(m)||0)+n(find(t,'Target','Qty Target','Sales Target')))});
  const models=uniq([...salesMap.keys(),...targetMap.keys(),...invMap.keys()]); $('modelTableBody').innerHTML=models.map(m=>{const s=salesMap.get(m)||0,t=targetMap.get(m)||0,i=invMap.get(m)||0,a=totalModelSales?s/totalModelSales*100:0;return `<tr><td><strong>${escapeHtml(m)}</strong></td><td>${fmt(s)}</td><td>${fmt(t)}</td><td>${pct(a)}</td><td>${fmt(i)}</td></tr>`}).join('')||emptyRow(5);
}
function storeAggregates(rows){
 const groups=new Map(),inv=new Map();inventoryRows().forEach(r=>inv.set(r._sid,(inv.get(r._sid)||0)+r._inv));
 rows.forEach(r=>{if(!groups.has(r._sid))groups.set(r._sid,[]);groups.get(r._sid).push(r);});
 const labels=(items,key)=>uniq(items.map(r=>r[key])).join(', ');
 return [...groups].map(([sid,items])=>({sid,store:labels(items,'_store')||sid,customer:labels(items,'_customer'),area:labels(items,'_area'),asm:labels(items,'_asm'),channel:labels(items,'_channel'),sales:items.reduce((sum,r)=>sum+r._qty,0),inventory:inv.get(sid)||0}));
}
function filteredPromoterAggregates(rows){
 const groups=new Map(),names=new Map((state.raw.promoters||[]).map(p=>[find(p,'PS ID','Promoter ID','Frontliner ID'),find(p,'PS Name','Promoter','Name')]));
 rows.forEach(r=>{if(!r._ps)return;if(!groups.has(r._ps))groups.set(r._ps,[]);groups.get(r._ps).push(r);});
 const labels=(items,key)=>uniq(items.map(r=>r[key])).join(', ');
 return [...groups].map(([pid,items])=>({pid,name:find(items[0],'PS Name','Promoter Name','Frontliner Name')||names.get(pid)||pid,store:labels(items,'_store'),area:labels(items,'_area'),asm:labels(items,'_asm'),sales:items.reduce((sum,r)=>sum+r._qty,0)})).sort((a,b)=>b.sales-a.sales);
}
function renderStores(rows){
  renderStorePerformance();
}

function promoterHireTypes(all,month){
 const cutoff=all.filter(r=>modelMonthKey(r._date)===month).reduce((d,r)=>Math.max(d,productivityCalendarDay(r._date)??-Infinity),-Infinity),latest=new Map();
 for(const r of all){const date=productivityCalendarDay(r._date),value=find(r,'SR Hire Date','Hire Date');if(date===null||date>cutoff||!normalize(value))continue;
  for(const key of [rosterCode(r._ps),'name:'+rosterName(find(r,'PS Name','Promoter Name'))])if(key&&(!latest.has(key)||date>=latest.get(key).date))latest.set(key,{date,hire:productivityHireDay(value)});
 }
 return new Map([...latest].map(([key,{hire}])=>[key,hire===null?'NHT (date unavailable)':hire>cutoff?'NHT (hire date after period)':cutoff-hire+1>=30?'REG PS':'NHT ('+new Date(hire*86400000).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})+')']));
}

function renderPromoters(rows){
  const list=filteredPromoterAggregates(rows),hireTypes=promoterHireTypes(salesEnriched(),selected('monthFilter'));
  const active=list.filter(x=>x.sales>0).length,total=list.length; $('psCountKpi').textContent=fmt(total); $('activePsKpi').textContent=fmt(active); $('salesPerPsKpi').textContent=fmt(total?rows.reduce((s,r)=>s+r._qty,0)/total:0,1); $('zeroPsKpi').textContent=fmt(total-active); $('psTableBody').innerHTML=list.map(x=>`<tr data-promoter-id="${escapeHtml(x.pid)}"><td><strong>${escapeHtml(x.name)}</strong></td><td>${escapeHtml(x.store)}</td><td>${escapeHtml(hireTypes.get(rosterCode(x.pid))||hireTypes.get('name:'+rosterName(x.name))||'NHT (date unavailable)')}</td><td>${escapeHtml(x.asm)}</td><td>${fmt(x.sales)}</td><td><span class="badge ${x.sales>0?'good':'bad'}">${x.sales>0?'With sales':'Zero sales'}</span></td></tr>`).join('')||emptyRow(6);
}
function renderInventory(rows){
  const inv=inventoryRows(), total=inv.reduce((s,r)=>s+r._inv,0), stores=storeAggregates(rows), withStock=stores.filter(x=>x.inventory>0).length, zero=Math.max(stores.length-withStock,0), sales=rows.reduce((s,r)=>s+r._qty,0), dates=uniq(rows.map(r=>r._date.toISOString().slice(0,10))).length||1, daily=sales/dates, doh=daily?total/daily:0;
  $('inventoryTotalKpi').textContent=fmt(total); $('storesWithStockKpi').textContent=fmt(withStock); $('zeroStockStoresKpi').textContent=fmt(zero); $('dohKpi').textContent=fmt(doh,1);
  const byModel=sumBy(inv.map(r=>({...r,_qty:r._inv})),'_model').slice(0,10); chart('inventoryModelChart','bar',byModel.map(x=>x[0]),[{data:byModel.map(x=>x[1]),backgroundColor:'#111214',borderRadius:6}],{}); const byArea=sumBy(inv.map(r=>({...r,_qty:r._inv})),'_area').slice(0,10); chart('inventoryAreaChart','bar',byArea.map(x=>x[0]),[{data:byArea.map(x=>x[1]),backgroundColor:'#ffc915',borderRadius:6}],{});
}
function emptyRow(cols){return `<tr><td colspan="${cols}" style="text-align:center;color:#8a9098;padding:28px">No data for the selected filters.</td></tr>`}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function showError(msg){$('errorBanner').textContent=msg;$('errorBanner').style.display='block'} function clearError(){$('errorBanner').style.display='none'}

async function refresh(){
  clearError(); $('refreshBtn').disabled=true; $('refreshBtn').textContent='Refreshing…';
  try{
    if(combinedUploads().length){await applyUploadedSales(); return;}
    state.raw=synthesizeReferences(await loadGoogleSheets()); state.live=true; $('connectionDot').classList.add('live'); $('connectionText').textContent='Google Sheets live';
  }
  catch(e){state.live=false;$('connectionDot').classList.remove('live');$('connectionText').textContent='Demo data';if(CFG.demoModeFallback){state.raw=demoData();if(CFG.googleSheetUrl)showError(`${e.message} Showing demo data instead. Upload your two sales files from Data Sources, or make the workbook viewable by the dashboard.`)}else{showError(e.message);return}}
  finally{$('refreshBtn').disabled=false;$('refreshBtn').textContent='Refresh data'}
  buildFilters(); render(); renderUploadUI(); $('lastUpdated').textContent=new Date().toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}

document.addEventListener('DOMContentLoaded',async()=>{
  const secondaryNav=document.createElement('nav');secondaryNav.className='sidebar-secondary-nav';secondaryNav.setAttribute('aria-label','Additional dashboard tabs');
  document.querySelector('.sidebar-foot').before(secondaryNav);
  ['data','lineup','stores','inventory'].forEach(section=>{const tab=document.querySelector('.nav-item[data-section="'+section+'"]');if(tab){if(section==='inventory')tab.textContent='Inventory (soon)';secondaryNav.append(tab);}});
  $('pageTitle').textContent=document.querySelector('.nav-item.active')?.textContent.trim()||'Overview'; document.title=`${CFG.companyName||'realme WVIS'} Sales Dashboard`;
  document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));btn.classList.add('active');$('pageTitle').textContent=btn.textContent.trim();document.querySelectorAll('.dashboard-section').forEach(x=>x.classList.remove('active'));$(`${btn.dataset.section}Section`).classList.add('active')}));
  $('productTypeFilter').addEventListener('change',()=>{$('modelFilter').value='ALL';if($('seriesFilter'))$('seriesFilter').value='ALL';productFilterOptions();render();});
  ['monthFilter','areaFilter','asmFilter','customerFilter','channelFilter','modelFilter'].forEach(id=>$(id).addEventListener('change',render));
  $('fixedFile').addEventListener('change',e=>handleUpload('fixed',e.target.files[0])); $('currentFile').addEventListener('change',e=>handleUpload('current',e.target.files[0]));
  $('clearFixedBtn').addEventListener('click',()=>clearUpload('fixed')); $('clearCurrentBtn').addEventListener('click',()=>clearUpload('current'));
  document.querySelectorAll('.drop-zone').forEach(zone=>{zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragover')});zone.addEventListener('dragleave',()=>zone.classList.remove('dragover'));zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragover');const input=zone.querySelector('input');const file=e.dataTransfer.files[0];if(file)handleUpload(input.id==='fixedFile'?'fixed':'current',file)})});
  $('refreshBtn').addEventListener('click',refresh); const restored=await restoreUploads(); if(!restored)await refresh(); if(CFG.refreshMs>0)setInterval(()=>{if(!combinedUploads().length)refresh()},CFG.refreshMs);
});

// Store comparison: raw sale-date assignments and stable store/promoter identities.
// No active-roster restriction: previous sellers and stores with zero current sales
// must remain visible or their declines would disappear from the comparison.
function storePerfMonth(date){return date&&!isNaN(date)?date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0'):'';}
function storePerfOffset(month,offset){const [y,m]=month.split('-').map(Number);return storePerfMonth(new Date(y,m-1+offset,1));}
function storePerfDays(month){const [y,m]=month.split('-').map(Number);return y&&m?new Date(y,m,0).getDate():0;}
function storePerfPeriod(all,month,previous,mode){
 const latest=new Map();for(const r of all){const m=storePerfMonth(r._date);if(m)latest.set(m,Math.max(latest.get(m)||0,r._date.getDate()));}
 const currentLatest=latest.get(month)||0,previousLatest=latest.get(previous)||0;
 const day=mode==='matched'?Math.min(currentLatest,storePerfDays(previous)):0;
 const currentEnd=mode==='matched'?day:currentLatest,previousEnd=mode==='matched'?day:previousLatest;
 const comparable=mode==='matched'?day>0&&previousLatest>=day:currentLatest===storePerfDays(month)&&previousLatest===storePerfDays(previous)&&currentLatest>0&&previousLatest>0;
 return {month,previous,mode,latest,currentEnd,previousEnd,currentLatest,previousLatest,comparable};
}
function storePerfIdentity(row,kind){
 const clean=v=>normalize(v).replace(/\s+/g,' '),label=key=>clean(row[key])||'Unassigned';
 if(kind==='store'){const name=label('_store'),id=clean(row._sid);return {key:id?'store:'+id:'store-name:'+name.toLowerCase(),label:name==='Unassigned'&&id?id:name};}
 if(kind==='model'){const name=label('_model');return {key:JSON.stringify([row._productType||'',name.toLowerCase()]),label:name};}
 if(kind==='promoter'){
  const role=clean(find(row,'SR Role','Role')).toUpperCase(),id=clean(row._ps),name=clean(find(row,'PS Name','Promoter Name','SR Name','Frontliner Name'));
  if(['SP','NHT'].includes(role))return {key:id?'ps:'+id:name?'ps-name:'+name.toLowerCase():'ps:unidentified',label:name||id||'Unidentified promoter',detail:id?'Promoter · '+id:'Promoter · ID unavailable'};
  if(role==='FL')return {key:id?'fl:'+id:name?'fl-name:'+name.toLowerCase():'fl:unidentified',label:name||id||'Unidentified frontliner',detail:'Frontliner'+(id?' · '+id:' · ID unavailable')};
  return {key:'other:'+role,label:role?'Other sales · '+role:'Unassigned seller / role',detail:'Included to reconcile all store sales'};
 }
 const name=label({dealer:'_customer',area:'_area',subregion:'_asm'}[kind]);return {key:name,label:name};
}
function storePerfScope(all,filters){
 const fields={area:'_area',subregion:'_asm',dealer:'_customer',product:'_productType',model:'_model',type:'_channel'};
 return all.filter(r=>storePerfMonth(r._date)&&Object.entries(fields).every(([key,field])=>!filters[key]||filters[key]==='ALL'||(r[field]||'Unassigned')===filters[key]));
}
function storePerfReport(all,filters,kind='store',focus=null){
 const p=storePerfPeriod(all,filters.month,filters.previous,filters.mode),path=focus?[...(focus.parents||[]),focus]:[],scoped=storePerfScope(all,filters).filter(r=>path.every(part=>storePerfIdentity(r,part.kind).key===part.key));
 const months=Array.from({length:6},(_,i)=>storePerfOffset(filters.month,i-5));if(filters.previous&&!months.includes(filters.previous))months.unshift(filters.previous);
 const groups=new Map(),total={key:'total',label:'Selected total',current:0,previous:0,monthly:months.map(()=>0),currentStores:new Set(),previousStores:new Set()};
 for(const row of scoped){
  const m=storePerfMonth(row._date),day=row._date.getDate(),mi=months.indexOf(m),isCurrent=m===p.month&&day<=p.currentEnd,isPrevious=m===p.previous&&day<=p.previousEnd;
  if(mi<0&&!isCurrent&&!isPrevious)continue;
  const who=storePerfIdentity(row,kind),store=storePerfIdentity(row,'store').key;
  if(!groups.has(who.key))groups.set(who.key,{...who,current:0,previous:0,monthly:months.map(()=>0),currentStores:new Set(),previousStores:new Set(),dealers:new Set(),areas:new Set(),subregions:new Set(),stores:new Set(),latest:-Infinity,inPair:false});
  const g=groups.get(who.key),qty=Number(row._qty)||0,date=+row._date;
  if(date>=g.latest){g.latest=date;g.label=who.label;g.detail=who.detail||'';}
  if(isCurrent||isPrevious){g.inPair=true;for(const [set,key] of [['dealers','_customer'],['areas','_area'],['subregions','_asm'],['stores','_store']])if(normalize(row[key]))g[set].add(normalize(row[key]));}
  for(const item of [g,total]){
   if(mi>=0)item.monthly[mi]+=qty;
   if(isCurrent){item.current+=qty;if(qty>0)item.currentStores.add(store);}
   if(isPrevious){item.previous+=qty;if(qty>0)item.previousStores.add(store);}
  }
 }
 const list=[...groups.values()].filter(g=>g.inPair),history=[...groups.values()];
 const lost=list.reduce((s,g)=>s+Math.max(0,g.previous-g.current),0),gained=list.reduce((s,g)=>s+Math.max(0,g.current-g.previous),0);
 const finish=g=>({...g,current:p.currentLatest?g.current:null,previous:p.previousLatest?g.previous:null,gap:p.comparable?g.current-g.previous:null,change:p.comparable&&g.previous>0?(g.current-g.previous)/g.previous*100:null,declineShare:p.comparable?(lost?Math.max(0,g.previous-g.current)/lost*100:0):null,salesShare:p.currentLatest&&total.current>0?g.current/total.current*100:null,monthly:g.monthly.map((v,i)=>p.latest.has(months[i])?v:null)});
 const output=list.map(finish).sort((a,b)=>(a.gap??0)-(b.gap??0)||(b.current??0)-(a.current??0)||a.label.localeCompare(b.label));
 return {period:p,months,rows:output,history:history.map(finish).sort((a,b)=>(b.current??0)-(a.current??0)||a.label.localeCompare(b.label)),total:finish(total),lost:p.comparable?lost:null,gained:p.comparable?gained:null,declining:p.comparable?list.filter(g=>g.current<g.previous).length:null,scoped};
}
const storePerfState={month:'',previous:'',mode:'matched',area:'ALL',subregion:'ALL',dealer:'ALL',product:'SMARTPHONE',model:'ALL',type:'ALL',view:'store',search:'',focus:null};
let storePerfDrills=[],storePerfMounted=false;
function mountStorePerformance(){
 if(storePerfMounted)return;storePerfMounted=true;
 const filter=(key,label)=>`<label>${label}<select id="sp-${key}" data-sp-filter="${key}" aria-label="Store performance ${label}"></select></label>`;
 const card=(id,title,description)=>`<article class="card sp-card"><div class="card-head"><div><h2 id="${id}-title">${title}</h2><p id="${id}-note">${description}</p></div></div><div class="table-wrap"><table class="sp-table" data-preserve-customer-types aria-labelledby="${id}-title"><thead></thead><tbody id="${id}"></tbody><tfoot data-summary="history"></tfoot></table></div></article>`;
 $('storesSection').innerHTML=`<article class="card sp-card"><div class="card-head"><div><h2>Sales comparison & contribution</h2><p>Compare months, find lost units, and trace the stores, models and people behind the change.</p></div></div><div class="sp-filters">${filter('month','Sales month')}${filter('previous','Compare with')}${filter('mode','Comparison period')}${filter('product','Product type')}${filter('dealer','Dealer')}${filter('area','Area')}${filter('subregion','Subregion')}${filter('type','Customer type')}${filter('model','Model')}</div><p id="sp-period" class="sp-note" role="status"></p><div class="sp-controls" role="group" aria-label="Group store performance">${['store','dealer','area','subregion'].map(view=>`<button type="button" class="secondary-btn" data-sp-view="${view}" aria-pressed="${view==='store'}">By ${view}</button>`).join('')}<label class="sp-search">Find a row<input id="sp-search" placeholder="Store, dealer or geography" type="search" aria-label="Find a performance row"></label><button class="secondary-btn" type="button" data-sp-reset>Reset filters</button></div></article><div id="sp-kpis" class="sp-kpis"></div>${card('sp-summary','Store comparison','Click a name to inspect its contribution. Sorted by largest unit decline first.')}${card('sp-history','Monthly sales history','Full uploaded monthly sales; * marks a partial month.')}
 <article class="card sp-card sp-focus"><div><strong id="sp-focus-title">Contribution: all selected sales</strong><p id="sp-focus-note" class="sp-note"></p></div><button type="button" class="secondary-btn" data-sp-clear hidden>Clear selection</button></article>
 ${card('sp-detail-stores','Store contributions','Stores within the selected group, including stores with zero current sales.')}<div class="sp-detail-grid">${card('sp-models','Model contributions','Units gained or lost by model.')}${card('sp-promoters','Promoter & frontliner contributions','All sellers retained, including previous-month sellers and unassigned sales.')}</div>`;
 const style=document.createElement('style');style.id='store-performance-style';style.textContent=`
 body:has(.nav-item[data-section="stores"].active) .main>.filters{display:none!important}
 #storesSection{min-width:0}.sp-card{margin-bottom:18px;min-width:0}.sp-card h2{font-size:18px}.sp-card .card-head p,.sp-note{color:var(--muted);font-size:12px;line-height:1.6}.sp-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.sp-filters label,.sp-search{font-size:12px;font-weight:600;min-width:0}.sp-filters select,.sp-search input{display:block;width:100%;box-sizing:border-box;padding:10px;margin-top:6px;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:7px;min-height:42px}.sp-controls{display:flex;align-items:end;gap:8px;flex-wrap:wrap}.sp-controls [aria-pressed="true"]{background:#fff3bd;color:#17191c;border-color:#d8b42b}.sp-search{margin-left:auto;min-width:210px}.sp-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-bottom:18px}.sp-kpi{padding:18px;min-width:0}.sp-kpi strong{display:block;font-size:25px;margin:8px 0}.sp-kpi span{font-size:12px;color:var(--muted)}.sp-kpi small{display:block;font-size:11px;color:var(--muted)}.sp-up{color:#218444}.sp-down{color:#c43838}.sp-neutral{color:var(--muted)}.sp-table{width:100%;min-width:920px;table-layout:auto}.sp-table :is(th,td){padding:12px 10px;font-variant-numeric:tabular-nums}.sp-table :is(th,td):first-child{min-width:230px;max-width:400px;text-align:left}.sp-table td:not(:first-child){text-align:right;white-space:nowrap!important}.sp-table small{display:block;color:var(--muted);font-size:11px;font-weight:400;margin-top:5px}.sp-drill{font:inherit;font-weight:600;border:0;background:transparent;color:inherit;text-decoration:underline;text-underline-offset:3px;padding:4px 0;text-align:left;cursor:pointer}.sp-drill:focus-visible{outline:2px solid #2563eb}.sp-table tr[data-sp-selected="true"]{background:#fff5c9;color:#17191c}.sp-table .sp-context{text-align:left!important;max-width:270px;min-width:160px;white-space:normal!important}.sp-focus{display:flex;align-items:center;justify-content:space-between;gap:16px}.sp-detail-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:0}.sp-card .table-wrap{max-height:580px;overflow:auto}.sp-table thead th{position:sticky;top:0;background:var(--card);z-index:1}.sp-blank{padding:24px!important;text-align:center!important;color:var(--muted)}
 @media(max-width:1050px){.sp-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
 @media(max-width:640px){.sp-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.sp-filters{grid-template-columns:minmax(0,1fr)}.sp-search{margin-left:0;width:100%}.sp-focus{align-items:flex-start;flex-direction:column}.sp-card{padding:16px}.sp-table{min-width:900px}.sp-controls button{min-height:42px}}
 html[data-mobile-view] .sp-table.mobile-fit-table :is(th,td):first-child{min-width:230px!important;max-width:400px!important}html[data-theme="night"] .sp-up{color:#72d79c}html[data-theme="night"] .sp-down{color:#ff9898}`;document.head.append(style);
 $('storesSection').addEventListener('change',event=>{const key=event.target.dataset.spFilter;if(!key)return;storePerfState[key]=event.target.value;storePerfState.focus=null;if(key==='month')storePerfState.previous=storePerfOffset(storePerfState.month,-1);if(['dealer','area'].includes(key))storePerfState.subregion='ALL';if(key==='product')storePerfState.model='ALL';renderStorePerformance(true);});
 $('sp-search').addEventListener('input',event=>{storePerfState.search=event.target.value;renderStorePerformance(true);});
 document.addEventListener('click',event=>{
  const view=event.target.closest('[data-sp-view]'),drill=event.target.closest('[data-sp-drill]');
  if(view){storePerfState.view=view.dataset.spView;storePerfState.search='';$('sp-search').value='';storePerfState.focus=null;renderStorePerformance(true);}
  if(drill){const item=storePerfDrills[Number(drill.dataset.spDrill)];if(item){drill.closest('dialog.dashboard-fullscreen')?.querySelector('[aria-label="Close full screen"]')?.click();storePerfState.focus=item;renderStorePerformance(true);$('sp-focus-title').scrollIntoView({block:'center',behavior:'smooth'});}}
  if(event.target.closest('[data-sp-clear]')){storePerfState.focus=null;renderStorePerformance(true);}
  if(event.target.closest('[data-sp-reset]')){Object.assign(storePerfState,{month:'',previous:'',mode:'matched',area:'ALL',subregion:'ALL',dealer:'ALL',product:'SMARTPHONE',model:'ALL',type:'ALL',view:'store',search:'',focus:null});$('sp-search').value='';renderStorePerformance(true);}
 });
 style.textContent+='.sp-card{padding:20px}.sp-card p{display:block!important}.sp-card .card-head{gap:10px}.sp-focus .sp-note{margin-bottom:0}#storesSection .dashboard-fullscreen>.filters{display:none!important}@media(max-width:640px){.sp-card{padding:14px}}';
 document.querySelector('.nav-item[data-section="stores"]')?.addEventListener('click',()=>renderStorePerformance(true));
}
function storePerfOptions(key,items,allLabel){
 const el=$('sp-'+key),current=storePerfState[key],choices=items.map(item=>typeof item==='string'?[item,item]:item);
 if(allLabel)choices.unshift(['ALL',allLabel]);
 el.innerHTML=choices.map(([value,label])=>`<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
 el.value=choices.some(([value])=>value===current)?current:choices[0]?.[0]||'';storePerfState[key]=el.value;
}
function storePerfFormat(value,d=0){return value===null?'—':fmt(value,d);}
function storePerfChange(g){return g.gap===null?'—':g.previous>0?(g.change>0?'+':'')+fmt(g.change,1)+'%':g.previous===0?(g.current===0?'0.0%':g.current>0?'New':'Returns'):'N/A';}
function storePerfCells(g,showShare=true){
 const kind=g.gap===null?'sp-neutral':g.gap<0?'sp-down':g.gap>0?'sp-up':'';
 return `<td data-sort-value="${g.current??''}">${storePerfFormat(g.current)}</td><td data-sort-value="${g.previous??''}">${storePerfFormat(g.previous)}</td><td class="${kind}" data-sort-value="${g.gap??''}">${g.gap>0?'+':''}${storePerfFormat(g.gap)}</td><td class="${kind}" data-sort-value="${g.change??''}">${storePerfChange(g)}</td><td data-sort-value="${g.declineShare??''}" title="Lost units for this row / all lost units in this table">${storePerfFormat(g.declineShare,1)}${g.declineShare===null?'':'%'}</td>${showShare?`<td data-sort-value="${g.salesShare??''}">${storePerfFormat(g.salesShare,1)}${g.salesShare===null?'':'%'}</td>`:''}`;
}
function storePerfTable(id,report,{kind,clickable=false,rows=report.rows,context=false}={}){
 const body=$(id),table=body.closest('table'),p=report.period,monthLabel=m=>monthName(m),entity={store:'Store',dealer:'Dealer',area:'Area',subregion:'Subregion',model:'Model',promoter:'Promoter / seller'}[kind];
 const labels=[entity,...(context?['Dealer / Geography']:[]),monthLabel(p.month),monthLabel(p.previous),'Unit change','Change %','Share of decline','Share of sales'];
 if(table.tHead.rows[0]?.cells.length!==labels.length&&typeof tableSortState!=='undefined')tableSortState.delete(table);
 table.tHead.innerHTML='<tr>'+labels.map(label=>'<th scope="col">'+escapeHtml(label)+'</th>').join('')+'</tr>';
 body.innerHTML=rows.map(g=>{
  const selected=storePerfState.focus?.kind===kind&&storePerfState.focus.key===g.key;
  const parents=id==='sp-detail-stores'&&storePerfState.focus&&storePerfState.focus.kind!=='store'?[...(storePerfState.focus.parents||[]),storePerfState.focus]:[];
  const name=clickable?`<button type="button" class="sp-drill" data-sp-drill="${storePerfDrills.push({kind,key:g.key,label:g.label,parents})-1}" aria-label="View contribution for ${escapeHtml(g.label)}">${escapeHtml(g.label)}</button>`:`<strong>${escapeHtml(g.label)}</strong>`;
  const contextText=context?[...g.dealers,...g.subregions].join(' · '):'';
  return `<tr data-sp-selected="${selected}"><td>${name}${g.detail?'<small>'+escapeHtml(g.detail)+'</small>':''}</td>${context?'<td class="sp-context">'+escapeHtml(contextText)+'</td>':''}${storePerfCells(g)}</tr>`;
 }).join('')||`<tr><td class="sp-blank" colspan="${labels.length}">No matching sales records in either comparison period.</td></tr>`;
 const total={...report.total,declineShare:p.comparable?(report.lost?100:0):null,salesShare:report.total.current>0?100:null};
 table.tFoot.innerHTML=`<tr><th scope="row">Selected total</th>${context?'<td></td>':''}${storePerfCells(total)}</tr>`;
}
function renderStorePerformance(force=false){
 mountStorePerformance();if(!force&&!$('storesSection').classList.contains('active'))return;
 const all=salesEnriched(),months=uniq(all.map(r=>storePerfMonth(r._date)).filter(Boolean)).reverse();
 if(!storePerfState.month)storePerfState.month=months[0]||'';
 storePerfOptions('month',months.map(m=>[m,monthName(m)]));
 const prior=storePerfOffset(storePerfState.month||storePerfMonth(new Date()),-1);if(!storePerfState.previous)storePerfState.previous=prior;
 storePerfOptions('previous',uniq([...months.filter(m=>m<storePerfState.month),prior]).reverse().map(m=>[m,monthName(m)+(months.includes(m)?'':' — no source data')]));
 storePerfOptions('mode',[['matched','Same days (fair MTD comparison)'],['full','Full uploaded month']]);
 storePerfOptions('product',uniq(all.map(r=>r._productType||'Unclassified')),'All product types');
 storePerfOptions('dealer',uniq(all.map(r=>r._customer||'Unassigned')),'All dealers');
 storePerfOptions('area',uniq(all.map(r=>r._area||'Unassigned')),'All areas');
 const geography=all.filter(r=>passes(r._area||'Unassigned',storePerfState.area)&&passes(r._customer||'Unassigned',storePerfState.dealer));
 storePerfOptions('subregion',uniq(geography.map(r=>r._asm||'Unassigned')),'All subregions');
 storePerfOptions('type',uniq(all.map(r=>r._channel||'Unassigned')),'All customer types');
 storePerfOptions('model',uniq(all.filter(r=>passes(r._productType,storePerfState.product)).map(r=>r._model||'Unassigned')),'All models');
 storePerfDrills=[];const report=storePerfReport(all,storePerfState,storePerfState.view),p=report.period;
 const period=p.mode==='matched'?`${monthName(p.month)} 1–${p.currentEnd||'—'} vs ${monthName(p.previous)} 1–${p.previousEnd||'—'}`:`${monthName(p.month)} through day ${p.currentLatest||'—'} vs ${monthName(p.previous)} through day ${p.previousLatest||'—'}`;
 $('sp-period').textContent=period+'. '+(p.comparable?'Loss share = each row’s lost units ÷ all lost units in its table; gains are shown separately.':'Comparable data unavailable: change and decline figures stay blank until both periods have sufficient source coverage. Try Same days for an unfinished month.')+' Geography and dealer reflect the sales record at the time of sale. Returns are included. These filters apply only to this tab.';
 $('storesSection').querySelectorAll('[data-sp-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.spView===storePerfState.view)));
 const kpis=[['Current period units',storePerfFormat(report.total.current),monthName(p.month)],['Comparison units',storePerfFormat(report.total.previous),monthName(p.previous)],['Net unit change',(report.total.gap>0?'+':'')+storePerfFormat(report.total.gap),storePerfChange(report.total)],['Lost units',storePerfFormat(report.lost),'Before offsetting gains'],['Gained units',storePerfFormat(report.gained),'Offset to lost units'],['Declining '+({store:'stores',dealer:'dealers',area:'areas',subregion:'subregions'}[storePerfState.view]),storePerfFormat(report.declining),'Both periods, same filters']];
 $('sp-kpis').innerHTML=kpis.map(([label,value,note])=>`<article class="card sp-kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
 const search=storePerfState.search.trim().toLowerCase(),matches=g=>!search||[g.label,...g.dealers,...g.areas,...g.subregions,...g.stores].join(' ').toLowerCase().includes(search),visible=report.rows.filter(matches);
 $('sp-summary-title').textContent=({store:'Store',dealer:'Dealer',area:'Area',subregion:'Subregion'}[storePerfState.view])+' comparison';
 $('sp-summary-note').textContent='Click a name for store, model and seller contributions below. '+(search?'Search shows '+visible.length+' of '+report.rows.length+' rows; totals and decline shares retain the entire filtered scope.':'Largest declines first. Stores with previous sales but zero current sales remain included.');
 storePerfTable('sp-summary',report,{kind:storePerfState.view,rows:visible,clickable:true,context:storePerfState.view==='store'});
 const history=$('sp-history'),historyTable=history.closest('table');
 if(historyTable.tHead.rows[0]?.cells.length!==report.months.length+1&&typeof tableSortState!=='undefined')tableSortState.delete(historyTable);
 historyTable.tHead.innerHTML='<tr><th scope="col">'+escapeHtml(storePerfState.view)+'</th>'+report.months.map(m=>'<th scope="col">'+escapeHtml(monthName(m))+(p.latest.get(m)&&p.latest.get(m)<storePerfDays(m)?' *':'')+'</th>').join('')+'</tr>';
 const historyRow=(g,click)=>'<tr><td>'+(click?`<button class="sp-drill" type="button" data-sp-drill="${storePerfDrills.push({kind:storePerfState.view,key:g.key,label:g.label})-1}">${escapeHtml(g.label)}</button>`:escapeHtml(g.label))+'</td>'+g.monthly.map(v=>`<td data-sort-value="${v??''}">${storePerfFormat(v)}</td>`).join('')+'</tr>';
 history.innerHTML=report.history.filter(matches).map(g=>historyRow(g,true)).join('')||emptyRow(report.months.length+1);historyTable.tFoot.innerHTML=historyRow(report.total,false);
 $('sp-history-note').textContent='Full uploaded month totals, independent of Same days. * = source has not reached month end; — = month missing. No current sale means 0 only when that month is present. Search does not change totals.';
 const focus=storePerfState.focus;
 $('sp-focus-title').textContent='Contribution: '+(focus?[...(focus.parents||[]),focus].map(part=>part.label).join(' › '):'all selected sales');
 $('sp-focus-note').textContent=period+'. Each table independently reconciles to the same selected sales. Promoters, frontliners and other/unassigned sellers are kept separate. Historical assignments are preserved when a person transfers.';
 $('storesSection').querySelector('[data-sp-clear]').hidden=!focus;
 for(const [id,kind] of [['sp-detail-stores','store'],['sp-models','model'],['sp-promoters','promoter']])storePerfTable(id,storePerfReport(all,storePerfState,kind,focus),{kind,clickable:kind==='store',context:kind==='store'});
 if(typeof refreshTableSorting==='function')refreshTableSorting();
}

// Device-local display preference; never changes shared dashboard data.
(()=>{
 const root=document.documentElement,key='wvis-night-mode';
 let night=false;try{night=localStorage.getItem(key)==='true';}catch{}
 root.dataset.theme=night?'night':'day';
 const button=document.createElement('button');button.type='button';button.id='nightModeToggle';button.className='secondary-btn';
 const label=()=>{button.textContent=night?'☀ Day mode':'☾ Night mode';button.setAttribute('aria-pressed',String(night));button.setAttribute('aria-label',night?'Switch to day mode':'Switch to night mode');};
 label();document.querySelector('.top-actions').prepend(button);
 const originals=new WeakMap();
 function set(obj,prop,value){if(!obj)return;let saved=originals.get(obj);if(!saved){saved={};originals.set(obj,saved);}if(!(prop in saved))saved[prop]=obj[prop];if(night)obj[prop]=value;else if(saved[prop]===undefined)delete obj[prop];else obj[prop]=saved[prop];}
 const palette={'#111214':'#b6c5dc','#2563eb':'#78aaff','#d28b00':'#f8c65b','#15966b':'#62d6ad','#9333ea':'#c49bff','#db496c':'#ff91ad','#078aab':'#6dd6eb','#815b37':'#d9b18e'};
 const bright=value=>Array.isArray(value)?value.map(bright):typeof value==='string'?(palette[value.toLowerCase()]||(value.endsWith('70')&&palette[value.slice(0,-2).toLowerCase()]?palette[value.slice(0,-2).toLowerCase()]+'99':value)):value;
 Chart.register({id:'wvisNightMode',beforeUpdate(c){
  const o=c.config.options;
  set(o,'color','#cbd5e1');
  const p=o.plugins||(o.plugins={}),legend=p.legend||(p.legend={}),labels=legend.labels||(legend.labels={});set(labels,'color','#dce5f0');
  const tooltip=p.tooltip||(p.tooltip={});set(tooltip,'backgroundColor','#e7edf6');set(tooltip,'titleColor','#101827');set(tooltip,'bodyColor','#101827');set(tooltip,'footerColor','#101827');
  Object.values(o.scales||{}).forEach(s=>{for(const part of ['ticks','title']){s[part]||={};set(s[part],'color','#bdc9da');}s.grid||={};set(s.grid,'color',ctx=>ctx.tick?.value===0?'#7d8da5':'#354155');s.border||={};set(s.border,'color','#526078');});
  c.data.datasets.forEach(d=>{for(const prop of ['backgroundColor','borderColor','pointBackgroundColor','pointBorderColor']){const saved=originals.get(d);set(d,prop,bright(saved&&prop in saved?saved[prop]:d[prop]));}});
 }});
 button.addEventListener('click',()=>{night=!night;root.dataset.theme=night?'night':'day';try{localStorage.setItem(key,String(night));}catch{}label();Object.values(Chart.instances).forEach(c=>c.update('none'));});
})();
