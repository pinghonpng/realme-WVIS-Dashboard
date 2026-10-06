// Campaign targets and allocation are calculated before display filters.
const PUSH_TERRITORIES=[
 ['NEGROS','NEGROS.NORTH&BACOLOD',122,140],['NEGROS','NEGROS.PALAWAN',18,25],['NEGROS','NEGROS.SOUTH',60,75],
 ['EVIS','EVIS.ORMOC&OUTBASE',39,49],['EVIS','EVIS.SAMAR',74,84],['EVIS','EVIS.SOUTH LEYTE',18,28],['EVIS','EVIS.TACLOBAN',69,79],
 ['PANAY','PANAY.PANAY 1',50,60],['PANAY','PANAY.PANAY 2',50,60],['PANAY','PANAY.PANAY 3',62,72],['PANAY','PANAY.PANAY 4',38,48]
];
const PUSH_COMPONENTS=[{series:'16T SERIES',title:'16T Series',start:4,end:15,total:1191,column:2},{series:'C100 SERIES',title:'C100 Series',start:1,end:30,total:720,column:3}];
const PUSH_CAMPAIGNS=[{title:'C100 + 16T Series',components:PUSH_COMPONENTS,start:1,end:31,total:1911}];
const pushSeriesMatch=(series,campaign)=>campaign.components?campaign.components.some(c=>series===c.series):series===campaign.series;
const pushSeriesVisible=(campaign,filter)=>campaign.components?campaign.components.some(c=>passes(c.series,filter)):passes(campaign.series,filter);
function pushCombinedReport(all,roster,rangeName,view,filters,campaign){
 const monthEnd=new Date(...[...filters.month.split('-').map(Number),0]).getDate();
 const reports=campaign.components.map(c=>pushReport(all,roster,rangeName,view,filters,filters.month==='2026-09'?c:{...c,start:1,end:monthEnd}));
 const groups=new Map();
 reports.forEach(report=>report.groups.forEach(g=>{
  if(!groups.has(g.label))groups.set(g.label,{...g});
  else {const out=groups.get(g.label);out.target=out.target===null||g.target===null?null:out.target+g.target;out.sales=out.sales===null||g.sales===null?null:out.sales+g.sales;}
 }));
 const rows=[...groups.values()].sort((a,b)=>a.label.localeCompare(b.label));
 const sum=field=>rows.length&&rows.every(g=>g[field]!==null)?rows.reduce((n,g)=>n+g[field],0):null;
 return {groups:rows,total:{label:'WVIS',target:sum('target'),sales:sum('sales')},allocationReady:reports.every(r=>r.allocationReady),latest:Math.max(...reports.map(r=>r.latest))};
}
function pushWholeTargets(total,weights){
 const sum=[...weights.values()].reduce((a,b)=>a+b,0);if(!(sum>0))return null;
 const parts=[...weights].map(([key,weight])=>{const exact=total*weight/sum;return {key,units:Math.floor(exact),remainder:exact-Math.floor(exact)};});
 parts.sort((a,b)=>b.remainder-a.remainder||a.key.localeCompare(b.key));
 const left=total-parts.reduce((s,p)=>s+p.units,0);for(let i=0;i<left;i++)parts[i].units++;
 return new Map(parts.map(p=>[p.key,p.units]));
}
function pushLatestPromoters(all,roster){
 if(!roster)return [];
 const byId=new Map(roster.entries.filter(e=>e.id).map(e=>[e.id,e])),byName=new Map(roster.entries.map(e=>[rosterName(e.name),e])),latest=new Map();
 for(const row of all){if(!row._date||isNaN(row._date))continue;
  const id=rosterCode(row._ps),named=byName.get(rosterName(find(row,'PS Name','Promoter Name'))),entry=byId.get(id)||((!id||!named?.id)&&named);if(!entry)continue;
  if(!latest.has(entry.key)||row._date>=latest.get(entry.key)._date)latest.set(entry.key,row);
 }
 return roster.entries.map(e=>{const row=latest.get(e.key);return {_ps:e.key,_name:e.name||e.key,_store:e.store||row?._store||'Unassigned',_area:row?._area||e.area,_asm:row?._asm||e.asm,_customer:row?._customer||e.customer||'Unassigned',_channel:row?._channel||'Unassigned'};});
}
function pushReport(all,roster,rangeName,view,filters,campaign){
 if(campaign.components)return pushCombinedReport(all,roster,rangeName,view,filters,campaign);
 const key={area:'_area',subregion:'_asm',dealer:'_customer',channel:'_channel'}[view],label=r=>r[key]||'Unassigned';
 const history=all.filter(r=>['2026-06','2026-07','2026-08'].includes(modelMonthKey(r._date))&&r._priceRange===rangeName);
 const members=pushLatestPromoters(all,roster),historySum=new Map(),headcounts=new Map();
 history.forEach(r=>historySum.set(label(r),(historySum.get(label(r))||0)+r._qty));members.forEach(r=>headcounts.set(label(r),(headcounts.get(label(r))||0)+1));
 const premiumTotal=[...historySum.values()].reduce((s,v)=>s+v,0),headcount=members.length;
 const completeHistory=['2026-06','2026-07','2026-08'].every(m=>all.some(r=>modelMonthKey(r._date)===m));
 const allocationReady=!!rangeName&&completeHistory&&premiumTotal>0&&headcount>0;
 const weights=new Map([...new Set([...historySum.keys(),...headcounts.keys()])].map(k=>[k,.5*Math.max(0,historySum.get(k)||0)/premiumTotal+.5*(headcounts.get(k)||0)/headcount]));
 let targets=null;
 if(filters.month==='2026-09'&&campaign.total!==null){
  if(view==='area'||view==='subregion'){
   const territoryTargets=new Map();
   for(const area of ['EVIS','NEGROS','PANAY']){const ts=PUSH_TERRITORIES.filter(t=>t[0]===area);const allocated=campaign.column===2?pushWholeTargets(397,new Map(ts.map(t=>[t[1],t[2]]))):new Map(ts.map(t=>[t[1],t[3]]));allocated.forEach((v,k)=>territoryTargets.set(k,v));}
   targets=new Map();PUSH_TERRITORIES.filter(t=>passes(t[0],filters.area)&&passes(t[1],filters.asm)).forEach(t=>{const k=t[view==='area'?0:1];targets.set(k,(targets.get(k)||0)+territoryTargets.get(t[1]));});
  }else if(allocationReady)targets=campaign.column===2?pushWholeTargets(1191,pushWholeTargets(600,weights)):pushWholeTargets(campaign.total,weights);
 }
 const territoryMatch=r=>passes(r._area,filters.area)&&passes(r._asm,filters.asm)&&passes(r._customer,filters.customer)&&passes(r._channel,filters.channel);
 const productMatch=r=>passes(r._productType,filters.productType||'SMARTPHONE')&&passes(r._model,filters.model)&&passes(r._series,filters.series)&&passes(r._priceRange,filters.priceRange);
 const period=all.filter(r=>modelMonthKey(r._date)===filters.month&&r._date.getDate()>=campaign.start&&r._date.getDate()<=campaign.end);
 const sales=new Map();period.filter(r=>pushSeriesMatch(r._series,campaign)&&territoryMatch(r)&&productMatch(r)).forEach(r=>sales.set(label(r),(sales.get(label(r))||0)+r._qty));
 const eligible=new Set([...all.filter(territoryMatch),...members.filter(territoryMatch)].map(label));
 if(filters.customer==='ALL'&&filters.channel==='ALL'&&(view==='area'||view==='subregion'))PUSH_TERRITORIES.filter(t=>passes(t[0],filters.area)&&passes(t[1],filters.asm)).forEach(t=>eligible.add(t[view==='area'?0:1]));
 const seriesVisible=['ALL','SMARTPHONE'].includes(filters.productType)&&pushSeriesVisible(campaign,filters.series);
 const modelVisible=filters.model==='ALL'||all.some(r=>r._model===filters.model&&pushSeriesMatch(r._series,campaign));
 const groups=seriesVisible&&modelVisible?[...eligible].sort((a,b)=>a.localeCompare(b)).map(k=>({label:k,target:targets?(targets.get(k)??0):null,sales:period.length?(sales.get(k)||0):null,history:historySum.get(k)||0,headcount:headcounts.get(k)||0})):[];
 const total={label:'WVIS',target:groups.length&&groups.every(g=>g.target!==null)?groups.reduce((s,g)=>s+g.target,0):null,sales:groups.length&&period.length?groups.reduce((s,g)=>s+g.sales,0):null};
 return {groups,total,allocationReady,latest:period.reduce((n,r)=>Math.max(n,r._date.getDate()),0)};
}
function pushTrends(all,filters,campaign,key){
 const day=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;
 const monthRows=all.filter(r=>modelMonthKey(r._date)===filters.month),cutoff=monthRows.reduce((m,r)=>Math.max(m,day(r._date)),-Infinity);
 const weeks=Array.from({length:5},(_,i)=>({start:cutoff-i*7-6,end:cutoff-i*7}));
 const months=[-3,-2,-1].map(i=>modelMonthOffset(filters.month,i)),baseline=modelMonthOffset(filters.month,-4),coverage=new Set(all.map(r=>day(r._date)));
 const covered=(start,end)=>{if(!Number.isFinite(start))return false;for(let d=start;d<=end;d++)if(!coverage.has(d))return false;return true;};
 weeks.forEach(w=>w.available=covered(w.start,w.end));
 const complete=m=>{const [y,n]=m.split('-').map(Number);return covered(Date.UTC(y,n-1,1)/86400000,Date.UTC(y,n,0)/86400000);};
 const buckets=new Map(),blank=()=>({weeks:[0,0,0,0,0],months:{}});
 for(const r of all){if(!pushSeriesMatch(r._series,campaign)||!['area','asm','customer','channel','productType','model','series','priceRange'].every(k=>passes(r['_'+k],filters[k])))continue;
 const label=r[key]||'Unassigned';if(!buckets.has(label))buckets.set(label,blank());const g=buckets.get(label),d=day(r._date),m=modelMonthKey(r._date);
 weeks.forEach((w,i)=>{if(d>=w.start&&d<=w.end)g.weeks[i]+=r._qty;});if(months.includes(m)||m===baseline)g.months[m]=(g.months[m]||0)+r._qty;}
 const sum=labels=>{const g=blank();labels.forEach(label=>{const v=buckets.get(label);if(v){v.weeks.forEach((q,i)=>g.weeks[i]+=q);Object.entries(v.months).forEach(([m,q])=>g.months[m]=(g.months[m]||0)+q);}});return g;};
 return {weeks,months,complete,sum};
}
function pushSnapshotPeriods(all,month){
 const day=r=>productivityCalendarDay(r._date),cutoff=all.filter(r=>modelMonthKey(r._date)===month).reduce((n,r)=>Math.max(n,day(r)??-Infinity),-Infinity);
 const previousCutoff=cutoff-7,d=new Date(previousCutoff*86400000),[year,m]=month.split('-').map(Number);
 const start=Date.UTC(year,m-1,1)/86400000,previousStart=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)/86400000;
 const previousMonth=Number.isFinite(previousCutoff)?d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0'):'';
 const coverage=new Set(all.map(day).filter(d=>d!==null));
 const covered=(a,b)=>{if(!Number.isFinite(a)||!Number.isFinite(b))return false;for(let d=a;d<=b;d++)if(!coverage.has(d))return false;return true;};
 return {cutoff,previousCutoff,start,previousStart,previousMonth,available:covered(start,cutoff)&&covered(previousStart,previousCutoff)};
}
function pushDistribution(all,roster,filters,campaign,view){
 const blank=label=>({label,headcount:0,previousHeadcount:0,newHires:0,unknownHire:0,counts:[0,0,0,0,0],previousCounts:[0,0,0,0,0],people:[]});
 const day=r=>productivityCalendarDay(r._date);
 const {cutoff,previousCutoff,start,previousStart,available}=pushSnapshotPeriods(all,filters.month);
 const result={groups:[],total:blank('WVIS'),cutoff,previousCutoff,start,previousStart,available};
 if(!roster||!['ALL','SMARTPHONE'].includes(filters.productType)||!Number.isFinite(cutoff))return result;
 const key={area:'_area',subregion:'_asm',dealer:'_customer',channel:'_channel'}[view];
 // Keep today's ACTIVE roster and the same assignments for both snapshots. Known hires
 // after the earlier cutoff enter only the current snapshot, never its zero-unit bucket.
 const hires=performanceHireDates(all,roster.entries,cutoff);
 const members=pushLatestPromoters(all.filter(r=>day(r)!==null&&day(r)<=cutoff),roster).filter(r=>['area','asm','customer','channel'].every(k=>passes(r['_'+k],filters[k]))&&(hires.get(r._ps)?.day==null||hires.get(r._ps).day<=cutoff));
 const mapped=psSalesReviewData(all,roster,{area:'ALL',asm:'ALL',customer:'ALL',channel:'ALL'},storeMap()).all,sales=new Map(),previousSales=new Map();
 mapped.forEach(r=>{const d=day(r),hired=hires.get(r._reviewPs)?.day;if(d===null||d<Math.min(start,previousStart)||d>cutoff||(hired!=null&&d<hired)||!pushSeriesMatch(r._series,campaign)||!['area','asm','customer','channel','productType','model','series','priceRange'].every(k=>passes(r['_'+k],filters[k])))return;if(d>=start)sales.set(r._reviewPs,(sales.get(r._reviewPs)||0)+r._qty);if(d>=previousStart&&d<=previousCutoff)previousSales.set(r._reviewPs,(previousSales.get(r._reviewPs)||0)+r._qty);});
 const bucket=q=>q>=15?4:q>=8?3:q>=4?2:q>0?1:0,groups=new Map();
 if(pushSeriesVisible(campaign,filters.series)&&(filters.model==='ALL'||all.some(r=>r._model===filters.model&&pushSeriesMatch(r._series,campaign))))members.forEach(m=>{
  const label=m[key]||'Unassigned';if(!groups.has(label))groups.set(label,blank(label));const g=groups.get(label),hired=hires.get(m._ps)?.day;
  const units=Math.max(0,sales.get(m._ps)||0),unitBucket=bucket(units);
  g.headcount++;g.counts[unitBucket]++;g.people.push({...m,units,bucket:unitBucket});
  if(hired==null)g.unknownHire++;
  if(hired!=null&&hired>previousCutoff){g.newHires++;return;}
  g.previousHeadcount++;g.previousCounts[bucket(previousSales.get(m._ps))]++;
 });
 result.groups=[...groups.values()].sort((a,b)=>a.label.localeCompare(b.label));
 result.groups.forEach(g=>{for(const field of ['headcount','previousHeadcount','newHires','unknownHire'])result.total[field]+=g[field];result.total.people.push(...g.people);g.counts.forEach((q,i)=>{result.total.counts[i]+=q;result.total.previousCounts[i]+=g.previousCounts[i];});});
 return result;
}
function pushDistributionIR(current,previous,bucket,available){
 if(!available||previous===0)return {text:'N/A',kind:'missing',symbol:''};
 const rate=modelRate(current,previous),symbol={up:'▲',down:'▼',steady:'━'}[rate.kind];
 // Arrows describe count direction; color describes whether that direction is desirable.
 const kind=rate.kind==='steady'?'steady':bucket===0?(rate.kind==='up'?'down':'up'):bucket===4?rate.kind:'neutral';
 return {...rate,kind,symbol};
}

