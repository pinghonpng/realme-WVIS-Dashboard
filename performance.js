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
    return {label,headcount:promoters.length,...counts,...all,average:promoters.length?total.points/promoters.length:null,averageMissing:total.missing,unassigned:items.length-assigned.length};
  }).sort((a,b)=>a.label.localeCompare(b.label));
}
function renderTerritoryPerformance(rows){
  const period=performancePeriod(salesEnriched(),selected('monthFilter'));
  $('performancePace').textContent=period.threshold===null?'No dated sales in the selected month.':`Low performance: below ${fmt(period.threshold,2)} points = ${PS_SCORE_TARGET} × ${period.elapsed} elapsed calendar days ÷ ${period.days} days in ${monthName(selected('monthFilter'))}. The latest uploaded sale date sets the elapsed day, even when filters change. Classification uses the unrounded threshold.`;
  ['area','subregion'].forEach(kind=>{
    const groups=territoryPerformance(rows,kind==='area'?'_area':'_asm',period);
    $('performance'+kind+'Body').innerHTML=groups.map(g=>`<tr><td>${escapeHtml(g.label)}</td><td>${fmt(g.headcount)}</td><td>${scoreText(g)}</td><td>${scoreFile&&g.average!==null?fmt(g.average,2)+(g.averageMissing?' *':''):'—'}</td><td>${g.passed}</td><td>${g.onpace+g.low}</td><td>${g.low}</td><td>${g.pending}</td></tr>`).join('')||emptyRow(8);

  });
  const statuses={passed:'Target reached',onpace:'Not passed · on pace',low:'Low performance',pending:scoreFile?'Incomplete':'Awaiting scores'};
  const groups=scoreGroups(rows,'_ps');
  document.querySelectorAll('#promoterScoreBody tr').forEach((tr,i)=>{if(groups[i]&&groups[i].id!=='Unassigned'&&tr.cells.length===8)tr.cells[7].textContent=statuses[performanceStatus(groups[i],period)];});
}
function mountTerritoryPerformance(){
  const style=document.createElement('style');
  style.textContent='.performance-panel{margin:18px 0;padding:24px;box-shadow:none;border:1px solid #dfe2e6;border-radius:8px}.performance-panel h2{font-size:18px;margin:0 0 16px}.performance-panel table{width:100%;border-collapse:collapse;border:1px solid #dfe2e6}.performance-panel th,.performance-panel td{border:1px solid #dfe2e6;padding:12px 14px;text-align:right;font-variant-numeric:tabular-nums}.performance-panel th{background:#f7f8fa;font-weight:600}.performance-panel th:first-child,.performance-panel td:first-child{text-align:left}.performance-panel tbody tr:hover{background:#fafafa}';
  document.head.appendChild(style);
  $('promotersSection').insertAdjacentHTML('afterbegin',`<article class="card performance-panel"><h2>Area &amp; Subregion PS Performance</h2><p id="performancePace" class="score-note"></p><p class="score-note">Passed: at least 200 points. Not passed includes on-pace and low-performance PS; low performance is a subset, not an additional headcount. Missing scores remain unclassified. Headcount counts distinct PS IDs with sales in the selected view, not the full staffing roster. Running scores include unassigned sales; averages use assigned PS scores only. A PS selling in multiple territories appears in each territory. * indicates partial scores.</p></article>`+['area','subregion'].map(kind=>`<article class="card performance-panel"><h2>${kind==='area'?'Area':'Subregion'} Performance</h2><div class="table-wrap"><table><thead><tr><th>${kind==='area'?'Area':'Area / Subregion'}</th><th>PS headcount</th><th>Running score</th><th>Average / PS</th><th>Passed</th><th>Not passed</th><th>Of which low</th><th>Unclassified</th></tr></thead><tbody id="performance${kind}Body"></tbody></table></div></article>`).join(''));
}
const originalTerritoryScores=renderScores;
renderScores=rows=>{originalTerritoryScores(rows);renderTerritoryPerformance(rows);};
mountTerritoryPerformance();
