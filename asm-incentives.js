// Incentives use all uploaded sales in their own month, independent of universal filters.
function asmIncentiveReport(all,roster,month){
 const period=all.filter(r=>modelMonthKey(r._date)===month),cutoff=period.reduce((d,r)=>Math.max(d,+r._date),-Infinity);
 const byId=new Map((roster?.entries||[]).filter(e=>e.id).map(e=>[e.id,e])),byName=new Map((roster?.entries||[]).map(e=>[rosterName(e.name),e]));
 const match=r=>{const id=rosterCode(r._ps),named=byName.get(rosterName(find(r,'PS Name','Promoter Name')));return byId.get(id)||((!id||!named?.id)&&named)||null;};
 const role=r=>normalize(find(r,'SR Role')).toUpperCase(),latest=new Map(),hires=new Map(),groups=new Map();
 const territory=r=>JSON.stringify([r._area||'Unassigned',r._asm||'Unassigned']);
 const group=r=>{const key=territory(r);if(!groups.has(key))groups.set(key,{key,area:r._area||'Unassigned',subregion:r._asm||'Unassigned',headcount:0,baselineScore:0,promoterUnits:0,promoterScore:0,flUnits:0,flScore:0,missing:!roster,people:new Map()});return groups.get(key);};
 const person=(g,key,name,type,active)=>{const k=JSON.stringify([key,type]);if(!g.people.has(k))g.people.set(k,{name,type,active,units:0,score:0,deduction:0,missing:false,store:'',stores:new Set()});return g.people.get(k);};
 for(const r of all){if(!r._date||isNaN(r._date)||+r._date>cutoff)continue;const e=match(r);if(e){if(!latest.has(e.key)||r._date>=latest.get(e.key)._date)latest.set(e.key,r);const hire=productivityHireDay(find(r,'SR Hire Date','Hire Date'));if(hire!==null&&(!hires.has(e.key)||r._date>=hires.get(e.key).record))hires.set(e.key,{day:hire,record:r._date});}}
 for(const r of period){
  const rawRole=role(r),type=['SP','NHT'].includes(rawRole)?'Promoter':rawRole==='FL'?'FL':rawRole||'Unknown role',e=match(r),g=group(r);
  const name=normalize(find(r,'PS Name','Promoter Name'))||normalize(r._ps)||'Unassigned',key=e?.key||rosterCode(r._ps)||rosterName(name);
  const p=person(g,key,name,type,!!e);p.units+=r._qty;p.score+=r._points??0;if(type==='Promoter')p.store=normalize(e?.store);if(type==='FL'){const store=normalize(r._store||find(r,'Store Name','Store','Outlet','Shop'));if(store)p.stores.add(store);}
  if(type==='Promoter'){g.promoterUnits+=r._qty;g.promoterScore+=r._points??0;}
  if(type==='FL'){g.flUnits+=r._qty;g.flScore+=r._points??0;}
  if(!rawRole||(['Promoter','FL'].includes(type)&&r._points==null)){p.missing=true;g.missing=true;}
 }
 // Charge existing active promoters once; hires in the selected month and resigned PS are exempt.
 const monthStart=productivityHireDay(month+'-01'),cutoffDay=Number.isFinite(cutoff)?productivityCalendarDay(new Date(cutoff)):null;
 for(const e of roster?.entries||[]){const r=latest.get(e.key);if(r&&role(r)&&!['SP','NHT'].includes(role(r)))continue;
  const g=group({_area:r?._area||e.area,_asm:r?._asm||e.asm}),p=person(g,e.key,e.name,'Promoter',true);g.headcount++;const hire=hires.get(e.key)?.day;p.deduction=hire!=null&&hire>=monthStart&&hire<=cutoffDay?0:100;p.store=normalize(e.store);
 }
 for(const g of groups.values()){
  g.baselineScore=[...g.people.values()].reduce((sum,p)=>sum+p.deduction,0);g.promoterContribution=(g.promoterScore-g.baselineScore)*4;g.flContribution=g.flScore*10;g.incentive=g.promoterContribution+g.flContribution;
  g.people=[...g.people.values()].map(p=>({...p,promoterContribution:p.type==='Promoter'?(p.score-p.deduction)*4:0,flContribution:p.type==='FL'?p.score*10:0,incentive:p.type==='Promoter'?(p.score-p.deduction)*4:p.type==='FL'?p.score*10:0})).sort((a,b)=>a.name.localeCompare(b.name));
 }
 return {groups:[...groups.values()].sort((a,b)=>a.area.localeCompare(b.area)||a.subregion.localeCompare(b.subregion)),cutoff,unknown:period.filter(r=>!role(r)).length};
}
function asmIncentiveTotal(groups){return groups.reduce((t,g)=>{for(const k of ['headcount','baselineScore','promoterUnits','promoterScore','flUnits','flScore','promoterContribution','flContribution','incentive'])t[k]+=g[k];t.missing||=g.missing;return t;},{area:'WVIS',subregion:'',headcount:0,baselineScore:0,promoterUnits:0,promoterScore:0,flUnits:0,flScore:0,promoterContribution:0,flContribution:0,incentive:0,missing:false});}

