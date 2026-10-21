// Territory performance uses the latest uploaded calendar day in the selected month.
let performanceMeasure='points',PS_QTY_TARGET=30;
function performanceTarget(measure){return measure==='qty'?PS_QTY_TARGET:PS_SCORE_TARGET;}
function performanceValue(g,measure){return measure==='qty'?g.units:g.points;}
function performanceText(g,measure){return measure==='qty'?fmt(g.units):scoreText(g);}
function performanceStatusLabel(status,measure){return status==='pending'&&measure==='qty'?'Awaiting sales data':performanceLabels[status];}
function performanceHeader(table,index,label){
 const header=table.tHead.rows[0].cells[index],button=header.querySelector('.table-sort-button');
 if(button){button.setAttribute('aria-label','Sort by '+label);button.textContent=label+({'ascending':' ↑','descending':' ↓'}[header.getAttribute('aria-sort')]||' ↕');}else header.textContent=label;
}
function performancePeriod(rows,month,measure='points',target=performanceTarget(measure)){
  const [year,m]=month.split('-').map(Number);
  const days=year&&m?new Date(year,m,0).getDate():0;
  let elapsed=0;
  rows.forEach(r=>{const d=r._date;if(d&&!isNaN(d)&&d.getFullYear()===year&&d.getMonth()+1===m)elapsed=Math.max(elapsed,d.getDate());});
  return {days,elapsed,measure,target,threshold:days&&elapsed&&Number.isFinite(target)&&target>0?target*elapsed/days:null};
}
function performanceStatus(g,period){
  const measure=period.measure||'points',value=performanceValue(g,measure);
  if(period.threshold===null||!Number.isFinite(value)||(measure==='points'&&(!scoreFile||g.missing)))return 'pending';
  return value>=(period.target??performanceTarget(measure))?'passed':value<period.threshold?'low':'onpace';
}
function territoryPerformance(rows,key,period){
  const territories=new Map();
  rows.forEach(r=>{const label=key==='_area'?(r._area||'Unassigned Area'):`${r._area||'Unassigned Area'} / ${r._asm||'Unassigned Subregion'}`;if(!territories.has(label))territories.set(label,[]);territories.get(label).push(r);});
  return [...territories].map(([label,items])=>{
    const assigned=items.filter(r=>normalize(r._ps)!=='');
    const promoters=scoreGroups(assigned,'_ps');
    const total=scoreTotals(assigned),all=scoreTotals(items);
    const counts={passed:0,onpace:0,low:0,pending:0};
    promoters.forEach(g=>counts[performanceStatus(g,period)]++);
    return {label,promoters,headcount:promoters.length,...counts,...all,average:promoters.length?performanceValue(total,period.measure)/promoters.length:null,averageMissing:period.measure!=='qty'&&total.missing,unassigned:items.length-assigned.length};
  }).sort((a,b)=>a.label.localeCompare(b.label));
}
let performanceDrilldowns=[];
const performanceCohorts={area:'ALL PS',subregion:'ALL PS'};
let performanceLastRows=[];
function performanceCohortData(all,roster,month){
 const cutoff=all.filter(r=>modelMonthKey(r._date)===month).reduce((d,r)=>Math.max(d,productivityCalendarDay(r._date)??-Infinity),-Infinity);
 const hires=performanceHireDates(all,roster,cutoff),types=new Map();
 for(const entry of roster){const record=hires.get(entry.key);types.set(entry.key,record&&record.day===null?'unknown':promoterMonthCohort(record?.day,month,cutoff));}
 return {cutoff,types,hires};
}
function performanceCohortRows(rows,cohort,types){return rows.filter(r=>{const type=types.get(r._ps);return cohort==='ALL PS'?type==='REG PS'||type==='NHT':type===cohort;});}
function performanceDailyAverage(promoters,hires,month,cutoff){
 const [year,m]=month.split('-').map(Number),monthStart=Date.UTC(year,m-1,1)/86400000;
 const people=promoters.map(g=>{
  const hire=hires.get(g.id)?.day,start=hire==null?null:Math.max(monthStart,hire);
  const days=start!==null&&Number.isFinite(cutoff)&&cutoff>=start?cutoff-start+1:null;
  const units=days===null?null:g.items.reduce((sum,r)=>{const day=productivityCalendarDay(r._date);return day!==null&&day>=start&&day<=cutoff?sum+r._qty:sum;},0);
  return {...g,hire,start,days,dailyUnits:units,dailyAverage:days===null?null:units/days};
 });
 const days=people.reduce((sum,p)=>sum+(p.days||0),0),units=people.reduce((sum,p)=>sum+(p.dailyUnits||0),0),missing=people.some(p=>p.days===null);
 return {people,days,units,missingCount:people.filter(p=>p.days===null).length,average:!missing&&days>0?units/days:null};
}
const performanceLabels={passed:'Target reached',onpace:'On-Pace',low:'Low performance',pending:'Incomplete / Awaiting scores'};
function performanceCell(value,promoters,label,status,period,daily=null){
 const people=status?promoters.filter(g=>performanceStatus(g,period)===status):promoters;
 const index=performanceDrilldowns.push({people,label,status,period,daily})-1;
 return '<button type="button" class="performance-drilldown" data-performance-drilldown="'+index+'" aria-label="'+escapeHtml('Show promoters: '+label+' · '+(performanceStatusLabel(status,period.measure)||'All promoters'))+'">'+value+'</button>';
}
function renderTerritoryPerformance(rows){
  performanceLastRows=rows;
  performanceDrilldowns=[];
  const measure=performanceMeasure,qty=measure==='qty',target=performanceTarget(measure);
  $('psTargetKpi').textContent=fmt(target,qty?0:2);
  const all=salesEnriched(),period=performancePeriod(all,selected('monthFilter'),measure);
  syncPerformanceControls();
  const cohortData=performanceCohortData(all,window.evisRoster?.getRoster()?.entries||[],selected('monthFilter'));
  rows=performanceCohortRows(rows,'ALL PS',cohortData.types);
  ['area','subregion'].forEach(kind=>{
    const cohort=performanceCohorts[kind],groups=territoryPerformance(performanceCohortRows(rows,cohort,cohortData.types),kind==='area'?'_area':'_asm',period);
    const perDay=qty&&cohort==='NHT';
    const dailyFor=promoters=>performanceDailyAverage(promoters,cohortData.hires,selected('monthFilter'),cohortData.cutoff);
    if(perDay)groups.forEach(g=>{g.daily=dailyFor(g.promoters);g.average=g.daily.average;});
    document.querySelectorAll('[data-performance-kind="'+kind+'"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.performanceCohort===cohort)));
    const cutoffLabel=Number.isFinite(cohortData.cutoff)?new Date(cohortData.cutoff*86400000).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'date unavailable';
    $('performance'+kind+'CohortNote').textContent='Current active PS · '+cohort+' · Reporting cutoff: '+cutoffLabel+'. NHT: hired within the selected month. REG PS: hired before the selected month. Missing or invalid hire dates and hires after month-end are excluded from all headcounts.'+(perDay?' Average Sales / PS-Day = units since hire within the selected month ÷ total calendar promoter-days through the cutoff (hire day counts as day 1). Zero-sales promoters count. A group’s average is unavailable until every included promoter has at least one elapsed day. Click an average for details.':'');
    const detailLabel=label=>label+' · '+cohort;
    const rowHtml=g=>'<tr><td>'+escapeHtml(g.label)+'</td>'+[
      performanceCell(fmt(g.headcount),g.promoters,detailLabel(g.label),null,period),
      performanceCell(performanceText(g,measure),g.promoters,detailLabel(g.label),null,period),
      performanceCell((qty||scoreFile)&&g.average!==null?fmt(g.average,2)+(g.averageMissing?' *':''):'—',g.promoters,detailLabel(g.label),null,period,g.daily),
      ...['passed','onpace','low','pending'].map(status=>performanceCell(g[status],g.promoters,detailLabel(g.label),status,period))
    ].map((value,i)=>'<td data-sort-value="'+([g.headcount,(qty||scoreFile)?performanceValue(g,measure):null,(qty||scoreFile)?g.average:null,g.passed,g.onpace,g.low,g.pending][i]??'')+'">'+value+'</td>').join('')+'</tr>';
    const body=$('performance'+kind+'Body'),table=body.closest('table');
    performanceHeader(table,2,qty?'Running sales (units)':'Running score');performanceHeader(table,3,perDay?'Average Sales / PS-Day':qty?'Average units / PS':'Average / PS');performanceHeader(table,7,qty?'Awaiting sales data':'Incomplete / Awaiting Scores');
    body.innerHTML=groups.map(rowHtml).join('')||emptyRow(8);
    const total=groups.reduce((t,g)=>{for(const key of ['headcount','units','points','passed','onpace','low','pending'])t[key]+=g[key];t.missing||=g.missing;t.averageMissing||=g.averageMissing;t.promoters.push(...g.promoters);return t;},{label:'WVIS',headcount:0,units:0,points:0,passed:0,onpace:0,low:0,pending:0,missing:false,averageMissing:false,promoters:[]});
    total.average=total.headcount?total.promoters.reduce((sum,g)=>sum+performanceValue(g,measure),0)/total.headcount:null;
    if(perDay){total.daily=dailyFor(total.promoters);total.average=total.daily.average;}
    const footer=body.closest('table').tFoot||body.closest('table').createTFoot();footer.removeAttribute('data-summary-auto');footer.dataset.summary='history';footer.innerHTML=rowHtml(total);

  });
  const groups=scoreGroups(rows,'_ps'),byId=new Map(groups.map(g=>[g.id,g])),total=scoreTotals(rows);
  const promoterTable=$('promoterScoreBody').closest('table'),promoterCard=promoterTable.closest('article');
  promoterCard.querySelector('h2').textContent=qty?'Promoter Sellout':'Promoter Running Scores';
  performanceHeader(promoterTable,4,qty?'Target (units)':'Target (points)');performanceHeader(promoterTable,6,qty?'Units to target':'Points to target');
  document.querySelectorAll('#promoterScoreBody tr[data-promoter-id]').forEach(tr=>{
   const g=byId.get(tr.dataset.promoterId);if(!g||g.id==='Unassigned'||tr.cells.length!==8)return;
   const status=performanceStatus(g,period),value=performanceValue(g,measure),available=qty||scoreFile,partial=!qty&&g.missing?' *':'';
   for(const [index,n,text] of [[4,target,fmt(target,qty?0:2)],[5,available?value/target*100:null,available?pct(value/target*100)+partial:'—'],[6,available?Math.max(target-value,0):null,available?fmt(Math.max(target-value,0),qty?0:2)+partial:'—']]){tr.cells[index].textContent=text;tr.cells[index].dataset.sortValue=n??'';}
   tr.cells[7].textContent=performanceStatusLabel(status,measure);tr.cells[7].dataset.performanceStatus=status;
  });
  $('runningScoreKpi').textContent=performanceText(total,measure);$('runningScoreKpi').closest('article').querySelector('.kpi-label').textContent=qty?'Running Sales (units)':'Running Score';
  $('psTargetKpi').closest('article').querySelector('.kpi-note').textContent=qty?'units sold per promoter':'points per promoter';
  $('reachedScoreKpi').textContent=qty||scoreFile?fmt(groups.filter(g=>g.id!=='Unassigned'&&performanceStatus(g,period)==='passed').length):'—';
  $('unscoredKpi').closest('article').hidden=qty;promoterCard.querySelector('details').hidden=qty;
  if(qty)$('scoreNotice').textContent='Sales units and unit targets follow the current filters. Returns are included. Missing model points do not prevent quantity achievement.';

}
function mountTerritoryPerformance(){
  const style=document.createElement('style');
  style.textContent='.performance-panel{margin:18px 0;padding:24px;box-shadow:none;border:1px solid #dfe2e6;border-radius:8px}.performance-panel h2{font-size:18px;margin:0 0 16px}.performance-panel table{width:100%;border-collapse:collapse;border:1px solid #dfe2e6}.performance-panel th,.performance-panel td{border:1px solid #dfe2e6;padding:12px 14px;text-align:right;font-variant-numeric:tabular-nums}.performance-panel th{background:#f7f8fa;font-weight:600}.performance-panel th:first-child,.performance-panel td:first-child{text-align:left}.performance-panel tbody tr:hover{background:#fafafa}.promoter-score-panel{box-shadow:none;border:1px solid #dfe2e6;border-radius:8px}.promoter-score-panel table{border-collapse:collapse;width:100%}.promoter-score-panel th,.promoter-score-panel td{border:1px solid #dfe2e6;padding:12px 14px;font-variant-numeric:tabular-nums}.promoter-score-panel th{background:#f7f8fa}.promoter-score-panel td[data-performance-status]{font-weight:600;white-space:nowrap}.promoter-score-panel td[data-performance-status=passed]{background:#e2f3e5;color:#235b32}.promoter-score-panel td[data-performance-status=low]{background:#fbe3e3;color:#8c3030}.promoter-score-panel td[data-performance-status=onpace]{background:#fff0db;color:#80501d}.promoter-score-panel td[data-performance-status=pending]{background:#f2f3f5;color:#555}';
  document.head.appendChild(style);
  $('promoterScoreBody').closest('article').classList.add('promoter-score-panel');
  style.textContent+='.performance-panel .card-head{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:12px}.performance-panel .card-head h2{margin:0}.performance-cohort-controls{display:flex;gap:6px;flex-wrap:wrap}.performance-cohort-controls button{font-size:12px;padding:8px 12px;white-space:nowrap}.performance-cohort-controls button[aria-pressed="true"]{background:#fff2bc;border-color:#d4ad20;color:#111214}.performance-cohort-note{font-size:11px;color:var(--muted);margin:0 0 12px}';
  $('promotersSection').insertAdjacentHTML('afterbegin',['area','subregion'].map(kind=>`<article class="card performance-panel"><div class="card-head"><h2>${kind==='area'?'Area':'Subregion'} Performance</h2><div class="performance-cohort-controls" role="group" aria-label="${kind==='area'?'Area':'Subregion'} performance PS type">${['ALL PS','REG PS','NHT'].map(cohort=>`<button type="button" class="secondary-btn" data-performance-kind="${kind}" data-performance-cohort="${cohort}" aria-pressed="${cohort==='ALL PS'}">${cohort}</button>`).join('')}</div></div><div class="performance-cohort-note" id="performance${kind}CohortNote" role="status"></div><div class="table-wrap"><table><thead><tr><th>${kind==='area'?'Area':'Area / Subregion'}</th><th>PS headcount</th><th>Running score</th><th>Average / PS</th><th>Target Reached</th><th>On-Pace</th><th>Low Performance</th><th>Incomplete / Awaiting Scores</th></tr></thead><tbody id="performance${kind}Body"></tbody></table></div></article>`).join(''));
}
const originalTerritoryScores=renderScores;
renderScores=rows=>{originalTerritoryScores(rows);renderTerritoryPerformance(rows);};
mountTerritoryPerformance();
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-performance-cohort]');if(!button)return;
 const kind=button.dataset.performanceKind,cohort=button.dataset.performanceCohort;
 if(!Object.hasOwn(performanceCohorts,kind)||!['ALL PS','REG PS','NHT'].includes(cohort))return;
 performanceCohorts[kind]=cohort;renderTerritoryPerformance(performanceLastRows);
});

