// Model scoring extends the sales dashboard without changing stored sales files.
let PS_SCORE_TARGET = 200;
const UNMAPPED_SERIES = 'Unmapped series';
let scoreFile = null;
let scoreCatalog = new Map();
const modelKey = value => normalize(value).replace(/\s+/g,' ').toLowerCase();

function validateScoreRows(rows){
  const catalog = new Map();
  rows.forEach((row,index)=>{
    if(!Object.values(row).some(v=>normalize(v)!==''))return;
    const model=normalize(find(row,'Model','Smartphone Model','Model Name','SKU'));
    const series=normalize(find(row,'Series','Smartphone Series','Family','Smartphone Family','Classification'));
    const value=normalize(find(row,'Points per Unit','Score per Unit','Points','Score'));
    if(!model&&!value&&series.toUpperCase()==='ALL MODELS')return; // Workbook footer, not a scoring rule.
    const points=value===''?null:Number(value.replace(/,/g,''));
    if(!model||!series||(points!==null&&(!Number.isFinite(points)||points<0)))
      throw new Error(`Row ${index+2}: provide Model, Series and a non-negative Points per Unit number (blank means score not set).`);
    const key=modelKey(model);
    if(catalog.has(key)){
      const existing=catalog.get(key);
      if(modelKey(existing.series)===modelKey(series)&&existing.points===points)return;
      throw new Error(`Conflicting duplicate model: ${model}. Its series or score differs between rows. Keep one agreed entry.`);
    }
    if(series===UNMAPPED_SERIES||series==='ALL')throw new Error(`Row ${index+2}: please use a different series name.`);
    catalog.set(key,{model,series,points});
  });
  if(!catalog.size)throw new Error('No model scores found. Use columns Model, Series, Points per Unit.');
  return catalog;
}

function scoreRowsFromGrid(grid){
 const aliases=[['model','smartphone model','model name','sku'],['series','smartphone series','family','smartphone family','classification'],['points per unit','score per unit','points','score']];
 const headerIndex=grid.findIndex(row=>aliases.every(names=>row.some(cell=>names.includes(modelKey(cell)))));
 if(headerIndex<0)throw new Error('Could not find the scoring headers. Use Model, Series, Points per Unit on one row. A title above them is allowed.');
 const header=grid[headerIndex].map(modelKey),columns=aliases.map(names=>header.findIndex(cell=>names.includes(cell)));
 const rows=grid.slice(headerIndex+1).filter(row=>row.some(cell=>normalize(cell)!=='')).map(row=>Object.fromEntries(['Model','Series','Points per Unit'].map((label,i)=>[label,normalize(row[columns[i]])])));
 // Merge only identical rules; conflicting duplicates must be reviewed, never silently overwritten.
 const catalog=validateScoreRows(rows);
 return [...catalog.values()].map(m=>({Model:m.model,Series:m.series,'Points per Unit':m.points??''}));
}
async function parseScoreFile(file){
 const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true}),ws=wb.Sheets[wb.SheetNames[0]];
 if(!ws)throw new Error('The workbook has no readable worksheet.');
 const rows=scoreRowsFromGrid(XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false}));
 return {name:file.name,size:file.size,uploadedAt:new Date().toISOString(),headers:['Model','Series','Points per Unit'],rows};
}

