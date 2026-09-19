// Shared sales and model-score data for all dashboard viewers.
(()=>{
const config={url:'https://fuvlhwoauzvgrbakihsj.supabase.co',publishableKey:'sb_publishable_Il7KA51StVzo-C3i0to6-Q_0iJY4vXt'};
const origin=new URL(config.url).origin,slots=['fixed','current','scores'];
let manifest=null,session=null,admin=false,busy=false,loading=false,hireDatesMissing=false;
const cache=new Map();
const salesSheet={id:'1AaSTsNKEO0olJ1UxCwtSLpktkSMKvfiDERlBLhWFDkc',tabs:{fixed:'PREVIOUS MONTHS',current:'CURRENT MONTH'}};
let sheetSnapshot=null,sheetFailure='',sheetChecked=null,installedVersion='';
const sheetCacheKey='googleSales:'+salesSheet.id;
const say=message=>{$('sharedStatus').textContent=message;};
async function request(path,options={}){
 const response=await fetch(origin+path,{...options,cache:'no-store',headers:{apikey:config.publishableKey,...(session?{Authorization:'Bearer '+session.access_token}:{}),...options.headers}});
 if(!response.ok){let error;try{error=await response.json()}catch{};throw new Error(error?.message||error?.error_description||'Shared data request failed ('+response.status+').');}
 return response.status===204?null:response.json();
}
function canonicalSales(file){
 if(!file)return null;
 const headers=['Date','Store ID','Store Name','Model','Qty','Area','ASM','Customer','Channel','PS ID','PS Name','Sales Amount','SR Hire Date','Customer Type','SR Role'];
 const aliases=[['Date','Sales Date','Sellout Date','Transaction Date'],['Store ID','StoreID','store_id','Store Code','Outlet ID'],['Store Name','Store','Outlet','Shop'],['Model','SKU','Product','Model Name'],['Qty','Quantity','Sales','Units','Sellout Qty','Sales Qty'],['Area','Province','Territory'],['ASM','Manager','Sales Manager'],['Customer','Account','Dealer','Client'],['Channel','Store Type','Channel Type'],['PS ID','Promoter ID','Frontliner ID','PS','Promoter'],['PS Name','Promoter Name','Frontliner Name'],['Sales Amount','Sales Value','Amount'],['SR Hire Date','Hire Date'],['Customer Type'],['SR Role']];
 const sourceKeys=file.headers||Object.keys(file.rows[0]||{}),lookup=Object.fromEntries(sourceKeys.filter(Boolean).map(k=>[k,k]));
 const columns=aliases.map(names=>find(lookup,...names));
 const rows=[];
 for(const source of file.rows){
  const row=Object.fromEntries(headers.map((h,i)=>[h,normalize(source[columns[i]])]));
  if(!['Date','Store ID','Store Name','Model','Qty'].some(k=>row[k]))continue;
  const date=parseDate(row.Date),quantity=Number(row.Qty.replace(/,/g,''));
  if(isNaN(date)||!row.Model||row.Qty===''||!Number.isFinite(quantity))throw new Error('A sales row is missing a valid date, model or quantity. Correct the file before publishing.');
  if(row['Sales Amount']!==''){const amount=Number(row['Sales Amount'].replace(/(?:PHP|₱|,|\s)/gi,''));if(!Number.isFinite(amount))throw new Error('A sales row contains an invalid Sales Amount. Correct the file before publishing.');row['Sales Amount']=String(amount);}
  row.Date=modelMonthKey(date)+'-'+String(date.getDate()).padStart(2,'0');row.Qty=String(quantity);rows.push(row);
 }
 if(!rows.length)throw new Error('No valid sales rows found.');
 return {name:file.name,uploadedAt:file.uploadedAt,size:file.size,headers,rows};
}
function canonicalScores(file){if(!file)return null;const catalog=validateScoreRows(file.rows);return {name:file.name,size:file.size,uploadedAt:file.uploadedAt,headers:['Model','Series','Points per Unit'],rows:[...catalog.values()].map(r=>({Model:r.model,Series:r.series,'Points per Unit':r.points}))};}
function validateFiles(files){
 for(const slot of slots){const file=files[slot];if(file!==null&&file!==undefined&&(!Array.isArray(file.rows)||file.rows.length>250000||typeof file.name!=='string'))throw new Error('Invalid shared file.');}
 if(files.scores)validateScoreRows(files.scores.rows);
 if(files.fixed&&files.current&&!sameHeaders(files.fixed.headers,files.current.headers))throw new Error('Shared sales headers do not match.');
}
async function digest(buffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function download(meta){
 if(!meta)return null;if(cache.has(meta.path))return cache.get(meta.path);
 if(!/^[0-9a-f-]{36}\.json\.gz$/.test(meta.path))throw new Error('Invalid shared file path.');
 const response=await fetch(origin+'/storage/v1/object/public/evis-shared/'+meta.path);if(!response.ok)throw new Error('Could not download the published file.');
 const compressed=await response.arrayBuffer();if(await digest(compressed)!==meta.sha256)throw new Error('Shared file verification failed.');
 const text=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
 const file=JSON.parse(text);cache.set(meta.path,file);return file;
}
function controls(){
 window.evisRoster?.setAdmin(admin&&!busy);window.evisPriceRanges?.setAdmin(admin&&!busy);
 ['fixedFile','currentFile','scoreFile','clearFixedBtn','clearCurrentBtn'].forEach(id=>{if($(id))$(id).disabled=!admin||busy;});
 $('sharedLogin').hidden=admin;$('sharedLogout').hidden=!admin;$('sharedAdmin').textContent=admin?'Administrator: lucasngrealme@gmail.com':'Viewer · shared data';
 ['fixedFile','currentFile','clearFixedBtn','clearCurrentBtn'].forEach(id=>{if($(id))$(id).disabled=true;});
}
function installFiles(files,next){
 files={...files};hireDatesMissing=['fixed','current'].some(slot=>files[slot]&&!files[slot].headers.includes('SR Hire Date'));for(const slot of ['fixed','current']){let f=files[slot];for(const key of ['Sales Amount','SR Hire Date','Customer Type','SR Role'])if(f&&!f.headers.includes(key))f={...f,headers:[...f.headers,key],rows:f.rows.map(r=>({...r,[key]:''}))};files[slot]=f;}
 validateFiles(files);
 const nextCatalog=files.scores?validateScoreRows(files.scores.rows):new Map();
 state.uploads={fixed:files.fixed||null,current:files.current||null};scoreFile=files.scores||null;scoreCatalog=nextCatalog;
 state.raw=synthesizeReferences({...baseRaw(),sales:combinedUploads()});state.live=true;
 manifest=next;window.evisRoster?.setConfig(next.files.activePromoters);window.evisPriceRanges?.setConfig(next.files.priceRanges);buildFilters();render();renderUploadUI();renderScoreFile();
 const missingTypes=state.raw.sales.filter(r=>!normalize(r['Customer Type'])).length;let typeNotice=$('customerTypeNotice');if(!typeNotice){typeNotice=document.createElement('p');typeNotice.id='customerTypeNotice';typeNotice.className='score-note';$('dataSection').prepend(typeNotice);}typeNotice.textContent=missingTypes?fmt(missingTypes)+' sales rows have no Column Y Customer Type. Re-upload the original raw sales files to classify these rows; they currently show Unclassified in Channel.':'';
 if(!state.raw.sales.length)$('periodLabel').textContent='Waiting for shared sales data';
 $('connectionDot').classList.add('live');$('connectionText').textContent='Shared sales data';
 const updated=next.updated_at?new Date(next.updated_at).toLocaleString():'Not published yet';
 $('sharedVersion').textContent='Data version '+next.version+' · Updated '+updated;$('sharedBadge').textContent=$('sharedVersion').textContent;$('lastUpdated').textContent=updated;
 say(next.version?'Everyone is viewing this published version. PS targets remain personal to this browser.':'No shared data published yet. An administrator needs to upload the first dataset.');
 controls();
}
function googleSalesFile(text,tab){
 if(/^\s*</.test(text))throw new Error(tab+': Google returned a sign-in page. Check public sharing.');
 const rows=parseCSV(text),headers=headersOf(rows),lookup=Object.fromEntries(headers.map(h=>[h,h]));
 for(const key of ['Date','Store Name','Store Code','Model','Qty','Sales Amount','SR Role','PS ID','PS Name','Area','ASM','Customer','Customer Type','SR Hire Date']){
  const aliases=key==='Store Code'?['Store Code','Store ID']: [key];
  if(!find(lookup,...aliases))throw new Error(tab+': missing '+key+' header. Keep the original header row.');
 }
 return canonicalSales({name:tab+' · Google Sheets',headers,rows,size:new TextEncoder().encode(text).length});
}
function validateGooglePeriods(files){
 const currentMonths=new Set(files.current.rows.map(r=>r.Date.slice(0,7)));
 if(currentMonths.size!==1)throw new Error('CURRENT MONTH must contain one month only.');
 const month=[...currentMonths][0];
 if(files.fixed.rows.some(r=>r.Date.slice(0,7)>=month))throw new Error('PREVIOUS MONTHS overlaps CURRENT MONTH or contains later dates. Move completed months to PREVIOUS MONTHS without duplicating them.');
}
async function readGoogleSales(){
 const entries=await Promise.all(Object.entries(salesSheet.tabs).map(async([slot,tab])=>{
  const url='https://docs.google.com/spreadsheets/d/'+salesSheet.id+'/gviz/tq?tqx=out:csv&headers=1&tq=select%20*&sheet='+encodeURIComponent(tab);
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error(tab+': could not read the public sheet ('+response.status+').');
  const text=await response.text(),hash=await digest(new TextEncoder().encode(text).buffer);return [slot,{hash,file:sheetSnapshot?.hashes?.[slot]===hash?sheetSnapshot.files[slot]:googleSalesFile(text,tab)}];
 }));
 const sources=Object.fromEntries(entries),files={fixed:sources.fixed.file,current:sources.current.file};validateGooglePeriods(files);
 const hashes={fixed:sources.fixed.hash,current:sources.current.hash};
 const version=await digest(new TextEncoder().encode(JSON.stringify(hashes)).buffer),checkedAt=new Date().toISOString();
 return {files,hashes,version,checkedAt};
}
function salesSourceStatus(){
 const fallback=!sheetSnapshot,version=sheetSnapshot?.version?.slice(0,10),checked=sheetChecked?new Date(sheetChecked).toLocaleString():'Not checked yet';
 const label=fallback?'Google Sheets sales unavailable':'Google Sheets sales · '+version;
 $('sharedBadge').textContent=label+' · Last checked '+checked;
 $('sharedVersion').textContent='Model scores / settings version '+(manifest?.version??'—');
 $('lastUpdated').textContent=sheetSnapshot?'Checked '+checked:'—';$('connectionText').textContent=fallback?'Google Sheets unavailable':'Google Sheets sales';
 $('googleSalesStatus').textContent=sheetFailure?(fallback?'No Google Sheet sales loaded. ':'Keeping the last successfully loaded sheet data. ')+sheetFailure:'Connected · checks every 60 seconds while this dashboard is visible.';
 say(sheetFailure?$('googleSalesStatus').textContent:'Sales come from the linked Google Sheet. Model scores and settings are shared.');
}
async function sync(){
 if(loading||busy)return;loading=true;
 try{
  const data=await request('/rest/v1/evis_dataset?id=eq.1&select=version,updated_at,files');const next=data?.[0];if(!next)throw new Error('Shared data storage has not been initialized.');
  try{
   const candidate=await readGoogleSales();sheetChecked=candidate.checkedAt;sheetFailure='';
   if(candidate.version!==sheetSnapshot?.version){sheetSnapshot=candidate;try{await idbSet(sheetCacheKey,candidate);}catch{}}
  }catch(error){sheetFailure=error.message;sheetChecked=new Date().toISOString();if(!sheetSnapshot){try{sheetSnapshot=await idbGet(sheetCacheKey);if(sheetSnapshot){validateFiles(sheetSnapshot.files);validateGooglePeriods(sheetSnapshot.files);}}catch{sheetSnapshot=null;}}}
  if(!sheetSnapshot)throw new Error(sheetFailure||'Google Sheet sales are unavailable.');
  const sales=sheetSnapshot.files;
  const files={...sales,scores:await download(next.files.scores)},version=next.version+':'+(sheetSnapshot?.version||'backup');
  if(version!==installedVersion){installFiles(files,next);installedVersion=version;}
  clearError();salesSourceStatus();
 }catch(error){sheetFailure=error.message;if(manifest)salesSourceStatus();else{say('Could not load dashboard data: '+error.message);$('connectionText').textContent='Data unavailable';$('googleSalesStatus').textContent='Could not load Google Sheet sales. '+error.message;}showError(error.message);}
 finally{loading=false;controls();}
}
async function uploadBlob(file){
 const blob=await new Response(new Blob([JSON.stringify(file)]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
 if(blob.size>50*1024*1024)throw new Error('The compressed file is too large.');
 const path=crypto.randomUUID()+'.json.gz';
 await request('/storage/v1/object/evis-shared/'+path,{method:'POST',headers:{'Content-Type':'application/gzip','x-upsert':'false'},body:blob});
 return {path,sha256:await digest(await blob.arrayBuffer()),name:file.name,rows:file.rows.length};
}
async function publish(changes){
 if(Object.hasOwn(changes,'fixed')||Object.hasOwn(changes,'current'))throw new Error('Edit sales in the linked Google Sheet.');
 if(!admin)throw new Error('Administrator sign-in is required to publish data.');if(busy||loading)throw new Error('Please wait for the current update to finish.');if(!manifest)throw new Error('Load shared data before publishing.');
 busy=true;controls();say('Validating and publishing shared data…');
 try{
  const files={fixed:state.uploads.fixed,current:state.uploads.current,scores:scoreFile,...changes};validateFiles(files);
  const descriptors={};for(const [slot,file] of Object.entries(changes))descriptors[slot]=file?await uploadBlob(file):null;
  const next=await request('/rest/v1/rpc/evis_publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_version:manifest.version,changes:descriptors})});
  for(const [slot,meta] of Object.entries(descriptors))if(meta)cache.set(meta.path,changes[slot]);
  installFiles(files,next);salesSourceStatus();toast('Shared data published · version '+next.version);
 }catch(error){say('Publish failed. The previous shared version is unchanged. '+error.message);throw error;}
 finally{busy=false;controls();}
}
async function login(event){
 event.preventDefault();const password=$('sharedPassword').value;$('sharedPassword').value='';
 try{
  session=await request('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'lucasngrealme@gmail.com',password})});
  admin=await request('/rest/v1/rpc/evis_is_admin',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  if(!admin){session=null;throw new Error('This account is not configured as a dashboard administrator.');}
  say('Signed in. Uploads now publish to all viewers.');controls();
 }catch(error){admin=false;session=null;controls();say(error.message);}
}
const panel=document.createElement('article');panel.className='card table-card';
panel.innerHTML='<h2>Shared Dashboard Data</h2><p id="sharedVersion">Connecting to shared data…</p><p id="sharedStatus" role="status"></p><p id="sharedAdmin"></p><form id="sharedLogin"><label for="sharedPassword">Administrator password · lucasngrealme@gmail.com</label><input id="sharedPassword" type="password" autocomplete="current-password" required><button class="secondary-btn" type="submit">Administrator sign-in</button></form><button class="secondary-btn" id="sharedLogout" hidden>Sign out</button><p class="score-note">Sales and model-score updates are shared. Viewers need no sign-in. Only administrators can upload or remove shared files. PS target edits apply only to your own browser.</p>';
$('dataSection').prepend(panel);
const sourceStyle=document.createElement('style');sourceStyle.textContent='#dataSection .drop-zone[hidden]{display:none!important}#googleSalesStatus{margin-top:12px}.sales-sheet-controls{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-top:16px}.sales-sheet-controls label{display:flex;flex-direction:column;gap:8px;font-size:13px}.sales-sheet-url{flex:1 1 100%}.sales-sheet-controls input{padding:12px;border:1px solid #d8dce2;border-radius:10px;font:inherit;background:#f8f9fb;min-width:0;width:100%}.sales-sheet-controls .secondary-btn{padding:12px;text-decoration:none}.sales-sheet-controls .sales-sheet-tab{flex:1 1 180px}';document.head.append(sourceStyle);
const salesPanel=document.createElement('article');salesPanel.className='card table-card';salesPanel.innerHTML='<h2>Sales · Google Sheet</h2><div class="sales-sheet-controls"><label class="sales-sheet-url">Public Google Sheet link<input id="salesSheetUrl" aria-label="Sales Google Sheet URL" type="url" readonly value="https://docs.google.com/spreadsheets/d/'+salesSheet.id+'/edit"></label><label class="sales-sheet-tab">Historical tab<input aria-label="Historical sales sheet tab" readonly value="PREVIOUS MONTHS"></label><label class="sales-sheet-tab">Current tab<input aria-label="Current sales sheet tab" readonly value="CURRENT MONTH"></label><a class="secondary-btn" href="https://docs.google.com/spreadsheets/d/'+salesSheet.id+'/edit" target="_blank" rel="noopener">Open sheet</a><button id="salesSheetCheck" class="secondary-btn">Check now</button></div><div id="googleSalesStatus" role="status">Connecting to sales spreadsheet…</div>';$('dataSection').prepend(salesPanel);$('salesSheetCheck').addEventListener('click',sync);
for(const [slot,tab] of Object.entries(salesSheet.tabs)){const input=$(slot==='fixed'?'fixedFile':'currentFile');input.closest('.drop-zone').hidden=true;$(slot==='fixed'?'clearFixedBtn':'clearCurrentBtn').hidden=true;input.closest('article').querySelector('h2').textContent=tab;}
document.querySelector('#dataSection .validation-card h2').textContent='Sales Validation';document.querySelector('#dataSection .source-intro h2').textContent='Linked sales spreadsheet';document.querySelector('#dataSection .source-intro p').textContent='Sales load automatically from PREVIOUS MONTHS and CURRENT MONTH.';

document.querySelectorAll('#dataSection .source-summary strong').forEach(el=>{if(el.textContent==='Browser')el.textContent='Shared cloud';});
document.querySelectorAll('#dataSection .score-note').forEach(el=>{if(el.textContent.startsWith('Saved in this browser.'))el.textContent=el.textContent.replace('Saved in this browser.','Published for all viewers.');});
const badge=document.createElement('p');badge.id='sharedBadge';badge.className='score-note';badge.textContent='Shared dataset · see Data Sources for version and update time';document.querySelector('.topbar').after(badge);
$('sharedLogin').addEventListener('submit',login);
$('sharedLogout').addEventListener('click',async()=>{try{await request('/auth/v1/logout',{method:'POST'})}catch{}session=null;admin=false;controls();say('Signed out. Viewing shared data.');});
handleUpload=async()=>{toast('Edit sales in the linked Google Sheet.',true);};
uploadScores=async(file)=>{if(!file)return;try{await publish({scores:canonicalScores(await parseSalesFile(file))});$('scoreError').textContent='';}catch(error){$('scoreError').textContent=error.message;}finally{$('scoreFile').value='';}};
clearUpload=async()=>{toast('Edit sales in the linked Google Sheet.',true);};
restoreUploads=async()=>{await sync();return true;};refresh=sync;
const previousScoreFile=renderScoreFile;renderScoreFile=()=>{previousScoreFile();controls();};
setInterval(()=>{if(document.visibilityState==='visible')sync();},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();});
window.evisSavePriceRanges=async ranges=>{if(!admin)throw new Error('Administrator sign-in is required.');if(busy||loading||!manifest)throw new Error('Wait for the current update to finish.');busy=true;controls();try{await request('/rest/v1/rpc/evis_set_price_ranges',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ranges,expected_version:manifest.version})});}finally{busy=false;controls();}await sync();if(JSON.stringify(validatePriceRanges(manifest?.files.priceRanges||[]))!==JSON.stringify(ranges))throw new Error('Saved ranges could not be reloaded. Refresh data to verify.');};
window.evisSaveRoster=async next=>{if(!admin)throw new Error('Administrator sign-in is required.');if(busy||loading||!manifest)throw new Error('Wait for the current update to finish.');busy=true;controls();try{await request('/rest/v1/rpc/evis_set_roster',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheet_url:next.url,sheet_tab:next.tab,expected_version:manifest.version})});}finally{busy=false;controls();}await sync();};
controls();
})();