const PS_TARGET_STORAGE='evis.psMonthlyTarget',PS_QTY_TARGET_STORAGE='evis.psMonthlyUnitTarget',PS_MEASURE_STORAGE='evis.psPerformanceMeasure';
try{
 for(const [key,measure] of [[PS_TARGET_STORAGE,'points'],[PS_QTY_TARGET_STORAGE,'qty']]){const saved=Number(localStorage.getItem(key));if(Number.isFinite(saved)&&saved>0){if(measure==='qty')PS_QTY_TARGET=saved;else PS_SCORE_TARGET=saved;}}
 const saved=localStorage.getItem(PS_MEASURE_STORAGE);if(['qty','points'].includes(saved))performanceMeasure=saved;
}catch(error){}
$('promotersSection').insertAdjacentHTML('afterbegin',`<article class="card performance-panel performance-target-panel"><div class="performance-target-row"><div><label for="psTargetInput"><strong id="psTargetLabel">Monthly target per promoter (points)</strong></label><input id="psTargetInput" type="number" min="0.01" step="any" value="${performanceTarget(performanceMeasure)}" aria-describedby="psTargetHelp psTargetStatus"></div><div class="performance-cohort-controls" role="group" aria-label="Promoter performance measure"><button type="button" class="secondary-btn" data-performance-measure="qty" aria-pressed="false">QTY</button><button type="button" class="secondary-btn" data-performance-measure="points" aria-pressed="true">POINTS</button></div></div><div id="psTargetHelp" class="score-note performance-target-help"></div><p id="psTargetStatus" class="score-note" role="status"></p></article>`);
const performanceTargetStyle=document.createElement('style');performanceTargetStyle.textContent='.performance-target-row{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap}.performance-target-row input{display:block;width:180px;max-width:100%;margin:12px 0 0;padding:10px;border:1px solid var(--line);border-radius:6px;color:var(--text);background:var(--card)}.performance-target-help{color:var(--muted);font-size:12px}.performance-target-panel [role=group]{margin-left:auto}';document.head.append(performanceTargetStyle);
function syncPerformanceControls(){
 const qty=performanceMeasure==='qty';
 $('psTargetLabel').textContent='Monthly target per promoter ('+(qty?'units sold':'points')+')';
 $('psTargetHelp').textContent=(qty?'QTY uses units sold for the selected product and territory filters.':'POINTS uses the uploaded model scores.')+' Targets are saved separately in this browser. On-Pace means reaching the target × elapsed days ÷ days in the selected month.';
 document.querySelectorAll('[data-performance-measure]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.performanceMeasure===performanceMeasure)));
}
let psTargetTimer;
$('psTargetInput').addEventListener('input',()=>{
 clearTimeout(psTargetTimer);const value=$('psTargetInput').valueAsNumber;
 if(!Number.isFinite(value)||value<=0){$('psTargetStatus').textContent='Enter a target greater than zero. The previous target remains active.';return;}
 if(performanceMeasure==='qty')PS_QTY_TARGET=value;else PS_SCORE_TARGET=value;
 try{localStorage.setItem(performanceMeasure==='qty'?PS_QTY_TARGET_STORAGE:PS_TARGET_STORAGE,String(value));$('psTargetStatus').textContent='Target saved in this browser.';}catch(error){$('psTargetStatus').textContent='Target updated for this session; browser storage is unavailable.';}
 psTargetTimer=setTimeout(()=>render(),350);
});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-performance-measure]');if(!button||!['qty','points'].includes(button.dataset.performanceMeasure))return;
 clearTimeout(psTargetTimer);performanceMeasure=button.dataset.performanceMeasure;
 try{localStorage.setItem(PS_MEASURE_STORAGE,performanceMeasure);}catch{}
 $('psTargetInput').value=performanceTarget(performanceMeasure);$('psTargetStatus').textContent='';syncPerformanceControls();render();
});
syncPerformanceControls();


