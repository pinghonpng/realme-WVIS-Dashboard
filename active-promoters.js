// Current employment status comes from the linked HR sheet, not sales activity.
function rosterName(value){return normalize(value).replace(/^\d{5,}\s+/,'').normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase();}
function rosterCode(value){return normalize(value).replace(/\.0$/,'');}
function rosterParse(rows){
 if(!rows.length||!Object.hasOwn(rows[0],'PS NAME')||!Object.hasOwn(rows[0],'STATUS'))throw new Error('The sheet must have PS NAME and STATUS headers. ID NUMBER is optional.');
 const ids=new Set(),names=new Set(),namesWithoutId=new Set(),entries=[],seenKeys=new Set();let count=0;
 rows.forEach(r=>{if(normalize(r.STATUS).toUpperCase()!=='ACTIVE'||!normalize(r['PS NAME']))return;
 const name=rosterName(r['PS NAME']),id=(normalize(r['PS NAME']).match(/^(\d{5,})\s+/)||[])[1]||rosterCode(r['ID NUMBER']);
 const key=id||'name:'+name;if(seenKeys.has(key))return;seenKeys.add(key);
 if(id)ids.add(id);else namesWithoutId.add(name);names.add(name);entries.push({id:id||'',key:id||'name:'+name,name:normalize(r['PS NAME']).replace(/^\d{5,}\s+/,''),area:normalize(r.REGION),asm:normalize(r.SUBREGION),store:normalize(r.STORE),sid:normalize(r['STORE CODE']),customer:normalize(r.DEALER)});count++;
 });
 if(!count)throw new Error('No ACTIVE promoters found. The last verified list is retained.');
 return {ids,names,namesWithoutId,entries,count};
}
function rosterIsActive(roster,id,name){if(!roster)return null;const code=rosterCode(id),key=rosterName(name);if(!code&&!key)return null;return code?(roster.ids.has(code)||roster.namesWithoutId.has(key)):roster.names.has(key);}
function activePerformanceRows(rows,roster,filters,stores){
 if(!roster)return [];
 const matches=(value,selected)=>selected==='ALL'||normalize(value).toLowerCase()===normalize(selected).toLowerCase();
 const entries=roster.entries.filter(e=>matches(e.area,filters.area)&&matches(e.asm,filters.asm)&&matches(e.customer,filters.customer)&&matches(find(stores.get(e.sid)||{},'Channel','Store Type'),filters.channel));
 const byId=new Map(entries.filter(e=>e.id).map(e=>[e.id,e])),byName=new Map(entries.map(e=>[rosterName(e.name),e])),seen=new Set(),result=[];
 rows.forEach(row=>{
  const id=rosterCode(row._ps),name=rosterName(find(row,'PS Name','Promoter Name','Frontliner Name'));
  const named=byName.get(name);
  const match=byId.get(id)||((!id||!named?.id)&&named); 
  if(!match)return;seen.add(match.key);result.push({...row,_ps:match.key,'PS Name':match.name,_area:match.area,_asm:match.asm});
 });
 entries.forEach(e=>{if(!seen.has(e.key))result.push({_ps:e.key,'PS Name':e.name,_sid:e.sid,_store:e.store,_area:e.area,_asm:e.asm,_customer:e.customer,_channel:find(stores.get(e.sid)||{},'Channel','Store Type'),_qty:0,_points:0,_model:'',_series:'',_rosterOnly:true});});
 return result;
}
(()=>{
 const defaultConfig={url:'https://docs.google.com/spreadsheets/d/1m6k6RlB3hIwMkBC1lJcZwQpB51lyoFUO8zChpvzlCPM/edit',tab:'HR PS STATUS'};
 let config=null,roster=null,checking=false,generation=0,lastChecked=null;
 const panel=document.createElement('article');panel.className='card table-card';
 panel.innerHTML='<div class="card-head"><div><h2>Active Promoters · Google Sheet</h2><p>Current HR status applies to every sales month. Google Sheet changes are checked every minute while this dashboard is open.</p></div></div><form id="rosterForm"><label for="rosterUrl">Public Google Sheet link</label><input id="rosterUrl" type="url" required><label for="rosterTab">Sheet tab</label><input id="rosterTab" required value="HR PS STATUS"><button type="submit" class="secondary-btn" id="rosterSave" disabled>Save shared sheet link</button><button type="button" class="secondary-btn" id="rosterRefresh">Check now</button></form><p id="rosterStatus" class="score-note" role="status">Connecting to HR list…</p><p class="score-note">Required headers: PS NAME and STATUS (ACTIVE). Codes at the start of PS NAME take priority, followed by ID NUMBER, then name matching when no code is available. Missing active-list members are tagged Resigned in red. Historical sales stay included in the other dashboard tabs; Promoter Score includes current ACTIVE promoters only. Sign in as administrator to change the shared source.</p>';
 $('dataSection').append(panel);
 document.querySelectorAll('#promotersSection .score-note').forEach(el=>{
  if(el.textContent.startsWith('Promoters with sales records'))el.textContent='Current ACTIVE promoters matching the territory, customer and channel filters are listed, including zero sales for the selected month, model and series.';
  if(el.textContent.includes('Headcount counts distinct PS IDs'))el.textContent='Headcount includes current ACTIVE promoters, including those with zero matching sales. Running scores and averages include only these promoters, grouped by their current HR area and subregion. Passed means the monthly target is reached. Not passed includes on-pace and low-performance PS; low performance is a subset. Missing model scores remain unclassified. * indicates partial scores.';
 });
 const sellingLabel=$('activePsKpi').closest('article')?.querySelector('.kpi-label');if(sellingLabel)sellingLabel.textContent='PS with Sales';
 const psNotice=document.createElement('p');psNotice.id='activeRosterNotice';psNotice.className='score-note';$('promotersSection').prepend(psNotice);
 const departed=document.createElement('details');departed.innerHTML='<summary>Promoters not on the active list · selected sales</summary><div class="table-wrap"><table><thead><tr><th>Promoter</th><th>ID</th><th>Subregion</th><th>HR Status</th></tr></thead><tbody id="departedBody"></tbody></table></div>';panel.append(departed);
 const style=document.createElement('style');style.textContent='#rosterForm{display:flex;flex-wrap:wrap;gap:10px;align-items:center}#rosterForm input{padding:9px;border:1px solid #d8dce2;border-radius:8px;min-width:160px}#rosterUrl{flex:1;min-width:260px}.employment-badge{display:table;margin:5px 0 0;padding:3px 7px;border-radius:5px;font-size:11px;font-weight:700}.employment-active{background:#e2f3e5;color:#26733b}.employment-resigned{background:#fbe3e3;color:#b52d2d}tr[data-employment="resigned"] td:first-child strong{color:#b52d2d}';document.head.appendChild(style);
 function performanceRows(rows){return activePerformanceRows(rows,roster,{area:selected('areaFilter'),asm:selected('asmFilter'),customer:selected('customerFilter'),channel:selected('channelFilter')},storeMap());}
 function decorate(){
  $('activeRosterNotice').textContent=roster?'Only current ACTIVE promoters are shown. Model and series filters retain active promoters with zero matching sales.':'Loading the active HR roster. PS results will appear after verification.';
  const missing=new Map();if(roster)state.filteredSales.forEach(r=>{if(r._ps&&!rosterIsActive(roster,r._ps,find(r,'PS Name','Promoter Name')))missing.set(r._ps,r);});
  $('departedBody').innerHTML=[...missing.values()].map(r=>'<tr><td>'+escapeHtml(find(r,'PS Name','Promoter Name')||r._ps)+'</td><td>'+escapeHtml(r._ps)+'</td><td>'+escapeHtml(r._asm)+'</td><td><span class="employment-badge employment-resigned">Resigned</span></td></tr>').join('')||emptyRow(4);
  for(const bodyId of ['promoterScoreBody','psTableBody']){
   const tableBody=$(bodyId);if(!tableBody)continue;
   [...tableBody.rows].forEach(row=>{if(!row.dataset.promoterId)return;row.querySelectorAll('.employment-badge').forEach(e=>e.remove());delete row.dataset.employment;
    const active=rosterIsActive(roster,row.dataset.promoterId,row.querySelector('strong')?.textContent||'');if(active===null)return;
    row.dataset.employment=active?'active':'resigned';const badge=document.createElement('span');badge.className='employment-badge employment-'+row.dataset.employment;badge.textContent=active?'Active':'Resigned';row.cells[0].append(badge);
   });
  }
 }
 async function check(){
  if(checking||!config)return;checking=true;const epoch=generation;
  try{
   const id=sheetIdFromUrl(config.url);if(!id)throw new Error('Enter a valid public Google Sheets link.');
   const response=await fetch(csvUrl(id,config.tab)+'&headers=1&tq=select%20*',{cache:'no-store',signal:AbortSignal.timeout(25000)});
   if(!response.ok)throw new Error('Google Sheet could not be read. Check public sharing and the tab name.');
   const text=await response.text();if(/^\s*</.test(text))throw new Error('Google returned a page instead of data. Check public sharing.');
   const next=rosterParse(parseCSV(text));if(epoch!==generation)return;
   roster=next;lastChecked=new Date();$('rosterStatus').textContent=next.count+' ACTIVE promoters · Last checked '+lastChecked.toLocaleString();renderPromoters(state.filteredSales);decorate();window.evisProductivity?.render();window.evisPsSalesReview?.render();
  }catch(error){if(epoch===generation)$('rosterStatus').textContent=(roster?'Using last verified HR list. ':'HR status unavailable; promoters are not marked resigned. ')+error.message;}
  finally{checking=false;if(epoch!==generation)check();}
 }
 function setConfig(next){next=next||defaultConfig;if(config&&config.url===next.url&&config.tab===next.tab)return;config={url:next.url,tab:next.tab};generation++;roster=null;decorate();window.evisPsSalesReview?.render();$('rosterUrl').value=config.url;$('rosterTab').value=config.tab;check();}
 $('rosterRefresh').addEventListener('click',check);
 $('rosterForm').addEventListener('submit',async event=>{event.preventDefault();const next={url:$('rosterUrl').value.trim(),tab:$('rosterTab').value.trim()};try{const url=new URL(next.url);if(url.hostname!=='docs.google.com'||!sheetIdFromUrl(url.href)||!next.tab)throw new Error('Enter a public Google Sheets link and tab name.');await window.evisSaveRoster(next);await check();}catch(error){$('rosterStatus').textContent=error.message;}});
 window.evisRoster={getRoster:()=>roster,setConfig,setAdmin:(allowed)=>{['rosterUrl','rosterTab','rosterSave'].forEach(id=>$(id).disabled=!allowed);}};
 const beforePromoters=renderPromoters;renderPromoters=rows=>beforePromoters(performanceRows(rows));
 const beforeScores=renderScores;renderScores=rows=>beforeScores(performanceRows(rows));
 const before=render;render=()=>{before();decorate();};
 setInterval(()=>{if(document.visibilityState==='visible')check();},60000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
 window.evisRoster.setAdmin(false);setConfig(defaultConfig);
})();


// Reuse dealer comparisons, grouped by verified active promoter identity.
function psSalesReviewData(all,roster,filters,stores){
 const entries=activePerformanceRows([],roster,filters,stores);
 const byId=new Map(entries.map(e=>[e._ps,e])),byName=new Map(entries.map(e=>[rosterName(e['PS Name']),e]));
 const mapped=all.map(row=>{
  const id=rosterCode(row._ps),name=rosterName(find(row,'PS Name','Promoter Name','Frontliner Name')),named=byName.get(name);
  const entry=byId.get(id)||((!id||named?._ps.startsWith('name:'))&&named);
  return {...row,_reviewPs:entry?entry._ps:'',_reviewActive:!!entry};
 });
 return {hideShare:true,all:mapped,filters:[['_reviewActive',true]],entities:entries.map(e=>e._ps),names:new Map(entries.map(e=>[e._ps,e['PS Name']]))};
}
(()=>{
 const tab=document.createElement('button');tab.className='nav-item';tab.dataset.section='psSalesReview';tab.textContent='PS Sales Review';
 document.querySelector('.nav-item[data-section="dealers"]').after(tab);
 const section=$('dealersSection').cloneNode(true);section.id='psSalesReviewSection';
 section.querySelector('h2').textContent='PS Sales Review';
 section.querySelector('.score-note').textContent='Current ACTIVE promoters matching the area, subregion, dealer and channel filters are shown, including zero sales. All universal filters apply to sales and monthly comparisons.';
 section.querySelector('tbody').id='psSalesReviewBody';section.querySelector('th').textContent='Promoter';
 section.querySelector('thead tr').cells[2].remove();section.querySelector('tbody td').colSpan=10;
 section.querySelector('table').setAttribute('aria-label','PS Sales Review');
 $('dealersSection').after(section);
 const notice=document.createElement('p');notice.className='score-note';notice.setAttribute('role','status');section.querySelector('.table-wrap').before(notice);
 function review(){
  const roster=window.evisRoster.getRoster();
  notice.textContent=roster?'':'Loading the active HR roster. Sales results will appear after verification.';
  const data=psSalesReviewData(salesEnriched(),roster,{area:selected('areaFilter'),asm:selected('asmFilter'),customer:selected('customerFilter'),channel:selected('channelFilter')},storeMap());
  renderModelHistory([], 'psSalesReviewBody','_reviewPs','Promoter',data);
 }
 const style=document.createElement('style');style.textContent='#psSalesReviewBody .model-rate{white-space:nowrap;font-weight:600}#psSalesReviewBody .up{color:#238344}#psSalesReviewBody .down{color:#c63c3c}#psSalesReviewBody .steady{color:#286bc1}#psSalesReviewBody td{font-variant-numeric:tabular-nums}';document.head.appendChild(style);
 window.evisPsSalesReview={render:review};const before=render;render=()=>{before();review();};
})();