// October rewards are a separate program; they do not change point incentives.
const ASM_OCTOBER_REWARDS={month:'2026-10',minimumUnits:30,releaseDate:'November 20, 2026',targets:[
 ['NEGROS.NORTH&BACOLOD',1325,15000],['NEGROS.PALAWAN',637,15000],['NEGROS.SOUTH',638,15000],
 ['EVIS.ORMOC&OUTBASE',550,15000],['EVIS.SAMAR',1000,15000],['EVIS.SOUTH LEYTE',200,10000],['EVIS.TACLOBAN',900,15000],
 ['PANAY.PANAY 1',650,15000],['PANAY.PANAY 2',950,15000],['PANAY.PANAY 3',650,15000],['PANAY.PANAY 4',400,10000]
]};
function asmRewardTerritory(value){return normalize(value).toUpperCase().replace(/\s*&\s*/g,'&').replace(/\s+/g,' ');}
function asmRewardPayment(units,target,baseReward,regular,hit,unknown=0,rosterReady=true,salesReady=true){
 if(!salesReady)return {multiplier:null,reward:null,status:'Awaiting October sales'};
 if(!(target>0))return {multiplier:null,reward:null,status:'Target needs HR alignment'};
 if(units<target)return {multiplier:0,reward:0,status:'Below 100% AR'};
 // Compare unrounded units; a displayed 100% or 120% must not change eligibility.
 if(units*5>=target*6)return {multiplier:1,reward:baseReward,status:'120% AR · full reward'};
 if(!rosterReady||unknown)return {multiplier:null,reward:null,status:!rosterReady?'Awaiting active roster':'Hire dates need review'};
 if(!regular)return {multiplier:null,reward:null,status:'No REG PS · review required'};
 const multiplier=hit/regular;
 return {multiplier,reward:Math.round(baseReward*multiplier*100)/100,status:'Qualified · REG PS multiplier'};
}
function asmOctoberRewardsReport(all,roster){
 const month=ASM_OCTOBER_REWARDS.month,start=productivityHireDay(month+'-01'),end=productivityHireDay(month+'-31');
 const period=all.filter(r=>{const d=productivityCalendarDay(r._date);return d!==null&&d>=start&&d<=end;}),cutoff=period.reduce((d,r)=>Math.max(d,+r._date),-Infinity);
 const groups=new Map(ASM_OCTOBER_REWARDS.targets.map(([subregion,target,baseReward])=>[subregion,{key:subregion,area:subregion.split('.')[0],subregion,target,baseReward,units:0,regular:0,hit:0,unknown:0,newHires:0,people:[]}]));
 const group=value=>{const key=asmRewardTerritory(value)||'UNASSIGNED';if(!groups.has(key))groups.set(key,{key,area:key.split('.')[0],subregion:key,target:null,baseReward:null,units:0,regular:0,hit:0,unknown:0,newHires:0,people:[]});return groups.get(key);};
 const byId=new Map((roster?.entries||[]).filter(e=>e.id).map(e=>[rosterCode(e.id),e])),byName=new Map();
 for(const e of roster?.entries||[]){const k=rosterName(e.name);byName.set(k,byName.has(k)?null:e);}
 const match=r=>{const id=rosterCode(r._ps),named=byName.get(rosterName(find(r,'PS Name','Promoter Name')));return byId.get(id)||((!id||!named?.id)&&named)||null;};
 const members=new Map((roster?.entries||[]).map(e=>[e.key,{key:e.key,id:e.id,name:e.name,store:e.store,subregion:e.asm,hire:null,hireRecord:-Infinity,latestRole:'',roleRecord:-Infinity,units:0}]));
 for(const r of all){
  if(!r._date||isNaN(r._date)||+r._date>cutoff)continue;
  const d=productivityCalendarDay(r._date),isOctober=d>=start&&d<=end,phone=/^HP/i.test(normalize(r._modelCode)),qty=Number(r._qty)||0,role=normalize(find(r,'SR Role')).toUpperCase();
  // All smartphone sell-out contributes to territory AR, including FL and resigned sellers.
  if(isOctober&&phone)group(r._asm).units+=qty;
  const e=match(r);if(!e)continue;const p=members.get(e.key),hire=productivityHireDay(find(r,'SR Hire Date','Hire Date'));
  if(hire!==null&&+r._date>=p.hireRecord){p.hire=hire;p.hireRecord=+r._date;}
  if(role&&+r._date>=p.roleRecord){p.latestRole=role;p.roleRecord=+r._date;}
  if(isOctober&&phone&&['SP','NHT'].includes(role))p.units+=qty;
 }
 for(const p of members.values()){
  if(p.latestRole&&!['SP','NHT'].includes(p.latestRole))continue;
  const g=group(p.subregion);
  p.cohort=p.hire===null?'Hire date missing':p.hire<start?'REG PS':p.hire<=end?'October hire':'Future hire';
  p.hit=p.cohort==='REG PS'&&p.units>=ASM_OCTOBER_REWARDS.minimumUnits;
  if(p.cohort==='REG PS'){g.regular++;if(p.hit)g.hit++;}else if(p.cohort==='October hire')g.newHires++;else g.unknown++;
  g.people.push(p);
 }
 for(const g of groups.values()){
  g.ar=g.target?g.units/g.target:null;g.regularShare=roster&&!g.unknown&&g.regular?g.hit/g.regular:null;
  Object.assign(g,asmRewardPayment(g.units,g.target,g.baseReward,g.regular,g.hit,g.unknown,!!roster,period.length>0));
  g.people.sort((a,b)=>a.name.localeCompare(b.name));
 }
 return {groups:[...groups.values()],cutoff,ready:period.length>0,rosterReady:!!roster};
}
(()=>{
 const nav=document.createElement('button');nav.className='nav-item';nav.dataset.section='asmIncentives';nav.textContent='ASM Incentives';document.querySelector('[data-section="productivity"]').after(nav);
 const section=document.createElement('section');section.id='asmIncentivesSection';section.className='dashboard-section';section.innerHTML=`<div class="card asm-controls productivity-controls"><label>Month<select id="asmIncentiveMonth" aria-label="ASM incentive month"></select></label><label>Subregion<select id="asmIncentiveSubregion" aria-label="ASM incentive subregion"><option value="ALL">All subregions</option></select></label><label>View<select id="asmIncentiveView" aria-label="ASM incentive view"><option value="summary">Subregion summary</option><option value="contributions">Promoter / FL contributions</option></select></label></div><div id="asmIncentiveNotice" role="status"></div><article class="card table-card"><div class="card-head"><h2 id="asmIncentiveHeading">Subregion Incentives</h2></div><div class="table-wrap"><table class="model-history-table" aria-label="ASM incentives"><thead id="asmIncentiveHead"><tr><th>Area</th><th>Subregion</th><th>Active PS</th><th>Promoter Units</th><th>Promoter Score</th><th>FL Units</th><th>FL Score</th><th>Promoter × ₱4</th><th>FL × ₱10</th><th>Running Incentive</th></tr></thead><tbody id="asmIncentiveBody"></tbody><tfoot id="asmIncentiveTotal"></tfoot></table></div></article>`;
 $('productivitySection').after(section);const style=document.createElement('style');style.textContent='body:has(#asmIncentivesSection.active) .filters{display:none!important}.asm-controls{margin-bottom:20px;padding:20px}.asm-resigned{background:#fbe3e3!important;color:#b32626;font-weight:600}#asmIncentiveNotice:not(:empty){padding:12px 0;color:#a33}#asmIncentiveBody td{font-variant-numeric:tabular-nums}';document.head.append(style);
 let rewardsMode=false,lastRewards=null;
 const programs=document.createElement('div');programs.className='asm-programs';programs.setAttribute('aria-label','ASM incentive programs');programs.innerHTML='<button type="button" class="secondary-btn" data-asm-program="standard" aria-pressed="true">ASM Incentives</button><button type="button" class="secondary-btn" data-asm-program="october" aria-pressed="false">ASM Rewards for October</button>';
 section.prepend(programs);
 const rewardPanel=document.createElement('div');rewardPanel.id='asmOctoberRewards';rewardPanel.hidden=true;rewardPanel.innerHTML=`<article class="card asm-reward-guide"><h2>ASM Rewards for October</h2><div class="score-note">October 1–31, 2026 · Scanned and activated smartphone sell-out, including frontliner and promoter sales.</div><div class="asm-reward-rules"><div><strong>Below 100% AR</strong><span>No reward</span></div><div><strong>100% to below 120% AR</strong><span>Base reward × REG PS with 30+ units ÷ total REG PS</span></div><div><strong>120% AR or higher</strong><span>100% of the base reward</span></div></div><div class="score-note">REG PS: active promoters hired before October 1, including zero sellers. October hires are excluded from the multiplier. Missing hire dates require review. HR assignments define the REG PS group; the sales subregion defines sell-out achievement.</div><div class="score-note">Running estimate, subject to final validation. Validated rewards are scheduled for November 20, 2026. Merged territories require confirmed HR alignment; no automatic merger is assumed.</div></article><p id="asmRewardNotice" class="score-note" role="status"></p><article class="card table-card"><div class="card-head"><div><h2>October Reward Progress</h2><div id="asmRewardCutoff" class="score-note"></div></div></div><div class="table-wrap"><table class="model-history-table" aria-label="ASM Rewards for October"><thead><tr><th>Subregion</th><th>October Target</th><th>Smartphone Sales</th><th>AR%</th><th>Gap to 100%</th><th>REG PS HC</th><th>REG PS ≥30 Units</th><th>REG PS ≥30 %</th><th>Base Reward</th><th>Multiplier</th><th>Running Reward</th><th>Status</th></tr></thead><tbody id="asmRewardBody"></tbody><tfoot id="asmRewardTotal"></tfoot></table></div></article>`;
 section.append(rewardPanel);
 const rewardDialog=document.createElement('dialog');rewardDialog.className='asm-reward-dialog';rewardDialog.setAttribute('aria-labelledby','asmRewardPeopleHeading');rewardDialog.innerHTML='<div class="card-head"><h2 id="asmRewardPeopleHeading">REG PS details</h2><button type="button" class="secondary-btn" data-asm-close>Close</button></div><div id="asmRewardPeopleNote" class="score-note"></div><div class="table-wrap"><table><thead><tr><th>Promoter</th><th>Store</th><th>Hire Date</th><th>Cohort</th><th>October Smartphone Units</th><th>30-Unit Target</th></tr></thead><tbody id="asmRewardPeopleBody"></tbody><tfoot><tr><td colspan="6">Only REG PS enter the multiplier denominator.</td></tr></tfoot></table></div>';section.append(rewardDialog);
 const rewardStyles=document.createElement('style');rewardStyles.textContent=`.asm-programs{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}.asm-programs [aria-pressed=true]{background:#ffce00;color:#17191c;border-color:#e4b800}.asm-reward-guide{padding:20px;margin-bottom:18px;border-top:3px solid #ffce00}.asm-reward-guide h2{margin-top:0}.asm-reward-rules{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:18px 0}.asm-reward-rules strong,.asm-reward-rules span{display:block;margin-bottom:6px}.asm-reward-link{background:transparent;color:inherit;border:0;padding:0;font:inherit;text-decoration:underline;cursor:pointer}#asmOctoberRewards th{white-space:normal}#asmOctoberRewards td{font-variant-numeric:tabular-nums}#asmRewardBody td:last-child{min-width:135px}#asmRewardBody td:first-child{min-width:160px}.asm-reward-dialog{border:1px solid var(--border,#d8dce2);border-radius:16px;max-width:min(1100px,94vw);width:94vw;max-height:85vh;padding:22px;background:var(--card,#fff);color:var(--text,#17191c)}.asm-reward-dialog::backdrop{background:#0008}.asm-reward-dialog td{padding:10px}.asm-reward-dialog .table-wrap{max-height:60vh;overflow:auto}.asm-reward-dialog .card-head{display:flex;justify-content:space-between;gap:12px}@media(max-width:700px){.asm-reward-rules{grid-template-columns:1fr;gap:8px}.asm-reward-guide{padding:15px}.asm-reward-dialog{padding:14px}}`;document.head.append(rewardStyles);
 rewardStyles.textContent+='#asmIncentivesSection [hidden]{display:none!important}.asm-reward-guide .score-note{margin:12px 0}#asmOctoberRewards td:first-child{overflow-wrap:normal;word-break:normal}';
 const money=(v,missing)=>'<td data-sort-value="'+(missing?'':v)+'" style="color:'+(v<0?'#c93636':v>0?'#238747':'inherit')+'">'+(missing?'—':'₱'+fmt(v,2))+'</td>';
 const cell=v=>'<td>'+escapeHtml(String(v))+'</td>',numeric=(v,missing=false)=>'<td data-sort-value="'+(missing?'':v)+'">'+(missing?'—':fmt(v,Number.isInteger(v)?0:2))+'</td>';
 const percent=v=>'<td data-sort-value="'+(v===null?'':v)+'">'+(v===null?'—':fmt(v*100,2)+'%')+'</td>';
 const personCount=(g,key,mode)=>'<td data-sort-value="'+(lastRewards.rosterReady?g[key]:'')+'">'+(!lastRewards.rosterReady?'—':'<button type="button" class="asm-reward-link" data-asm-people="'+escapeHtml(g.key)+'" data-asm-cohort="'+mode+'">'+fmt(g[key])+'</button>')+'</td>';
 function renderRewards(all,roster){
  const report=asmOctoberRewardsReport(all,roster);lastRewards=report;const sub=$('asmIncentiveSubregion'),prior=sub.value;
  sub.innerHTML='<option value="ALL">All subregions</option>'+report.groups.map(g=>'<option value="'+escapeHtml(g.key)+'">'+escapeHtml(g.subregion)+'</option>').join('');sub.value=report.groups.some(g=>g.key===prior)?prior:'ALL';
  const groups=report.groups.filter(g=>sub.value==='ALL'||g.key===sub.value);
  $('asmRewardBody').innerHTML=groups.map(g=>'<tr>'+cell(g.subregion)+numeric(g.target,g.target===null)+numeric(g.units,!report.ready)+percent(report.ready?g.ar:null)+numeric(Math.max(0,g.target-g.units),!report.ready||g.target===null)+personCount(g,'regular','regular')+personCount(g,'hit','hit')+percent(g.regularShare)+money(g.baseReward,g.baseReward===null)+percent(g.multiplier)+money(g.reward,g.reward===null)+cell(g.status)+'</tr>').join('')||emptyRow(12);
  const sum=k=>groups.reduce((s,g)=>s+(g[k]||0),0),target=sum('target'),units=sum('units'),regular=sum('regular'),hit=sum('hit'),unknown=sum('unknown');
  $('asmRewardTotal').innerHTML='<tr>'+cell(sub.value==='ALL'?'WVIS':'Selected subregion')+numeric(target)+numeric(units,!report.ready)+percent(report.ready&&target?units/target:null)+numeric(groups.reduce((s,g)=>s+Math.max(0,(g.target||0)-g.units),0),!report.ready)+numeric(regular,!roster)+numeric(hit,!roster)+percent(roster&&!unknown&&regular?hit/regular:null)+money(sum('baseReward'),false)+cell('—')+money(sum('reward'),groups.some(g=>g.reward===null))+cell('Sum of subregion rewards')+'</tr>';
  const messages=[];if(!report.ready)messages.push('Awaiting October sales. Targets and base rewards are ready.');if(!roster)messages.push('Waiting for the active HR roster.');if(unknown)messages.push(fmt(unknown)+' active promoters have missing or future hire dates. Their REG PS percentage needs review.');if(groups.some(g=>g.target===null))messages.push('Unmatched subregion: confirm its target and HR alignment before validating rewards.');
  messages.push('Click REG PS HC or REG PS ≥30 Units to inspect promoters. October hires: '+fmt(sum('newHires'))+' excluded.');$('asmRewardNotice').textContent=messages.join(' ');
  const through=report.ready?'Through '+new Date(report.cutoff).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):'No October sales loaded';$('asmRewardCutoff').textContent=through+' · Full-month targets · Rewards calculated separately per subregion';
  if(section.classList.contains('active'))$('periodLabel').textContent='October 2026 · '+through;
 }
 section.addEventListener('click',e=>{
  const program=e.target.closest('[data-asm-program]');if(program){rewardsMode=program.dataset.asmProgram==='october';if(rewardsMode)$('asmIncentiveMonth').value=ASM_OCTOBER_REWARDS.month;renderAsm();return;}
  if(e.target.closest('[data-asm-close]')){rewardDialog.close();return;}
  const link=e.target.closest('[data-asm-people]');if(!link)return;const g=lastRewards?.groups.find(g=>g.key===link.dataset.asmPeople);if(!g)return;
  const hitOnly=link.dataset.asmCohort==='hit',people=g.people.filter(p=>hitOnly?p.hit:true);
  $('asmRewardPeopleHeading').textContent=g.subregion+(hitOnly?' · REG PS with 30+ units':' · Promoter eligibility');
  $('asmRewardPeopleNote').textContent=g.regular+' REG PS; '+g.hit+' with 30+ units. '+g.newHires+' October hires and '+g.unknown+' unclassified hire dates. Sales shown are October smartphones only.';
  $('asmRewardPeopleBody').innerHTML=people.map(p=>'<tr>'+cell(p.name)+cell(p.store||'—')+cell(p.hire===null?'Missing':new Date(p.hire*86400000).toISOString().slice(0,10))+cell(p.cohort)+numeric(p.units)+cell(p.cohort!=='REG PS'?'Excluded':p.hit?'Reached':Math.max(0,30-p.units)+' units remaining')+'</tr>').join('')||emptyRow(6);rewardDialog.showModal();
 });
 function renderAsm(){
  const all=salesEnriched(),months=uniq([...all.map(r=>modelMonthKey(r._date)).filter(Boolean),ASM_OCTOBER_REWARDS.month]).sort().reverse(),select=$('asmIncentiveMonth'),old=select.value;
  if([...select.options].map(o=>o.value).join()!==months.join())select.innerHTML=months.map(m=>'<option value="'+m+'">'+escapeHtml(monthName(m))+'</option>').join('');select.value=months.includes(old)?old:months[0]||'';
  rewardPanel.hidden=!rewardsMode;section.querySelector(':scope > article.table-card').hidden=rewardsMode;$('asmIncentiveNotice').hidden=rewardsMode;$('asmIncentiveView').closest('label').hidden=rewardsMode;select.disabled=rewardsMode;programs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.asmProgram==='october')===rewardsMode)));
  if(rewardsMode){select.value=ASM_OCTOBER_REWARDS.month;renderRewards(all,window.evisRoster?.getRoster());return;}
  const roster=window.evisRoster?.getRoster(),report=asmIncentiveReport(all,roster,select.value),sub=$('asmIncentiveSubregion'),prior=sub.value;
  sub.innerHTML='<option value="ALL">All subregions</option>'+report.groups.map(g=>'<option value="'+escapeHtml(g.key)+'">'+escapeHtml(g.area+' / '+g.subregion)+'</option>').join('');sub.value=report.groups.some(g=>g.key===prior)?prior:'ALL';
  const groups=report.groups.filter(g=>sub.value==='ALL'||g.key===sub.value),total=asmIncentiveTotal(groups),detail=$('asmIncentiveView').value==='contributions';
  const cols=detail?['Name','Role','Current Store Assignment','Subregion','Sales Units','Score','Baseline Score','Promoter × ₱4','FL × ₱10','Contribution']:['Area','Subregion','Active PS','Promoter Units','Promoter Score','FL Units','FL Score','Promoter × ₱4','FL × ₱10','Running Incentive'];
  if($('asmIncentiveHead').dataset.view!==String(detail)){$('asmIncentiveHead').innerHTML='<tr>'+cols.map(s=>'<th>'+s+'</th>').join('')+'</tr>';$('asmIncentiveHead').dataset.view=String(detail);}
  $('asmIncentiveHeading').textContent=detail?'Promoter / FL Contributions':'Subregion Incentives';
  const summary=g=>'<tr>'+cell(g.area)+cell(g.subregion)+numeric(g.headcount,!roster)+numeric(g.promoterUnits)+numeric(g.promoterScore,g.missing)+numeric(g.flUnits)+numeric(g.flScore,g.missing)+money(g.promoterContribution,g.missing)+money(g.flContribution,g.missing)+money(g.incentive,g.missing)+'</tr>';
  $('asmIncentiveBody').innerHTML=detail?groups.flatMap(g=>g.people.map(p=>'<tr>'+cell(p.name)+'<td class="'+(roster&&p.type==='Promoter'&&!p.active?'asm-resigned':'')+'">'+escapeHtml(p.type==='Promoter'?(roster?(p.active?'Promoter':'Promoter (Resigned)'):'Promoter (status pending)'):p.type==='FL'?'FL':p.type+' (excluded)')+'</td>'+cell(p.type==='FL'?[...p.stores].sort().join(' / ')||'—':p.store||'—')+cell(g.subregion)+numeric(p.units)+numeric(p.score,p.missing)+numeric(p.deduction,!roster)+money(p.promoterContribution,p.missing||!roster)+money(p.flContribution,p.missing||!roster)+money(p.incentive,p.missing||!roster)+'</tr>')).join('')||emptyRow(10):groups.map(summary).join('')||emptyRow(10);
  const people=groups.flatMap(g=>g.people);$('asmIncentiveTotal').innerHTML=detail?'<tr>'+cell('WVIS')+cell('')+cell('')+cell('')+numeric(people.reduce((s,p)=>s+p.units,0))+numeric(people.reduce((s,p)=>s+p.score,0),total.missing)+numeric(total.baselineScore,!roster)+money(total.promoterContribution,total.missing)+money(total.flContribution,total.missing)+money(total.incentive,total.missing)+'</tr>':summary(total);
  $('asmIncentiveNotice').textContent=!roster?'Waiting for the ACTIVE promoter list. Incentives will appear once it loads.':groups.some(g=>g.missing)?'Incentive unavailable for rows with missing SR Role or model scores. Restore Column L or update the scoring file in Data Sources.':'';
  if(section.classList.contains('active'))$('periodLabel').textContent=monthName(select.value)+(Number.isFinite(report.cutoff)?' · through '+new Date(report.cutoff).toLocaleDateString():'');
 }
 ['asmIncentiveMonth','asmIncentiveSubregion','asmIncentiveView'].forEach(id=>$(id).addEventListener('change',renderAsm));
 document.addEventListener('click',e=>{if(e.target.closest('.nav-item')&&section.classList.contains('active'))renderAsm();});
 const before=render;render=()=>{before();renderAsm();};window.evisAsmIncentives={render:renderAsm};
})();
