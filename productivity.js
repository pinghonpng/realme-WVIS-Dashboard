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
// Selected calendar month defines the cohort; the sales cutoff does not change month boundaries.
function promoterMonthCohort(hire,month,cutoff){
 const start=productivityHireDay(month+'-01');
 if(start===null||!Number.isFinite(hire))return 'unknown';
 const [year,m]=month.split('-').map(Number),end=Math.floor(Date.UTC(year,m,0)/86400000);
 if(hire>end)return 'future';
 return hire<start?'REG PS':'NHT';
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
 const previousMonth=month?modelMonthOffset(month,-1):'',previousStart=productivityHireDay(previousMonth+'-01');
 const previousDays=days?Math.min(days,new Date(Number(month.slice(0,4)),Number(month.slice(5))-1,0).getDate()):0,previousCutoff=previousStart===null?null:previousStart+previousDays-1;
 const previousLatest=all.filter(r=>modelMonthKey(r._date)===previousMonth).reduce((day,r)=>Math.max(day,productivityCalendarDay(r._date)??-Infinity),-Infinity);
 const previousAvailable=days>0&&previousStart!==null&&previousLatest>=previousCutoff;
 const result={groups:[],days,cutoff,previousMonth,previousDays,previousAvailable,unknown:0,invalid:0,future:0,ready:days>0&&Number.isFinite(target)&&Number.isFinite(premiumTarget)&&target>0&&premiumTarget>0&&!!rangeName};if(!roster||!days)return result;
 const byId=new Map(roster.entries.filter(e=>e.id).map(e=>[e.id,e])),byName=new Map(roster.entries.map(e=>[rosterName(e.name),e]));
 const members=new Map(roster.entries.map(e=>[e.key,{entry:e,units:0,previousUnits:0,premium:0,hire:null,hireRecord:-Infinity,channel:'Unassigned',assignmentDay:-Infinity}]));
 for(const row of all){
  const date=productivityCalendarDay(row._date);if(date===null||date>cutoff)continue;
  const id=rosterCode(row._ps),named=byName.get(rosterName(find(row,'PS Name','Promoter Name'))),entry=byId.get(id)||((!id||!named?.id)&&named);if(!entry)continue;
  const member=members.get(entry.key),hire=find(row,'SR Hire Date','Hire Date');
  if(date>=member.assignmentDay){member.channel=row._channel||'Unassigned';member.assignmentDay=date;}
  if(normalize(hire)!==''&&date>=member.hireRecord){member.hire=productivityHireDay(hire);member.hireRecord=date;}
  if(previousAvailable&&date>=previousStart&&date<=previousCutoff&&/^HP/i.test(normalize(row._modelCode)))member.previousUnits+=row._qty;
  if(date>=start&&/^HP/i.test(normalize(row._modelCode))){member.units+=row._qty;if(rangeName&&row._priceRange===rangeName)member.premium+=row._qty;}
 }
 const groups=new Map();
 for(const member of members.values()){
  const {entry,hire}=member;if(hire===null){result[Number.isFinite(member.hireRecord)?'invalid':'unknown']++;continue;}
  const cohort=promoterMonthCohort(hire,month,cutoff);if(cohort==='future'){result.future++;continue;}
  const worked=Math.max(0,cutoff-Math.max(start,hire)+1),factor=cohort==='NHT'?worked/days:1;
  const label=view==='area'?entry.area:view==='subregion'?[entry.area,entry.asm].filter(Boolean).join(' / '):view==='channel'?member.channel:entry.customer;
  const groupLabel=label||'Unassigned';if(!groups.has(groupLabel))groups.set(groupLabel,new Map(['NHT','REG PS'].map(type=>[type,{label:groupLabel,cohort:type,headcount:0,units:0,previousUnits:0,both:0,allOnly:0,premiumOnly:0,low:0,unrated:0}])));
  const group=groups.get(groupLabel).get(cohort);group.headcount++;group.units+=member.units;group.previousUnits+=member.previousUnits;
  if(factor===0)group.unrated++;else if(result.ready)group[productivityCategory(member.units,member.premium,target*factor,premiumTarget*factor)]++;
 }
 result.groups=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).flatMap(([,cohorts])=>[...cohorts.values()]);return result;
}
function productivityTotal(groups){
 return groups.reduce((total,g)=>{for(const key of ['headcount','units','previousUnits','both','allOnly','premiumOnly','low','unrated'])total[key]+=g[key]||0;return total;},{label:'WVIS',headcount:0,units:0,previousUnits:0,both:0,allOnly:0,premiumOnly:0,low:0,unrated:0});
}
// Compare the same current roster/cohort and assignment in both periods, including zero sellers.
function productivityAverage(group,previousAvailable){
 const current=group.headcount?group.units/group.headcount:null,previous=group.headcount&&previousAvailable?group.previousUnits/group.headcount:null;
 const rate=current===null||previous===null||previous<=0?null:(current-previous)/previous*100;
 return {current,previous,rate,isNew:previous===0&&current>0,isFlat:previous===0&&current===0};
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
// NHT performance: current active assignments and valid hires within the selected month.
function nhtSalesReport(all,roster,month){
 const start=productivityHireDay(month+'-01');
 const cutoff=all.filter(r=>modelMonthKey(r._date)===month).reduce((d,r)=>Math.max(d,productivityCalendarDay(r._date)??-Infinity),-Infinity);
 const report={month,start,cutoff,people:[],issues:[],dataDays:new Set(),ready:!!roster&&Number.isFinite(cutoff)&&start!==null,excludedBeforeHire:0};
 if(!report.ready)return report;
 const [year,m]=month.split('-').map(Number),end=Math.floor(Date.UTC(year,m,0)/86400000);
 const members=new Map(),byId=new Map(),byName=new Map(),nameIds=new Map();
 for(const entry of roster.entries){
  const id=rosterCode(entry.id),key=id?'id:'+id:'name:'+rosterName(entry.name);if(members.has(key))continue;
  const person={key,id,name:entry.name,area:entry.area||'Unassigned',subregion:entry.asm||'Unassigned',dealer:entry.customer||'Unassigned',store:entry.store||'Unassigned',channel:'Unassigned',channelDay:-Infinity,hireValues:new Set(),hireDay:-Infinity,rows:[]};
  members.set(key,person);if(id)byId.set(id,person);
  const name=rosterName(entry.name);if(name){if(!byName.has(name))byName.set(name,[]);byName.get(name).push(person);}
 }
 const dated=all.filter(r=>{const day=productivityCalendarDay(r._date);return day!==null&&day<=cutoff;});
 report.dataDays=new Set(dated.map(r=>productivityCalendarDay(r._date)));
 for(const r of dated){const id=rosterCode(r._ps),name=rosterName(find(r,'PS Name','Promoter Name'));if(id&&name){if(!nameIds.has(name))nameIds.set(name,new Set());nameIds.get(name).add(id);}}
 for(const row of dated){
  const id=rosterCode(row._ps),name=rosterName(find(row,'PS Name','Promoter Name')),candidates=byName.get(name)||[],ids=nameIds.get(name);
  let person=id?byId.get(id):null;
  if(!person&&candidates.length===1){
   const candidate=candidates[0];
   // A name is only a fallback when IDs do not contradict or identify different people.
   if((!id||!candidate.id)&&(!ids||ids.size===1&&(!candidate.id||ids.has(candidate.id))))person=candidate;
  }
  if(!person)continue;
  const day=productivityCalendarDay(row._date),hire=normalize(find(row,'SR Hire Date','Hire Date'));
  if(hire&&day>=person.hireDay){if(day>person.hireDay)person.hireValues.clear();person.hireValues.add(productivityHireDay(hire));person.hireDay=day;}
  if(normalize(row._customer)===person.dealer&&normalize(row._channel)&&day>=person.channelDay){person.channel=row._channel;person.channelDay=day;}
  if(row._productType==='SMARTPHONE'&&['SP','NHT'].includes(normalize(find(row,'SR Role')).toUpperCase())&&Number.isFinite(row._qty))person.rows.push(row);
 }
 for(const person of members.values()){
  const values=[...person.hireValues],missingHire=values.length===0,hire=missingHire?null:values[0];let reason='';
  if(missingHire)reason='Missing hire date';else if(values.length>1)reason='Conflicting hire dates';else if(hire===null)reason='Invalid hire date';else if(hire>end)reason='Hire date after selected month';
  if(reason){report.issues.push({key:person.key,name:person.name,id:person.id,store:person.store,area:person.area,subregion:person.subregion,dealer:person.dealer,channel:person.channel,reason});continue;}
  const tenure=Math.max(0,cutoff-hire+1);if(promoterMonthCohort(hire,month,cutoff)!=='NHT')continue;
  const dailyStart=Math.max(start,hire),reportDays=Math.max(0,cutoff-dailyStart+1),eligibleDays=reportDays,fullMonthDays=end-dailyStart+1,models=new Map(),daily=new Map();
  let units=0;
  for(const row of person.rows){
   const day=productivityCalendarDay(row._date);if(hire!==null&&day<hire){if(day>=start&&row._qty!==0)report.excludedBeforeHire++;continue;}
   daily.set(day,(daily.get(day)||0)+row._qty);if(day<start)continue;units+=row._qty;
   const key=normalize(row._modelCode)||row._model||'Unassigned';
   if(!models.has(key))models.set(key,{key,model:row._model||key,series:row._series||'Unassigned',units:0});models.get(key).units+=row._qty;
  }
  report.people.push({key:person.key,id:person.id,name:person.name,area:person.area,subregion:person.subregion,dealer:person.dealer,store:person.store,channel:person.channel,hire,missingHire,tenure,eligibleDays,units,sellingDays:[...daily].filter(([day,q])=>day>=start&&q>0).length,pace:eligibleDays>0?units/eligibleDays:null,projection:eligibleDays>0?units/eligibleDays*fullMonthDays:null,models:[...models.values()].sort((a,b)=>b.units-a.units||a.model.localeCompare(b.model)),timeline:daily,daily:Array.from({length:reportDays},(_,i)=>{const day=dailyStart+i;return {day,units:daily.get(day)||0};})});
 }
 report.people.sort((a,b)=>b.units-a.units||a.name.localeCompare(b.name));return report;
}
function nhtSalesTotal(people,label='Total'){
 const units=people.reduce((sum,p)=>sum+p.units,0);return {label,headcount:people.length,units,productivity:people.length?units/people.length:null,zero:people.filter(p=>p.units===0).length};
}
function nhtSalesGroups(people,field){
 const groups=new Map();for(const p of people){const label=p[field]||'Unassigned';if(!groups.has(label))groups.set(label,[]);groups.get(label).push(p);}
 return [...groups].map(([label,rows])=>nhtSalesTotal(rows,label)).sort((a,b)=>b.units-a.units||a.label.localeCompare(b.label));
}
function nhtSalesWindows(cutoff,workingDays='all'){
 if(!Number.isFinite(cutoff))return {weeks:Array.from({length:5},()=>({start:null,end:null})),days:Array(10).fill(null)};
 const weeks=Array.from({length:5},(_,i)=>({start:cutoff-i*7-6,end:cutoff-i*7})),days=[];
 if(Number.isFinite(cutoff))for(let day=cutoff;days.length<10;day--){const weekday=new Date(day*86400000).getUTCDay();if(workingDays==='all'||workingDays==='sat'&&weekday!==0||workingDays==='fri'&&weekday!==0&&weekday!==6)days.push(day);}
 return {weeks,days:days.reverse()};
}
function nhtSalesWindow(person,report,window){
 if(person.hire!==null&&window.end<person.hire)return {qty:null,complete:false,reason:'Before hire date'};
 const first=person.hire===null?window.start:Math.max(window.start,person.hire);let qty=0,missing=0;
 for(let day=first;day<=window.end;day++){if(!report.dataDays.has(day))missing++;qty+=person.timeline.get(day)||0;}
 if(missing===window.end-first+1)return {qty:null,complete:false,reason:'No source data for this period'};
 return {qty,complete:!missing&&(person.hire===null||person.hire<=window.start),reason:missing?'Incomplete source dates':person.hire===null?'Hire date unknown; sales follow reporting dates':person.hire>window.start?'Partial week since hire':''};
}
function nhtSalesChange(current,previous){
 if(!current.complete||!previous.complete||current.qty===null||previous.qty===null)return null;
 if(previous.qty>0)return {rate:(current.qty-previous.qty)/previous.qty*100};
 if(previous.qty===0&&current.qty>0)return {isNew:true};
 return previous.qty===0&&current.qty===0?{rate:0}:null;
}
// End NHT performance calculations.
(()=>{
 const nav=document.createElement('button');nav.className='nav-item';nav.dataset.section='productivity';nav.textContent='Promoter Productivity';document.querySelector('.nav-item[data-section="promoters"]').after(nav);
 const section=document.createElement('section');section.id='productivitySection';section.className='dashboard-section';
 section.innerHTML='<article class="card table-card"><div class="card-head"><div><h2>Promoter Productivity</h2><p>ACTIVE promoters only. Sales count only smartphone models with HP codes. This page uses its own month and grouping; universal filters do not apply.</p></div></div><div class="productivity-controls"><label>Month<select id="productivityMonth" aria-label="Productivity month"></select></label><label>View by<select id="productivityView" aria-label="Productivity view"><option value="area">Area</option><option value="subregion">Subregion</option><option value="dealer">Dealer</option><option value="channel">Customer Type</option></select></label><label>All Units target / PS<input id="productivityTarget" aria-label="All Units period target" type="number" min="0.01" step="any" placeholder="Enter period target"></label><label>more Php 13000 target / PS<input id="productivityPremiumTarget" aria-label="more Php 13000 period target" type="number" min="0.01" step="any" placeholder="Enter period target"></label></div><p id="productivityPeriod" class="score-note"></p><div id="productivityAverageNote" class="score-note productivity-average-note"></div><p class="score-note">Targets apply to the uploaded period and are saved per month in this browser. NHT: hired within the selected month. REG PS: hired before the selected month. Missing or invalid hire dates and hires after month-end are excluded. NHT targets = entered target × calendar days since hire in the period ÷ period days; hire day counts as day one. Hires after the sales cutoff but within the selected month count as NHT; target classification awaits their hire day. REG PS uses the full entered targets.</p><p id="productivityNotice" class="score-note" role="status"></p><h3 class="productivity-cohort-title">REG PS</h3><div class="table-wrap"><table class="model-history-table productivity-cohort-table" aria-label="REG PS productivity"><thead><tr><th id="productivityRegularHeader" rowspan="2" scope="col" data-sort-column="0">Area</th><th rowspan="2" scope="col" data-sort-column="1">Headcount</th><th rowspan="2" scope="col" data-sort-column="2" class="productivity-average-heading">Average Sales (vs Prev Month)</th><th colspan="4" scope="colgroup" id="productivityRegularMonth" class="productivity-month-heading">Current Month</th></tr><tr><th scope="col" data-sort-column="3">HIT BOTH TARGETS (High Performance)</th><th scope="col" data-sort-column="4">HIT ALL UNITS ONLY (Need Improvement)</th><th scope="col" data-sort-column="5">HIT 13K+ ONLY (Need Improvement)</th><th scope="col" data-sort-column="6">DID NOT HIT BOTH (Low Performance)</th></tr></thead><tbody id="productivityRegularBody"></tbody><tfoot id="productivityRegularTotal"></tfoot></table></div><h3 class="productivity-cohort-title">NHT</h3><div class="table-wrap"><table class="model-history-table productivity-cohort-table" aria-label="NHT productivity"><thead><tr><th id="productivityNhtHeader" rowspan="2" scope="col" data-sort-column="0">Area</th><th rowspan="2" scope="col" data-sort-column="1">Headcount</th><th rowspan="2" scope="col" data-sort-column="2" class="productivity-average-heading">Average Sales (vs Prev Month)</th><th colspan="4" scope="colgroup" id="productivityNhtMonth" class="productivity-month-heading">Current Month</th></tr><tr><th scope="col" data-sort-column="3">HIT BOTH TARGETS (High Performance)</th><th scope="col" data-sort-column="4">HIT ALL UNITS ONLY (Need Improvement)</th><th scope="col" data-sort-column="5">HIT 13K+ ONLY (Need Improvement)</th><th scope="col" data-sort-column="6">DID NOT HIT BOTH (Low Performance)</th></tr></thead><tbody id="productivityNhtBody"></tbody><tfoot id="productivityNhtTotal"></tfoot></table></div><p class="score-note">Each category shows count (% of that row’s headcount). WVIS combines all groups within that promoter type; its percentages use the combined headcount. Hit Both Targets: both ≥100%. Hit All Units Only: All Units ≥100% and 13K+ below 100%. Hit 13K+ Only: 13K+ ≥100% and All Units below 100%. Did Not Hit Both: neither target reached. Achievement uses unrounded prorated targets.</p></article>';
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
 const style=document.createElement('style');style.textContent='body:has(#productivitySection.active) .filters{display:none!important}.productivity-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.productivity-controls label{display:flex;flex-direction:column;gap:8px;font-size:12px;font-weight:600}.productivity-controls input,.productivity-controls select{padding:10px;border:1px solid #d8dce2;border-radius:6px;font:inherit;background:white}.productivity-cohort-title{margin:26px 0 12px}.productivity-cohort-table td{white-space:nowrap;font-variant-numeric:tabular-nums}.productivity-cohort-table tbody .productivity-both{background:#e2f3e5}.productivity-cohort-table tbody :is(.productivity-allOnly,.productivity-premiumOnly){background:#fff0db}.productivity-cohort-table tbody .productivity-low{background:#fbe3e3}.productivity-cohort-table tfoot td{background:#eef0f3;font-weight:700;border-top:2px solid #8b939e}table.productivity-cohort-table thead .productivity-month-heading{background:#fff2bc;text-align:center;font-size:12px}.productivity-cohort-table :is(th,td):first-child{min-width:110px}.productivity-cohort-table .productivity-average-heading{min-width:170px}.productivity-cohort-table .productivity-average strong{font-size:15px}.productivity-cohort-table .productivity-average small{display:block;margin-top:4px;font-size:11px}.productivity-cohort-table .productivity-average .up{color:#238747}.productivity-cohort-table .productivity-average .down{color:#c93636}.productivity-cohort-table .productivity-average .steady{color:#3474c4}.productivity-cohort-table .productivity-average .missing{color:var(--muted)}#productivityAverageNote{display:block!important;font-size:12px;line-height:1.6;color:var(--muted)}';document.head.appendChild(style);
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
  $('productivityPeriod').textContent=report.days?'Reporting period: '+monthName(month)+' 1–'+report.days+'. Cohorts use the selected calendar month; missing or invalid hire dates and hires after month-end are excluded.':'No sales dates available for the selected month.';
  $('productivityAverageNote').textContent=report.days?'Average Sales = smartphone units ÷ headcount, including zero sellers. '+monthName(month)+' 1–'+report.days+' vs '+monthName(report.previousMonth)+' 1–'+report.previousDays+'. Both periods use the same promoters and current table assignments. WVIS uses combined units ÷ combined headcount.'+(!report.previousAvailable?' Previous-period data is unavailable or does not reach the comparison cutoff; comparison shows N/A.':''):'';
  const notices=[];if(!roster)notices.push('Waiting for the active HR roster.');if(!(target>0&&premium>0))notices.push('Enter both period targets to calculate performance categories.');if(!range)notices.push('Define the price range “more Php 13000” in Smartphone Line-up to calculate the second target.');if(report.unknown)notices.push(fmt(report.unknown)+' active promoters excluded: no recorded hire date.');if(report.invalid)notices.push(fmt(report.invalid)+' active promoters excluded: invalid hire date.');if(report.future)notices.push(fmt(report.future)+' active promoters excluded: hire date after the selected month.');$('productivityNotice').textContent=notices.join(' ');
  const label={area:'Area',subregion:'Area / Subregion',dealer:'Dealer',channel:'Customer Type'}[view];
  const averageCell=g=>{
   const a=productivityAverage(g,report.previousAvailable),kind=a.isNew||a.rate>0?'up':a.rate<0?'down':a.isFlat||a.rate===0?'steady':'missing';
   const change=a.isNew?'▲ New':a.isFlat?'— 0.0%':a.rate===null?'N/A':(a.rate>0?'▲ +':a.rate<0?'▼ ':'— ')+fmt(a.rate,1)+'%';
   const title=a.current===null?'No promoters in this group':fmt(g.units)+' smartphone units ÷ '+fmt(g.headcount)+' promoters'+(a.previous===null?'. Previous comparison unavailable.':'; previous: '+fmt(g.previousUnits)+' units ÷ '+fmt(g.headcount)+' promoters.');
   return '<td class="productivity-average" data-sort-value="'+(a.current??'')+'" title="'+escapeHtml(title)+'"><strong>'+(a.current===null?'—':fmt(a.current,1))+'</strong><small class="'+kind+'">'+(a.current===null?'':change)+'</small><small class="missing">'+(a.current===null?'':a.previous===null?'Prev N/A':'Prev '+fmt(a.previous,1))+'</small></td>';
  };
  const rowHtml=g=>'<tr><td>'+escapeHtml(g.label)+'</td><td data-sort-value="'+g.headcount+'">'+g.headcount+(g.unrated?'<small class="score-note" style="display:block">'+g.unrated+' not yet hired at cutoff</small>':'')+'</td>'+averageCell(g)+['both','allOnly','premiumOnly','low'].map(key=>'<td class="productivity-'+key+'" data-sort-value="'+(report.ready?g[key]:'')+'">'+(report.ready?g[key]+' ('+pct(g.headcount?g[key]/g.headcount*100:0)+')':'—')+'</td>').join('')+'</tr>';
  for(const [key,cohort] of [['Regular','REG PS'],['Nht','NHT']]){
   const header=$('productivity'+key+'Header'),button=header.querySelector('.table-sort-button');if(button){button.setAttribute('aria-label','Sort by '+label);button.textContent=label+({'ascending':' ↑','descending':' ↓'}[header.getAttribute('aria-sort')]||' ↕');}else header.textContent=label;
   $('productivity'+key+'Month').textContent='Current Month · '+(month?monthName(month):'—');
   const groups=report.groups.filter(g=>g.cohort===cohort);
   $('productivity'+key+'Body').innerHTML=groups.map(rowHtml).join('')||emptyRow(7);
   $('productivity'+key+'Total').innerHTML=rowHtml(productivityTotal(groups));
  }
  if(section.classList.contains('active'))$('periodLabel').textContent=$(summaryPanel.hidden?'productivityPeriod':'productivitySummaryPeriod').textContent;
 }
 ['productivityMonth','productivityView'].forEach(id=>$(id).addEventListener('change',renderProductivity));
 ['productivityTarget','productivityPremiumTarget'].forEach(id=>$(id).addEventListener('input',()=>{saved[$('productivityMonth').value]={units:$('productivityTarget').value,premium:$('productivityPremiumTarget').value};try{localStorage.setItem('evis.productivityTargets',JSON.stringify(saved));}catch{}renderProductivity();}));
 document.addEventListener('click',event=>{if(event.target.closest('.nav-item')){if(section.classList.contains('active'))renderProductivity();else $('periodLabel').textContent=monthName(selected('monthFilter'))+' performance';}});
 const before=render;render=()=>{before();renderProductivity();};window.evisProductivity={render:renderProductivity};
})();