function performanceWeeklyScores(all,rows,month){
 const day=r=>productivityCalendarDay(r._date);
 const cutoff=all.filter(r=>modelMonthKey(r._date)===month).reduce((m,r)=>Math.max(m,day(r)??-Infinity),-Infinity);
 if(!Number.isFinite(cutoff))return {weeks:[],scores:new Map()};
 const coverage=new Set(all.map(day).filter(d=>d!==null));
 const weeks=Array.from({length:5},(_,i)=>{const end=cutoff-i*7,start=end-6;return {start,end,available:Array.from({length:7},(_,j)=>start+j).every(d=>coverage.has(d))};});
 const scores=new Map();
 for(const row of rows){
  const d=day(row);if(d===null)continue;
  const i=weeks.findIndex(w=>d>=w.start&&d<=w.end);if(i<0)continue;
  if(!scores.has(row._ps))scores.set(row._ps,Array.from({length:5},()=>({points:0,units:0,missing:false})));
  const item=scores.get(row._ps)[i];item.units+=row._qty;if(row._points==null)item.missing=true;else item.points+=row._points;
 }
 return {weeks,scores};
}
function performanceHireDates(all,roster,cutoff){
 const ids=new Map(roster.filter(e=>e.id).map(e=>[e.id,e])),names=new Map(roster.map(e=>[rosterName(e.name),e])),hires=new Map();
 for(const row of all){
  const d=productivityCalendarDay(row._date);if(d===null||d>cutoff)continue;
  const id=rosterCode(row._ps),named=names.get(rosterName(find(row,'PS Name','Promoter Name'))),entry=ids.get(id)||((!id||!named?.id)&&named);
  const value=find(row,'SR Hire Date','Hire Date');if(!entry||!normalize(value))continue;
  if(!hires.has(entry.key)||d>=hires.get(entry.key).record)hires.set(entry.key,{record:d,day:productivityHireDay(value)});
 }
 return hires;
}
function performanceWeeklyIR(current,previous,available,measure='points'){
 if(!available||(measure==='points'&&(!scoreFile||current.missing||previous.missing))||performanceValue(previous,measure)===0)return '<span class="missing">N/A</span>';
 const rate=modelRate(performanceValue(current,measure),performanceValue(previous,measure));
 return '<span class="'+rate.kind+'">'+({up:'▲',down:'▼',steady:'━'}[rate.kind]||'')+' '+rate.text+'</span>';
}
// Drilldowns use the same grouped, filtered promoters and status calculation as each cell.
const performanceDialog=document.createElement('dialog');
performanceDialog.className='performance-dialog';
performanceDialog.setAttribute('aria-labelledby','performanceDialogTitle');
document.body.append(performanceDialog);
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-performance-drilldown]');if(!button)return;
 const detail=performanceDrilldowns[Number(button.dataset.performanceDrilldown)];if(!detail)return;
 const roster=window.evisRoster?.getRoster()?.entries||[];
 const people=detail.people,measure=detail.period.measure||'points',qty=measure==='qty',target=detail.period.target??performanceTarget(measure);
 if(detail.daily){
  const date=day=>day==null?'Unavailable':new Date(day*86400000).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  const headings=['Promoter','Current Store','Hire Date','Counted From','Calendar Days','Sales Units','Sales / PS-Day'];
  const daily=detail.daily;
  performanceDialog.innerHTML='<div class="performance-dialog-head"><h2 id="performanceDialogTitle">'+escapeHtml(detail.label+' · Average Sales / PS-Day')+'</h2><button type="button" class="secondary-btn" data-performance-close>Close</button></div><p>'+escapeHtml(monthName(selected('monthFilter')))+' · '+fmt(daily.units)+' sales units ÷ '+fmt(daily.days)+' promoter-days = '+(daily.average===null?'Unavailable':fmt(daily.average,2)+' units / PS-day')+'. Days run from hire date or month start, whichever is later, through the reporting cutoff, inclusive. Calendar days include days with zero sales.'+(daily.missingCount?' '+daily.missingCount+' NHTs have no elapsed days at this cutoff; their rate and the group average are unavailable. Listed totals cover elapsed days only.':'')+'</p><div class="table-wrap"><table data-no-sort><thead><tr>'+headings.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+daily.people.map(p=>{
   const entry=roster.find(e=>e.key===p.id||e.id===p.id),first=p.items[0]||{};
   const values=[entry?.name||find(first,'PS Name','Promoter Name')||p.id,entry?.store||first._store||'Unassigned',date(p.hire),date(p.start),p.days===null?'Unavailable':fmt(p.days),p.dailyUnits===null?'Unavailable':fmt(p.dailyUnits),p.dailyAverage===null?'Unavailable':fmt(p.dailyAverage,2)];
   return '<tr>'+values.map((v,i)=>'<td data-label="'+headings[i]+'">'+escapeHtml(String(v))+'</td>').join('')+'</tr>';
  }).join('')+'</tbody></table></div>';
  performanceDialog.querySelector('[data-performance-close]').onclick=()=>performanceDialog.close();performanceDialog.showModal();return;
 }
 const all=salesEnriched(),filters=[['_area','areaFilter'],['_asm','asmFilter'],['_customer','customerFilter'],['_channel','channelFilter'],['_productType','productTypeFilter'],['_model','modelFilter'],['_series','seriesFilter'],['_priceRange','priceRangeFilter']];
 const matching=all.filter(r=>filters.every(([key,id])=>passes(r[key],selected(id))));
 const weeklyRows=activePerformanceRows(matching,window.evisRoster?.getRoster(),{area:selected('areaFilter'),asm:selected('asmFilter'),customer:selected('customerFilter'),channel:selected('channelFilter')},storeMap());
 const weekly=performanceWeeklyScores(all,weeklyRows,selected('monthFilter'));
 const weekDate=d=>new Date(d*86400000).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
 const hires=performanceHireDates(all,roster,weekly.weeks[0]?.end??-Infinity);
 const weekHeaders=weekly.weeks.slice(0,4).map(w=>'<th>'+escapeHtml(weekDate(w.start).replace(/ \d{4}$/,'')+' – '+weekDate(w.end).replace(/ \d{4}$/,''))+'<br>'+(qty?'QTY':'Score')+' (IR)</th>').join('');

 performanceDialog.innerHTML='<div class="performance-dialog-head"><h2 id="performanceDialogTitle">'+escapeHtml(detail.label+' · '+(performanceStatusLabel(detail.status,measure)||'All promoters'))+'</h2><button type="button" class="secondary-btn" data-performance-close>Close</button></div><p>'+escapeHtml(monthName(selected('monthFilter')))+' · '+people.length+' promoters · Monthly target: '+fmt(target,qty?0:2)+' '+(qty?'units':'points')+'</p><div class="table-wrap"><table data-no-sort><thead><tr><th>Promoter</th><th>Current Store</th><th>Hire Date</th><th>Subregion</th><th>'+(qty?'Running Sales (units)':'Running Score')+'</th><th>Achievement</th><th>Status</th>'+weekHeaders+'</tr></thead><tbody>'+people.map(g=>{
  const entry=roster.find(e=>e.key===g.id||e.id===g.id),first=g.items[0]||{};
  const name=entry?.name||find(first,'PS Name','Promoter Name')||g.id;
  const store=entry?.store||[...new Set(g.items.map(r=>r._store).filter(Boolean))].join(', ')||'Unassigned';
  const hire=hires.get(entry?.key||g.id)?.day;
  return '<tr>'+[name,store,hire==null?'Unavailable':weekDate(hire),entry?.asm||first._asm||'Unassigned',performanceText(g,measure),(qty||scoreFile)?fmt(performanceValue(g,measure)/target*100,1)+'%'+(!qty&&g.missing?' *':''):'—',performanceStatusLabel(performanceStatus(g,detail.period),measure)].map(v=>'<td>'+escapeHtml(String(v))+'</td>').join('')+weekly.weeks.slice(0,4).map((w,i)=>{
   const score=weekly.scores.get(g.id)?.[i]||{points:0,units:0,missing:false};
   const previous=weekly.scores.get(g.id)?.[i+1]||{points:0,units:0,missing:false};
   return '<td class="performance-week">'+(w.available?performanceText(score,measure):'N/A')+' ('+performanceWeeklyIR(score,previous,w.available&&weekly.weeks[i+1].available,measure)+')</td>';
  }).join('')+'</tr>';
 }).join('')+'</tbody></table></div>'+(people.length?'':'<p>No promoters in this category.</p>')+'<p>Weekly '+(qty?'sales units':'scores')+': four consecutive 7-day periods, newest first, ending on the latest source date in the selected month. Current filters apply. IR compares '+(qty?'units':'points')+' with the preceding 7 days. N/A means missing date coverage, '+(qty?'':'missing model scores, ')+'or a zero previous value. Hire date uses the latest available hire-date record through the cutoff.'+(qty?'':' * indicates missing model scores.')+'</p>';
 performanceDialog.querySelector('[data-performance-close]').onclick=()=>performanceDialog.close();
 const headings=[...performanceDialog.querySelectorAll('thead th')].map(th=>th.textContent);
 performanceDialog.querySelectorAll('tbody tr').forEach(row=>[...row.cells].forEach((cell,i)=>cell.dataset.label=headings[i]));
 performanceDialog.showModal();
});
const performanceDrillStyle=document.createElement('style');
performanceDrillStyle.textContent='.performance-drilldown{border:0;background:transparent;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:4px 6px;border-radius:4px}.performance-drilldown:hover{background:rgba(128,128,128,.15)}.performance-drilldown:focus-visible{outline:2px solid #2874d0}.performance-dialog{width:min(1750px,96vw);max-width:none;box-sizing:border-box;max-height:85vh;overflow:auto;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--text);padding:16px}.performance-dialog::backdrop{background:rgba(0,0,0,.6)}.performance-dialog-head{display:flex;justify-content:space-between;align-items:center;gap:16px}.performance-dialog table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}.performance-dialog .performance-week{white-space:nowrap}.performance-dialog :is(th,td):nth-child(1){width:12%}.performance-dialog :is(th,td):nth-child(2){width:17%}.performance-dialog :is(th,td):nth-child(3){width:7%}.performance-dialog :is(th,td):nth-child(4){width:10%}.performance-dialog :is(th,td):nth-child(5),.performance-dialog :is(th,td):nth-child(6){width:6%}.performance-dialog :is(th,td):nth-child(7){width:8%}.performance-dialog :is(th,td):nth-child(n+8){width:8.5%}.performance-dialog tbody td:nth-child(-n+7){white-space:normal;overflow-wrap:anywhere}.performance-dialog th{font-size:10px}.performance-dialog th,.performance-dialog td{padding:8px 6px;text-align:left;border:1px solid var(--line)}.performance-dialog .missing{color:var(--muted)}.performance-dialog .up{color:#238344;font-weight:600}.performance-dialog .down{color:#c63c3c;font-weight:600}.performance-dialog .steady{color:#286bc1;font-weight:600}.performance-dialog p{font-size:13px;color:var(--muted)}';
performanceDrillStyle.textContent+='@media(max-width:1250px){.performance-dialog table,.performance-dialog tbody{display:block;width:100%}.performance-dialog thead{display:none}.performance-dialog tbody tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--line);border-radius:8px;margin-bottom:12px;overflow:hidden}.performance-dialog tbody td{display:block;width:auto!important;max-width:none!important;border:0;border-bottom:1px solid var(--line);min-width:0;font-size:12px}.performance-dialog tbody td::before{content:attr(data-label);display:block;font-size:10px;color:var(--muted);white-space:normal;margin-bottom:5px}.performance-dialog tbody td:first-child{grid-column:1/-1;font-weight:700}.performance-dialog tbody td:nth-child(-n+7){overflow-wrap:anywhere}.performance-dialog .table-wrap{overflow-x:visible}}';
document.head.append(performanceDrillStyle);
