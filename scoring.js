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
    const points=Number(value.replace(/,/g,''));
    if(!model||!series||value===''||!Number.isFinite(points)||points<0)
      throw new Error(`Row ${index+2}: provide Model, Series and a non-negative Points per Unit number (zero is allowed).`);
    const key=modelKey(model);
    if(catalog.has(key))throw new Error(`Duplicate model: ${model}. Keep one row per model.`);
    if(series===UNMAPPED_SERIES||series==='ALL')throw new Error(`Row ${index+2}: please use a different series name.`);
    catalog.set(key,{model,series,points});
  });
  if(!catalog.size)throw new Error('No model scores found. Use columns Model, Series, Points per Unit.');
  return catalog;
}

function addScoreFields(rows){
  return rows.map(row=>{
    const match=scoreCatalog.get(modelKey(row._model));
    return {...row,_series:match?.series||UNMAPPED_SERIES,_points:match?row._qty*match.points:null};
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
  $('scoreCatalogBody').innerHTML=[...scoreCatalog.values()].map(m=>`<tr><td>${escapeHtml(m.model)}</td><td>${escapeHtml(m.series)}</td><td>${fmt(m.points,2)}</td></tr>`).join('')||emptyRow(3);
}
function downloadScoreTemplate(){
  const quote=value=>'"'+String(value).replace(/"/g,'""')+'"';
  const models=uniq(salesEnriched().map(row=>row._model));
  const csv='\ufeffModel,Series,Points per Unit\r\n'+models.map(model=>`${quote(model)},,`).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='model-scoring-template.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function renderScores(rows){
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
    return `<tr><td><strong>${escapeHtml(names.get(g.id)||g.id)}</strong><div class="muted">${escapeHtml(g.id)}</div></td><td>${escapeHtml(uniq(g.items.map(r=>r._asm||'Unassigned')).join(', '))}</td><td>${fmt(g.units)}</td><td>${scoreText(g)}</td><td>${target??'—'}</td><td>${progress}</td><td>${scoreFile&&assigned?fmt(Math.max(target-g.points,0),2)+(g.missing?' *':''):'—'}</td><td>${status}</td></tr>`;
  }).join('')||emptyRow(8);
  $('subregionScoreBody').innerHTML=scoreGroups(rows,'_asm').map(g=>`<tr><td><strong>${escapeHtml(g.id)}</strong></td><td>${fmt(g.units)}</td><td>${scoreText(g)}</td><td>${fmt(g.unmappedUnits)}</td></tr>`).join('')||emptyRow(4);
}

function mountScoring(){
  const style=document.createElement('style');
  style.textContent='.filters{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.score-note{font-size:12px;line-height:1.6;margin:10px 0;overflow-wrap:anywhere}.score-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.score-upload{margin-bottom:14px}.score-upload input{max-width:100%;margin:14px 0}.score-summary{margin-top:18px}';
  document.head.appendChild(style);
  document.querySelector('.filters').insertAdjacentHTML('beforeend','<div class="filter-group"><label for="seriesFilter">Smartphone Series</label><select id="seriesFilter"><option value="ALL">All series</option></select></div>');
  $('seriesFilter').addEventListener('change',()=>render());
  $('dataSection').insertAdjacentHTML('beforeend',`<article class="upload-card card score-upload"><h2>Model Scores &amp; Smartphone Series</h2><p class="muted">Upload Excel or CSV with columns <strong>Model</strong>, <strong>Series</strong>, <strong>Points per Unit</strong>. Use the exact model names from sales, including memory variants. The first worksheet is used.</p><div class="score-actions"><label for="scoreFile">Choose model scoring file</label><input type="file" id="scoreFile" accept=".xlsx,.xls,.csv"><button class="secondary-btn" id="scoreTemplate">Download template with sales models</button></div><div class="file-meta" id="scoreMeta"></div><p id="scoreError" role="alert" class="score-note danger-text"></p><p class="score-note">Saved in this browser. Replacing this file recalculates scores for every month using the new rates. Set the monthly points target per promoter in PS Performance. Subregion scores sum the points from sales in that subregion; cash incentive amounts are not calculated.</p><details><summary>View uploaded model scores</summary><div class="table-wrap"><table><thead><tr><th>Model</th><th>Series</th><th>Points per unit</th></tr></thead><tbody id="scoreCatalogBody"></tbody></table></div></details></article>`);
  $('scoreFile').addEventListener('change',e=>uploadScores(e.target.files[0]));
  $('scoreTemplate').addEventListener('click',downloadScoreTemplate);
  $('promotersSection').insertAdjacentHTML('afterbegin',`<div class="kpi-grid four score-summary"><article class="kpi-card card accent-card"><span class="kpi-label">Running Score</span><div class="kpi-value" id="runningScoreKpi">—</div><span class="kpi-note">selected month and filters</span></article><article class="kpi-card card"><span class="kpi-label">Monthly Target / PS</span><div class="kpi-value" id="psTargetKpi">200</div><span class="kpi-note">points per promoter</span></article><article class="kpi-card card"><span class="kpi-label">PS at Target</span><div class="kpi-value" id="reachedScoreKpi">—</div><span class="kpi-note">complete scores only</span></article><article class="kpi-card card"><span class="kpi-label">Units Missing Scores</span><div class="kpi-value" id="unscoredKpi">0</div><span class="kpi-note">need a model score</span></article></div><article class="card table-card"><div class="card-head"><div><h2>Promoter Running Scores</h2><p>Sales in the selected month and filters. The full monthly target stays unchanged when filters are applied.</p></div></div><p class="score-note" id="scoreNotice" role="status"></p><details><summary>Model matching details</summary><p class="score-note" id="missingModels"></p></details><div class="table-wrap"><table><thead><tr><th>Promoter / ID</th><th>Subregions</th><th>Units</th><th>Score</th><th>Target</th><th>Achievement</th><th>Points to target</th><th>Status</th></tr></thead><tbody id="promoterScoreBody"></tbody></table></div><p class="score-note">Promoters with sales records in this view are listed. Unassigned sales contribute to subregion totals but have no promoter target.</p></article><article class="card table-card"><div class="card-head"><div><h2>Subregion Running Scores</h2><p>Points for ASM incentive tracking, attributed to each sale's subregion.</p></div></div><div class="table-wrap"><table><thead><tr><th>Subregion</th><th>Units</th><th>Score</th><th>Units missing scores</th></tr></thead><tbody id="subregionScoreBody"></tbody></table></div></article>`);
  renderScoreFile();
}

// Install before the existing DOMContentLoaded handler restores the sales files.
const originalSalesEnriched=salesEnriched;
let scoreSalesRef,scoreStoresRef,scoreCatalogRef,baseScoreRows=[],cachedScoreRows=[]; salesEnriched=()=>{if(scoreSalesRef!==state.raw.sales||scoreStoresRef!==state.raw.stores){baseScoreRows=originalSalesEnriched();scoreSalesRef=state.raw.sales;scoreStoresRef=state.raw.stores;scoreCatalogRef=null;}if(scoreCatalogRef!==scoreCatalog){cachedScoreRows=addScoreFields(baseScoreRows);scoreCatalogRef=scoreCatalog;}return cachedScoreRows;};
const originalFilterData=filterData;
filterData=()=>{originalFilterData();state.filteredSales=state.filteredSales.filter(r=>passes(r._series,selected('seriesFilter')))};
const originalBuildFilters=buildFilters;
buildFilters=()=>{originalBuildFilters();setOptions('seriesFilter',uniq(salesEnriched().map(r=>r._series)),'series')};
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
