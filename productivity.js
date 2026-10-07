// Productivity uses its own month and the full sales dataset, never universal filters.
function productivityCalendarDay(date){return date&&!isNaN(date)?Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000):null;}
function productivityHireDay(value){
 if(value instanceof Date)return productivityCalendarDay(value);
 const s=normalize(value);if(!s)return null;
 if(/^\d{5}(?:\.\d+)?$/.test(s))return Math.floor(Number(s))+Math.floor(Date.UTC(1899,11,30)/86400000);
 let m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/),y,month,day;
 if(m){y=+m[1];month=+m[2];day=+m[3];}else{m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:\s.*)?$/);if(!m)return null;y=+m[3]<100?2000+(+m[3]):+m[3];month=+m[1];day=+m[2];}
 const d=new Date(Date.UTC(y,month-1,day));return y>=1900&&d.getUTCFullYear()===y&&d.getUTCMonth()+1===month&&d.getUTCDate()===day?Math.floor(d/86400000):null;
}
function productivityCategory(units,premium,target,premiumTarget){
 const a=units/target,b=premium/premiumTarget;
 if(a>=1&&b>=1)return 'both';
 if(a>=1)return 'allOnly';
 if(b>=1)return 'premiumOnly';
 return 'low';
}
function productivityReport(all,roster,month,view,target,premiumTarget,rangeName){
 const period=all.filter(r=>modelMonthKey(r._date)===month),cutoff=period.reduce((day,r)=>Math.max(day,productivityCalendarDay(r._date)??-Infinity),-Infinity);
 const start=productivityHireDay(month+'-01'),days=Number.isFinite(cutoff)&&start!==null?cutoff-start+1:0;
 const result={groups:[],days,cutoff,unknown:0,future:0,ready:days>0&&Number.isFinite(target)&&Number.isFinite(premiumTarget)&&target>0&&premiumTarget>0&&!!rangeName};if(!roster||!days)return result;
 const byId=new Map(roster.entries.filter(e=>e.id).map(e=>[e.id,e])),byName=new Map(roster.entries.map(e=>[rosterName(e.name),e]));
 const members=new Map(roster.entries.map(e=>[e.key,{entry:e,units:0,premium:0,hire:null,hireRecord:-Infinity,channel:'Unassigned',assignmentDay:-Infinity}]));
 for(const row of all){
  const date=productivityCalendarDay(row._date);if(date===null||date>cutoff)continue;
  const id=rosterCode(row._ps),named=byName.get(rosterName(find(row,'PS Name','Promoter Name'))),entry=byId.get(id)||((!id||!named?.id)&&named);if(!entry)continue;
  const member=members.get(entry.key),hire=find(row,'SR Hire Date','Hire Date');
  if(date>=member.assignmentDay){member.channel=row._channel||'Unassigned';member.assignmentDay=date;}
  if(normalize(hire)!==''&&date>=member.hireRecord){member.hire=productivityHireDay(hire);member.hireRecord=date;}
  if(date>=start&&/^HP/i.test(normalize(row._modelCode))){member.units+=row._qty;if(rangeName&&row._priceRange===rangeName)member.premium+=row._qty;}
 }
 const groups=new Map();
 for(const member of members.values()){
  const {entry,hire}=member;if(hire===null){result.unknown++;continue;}if(hire>cutoff){result.future++;continue;}
  const tenure=cutoff-hire+1,cohort=tenure<30?'NHT':'REG PS',worked=Math.max(0,cutoff-Math.max(start,hire)+1),factor=cohort==='NHT'?worked/days:1;
  const label=view==='area'?entry.area:view==='subregion'?[entry.area,entry.asm].filter(Boolean).join(' / '):view==='channel'?member.channel:entry.customer;
  const groupLabel=label||'Unassigned';if(!groups.has(groupLabel))groups.set(groupLabel,new Map(['NHT','REG PS'].map(type=>[type,{label:groupLabel,cohort:type,headcount:0,both:0,allOnly:0,premiumOnly:0,low:0}])));
  const group=groups.get(groupLabel).get(cohort);group.headcount++;
  if(result.ready)group[productivityCategory(member.units,member.premium,target*factor,premiumTarget*factor)]++;
 }
 result.groups=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).flatMap(([,cohorts])=>[...cohorts.values()]);return result;
}
function productivityTotal(groups){
 return groups.reduce((total,g)=>{for(const key of ['headcount','both','allOnly','premiumOnly','low'])total[key]+=g[key];return total;},{label:'WVIS',headcount:0,both:0,allOnly:0,premiumOnly:0,low:0});
}
// Monthly seller productivity is independent of today's HR roster and target settings.
function productivitySummary(all,month){
 const period=all.filter(r=>modelMonthKey(r._date)===month),eligible=period.filter(r=>/^HP/i.test(normalize(r._modelCode))&&['SP','NHT'].includes(normalize(find(r,'SR Role')).toUpperCase())&&Number.isFinite(r._qty)&&r._qty!==0);
 const nameIds=new Map();
 eligible.forEach(r=>{const id=rosterCode(r._ps),name=rosterName(find(r,'PS Name','Promoter Name'));if(id&&name){if(!nameIds.has(name))nameIds.set(name,new Set());nameIds.get(name).add(id);}});
 const people=new Set(),groups={area:new Map(),subregion:new Map(),dealer:new Map(),channel:new Map()};let sales=0,unidentified=0,unidentifiedSales=0;
 for(const r of eligible){
  const id=rosterCode(r._ps),name=rosterName(find(r,'PS Name','Promoter Name')),ids=nameIds.get(name);
  const key=id?'id:'+id:name&&(!ids||ids.size===1)?(ids?'id:'+ids.values().next().value:'name:'+name):'';
  if(!key){unidentified++;unidentifiedSales+=r._qty;continue;}
  people.add(key);sales+=r._qty;
  for(const [view,field] of [['area','_area'],['subregion','_asm'],['dealer','_customer'],['channel','_channel']]){
   const label=normalize(r[field])||'Unassigned';if(!groups[view].has(label))groups[view].set(label,{label,people:new Set(),sales:0});
   const group=groups[view].get(label);group.people.add(key);group.sales+=r._qty;
  }
 }
 const finish=g=>({label:g.label,headcount:g.people.size,sales:g.sales,productivity:g.people.size?g.sales/g.people.size:null});
 const result={total:finish({label:'Grand Total',people,sales}),unidentified,unidentifiedSales,cutoff:period.reduce((day,r)=>Math.max(day,productivityCalendarDay(r._date)??-Infinity),-Infinity),overlap:[]};
 for(const view of Object.keys(groups)){
  result[view]=[...groups[view].values()].map(finish).sort((a,b)=>view==='dealer'?b.sales-a.sales||a.label.localeCompare(b.label):a.label.localeCompare(b.label));
  if(result[view].reduce((n,g)=>n+g.headcount,0)>people.size)result.overlap.push(view);
 }
 return result;
}
(()=>{
 const nav=document.createElement('button');nav.className='nav-item';nav.dataset.section='productivity';nav.textContent='Promoter Productivity';document.querySelector('.nav-item[data-section="promoters"]').after(nav);
 const section=document.createElement('section');section.id='productivitySection';section.className='dashboard-section';
 section.innerHTML='<article class="card table-card"><div class="card-head"><div><h2>Promoter Productivity</h2><p>ACTIVE promoters only. Sales count only smartphone models with HP codes. This page uses its own month and grouping; universal filters do not apply.</p></div></div><div class="productivity-controls"><label>Month<select id="productivityMonth" aria-label="Productivity month"></select></label><label>View by<select id="productivityView" aria-label="Productivity view"><option value="area">Area</option><option value="subregion">Subregion</option><option value="dealer">Dealer</option><option value="channel">Customer Type</option></select></label><label>All Units target / PS<input id="productivityTarget" aria-label="All Units period target" type="number" min="0.01" step="any" placeholder="Enter period target"></label><label>more Php 13000 target / PS<input id="productivityPremiumTarget" aria-label="more Php 13000 period target" type="number" min="0.01" step="any" placeholder="Enter period target"></label></div><p id="productivityPeriod" class="score-note"></p><p class="score-note">Targets apply to the uploaded period and are saved per month in this browser. NHT: fewer than 30 calendar days since hire. NHT targets = entered target × days worked in the period ÷ period days; hire day counts as day one. REG PS: at least 30 days, using the full entered targets. Missing or invalid hire dates are treated as NHT but excluded from all counts and percentages.</p><p id="productivityNotice" class="score-note" role="status"></p><h3 class="productivity-cohort-title">REG PS</h3><div class="table-wrap"><table class="model-history-table productivity-cohort-table" aria-label="REG PS productivity"><thead><tr><th id="productivityRegularHeader">Area</th><th>Headcount</th><th>HIT BOTH TARGETS (High Performance)</th><th>HIT ALL UNITS ONLY (Need Improvement)</th><th>HIT 13K+ ONLY (Need Improvement)</th><th>DID NOT HIT BOTH (Low Performance)</th></tr></thead><tbody id="productivityRegularBody"></tbody><tfoot id="productivityRegularTotal"></tfoot></table></div><h3 class="productivity-cohort-title">NHT</h3><div class="table-wrap"><table class="model-history-table productivity-cohort-table" aria-label="NHT productivity"><thead><tr><th id="productivityNhtHeader">Area</th><th>Headcount</th><th>HIT BOTH TARGETS (High Performance)</th><th>HIT ALL UNITS ONLY (Need Improvement)</th><th>HIT 13K+ ONLY (Need Improvement)</th><th>DID NOT HIT BOTH (Low Performance)</th></tr></thead><tbody id="productivityNhtBody"></tbody><tfoot id="productivityNhtTotal"></tfoot></table></div><p class="score-note">Each category shows count (% of that row’s headcount). WVIS combines all groups within that promoter type; its percentages use the combined headcount. Hit Both Targets: both ≥100%. Hit All Units Only: All Units ≥100% and 13K+ below 100%. Hit 13K+ Only: 13K+ ≥100% and All Units below 100%. Did Not Hit Both: neither target reached. Achievement uses unrounded prorated targets.</p></article>';
 $('promotersSection').after(section);
 const targetPanel=section.querySelector('article');targetPanel.id='productivityTargetsPanel';targetPanel.setAttribute('role','tabpanel');targetPanel.setAttribute('aria-labelledby','productivityTargetsTab');
 const navigation=document.createElement('article');navigation.className='card productivity-navigation';
 navigation.innerHTML='<div class="productivity-tabs" role="tablist" aria-label="Promoter productivity views"><button type="button" id="productivityTargetsTab" class="secondary-btn" role="tab" aria-controls="productivityTargetsPanel" aria-selected="true">Target Performance</button><button type="button" id="productivitySummaryTab" class="secondary-btn" role="tab" aria-controls="productivitySummaryPanel" aria-selected="false" tabindex="-1">Productivity Summary</button></div><div class="productivity-controls productivity-month-control"></div>';
 navigation.querySelector('.productivity-controls').append($('productivityMonth').closest('label'));section.prepend(navigation);
 const summaryPanel=document.createElement('div');summaryPanel.id='productivitySummaryPanel';summaryPanel.setAttribute('role','tabpanel');summaryPanel.setAttribute('aria-labelledby','productivitySummaryTab');summaryPanel.hidden=true;
 summaryPanel.innerHTML='<article class="card productivity-summary-note"><h2>Productivity Summary</h2><p id="productivitySummaryPeriod" class="score-note"></p><div class="score-note productivity-summary-definition">SP/NHT smartphone sellers for the selected month, including those now resigned. PS HC counts distinct monthly sellers; zero sellers and frontliners are excluded. Productivity = Sales ÷ PS HC. Groups follow that month’s sales records. Universal filters do not apply.</div><p id="productivitySummaryNotice" class="score-note" role="status"></p></article><div class="productivity-summary-grid">'+[['area','Region'],['subregion','Subregion'],['dealer','Dealer'],['channel','Customer Type']].map(([key,title])=>'<article class="card table-card productivity-summary-'+key+'"><div class="card-head"><h2>'+title+'</h2></div><div class="table-wrap"><table class="model-history-table productivity-summary-table" data-preserve-customer-types aria-label="'+title+' productivity summary"><thead><tr><th>'+title+'</th><th>PS HC</th><th>Sales</th><th>Productivity</th></tr></thead><tbody id="productivitySummary'+key+'Body"></tbody><tfoot id="productivitySummary'+key+'Total"></tfoot></table></div></article>').join('')+'</div>';
 section.append(summaryPanel);
 function setProductivityTab(tab){
  const summary=tab==='summary';targetPanel.hidden=summary;summaryPanel.hidden=!summary;
  for(const [id,active] of [['productivityTargetsTab',!summary],['productivitySummaryTab',summary]]){$(id).setAttribute('aria-selected',String(active));$(id).tabIndex=active?0:-1;}
  if(section.classList.contains('active'))$('periodLabel').textContent=$(summary?'productivitySummaryPeriod':'productivityPeriod').textContent;
 }
 $('productivityTargetsTab').addEventListener('click',()=>setProductivityTab('targets'));$('productivitySummaryTab').addEventListener('click',()=>setProductivityTab('summary'));
 navigation.querySelector('[role=tablist]').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const summary=event.key==='End'||(event.key!=='Home'&&summaryPanel.hidden);setProductivityTab(summary?'summary':'targets');$(summary?'productivitySummaryTab':'productivityTargetsTab').focus();});
 const summaryStyle=document.createElement('style');summaryStyle.textContent='#productivitySection [role=tabpanel][hidden]{display:none!important}.productivity-navigation{padding:18px;margin-bottom:18px;display:flex;gap:24px;align-items:end;flex-wrap:wrap}.productivity-tabs{display:flex;gap:8px;flex-wrap:wrap}.productivity-tabs [aria-selected=true]{background:#ffc800;color:#17191c;border-color:#e1b000}.productivity-month-control{min-width:220px;flex:1;max-width:340px}.productivity-summary-note{padding:20px;margin-bottom:18px}.productivity-summary-note h2{margin:0}.productivity-summary-definition{margin-top:10px;font-size:12px;line-height:1.6;color:var(--muted)}.productivity-summary-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:18px;align-items:start}.productivity-summary-area,.productivity-summary-subregion{grid-column:1/-1}.productivity-summary-table{width:100%;min-width:440px}.productivity-summary-table :is(th,td):not(:first-child){text-align:right;font-variant-numeric:tabular-nums}.productivity-summary-table th:first-child{width:52%;text-align:left}.productivity-summary-table tfoot td{font-weight:700;background:#fff2bc}.productivity-summary-table tfoot td:first-child{text-align:left}html[data-theme=night] .productivity-summary-table tfoot td{background:#3f3516!important;color:#ffe397!important}@media(max-width:900px){.productivity-summary-grid{grid-template-columns:minmax(0,1fr)}.productivity-summary-area,.productivity-summary-subregion{grid-column:auto}}';document.head.append(summaryStyle);
 const style=document.createElement('style');style.textContent='body:has(#productivitySection.active) .filters{display:none!important}.productivity-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.productivity-controls label{display:flex;flex-direction:column;gap:8px;font-size:12px;font-weight:600}.productivity-controls input,.productivity-controls select{padding:10px;border:1px solid #d8dce2;border-radius:6px;font:inherit;background:white}.productivity-cohort-title{margin:26px 0 12px}.productivity-cohort-table td{white-space:nowrap;font-variant-numeric:tabular-nums}.productivity-cohort-table tbody td:nth-child(3){background:#e2f3e5}.productivity-cohort-table tbody td:nth-child(4),.productivity-cohort-table tbody td:nth-child(5){background:#fff0db}html[data-theme=night] .productivity-cohort-table tbody td:nth-child(4){background:#483820!important;color:#ffcf94!important}.productivity-cohort-table tbody td:nth-child(6){background:#fbe3e3}.productivity-cohort-table tfoot td{background:#eef0f3;font-weight:700;border-top:2px solid #8b939e}';document.head.appendChild(style);
 let loadedMonth='',saved={};try{saved=JSON.parse(localStorage.getItem('evis.productivityTargets')||'{}')||{};}catch{}
 function loadTargets(month){const values=saved[month]||{};$('productivityTarget').value=values.units??'';$('productivityPremiumTarget').value=values.premium??'';loadedMonth=month;}
 function renderProductivity(){
  const all=salesEnriched(),monthSelect=$('productivityMonth'),previous=monthSelect.value,months=uniq(all.map(r=>modelMonthKey(r._date)).filter(Boolean)).sort().reverse();
  if([...monthSelect.options].map(o=>o.value).join()!==months.join())monthSelect.innerHTML=months.map(m=>'<option value="'+m+'">'+escapeHtml(monthName(m))+'</option>').join('');
  monthSelect.value=months.includes(previous)?previous:months[0]||'';const month=monthSelect.value;if(month!==loadedMonth)loadTargets(month);
  const summary=productivitySummary(all,month),summaryStart=productivityHireDay(month+'-01');
  $('productivitySummaryPeriod').textContent=Number.isFinite(summary.cutoff)?monthName(month)+' · sales through '+(summary.cutoff-summaryStart+1)+' '+monthName(month)+'.':'No sales dates available for the selected month.';
  const summaryNotices=[];if(summary.unidentified)summaryNotices.push(fmt(summary.unidentified)+' smartphone sales rows ('+fmt(summary.unidentifiedSales)+' units) excluded because promoter identity is missing or ambiguous.');if(summary.overlap.length)summaryNotices.push('Promoters selling across multiple groups count in each applicable row. Grand Total counts each promoter once, so row headcounts may not add to the total.');$('productivitySummaryNotice').textContent=summaryNotices.join(' ');
  const summaryRow=g=>'<tr><td>'+escapeHtml(g.label)+'</td><td data-sort-value="'+g.headcount+'">'+fmt(g.headcount)+'</td><td data-sort-value="'+g.sales+'">'+fmt(g.sales)+'</td><td data-sort-value="'+(g.productivity??'')+'">'+(g.productivity===null?'—':fmt(g.productivity,1))+'</td></tr>';
  for(const key of ['area','subregion','dealer','channel']){$('productivitySummary'+key+'Body').innerHTML=summary[key].map(summaryRow).join('')||'<tr><td colspan="4">No promoter smartphone sales for this month.</td></tr>';$('productivitySummary'+key+'Total').innerHTML=summaryRow(summary.total);}
  const roster=window.evisRoster?.getRoster(),ranges=window.evisPriceRanges?.getRanges()||[],range=ranges.find(r=>normalize(r.name).replace(/[\s,]+/g,'').toLowerCase()==='morephp13000');
  const target=Number($('productivityTarget').value),premium=Number($('productivityPremiumTarget').value),view=$('productivityView').value;
  const report=productivityReport(all,roster,month,view,target,premium,range?.name);
  $('productivityPeriod').textContent=report.days?'Reporting period: '+monthName(month)+' 1–'+report.days+'. Hire-date tenure is measured at this cutoff.':'No sales dates available for the selected month.';
  const notices=[];if(!roster)notices.push('Waiting for the active HR roster.');if(!(target>0&&premium>0))notices.push('Enter both period targets to calculate performance categories.');if(!range)notices.push('Define the price range “more Php 13000” in Smartphone Line-up to calculate the second target.');if(report.unknown)notices.push(fmt(report.unknown)+' active promoters excluded: missing or invalid hire date.');if(report.future)notices.push(fmt(report.future)+' active promoters excluded: hire date after the reporting cutoff.');$('productivityNotice').textContent=notices.join(' ');
  const label={area:'Area',subregion:'Area / Subregion',dealer:'Dealer',channel:'Customer Type'}[view];
  const rowHtml=g=>'<tr><td>'+escapeHtml(g.label)+'</td><td>'+g.headcount+'</td>'+['both','allOnly','premiumOnly','low'].map(key=>'<td data-sort-value="'+(report.ready?g[key]:'')+'">'+(report.ready?g[key]+' ('+pct(g.headcount?g[key]/g.headcount*100:0)+')':'—')+'</td>').join('')+'</tr>';
  for(const [key,cohort] of [['Regular','REG PS'],['Nht','NHT']]){
   const header=$('productivity'+key+'Header'),button=header.querySelector('.table-sort-button');if(button){button.setAttribute('aria-label','Sort by '+label);button.textContent=label+({'ascending':' ↑','descending':' ↓'}[header.getAttribute('aria-sort')]||' ↕');}else header.textContent=label;
   const groups=report.groups.filter(g=>g.cohort===cohort);
   $('productivity'+key+'Body').innerHTML=groups.map(rowHtml).join('')||emptyRow(6);
   $('productivity'+key+'Total').innerHTML=rowHtml(productivityTotal(groups));
  }
  if(section.classList.contains('active'))$('periodLabel').textContent=$(summaryPanel.hidden?'productivityPeriod':'productivitySummaryPeriod').textContent;
 }
 ['productivityMonth','productivityView'].forEach(id=>$(id).addEventListener('change',renderProductivity));
 ['productivityTarget','productivityPremiumTarget'].forEach(id=>$(id).addEventListener('input',()=>{saved[$('productivityMonth').value]={units:$('productivityTarget').value,premium:$('productivityPremiumTarget').value};try{localStorage.setItem('evis.productivityTargets',JSON.stringify(saved));}catch{}renderProductivity();}));
 document.addEventListener('click',event=>{if(event.target.closest('.nav-item')){if(section.classList.contains('active'))renderProductivity();else $('periodLabel').textContent=monthName(selected('monthFilter'))+' performance';}});
 const before=render;render=()=>{before();renderProductivity();};window.evisProductivity={render:renderProductivity};
})();