const PUSH_SMARTPHONE_BANDS=['0 Sales','1–10 Sales','11–15 Sales','16–20 Sales','21–25 Sales','26–30 Sales','31+ Sales'];
function pushSmartphoneHeadcount(all,roster,filters,view,selectedTypes,asOf=null){
 if(asOf!==null)all=all.filter(r=>(productivityCalendarDay(r._date)??Infinity)<=asOf);
 const monthRows=all.filter(r=>modelMonthKey(r._date)===filters.month);
 const cutoff=asOf??monthRows.reduce((n,r)=>Math.max(n,productivityCalendarDay(r._date)??-Infinity),-Infinity);
 const blank=label=>({label,people:[],counts:Array(7).fill(0),headcount:0});
 const result={groups:[],total:blank('WVIS'),cutoff,unknown:0};
 if(!roster||!Number.isFinite(cutoff))return result;
 const entries=roster.entries,ids=new Map(entries.filter(e=>e.id).map(e=>[rosterCode(e.id),e])),names=new Map(entries.map(e=>[rosterName(e.name),e]));
 const history=all.filter(r=>(productivityCalendarDay(r._date)??Infinity)<=cutoff),nameIds=new Map();
 history.forEach(r=>{const name=rosterName(find(r,'PS Name','Promoter Name')),id=rosterCode(r._ps);if(name&&id){if(!nameIds.has(name))nameIds.set(name,new Set());nameIds.get(name).add(id);}});
 const identity=r=>{const id=rosterCode(r._ps),name=normalize(find(r,'PS Name','Promoter Name')),named=names.get(rosterName(name)),candidates=nameIds.get(rosterName(name));
 const entry=ids.get(id)||((!id||!named?.id)&&named),inferred=!id&&candidates?.size===1?[...candidates][0]:null;
 const resolved=entry||ids.get(inferred);return {entry:resolved,key:resolved?.key||id||inferred||(name?'name:'+rosterName(name):''),name:resolved?.name||name||id};};
 const latest=new Map(),hires=new Map(),people=new Map();
 history.forEach(r=>{const id=identity(r);if(!id.key)return;const d=productivityCalendarDay(r._date);
 if(!latest.has(id.key)||d>=productivityCalendarDay(latest.get(id.key)._date))latest.set(id.key,r);
 const hire=productivityHireDay(find(r,'SR Hire Date','Hire Date'));if(hire!==null&&(!hires.has(id.key)||d>=hires.get(id.key).record))hires.set(id.key,{day:hire,record:d});});
 const person=id=>{if(!people.has(id.key))people.set(id.key,{...id,units:0});return people.get(id.key);};
 const monthlyUnits=new Map();monthRows.forEach(r=>{if(r._productType!=='SMARTPHONE'||!['SP','NHT'].includes(normalize(find(r,'SR Role')).toUpperCase()))return;const id=identity(r);if(id.key&&r._qty>0)person(id);if(id.key)monthlyUnits.set(id.key,(monthlyUnits.get(id.key)||0)+r._qty);});
 people.forEach(p=>p.units=monthlyUnits.get(p.key)||0);
 entries.forEach(entry=>{const last=latest.get(entry.key)||{},role=normalize(find(last,'SR Role')).toUpperCase();if(hires.get(entry.key)?.day>cutoff||role&&!['SP','NHT'].includes(role))return;person({key:entry.key,name:entry.name,entry});});
 const groups=new Map(),key={area:'_area',subregion:'_asm',dealer:'_customer',channel:'_channel'}[view];
 for(const p of people.values()){
 const last=latest.get(p.key)||{},e=p.entry,hire=hires.get(p.key)?.day,role=normalize(find(last,'SR Role')).toUpperCase();
 const type=!e?'RESIGNED':hire!=null?(cutoff-hire+1>=30?'REG PS':'NHT'):role==='NHT'?'NHT':role==='SP'?'REG PS':'Unknown';
 Object.assign(p,{_ps:p.key,_name:p.name,_store:e?.store||last._store||'Unassigned',_area:e?.area||last._area||'Unassigned',_asm:e?.asm||last._asm||'Unassigned',_customer:e?.customer||last._customer||'Unassigned',_channel:last._channel||'Unassigned',type});
 if(!['area','asm','customer','channel'].every(k=>passes(p['_'+k],filters[k])))continue;
 if(type==='Unknown'){result.unknown++;if(selectedTypes.size!==3)continue;}else if(!selectedTypes.has(type))continue;
 p.units=Math.max(0,p.units);p.bucket=p.units===0?0:p.units<=10?1:p.units<=15?2:p.units<=20?3:p.units<=25?4:p.units<=30?5:6;
 const label=p[key];if(!groups.has(label))groups.set(label,blank(label));
 for(const g of [groups.get(label),result.total]){g.people.push(p);g.headcount++;g.counts[p.bucket]++;}
 }
 result.groups=[...groups.values()].sort((a,b)=>a.label.localeCompare(b.label));return result;
}

