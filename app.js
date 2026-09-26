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
 const type=selected('productTypeFilter'),rows=salesEnriched().filter(r=>r._productType===type);
 const catalog=typeof scoreCatalog==='undefined'?[]:[...scoreCatalog.values()].filter(m=>(/^HP/i.test(m.model)?'SMARTPHONE':/^realme/i.test(m.series)?'realme AIOT':'TL AIOT (non-realme)')===type);
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
  const a=storeAggregates(rows).sort((x,y)=>y.sales-x.sales); $('topStoresBody').innerHTML=a.slice(0,10).map(x=>`<tr><td><strong>${escapeHtml(x.store)}</strong></td><td>${escapeHtml(x.area)}</td><td>${escapeHtml(x.asm)}</td><td>${fmt(x.sales)}</td></tr>`).join('')||emptyRow(4); $('bottomStoresBody').innerHTML=[...a].sort((x,y)=>x.sales-y.sales).slice(0,10).map(x=>`<tr><td><strong>${escapeHtml(x.store)}</strong></td><td>${escapeHtml(x.area)}</td><td>${escapeHtml(x.asm)}</td><td>${fmt(x.sales)}</td></tr>`).join('')||emptyRow(4); $('storeTableBody').innerHTML=a.map(x=>`<tr><td><strong>${escapeHtml(x.store)}</strong></td><td>${escapeHtml(x.customer)}</td><td>${escapeHtml(x.area)}</td><td>${escapeHtml(x.asm)}</td><td>${escapeHtml(x.channel)}</td><td>${fmt(x.sales)}</td><td>${fmt(x.inventory)}</td></tr>`).join('')||emptyRow(7);
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
