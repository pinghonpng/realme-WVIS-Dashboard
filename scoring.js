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
    if(catalog.has(key))throw new Error(`Duplicate model: ${model}. Keep one row per model.`);
    if(series===UNMAPPED_SERIES||series==='ALL')throw new Error(`Row ${index+2}: please use a different series name.`);
    catalog.set(key,{model,series,points});
  });
  if(!catalog.size)throw new Error('No model scores found. Use columns Model, Series, Points per Unit.');
  return catalog;
}

function aiotSeriesMap(rows){
 const result=new Map();for(const row of rows){const p=salesProductFields(row);if(p._productType!=='AIOT')continue;const key=modelKey(p._model);if(!result.has(key))result.set(key,{model:p._model,series:new Map()});const value=normalize(find(row,'物料分组'));if(value)result.get(key).series.set(modelKey(value),value);}
 return result;
}
function aiotSeriesFile(rows,file){
 const current=file?validateScoreRows(file.rows):new Map(),next=new Map(current);let changed=false;
 for(const [key,item] of aiotSeriesMap(rows)){if(item.series.size!==1)continue;const series=[...item.series.values()][0],old=next.get(key);if(old)continue;next.set(key,{model:old?.model||item.model,series,points:old?.points??null});changed=true;}
 if(!changed)return null;
 return {...(file||{name:'Model Scores and Series',headers:['Model','Series','Points per Unit']}),uploadedAt:new Date().toISOString(),rows:[...next.values()].map(m=>({Model:m.model,Series:m.series,'Points per Unit':m.points??''}))};
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
 const seriesMap=aiotSeriesMap(rows),latest=new Map();
 // Latest dated positive-unit sales, weighted by units when that date has several transactions.
 for(const row of rows){if(!/^ACSR/i.test(row._modelCode||''))continue;const value=normalize(find(row,'Sales Amount','Sales Value','Amount')),amount=Number(value.replace(/(?:PHP|₱|,|\s)/gi,'')),date=row._date;
  if(!value||!Number.isFinite(amount)||amount<0||!(row._qty>0)||!date||isNaN(date))continue;
  const day=Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()),key=modelKey(row._model),old=latest.get(key);
  if(!old||day>old.day)latest.set(key,{day,amount,units:row._qty});else if(day===old.day){old.amount+=amount;old.units+=row._qty;}
 }
 return rows.map(row=>{
  const key=modelKey(row._model),match=scoreCatalog.get(key),aiot=/^ACSR/i.test(row._modelCode||''),names=seriesMap.get(key)?.series;
  const series=match?.series||(aiot&&names?.size===1?[...names.values()][0]:UNMAPPED_SERIES),price=latest.get(key),srp=price?price.amount/price.units:null;
  const rate=aiot?(aiotFixedRate(row)??aiotPriceRate(srp,series)):match?.points??null;
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
    const parsed=await parseSalesFile(file),catalog=validateScoreRows(parsed.rows);
    await idbSet('modelScores',parsed);
    scoreFile=parsed;scoreCatalog=catalog;
    $('scoreError').textContent='';
    buildFilters();render();renderScoreFile();
    toast(`Model scores loaded: ${fmt(catalog.size)} models.`);
  }catch(error){$('scoreError').textContent=error.message;}
  finally{input.disabled=false;input.value='';}
}
function renderScoreFile(){
  $('scoreMeta').textContent=scoreFile?`${scoreFile.name} · ${fmt(scoreCatalog.size)} models · ${uniq([...scoreCatalog.values()].map(m=>m.series)).length} series`:'No scoring file uploaded';
  let alert=$('aiotMappingAlert');if(!alert){alert=document.createElement('div');alert.id='aiotMappingAlert';alert.setAttribute('role','status');$('scoreMeta').after(alert);}
  const all=salesEnriched(),seriesMap=aiotSeriesMap(all),missing=new Map();for(const r of all){if(!/^ACSR/i.test(r._modelCode||''))continue;const key=modelKey(r._model),conflict=!scoreCatalog.has(key)&&seriesMap.get(key)?.series.size>1;if(!conflict&&r._series!==UNMAPPED_SERIES&&r._points!==null)continue;if(!missing.has(key))missing.set(key,{name:r._model,codes:new Set(),issue:conflict?'Conflicting series: '+[...seriesMap.get(key).series.values()].join(' / '):r._series===UNMAPPED_SERIES?'Series missing':'Score not set'});missing.get(key).codes.add(r._modelCode);}
  alert.innerHTML=missing.size?'<p><strong>'+missing.size+' AIOT models need review</strong></p><div class="table-wrap"><table><thead><tr><th>AIOT Model</th><th>Column H Codes</th><th>Review</th></tr></thead><tbody>'+[...missing.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(r=>'<tr><td>'+escapeHtml(r.name)+'</td><td>'+escapeHtml([...r.codes].sort().join(', '))+'</td><td>'+escapeHtml(r.issue)+'</td></tr>').join('')+'</tbody></table></div>':'';
  const visibleModels=new Set(state.filteredSales.map(r=>modelKey(r._model)));
  const display=new Map();for(const row of all){const key=modelKey(row._model);if(!visibleModels.has(key))continue;if(!display.has(key))display.set(key,{model:row._model,series:row._series,rates:new Set()});display.get(key).rates.add(row._scoreRate);}
  $('scoreCatalogBody').innerHTML=[...display.values()].sort((a,b)=>a.model.localeCompare(b.model)).map(m=>`<tr><td>${escapeHtml(m.model)}</td><td>${escapeHtml(m.series)}</td><td>${[...m.rates].map(v=>v==null?'Not set':fmt(v,2)).join(' / ')}</td></tr>`).join('')||emptyRow(3);
}
function downloadScoreTemplate(){
  const quote=value=>'"'+String(value).replace(/"/g,'""')+'"';
  const models=uniq(salesEnriched().map(row=>row._model));
  const resolved=aiotSeriesFile(state.raw.sales,scoreFile),catalog=resolved?validateScoreRows(resolved.rows):scoreCatalog;
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
  style.textContent='.filters{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.score-note{font-size:12px;line-height:1.6;margin:10px 0;overflow-wrap:anywhere}.score-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.score-upload{margin-bottom:14px}.score-upload input{max-width:100%;margin:14px 0}.score-summary{margin-top:18px}';
  document.head.appendChild(style);
  document.querySelector('.filters').insertAdjacentHTML('beforeend','<div class="filter-group"><label for="seriesFilter">Series</label><select id="seriesFilter"><option value="ALL">All series</option></select></div>');
  $('seriesFilter').addEventListener('change',()=>render());
  $('dataSection').insertAdjacentHTML('beforeend',`<article class="upload-card card score-upload"><h2>Model Scores &amp; Series</h2><p class="muted">Upload Excel or CSV with columns <strong>Model</strong>, <strong>Series</strong>, <strong>Points per Unit</strong>. Use the exact model names from sales, including memory variants. The first worksheet is used.</p><div class="score-actions"><label for="scoreFile">Choose model scoring file</label><input type="file" id="scoreFile" accept=".xlsx,.xls,.csv"><button class="secondary-btn" id="scoreTemplate">Download template with sales models</button></div><div class="file-meta" id="scoreMeta"></div><p id="scoreError" role="alert" class="score-note danger-text"></p><p class="score-note">Saved in this browser. Replacing this file recalculates scores for every month using the new rates. Set the monthly points target per promoter in Promoter Score. Subregion scores sum the points from sales in that subregion; cash incentive amounts are not calculated.</p><details><summary>View model scores for selected filters</summary><div class="table-wrap"><table><thead><tr><th>Model</th><th>Series</th><th>Points per unit</th></tr></thead><tbody id="scoreCatalogBody"></tbody></table></div></details></article>`);
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