let pushDistributionDrilldowns=[];
function pushDistributionDetail(g,dist,campaign,bucket){
 return {title:campaign.title+' · '+g.label+' · '+(bucket===null?'Active PS':['0 Sales','1–3 Sales','4–7 Sales','8–14 Sales','15+ Sales'][bucket]),start:dist.start,cutoff:dist.cutoff,people:g.people.filter(p=>bucket===null||p.bucket===bucket)};
}
function pushDistributionRow(g,dist,campaign){
 const title='Earlier active headcount: '+g.previousHeadcount+'. Known hires since earlier cutoff: '+g.newHires+'. Hire date unavailable: '+g.unknownHire+'.';
 const button=(content,bucket)=>{
  if(!campaign)return content;
  const detail=pushDistributionDetail(g,dist,campaign,bucket),index=pushDistributionDrilldowns.push(detail)-1;
  return '<button type="button" class="push-distribution-drilldown'+(bucket===null?' push-distribution-headcount':'')+'" data-push-distribution="'+index+'" aria-haspopup="dialog" aria-label="'+escapeHtml('Show current promoters: '+detail.title)+'">'+content+'</button>';
 };
 return '<tr><td>'+escapeHtml(g.label)+'</td><td data-sort-value="'+g.headcount+'" title="'+title+'">'+button(fmt(g.headcount),null)+'</td>'+g.counts.map((q,n)=>{
  const rate=pushDistributionIR(q,g.previousCounts[n],n,dist.available),prior=dist.available?'Previous MTD count: '+g.previousCounts[n]+'.':'Comparison unavailable: requires complete source date coverage for both monthly snapshots.';
  const value='<span class="push-distribution-now">'+fmt(q)+' ('+pct(g.headcount?q/g.headcount*100:0)+')</span><span class="push-distribution-previous">Prev '+(dist.available?fmt(g.previousCounts[n]):'N/A')+' · <span class="model-rate '+rate.kind+'">'+(rate.symbol?rate.symbol+' ':'')+rate.text+'</span></span>';
  return '<td class="push-distribution-cell" data-sort-value="'+q+'" title="'+prior+' '+title+'">'+button(value,n)+'</td>';
 }).join('')+'</tr>';
}
function pushDistributionDialogHtml(detail){
 const date=d=>Number.isFinite(d)?new Date(d*86400000).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'Unavailable';
 const headings=['Promoter','Current Store','Area','Subregion','Dealer','MTD Units'];
 const rows=detail.people.slice().sort((a,b)=>a._name.localeCompare(b._name)||a._ps.localeCompare(b._ps)).map(p=>'<tr>'+[p._name,p._store,p._area,p._asm,p._customer,fmt(p.units)].map((v,i)=>'<td data-label="'+headings[i]+'"'+(i===5?' class="numeric-nowrap"':'')+'>'+escapeHtml(v||'Unassigned')+'</td>').join('')+'</tr>').join('');
 return '<div class="push-distribution-dialog-head"><h2 id="pushDistributionDialogTitle">'+escapeHtml(detail.title)+'</h2><button type="button" class="secondary-btn" data-push-distribution-close autofocus>Close</button></div><p>'+fmt(detail.people.length)+(detail.allSmartphones?' promoters · MTD ':' current ACTIVE promoters · MTD ')+date(detail.start)+' – '+date(detail.cutoff)+(detail.allSmartphones?'. All smartphone models; selected promoter types and geography filters apply.</p>':'. Current universal filters apply.</p>')+(detail.people.length?'<div class="table-wrap"><table data-no-sort><thead><tr>'+headings.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>':'<p>No current active promoters in this cell.</p>');
}
function pushShortfall(groups){return groups.every(g=>g.target!==null&&g.sales!==null)?groups.reduce((sum,g)=>sum+Math.max(0,g.target-g.sales),0):null;}
(()=>{
 const nav=document.createElement('button');nav.className='nav-item';nav.dataset.section='pushModels';nav.textContent='Push Model Performance';document.querySelector('.nav-item[data-section="dealers"]').before(nav);
 const section=document.createElement('section');section.id='pushModelsSection';section.className='dashboard-section';
 section.innerHTML='<div class="card push-controls"><div role="group" aria-label="Push performance mode"><button type="button" class="secondary-btn" data-push-mode="sales" aria-pressed="true">Sales Performance</button> <button type="button" class="secondary-btn" data-push-mode="distribution" aria-pressed="false">PS Distribution</button></div><label for="pushView">View by</label><select id="pushView"><option value="area">Area</option><option value="subregion">Subregion</option><option value="dealer">Dealer</option><option value="channel">Customer Type</option></select><p>Combined C100 + 16T sales; C100i is excluded. September retains each series’ original target and sales window (16T: September 4–15; C100: September 1–30). Other months use the full month to date.</p><p>Dealer and Customer Type targets: 50% of June–August unit-sales share in “more Php 13000” + 50% of current ACTIVE promoter headcount share. Each promoter counts once under their latest recorded dealer/customer type; without sales, HR dealer is used and customer type is Unassigned. Whole-unit allocations preserve each series total.</p><p>All universal filters apply to sales and displayed groups. Allocated targets stay fixed when filters narrow the view; they are not prorated for a model, price range, dealer, or customer type selection. Area targets combine the selected subregions. Gap is remaining units to target.</p><p id="pushNotice" role="status"></p></div>'+PUSH_CAMPAIGNS.map((c,i)=>'<article class="card table-card"><div class="card-head"><div><h2>'+c.title+'</h2><p id="pushPeriod'+i+'"></p></div></div><div class="table-wrap"><table class="model-history-table" aria-label="'+c.title+' push performance"><thead><tr><th>Area</th><th>Target</th><th>Sales</th><th>Achievement %</th><th>Gap (Shortfall Share)</th></tr></thead><tbody id="pushBody'+i+'"></tbody><tfoot id="pushTotal'+i+'"></tfoot></table></div></article>').join('');
 section.insertAdjacentHTML('beforeend','<article id="pushHeadcountCard" class="card table-card" hidden><div class="card-head"><h2>All Smartphone Sales · Promoter Headcount</h2></div><div class="push-headcount-types" role="group" aria-label="Included promoter types">'+['REG PS','NHT','RESIGNED'].map(t=>'<button type="button" class="secondary-btn" data-push-headcount-type="'+t+'" aria-pressed="true">'+t+'</button>').join(' ')+'</div><p id="pushHeadcountNote"></p><div class="table-wrap"><table class="model-history-table push-performance-table" aria-label="All smartphone promoter headcount"><thead id="pushHeadcountHead"></thead><tbody id="pushHeadcountBody"></tbody><tfoot id="pushHeadcountTotal"></tfoot></table></div></article>');
 $('dealersSection').before(section);
 const style=document.createElement('style');style.textContent='.push-controls [role=group]{margin-bottom:12px}button[data-push-headcount-type][aria-pressed="true"],button[data-push-mode][aria-pressed="true"]{background:#fff2bc;border-color:#d4ad20;color:#111}.push-controls{padding:20px;margin-bottom:18px}.push-controls select{margin-left:12px;padding:8px;border:1px solid #d8dce2;border-radius:6px;background:white;font:inherit}.push-controls p{font-size:12px;color:#69717e;line-height:1.5}#pushModelsSection .table-card{margin-bottom:18px}#pushModelsSection th,#pushModelsSection td{border:1px solid #d8dce2;text-align:center}';document.head.append(style);
 let mode='sales';const headcountTypes=new Set(['REG PS','NHT','RESIGNED']);
 const date=d=>Number.isFinite(d)?new Date(d*86400000).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}):'—';
 const trendCell=(q,p)=>{const rate=modelRate(q,p),symbol={up:'▲',down:'▼',steady:'━',missing:''}[rate.kind];return '<td data-sort-value="'+(q??'')+'">'+(q===null?'—':fmt(q))+' <span class="model-rate '+rate.kind+'">('+symbol+' '+rate.text+')</span></td>';};
 function renderPushModels(){
  pushDistributionDrilldowns=[];
  const all=salesEnriched(),roster=window.evisRoster?.getRoster(),range=window.evisPriceRanges?.getRanges().find(r=>normalize(r.name).replace(/[\s,]+/g,'').toLowerCase()==='morephp13000');
  const view=$('pushView').value,filters=Object.fromEntries(['month','productType','area','asm','customer','channel','model','series','priceRange'].map(k=>[k,selected(k+'Filter')]));
  const warnings=[];if(filters.month!=='2026-09')warnings.push('Targets are supplied for September 2026 only.');if(!roster)warnings.push('Waiting for the active promoter list to allocate targets.');if(!range)warnings.push('Define the “more Php 13000” price range to allocate targets.');
  const row=(g,shortfall,summary=false)=>{const gap=summary?shortfall:g.target!==null&&g.sales!==null?Math.max(0,g.target-g.sales):null;const share=gap!==null&&shortfall!==null?(shortfall>0?gap/shortfall*100:0):null;return '<tr><td>'+escapeHtml(g.label)+'</td><td>'+ (g.target===null?'—':fmt(g.target))+'</td><td>'+(g.sales===null?'—':fmt(g.sales))+'</td><td>'+(g.target>0&&g.sales!==null?pct(g.sales/g.target*100):'—')+'</td><td data-sort-value="'+(gap??'')+'" title="Remaining units and share of total shortfall in the displayed rows; above-target sales do not offset other rows’ shortfalls.">'+(gap===null?'—':fmt(gap)+' ('+(share===null?'—':fmt(share,2)+'%')+')')+'</td></tr>';};
  PUSH_CAMPAIGNS.forEach((campaign,i)=>{
   const report=pushReport(all,roster,range?.name,view,filters,campaign);
   if(i===0&&!report.allocationReady&&['dealer','channel'].includes(view))warnings.push('Allocations need June, July and August data, positive premium sales, and active headcount.');
   $('pushPeriod'+i).textContent=monthName(filters.month)+' · '+(filters.month==='2026-09'?'Combined campaign windows: 16T 4–15; C100 1–30. ':'Combined month-to-date sales. ')+(report.latest?'Uploaded sales through day '+report.latest+'.':'No uploaded sales in this window.')+(campaign.total===null?' Target not supplied.':'');
   const table=$('pushBody'+i).closest('table'),label={area:'Area',subregion:'Subregion',dealer:'Dealer',channel:'Customer Type'}[view],key={area:'_area',subregion:'_asm',dealer:'_customer',channel:'_channel'}[view];
   table.dataset.pushTableMode=mode;table.classList.add('push-performance-table');
   if(mode==='distribution')$('pushPeriod'+i).setAttribute('role','status');else $('pushPeriod'+i).removeAttribute('role');
   if(mode==='distribution'){
    const dist=pushDistribution(all,roster,filters,campaign,view);
    table.tHead.innerHTML='<tr>'+[label,'Active PS','0 Sales','1–3 Sales','4–7 Sales','8–14 Sales','15+ Sales'].map((x,n)=>'<th data-sort-column="'+n+'">'+x+'</th>').join('')+'</tr>';
    const distributionRow=g=>pushDistributionRow(g,dist,campaign);
    $('pushBody'+i).innerHTML=dist.groups.map(distributionRow).join('')||emptyRow(7);$('pushTotal'+i).innerHTML=distributionRow(dist.total);
    $('pushPeriod'+i).textContent=Number.isFinite(dist.cutoff)?'MTD '+date(dist.start)+'–'+date(dist.cutoff)+' · Prev = MTD '+date(dist.previousStart)+'–'+date(dist.previousCutoff)+' · Current PS (% share), then Prev PS and IR.':'No sales dates available in the selected month.';
    if(i===0){
     const note='Green: fewer at 0 sales or more at 15+; red: the reverse. Changes in the 1–3, 4–7, and 8–14 groups are neutral; ±1% is blue/steady. Both snapshots use the current ACTIVE roster and the same assignments. Known hires since the earlier cutoff: '+dist.total.newHires+' (included now, excluded before hire; IR includes this headcount change).'+(dist.total.unknownHire?' Hire date unavailable: '+dist.total.unknownHire+'; included in both snapshots.':'')+(!dist.available?' IR unavailable until complete source date coverage is available for both MTD periods.':'');
     warnings.splice(0,warnings.length,...(!roster?['Waiting for the active promoter list.']:[]),note);
    }
    return;
   }
   const trends=pushTrends(all,filters,campaign,key);
   table.tHead.innerHTML='<tr>'+[label,'Target','Sales','Achievement %','Gap (Shortfall Share)'].map((x,n)=>'<th rowspan="2" data-sort-column="'+n+'">'+x+'</th>').join('')+'<th colspan="4" scope="colgroup">Weekly Trend · QTY (IR)</th><th colspan="3" scope="colgroup">Monthly Trend · QTY (IR)</th></tr><tr>'+trends.weeks.slice(0,4).map((w,n)=>'<th data-sort-column="'+(n+5)+'">'+date(w.start)+'–'+date(w.end)+'</th>').join('')+trends.months.map((m,n)=>'<th data-sort-column="'+(n+9)+'">'+historyMonthLabel(m)+'</th>').join('')+'</tr>';
   const trendCells=labels=>{const g=trends.sum(labels);return trends.weeks.slice(0,4).map((w,n)=>trendCell(w.available?g.weeks[n]:null,trends.weeks[n+1].available?g.weeks[n+1]:null)).join('')+trends.months.map(m=>{const prev=modelMonthOffset(m,-1);return trendCell(trends.complete(m)?g.months[m]||0:null,trends.complete(prev)?g.months[prev]||0:null);}).join('');};
   const shortfall=report.groups.length?pushShortfall(report.groups):null;
   $('pushBody'+i).innerHTML=report.groups.map(g=>row(g,shortfall).replace('</tr>',trendCells([g.label])+'</tr>')).join('')||emptyRow(12);$('pushTotal'+i).innerHTML=row(report.total,shortfall,true).replace('</tr>',trendCells(report.groups.map(g=>g.label))+'</tr>');
  });
  $('pushHeadcountCard').hidden=mode!=='distribution';
  const snapshots=pushSnapshotPeriods(all,filters.month);
  const hc=pushSmartphoneHeadcount(all,roster,filters,view,headcountTypes);
  const previousHC=snapshots.previousMonth?pushSmartphoneHeadcount(all,roster,{...filters,month:snapshots.previousMonth},view,headcountTypes,snapshots.previousCutoff):{groups:[],total:{headcount:0,counts:Array(7).fill(0)}};
  const previousGroups=new Map(previousHC.groups.map(g=>[g.label,g]));
  previousHC.groups.forEach(g=>{if(!hc.groups.some(n=>n.label===g.label))hc.groups.push({label:g.label,headcount:0,counts:Array(7).fill(0),people:[]});});
  hc.groups.sort((a,b)=>a.label.localeCompare(b.label));
  const hcLabel={area:'Area',subregion:'Subregion',dealer:'Dealer',channel:'Customer Type'}[view];
  $('pushHeadcountHead').innerHTML='<tr>'+[hcLabel,'PS Headcount',...PUSH_SMARTPHONE_BANDS].map((h,n)=>'<th data-sort-column="'+n+'">'+h+'</th>').join('')+'</tr>';
  const hcRow=(g,isTotal=false)=>'<tr><td>'+escapeHtml(g.label)+'</td>'+[null,0,1,2,3,4,5,6].map(b=>{
   const people=g.people.filter(p=>b===null||p.bucket===b).map(p=>({...p,_name:p._name+' · '+p.type}));
   const index=pushDistributionDrilldowns.push({allSmartphones:true,title:'All smartphones · '+g.label+' · '+(b===null?'All promoters':PUSH_SMARTPHONE_BANDS[b]),start:Date.UTC(...[...filters.month.split('-').map((n,i)=>Number(n)-(i===1?1:0)),1])/86400000,cutoff:hc.cutoff,people})-1;
   const prev=isTotal?previousHC.total:previousGroups.get(g.label),prior=b===null?(prev?.headcount||0):(prev?.counts[b]||0);
   const rate=pushDistributionIR(people.length,prior,b===6?4:b===0?0:1,snapshots.available);
   const current=fmt(people.length)+(b===null?'':' ('+pct(g.headcount?people.length/g.headcount*100:0)+')');
   return '<td class="push-distribution-cell" data-sort-value="'+people.length+'"><button type="button" class="push-distribution-drilldown" data-push-distribution="'+index+'" aria-haspopup="dialog"><span class="push-distribution-now">'+current+'</span><span class="push-distribution-previous">Prev '+(snapshots.available?fmt(prior):'N/A')+' · <span class="model-rate '+rate.kind+'">'+rate.symbol+' '+rate.text+'</span></span></button></td>';
  }).join('')+'</tr>';
  $('pushHeadcountBody').innerHTML=hc.groups.map(g=>hcRow(g)).join('')||emptyRow(9);$('pushHeadcountTotal').innerHTML=hcRow(hc.total,true);
  $('pushHeadcountNote').textContent=monthName(filters.month)+' · MTD '+date(snapshots.start)+'–'+date(snapshots.cutoff)+' · Prev = MTD '+date(snapshots.previousStart)+'–'+date(snapshots.previousCutoff)+'. '+(!snapshots.available?'Previous comparison unavailable: missing source dates. ':'')+'All smartphone models. Month and geography/dealer/customer-type filters apply; product, model, series and price-range filters do not narrow this table. Selected buttons include those groups. REG PS: 30+ days at the month’s uploaded cutoff; NHT: under 30 days (sales role used when hire date is unavailable). RESIGNED: monthly sellers absent from the current active list, not confirmed historical resignation status. Current active zero sellers are included; known hires after the cutoff are excluded.'+(!roster?' Waiting for active promoter list.':'')+(!Number.isFinite(hc.cutoff)?' No sales data for this month.':'')+(hc.unknown?' '+hc.unknown+' active promoters have unknown type; included only when all three groups are selected.':'');
  $('pushNotice').textContent=warnings.join(' ');
 }
 section.addEventListener('click',e=>{const b=e.target.closest('[data-push-headcount-type]');if(!b)return;const type=b.dataset.pushHeadcountType;headcountTypes.has(type)?headcountTypes.delete(type):headcountTypes.add(type);b.setAttribute('aria-pressed',String(headcountTypes.has(type)));resetPushSort();renderPushModels();});
 function resetPushSort(){section.querySelectorAll('table').forEach(t=>tableSortState.delete(t));}
 section.addEventListener('click',e=>{const b=e.target.closest('button[data-push-mode]');if(!b)return;resetPushSort();mode=b.dataset.pushMode;section.querySelectorAll('button[data-push-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.pushMode===mode)));renderPushModels();});
 $('pushView').addEventListener('change',()=>{resetPushSort();renderPushModels();});
 const before=render;render=()=>{before();renderPushModels();};window.evisPushModels={render:renderPushModels};
 const popup=document.createElement('dialog');popup.className='push-distribution-dialog';popup.setAttribute('aria-labelledby','pushDistributionDialogTitle');document.body.append(popup);
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-push-distribution]');if(!button)return;
  const detail=pushDistributionDrilldowns[Number(button.dataset.pushDistribution)];if(!detail)return;
  popup.innerHTML=pushDistributionDialogHtml(detail);popup.querySelector('[data-push-distribution-close]').onclick=()=>popup.close();if(!popup.open)popup.showModal();
 });
})();

