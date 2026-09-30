'use strict';

const CM_SHEET='1QM4QEhjKRPiPeAAyNf1iR-54s9si98ljpbX8WArVzHo';
const SALES_SHEET='1AaSTsNKEO0olJ1UxCwtSLpktkSMKvfiDERlBLhWFDkc';
const clean=value=>String(value??'').trim();
const key=value=>clean(value).normalize('NFKC').toUpperCase().replace(/\s+/g,' ');
const error=message=>Object.assign(new Error(message),{status:502});

function csv(text){
 const rows=[];let row=[],cell='',quoted=false;
 text=String(text).replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw error('A source worksheet contains incomplete CSV data.');
 if(cell||row.length){row.push(cell);rows.push(row);}
 return rows;
}
function source(text,required,label){
 const rows=csv(text),headers=rows.shift()||[];
 const columns=required.map(name=>headers.findIndex(h=>key(h)===key(name)));
 if(columns.some(i=>i<0))throw error(label+' has missing or changed column headers.');
 // Always select the first/main header block, not repeated helper columns.
 return rows.map(row=>Object.fromEntries(required.map((name,i)=>[name,clean(row[columns[i]])])));
}
function cents(value,label){
 if(!clean(value))return null;
 let s=clean(value).replace(/(?:PHP|₱|,|\s)/gi,'');
 if(/^\(.*\)$/.test(s))s='-'+s.slice(1,-1);
 if(!/^[+-]?\d+(?:\.\d{1,2})?$/.test(s))throw error('Invalid amount in '+label+'. Please correct the source worksheet.');
 const negative=s[0]==='-',parts=s.replace(/^[+-]/,'').split('.');
 const result=(Number(parts[0])*100+Number((parts[1]||'').padEnd(2,'0')))*(negative?-1:1);
 if(!Number.isSafeInteger(result))throw error('Amount exceeds the supported range in '+label+'.');
 return result;
}
function add(a,b){if(a===null||b===null)return null;const n=a+b;if(!Number.isSafeInteger(n))throw error('CM amount total exceeds the supported range.');return n;}
function day(value){
 const s=clean(value);let m=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
 if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
 m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
 return m?`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`:'';
}
function dealerDirectory(texts){
 const short=new Map(),legal=new Map();
 for(const text of texts){
  const rows=source(text,['客户姓名 Customer Name','客户简称 Short Name','客户类别 Customer Type','渠道 Channel','大区域 District','Date'],'Sales dealer reference');
  for(const r of rows){
   if(!r['客户简称 Short Name']||key(r['大区域 District'])!=='WVIS')continue;
   const name=r['客户简称 Short Name'],date=day(r.Date),nka=[r['客户类别 Customer Type'],r['渠道 Channel']].some(s=>key(s)==='NKA');
   for(const [map,alias] of [[short,name],[legal,r['客户姓名 Customer Name']]]){
    if(!alias)continue;const old=map.get(key(alias));
    if(!old||date>old.date)map.set(key(alias),{name,date,nka});
    else if(date===old.date&&nka)old.nka=true;
   }
  }
 }
 return {short,legal};
}
function buildReport(input,checkedAt=new Date().toISOString()){
 const issued=source(input.issued,['Customer Name','CM Owner Name','CM Doc No','CM Amount','Aging','CM Remarks','CM UPDATED'],'INPUT ISSUED');
 const used=source(input.used,['CM Doc No','Amount Used','CM UPDATED','REMARKS'],'INPUT USED');
 const available=source(input.available,['Customer Name','CM Doc No','AmountLeft','CM UPDATED','UPDATED AGING DAYS'],'INPUT AVAILABLE');
 const directory=dealerDirectory(input.dealers),usage=new Map(),balances=new Map(),updatedAging=new Map();
 // The sheet also records UNUSED balances. Only USED rows are actual usage.
 for(const r of used){const id=key(r['CM Doc No']);if(!id||key(r.REMARKS)!=='USED')continue;usage.set(id,add(usage.has(id)?usage.get(id):0,cents(r['Amount Used'],'INPUT USED / '+id)));}
 for(const r of available){const id=key(r['CM Doc No']);if(!id)continue;if(balances.has(id))throw error('Duplicate CM number in INPUT AVAILABLE: '+id);balances.set(id,cents(r.AmountLeft,'INPUT AVAILABLE / '+id));updatedAging.set(id,r['UPDATED AGING DAYS']);}
 const rows=[],dealers=new Map(),seen=new Set();let excludedNka=0;
 for(const r of issued){
  const id=key(r['CM Doc No']);if(!id)continue;
  if(seen.has(id))throw error('Duplicate CM number in INPUT ISSUED: '+id);seen.add(id);
  // CM Owner identifies the dealer even when Customer Name is a distributor.
  const owner=r['CM Owner Name']||r['Customer Name'];
  const match=directory.short.get(key(owner))||directory.legal.get(key(owner))||(!r['CM Owner Name']?directory.legal.get(key(r['Customer Name'])):null);
  if(match?.nka){excludedNka++;continue;}
  // Dropdown groups come only from INPUT ISSUED Customer Name (column A).
  // A customer can have several CM owners; retain column B in each table row.
  const customer=r['Customer Name'];
  if(!customer)throw error('Customer Name is missing in INPUT ISSUED for '+id+'.');
  const dealerId=key(customer),issuedCents=cents(r['CM Amount'],'INPUT ISSUED / '+id),usedCents=usage.has(id)?usage.get(id):0;
  const remainingCents=add(issuedCents,usedCents),availableCents=balances.has(id)?balances.get(id):0,differenceCents=remainingCents===null||availableCents===null?null:remainingCents-availableCents;
  const agingValue=updatedAging.has(id)?updatedAging.get(id):r.Aging;
  const aging=/^\d+$/.test(agingValue)?Number(agingValue):null;
  if(!dealers.has(dealerId))dealers.set(dealerId,{id:dealerId,name:customer,classified:!!match});
  else if(!match)dealers.get(dealerId).classified=false;
  rows.push({dealerId,owner:r['CM Owner Name'],arNo:r['CM Doc No'],description:r['CM Remarks'],aging,
   status:remainingCents===0&&availableCents===0?'CONSUMED':'',issuedCents,usedCents,remainingCents,availableCents,differenceCents,
   // INPUT AVAILABLE membership determines this view, not calculated Remaining.
   availableListed:balances.has(id),isAvailable:balances.has(id),remarks:remainingCents>0&&!balances.has(id)?'EXPIRED':''});
 }
 const sourceDates={};for(const [name,items] of [['issued',issued],['used',used],['available',available]])sourceDates[name]=items.map(r=>day(r['CM UPDATED'])).filter(Boolean).sort().at(-1)||null;
 return {checkedAt,sourceDates,dealers:[...dealers.values()].sort((a,b)=>a.name.localeCompare(b.name)),rows,
  diagnostics:{excludedNka,unclassifiedDealers:[...dealers.values()].filter(d=>!d.classified).length,availableWithoutIssued:[...balances.keys()].filter(id=>!seen.has(id)).length}};
}

