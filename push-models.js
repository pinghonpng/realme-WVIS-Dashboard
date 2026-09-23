// Campaign targets and allocation are calculated before display filters.
const PUSH_TERRITORIES=[
 ['NEGROS','NEGROS.NORTH&BACOLOD',122,140],['NEGROS','NEGROS.PALAWAN',18,25],['NEGROS','NEGROS.SOUTH',60,75],
 ['EVIS','EVIS.ORMOC&OUTBASE',39,49],['EVIS','EVIS.SAMAR',74,84],['EVIS','EVIS.SOUTH LEYTE',18,28],['EVIS','EVIS.TACLOBAN',69,79],
 ['PANAY','PANAY.PANAY 1',50,60],['PANAY','PANAY.PANAY 2',50,60],['PANAY','PANAY.PANAY 3',62,72],['PANAY','PANAY.PANAY 4',38,48]
];
const PUSH_CAMPAIGNS=[{series:'16T SERIES',title:'16T Series',start:4,end:15,total:1191,column:2},{series:'C100 SERIES',title:'C100 Series',start:1,end:30,total:720,column:3}];
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
 return roster.entries.map(e=>{const row=latest.get(e.key);return {_ps:e.key,_area:row?._area||e.area,_asm:row?._asm||e.asm,_customer:row?._customer||e.customer||'Unassigned',_channel:row?._channel||'Unassigned'};});
}
function pushReport(all,roster,rangeName,view,filters,campaign){
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
 const productMatch=r=>passes(r._model,filters.model)&&passes(r._series,filters.series)&&passes(r._priceRange,filters.priceRange);
 const period=all.filter(r=>modelMonthKey(r._date)===filters.month&&r._date.getDate()>=campaign.start&&r._date.getDate()<=campaign.end);
 const sales=new Map();period.filter(r=>r._series===campaign.series&&territoryMatch(r)&&productMatch(r)).forEach(r=>sales.set(label(r),(sales.get(label(r))||0)+r._qty));
 const eligible=new Set([...all.filter(territoryMatch),...members.filter(territoryMatch)].map(label));
 if(filters.customer==='ALL'&&filters.channel==='ALL'&&(view==='area'||view==='subregion'))PUSH_TERRITORIES.filter(t=>passes(t[0],filters.area)&&passes(t[1],filters.asm)).forEach(t=>eligible.add(t[view==='area'?0:1]));
 const seriesVisible=passes(campaign.series,filters.series);
 const modelVisible=filters.model==='ALL'||all.some(r=>r._model===filters.model&&r._series===campaign.series);
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
 for(const r of all){if(r._series!==campaign.series||!['area','asm','customer','channel','model','series','priceRange'].every(k=>passes(r['_'+k],filters[k])))continue;
 const label=r[key]||'Unassigned';if(!buckets.has(label))buckets.set(label,blank());const g=buckets.get(label),d=day(r._date),m=modelMonthKey(r._date);
 weeks.forEach((w,i)=>{if(d>=w.start&&d<=w.end)g.weeks[i]+=r._qty;});if(months.includes(m)||m===baseline)g.months[m]=(g.months[m]||0)+r._qty;}
 const sum=labels=>{const g=blank();labels.forEach(label=>{const v=buckets.get(label);if(v){v.weeks.forEach((q,i)=>g.weeks[i]+=q);Object.entries(v.months).forEach(([m,q])=>g.months[m]=(g.months[m]||0)+q);}});return g;};
 return {weeks,months,complete,sum};
}
function pushDistribution(all,roster,filters,campaign,view){
 if(!roster)return {groups:[],total:{label:'WVIS',headcount:0,counts:[0,0,0,0]}};
 const key={area:'_area',subregion:'_asm',dealer:'_customer',channel:'_channel'}[view];
 const members=pushLatestPromoters(all.filter(r=>modelMonthKey(r._date)<=filters.month),roster).filter(r=>['area','asm','customer','channel'].every(k=>passes(r['_'+k],filters[k])));
 const mapped=psSalesReviewData(all,roster,{area:'ALL',asm:'ALL',customer:'ALL',channel:'ALL'},storeMap()).all,sales=new Map();
 mapped.forEach(r=>{if(modelMonthKey(r._date)!==filters.month||r._series!==campaign.series||!['area','asm','customer','channel','model','series','priceRange'].every(k=>passes(r['_'+k],filters[k])))return;sales.set(r._reviewPs,(sales.get(r._reviewPs)||0)+r._qty);});
 const groups=new Map();if(passes(campaign.series,filters.series)&&(filters.model==='ALL'||all.some(r=>r._model===filters.model&&r._series===campaign.series)))members.forEach(m=>{const label=m[key]||'Unassigned';if(!groups.has(label))groups.set(label,{label,headcount:0,counts:[0,0,0,0]});const g=groups.get(label),q=Math.max(0,sales.get(m._ps)||0);g.headcount++;g.counts[Math.min(3,Math.floor(q))]++;});
 const list=[...groups.values()].sort((a,b)=>a.label.localeCompare(b.label)),total={label:'WVIS',headcount:0,counts:[0,0,0,0]};list.forEach(g=>{total.headcount+=g.headcount;g.counts.forEach((q,i)=>total.counts[i]+=q);});return {groups:list,total};
}
function pushShortfall(groups){return groups.every(g=>g.target!==null&&g.sales!==null)?groups.reduce((sum,g)=>sum+Math.max(0,g.target-g.sales),0):null;}
(()=>{
 const nav=document.createElement('button');nav.className='nav-item';nav.dataset.section='pushModels';nav.textContent='Push Model Performance';document.querySelector('.nav-item[data-section="dealers"]').before(nav);
 const section=document.createElement('section');section.id='pushModelsSection';section.className='dashboard-section';
 section.innerHTML='<div class="card push-controls"><div role="group" aria-label="Push performance mode"><button type="button" class="secondary-btn" data-push-mode="sales" aria-pressed="true">Sales Performance</button> <button type="button" class="secondary-btn" data-push-mode="distribution" aria-pressed="false">PS Distribution</button></div><label for="pushView">View by</label><select id="pushView"><option value="area">Area</option><option value="subregion">Subregion</option><option value="dealer">Dealer</option><option value="channel">Customer Type</option></select><p>September 2026 targets: 16T · September 4–15; C100 · September 1–30. C100i sales are excluded.</p><p>Dealer and Customer Type targets: 50% of June–August unit-sales share in “more Php 13000” + 50% of current ACTIVE promoter headcount share. Each promoter counts once under their latest recorded dealer/customer type; without sales, HR dealer is used and customer type is Unassigned. Whole-unit allocations preserve each series total.</p><p>All universal filters apply to sales and displayed groups. Allocated targets stay fixed when filters narrow the view; they are not prorated for a model, price range, dealer, or customer type selection. Area targets combine the selected subregions. Gap is remaining units to target.</p><p id="pushNotice" role="status"></p></div>'+PUSH_CAMPAIGNS.map((c,i)=>'<article class="card table-card"><div class="card-head"><div><h2>'+c.title+'</h2><p id="pushPeriod'+i+'"></p></div></div><div class="table-wrap"><table class="model-history-table" aria-label="'+c.title+' push performance"><thead><tr><th>Area</th><th>Target</th><th>Sales</th><th>Achievement %</th><th>Gap (Shortfall Share)</th></tr></thead><tbody id="pushBody'+i+'"></tbody><tfoot id="pushTotal'+i+'"></tfoot></table></div></article>').join('');
 $('dealersSection').before(section);
 const style=document.createElement('style');style.textContent='.push-controls [role=group]{margin-bottom:12px}button[data-push-mode][aria-pressed="true"]{background:#fff2bc;border-color:#d4ad20;color:#111}.push-controls{padding:20px;margin-bottom:18px}.push-controls select{margin-left:12px;padding:8px;border:1px solid #d8dce2;border-radius:6px;background:white;font:inherit}.push-controls p{font-size:12px;color:#69717e;line-height:1.5}#pushModelsSection .table-card{margin-bottom:18px}#pushModelsSection th,#pushModelsSection td{border:1px solid #d8dce2;text-align:center}';document.head.append(style);
 let mode='sales';
 const date=d=>Number.isFinite(d)?new Date(d*86400000).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}):'—';
 const trendCell=(q,p)=>{const rate=modelRate(q,p),symbol={up:'▲',down:'▼',steady:'━',missing:''}[rate.kind];return '<td data-sort-value="'+(q??'')+'">'+(q===null?'—':fmt(q))+' <span class="model-rate '+rate.kind+'">('+symbol+' '+rate.text+')</span></td>';};
 function renderPushModels(){
  const all=salesEnriched(),roster=window.evisRoster?.getRoster(),range=window.evisPriceRanges?.getRanges().find(r=>normalize(r.name).replace(/[\s,]+/g,'').toLowerCase()==='morephp13000');
  const view=$('pushView').value,filters=Object.fromEntries(['month','area','asm','customer','channel','model','series','priceRange'].map(k=>[k,selected(k+'Filter')]));
  const warnings=[];if(filters.month!=='2026-09')warnings.push('Targets are supplied for September 2026 only.');if(!roster)warnings.push('Waiting for the active promoter list to allocate targets.');if(!range)warnings.push('Define the “more Php 13000” price range to allocate targets.');
  const row=(g,shortfall,summary=false)=>{const gap=summary?shortfall:g.target!==null&&g.sales!==null?Math.max(0,g.target-g.sales):null;const share=gap!==null&&shortfall!==null?(shortfall>0?gap/shortfall*100:0):null;return '<tr><td>'+escapeHtml(g.label)+'</td><td>'+ (g.target===null?'—':fmt(g.target))+'</td><td>'+(g.sales===null?'—':fmt(g.sales))+'</td><td>'+(g.target>0&&g.sales!==null?pct(g.sales/g.target*100):'—')+'</td><td data-sort-value="'+(gap??'')+'" title="Remaining units and share of total shortfall in the displayed rows; above-target sales do not offset other rows’ shortfalls.">'+(gap===null?'—':fmt(gap)+' ('+(share===null?'—':fmt(share,2)+'%')+')')+'</td></tr>';};
  PUSH_CAMPAIGNS.forEach((campaign,i)=>{
   const report=pushReport(all,roster,range?.name,view,filters,campaign);
   if(i===0&&!report.allocationReady&&['dealer','channel'].includes(view))warnings.push('Allocations need June, July and August data, positive premium sales, and active headcount.');
   $('pushPeriod'+i).textContent=monthName(filters.month)+' · '+campaign.start+'–'+campaign.end+' sales window. '+(report.latest?'Uploaded sales through day '+report.latest+'.':'No uploaded sales in this window.')+(campaign.total===null?' Target not supplied.':'');
   const table=$('pushBody'+i).closest('table'),label={area:'Area',subregion:'Subregion',dealer:'Dealer',channel:'Customer Type'}[view],key={area:'_area',subregion:'_asm',dealer:'_customer',channel:'_channel'}[view];
   table.dataset.pushTableMode=mode;table.classList.add('push-performance-table');
   if(mode==='distribution'){
    const dist=pushDistribution(all,roster,filters,campaign,view);
    table.tHead.innerHTML='<tr>'+[label,'Active PS','0 Units','1 Unit','2 Units','3+ Units'].map((x,n)=>'<th data-sort-column="'+n+'">'+x+'</th>').join('')+'</tr>';
    const distributionRow=g=>'<tr><td>'+escapeHtml(g.label)+'</td><td>'+fmt(g.headcount)+'</td>'+g.counts.map(q=>'<td data-sort-value="'+q+'">'+fmt(q)+' ('+pct(g.headcount?q/g.headcount*100:0)+')</td>').join('')+'</tr>';
    $('pushBody'+i).innerHTML=dist.groups.map(distributionRow).join('')||emptyRow(6);$('pushTotal'+i).innerHTML=distributionRow(dist.total);
    return;
   }
   const trends=pushTrends(all,filters,campaign,key);
   table.tHead.innerHTML='<tr>'+[label,'Target','Sales','Achievement %','Gap (Shortfall Share)'].map((x,n)=>'<th rowspan="2" data-sort-column="'+n+'">'+x+'</th>').join('')+'<th colspan="4" scope="colgroup">Weekly Trend · QTY (IR)</th><th colspan="3" scope="colgroup">Monthly Trend · QTY (IR)</th></tr><tr>'+trends.weeks.slice(0,4).map((w,n)=>'<th data-sort-column="'+(n+5)+'">'+date(w.start)+'–'+date(w.end)+'</th>').join('')+trends.months.map((m,n)=>'<th data-sort-column="'+(n+9)+'">'+historyMonthLabel(m)+'</th>').join('')+'</tr>';
   const trendCells=labels=>{const g=trends.sum(labels);return trends.weeks.slice(0,4).map((w,n)=>trendCell(w.available?g.weeks[n]:null,trends.weeks[n+1].available?g.weeks[n+1]:null)).join('')+trends.months.map(m=>{const prev=modelMonthOffset(m,-1);return trendCell(trends.complete(m)?g.months[m]||0:null,trends.complete(prev)?g.months[prev]||0:null);}).join('');};
   const shortfall=report.groups.length?pushShortfall(report.groups):null;
   $('pushBody'+i).innerHTML=report.groups.map(g=>row(g,shortfall).replace('</tr>',trendCells([g.label])+'</tr>')).join('')||emptyRow(12);$('pushTotal'+i).innerHTML=row(report.total,shortfall,true).replace('</tr>',trendCells(report.groups.map(g=>g.label))+'</tr>');
  });
  $('pushNotice').textContent=warnings.join(' ');
 }
 function resetPushSort(){section.querySelectorAll('table').forEach(t=>tableSortState.delete(t));}
 section.addEventListener('click',e=>{const b=e.target.closest('button[data-push-mode]');if(!b)return;resetPushSort();mode=b.dataset.pushMode;section.querySelectorAll('button[data-push-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.pushMode===mode)));renderPushModels();});
 $('pushView').addEventListener('change',()=>{resetPushSort();renderPushModels();});
 const before=render;render=()=>{before();renderPushModels();};window.evisPushModels={render:renderPushModels};
})();

// Color only trend headers; numeric cells retain the standard theme.
(()=>{const style=document.createElement('style');style.textContent=`
table.push-performance-table.push-performance-table th,table.push-performance-table.push-performance-table td{border:1px solid #8993a3!important}
table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead :is(th[data-sort-column="5"],th[data-sort-column="6"],th[data-sort-column="7"],th[data-sort-column="8"]),table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead tr:first-child th:nth-child(6){background:#dceaff!important}
table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead :is(th[data-sort-column="9"],th[data-sort-column="10"],th[data-sort-column="11"]),table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead tr:first-child th:nth-child(7){background:#e9dff8!important}
html[data-theme=night] table.push-performance-table.push-performance-table th,html[data-theme=night] table.push-performance-table.push-performance-table td{border-color:#718096!important}
html[data-theme=night] table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead :is(th[data-sort-column="5"],th[data-sort-column="6"],th[data-sort-column="7"],th[data-sort-column="8"]),html[data-theme=night] table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead tr:first-child th:nth-child(6){background:#294463!important}
html[data-theme=night] table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead :is(th[data-sort-column="9"],th[data-sort-column="10"],th[data-sort-column="11"]),html[data-theme=night] table.push-performance-table.push-performance-table[data-push-table-mode=sales] thead tr:first-child th:nth-child(7){background:#443657!important}
`;document.head.append(style);})();
