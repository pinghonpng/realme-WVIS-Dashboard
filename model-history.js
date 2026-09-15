// Model comparisons use calendar months and the same non-month filters.
function modelMonthKey(date){return !date||isNaN(date)?'':`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;}
function modelMonthOffset(month,offset){const [y,m]=month.split('-').map(Number);return modelMonthKey(new Date(y,m-1+offset,1));}
function modelRate(current,previous){
  if(current===null||previous===null)return {text:'—',value:null,kind:'missing'};
  if(previous===0)return current===0?{text:'0.00%',value:0,kind:'steady'}:{text:'New',value:null,kind:'up'};
  const value=(current-previous)/previous*100;
  return {text:`${value>0?'+':''}${value.toFixed(2)}%`,value,kind:Math.abs(value)<=1+1e-9?'steady':value>0?'up':'down'};
}
function modelRateCell(current,previous){const rate=modelRate(current,previous),symbol={up:'▲',down:'▼',steady:'━',missing:''}[rate.kind];return `<td data-sort-value="${rate.value??''}" class="model-rate ${rate.kind}"><span aria-hidden="true">${symbol}</span> ${rate.text}</td>`;}
function modelHistoryData(all,month,filters,groupKey='_model'){
  const months=Array.from({length:5},(_,i)=>modelMonthOffset(month,-i));
  const buckets=new Map(months.map(m=>[m,{latest:0,rows:[],sales:new Map()}]));
  all.forEach(r=>{const bucket=buckets.get(modelMonthKey(r._date));if(!bucket)return;bucket.latest=Math.max(bucket.latest,r._date.getDate());if(filters.every(([key,value])=>passes(r[key],value))){bucket.rows.push(r);const model=r[groupKey]||'Unknown';bucket.sales.set(model,(bucket.sales.get(model)||0)+r._qty);}});
  const cutoff=buckets.get(month).latest,previous=months[1];
  const [py,pm]=previous.split('-').map(Number),previousEnd=Math.min(cutoff,new Date(py,pm,0).getDate());
  const prior=buckets.get(previous),matched=new Map();
  prior.rows.filter(r=>r._date.getDate()<=previousEnd).forEach(r=>{const model=r[groupKey]||'Unknown';matched.set(model,(matched.get(model)||0)+r._qty);});
  return {months,buckets,cutoff,previousEnd,matched,matchedAvailable:cutoff>0&&prior.latest>=previousEnd};
}
function renderModelHistory(rows,bodyId='modelTableBody',groupKey='_model',entityLabel='Model',options={}){
  const month=selected('monthFilter');if(!/^\d{4}-\d{2}$/.test(month))return;
  const filters=[['_area',selected('areaFilter')],['_asm',selected('asmFilter')],['_customer',selected('customerFilter')],['_channel',selected('channelFilter')],['_model',selected('modelFilter')],['_series',selected('seriesFilter')],['_priceRange',selected('priceRangeFilter')]];
  const history=modelHistoryData(options.all||salesEnriched(),month,[...filters,...(options.filters||[])],groupKey),{months,buckets}=history;
  const past=[months[3],months[2],months[1]],table=$(bodyId).closest('table');
  const pair=(from,to)=>from.slice(0,4)===to.slice(0,4)?monthName(from).replace(/\s*\d{4}/,'')+' → '+monthName(to):monthName(from)+' → '+monthName(to);
  const leading=options.hideShare?4:5;
  const labels=[entityLabel,'Sales',...(options.hideShare?[]:['Market Share']),monthName(months[1]),pair(months[1],month),...past.map(m=>monthName(m)),...past.map(m=>pair(modelMonthOffset(m,-1),m))];
  table.classList.add('model-history-table');
  if(!table.tHead.querySelector('[data-sort-column]'))table.tHead.innerHTML='<tr>'+labels.slice(0,leading).map((label,i)=>`<th rowspan="2" scope="col" data-sort-column="${i}">${escapeHtml(label)}</th>`).join('')+'<th colspan="3" scope="colgroup">Monthly Sales</th><th colspan="3" scope="colgroup">Increase Rate</th></tr><tr>'+labels.slice(leading).map((label,i)=>`<th scope="col" data-sort-column="${i+leading}">${escapeHtml(label)}</th>`).join('')+'</tr>';
  else [...table.tHead.querySelectorAll('[data-sort-column]')].forEach((cell,i)=>{const button=cell.querySelector('.table-sort-button');if(button){button.setAttribute('aria-label','Sort by '+labels[i]);button.textContent=labels[i]+({'ascending':' ↑','descending':' ↓'}[cell.getAttribute('aria-sort')]||' ↕');}else cell.textContent=labels[i];});
  const models=options.entities||uniq([...buckets.get(month).sales.keys()]);
  const current=buckets.get(month),total=options.entities?[...current.sales.values()].reduce((sum,qty)=>sum+qty,0):rows.reduce((sum,r)=>sum+r._qty,0);
  const complete=m=>{const [y,num]=m.split('-').map(Number);return buckets.get(m).latest===new Date(y,num,0).getDate();};
  const monthly=(m,model)=>buckets.get(m).latest?buckets.get(m).sales.get(model)||0:null;
  $(bodyId).innerHTML=models.map(model=>{
    const sales=current.sales.get(model)||0,prior=history.matchedAvailable?history.matched.get(model)||0:null;
    return `<tr><td><strong>${escapeHtml(options.names?.get(model)||model)}</strong></td><td>${fmt(sales)}</td>${options.hideShare?'':`<td>${pct(total?sales/total*100:0)}</td>`}<td>${prior===null?'—':fmt(prior)}</td>${modelRateCell(current.latest?sales:null,prior)}${past.map(m=>{const value=monthly(m,model);return `<td>${value===null?'—':fmt(value)+(complete(m)?'':' *')}</td>`;}).join('')}${past.map(m=>{const prev=modelMonthOffset(m,-1);return modelRateCell(complete(m)?monthly(m,model):null,complete(prev)?monthly(prev,model):null);}).join('')}</tr>`;
  }).join('')||emptyRow(labels.length);
  // Aggregate displayed entities first; calculate rates from their combined units.
  const aggregate=map=>models.reduce((sum,key)=>sum+(map.get(key)||0),0);
  const currentTotal=aggregate(current.sales),priorTotal=history.matchedAvailable?aggregate(history.matched):null;
  const monthlyTotal=m=>buckets.get(m).latest?aggregate(buckets.get(m).sales):null;
  const footer=table.tFoot||table.createTFoot();footer.dataset.summary='history';
  footer.innerHTML=`<tr><th scope="row">WVIS</th><td>${fmt(currentTotal)}</td>${options.hideShare?'':`<td>${pct(total?currentTotal/total*100:0)}</td>`}<td>${priorTotal===null?'—':fmt(priorTotal)}</td>${modelRateCell(current.latest?currentTotal:null,priorTotal)}${past.map(m=>{const value=monthlyTotal(m);return `<td>${value===null?'—':fmt(value)+(complete(m)?'':' *')}</td>`;}).join('')}${past.map(m=>{const prev=modelMonthOffset(m,-1);return modelRateCell(complete(m)?monthlyTotal(m):null,complete(prev)?monthlyTotal(prev):null);}).join('')}</tr>`;
  footer.title='Totals for the rows in this table. Increase rates use combined sales.';
  table.closest('article').querySelector('.card-head p').textContent=`Current sales: ${monthName(month)} 1–${history.cutoff||'—'}. Previous period: ${monthName(months[1])} 1–${history.previousEnd||'—'}. ${options.hideShare?'':'Market share uses selected-view units. '}IR = (new − previous) / previous. Blue line: ±1%; green: increase; red: decrease. New = zero prior sales. Past months show all uploaded sales; * means data ends before month-end, and incomplete/missing comparisons show —. All filters apply to both periods.`;
}
renderModelTable=renderModelHistory;
const modelHistoryStyle=document.createElement('style');
modelHistoryStyle.textContent='.model-history-table{border-collapse:collapse}.model-history-table th,.model-history-table td{border:1px solid #d8dce2;text-align:center;vertical-align:middle}.model-history-table th{background:#f7f8fa}.model-history-table th[scope=colgroup]{background:#eef0f3;font-size:12px}.model-history-table .table-sort-button{text-align:center}#modelTableBody .model-rate{white-space:nowrap;font-weight:600}#modelTableBody .up{color:#238344}#modelTableBody .down{color:#c63c3c}#modelTableBody .steady{color:#286bc1}#modelTableBody td{font-variant-numeric:tabular-nums}';
document.head.appendChild(modelHistoryStyle);

// Dealers follow the same date coverage, filters and comparisons as models.
const dealerTab=document.createElement('button');
dealerTab.className='nav-item';dealerTab.dataset.section='dealers';dealerTab.textContent='Dealer Performance';
document.querySelector('.nav-item[data-section="stores"]').before(dealerTab);
const dealerSection=document.createElement('section');dealerSection.id='dealersSection';dealerSection.className='dashboard-section';
dealerSection.innerHTML='<article class="card table-card"><div class="card-head"><div><h2>Dealer Performance</h2><p>Select a month with uploaded sales to compare dealer performance.</p></div></div><p class="score-note">Dealers use Customer Short Name (column X). Sales combine all stores belonging to each dealer. Market share is each dealer’s portion of sales in the selected view.</p><div class="table-wrap"><table class="model-history-table"><thead><tr><th>Dealer</th><th>Sales</th><th>Market Share</th><th>Previous month</th><th>Change</th><th colspan="3">Monthly Sales</th><th colspan="3">Increase Rate</th></tr></thead><tbody id="dealerTableBody"><tr><td colspan="11">No shared sales loaded yet.</td></tr></tbody></table></div></article>';
$('overviewSection').after(dealerSection);
const renderBeforeDealers=render;
render=()=>{renderBeforeDealers();renderModelHistory(state.filteredSales,'dealerTableBody','_customer','Dealer');};
const dealerStyle=document.createElement('style');
dealerStyle.textContent='#dealerTableBody .model-rate{white-space:nowrap;font-weight:600}#dealerTableBody .up{color:#238344}#dealerTableBody .down{color:#c63c3c}#dealerTableBody .steady{color:#286bc1}#dealerTableBody td{font-variant-numeric:tabular-nums}';
document.head.appendChild(dealerStyle);

// Prices come from each sale's amount and quantity, retaining date-specific adjustments.
function salesAmount(row){
 const raw=normalize(find(row,'Sales Amount','Sales Value','Amount'));
 if(raw==='')return null;
 const value=Number(raw.replace(/(?:PHP|₱|,|\s)/gi,''));return Number.isFinite(value)?value:null;
}
function rowSrp(row){const amount=salesAmount(row);return amount!==null&&row._qty!==0&&amount/row._qty>=0?amount/row._qty:null;}
function financialTotals(rows){
 return rows.reduce((t,r)=>{const amount=salesAmount(r),price=rowSrp(r);t.units+=r._qty;
 if(amount===null)t.missingAmount+=1;else t.amount+=amount;
 if(r._qty!==0&&price===null)t.missingPrice+=1;else if(price>13000)t.premiumUnits+=r._qty;
 return t;},{units:0,amount:0,premiumUnits:0,missingAmount:0,missingPrice:0});
}
function lineupData(all,month,filters){
 const previous=modelMonthOffset(month,-1),groups=new Map();
 all.forEach(r=>{
  const m=modelMonthKey(r._date);if((m!==month&&m!==previous)||!filters.every(([key,value])=>passes(r[key],value)))return;
  const key=r._model||'Unknown';if(!groups.has(key))groups.set(key,{model:key,series:r._series||UNMAPPED_SERIES,previous:0,current:0,latest:'',prices:new Set(),hasSale:false});
  const g=groups.get(key);g[m===month?'current':'previous']+=r._qty;
  if(r._qty>0)g.hasSale=true;
  const price=rowSrp(r);if(price===null||r._qty<=0)return;
  const date=m+'-'+String(r._date.getDate()).padStart(2,'0');
  if(date>g.latest){g.latest=date;g.prices=new Set();}if(date===g.latest)g.prices.add(price);
 });
 return [...groups.values()].filter(g=>g.hasSale).sort((a,b)=>a.model.localeCompare(b.model));
}
const php=value=>'₱'+fmt(value,2);
function renderFinancials(){
 const rows=state.filteredSales,t=financialTotals(rows),hasRows=rows.length>0;
 $('salesAmountKpi').textContent=hasRows&&!t.missingAmount?php(t.amount):'—';
 $('aspKpi').textContent=hasRows&&!t.missingAmount&&t.units>0?php(t.amount/t.units):'—';
 $('premiumKpi').textContent=hasRows&&!t.missingPrice?fmt(t.premiumUnits):'—';
 $('premiumShare').textContent=hasRows&&!t.missingPrice&&t.units>0?pct(t.premiumUnits/t.units*100)+' of units sold':'Share unavailable';
 $('amountNote').textContent=t.missingAmount?'Sales Amount missing in '+fmt(t.missingAmount)+' rows':'total Sales Amount · PHP';
 $('aspNote').textContent=t.missingAmount?'Upload sales amounts to calculate ASP':'Sales Amount ÷ total units sold';
 const month=selected('monthFilter');if(!/^\d{4}-\d{2}$/.test(month)){$('lineupTableBody').innerHTML=emptyRow(7);return;}
 const previous=modelMonthOffset(month,-1);
 const filters=[['_area',selected('areaFilter')],['_asm',selected('asmFilter')],['_customer',selected('customerFilter')],['_channel',selected('channelFilter')],['_model',selected('modelFilter')],['_series',selected('seriesFilter')],['_priceRange',selected('priceRangeFilter')]];
 const labels=['Model','Smartphone Series',monthName(previous),monthName(month),'Total Units','Latest SRP','Price Date'];
 const table=$('lineupTableBody').closest('table');
 [...table.tHead.rows[0].cells].forEach((cell,i)=>{const button=cell.querySelector('.table-sort-button');if(button){button.setAttribute('aria-label','Sort by '+labels[i]);button.textContent=labels[i]+({'ascending':' ↑','descending':' ↓'}[cell.getAttribute('aria-sort')]||' ↕');}else cell.textContent=labels[i];});
 const lineup=lineupData(salesEnriched(),month,filters);
 $('lineupPeriod').textContent=monthName(previous)+' + '+monthName(month)+' · uploaded sales only. All filters apply.';
 $('lineupTableBody').innerHTML=lineup.map(g=>{const prices=[...g.prices].sort((a,b)=>a-b),low=prices[0],high=prices[prices.length-1];const price=prices.length?(low===high?php(low):php(low)+' – '+php(high)):'—';return '<tr><td><strong>'+escapeHtml(g.model)+'</strong></td><td>'+escapeHtml(g.series)+'</td><td>'+fmt(g.previous)+'</td><td>'+fmt(g.current)+'</td><td>'+fmt(g.previous+g.current)+'</td><td data-sort-value="'+(low??'')+'">'+price+'</td><td>'+ (g.latest||'—')+'</td></tr>';}).join('')||emptyRow(7);
}
// Keep the original calculation elements hidden for existing chart code.
const financialCards=[['targetKpi','Sales Amount (PHP)','salesAmountKpi','amountNote','total Sales Amount · PHP'],['achievementKpi','ASP (PHP)','aspKpi','aspNote','Sales Amount ÷ total units sold'],['gapKpi','Sales above ₱13,000','premiumKpi','premiumShare','share of total units sold']];
financialCards.forEach(([oldId,label,id,noteId,note])=>{
 const old=$(oldId).closest('article');old.hidden=true;
 const card=document.createElement('article');card.className='kpi-card card';card.innerHTML='<span class="kpi-label">'+label+'</span><div class="kpi-value" id="'+id+'">—</div><span class="kpi-note" id="'+noteId+'">'+note+'</span>';old.before(card);
});
const financialStyle=document.createElement('style');financialStyle.textContent='.kpi-card[hidden]{display:none}#salesAmountKpi{font-size:clamp(20px,2vw,32px)}#lineupTableBody td{font-variant-numeric:tabular-nums}#lineupTableBody td:nth-child(6){white-space:nowrap}';document.head.appendChild(financialStyle);
const lineupTab=document.createElement('button');lineupTab.className='nav-item';lineupTab.dataset.section='lineup';lineupTab.textContent='Current Smartphone Line-up';document.querySelector('.nav-item[data-section="dealers"]').after(lineupTab);
const lineupSection=document.createElement('section');lineupSection.id='lineupSection';lineupSection.className='dashboard-section';
lineupSection.innerHTML='<article class="card table-card"><div class="card-head"><div><h2>Current Smartphone Line-up</h2><p id="lineupPeriod">Select a month with uploaded sales.</p></div></div><p class="score-note">Models sold in the selected month and the previous month. SRP = Sales Amount ÷ units for each row. Latest SRP uses the latest dated sale with an available price in this view; if that date has multiple prices, their range is shown. Price Date shows when that price was recorded. Missing prices show —.</p><div class="table-wrap"><table class="model-history-table"><thead><tr><th>Model</th><th>Smartphone Series</th><th>Previous Month</th><th>Selected Month</th><th>Total Units</th><th>Latest SRP</th><th>Price Date</th></tr></thead><tbody id="lineupTableBody"><tr><td colspan="7">No shared sales loaded yet.</td></tr></tbody></table></div></article>';
$('dealersSection').after(lineupSection);
const renderBeforeFinancials=render;render=()=>{renderBeforeFinancials();renderFinancials();};

// Filter history is personal to this page and resets when a new dataset loads.
(()=>{
 const ids=['monthFilter','areaFilter','asmFilter','customerFilter','channelFilter','modelFilter','seriesFilter','priceRangeFilter'];
 const bar=document.querySelector('.filters'),history=[];
 const read=()=>Object.fromEntries(ids.map(id=>[id,$(id).value]));
 let current=read();
 const actions=document.createElement('div');actions.className='filter-actions';
 actions.innerHTML='<button type="button" class="secondary-btn" id="clearFiltersBtn">Clear Filter</button><button type="button" class="secondary-btn" id="undoFiltersBtn" disabled>Undo</button>';
 bar.prepend(actions);
 const style=document.createElement('style');style.textContent='.filter-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px}.filter-actions .secondary-btn{margin:0;padding:7px 13px}.filter-actions button:disabled{opacity:.45;cursor:default}';document.head.appendChild(style);
 const same=(a,b)=>ids.every(id=>a[id]===b[id]);
 function controls(){$('undoFiltersBtn').disabled=!history.length;$('clearFiltersBtn').disabled=ids.slice(1).every(id=>$(id).value==='ALL');}
 function remember(next){if(same(current,next))return;history.push(current);if(history.length>100)history.shift();current=next;controls();}
 function apply(next){ids.forEach(id=>{$(id).value=next[id];});current=read();controls();render();}
 bar.addEventListener('change',event=>{if(ids.includes(event.target.id))remember(read());},true);
 $('clearFiltersBtn').addEventListener('click',()=>{const next={...read()};ids.slice(1).forEach(id=>next[id]='ALL');remember(next);apply(next);});
 $('undoFiltersBtn').addEventListener('click',()=>{if(history.length)apply(history.pop());});
 const beforeBuildFilters=buildFilters;buildFilters=()=>{beforeBuildFilters();history.length=0;current=read();controls();};
 controls();
})();

// Overview charts can be collapsed without changing filters or table results.
(()=>{
 const overview=$('overviewSection'),control=document.createElement('div');control.className='overview-chart-controls';
 control.innerHTML='<button type="button" class="secondary-btn" id="overviewChartsToggle" aria-expanded="true">Hide charts</button>';
 overview.prepend(control);
 const grids=[...overview.querySelectorAll('.grid-2,.grid-3')].filter(grid=>grid.querySelector('.chart-card'));
 grids.forEach((grid,i)=>grid.id='overviewCharts'+i);
 const toggle=$('overviewChartsToggle');toggle.setAttribute('aria-controls',grids.map(grid=>grid.id).join(' '));
 let hidden=false;try{hidden=localStorage.getItem('evis.overviewChartsHidden')==='true';}catch{}
 function apply(){grids.forEach(grid=>grid.hidden=hidden);toggle.textContent=hidden?'Show charts':'Hide charts';toggle.setAttribute('aria-expanded',String(!hidden));}
 toggle.addEventListener('click',()=>{hidden=!hidden;try{localStorage.setItem('evis.overviewChartsHidden',String(hidden));}catch{}apply();});apply();
 const style=document.createElement('style');style.textContent='.overview-chart-controls{display:flex;justify-content:flex-end;margin:0 0 14px}#overviewSection [hidden]{display:none!important}#overviewSection .model-history-table .model-rate{white-space:nowrap;font-weight:600}#overviewSection .model-history-table .up{color:#238344}#overviewSection .model-history-table .down{color:#c63c3c}#overviewSection .model-history-table .steady{color:#286bc1}';document.head.appendChild(style);
 const source=$('modelTableBody').closest('article');
 for(const [id,title,label] of [['seriesTableBody','Series Performance','Series'],['priceRangeTableBody','Price Range Performance','Price Range'],['areaPerformanceBody','Area Performance','Area'],['channelPerformanceBody','Channel Performance','Channel']]){
  const card=source.cloneNode(true);card.querySelector('h2').textContent=title;card.querySelector('tbody').id=id;
  card.querySelector('table').setAttribute('aria-label',title);card.querySelector('th').textContent=label;
  overview.append(card);
 }
 const before=render;render=()=>{before();renderModelHistory(state.filteredSales,'seriesTableBody','_series','Series');renderModelHistory(state.filteredSales,'priceRangeTableBody','_priceRange','Price Range');renderModelHistory(state.filteredSales,'areaPerformanceBody','_area','Area');renderModelHistory(state.filteredSales,'channelPerformanceBody','_channel','Channel');};
})();

// KPI comparisons use calendar-day coverage from the full upload, including zero-sale days.
const OVERVIEW_UNIT_TARGETS={'2026-09':8000,'2026-08':8000};
function overviewKpiPeriod(all,month,filters){
 const previous=modelMonthOffset(month,-1),dayCount=m=>{const [y,n]=m.split('-').map(Number);return new Date(y,n,0).getDate();};
 const currentAll=all.filter(r=>modelMonthKey(r._date)===month),priorAll=all.filter(r=>modelMonthKey(r._date)===previous);
 const cutoff=currentAll.reduce((max,r)=>Math.max(max,r._date.getDate()),0),priorEnd=Math.min(cutoff,dayCount(previous));
 const priorLatest=priorAll.reduce((max,r)=>Math.max(max,r._date.getDate()),0);
 const matches=r=>filters.every(([key,value])=>passes(r[key],value));
 return {previous,cutoff,priorEnd,currentDays:dayCount(month),priorDays:dayCount(previous),available:cutoff>0&&priorLatest>=priorEnd,current:financialTotals(currentAll.filter(matches)),prior:financialTotals(priorAll.filter(r=>r._date.getDate()<=priorEnd&&matches(r)))};
}
function overviewRequiredRate(units,target,remaining){return target==null?null:units>=target?0:remaining>0?(target-units)/remaining:null;}
(()=>{
 const ids=['salesKpi','salesAmountKpi','aspKpi','premiumKpi','runRateKpi','requiredRunRateKpi'];
 ids.forEach(id=>{const note=document.createElement('div');note.id=id+'Comparison';note.className='overview-kpi-comparison';$(id).closest('article').append(note);});
 for(const [id,label] of [['modelTableBody','Model Performance'],['seriesTableBody','Series Performance'],['priceRangeTableBody','Price Range Performance'],['areaPerformanceBody','Area Performance'],['channelPerformanceBody','Channel Performance']]){
  const card=$(id).closest('article'),content=$(id).closest('.table-wrap'),button=document.createElement('button');
  button.type='button';button.className='secondary-btn';button.setAttribute('aria-label','Hide '+label);content.id=id+'Content';button.setAttribute('aria-controls',content.id);
  card.querySelector('.card-head').append(button);let hidden=false;try{hidden=localStorage.getItem('evis.hidden.'+id)==='true';}catch{}
  function apply(){content.hidden=hidden;button.textContent=hidden?'Show table':'Hide table';button.setAttribute('aria-label',(hidden?'Show ':'Hide ')+label);button.setAttribute('aria-expanded',String(!hidden));}
  button.addEventListener('click',()=>{hidden=!hidden;try{localStorage.setItem('evis.hidden.'+id,String(hidden));}catch{}apply();});apply();
 }
 const style=document.createElement('style');style.textContent='.overview-kpi-comparison{font-size:11px;line-height:1.5;color:#737b87;margin-top:9px}.overview-kpi-comparison .up{color:#238344}.overview-kpi-comparison .down{color:#c63c3c}.overview-kpi-comparison .steady{color:#286bc1}.overview-kpi-comparison .kpi-ir{font-weight:600;white-space:nowrap}#overviewSection .card-head>.secondary-btn{flex-shrink:0;margin-left:12px}';document.head.appendChild(style);
 function comparison(id,value,previous,format,label){
  const rate=modelRate(value,previous),symbol={up:'▲',down:'▼',steady:'━',missing:''}[rate.kind];
  $(id+'Comparison').innerHTML=escapeHtml(label)+': '+(previous===null?'—':escapeHtml(format(previous)))+'<br><span class="kpi-ir '+rate.kind+'">IR '+symbol+' '+rate.text+'</span>';
 }
 function update(){
  const month=selected('monthFilter');if(!/^\d{4}-\d{2}$/.test(month))return;
  const filters=[['_area',selected('areaFilter')],['_asm',selected('asmFilter')],['_customer',selected('customerFilter')],['_channel',selected('channelFilter')],['_model',selected('modelFilter')],['_series',selected('seriesFilter')],['_priceRange',selected('priceRangeFilter')]];
  const p=overviewKpiPeriod(salesEnriched(),month,filters),c=p.current,b=p.prior,label=monthName(p.previous)+' 1–'+(p.priorEnd||'—');
  const amount=t=>t.missingAmount?null:t.amount,asp=t=>t.missingAmount||t.units<=0?null:t.amount/t.units,premium=t=>t.missingPrice?null:t.premiumUnits;
  const daily=p.cutoff?c.units/p.cutoff:null,priorDaily=p.priorEnd?b.units/p.priorEnd:null;
  const target=OVERVIEW_UNIT_TARGETS[month],priorTarget=OVERVIEW_UNIT_TARGETS[p.previous];
  const required=p.cutoff?overviewRequiredRate(c.units,target,p.currentDays-p.cutoff):null,priorRequired=overviewRequiredRate(b.units,priorTarget,p.priorDays-p.priorEnd);
  $('runRateKpi').textContent=daily===null?'—':fmt(daily,1);$('runRateKpi').closest('article').querySelector('.kpi-note').textContent='units / elapsed calendar day';
  $('requiredRunRateKpi').textContent=required===null?'—':fmt(required,1);
  $('requiredRunRateKpi').closest('article').querySelector('.kpi-note').textContent=target==null?'No monthly unit target set':fmt(target)+'-unit target · '+Math.max(p.currentDays-p.cutoff,0)+' days remaining';
  $('requiredRunRateKpi').closest('article').title='Monthly unit target stays unchanged when filters are applied. Required rate = remaining units / remaining calendar days.';
  const values=[[c.units,b.units,v=>fmt(v)],[amount(c),amount(b),php],[asp(c),asp(b),php],[premium(c),premium(b),v=>fmt(v)+(b.units>0?' ('+pct(v/b.units*100)+')':'')],[daily,priorDaily,v=>fmt(v,1)],[required,priorRequired,v=>fmt(v,1)]];
  ids.forEach((id,i)=>comparison(id,p.cutoff?values[i][0]:null,p.available?values[i][1]:null,values[i][2],label));
  if(priorTarget==null)$('requiredRunRateKpiComparison').insertAdjacentHTML('beforeend','<br>Previous-month target not set');
 }
 const before=render;render=()=>{before();update();};
})();