// Color only trend headers; numeric cells retain the standard theme.
(()=>{const style=document.createElement('style');style.textContent=`
table.push-performance-table.push-performance-table th,table.push-performance-table.push-performance-table td{border:1px solid #8993a3!important}
table.push-performance-table td.push-distribution-cell,table.push-performance-table td.push-distribution-cell span{white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important}
table.push-performance-table .push-distribution-now{display:block;font-weight:600;line-height:1.4}
table.push-performance-table .push-distribution-previous{display:block;margin-top:3px;font-size:10px;font-style:italic;font-weight:400;line-height:1.4;color:#606977}
html[data-theme=night] table.push-performance-table .push-distribution-previous{color:#b5c0d0}
.push-distribution-drilldown{display:block;width:100%;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:2px 4px;border-radius:5px}
.push-distribution-drilldown .push-distribution-now,.push-distribution-headcount{text-decoration:underline;text-underline-offset:3px}
.push-distribution-drilldown:hover{background:rgba(128,128,128,.12)}.push-distribution-drilldown:focus-visible{outline:2px solid #2874d0;outline-offset:2px}
.push-distribution-dialog{width:min(1150px,96vw);max-width:none;box-sizing:border-box;max-height:85vh;overflow:auto;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--text);padding:20px}
.push-distribution-dialog::backdrop{background:rgba(0,0,0,.6)}.push-distribution-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:16px}.push-distribution-dialog h2{font-size:18px;margin:0}.push-distribution-dialog p{font-size:12px;color:var(--muted);line-height:1.5}
.push-distribution-dialog table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px}.push-distribution-dialog :is(th,td){padding:10px 8px;border:1px solid var(--line);text-align:left;overflow-wrap:anywhere;white-space:normal}
.push-distribution-dialog th:nth-child(1){width:18%}.push-distribution-dialog th:nth-child(2){width:28%}.push-distribution-dialog th:nth-child(3){width:9%}.push-distribution-dialog th:nth-child(4){width:17%}.push-distribution-dialog th:nth-child(5){width:20%}.push-distribution-dialog th:nth-child(6){width:8%}
.push-distribution-dialog td:last-child{white-space:nowrap!important;text-align:right;font-variant-numeric:tabular-nums}
@media(max-width:720px){.push-distribution-dialog table,.push-distribution-dialog tbody{display:block}.push-distribution-dialog thead{display:none}.push-distribution-dialog tbody tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--line);border-radius:8px;margin-bottom:12px}.push-distribution-dialog td{display:block;min-width:0;border:0}.push-distribution-dialog td:first-child{grid-column:1/-1;font-weight:600}.push-distribution-dialog td::before{content:attr(data-label);display:block;font-size:10px;font-weight:400;color:var(--muted);margin-bottom:4px}.push-distribution-dialog td:last-child{text-align:left}}
table.push-performance-table .model-rate.neutral,table.push-performance-table .model-rate.missing{color:#606977}
html[data-theme=night] table.push-performance-table .model-rate.neutral,html[data-theme=night] table.push-performance-table .model-rate.missing{color:#b5c0d0!important}
table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead :is(th[data-sort-column="5"],th[data-sort-column="6"],th[data-sort-column="7"],th[data-sort-column="8"]),table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead tr:first-child th:nth-child(6){background:#dceaff!important}
table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead :is(th[data-sort-column="9"],th[data-sort-column="10"],th[data-sort-column="11"]),table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead tr:first-child th:nth-child(7){background:#e9dff8!important}
html[data-theme=night] table.push-performance-table.push-performance-table th,html[data-theme=night] table.push-performance-table.push-performance-table td{border-color:#718096!important}
html[data-theme=night] table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead :is(th[data-sort-column="5"],th[data-sort-column="6"],th[data-sort-column="7"],th[data-sort-column="8"]),html[data-theme=night] table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead tr:first-child th:nth-child(6){background:#294463!important}
html[data-theme=night] table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead :is(th[data-sort-column="9"],th[data-sort-column="10"],th[data-sort-column="11"]),html[data-theme=night] table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead tr:first-child th:nth-child(7){background:#443657!important}
`;document.head.append(style);})();