function aiotFixedRate(row){
 const name=modelKey(row._model).replace(/[“”]/g,'"'),raw=normalize(find(row,'Material Name'))+' '+normalize(row._modelCode),capacity=raw.match(/\(\s*(\d+)\s*\+\s*(\d+)\s*\)/),variant=capacity?capacity[1]+'+'+capacity[2]:'';
 if(/^nexal pad$/.test(name))return 30;
 if(/^realme pad 2(?:\s|$)/.test(name))return variant==='8+256'?15:variant==='6+128'?10:null;
 if(['realme buds air 7','realme watch s2','realme watch 5'].includes(name))return 5;
 if(/^techlife pad plus 2(?:\s|$)/.test(name)&&variant==='4+128')return 20;
 if(/^techlife pad pro 12"(?:\s|$)/.test(name)&&variant==='8+256')return 15;
 if(/^techlife pad mini(?:\s|$)/.test(name)&&variant==='4+64')return 15;
 if(/^techlife pad plus 12"(?:\s*\([^)]*\))?$/.test(name))return 12;
 if(/^techlife pad neo(?:\s|$)/.test(name))return ['8+256','4+128'].includes(variant)?10:variant==='4+64'?4:null;
 if(/^techlife pad lite 8"$/.test(name))return 4;
 return null;
}
function aiotPriceRate(srp,series){
 if(!Number.isFinite(srp)||srp<0||!series||series===UNMAPPED_SERIES)return null;
 return /^realme/i.test(series)?(srp<1000?.5:srp<2000?1:srp<4000?3:8):(srp<1000?2:srp<2000?3:srp<3000?5:10);
}
function addScoreFields(rows){
 const latest=new Map();
 // Latest dated positive-unit sales, weighted by units when that date has several transactions.
 for(const row of rows){if(!/^ACSR/i.test(row._modelCode||''))continue;const value=normalize(find(row,'Sales Amount','Sales Value','Amount')),amount=Number(value.replace(/(?:PHP|₱|,|\s)/gi,'')),date=row._date;
  if(!value||!Number.isFinite(amount)||amount<0||!(row._qty>0)||!date||isNaN(date))continue;
  const day=Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()),key=modelKey(row._model),old=latest.get(key);
  if(!old||day>old.day)latest.set(key,{day,amount,units:row._qty});else if(day===old.day){old.amount+=amount;old.units+=row._qty;}
 }
 return rows.map(row=>{
  const key=modelKey(row._model),match=scoreCatalog.get(key),aiot=/^ACSR/i.test(row._modelCode||'');
  const series=match?.series||UNMAPPED_SERIES,price=latest.get(key),srp=price?price.amount/price.units:null;
  const rate=match?.points??null; // Published scores are authoritative, including monthly replacements.
  return {...row,_series:series,_productType:aiot?(/^realme/i.test(series)?'realme AIOT':'TL AIOT (non-realme)'):row._productType,_scoreRate:rate,_latestScoreSrp:aiot?srp:null,_points:rate!==null?row._qty*rate:null};
 });
}
function scoreTotals(rows){
  return rows.reduce((total,row)=>{
    total.units+=row._qty;
    if(row._points===null){total.unmappedUnits+=row._qty;total.missing=true;}
    else total.points+=row._points;
    return total;
  },{units:0,points:0,unmappedUnits:0,missing:false});
}
function scoreText(total){return scoreFile?`${fmt(total.points,2)}${total.missing?' *':''}`:'—';}
function scoreGroups(rows,key){
  const groups=new Map();
  rows.forEach(row=>{const id=row[key]||'Unassigned';if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row)});
  return [...groups].map(([id,items])=>({id,items,...scoreTotals(items)})).sort((a,b)=>b.points-a.points||a.id.localeCompare(b.id));
}

async function uploadScores(file){
  if(!file)return;
  const input=$('scoreFile'); input.disabled=true;
  try{
    const parsed=await parseScoreFile(file),catalog=validateScoreRows(parsed.rows);
    await idbSet('modelScores',parsed);
    scoreFile=parsed;scoreCatalog=catalog;
    $('scoreError').textContent='';
    buildFilters();render();renderScoreFile();
    toast(`Model scores loaded: ${fmt(catalog.size)} models.`);
  }catch(error){$('scoreError').textContent=error.message;}
  finally{input.disabled=false;input.value='';}
}
// Keep drafts when filters or the automatic data refresh rerender the dashboard.
const modelReviewDrafts=new Map();
function modelReviewItems(rows){
 const groups=new Map();
 for(const row of rows){const key=modelKey(row._model);if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 for(const [key,m] of scoreCatalog)if(m.points===null&&!groups.has(key))groups.set(key,[]);
 return [...groups].filter(([key])=>!scoreCatalog.has(key)||scoreCatalog.get(key).points===null).map(([key,items])=>{
  const existing=scoreCatalog.get(key),model=existing?.model||items[0]._model;
  const fixed=new Set(items.map(aiotFixedRate).filter(n=>n!==null));
  return {key,model,existing,codes:uniq(items.map(r=>r._modelCode).filter(Boolean)),srp:items.find(r=>r._latestScoreSrp!==null)?._latestScoreSrp??null,fixed:fixed.size===1?[...fixed][0]:null,conflict:fixed.size>1};
 }).sort((a,b)=>a.model.localeCompare(b.model));
}
function modelReviewSuggestion(item,series){
 if(item.conflict)return {points:null,basis:'Different memory variants have different scores. Review manually.'};
 if(item.fixed!==null)return {points:item.fixed,basis:'Agreed model-specific score'};
 if(!item.codes.some(c=>/^ACSR/i.test(c)))return {points:null,basis:'Enter the approved smartphone score.'};
 const points=aiotPriceRate(item.srp,series);
 return {points,basis:points===null?'Choose a series and check that a latest price is available.':(/^realme/i.test(series)?'realme':'TechLife / non-realme')+' SRP band · latest sales unit price ₱'+fmt(item.srp,2)};
}
function renderModelReview(host,rows){
 const items=modelReviewItems(rows),signature=JSON.stringify(items);
 if(host.dataset.signature===signature)return;
 host.dataset.signature=signature;
 const opened=host.querySelector('details')?.open;
 host.innerHTML='<details'+(opened?' open':'')+'><summary><strong>Models needing review ('+items.length+')</strong></summary><p class="score-note">Confirm additions here, or upload a replacement scoring file above for monthly changes. Only confirmed scores are used. Series come from the Models & Series source. Suggested SRP scores use the latest available sales amount per unit.</p><datalist id="reviewSeriesOptions">'+uniq([...scoreCatalog.values()].map(m=>m.series)).map(v=>'<option value="'+escapeHtml(v)+'"></option>').join('')+'</datalist><div class="table-wrap"><table data-no-sort><thead><tr><th>Model / codes</th><th>Series</th><th>Points per unit</th><th>Suggestion basis</th><th>Save</th></tr></thead><tbody></tbody></table></div><p class="score-note" role="status" id="modelReviewStatus"></p></details>';
 const body=host.querySelector('tbody');
 if(!items.length){body.innerHTML='<tr><td colspan="5">All sales models have a series and score.</td></tr>';return;}
 for(const item of items){
  let draft=modelReviewDrafts.get(item.key);
  if(!draft){const series=item.existing?.series||'',suggestion=modelReviewSuggestion(item,series);draft={series,points:suggestion.points??'',manual:false};modelReviewDrafts.set(item.key,draft);}
  const tr=document.createElement('tr');
  tr.innerHTML='<td>'+escapeHtml(item.model)+'<div class="score-note">'+escapeHtml(item.codes.join(', '))+'</div></td><td><input data-model-edit list="reviewSeriesOptions" aria-label="Series for '+escapeHtml(item.model)+'"></td><td><input data-model-edit type="number" min="0" step="any" aria-label="Points for '+escapeHtml(item.model)+'"></td><td class="review-basis"></td><td><button data-model-edit class="secondary-btn">Confirm & save</button></td>';
  const [series,points]=tr.querySelectorAll('input'),button=tr.querySelector('button'),basis=tr.querySelector('.review-basis');
  series.value=draft.series;points.value=draft.points;
  basis.textContent=modelReviewSuggestion(item,draft.series).basis;
  series.addEventListener('input',()=>{draft.series=series.value;const suggested=modelReviewSuggestion(item,draft.series);basis.textContent=suggested.basis;if(!draft.manual){draft.points=suggested.points??'';points.value=draft.points;}});
  points.addEventListener('input',()=>{draft.points=points.value;draft.manual=true;});
  button.addEventListener('click',async()=>{
   const status=$('modelReviewStatus');
   try{
    if(!normalize(series.value)||points.value===''||!Number.isFinite(Number(points.value))||Number(points.value)<0)throw new Error('Enter a series and a non-negative score before confirming.');
    button.disabled=true;status.textContent='Saving '+item.model+'…';
    await window.evisSaveModelEdit({model:item.model,series:normalize(series.value),points:Number(points.value)},item.existing||null);
    modelReviewDrafts.delete(item.key);$('modelReviewStatus').textContent=item.model+' saved to the shared scoring source.';
   }catch(error){status.textContent=error.message;button.disabled=window.dashboardAccount?.role!=='admin';}
  });
  body.append(tr);
 }
 host.querySelectorAll('[data-model-edit]').forEach(el=>el.disabled=window.dashboardAccount?.role!=='admin');
}
function mergeModelScore(file,entry,expected){
 const catalog=file?validateScoreRows(file.rows):new Map(),key=modelKey(entry.model),current=catalog.get(key)||null;
 if(JSON.stringify(current)!==JSON.stringify(expected))throw new Error('This model changed since you opened it. Refresh and review the latest values.');
 validateScoreRows([{Model:entry.model,Series:entry.series,'Points per Unit':entry.points}]);
 catalog.set(key,entry);
 return {...(file||{name:'Model Scores & Series.csv'}),uploadedAt:new Date().toISOString(),headers:['Model','Series','Points per Unit'],rows:[...catalog.values()].map(m=>({Model:m.model,Series:m.series,'Points per Unit':m.points??''}))};
}
function renderScoreFile(){
  $('scoreMeta').textContent=scoreFile?`${scoreFile.name} · ${fmt(scoreCatalog.size)} models · ${uniq([...scoreCatalog.values()].map(m=>m.series)).length} series`:'No scoring file uploaded';
  let alert=$('aiotMappingAlert');if(!alert){alert=document.createElement('div');alert.id='aiotMappingAlert';alert.setAttribute('role','status');$('scoreMeta').after(alert);}
  const all=salesEnriched();
  renderModelReview(alert,all);
  // This is the complete reference catalog, independent of transaction filters.
  const display=new Map([...scoreCatalog].map(([key,m])=>[key,{model:m.model,series:m.series,rates:new Set()}]));
  for(const row of all){const item=display.get(modelKey(row._model));if(item)item.rates.add(row._scoreRate);}
  for(const [key,item] of display){if(!item.rates.size)item.rates.add(scoreCatalog.get(key).points);}
  $('scoreCatalogBody').innerHTML=[...display.values()].sort((a,b)=>a.model.localeCompare(b.model)).map(m=>`<tr><td>${escapeHtml(m.model)}</td><td>${escapeHtml(m.series)}</td><td>${[...m.rates].map(v=>v==null?'Not set':fmt(v,2)).join(' / ')}</td></tr>`).join('')||emptyRow(3);
}
function scoreTemplateModels(catalog,rows){
 const models=new Map([...catalog].map(([key,m])=>[key,m.model]));
 for(const row of rows){const name=normalize(row._model),key=modelKey(name);if(name&&!models.has(key))models.set(key,name);}
 return [...models.values()].sort((a,b)=>a.localeCompare(b));
}
function downloadScoreTemplate(){
  const quote=value=>'"'+String(value).replace(/"/g,'""')+'"';
  const models=scoreTemplateModels(scoreCatalog,salesEnriched());
  const catalog=scoreCatalog;
  const csv='\ufeffModel,Series,Points per Unit\r\n'+models.map(model=>{const m=catalog.get(modelKey(model));return `${quote(model)},${quote(m?.series||'')},${m?.points??''}`;}).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='model-scoring-template.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function renderScores(rows){
  renderScoreFile();
  const total=scoreTotals(rows),missing=uniq(rows.filter(r=>r._points===null).map(r=>r._model));
  $('runningScoreKpi').textContent=scoreText(total);
  $('unscoredKpi').textContent=fmt(total.unmappedUnits);
  $('scoreNotice').textContent=!scoreFile?'Upload a model scoring file in Data Sources to calculate points.':total.missing?`* Incomplete scores: ${fmt(total.unmappedUnits)} units have no model score. Add the missing models below before using these totals for incentives.`:'All sales in this view have a model score. Points = units × points per unit.';
  $('missingModels').textContent=missing.length?`Models needing scores: ${missing.join(', ')}`:'';
  const groups=scoreGroups(rows,'_ps');
  const names=new Map((state.raw.promoters||[]).map(p=>[find(p,'PS ID','Promoter ID'),find(p,'PS Name','Name')]));
  const reached=groups.filter(g=>g.id!=='Unassigned'&&!g.missing&&g.points>=PS_SCORE_TARGET).length;
  $('reachedScoreKpi').textContent=scoreFile?fmt(reached):'—';
  $('promoterScoreBody').innerHTML=groups.map(g=>{
    const assigned=g.id!=='Unassigned',target=assigned?PS_SCORE_TARGET:null;
    const progress=scoreFile&&assigned?pct(g.points/target*100)+(g.missing?' *':''):'—';
    const status=!scoreFile?'Awaiting scores':g.missing?'Incomplete':!assigned?'Missing PS ID':g.points>=target?'Target reached':'In progress';
    return `<tr data-promoter-id="${assigned?escapeHtml(g.id):''}"><td><strong>${escapeHtml(find(g.items[0],'PS Name','Promoter Name')||names.get(g.id)||g.id)}</strong><div class="muted">${escapeHtml(g.id)}</div></td><td>${escapeHtml(uniq(g.items.map(r=>r._asm||'Unassigned')).join(', '))}</td><td>${fmt(g.units)}</td><td>${scoreText(g)}</td><td>${target??'—'}</td><td>${progress}</td><td>${scoreFile&&assigned?fmt(Math.max(target-g.points,0),2)+(g.missing?' *':''):'—'}</td><td>${status}</td></tr>`;
  }).join('')||emptyRow(8);
}

function mountScoring(){
  const style=document.createElement('style');
  style.textContent='.filters{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.score-note{font-size:12px;line-height:1.6;margin:10px 0;overflow-wrap:anywhere}.score-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.score-upload{margin-bottom:14px}.score-upload input{max-width:100%;margin:14px 0}.score-summary{margin-top:18px}#aiotMappingAlert{margin:16px 0}#aiotMappingAlert input{padding:9px;max-width:240px;width:100%;color:inherit;background:var(--card-bg,transparent);border:1px solid #8994a5;border-radius:6px}#aiotMappingAlert input[type=number]{max-width:120px}#aiotMappingAlert summary{cursor:pointer}';
  document.head.appendChild(style);
  document.querySelector('.filters').insertAdjacentHTML('beforeend','<div class="filter-group"><label for="seriesFilter">Series</label><select id="seriesFilter"><option value="ALL">All series</option></select></div>');
  $('seriesFilter').addEventListener('change',()=>render());
  $('dataSection').insertAdjacentHTML('beforeend',`<article class="upload-card card score-upload"><h2>Model Scores &amp; Series</h2><p class="muted">Upload Excel or CSV with columns <strong>Model</strong>, <strong>Series</strong>, <strong>Points per Unit</strong>. Use the exact model names from sales, including memory variants. The first worksheet is used.</p><div class="score-actions"><label for="scoreFile">Choose model scoring file</label><input type="file" id="scoreFile" accept=".xlsx,.xls,.csv"><button class="secondary-btn" id="scoreTemplate">Download template with sales models</button></div><div class="file-meta" id="scoreMeta"></div><p id="scoreError" role="alert" class="score-note danger-text"></p><p class="score-note">Saved in this browser. Replacing this file recalculates scores for every month using the new rates. Set the monthly points target per promoter in Promoter Score. Subregion scores sum the points from sales in that subregion; cash incentive amounts are not calculated.</p><details><summary>View all model scores &amp; series</summary><div class="table-wrap"><table><thead><tr><th>Model</th><th>Series</th><th>Points per unit</th></tr></thead><tbody id="scoreCatalogBody"></tbody></table></div></details></article>`);
  $('scoreFile').addEventListener('change',e=>uploadScores(e.target.files[0]));
  $('scoreTemplate').addEventListener('click',downloadScoreTemplate);
  $('promotersSection').insertAdjacentHTML('afterbegin',`<div class="kpi-grid four score-summary"><article class="kpi-card card accent-card"><span class="kpi-label">Running Score</span><div class="kpi-value" id="runningScoreKpi">—</div><span class="kpi-note">selected month and filters</span></article><article class="kpi-card card"><span class="kpi-label">Monthly Target / PS</span><div class="kpi-value" id="psTargetKpi">200</div><span class="kpi-note">points per promoter</span></article><article class="kpi-card card"><span class="kpi-label">PS at Target</span><div class="kpi-value" id="reachedScoreKpi">—</div><span class="kpi-note">complete scores only</span></article><article class="kpi-card card"><span class="kpi-label">Units Missing Scores</span><div class="kpi-value" id="unscoredKpi">0</div><span class="kpi-note">need a model score</span></article></div><article class="card table-card"><div class="card-head"><div><h2>Promoter Running Scores</h2><p>Sales in the selected month and filters. The full monthly target stays unchanged when filters are applied.</p></div></div><p class="score-note" id="scoreNotice" role="status"></p><details><summary>Model matching details</summary><p class="score-note" id="missingModels"></p></details><div class="table-wrap"><table><thead><tr><th>Promoter / ID</th><th>Subregions</th><th>Units</th><th>Score</th><th>Target</th><th>Achievement</th><th>Points to target</th><th>Status</th></tr></thead><tbody id="promoterScoreBody"></tbody></table></div><p class="score-note">Promoters with sales records in this view are listed. Unassigned sales contribute to subregion totals but have no promoter target.</p></article>`);
  renderScoreFile();
}

// Install before the existing DOMContentLoaded handler restores the sales files.
const originalSalesEnriched=salesEnriched;
let scoreSalesRef,scoreStoresRef,scoreCatalogRef,baseScoreRows=[],cachedScoreRows=[]; salesEnriched=()=>{if(scoreSalesRef!==state.raw.sales||scoreStoresRef!==state.raw.stores){baseScoreRows=originalSalesEnriched();scoreSalesRef=state.raw.sales;scoreStoresRef=state.raw.stores;scoreCatalogRef=null;}if(scoreCatalogRef!==scoreCatalog){cachedScoreRows=addScoreFields(baseScoreRows);scoreCatalogRef=scoreCatalog;}return cachedScoreRows;};
const originalFilterData=filterData;
filterData=()=>{originalFilterData();state.filteredSales=state.filteredSales.filter(r=>passes(r._series,selected('seriesFilter')))};
const originalBuildFilters=buildFilters;
buildFilters=()=>{originalBuildFilters();productFilterOptions()};
const originalPromoters=renderPromoters;
renderPromoters=rows=>{originalPromoters(rows);renderScores(rows)};
const originalInventory=inventoryRows;
inventoryRows=()=>originalInventory().filter(r=>passes(scoreCatalog.get(modelKey(r._model))?.series||UNMAPPED_SERIES,selected('seriesFilter')));
const originalTargets=relevantTargets;
relevantTargets=()=>originalTargets().filter(r=>passes(scoreCatalog.get(modelKey(find(r,'Model','SKU','Product')))?.series||UNMAPPED_SERIES,selected('seriesFilter')));
const originalRestore=restoreUploads;
restoreUploads=async()=>{
  try{const saved=await idbGet('modelScores');if(saved){const catalog=validateScoreRows(saved.rows);scoreFile=saved;scoreCatalog=catalog;renderScoreFile()}}
  catch(error){$('scoreError').textContent=`Could not restore model scores: ${error.message}`}
  return originalRestore();
};
mountScoring();