let cached=null,pending=null;
async function readSheet(id,sheet,query){
 const url='https://docs.google.com/spreadsheets/d/'+id+'/gviz/tq?tqx=out:csv&headers=1&sheet='+encodeURIComponent(sheet)+(query?'&tq='+encodeURIComponent(query):'');
 const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw error(sheet+' is unavailable. Check the Google Sheet connection.');
 const text=await response.text();if(text.length>15000000)throw error(sheet+' is too large to load.');return text;
}
async function loadReport(force=false){
 if(cached&&Date.now()-cached.time<(force?10000:120000))return cached.report;
 if(pending)return pending;
 pending=(async()=>{
  const data=await Promise.all([
   readSheet(CM_SHEET,'INPUT ISSUED'),readSheet(CM_SHEET,'INPUT USED'),readSheet(CM_SHEET,'INPUT AVAILABLE'),
   readSheet(SALES_SHEET,'PREVIOUS MONTHS','select W,X,Y,P,Q,A'),readSheet(SALES_SHEET,'CURRENT MONTH','select W,X,Y,P,Q,A')]);
  const report=buildReport({issued:data[0],used:data[1],available:data[2],dealers:data.slice(3)});
  cached={time:Date.now(),report};return report;
 })();
 try{return await pending;}finally{pending=null;}
}
module.exports={buildReport,loadReport,csv,cents};
