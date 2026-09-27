// Territory performance uses the latest uploaded calendar day in the selected month.
function performancePeriod(rows,month){
  const [year,m]=month.split('-').map(Number);
  const days=year&&m?new Date(year,m,0).getDate():0;
  let elapsed=0;
  rows.forEach(r=>{const d=r._date;if(d&&!isNaN(d)&&d.getFullYear()===year&&d.getMonth()+1===m)elapsed=Math.max(elapsed,d.getDate());});
  return {days,elapsed,threshold:days&&elapsed?PS_SCORE_TARGET*elapsed/days:null};
}
function performanceStatus(g,period){
  if(!scoreFile||g.missing||period.threshold===null)return 'pending';
  return g.points>=PS_SCORE_TARGET?'passed':g.points<period.threshold?'low':'onpace';
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
    return {label,promoters,headcount:promoters.length,...counts,...all,average:promoters.length?total.points/promoters.length:null,averageMissing:total.missing,unassigned:items.length-assigned.length};
  }).sort((a,b)=>a.label.localeCompare(b.label));
}
let performanceDrilldowns=[];
const performanceLabels={passed:'Target reached',onpace:'On-Pace',low:'Low performance',pending:'Incomplete / Awaiting scores'};
function performanceCell(value,promoters,label,status,period){
 const people=status?promoters.filter(g=>performanceStatus(g,period)===status):promoters;
 const index=performanceDrilldowns.push({people,label,status,period})-1;
 return '<button type="button" class="performance-drilldown" data-performance-drilldown="'+index+'" aria-label="'+escapeHtml('Show promoters: '+label+' · '+(performanceLabels[status]||'All promoters'))+'">'+value+'</button>';
}
function renderTerritoryPerformance(rows){
  performanceDrilldowns=[];
  $('psTargetKpi').textContent=fmt(PS_SCORE_TARGET,2);
  const period=performancePeriod(salesEnriched(),selected('monthFilter'));
  ['area','subregion'].forEach(kind=>{
    const groups=territoryPerformance(rows,kind==='area'?'_area':'_asm',period);
    const rowHtml=g=>'<tr><td>'+escapeHtml(g.label)+'</td>'+[
      performanceCell(fmt(g.headcount),g.promoters,g.label,null,period),
      performanceCell(scoreText(g),g.promoters,g.label,null,period),
      performanceCell(scoreFile&&g.average!==null?fmt(g.average,2)+(g.averageMissing?' *':''):'—',g.promoters,g.label,null,period),
      ...['passed','onpace','low','pending'].map(status=>performanceCell(g[status],g.promoters,g.label,status,period))
    ].map(value=>'<td>'+value+'</td>').join('')+'</tr>';
    const body=$('performance'+kind+'Body');
    body.innerHTML=groups.map(rowHtml).join('')||emptyRow(8);
    const total=groups.reduce((t,g)=>{for(const key of ['headcount','points','passed','onpace','low','pending'])t[key]+=g[key];t.missing||=g.missing;t.averageMissing||=g.averageMissing;t.promoters.push(...g.promoters);return t;},{label:'WVIS',headcount:0,points:0,passed:0,onpace:0,low:0,pending:0,missing:false,averageMissing:false,promoters:[]});
    total.average=total.headcount?total.promoters.reduce((sum,g)=>sum+g.points,0)/total.headcount:null;
    const footer=body.closest('table').tFoot||body.closest('table').createTFoot();footer.removeAttribute('data-summary-auto');footer.dataset.summary='history';footer.innerHTML=rowHtml(total);

  });
  const statuses={passed:'Target reached',onpace:'On-Pace',low:'Low performance',pending:scoreFile?'Incomplete':'Awaiting scores'};
  const groups=scoreGroups(rows,'_ps');
  document.querySelectorAll('#promoterScoreBody tr').forEach((tr,i)=>{if(groups[i]&&groups[i].id!=='Unassigned'&&tr.cells.length===8){const status=performanceStatus(groups[i],period);tr.cells[7].textContent=statuses[status];tr.cells[7].dataset.performanceStatus=status;}});
}
function mountTerritoryPerformance(){
  const style=document.createElement('style');
  style.textContent='.performance-panel{margin:18px 0;padding:24px;box-shadow:none;border:1px solid #dfe2e6;border-radius:8px}.performance-panel h2{font-size:18px;margin:0 0 16px}.performance-panel table{width:100%;border-collapse:collapse;border:1px solid #dfe2e6}.performance-panel th,.performance-panel td{border:1px solid #dfe2e6;padding:12px 14px;text-align:right;font-variant-numeric:tabular-nums}.performance-panel th{background:#f7f8fa;font-weight:600}.performance-panel th:first-child,.performance-panel td:first-child{text-align:left}.performance-panel tbody tr:hover{background:#fafafa}.promoter-score-panel{box-shadow:none;border:1px solid #dfe2e6;border-radius:8px}.promoter-score-panel table{border-collapse:collapse;width:100%}.promoter-score-panel th,.promoter-score-panel td{border:1px solid #dfe2e6;padding:12px 14px;font-variant-numeric:tabular-nums}.promoter-score-panel th{background:#f7f8fa}.promoter-score-panel td[data-performance-status]{font-weight:600;white-space:nowrap}.promoter-score-panel td[data-performance-status=passed]{background:#e2f3e5;color:#235b32}.promoter-score-panel td[data-performance-status=low]{background:#fbe3e3;color:#8c3030}.promoter-score-panel td[data-performance-status=onpace]{background:#fff0db;color:#80501d}.promoter-score-panel td[data-performance-status=pending]{background:#f2f3f5;color:#555}';
  document.head.appendChild(style);
  $('promoterScoreBody').closest('article').classList.add('promoter-score-panel');
  $('promotersSection').insertAdjacentHTML('afterbegin',['area','subregion'].map(kind=>`<article class="card performance-panel"><h2>${kind==='area'?'Area':'Subregion'} Performance</h2><div class="table-wrap"><table><thead><tr><th>${kind==='area'?'Area':'Area / Subregion'}</th><th>PS headcount</th><th>Running score</th><th>Average / PS</th><th>Target Reached</th><th>On-Pace</th><th>Low Performance</th><th>Incomplete / Awaiting Scores</th></tr></thead><tbody id="performance${kind}Body"></tbody></table></div></article>`).join(''));
}
const originalTerritoryScores=renderScores;
renderScores=rows=>{originalTerritoryScores(rows);renderTerritoryPerformance(rows);};
mountTerritoryPerformance();

