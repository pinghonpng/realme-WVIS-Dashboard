// A failed archive read must not silently replace a saved payout with live data.
(()=>{
 const endpoint='/api/gateway?op=incentive-locks',archives=new Map(),pending=new Map(),overrides=new Map();
 let index=null,indexError='',saving=false,refreshing=false;
 const notify=()=>window.evisPromoterIncentives?.render();
 const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');
 async function request(url,options={}){const r=await fetch(url,{cache:'no-store',...options}),data=await r.json();if(!r.ok)throw new Error(data.error||'Could not load incentive archive.');return data;}
 async function refresh(){if(refreshing)return;refreshing=true;window.evisRefresh?.mark('incentive-locks');indexError='';try{index=(await request(endpoint)).months;}catch(e){index=null;indexError=e.message;}finally{refreshing=false;notify();}}
 function state(month){
  if(index===null)return {blocked:true,message:indexError||'Checking locked computations…'};
  if(!index.includes(month))return {locked:false,roster:overrides.get(month)};
  if(archives.has(month))return {locked:true,archive:archives.get(month),report:incentiveReportRestore(archives.get(month).report)};
  if(!pending.has(month))pending.set(month,request(endpoint+'&month='+encodeURIComponent(month)).then(a=>archives.set(month,a)).catch(e=>pending.set(month,e)).finally(notify));
  const error=pending.get(month);return {blocked:true,message:error instanceof Error?'Locked month unavailable: '+error.message:'Loading locked computation…'};
 }
 function inputs(month,all,roster,label){
  const source=window.evisIncentiveSources?.();if(!source?.ready)throw new Error('Wait until sales and model scores finish refreshing successfully.');
  if(!roster?.entries?.length)throw new Error('An active roster is required before locking.');
  const sales=all.filter(r=>r._date&&!isNaN(r._date)&&modelMonthKey(r._date)<=month).map(r=>{
   const row={_date:modelMonthKey(r._date)+'-'+String(r._date.getDate()).padStart(2,'0'),_qty:r._qty};
   for(const key of ['_ps','_model','_modelCode','_sid','_store','_area','_asm','_customer'])row[key]=normalize(r[key]);
   for(const [key,names] of [['PS Name',['PS Name','Promoter Name']],['SR Role',['SR Role']],['SR Hire Date',['SR Hire Date','Hire Date']],['Store Type',['Store Type']]])row[key]=normalize(find(r,...names));return row;
  });
  return {month,sales,catalog:[...scoreCatalog.values()],roster:{entries:roster.entries},rosterLabel:label,source};
 }
 function panel(host,month,status,report,all){
  host.replaceChildren();host.className='pi-lock-panel';
  const title=document.createElement('strong'),note=document.createElement('p');host.append(title,note);
  if(status.blocked){title.textContent=status.message;const retry=document.createElement('button');retry.className='secondary-btn';retry.textContent='Retry archive';retry.onclick=()=>{pending.clear();refresh();};host.append(retry);return;}
  if(status.locked){const a=status.archive;title.textContent=monthName(month)+' · Locked';note.textContent='Saved '+new Date(a.lockedAt).toLocaleString()+' · '+a.rosterLabel+' ('+a.rosterCount+' active in roster). All monthly sellers, including resigned promoters, are preserved. Scores, rules, assignments and model breakdowns use this saved computation.';return;}
  title.textContent=monthName(month)+' · Not locked';
  const override=overrides.get(month);note.textContent=override?'Reviewing '+override.label+' · '+override.roster.entries.length+' active in roster. All monthly promoter sales, including sellers absent from the roster, are included.':'This month uses the current sales, scores and active roster.';
  if(window.dashboardAccount?.role!=='admin'||!PROMOTER_INCENTIVE_POLICIES[month])return;
  const current=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit'}).formatToParts(new Date()),part=t=>current.find(p=>p.type===t).value;if(month>=part('year')+'-'+part('month'))return;
  const label=document.createElement('label');label.textContent='Use saved active roster (CSV) ';const file=document.createElement('input');file.type='file';file.accept='.csv';file.setAttribute('aria-label','Saved active roster for incentive lock');file.disabled=saving;label.append(file);host.append(label);
  file.onchange=async()=>{const f=file.files[0];if(!f)return;try{const roster=rosterParse(parseCSV(await f.text()));overrides.set(month,{roster,label:f.name});notify();}catch(e){note.textContent=e.message;}};
  const button=document.createElement('button');button.className='secondary-btn';button.textContent=saving?'Saving locked computation…':'Lock reviewed month';button.disabled=saving||!window.evisIncentiveSources?.().ready||!override||promoterIncentiveTotals(report.people).pending>0;host.append(button);
  button.onclick=async()=>{if(saving)return;saving=true;button.disabled=true;file.disabled=true;note.textContent='Saving and verifying the full month…';try{
   const input=inputs(month,all,override.roster,override.label),frozen=incentiveReportJSON(incentiveArchiveReport(input));input.expectedReportHash=await hash(frozen);
   // Never save a different result from the one just reviewed in the table.
   const reviewed=incentiveReportJSON(report);delete reviewed.cutoff;const checked={...frozen};delete checked.cutoff;
   if(await hash(reviewed)!==await hash(checked))throw new Error('The source changed during review. Review the refreshed computation and try again.');
   const body=await new Response(new Blob([JSON.stringify(input)]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
   if(body.size>4000000)throw new Error('Archive is too large to save.');
   const saved=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/gzip'},body});archives.set(month,saved);index=[...new Set([...index,month])];overrides.delete(month);saving=false;notify();
  }catch(e){saving=false;button.disabled=false;file.disabled=false;note.textContent=e.message;}};
 }
 window.evisIncentiveLocks={state,panel,months:()=>index||[],refresh};
 window.evisRefresh?.register('incentive-locks',refresh);
 $('refreshBtn').addEventListener('click',refresh);refresh();
})();
