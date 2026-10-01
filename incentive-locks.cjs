// Private, immutable monthly incentive archives. Never exposed as public assets.
const {gzipSync,gunzipSync}=require('node:zlib');
const {createHash}=require('node:crypto');
const {PROMOTER_INCENTIVE_POLICIES,incentiveArchiveReport,incentiveReportJSON,promoterIncentiveTotals}=require('./incentive-core.js');
const BUCKET='wvis-incentive-locks',SB='https://fuvlhwoauzvgrbakihsj.supabase.co';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validMonth=m=>typeof m==='string'&&/^20\d\d-(0[1-9]|1[012])$/.test(m);
async function request(route,options={}){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)fail(503,'Archive storage is not configured.');
 return fetch(SB+route,{...options,headers:{apikey:key,Authorization:'Bearer '+key,...options.headers},signal:AbortSignal.timeout(25000)});
}
async function bucket(create=false){
 let r=await request('/storage/v1/bucket/'+BUCKET);
 if(!r.ok){const e=await r.json().catch(()=>({}));if(!(r.status===404||e.message==='Bucket not found'))fail(502,'Could not check archive storage.');if(!create)return false;
  const made=await request('/storage/v1/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:BUCKET,name:BUCKET,public:false})});
  if(!made.ok){const e=await made.json().catch(()=>({}));if(!/already exists|Duplicate/i.test(e.message||e.error||''))fail(502,'Could not create private archive storage.');}
  r=await request('/storage/v1/bucket/'+BUCKET);if(!r.ok)fail(502,'Could not verify archive storage.');
 }
 const b=await r.json();if(b.public!==false)fail(503,'Incentive archives require private storage.');return true;
}
async function listLocks(){
 if(!await bucket())return {months:[]};const months=[];
 for(let offset=0;offset<1200;offset+=100){const r=await request('/storage/v1/object/list/'+BUCKET,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:'',limit:100,offset,sortBy:{column:'name',order:'desc'}})});if(!r.ok)fail(502,'Could not list locked months.');const items=await r.json();for(const f of items)if(/^20\d\d-(0[1-9]|1[012])\.json\.gz$/.test(f.name))months.push(f.name.slice(0,7));if(items.length<100)break;}
 return {months:months.sort().reverse()};
}
function publicView(archive){return {schema:archive.schema,month:archive.month,lockedAt:archive.lockedAt,lockedBy:archive.lockedBy,hash:archive.hash,source:archive.inputs.source,rosterLabel:archive.inputs.rosterLabel,rosterCount:archive.inputs.roster.entries.length,report:archive.report,totals:archive.totals};}
async function readLock(month){
 if(!validMonth(month))fail(400,'Invalid archive month.');if(!await bucket())fail(404,'This month is not locked.');
 const r=await request('/storage/v1/object/authenticated/'+BUCKET+'/'+month+'.json.gz');if(!r.ok){if(r.status===404||r.status===400)fail(404,'This month is not locked.');fail(502,'Could not load locked computation.');}
 let a;try{a=JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer()),{maxOutputLength:64000000}));}catch{fail(502,'Locked computation failed validation.');}
 if(a.schema!==1||a.month!==month||hash({inputs:a.inputs,report:a.report})!==a.hash)fail(502,'Locked computation failed validation.');return publicView(a);
}
function validateInput(input,now=new Date()){
 if(!input||!validMonth(input.month)||!PROMOTER_INCENTIVE_POLICIES[input.month])fail(400,'This month needs its own approved incentive scheme.');
 const currentMonth=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit'}).formatToParts(now),part=t=>currentMonth.find(p=>p.type===t).value;
 if(input.month>=part('year')+'-'+part('month'))fail(400,'Only completed months can be locked.');
 if(!Array.isArray(input.sales)||!input.sales.length||input.sales.length>250000||!Array.isArray(input.catalog)||!input.catalog.length||input.catalog.length>10000||!Array.isArray(input.roster?.entries)||!input.roster.entries.length||input.roster.entries.length>10000)fail(400,'Complete sales, scores and an active roster are required.');
 const text=(v,max=1000)=>typeof v==='string'&&v.length<=max;
 for(const r of input.sales){if(!r||!/^\d{4}-\d{2}-\d{2}$/.test(r._date)||new Date(r._date+'T12:00:00Z').toISOString().slice(0,10)!==r._date||r._date.slice(0,7)>input.month||!Number.isFinite(r._qty)||Math.abs(r._qty)>100000||!text(r._model)||!text(r._modelCode))fail(400,'Invalid archive sales rows.');
  for(const key of ['_ps','_sid','_store','_area','_asm','_customer','PS Name','SR Role','SR Hire Date','Store Type'])if(!text(r[key]))fail(400,'Invalid archive sales details.');}
 const models=new Set();for(const m of input.catalog){const key=String(m?.model||'').trim().replace(/\s+/g,' ').toLowerCase();if(!key||!text(m.model)||!text(m.series)||!m.series||m.points!==null&&(!Number.isFinite(m.points)||m.points<0)||models.has(key))fail(400,'Invalid model catalog.');models.add(key);}
 const people=new Set();for(const e of input.roster.entries){if(!e?.key||people.has(e.key))fail(400,'Invalid or duplicate roster identity.');for(const key of ['id','key','name','area','asm','store','storeType','sid','customer'])if(!text(e[key]))fail(400,'Invalid roster entries.');people.add(e.key);}
 if(!text(input.rosterLabel,300)||!input.rosterLabel||!Number.isInteger(input.source?.version)||!text(input.source?.salesVersion,100)||!/^\w{64}$/.test(input.source?.scores?.sha256||''))fail(400,'Source version details are required.');
 const report=incentiveReportJSON(incentiveArchiveReport(input)),totals=promoterIncentiveTotals(report.people);
 if(!report.people.length||totals.pending||totals.statusUnknown||report.unassigned||!Number.isFinite(totals.total))fail(400,'Resolve incomplete promoter computations before locking.');
 if(hash(report)!==input.expectedReportHash)fail(409,'The computation changed. Review the month again before locking.');
 return {report,totals};
}
async function createLock(req,user){
 if(user.role!=='admin')fail(403,'Administrator access required.');
 let raw=req.body;if(!Buffer.isBuffer(raw)){const parts=[];let n=0;for await(const part of req){n+=part.length;if(n>4000000)fail(413,'Archive request too large.');parts.push(part);}raw=Buffer.concat(parts);}if(raw.length>4000000)fail(413,'Archive request too large.');
 let input;try{input=JSON.parse(gunzipSync(raw,{maxOutputLength:64000000}));}catch{fail(400,'Invalid compressed archive.');}
 const {report,totals}=validateInput(input);
 // A newer monthly score publication must never be silently locked under an older review.
 const mr=await request('/rest/v1/evis_dataset?id=eq.1&select=version,files');if(!mr.ok)fail(502,'Could not verify score version.');const manifest=(await mr.json())[0];
 if(manifest?.version!==input.source.version||manifest?.files?.scores?.sha256!==input.source.scores.sha256)fail(409,'The model score file changed. Reload and review before locking.');
 const inputs={month:input.month,sales:input.sales,catalog:input.catalog,roster:input.roster,rosterLabel:input.rosterLabel,source:input.source};
 const archive={schema:1,month:input.month,lockedAt:new Date().toISOString(),lockedBy:user.username,inputs,report,totals,hash:hash({inputs,report})};
 await bucket(true);
 const r=await request('/storage/v1/object/'+BUCKET+'/'+input.month+'.json.gz',{method:'POST',headers:{'Content-Type':'application/gzip','x-upsert':'false'},body:gzipSync(JSON.stringify(archive))});
 if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===409||/duplicate|already exists/i.test(e.message||e.error||''))fail(409,'This month is already locked. Reload to view the saved computation.');fail(502,'Could not save the locked computation.');}
 const saved=await readLock(input.month);if(saved.hash!==archive.hash)fail(502,'The archive could not be verified after saving.');return saved;
}
module.exports={listLocks,readLock,createLock,validateInput,hash};
