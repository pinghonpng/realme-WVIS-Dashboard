// Incentives use all uploaded sales in their own month, independent of universal filters.
function asmIncentiveReport(all,roster,month){
 const period=all.filter(r=>modelMonthKey(r._date)===month),cutoff=period.reduce((d,r)=>Math.max(d,+r._date),-Infinity);
 const byId=new Map((roster?.entries||[]).filter(e=>e.id).map(e=>[e.id,e])),byName=new Map((roster?.entries||[]).map(e=>[rosterName(e.name),e]));
 const match=r=>{const id=rosterCode(r._ps),named=byName.get(rosterName(find(r,'PS Name','Promoter Name')));return byId.get(id)||((!id||!named?.id)&&named)||null;};
 const role=r=>normalize(find(r,'SR Role')).toUpperCase(),latest=new Map(),groups=new Map();
 const territory=r=>JSON.stringify([r._area||'Unassigned',r._asm||'Unassigned']);
 const group=r=>{const key=territory(r);if(!groups.has(key))groups.set(key,{key,area:r._area||'Unassigned',subregion:r._asm||'Unassigned',headcount:0,promoterUnits:0,promoterScore:0,flUnits:0,flScore:0,missing:!roster,people:new Map()});return groups.get(key);};
 const person=(g,key,name,type,active)=>{const k=JSON.stringify([key,type]);if(!g.people.has(k))g.people.set(k,{name,type,active,units:0,score:0,deduction:0,missing:false});return g.people.get(k);};
 for(const r of all){if(!r._date||isNaN(r._date)||+r._date>cutoff)continue;const e=match(r);if(e&&(!latest.has(e.key)||r._date>=latest.get(e.key)._date))latest.set(e.key,r);}
 for(const r of period){
  const rawRole=role(r),type=['SP','NHT'].includes(rawRole)?'Promoter':rawRole==='FL'?'FL':rawRole||'Unknown role',e=match(r),g=group(r);
  const name=normalize(find(r,'PS Name','Promoter Name'))||normalize(r._ps)||'Unassigned',key=e?.key||rosterCode(r._ps)||rosterName(name);
  const p=person(g,key,name,type,!!e);p.units+=r._qty;p.score+=r._points??0;
  if(type==='Promoter'){g.promoterUnits+=r._qty;g.promoterScore+=r._points??0;}
  if(type==='FL'){g.flUnits+=r._qty;g.flScore+=r._points??0;}
  if(!rawRole||(['Promoter','FL'].includes(type)&&r._points==null)){p.missing=true;g.missing=true;}
 }
 // Charge each active promoter once, at their latest recorded territory; include zero sales.
 for(const e of roster?.entries||[]){const r=latest.get(e.key);if(r&&role(r)&&!['SP','NHT'].includes(role(r)))continue;
  const g=group({_area:r?._area||e.area,_asm:r?._asm||e.asm}),p=person(g,e.key,e.name,'Promoter',true);g.headcount++;p.deduction=100;
 }
 for(const g of groups.values()){
  g.promoterContribution=(g.promoterScore-100*g.headcount)*4;g.flContribution=g.flScore*10;g.incentive=g.promoterContribution+g.flContribution;
  g.people=[...g.people.values()].map(p=>({...p,promoterContribution:p.type==='Promoter'?(p.score-p.deduction)*4:0,flContribution:p.type==='FL'?p.score*10:0,incentive:p.type==='Promoter'?(p.score-p.deduction)*4:p.type==='FL'?p.score*10:0})).sort((a,b)=>a.name.localeCompare(b.name));
 }
 return {groups:[...groups.values()].sort((a,b)=>a.area.localeCompare(b.area)||a.subregion.localeCompare(b.subregion)),cutoff,unknown:period.filter(r=>!role(r)).length};
}
function asmIncentiveTotal(groups){return groups.reduce((t,g)=>{for(const k of ['headcount','promoterUnits','promoterScore','flUnits','flScore','promoterContribution','flContribution','incentive'])t[k]+=g[k];t.missing||=g.missing;return t;},{area:'WVIS',subregion:'',headcount:0,promoterUnits:0,promoterScore:0,flUnits:0,flScore:0,promoterContribution:0,flContribution:0,incentive:0,missing:false});}
(()=>{
 const nav=document.createElement('button');nav.className='nav-item';nav.dataset.section='asmIncentives';nav.textContent='ASM Incentives';document.querySelector('[data-section="productivity"]').after(nav);
 const section=document.createElement('section');section.id='asmIncentivesSection';section.className='dashboard-section';section.innerHTML=`<div class="card asm-controls productivity-controls"><label>Month<select id="asmIncentiveMonth" aria-label="ASM incentive month"></select></label><label>Subregion<select id="asmIncentiveSubregion" aria-label="ASM incentive subregion"><option value="ALL">All subregions</option></select></label><label>View<select id="asmIncentiveView" aria-label="ASM incentive view"><option value="summary">Subregion summary</option><option value="contributions">Promoter / FL contributions</option></select></label></div><div id="asmIncentiveNotice" role="status"></div><article class="card table-card"><div class="card-head"><h2 id="asmIncentiveHeading">Subregion Incentives</h2></div><div class="table-wrap"><table class="model-history-table" aria-label="ASM incentives"><thead id="asmIncentiveHead"><tr><th>Area</th><th>Subregion</th><th>Active PS</th><th>Promoter Units</th><th>Promoter Score</th><th>FL Units</th><th>FL Score</th><th>Promoter × ₱4</th><th>FL × ₱10</th><th>Running Incentive</th></tr></thead><tbody id="asmIncentiveBody"></tbody><tfoot id="asmIncentiveTotal"></tfoot></table></div></article>`;
 $('productivitySection').after(section);const style=document.createElement('style');style.textContent='body:has(#asmIncentivesSection.active) .filters{display:none!important}.asm-controls{margin-bottom:20px;padding:20px}.asm-resigned{background:#fbe3e3!important;color:#b32626;font-weight:600}#asmIncentiveNotice:not(:empty){padding:12px 0;color:#a33}#asmIncentiveBody td{font-variant-numeric:tabular-nums}';document.head.append(style);
 const money=(v,missing)=>'<td data-sort-value="'+(missing?'':v)+'" style="color:'+(v<0?'#c93636':v>0?'#238747':'inherit')+'">'+(missing?'—':'₱'+fmt(v,2))+'</td>';
 const cell=v=>'<td>'+escapeHtml(String(v))+'</td>',numeric=(v,missing=false)=>'<td data-sort-value="'+(missing?'':v)+'">'+(missing?'—':fmt(v,Number.isInteger(v)?0:2))+'</td>';
 function renderAsm(){
  const all=salesEnriched(),months=uniq(all.map(r=>modelMonthKey(r._date)).filter(Boolean)).sort().reverse(),select=$('asmIncentiveMonth'),old=select.value;
  if([...select.options].map(o=>o.value).join()!==months.join())select.innerHTML=months.map(m=>'<option value="'+m+'">'+escapeHtml(monthName(m))+'</option>').join('');select.value=months.includes(old)?old:months[0]||'';
  const roster=window.evisRoster?.getRoster(),report=asmIncentiveReport(all,roster,select.value),sub=$('asmIncentiveSubregion'),prior=sub.value;
  sub.innerHTML='<option value="ALL">All subregions</option>'+report.groups.map(g=>'<option value="'+escapeHtml(g.key)+'">'+escapeHtml(g.area+' / '+g.subregion)+'</option>').join('');sub.value=report.groups.some(g=>g.key===prior)?prior:'ALL';
  const groups=report.groups.filter(g=>sub.value==='ALL'||g.key===sub.value),total=asmIncentiveTotal(groups),detail=$('asmIncentiveView').value==='contributions';
  const cols=detail?['Name','Role','Area','Subregion','Sales Units','Score','Baseline Score','Promoter × ₱4','FL × ₱10','Contribution']:['Area','Subregion','Active PS','Promoter Units','Promoter Score','FL Units','FL Score','Promoter × ₱4','FL × ₱10','Running Incentive'];
  if($('asmIncentiveHead').dataset.view!==String(detail)){$('asmIncentiveHead').innerHTML='<tr>'+cols.map(s=>'<th>'+s+'</th>').join('')+'</tr>';$('asmIncentiveHead').dataset.view=String(detail);}
  $('asmIncentiveHeading').textContent=detail?'Promoter / FL Contributions':'Subregion Incentives';
  const summary=g=>'<tr>'+cell(g.area)+cell(g.subregion)+numeric(g.headcount,!roster)+numeric(g.promoterUnits)+numeric(g.promoterScore,g.missing)+numeric(g.flUnits)+numeric(g.flScore,g.missing)+money(g.promoterContribution,g.missing)+money(g.flContribution,g.missing)+money(g.incentive,g.missing)+'</tr>';
  $('asmIncentiveBody').innerHTML=detail?groups.flatMap(g=>g.people.map(p=>'<tr>'+cell(p.name)+'<td class="'+(roster&&p.type==='Promoter'&&!p.active?'asm-resigned':'')+'">'+escapeHtml(p.type==='Promoter'?(roster?(p.active?'Promoter':'Promoter (Resigned)'):'Promoter (status pending)'):p.type==='FL'?'FL':p.type+' (excluded)')+'</td>'+cell(g.area)+cell(g.subregion)+numeric(p.units)+numeric(p.score,p.missing)+numeric(p.deduction,!roster)+money(p.promoterContribution,p.missing||!roster)+money(p.flContribution,p.missing||!roster)+money(p.incentive,p.missing||!roster)+'</tr>')).join('')||emptyRow(10):groups.map(summary).join('')||emptyRow(10);
  const people=groups.flatMap(g=>g.people);$('asmIncentiveTotal').innerHTML=detail?'<tr>'+cell('WVIS')+cell('')+cell('')+cell('')+numeric(people.reduce((s,p)=>s+p.units,0))+numeric(people.reduce((s,p)=>s+p.score,0),total.missing)+numeric(total.headcount*100,!roster)+money(total.promoterContribution,total.missing)+money(total.flContribution,total.missing)+money(total.incentive,total.missing)+'</tr>':summary(total);
  $('asmIncentiveNotice').textContent=!roster?'Waiting for the ACTIVE promoter list. Incentives will appear once it loads.':groups.some(g=>g.missing)?'Incentive unavailable for rows with missing SR Role or model scores. Restore Column L or update the scoring file in Data Sources.':'';
  if(section.classList.contains('active'))$('periodLabel').textContent=monthName(select.value)+(Number.isFinite(report.cutoff)?' · through '+new Date(report.cutoff).toLocaleDateString():'');
 }
 ['asmIncentiveMonth','asmIncentiveSubregion','asmIncentiveView'].forEach(id=>$(id).addEventListener('change',renderAsm));
 document.addEventListener('click',e=>{if(e.target.closest('.nav-item')&&section.classList.contains('active'))renderAsm();});
 const before=render;render=()=>{before();renderAsm();};window.evisAsmIncentives={render:renderAsm};
})();
