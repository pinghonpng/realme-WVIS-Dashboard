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
 if(a>1.5&&b>1.5)return 'high';
 if(a>=1&&b>=1)return 'safe';
 if(Math.min(a,b)>=.5&&Math.max(a,b)>=.8)return 'improve';
 return 'low';
}
function productivityReport(all,roster,month,view,target,premiumTarget,rangeName){
 const period=all.filter(r=>modelMonthKey(r._date)===month),cutoff=period.reduce((day,r)=>Math.max(day,productivityCalendarDay(r._date)??-Infinity),-Infinity);
 const start=productivityHireDay(month+'-01'),days=Number.isFinite(cutoff)&&start!==null?cutoff-start+1:0;
 const result={groups:[],days,cutoff,unknown:0,future:0,ready:days>0&&Number.isFinite(target)&&Number.isFinite(premiumTarget)&&target>0&&premiumTarget>0&&!!rangeName};if(!roster||!days)return result;
 const byId=new Map(roster.entries.filter(e=>e.id).map(e=>[e.id,e])),byName=new Map(roster.entries.map(e=>[rosterName(e.name),e]));
 const members=new Map(roster.entries.map(e=>[e.key,{entry:e,units:0,premium:0,hire:null,hireRecord:-Infinity}]));
 for(const row of all){
  const date=productivityCalendarDay(row._date);if(date===null||date>cutoff)continue;
  const id=rosterCode(row._ps),named=byName.get(rosterName(find(row,'PS Name','Promoter Name'))),entry=byId.get(id)||((!id||!named?.id)&&named);if(!entry)continue;
  const member=members.get(entry.key),hire=find(row,'SR Hire Date','Hire Date');
  if(normalize(hire)!==''&&date>=member.hireRecord){member.hire=productivityHireDay(hire);member.hireRecord=date;}
  if(date>=start){member.units+=row._qty;if(rangeName&&row._priceRange===rangeName)member.premium+=row._qty;}
 }
 const groups=new Map();
 for(const member of members.values()){
  const {entry,hire}=member;if(hire===null){result.unknown++;continue;}if(hire>cutoff){result.future++;continue;}
  const tenure=cutoff-hire+1,cohort=tenure<30?'NHT':'REG PS',worked=Math.max(0,cutoff-Math.max(start,hire)+1),factor=cohort==='NHT'?worked/days:1;
  const label=view==='area'?entry.area:view==='subregion'?[entry.area,entry.asm].filter(Boolean).join(' / '):entry.customer;
  const groupLabel=label||'Unassigned';if(!groups.has(groupLabel))groups.set(groupLabel,new Map(['NHT','REG PS'].map(type=>[type,{label:groupLabel,cohort:type,headcount:0,high:0,safe:0,improve:0,low:0}])));
  const group=groups.get(groupLabel).get(cohort);group.headcount++;
  if(result.ready)group[productivityCategory(member.units,member.premium,target*factor,premiumTarget*factor)]++;
 }
 result.groups=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).flatMap(([,cohorts])=>[...cohorts.values()]);return result;
}
(()=>{
 const nav=document.createElement('button');nav.className='nav-item';nav.dataset.section='productivity';nav.textContent='Promoter Productivity';document.querySelector('.nav-item[data-section="promoters"]').after(nav);
 const section=document.createElement('section');section.id='productivitySection';section.className='dashboard-section';
 section.innerHTML='<article class="card table-card"><div class="card-head"><div><h2>Promoter Productivity</h2><p>ACTIVE promoters only. This page uses its own month and grouping; universal filters do not apply.</p></div></div><div class="productivity-controls"><label>Month<select id="productivityMonth" aria-label="Productivity month"></select></label><label>View by<select id="productivityView" aria-label="Productivity view"><option value="area">Area</option><option value="subregion">Subregion</option><option value="dealer">Dealer</option></select></label><label>All Units target / PS<input id="productivityTarget" aria-label="All Units period target" type="number" min="0.01" step="any" placeholder="Enter period target"></label><label>more Php 13000 target / PS<input id="productivityPremiumTarget" aria-label="more Php 13000 period target" type="number" min="0.01" step="any" placeholder="Enter period target"></label></div><p id="productivityPeriod" class="score-note"></p><p class="score-note">Targets apply to the uploaded period and are saved per month in this browser. NHT: fewer than 30 calendar days since hire. NHT targets = entered target × days worked in the period ÷ period days; hire day counts as day one. REG PS: at least 30 days, using the full entered targets. Missing or invalid hire dates are treated as NHT but excluded from all counts and percentages.</p><p id="productivityNotice" class="score-note" role="status"></p><div class="table-wrap"><table class="model-history-table"><thead><tr><th id="productivityGroupHeader">Area</th><th>Promoter Type</th><th>Headcount</th><th>High Perf PS</th><th>Safe PS</th><th>Need Improvement PS</th><th>Low Perf PS</th></tr></thead><tbody id="productivityBody"></tbody></table></div><p class="score-note">Each category shows count (% of that row’s headcount). High Perf: both &gt;150%. Safe: both ≥100%, excluding High Perf. Need Improvement: both ≥50% and at least one ≥80%, excluding Safe/High Perf. Low Perf: all remaining promoters. Achievement uses unrounded prorated targets.</p></article>';
 $('promotersSection').after(section);
 const style=document.createElement('style');style.textContent='body:has(#productivitySection.active) .filters{display:none!important}.productivity-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.productivity-controls label{display:flex;flex-direction:column;gap:8px;font-size:12px;font-weight:600}.productivity-controls input,.productivity-controls select{padding:10px;border:1px solid #d8dce2;border-radius:6px;font:inherit;background:white}#productivityBody td{white-space:nowrap;font-variant-numeric:tabular-nums}#productivityBody td:nth-child(4){background:#e2f3e5}#productivityBody td:nth-child(6){background:#fff0db}#productivityBody td:nth-child(7){background:#fbe3e3}';document.head.appendChild(style);
 let loadedMonth='',saved={};try{saved=JSON.parse(localStorage.getItem('evis.productivityTargets')||'{}')||{};}catch{}
 function loadTargets(month){const values=saved[month]||{};$('productivityTarget').value=values.units??'';$('productivityPremiumTarget').value=values.premium??'';loadedMonth=month;}
 function renderProductivity(){
  const all=salesEnriched(),monthSelect=$('productivityMonth'),previous=monthSelect.value,months=uniq(all.map(r=>modelMonthKey(r._date)).filter(Boolean)).sort().reverse();
  if([...monthSelect.options].map(o=>o.value).join()!==months.join())monthSelect.innerHTML=months.map(m=>'<option value="'+m+'">'+escapeHtml(monthName(m))+'</option>').join('');
  monthSelect.value=months.includes(previous)?previous:months[0]||'';const month=monthSelect.value;if(month!==loadedMonth)loadTargets(month);
  const roster=window.evisRoster?.getRoster(),ranges=window.evisPriceRanges?.getRanges()||[],range=ranges.find(r=>normalize(r.name).replace(/\s+/g,' ').toLowerCase()==='more php 13000');
  const target=Number($('productivityTarget').value),premium=Number($('productivityPremiumTarget').value),view=$('productivityView').value;
  const report=productivityReport(all,roster,month,view,target,premium,range?.name);
  $('productivityPeriod').textContent=report.days?'Reporting period: '+monthName(month)+' 1–'+report.days+'. Hire-date tenure is measured at this cutoff.':'No sales dates available for the selected month.';
  const notices=[];if(!roster)notices.push('Waiting for the active HR roster.');if(!(target>0&&premium>0))notices.push('Enter both period targets to calculate performance categories.');if(!range)notices.push('Define the price range “more Php 13000” in Smartphone Line-up to calculate the second target.');if(report.unknown)notices.push(fmt(report.unknown)+' active promoters excluded: missing or invalid hire date.');if(report.future)notices.push(fmt(report.future)+' active promoters excluded: hire date after the reporting cutoff.');$('productivityNotice').textContent=notices.join(' ');
  const label={area:'Area',subregion:'Area / Subregion',dealer:'Dealer'}[view],header=$('productivityGroupHeader'),button=header.querySelector('.table-sort-button');if(button){button.setAttribute('aria-label','Sort by '+label);button.textContent=label+' ↕';}else header.textContent=label;
  $('productivityBody').innerHTML=report.groups.map(g=>'<tr><td>'+escapeHtml(g.label)+'</td><td>'+g.cohort+'</td><td>'+g.headcount+'</td>'+['high','safe','improve','low'].map(key=>'<td data-sort-value="'+(report.ready?g[key]:'')+'">'+(report.ready?g[key]+' ('+pct(g.headcount?g[key]/g.headcount*100:0)+')':'—')+'</td>').join('')+'</tr>').join('')||emptyRow(7);
  if(section.classList.contains('active'))$('periodLabel').textContent=$('productivityPeriod').textContent;
 }
 ['productivityMonth','productivityView'].forEach(id=>$(id).addEventListener('change',renderProductivity));
 ['productivityTarget','productivityPremiumTarget'].forEach(id=>$(id).addEventListener('input',()=>{saved[$('productivityMonth').value]={units:$('productivityTarget').value,premium:$('productivityPremiumTarget').value};try{localStorage.setItem('evis.productivityTargets',JSON.stringify(saved));}catch{}renderProductivity();}));
 document.addEventListener('click',event=>{if(event.target.closest('.nav-item')){if(section.classList.contains('active'))renderProductivity();else $('periodLabel').textContent=monthName(selected('monthFilter'))+' performance';}});
 const before=render;render=()=>{before();renderProductivity();};window.evisProductivity={render:renderProductivity};
})();