// Kept in the existing authenticated productivity asset so deployments need no new route.
(()=>{
 const nav=document.createElement('button');nav.className='nav-item';nav.dataset.section='nht';nav.textContent='NHT Sales Performance';document.querySelector('[data-section="productivity"]').after(nav);
 document.addEventListener('DOMContentLoaded',()=>document.querySelector('[data-section="productivity"]').after(nav));
 const section=document.createElement('section');section.id='nhtSection';section.className='dashboard-section';$('productivitySection').after(section);
 const fields=[['area','Area','All areas'],['subregion','Subregion','All subregions'],['dealer','Dealer','All dealers'],['channel','Customer Type','All customer types']];
 const headers=items=>'<thead><tr>'+items.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead>';
 section.innerHTML=`<article class="card nht-controls-card"><h2>NHT Sales Performance</h2><div class="nht-controls"><label>Month<select id="nhtMonth" aria-label="NHT month"></select></label>${fields.map(([key,label])=>'<label>'+label+'<select id="nhtFilter-'+key+'" aria-label="NHT '+label+'"></select></label>').join('')}</div><div id="nhtPeriod" class="nht-note"></div><div class="nht-note">Current ACTIVE promoters hired within the selected month. Promoters hired before that month are REG PS. Missing or invalid hire dates and hires after month-end are excluded from both groups. Zero-sales NHTs are included. Daily rates start on the hire date and stop at the sales cutoff. Smartphone sales only (SP / NHT roles), including returns.</div><div class="nht-note">Assignments and active status follow the current HR roster, including when viewing a past month. Hire dates and customer types use sales records through that month’s cutoff. This page has its own filters.</div><div id="nhtStatus" class="nht-note" role="status"></div></article>
 <div id="nhtKpis" class="nht-kpis"></div>
 <article class="card table-card"><div class="card-head"><h2>NHT Summary</h2><label>View by <select id="nhtGroup" aria-label="NHT summary grouping">${fields.map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join('')}</select></label></div><div class="table-wrap"><table id="nhtSummaryTable" data-preserve-customer-types aria-label="NHT sales summary">${headers(['Group','NHT HC','Smartphone sales','Units / NHT','Zero sales','Sales share'])}<tbody id="nhtSummaryBody"></tbody><tfoot data-summary="history" id="nhtSummaryTotal"></tfoot></table></div><div class="nht-note">Click a group to filter the promoter list. Sales ÷ NHT HC includes promoters with zero sales.</div></article>
 <article class="card table-card"><div class="card-head"><h2>NHT Weekly &amp; Daily Sales</h2><button id="nhtReset" class="secondary-btn" type="button">Reset filters</button></div><div class="table-wrap"><table id="nhtPeopleTable" data-preserve-customer-types aria-label="NHT promoter performance"><thead></thead><tbody id="nhtPeopleBody"></tbody><tfoot id="nhtPeopleTotal" data-summary="history"></tfoot></table></div><div class="nht-note">Click a promoter for model contributions and daily sales. Weeks are rolling 7-day periods ending at the cutoff, including previous months. Each weekly cell shows QTY (IR vs the preceding 7 days). “New” means positive sales after a complete zero-sales week; “—” means unavailable or before hire. * marks a partial week since hire or missing source dates; IR is shown only for two complete weeks. Daily columns follow the selected calendar; individual attendance is not available.</div></article>
 <article id="nhtDetail" class="card table-card" hidden><div class="card-head"><h2 id="nhtDetailTitle"></h2><button type="button" id="nhtCloseDetail" class="secondary-btn">Close details</button></div><div id="nhtDetailNote" class="nht-note"></div><div class="nht-detail-grid"><div><h3>Model contributions</h3><div class="table-wrap"><table data-preserve-customer-types aria-label="NHT model contributions">${headers(['Model','Series','Smartphone sales','Share'])}<tbody id="nhtModelsBody"></tbody><tfoot data-summary="history" id="nhtModelsTotal"></tfoot></table></div></div><div><h3>Daily sales</h3><div class="table-wrap"><table data-preserve-customer-types aria-label="NHT daily sales">${headers(['Date','Smartphone sales'])}<tbody id="nhtDaysBody"></tbody><tfoot data-summary="history" id="nhtDaysTotal"></tfoot></table></div></div></div></article>
 <article class="card nht-quality"><details id="nhtQuality"><summary id="nhtQualitySummary">Hire-date checks</summary><div class="nht-note">Active promoters with missing, invalid or conflicting hire dates, or hired after the selected month, are listed here and excluded. Lists respect the filters above.</div><div class="table-wrap"><table data-preserve-customer-types aria-label="NHT hire-date checks">${headers(['Promoter','Current store','Subregion','Reason'])}<tbody id="nhtQualityBody"></tbody><tfoot data-summary="history"></tfoot></table></div></details></article>`;
 const style=document.createElement('style');style.textContent=`body:has(#nhtSection.active) .main>.filters,#nhtSection .dashboard-fullscreen>.filters{display:none!important}#nhtSection{min-width:0}#nhtSection [hidden]{display:none!important}#nhtSection>.card,#nhtSection>.nht-kpis{margin-bottom:18px}.nht-controls-card,.nht-quality{padding:20px}.nht-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-top:16px}.nht-controls label{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:600}#nhtSection select{min-width:0;max-width:100%;padding:10px;border:1px solid #d8dce2;border-radius:8px;background:var(--card,#fff);color:var(--ink,#17191c);font:inherit}.nht-note{display:block!important;color:var(--muted,#6b7280);font-size:12px;line-height:1.6;margin:12px 0 0}.nht-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.nht-kpis .card{padding:18px}.nht-kpis span{font-size:12px;color:var(--muted)}.nht-kpis strong{display:block;font-size:26px;margin-top:8px}.nht-kpis small{display:block;margin-top:5px;color:var(--muted)}#nhtSection table{width:100%;min-width:640px;font-variant-numeric:tabular-nums}#nhtPeopleTable{min-width:2250px}#nhtPeopleTable th{text-align:center;position:static}#nhtPeopleTable td:nth-child(n+5){text-align:center}#nhtPeopleTable small.nht-ir{white-space:nowrap}#nhtSection td small.nht-up{color:#218644}#nhtSection td small.nht-down{color:#c73333}#nhtSection td small.nht-flat{color:#3474c4}#nhtPeopleTable thead tr:first-child th:nth-last-child(2){background:#dce9ff}#nhtPeopleTable thead tr:first-child th:last-child{background:#e8e0f4}#nhtPeopleTable td:first-child{min-width:155px}#nhtPeopleTable td:nth-child(2){min-width:285px}#nhtPeopleTable td:nth-child(3){min-width:110px}#nhtPeopleTable td:nth-child(n+5){min-width:98px}#nhtSection th{font-size:11px}#nhtSection td{font-size:13px}#nhtSection td small{display:block;color:var(--muted);margin-top:4px}#nhtSection td[data-sort-value]{text-align:right;white-space:nowrap}#nhtSection tfoot td{font-weight:700;background:#fff2bc}.nht-link{border:0;background:none;color:inherit;padding:0;font:inherit;text-align:left;text-decoration:underline;cursor:pointer}.nht-link:focus-visible{outline:2px solid #a17d00;outline-offset:3px}.nht-zero{background:#fbe3e3;color:#a4262c}.nht-detail-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:18px}.nht-quality summary{cursor:pointer;font-weight:600}html[data-theme=night] #nhtSection select{background:#24272c;color:#eee;border-color:#555}html[data-theme=night] #nhtSection tfoot td{background:#3f3516!important;color:#ffe397!important}html[data-theme=night] #nhtSection .nht-zero{background:#482626!important;color:#ffb6b6!important}html[data-mobile-view] #nhtPeopleTable.mobile-fit-table :is(th,td):first-child{min-width:155px!important}html[data-mobile-view] #nhtPeopleTable.mobile-fit-table :is(th,td):nth-child(2){min-width:285px!important}html[data-theme=night] #nhtSection td small.nht-up{color:#72d79c}html[data-theme=night] #nhtSection td small.nht-down{color:#ff9898}@media(max-width:900px){.nht-detail-grid{grid-template-columns:minmax(0,1fr)}.nht-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}`;document.head.append(style);
 let current=null,visible=[],detailKey=null;
 const workingDays=document.createElement('label');workingDays.innerHTML='Daily calendar<select id="nhtWorkingDays" aria-label="NHT daily calendar"><option value="all">All days (retail)</option><option value="sat">Monday–Saturday</option><option value="fri">Monday–Friday</option></select>';section.querySelector('.nht-controls').append(workingDays);
 const esc=escapeHtml;
 const dayText=day=>Number.isFinite(day)?new Date(day*86400000).toLocaleDateString(undefined,{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}):'—';
 const numberCell=(value,d=0,cls='')=>'<td class="'+cls+'" data-sort-value="'+(value??'')+'">'+(value===null?'—':fmt(value,d))+'</td>';
 const empty=cols=>'<tr><td colspan="'+cols+'">No matching NHT promoters.</td></tr>';
 function options(id,values,allLabel){
  const el=$(id),previous=el.value,desired=(allLabel?[['ALL',allLabel]]:[]).concat(values.map(v=>[v,allLabel?v:monthName(v)]));
  if(JSON.stringify([...el.options].map(o=>[o.value,o.textContent]))!==JSON.stringify(desired))el.innerHTML=desired.map(([value,label])=>'<option value="'+esc(value)+'">'+esc(label)+'</option>').join('');
  el.value=desired.some(([value])=>value===previous)?previous:desired[0]?.[0]||'';
 }
 function matches(p){return fields.every(([field])=>passes(p[field],$('nhtFilter-'+field).value));}
 function closeDetail(){detailKey=null;$('nhtDetail').hidden=true;$('nhtModelsBody').replaceChildren();$('nhtDaysBody').replaceChildren();}
 function renderDetail(){
  const p=visible.find(p=>p.key===detailKey);if(!p){closeDetail();return;}
  $('nhtDetail').hidden=false;$('nhtDetailTitle').textContent=p.name+' · '+fmt(p.units)+' smartphone units';
  $('nhtDetailNote').textContent=p.store+' · '+p.dealer+' · '+monthName(current.month)+' through '+dayText(current.cutoff)+'. Model and daily totals include returns and reconcile to the promoter total.';
  $('nhtModelsBody').innerHTML=p.models.map(m=>'<tr><td>'+esc(m.model)+'</td><td>'+esc(m.series)+'</td>'+numberCell(m.units)+numberCell(p.units>0?m.units/p.units*100:null,1)+'</tr>').join('')||'<tr><td colspan="4">No eligible smartphone sales recorded.</td></tr>';
  // Percent signs are added separately so sorting keeps the numeric value.
  [...$('nhtModelsBody').rows].filter(r=>r.cells.length===4).forEach(r=>{if(r.cells[3].textContent!=='—')r.cells[3].append('%');});
  $('nhtModelsTotal').innerHTML='<tr><td>Total</td><td></td>'+numberCell(p.units)+'<td>'+(p.units>0?'100.0%':'—')+'</td></tr>';
  $('nhtDaysBody').innerHTML=p.daily.map(d=>'<tr><td data-sort-value="'+d.day+'">'+esc(dayText(d.day))+'</td>'+numberCell(d.units,0,d.units===0?'nht-zero':'')+'</tr>').join('');
  $('nhtDaysTotal').innerHTML='<tr><td>Total</td>'+numberCell(p.units)+'</tr>';
 }
 function renderTrends(){
  const table=$('nhtPeopleTable'),windows=nhtSalesWindows(current.cutoff,$('nhtWorkingDays').value);
  const shortDay=day=>Number.isFinite(day)?new Date(day*86400000).toLocaleDateString(undefined,{timeZone:'UTC',day:'numeric',month:'short'}):'—';
  const signature=JSON.stringify([current.month,windows]);
  if(table.dataset.nhtHead!==signature){
   table.dataset.nhtHead=signature;if(typeof tableSortState!=='undefined')tableSortState.delete(table);
   const main=['Promoter','Current store / dealer','Hire date / tenure','Month to date'];
   table.tHead.innerHTML='<tr>'+main.map((label,i)=>'<th scope="col" rowspan="2" data-sort-column="'+i+'">'+label+'</th>').join('')+'<th scope="colgroup" colspan="4">Weekly sales · QTY (IR)</th><th scope="colgroup" colspan="10">Last 10 days · '+esc($('nhtWorkingDays').selectedOptions[0].textContent)+'</th></tr><tr>'+windows.weeks.slice(0,4).map((w,i)=>'<th scope="col" data-sort-column="'+(i+4)+'">'+(Number.isFinite(w.start)?esc(shortDay(w.start)+'–'+shortDay(w.end)):'—')+'</th>').join('')+windows.days.map((day,i)=>'<th scope="col" data-sort-column="'+(i+8)+'">'+esc(shortDay(day))+'</th>').join('')+'</tr>';
  }
  const weekValues=p=>windows.weeks.map(w=>nhtSalesWindow(p,current,w));
  const weeklyCell=(w,previous)=>{
   const change=nhtSalesChange(w,previous),rate=change?.isNew?'New':change?(change.rate>0?'+':'')+pct(change.rate):'—',cls=change?.isNew||change?.rate>0?'nht-up':change?.rate<0?'nht-down':'nht-flat';
   return '<td data-sort-value="'+(w.qty??'')+'" title="'+esc(w.reason||'Complete 7-day period')+'">'+(w.qty===null?'—':fmt(w.qty)+(!w.complete?'*':''))+' <small class="nht-ir '+cls+'">('+esc(rate)+')</small></td>';
  };
  const dailyCell=w=>'<td title="'+esc(w.reason)+'" class="'+(w.qty===0?'nht-zero':'')+'" data-sort-value="'+(w.qty??'')+'">'+(w.qty===null?'—':fmt(w.qty))+'</td>';
  $('nhtPeopleBody').innerHTML=visible.map(p=>{const weeks=weekValues(p);return '<tr><td><button type="button" class="nht-link" data-nht-person="'+esc(p.key)+'">'+esc(p.name)+'</button><small>'+esc(p.id||'No promoter ID')+'</small></td><td>'+esc(p.store)+'<small>'+esc(p.dealer)+'</small><small>'+esc(p.subregion)+'</small></td><td data-sort-value="'+(p.hire??'')+'">'+(p.missingHire?'Unknown':esc(dayText(p.hire)))+'<small>'+(p.missingHire?'Included as NHT':p.tenure+' days')+'</small></td>'+numberCell(p.units,0,p.units===0?'nht-zero':'')+weeks.slice(0,4).map((w,i)=>weeklyCell(w,weeks[i+1])).join('')+windows.days.map(day=>dailyCell(nhtSalesWindow(p,current,{start:day,end:day}))).join('')+'</tr>';}).join('')||empty(18);
  const combine=w=>{const values=visible.map(p=>nhtSalesWindow(p,current,w)),known=values.filter(v=>v.qty!==null);return {qty:known.length?known.reduce((sum,v)=>sum+v.qty,0):null,complete:values.length>0&&values.every(v=>v.complete),reason:values.every(v=>v.complete)?'':'Includes pre-hire or incomplete periods'};};
  const totals=windows.weeks.map(combine);
  $('nhtPeopleTotal').innerHTML=visible.length?'<tr><td>Total · '+fmt(visible.length)+' NHT</td><td></td><td></td>'+numberCell(nhtSalesTotal(visible).units)+totals.slice(0,4).map((w,i)=>weeklyCell(w,totals[i+1])).join('')+windows.days.map(day=>dailyCell(combine({start:day,end:day}))).join('')+'</tr>':'';
 }
 function renderNht(){
  if(!section.classList.contains('active'))return;
  const all=salesEnriched(),months=uniq(all.map(r=>modelMonthKey(r._date)).filter(Boolean)).sort().reverse();options('nhtMonth',months);
  const roster=window.evisRoster?.getRoster();current=nhtSalesReport(all,roster,$('nhtMonth').value);
  let available=[...current.people,...current.issues];
  for(const [field,,allLabel] of fields){options('nhtFilter-'+field,uniq(available.map(p=>p[field])),allLabel);available=available.filter(p=>passes(p[field],$('nhtFilter-'+field).value));}
  visible=current.people.filter(matches);const issues=current.issues.filter(matches),total=nhtSalesTotal(visible);
  $('nhtPeriod').textContent=Number.isFinite(current.cutoff)?monthName(current.month)+' · sales through '+dayText(current.cutoff):'No sales dates available for the selected month.';
  const notes=[];if(!roster)notes.push('Waiting for the active HR roster.');if(current.ready&&!visible.length)notes.push('No NHT promoters match these filters.');if(issues.length)notes.push(fmt(issues.length)+' active promoters need hire-date review; see Hire-date checks below.');if(current.excludedBeforeHire)notes.push(fmt(current.excludedBeforeHire)+' smartphone sale rows dated before hire were excluded from the monthly NHT report.');$('nhtStatus').textContent=notes.join(' ');
  const kpis=[['Active NHT',current.ready?fmt(total.headcount):'—','Hired within the selected month'],['Smartphone sales',current.ready?fmt(total.units):'—','Selected month to cutoff'],['Units / NHT',current.ready&&total.productivity!==null?fmt(total.productivity,1):'—','Includes zero-sales NHTs'],['Zero sales',current.ready?fmt(total.zero):'—','Net smartphone sales = 0']];
  $('nhtKpis').innerHTML=kpis.map(([label,value,note])=>'<article class="card"><span>'+label+'</span><strong>'+value+'</strong><small>'+note+'</small></article>').join('');
  const group=$('nhtGroup').value;
  const summaryRow=(g,linked)=>'<tr><td>'+(linked?'<button type="button" class="nht-link" data-nht-group="'+esc(g.label)+'">'+esc(g.label)+'</button>':esc(g.label))+'</td>'+numberCell(g.headcount)+numberCell(g.units)+numberCell(g.productivity,1)+numberCell(g.zero)+'<td data-sort-value="'+(total.units>0?g.units/total.units*100:'')+'">'+(total.units>0?pct(g.units/total.units*100):'—')+'</td></tr>';
  $('nhtSummaryBody').innerHTML=nhtSalesGroups(visible,group).map(g=>summaryRow(g,true)).join('')||empty(6);$('nhtSummaryTotal').innerHTML=current.ready?summaryRow(total,false):'';
  renderTrends();
  $('nhtQualitySummary').textContent='Hire-date checks · '+fmt(issues.length)+' active promoters excluded';
  $('nhtQualityBody').innerHTML=issues.map(p=>'<tr><td>'+esc(p.name)+'<small>'+esc(p.id)+'</small></td><td>'+esc(p.store)+'</td><td>'+esc(p.subregion)+'</td><td>'+esc(p.reason)+'</td></tr>').join('')||'<tr><td colspan="4">No hire-date issues in this selection.</td></tr>';
  renderDetail();if(typeof refreshTableSorting==='function')refreshTableSorting();
 }
 function clearFilters(){for(const [field] of fields)$('nhtFilter-'+field).value='ALL';closeDetail();renderNht();}
 section.addEventListener('change',event=>{if(event.target.matches('select')){closeDetail();if(event.target.id==='nhtMonth')clearFilters();else renderNht();}});
 $('nhtReset').addEventListener('click',clearFilters);$('nhtCloseDetail').addEventListener('click',closeDetail);
 // Full-screen cards can move outside the section, so drilldown actions use document delegation.
 document.addEventListener('click',event=>{
  const person=event.target.closest('[data-nht-person]'),group=event.target.closest('[data-nht-group]');
  if(person||group){document.querySelector('.dashboard-fullscreen [aria-label="Close full screen"]')?.click();}
  if(person){detailKey=person.dataset.nhtPerson;renderDetail();if(typeof refreshTableSorting==='function')refreshTableSorting();$('nhtDetail').scrollIntoView({behavior:'smooth',block:'start'});}
  if(group){$('nhtFilter-'+$('nhtGroup').value).value=group.dataset.nhtGroup;closeDetail();renderNht();$('nhtPeopleTable').scrollIntoView({behavior:'smooth',block:'start'});}
  if(event.target.closest('.nav-item')){if(section.classList.contains('active'))renderNht();else closeDetail();}
 });
 const before=render;render=()=>{before();renderNht();};
 const beforeRoster=window.evisProductivity.render;window.evisProductivity.render=()=>{beforeRoster();renderNht();};
 window.evisNhtPerformance={render:renderNht};
})();
