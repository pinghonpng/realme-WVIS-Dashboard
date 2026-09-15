// Shared sales and model-score data for all dashboard viewers.
(()=>{
const config={url:'https://fuvlhwoauzvgrbakihsj.supabase.co',publishableKey:'sb_publishable_Il7KA51StVzo-C3i0to6-Q_0iJY4vXt'};
const origin=new URL(config.url).origin,slots=['fixed','current','scores'];
let manifest=null,session=null,admin=false,busy=false,loading=false;
const cache=new Map();
const say=message=>{$('sharedStatus').textContent=message;};
async function request(path,options={}){
 const response=await fetch(origin+path,{...options,cache:'no-store',headers:{apikey:config.publishableKey,...(session?{Authorization:'Bearer '+session.access_token}:{}),...options.headers}});
 if(!response.ok){let error;try{error=await response.json()}catch{};throw new Error(error?.message||error?.error_description||'Shared data request failed ('+response.status+').');}
 return response.status===204?null:response.json();
}
function canonicalSales(file){
 if(!file)return null;
 const headers=['Date','Store ID','Store Name','Model','Qty','Area','ASM','Customer','Channel','PS ID','PS Name','Sales Amount'];
 const aliases=[['Date','Sales Date','Sellout Date','Transaction Date'],['Store ID','StoreID','store_id','Store Code','Outlet ID'],['Store Name','Store','Outlet','Shop'],['Model','SKU','Product','Model Name'],['Qty','Quantity','Sales','Units','Sellout Qty','Sales Qty'],['Area','Province','Territory'],['ASM','Manager','Sales Manager'],['Customer','Account','Dealer','Client'],['Channel','Store Type','Channel Type'],['PS ID','Promoter ID','Frontliner ID','PS','Promoter'],['PS Name','Promoter Name','Frontliner Name'],['Sales Amount','Sales Value','Amount']];
 const rows=[];
 for(const source of file.rows){
  if(!normalize(find(source,'Date','Sales Date','Sellout Date','Transaction Date','Store ID','Store Code','Store Name','Model','Qty')))continue;
  const row=Object.fromEntries(headers.map((h,i)=>[h,normalize(find(source,...aliases[i]))]));
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
 ['fixedFile','currentFile','scoreFile','clearFixedBtn','clearCurrentBtn','sharedMigrate'].forEach(id=>{if($(id))$(id).disabled=!admin||busy;});
 $('sharedLogin').hidden=admin;$('sharedLogout').hidden=!admin;$('sharedAdmin').textContent=admin?'Administrator: lucasngrealme@gmail.com':'Viewer · shared data';
 const needsAmounts=['fixed','current'].some(slot=>state.uploads[slot]?.rows.some(r=>normalize(r['Sales Amount'])===''));
 $('sharedMigrate').hidden=!admin||(manifest?.version!==0&&!needsAmounts);
 $('sharedMigrate').textContent=manifest?.version===0?'Publish this browser’s saved files':'Restore sales amounts from this browser’s saved files';
}
function installFiles(files,next){
 files={...files};for(const slot of ['fixed','current']){const f=files[slot];if(f&&!f.headers.includes('Sales Amount'))files[slot]={...f,headers:[...f.headers,'Sales Amount'],rows:f.rows.map(r=>({...r,'Sales Amount':''}))};}
 validateFiles(files);
 const nextCatalog=files.scores?validateScoreRows(files.scores.rows):new Map();
 state.uploads={fixed:files.fixed||null,current:files.current||null};scoreFile=files.scores||null;scoreCatalog=nextCatalog;
 state.raw=synthesizeReferences({...baseRaw(),sales:combinedUploads()});state.live=true;
 manifest=next;buildFilters();render();renderUploadUI();renderScoreFile();
 if(!state.raw.sales.length)$('periodLabel').textContent='Waiting for shared sales data';
 $('connectionDot').classList.add('live');$('connectionText').textContent='Shared sales data';
 const updated=next.updated_at?new Date(next.updated_at).toLocaleString():'Not published yet';
 $('sharedVersion').textContent='Data version '+next.version+' · Updated '+updated;$('sharedBadge').textContent=$('sharedVersion').textContent;$('lastUpdated').textContent=updated;
 say(next.version?'Everyone is viewing this published version. PS targets remain personal to this browser.':'No shared data published yet. An administrator needs to upload the first dataset.');
 controls();
}
async function sync(){
 if(loading||busy)return;loading=true;
 try{
  const data=await request('/rest/v1/evis_dataset?id=eq.1&select=version,updated_at,files');const next=data?.[0];if(!next)throw new Error('Shared data storage has not been initialized.');
  if(manifest?.version===next.version){say('Shared data is up to date.');return;}
  const files=Object.fromEntries(await Promise.all(slots.map(async slot=>[slot,await download(next.files[slot])])));
  installFiles(files,next);clearError();
 }catch(error){say((manifest?'Showing last loaded version. Update check failed: ':'Shared data unavailable: ')+error.message);if(!manifest){state.uploads={fixed:null,current:null};state.raw=baseRaw();scoreFile=null;scoreCatalog=new Map();buildFilters();render();renderUploadUI();renderScoreFile();$('connectionText').textContent='Shared data unavailable';}showError(error.message);}
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
 if(!admin)throw new Error('Administrator sign-in is required to publish data.');if(busy||loading)throw new Error('Please wait for the current update to finish.');if(!manifest)throw new Error('Load shared data before publishing.');
 busy=true;controls();say('Validating and publishing shared data…');
 try{
  const files={fixed:state.uploads.fixed,current:state.uploads.current,scores:scoreFile,...changes};validateFiles(files);
  const descriptors={};for(const [slot,file] of Object.entries(changes))descriptors[slot]=file?await uploadBlob(file):null;
  const next=await request('/rest/v1/rpc/evis_publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_version:manifest.version,changes:descriptors})});
  for(const [slot,meta] of Object.entries(descriptors))if(meta)cache.set(meta.path,changes[slot]);
  installFiles(files,next);toast('Shared data published · version '+next.version);
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
panel.innerHTML='<h2>Shared Dashboard Data</h2><p id="sharedVersion">Connecting to shared data…</p><p id="sharedStatus" role="status"></p><p id="sharedAdmin"></p><form id="sharedLogin"><label for="sharedPassword">Administrator password · lucasngrealme@gmail.com</label><input id="sharedPassword" type="password" autocomplete="current-password" required><button class="secondary-btn" type="submit">Administrator sign-in</button></form><button class="secondary-btn" id="sharedLogout" hidden>Sign out</button><button class="secondary-btn" id="sharedMigrate" hidden>Publish this browser’s saved files</button><p class="score-note">Sales and model-score updates are shared. Viewers need no sign-in. Only administrators can upload or remove shared files. PS target edits apply only to your own browser.</p>';
$('dataSection').prepend(panel);
document.querySelectorAll('#dataSection .source-summary strong').forEach(el=>{if(el.textContent==='Browser')el.textContent='Shared cloud';});
document.querySelectorAll('#dataSection .score-note').forEach(el=>{if(el.textContent.startsWith('Saved in this browser.'))el.textContent=el.textContent.replace('Saved in this browser.','Published for all viewers.');});
const badge=document.createElement('p');badge.id='sharedBadge';badge.className='score-note';badge.textContent='Shared dataset · see Data Sources for version and update time';document.querySelector('.topbar').after(badge);
$('sharedLogin').addEventListener('submit',login);
$('sharedLogout').addEventListener('click',async()=>{try{await request('/auth/v1/logout',{method:'POST'})}catch{}session=null;admin=false;controls();say('Signed out. Viewing shared data.');});
function restoreAmounts(published,saved){
 if(!published)return null;
 if(!saved)throw new Error('The original sales file is not saved in this browser. Upload the source files again.');
 const source=canonicalSales(saved),keys=source.headers.filter(k=>k!=='Sales Amount');
 if(source.rows.length!==published.rows.length||source.rows.some((r,i)=>keys.some(k=>normalize(r[k])!==normalize(published.rows[i][k]))))throw new Error('Saved sales differ from the published data. Upload the latest source files instead.');
 return {...published,headers:source.headers,rows:published.rows.map((r,i)=>({...r,'Sales Amount':normalize(r['Sales Amount'])!==''?r['Sales Amount']:source.rows[i]['Sales Amount']}))};
}
$('sharedMigrate').addEventListener('click',async()=>{try{
 say('Reading and validating saved sales files…');
 const [fixed,current,scores]=await Promise.all([idbGet('fixed'),idbGet('current'),idbGet('modelScores')]);
 if(!fixed&&!current)throw new Error('No saved sales files in this browser. Upload the sales files instead.');
 if(manifest?.version===0)await publish({fixed:canonicalSales(fixed),current:canonicalSales(current),scores:canonicalScores(scores)});
 else await publish({fixed:restoreAmounts(state.uploads.fixed,fixed),current:restoreAmounts(state.uploads.current,current)});
}catch(error){say(error.message);}});
handleUpload=async(kind,file)=>{if(!file)return;try{await publish({[kind]:canonicalSales(await parseSalesFile(file))});}catch(error){showError(error.message);toast(error.message,true);}finally{$(kind==='fixed'?'fixedFile':'currentFile').value='';}};
uploadScores=async(file)=>{if(!file)return;try{await publish({scores:canonicalScores(await parseSalesFile(file))});$('scoreError').textContent='';}catch(error){$('scoreError').textContent=error.message;}finally{$('scoreFile').value='';}};
clearUpload=async(kind)=>{try{await publish({[kind]:null});}catch(error){showError(error.message);}};
restoreUploads=async()=>{await sync();return true;};refresh=sync;
const previousScoreFile=renderScoreFile;renderScoreFile=()=>{previousScoreFile();controls();};
setInterval(()=>{if(document.visibilityState==='visible')sync();},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();});
controls();
})();