const PS_TARGET_STORAGE='evis.psMonthlyTarget';
try{const saved=Number(localStorage.getItem(PS_TARGET_STORAGE));if(Number.isFinite(saved)&&saved>0)PS_SCORE_TARGET=saved;}catch(error){}
$('promotersSection').insertAdjacentHTML('afterbegin',`<article class="card performance-panel"><label for="psTargetInput"><strong>Monthly target per promoter (points)</strong></label><input id="psTargetInput" type="number" min="0.01" step="any" value="${PS_SCORE_TARGET}" style="display:block;width:180px;max-width:100%;margin:12px 0;padding:10px;border:1px solid #ccd1d8;border-radius:6px" aria-describedby="psTargetHelp psTargetStatus"><p id="psTargetHelp" class="score-note">Applies to every promoter and all months in this browser. Changes automatically update achievement, points to target, passed counts and the low-performance threshold.</p><p id="psTargetStatus" class="score-note" role="status"></p></article>`);
let psTargetTimer;
$('psTargetInput').addEventListener('input',()=>{
  clearTimeout(psTargetTimer);
  const value=$('psTargetInput').valueAsNumber;
  if(!Number.isFinite(value)||value<=0){$('psTargetStatus').textContent='Enter a target greater than zero. The previous target remains active.';return;}
  psTargetTimer=setTimeout(()=>{
    PS_SCORE_TARGET=value;
    try{localStorage.setItem(PS_TARGET_STORAGE,String(value));$('psTargetStatus').textContent='Target saved in this browser.';}catch(error){$('psTargetStatus').textContent='Target updated for this session; browser storage is unavailable.';}
    render();
  },350);
});


// Drilldowns use the same grouped, filtered promoters and status calculation as each cell.
const performanceDialog=document.createElement('dialog');
performanceDialog.className='performance-dialog';
performanceDialog.setAttribute('aria-labelledby','performanceDialogTitle');
document.body.append(performanceDialog);
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-performance-drilldown]');if(!button)return;
 const detail=performanceDrilldowns[Number(button.dataset.performanceDrilldown)];if(!detail)return;
 const roster=window.evisRoster?.getRoster()?.entries||[];
 const people=detail.people;
 performanceDialog.innerHTML='<div class="performance-dialog-head"><h2 id="performanceDialogTitle">'+escapeHtml(detail.label+' · '+(performanceLabels[detail.status]||'All promoters'))+'</h2><button type="button" class="secondary-btn" data-performance-close>Close</button></div><p>'+escapeHtml(monthName(selected('monthFilter')))+' · '+people.length+' promoters · Monthly target: '+fmt(PS_SCORE_TARGET,2)+' points</p><div class="table-wrap"><table data-no-sort><thead><tr><th>Promoter</th><th>Current Store</th><th>Area</th><th>Subregion</th><th>Running Score</th><th>Achievement</th><th>Status</th></tr></thead><tbody>'+people.map(g=>{
  const entry=roster.find(e=>e.key===g.id||e.id===g.id),first=g.items[0]||{};
  const name=entry?.name||find(first,'PS Name','Promoter Name')||g.id;
  const store=entry?.store||[...new Set(g.items.map(r=>r._store).filter(Boolean))].join(', ')||'Unassigned';
  return '<tr>'+[name,store,entry?.area||first._area||'Unassigned',entry?.asm||first._asm||'Unassigned',scoreText(g),scoreFile?fmt(g.points/PS_SCORE_TARGET*100,1)+'%'+(g.missing?' *':''):'—',performanceLabels[performanceStatus(g,detail.period)]].map(v=>'<td>'+escapeHtml(String(v))+'</td>').join('')+'</tr>';
 }).join('')+'</tbody></table></div>'+(people.length?'':'<p>No promoters in this category.</p>')+'<p>* Incomplete score: one or more models have no agreed score.</p>';
 performanceDialog.querySelector('[data-performance-close]').onclick=()=>performanceDialog.close();
 performanceDialog.showModal();
});
const performanceDrillStyle=document.createElement('style');
performanceDrillStyle.textContent='.performance-drilldown{border:0;background:transparent;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:4px 6px;border-radius:4px}.performance-drilldown:hover{background:rgba(128,128,128,.15)}.performance-drilldown:focus-visible{outline:2px solid #2874d0}.performance-dialog{width:min(1200px,94vw);max-height:85vh;overflow:auto;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--text);padding:24px}.performance-dialog::backdrop{background:rgba(0,0,0,.6)}.performance-dialog-head{display:flex;justify-content:space-between;align-items:center;gap:16px}.performance-dialog table{width:100%;border-collapse:collapse}.performance-dialog th,.performance-dialog td{padding:12px;text-align:left;border:1px solid var(--line)}.performance-dialog p{font-size:13px;color:var(--muted)}';
document.head.append(performanceDrillStyle);
