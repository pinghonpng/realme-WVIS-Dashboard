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
    const metrics=[['headcount','Promoter headcount'],['points','Running score'],['average','Average score / PS']];
    metrics.forEach(([metric,label])=>{
      const id='performance'+kind+metric;
      const data=metric==='headcount'?[['passed','Passed target','#21956a'],['onpace','Not passed · on pace','#ffc915'],['low','Low performance','#e26464'],['pending','Unclassified','#9ba3af']].map(([key,name,color])=>({label:name,data:groups.map(g=>g[key]),backgroundColor:color})): [{label,data:groups.map(g=>scoreFile?g[metric]:null),backgroundColor:metric==='points'?'#111214':'#d3a900'}];
      $(id).parentElement.style.height=Math.max(220,groups.length*38+80)+'px';
      chart(id,'bar',groups.map(g=>g.label),data,{legend:metric==='headcount',scales:{x:{beginAtZero:true,stacked:true,ticks:metric==='headcount'?{precision:0}:{}},y:{stacked:true,grid:{display:false}}},extra:{indexAxis:'y'}});
    });
  });
  const statuses={passed:'Target reached',onpace:'Not passed · on pace',low:'Low performance',pending:scoreFile?'Incomplete':'Awaiting scores'};
  const groups=scoreGroups(rows,'_ps');
  document.querySelectorAll('#promoterScoreBody tr').forEach((tr,i)=>{if(groups[i]&&groups[i].id!=='Unassigned'&&tr.cells.length===8)tr.cells[7].textContent=statuses[performanceStatus(groups[i],period)];});
}
function mountTerritoryPerformance(){
  const style=document.createElement('style');
  style.textContent='.performance-charts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin:20px 0}.performance-charts h3{font-size:14px;margin-bottom:12px}.performance-charts>div{min-width:0}.performance-chart{position:relative}.performance-panel{margin:18px 0;padding:24px}@media(max-width:1100px){.performance-charts{grid-template-columns:1fr}}';
  document.head.appendChild(style);
  $('promotersSection').insertAdjacentHTML('afterbegin',`<article class="card performance-panel"><h2>Area &amp; Subregion PS Performance</h2><p id="performancePace" class="score-note"></p><p class="score-note">Passed: at least 200 points. Not passed includes on-pace and low-performance PS; low performance is a subset, not an additional headcount. Missing scores remain unclassified. Headcount counts distinct PS IDs with sales in the selected view, not the full staffing roster. Running scores include unassigned sales; averages use assigned PS scores only. A PS selling in multiple territories appears in each territory. * indicates partial scores.</p></article>`+['area','subregion'].map(kind=>`<article class="card performance-panel"><h2>${kind==='area'?'Area':'Subregion'} Performance</h2><div class="performance-charts">${[['headcount','Promoter headcount & status'],['points','Running score'],['average','Average score / PS']].map(([metric,title])=>`<div><h3>${title}</h3><div class="performance-chart"><canvas id="performance${kind}${metric}" role="img" aria-label="${kind} ${title}; exact values in the following table"></canvas></div></div>`).join('')}</div><div class="table-wrap"><table><thead><tr><th>${kind==='area'?'Area':'Area / Subregion'}</th><th>PS headcount</th><th>Running score</th><th>Average / PS</th><th>Passed</th><th>Not passed</th><th>Of which low</th><th>Unclassified</th></tr></thead><tbody id="performance${kind}Body"></tbody></table></div></article>`).join(''));
}
const originalTerritoryScores=renderScores;
renderScores=rows=>{originalTerritoryScores(rows);renderTerritoryPerformance(rows);};
mountTerritoryPerformance();
