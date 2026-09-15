// Campaign targets and allocation are calculated before display filters.
const PUSH_TERRITORIES=[
 ['NEGROS','NEGROS.NORTH&BACOLOD',122,140],['NEGROS','NEGROS.PALAWAN',18,25],['NEGROS','NEGROS.SOUTH',60,75],
 ['EVIS','EVIS.ORMOC&OUTBASE',39,49],['EVIS','EVIS.SAMAR',74,84],['EVIS','EVIS.SOUTH LEYTE',18,28],['EVIS','EVIS.TACLOBAN',69,79],
 ['PANAY','PANAY.PANAY 1',50,60],['PANAY','PANAY.PANAY 2',50,60],['PANAY','PANAY.PANAY 3',62,72],['PANAY','PANAY.PANAY 4',38,48]
];
const PUSH_CAMPAIGNS=[{series:'16T SERIES',title:'16T Series',start:4,end:15,total:600,column:2},{series:'C100 SERIES',title:'C100 Series',start:1,end:30,total:720,column:3}];
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
   targets=new Map();PUSH_TERRITORIES.filter(t=>passes(t[0],filters.area)&&passes(t[1],filters.asm)).forEach(t=>{const k=t[view==='area'?0:1];targets.set(k,(targets.get(k)||0)+t[campaign.column]);});
  }else if(allocationReady)targets=pushWholeTargets(campaign.total,weights);
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
(()=>{
 const nav=document.createElement('button');nav.className='nav-item';nav.dataset.section='pushModels';nav.textContent='Push Model Performance';document.querySelector('.nav-item[data-section="dealers"]').before(nav);
 const section=document.createElement('section');section.id='pushModelsSection';section.className='dashboard-section';
 section.innerHTML='<div class="card push-controls"><label for="pushView">View by</label><select id="pushView"><option value="area">Area</option><option value="subregion">Subregion</option><option value="dealer">Dealer</option><option value="channel">Customer Type</option></select><p>September 2026 targets: 16T · September 4–15; C100 · September 1–30. C100i sales are excluded.</p><p>Dealer and Customer Type targets: 50% of June–August unit-sales share in “more Php 13000” + 50% of current ACTIVE promoter headcount share. Each promoter counts once under their latest recorded dealer/customer type; without sales, HR dealer is used and customer type is Unassigned. Whole-unit allocations preserve each series total.</p><p>All universal filters apply to sales and displayed groups. Allocated targets stay fixed when filters narrow the view; they are not prorated for a model, price range, dealer, or customer type selection. Area targets combine the selected subregions. Gap is remaining units to target.</p><p id="pushNotice" role="status"></p></div>'+PUSH_CAMPAIGNS.map((c,i)=>'<article class="card table-card"><div class="card-head"><div><h2>'+c.title+'</h2><p id="pushPeriod'+i+'"></p></div></div><div class="table-wrap"><table class="model-history-table" aria-label="'+c.title+' push performance"><thead><tr><th>Area</th><th>Target</th><th>Sales</th><th>Achievement %</th><th>Gap</th></tr></thead><tbody id="pushBody'+i+'"></tbody><tfoot id="pushTotal'+i+'"></tfoot></table></div></article>').join('');
 $('dealersSection').before(section);
 const style=document.createElement('style');style.textContent='.push-controls{padding:20px;margin-bottom:18px}.push-controls select{margin-left:12px;padding:8px;border:1px solid #d8dce2;border-radius:6px;background:white;font:inherit}.push-controls p{font-size:12px;color:#69717e;line-height:1.5}#pushModelsSection .table-card{margin-bottom:18px}#pushModelsSection th,#pushModelsSection td{border:1px solid #d8dce2;text-align:center}';document.head.append(style);
 function renderPushModels(){
  const all=salesEnriched(),roster=window.evisRoster?.getRoster(),range=window.evisPriceRanges?.getRanges().find(r=>normalize(r.name).replace(/[\s,]+/g,'').toLowerCase()==='morephp13000');
  const view=$('pushView').value,filters=Object.fromEntries(['month','area','asm','customer','channel','model','series','priceRange'].map(k=>[k,selected(k+'Filter')]));
  const warnings=[];if(filters.month!=='2026-09')warnings.push('Targets are supplied for September 2026 only.');if(!roster)warnings.push('Waiting for the active promoter list to allocate targets.');if(!range)warnings.push('Define the “more Php 13000” price range to allocate targets.');
  const row=g=>'<tr><td>'+escapeHtml(g.label)+'</td><td>'+ (g.target===null?'—':fmt(g.target))+'</td><td>'+(g.sales===null?'—':fmt(g.sales))+'</td><td>'+(g.target>0&&g.sales!==null?pct(g.sales/g.target*100):'—')+'</td><td>'+(g.target!==null&&g.sales!==null?fmt(Math.max(0,g.target-g.sales)):'—')+'</td></tr>';
  PUSH_CAMPAIGNS.forEach((campaign,i)=>{
   const report=pushReport(all,roster,range?.name,view,filters,campaign);
   if(i===0&&!report.allocationReady&&['dealer','channel'].includes(view))warnings.push('Allocations need June, July and August data, positive premium sales, and active headcount.');
   $('pushPeriod'+i).textContent=monthName(filters.month)+' · '+campaign.start+'–'+campaign.end+' sales window. '+(report.latest?'Uploaded sales through day '+report.latest+'.':'No uploaded sales in this window.')+(campaign.total===null?' Target not supplied.':'');
   const header=$('pushBody'+i).closest('table').tHead.rows[0].cells[0],button=header.querySelector('button'),label={area:'Area',subregion:'Subregion',dealer:'Dealer',channel:'Customer Type'}[view];
   if(button){button.setAttribute('aria-label','Sort by '+label);button.textContent=label+({'ascending':' ↑','descending':' ↓'}[header.getAttribute('aria-sort')]||' ↕');}else header.textContent=label;
   $('pushBody'+i).innerHTML=report.groups.map(row).join('')||emptyRow(5);$('pushTotal'+i).innerHTML=row(report.total);
  });
  $('pushNotice').textContent=warnings.join(' ');
 }
 $('pushView').addEventListener('change',renderPushModels);
 const before=render;render=()=>{before();renderPushModels();};window.evisPushModels={render:renderPushModels};
})();
