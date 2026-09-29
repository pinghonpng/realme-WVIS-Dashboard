// Approved September policy. Other months require their own approved scheme.
const PROMOTER_INCENTIVE_POLICIES={
 '2026-09':{base:{EVIS:140,NEGROS:170,PANAY:170},thresholds:{Multibrand:[275,400,550],'Concept / Kiosk':[425,550,750]},multipliers:{EVIS:[22,26,32,36],NEGROS:[20,24,30,34],PANAY:[20,24,30,34]}}
};
function promoterIncentiveFormat(value){
 const s=normalize(value).toLowerCase().replace(/[\s_-]+/g,' ');
 if(/^(?:multi ?brand|exclusive)(?: store)?$/.test(s))return 'Multibrand';
 if(/^(concept|kiosk)(?: store)?$/.test(s)||s==='concept / kiosk')return 'Concept / Kiosk';
 return '';
}
function promoterIncentiveBonusModel(code){
 const s=normalize(code).toUpperCase();if(!/^HP[.\s]/.test(s))return '';
 const model=s.replace(/^HP[.\s]+/,'').split('(')[0].replace(/\b[45]G\b/g,'').replace(/\s/g,'');
 if(model==='C100'&&!/5G/.test(s))return 'c100';
 return ['12PRO+','13PRO','13PRO+','14PRO','14PRO+','15PRO'].includes(model)?'eol':'';
}
function promoterIncentiveAmounts(points,area,format,c100Units,eolUnits,month){
 const policy=PROMOTER_INCENTIVE_POLICIES[month],base=policy?.base[area]??null,thresholds=policy?.thresholds[format];
 const stars=Number.isFinite(points)&&thresholds?thresholds.filter(t=>points>=t).length:null;
 const multiplier=stars!==null?policy?.multipliers[area]?.[stars]??null:null;
 const regular=base!==null&&multiplier!==null?Math.round(Math.max(0,points-base)*multiplier*100)/100:null;
 const c100=policy?(c100Units>=10?1800:c100Units>=5?800:0):null;
 const eol=policy?(eolUnits>=4?1400:eolUnits>=2?600:0):null;
 return {base,stars,multiplier,regular,c100,eol,extra:policy?c100+eol:null,total:regular===null?null:regular+c100+eol};
}
function promoterIncentiveReport(all,roster,month){
 const period=all.filter(r=>modelMonthKey(r._date)===month),cutoff=period.reduce((d,r)=>Math.max(d,+r._date),-Infinity);
 const history=all.filter(r=>r._date&&!isNaN(r._date)&&+r._date<=cutoff),entries=roster?.entries||[];
 const ids=new Map(entries.filter(e=>e.id).map(e=>[rosterCode(e.id),e])),names=new Map(entries.map(e=>[rosterName(e.name),e]));
 const nameIds=new Map();for(const r of history){const name=rosterName(find(r,'PS Name','Promoter Name')),id=rosterCode(r._ps);if(name&&id){if(!nameIds.has(name))nameIds.set(name,new Set());nameIds.get(name).add(id);}}
 const identity=r=>{const name=normalize(find(r,'PS Name','Promoter Name')),id=rosterCode(r._ps),named=names.get(rosterName(name));
  const e=ids.get(id)||((!id||!named?.id)&&named),candidates=nameIds.get(rosterName(name));
  return {entry:e,key:e?.key||id||(!id&&candidates?.size===1?[...candidates][0]:name?'name:'+rosterName(name):''),name:e?.name||name||id};};
 const latest=new Map(),stores=new Map(),hires=new Map();
 for(const r of history){const id=identity(r);if(id.key&&(!latest.has(id.key)||r._date>=latest.get(id.key)._date))latest.set(id.key,r);
  const hire=productivityHireDay(find(r,'SR Hire Date','Hire Date'));if(id.key&&hire!==null&&(!hires.has(id.key)||r._date>=hires.get(id.key).date))hires.set(id.key,{day:hire,date:r._date});
  for(const key of [r._sid?'id:'+r._sid:'',r._store?'name:'+rosterName(r._store):''].filter(Boolean)){
   if(normalize(find(r,'Store Type'))&&(!stores.has(key)||r._date>=stores.get(key)._date))stores.set(key,r);
  }
 }
 const people=new Map();let excluded=0,unassigned=0;
 const person=id=>{if(!people.has(id.key))people.set(id.key,{key:id.key,name:id.name,entry:id.entry,active:roster?!!id.entry:null,smartphone:0,realme:0,techlife:0,unclassified:0,c100Units:0,eolUnits:0,units:0,models:new Map(),issues:new Set()});return people.get(id.key);};
 for(const r of period){
  const role=normalize(find(r,'SR Role')).toUpperCase();if(!['SP','NHT'].includes(role)){excluded++;continue;}
  const id=identity(r);if(!id.key){unassigned++;continue;}const p=person(id),code=normalize(r._modelCode),points=Number.isFinite(r._points)?r._points:null;
  const type=/^HP/i.test(code)?'smartphone':/^ACSR/i.test(code)&&r._series&&r._series!=='Unmapped series'?(/^realme/i.test(r._series)?'realme':'techlife'):'unclassified';
  p.units+=r._qty;p[type]+=points??0;if(points===null)p.issues.add('Missing model scores');if(type==='unclassified')p.issues.add('Unmapped product / series');
  const bonus=promoterIncentiveBonusModel(code);if(bonus)p[bonus+'Units']+=r._qty;
  const key=JSON.stringify([r._model,r._series,r._scoreRate]);if(!p.models.has(key))p.models.set(key,{name:r._model||code,series:r._series||'Unmapped series',type,units:0,points:0,rate:r._scoreRate,missing:false,bonus});
  const m=p.models.get(key);m.units+=r._qty;m.points+=points??0;m.missing||=points===null;
 }
 const cutoffDay=Number.isFinite(cutoff)?productivityCalendarDay(new Date(cutoff)):null;
 for(const e of entries){const last=latest.get(e.key),role=normalize(find(last||{},'SR Role')).toUpperCase();
  if(role&&!['SP','NHT'].includes(role))continue;if(cutoffDay===null||hires.get(e.key)?.day>cutoffDay)continue;
  person({key:e.key,name:e.name,entry:e});
 }
 for(const p of people.values()){
  const last=latest.get(p.key)||{},e=p.entry;p.store=e?.store||last._store||'Unassigned';p.area=normalize(e?.area||last._area).toUpperCase();p.subregion=e?.asm||last._asm||'Unassigned';p.dealer=e?.customer||last._customer||'Unassigned';
  const assigned=stores.get('id:'+(e?.sid||(!e?.store?last._sid:'')))||stores.get('name:'+rosterName(p.store));
  p.storeType=normalize(e?e.storeType:find(assigned||{},'Store Type'));p.format=promoterIncentiveFormat(p.storeType);
  if(!p.format)p.issues.add('Store type needs review');if(!['EVIS','NEGROS','PANAY'].includes(p.area))p.issues.add('Area needs review');
  p.points=p.smartphone+p.realme+p.techlife+p.unclassified;
  const incomplete=p.issues.has('Missing model scores')||p.issues.has('Unmapped product / series');
  Object.assign(p,promoterIncentiveAmounts(incomplete?NaN:p.points,p.area,p.format,p.c100Units,p.eolUnits,month));
  if(!PROMOTER_INCENTIVE_POLICIES[month])p.issues.add('Monthly scheme not set');
  p.models=[...p.models.values()].sort((a,b)=>a.name.localeCompare(b.name));
 }
 return {people:[...people.values()].sort((a,b)=>(b.total??-Infinity)-(a.total??-Infinity)||a.name.localeCompare(b.name)),cutoff,excluded,unassigned,policy:PROMOTER_INCENTIVE_POLICIES[month]};
}
function promoterIncentiveTotals(people){
 const total={count:people.length,pending:people.filter(p=>p.total===null).length};
 for(const key of ['smartphone','realme','techlife','points','regular','c100','eol','extra','total'])total[key]=people.some(p=>p[key]===null)?null:people.reduce((s,p)=>s+p[key],0);
 return total;
}
(()=>{
 const nav=document.createElement('button');nav.className='nav-item';nav.dataset.section='promoterIncentives';nav.textContent='Promoter Incentives';document.querySelector('[data-section="asmIncentives"]').before(nav);
 const section=document.createElement('section');section.id='promoterIncentivesSection';section.className='dashboard-section';
 const label=(title,id,options='')=>'<label>'+title+'<select id="'+id+'" aria-label="Promoter incentives '+title.toLowerCase()+'">'+options+'</select></label>';
 section.innerHTML='<article class="card table-card"><div class="pi-controls">'+label('Month','piMonth')+label('Area','piArea')+label('Subregion','piSubregion')+label('Dealer','piDealer')+label('Status','piStatus','<option value="all">All promoters</option><option value="active">Active</option><option value="inactive">Not on active list</option>')+'<label>Search promoter<input id="piSearch" type="search" placeholder="Name or ID" aria-label="Search incentive promoters"></label></div><p id="piPeriod" role="status"></p><p id="piNotice" role="status"></p><details class="pi-rules"><summary>September incentive rules</summary><div>All Smartphone + realme AIOT + TechLife AIOT scores are combined. The uploaded model scoring file supplies points per unit. Full-month base: EVIS 140; NEGROS/PANAY 170. Regular incentive = max(0, total points − base) × multiplier. Extras are paid independently.</div><div>Stars: Multibrand and Exclusive 0 / 275 / 400 / 550; Concept/Kiosk 0 / 425 / 550 / 750. Multipliers (0–3 stars): EVIS 22 / 26 / 32 / 36; NEGROS/PANAY 20 / 24 / 30 / 34.</div><div>C100 4G: 5–9 units ₱800; 10+ ₱1,800. Combined EOL (12 Pro+, 13 Pro, 13 Pro+, 14 Pro, 14 Pro+, 15 Pro): 2–3 units ₱600; 4+ ₱1,400. Highest tier per category; both bonuses can be added.</div><div>SP and NHT sales only; FL and other roles are excluded. Current HR assignments are used where available, otherwise latest sales assignment through the cutoff. Store classification comes from Column H (STORE TYPE) in the HR sheet for current active promoters; promoters absent from that list use the sales-file store classification. Current HR status is shown; absence from the active list is not proof of resignation. September rules are not applied to other months.</div></details></article><aside id="piSchemeBanner" class="card pi-scheme" aria-label="Monthly incentive guide"></aside><div id="piKpis" class="pi-kpis"></div><article class="card table-card"><div class="card-head"><h2>Promoter Incentives</h2></div><div class="table-wrap"><table class="pi-table" aria-label="Promoter incentives"><thead><tr class="pi-column-groups"><th colspan="4" scope="colgroup">Promoter Details</th><th colspan="4" scope="colgroup" class="pi-score-heading">Scores</th><th colspan="3" scope="colgroup">Regular Incentive</th><th colspan="2" scope="colgroup" class="pi-extra-heading">Extra Incentives</th><th scope="col">Total Incentive</th></tr><tr>'+['Promoter','Store / Dealer','Area / Subregion','Store Type','Smartphone Points','realme AIOT Points','TechLife AIOT Points','Total Points','Base Score','Stars / Multiplier','Regular Incentive','C100 Extra','EOL Extra','Running Total'].map((s,i)=>'<th scope="col" data-sort-column="'+i+'"'+(i>=4&&i<=7?' class="pi-score-heading"':i===11||i===12?' class="pi-extra-heading"':'')+'>'+s+'</th>').join('')+'</tr></thead><tbody id="piBody"></tbody><tfoot id="piTotal"></tfoot></table></div></article>';
 $('asmIncentivesSection').before(section);
 const style=document.createElement('style');style.textContent='body:has(#promoterIncentivesSection.active) .filters{display:none!important}.pi-controls{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.pi-controls label{display:flex;flex-direction:column;gap:8px;font-size:12px;font-weight:600}.pi-controls :is(input,select){width:100%;min-width:0;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);font:inherit}.pi-rules{font-size:12px;color:var(--muted);line-height:1.6}.pi-rules summary{cursor:pointer;font-weight:600}.pi-rules div{margin-top:8px}#piPeriod,#piNotice{font-size:12px;line-height:1.6;color:var(--muted);margin:12px 0}.pi-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}.pi-kpis>div{padding:16px}.pi-kpis span{display:block;color:var(--muted);font-size:11px;margin-bottom:8px}.pi-kpis strong{font-size:20px}.pi-table{min-width:1200px;font-size:11px}.pi-table :is(th,td){padding:10px 8px;border:1px solid var(--line)}.pi-table td:nth-child(n+5){white-space:nowrap}.pi-table td:nth-child(1){min-width:135px}.pi-table td:nth-child(2){min-width:165px;max-width:210px}.pi-table td:nth-child(3){max-width:135px}.pi-table small{display:block;font-size:10px;color:var(--muted);margin-top:4px;white-space:normal!important}.pi-name{font:inherit;font-weight:700;text-align:left;color:inherit;border:0;padding:0;background:transparent;text-decoration:underline;cursor:pointer}.pi-name:focus-visible{outline:2px solid #2874d0}.pi-table td:last-child{font-weight:700}.pi-pending{color:var(--muted)}.pi-scheme{padding:14px 16px;margin-bottom:16px;border-top:3px solid #f3c421}.pi-scheme-title{font-size:12px;font-weight:700;margin-bottom:10px}.pi-scheme-grid{display:grid;grid-template-columns:1.05fr 1fr 1.35fr;gap:18px}.pi-scheme-grid>div+div{border-left:1px solid var(--line);padding-left:18px}.pi-scheme h3{font-size:11px;margin:0 0 7px;color:var(--text)}.pi-scheme table{width:100%;font-size:10px;line-height:1.35}.pi-scheme :is(th,td){padding:5px 4px;border:0;text-align:center;white-space:nowrap}.pi-scheme th:first-child{text-align:left;width:43%;white-space:normal}.pi-scheme-note{font-size:10px;line-height:1.5;color:var(--muted);margin-top:6px}.pi-bonus-line{display:flex;gap:8px;font-size:11px;line-height:1.7;flex-wrap:wrap}.pi-bonus-line strong{min-width:86px}.pi-column-groups th{text-align:center;font-size:11px;letter-spacing:.05em;border-bottom:2px solid #a8b3c2!important}.pi-table th.pi-score-heading{background:#e9f2ff;color:#294969}.pi-table th.pi-extra-heading{background:#fff2cc;color:#624d11}html[data-theme=night] .pi-table th.pi-score-heading{background:#253f59!important;color:#c9e6ff!important}html[data-theme=night] .pi-table th.pi-extra-heading{background:#514520!important;color:#ffecac!important}@media(max-width:1000px){.pi-scheme-grid{grid-template-columns:1fr 1fr}.pi-scheme-grid>div:last-child{grid-column:1/-1;border-left:0;border-top:1px solid var(--line);padding:10px 0 0}}@media(max-width:600px){.pi-scheme-grid{grid-template-columns:1fr;gap:12px}.pi-scheme-grid>div+div{border-left:0;border-top:1px solid var(--line);padding:10px 0 0}.pi-scheme :is(table,.pi-scheme-note){font-size:11px}}.pi-dialog{width:min(1100px,96vw);max-width:none;max-height:85vh;overflow:auto;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:14px;padding:20px}.pi-dialog::backdrop{background:#0009}.pi-dialog-head{display:flex;align-items:start;justify-content:space-between;gap:16px}.pi-dialog p{font-size:12px;line-height:1.6}.pi-dialog table{table-layout:fixed}.pi-dialog :is(th,td){padding:10px;border:1px solid var(--line);overflow-wrap:anywhere}.pi-dialog td:nth-child(n+3){white-space:nowrap}.pi-dialog th:first-child{width:35%}.pi-dialog th:nth-child(2){width:25%}.pi-dialog .table-wrap{overflow-x:auto}.pi-dialog .pi-formula{padding:12px;background:var(--bg);border-radius:8px;font-weight:600}@media(max-width:1100px){.pi-controls{grid-template-columns:repeat(3,minmax(0,1fr))}.pi-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.pi-controls,.pi-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.pi-kpis strong{font-size:16px}.pi-dialog{padding:12px}.pi-dialog table{font-size:10px}.pi-dialog :is(th,td){padding:5px}}';document.head.append(style);
 const popup=document.createElement('dialog');popup.className='pi-dialog';popup.setAttribute('aria-labelledby','piDialogTitle');document.body.append(popup);
 const money=value=>value===null?'—':'₱'+fmt(value,2),num=value=>value===null?'—':fmt(value,2),html=escapeHtml;
 const cell=(value,sort)=>'<td'+(sort!==undefined?' data-sort-value="'+html(String(sort??''))+'"':'')+'>'+value+'</td>';
 let report={people:[]},visible=[];
 function options(id,values){const input=$(id),old=input.value,list=[...new Set(values.filter(Boolean))].sort();input.innerHTML='<option value="ALL">All '+({piArea:'areas',piSubregion:'subregions',piDealer:'dealers'}[id])+'</option>'+list.map(v=>'<option value="'+html(v)+'">'+html(v)+'</option>').join('');input.value=list.includes(old)?old:'ALL';}
 function renderSchemeBanner(month){
  const policy=PROMOTER_INCENTIVE_POLICIES[month],banner=$('piSchemeBanner');
  if(!policy){banner.innerHTML='<strong>'+html(monthName(month))+' incentive guide</strong><div class="pi-scheme-note">No approved star ratings, multipliers or bonus targets for this month.</div>';return;}
  const stars='<thead><tr><th scope="col">Store type</th>'+['0★','1★','2★','3★'].map(v=>'<th scope="col">'+v+'</th>').join('')+'</tr></thead>';
  const thresholds=(label,values)=>'<tr><th scope="row">'+label+'</th><td>&lt;'+values[0]+'</td>'+values.map(v=>'<td>≥'+v+'</td>').join('')+'</tr>';
  const multipliers=(label,values)=>'<tr><th scope="row">'+label+'</th>'+values.map(v=>'<td>×'+v+'</td>').join('')+'</tr>';
  banner.innerHTML='<div class="pi-scheme-title">'+html(monthName(month))+' incentive guide</div><div class="pi-scheme-grid"><div><h3>Star rating · total monthly points</h3><table data-no-sort aria-label="Star rating thresholds">'+stars+'<tbody>'+thresholds('Multibrand / Exclusive',policy.thresholds.Multibrand)+thresholds('Concept / Kiosk',policy.thresholds['Concept / Kiosk'])+'</tbody></table></div><div><h3>Incentive multiplier</h3><table data-no-sort aria-label="Incentive multipliers"><thead><tr><th scope="col">Area</th>'+['0★','1★','2★','3★'].map(v=>'<th scope="col">'+v+'</th>').join('')+'</tr></thead><tbody>'+multipliers('EVIS',policy.multipliers.EVIS)+multipliers('NEGROS / PANAY',policy.multipliers.NEGROS)+'</tbody></table><div class="pi-scheme-note">Base score: EVIS '+policy.base.EVIS+' · NEGROS / PANAY '+policy.base.NEGROS+'</div></div><div><h3>Extra incentive targets</h3><div class="pi-bonus-line"><strong>C100 4G</strong><span>5–9 units → ₱800 · 10+ → ₱1,800</span></div><div class="pi-bonus-line"><strong>EOL combined</strong><span>2–3 units → ₱600 · 4+ → ₱1,400</span></div><div class="pi-scheme-note">EOL: 12 Pro+, 13 Pro, 13 Pro+, 14 Pro, 14 Pro+, 15 Pro.<br>Highest tier per category. Both bonuses add up, even below base.</div></div></div>';
 }
 function draw(){
  const area=$('piArea').value,sub=$('piSubregion').value,dealer=$('piDealer').value,status=$('piStatus').value,search=$('piSearch').value.trim().toLowerCase();
  visible=report.people.filter(p=>(area==='ALL'||p.area===area)&&(sub==='ALL'||p.subregion===sub)&&(dealer==='ALL'||p.dealer===dealer)&&(status==='all'||(status==='active'?p.active===true:p.active===false))&&(!search||(p.name+' '+p.key).toLowerCase().includes(search)));
  $('piBody').innerHTML=visible.map((p,i)=>'<tr>'+cell('<button class="pi-name" type="button" data-pi-person="'+i+'" aria-haspopup="dialog">'+html(p.name)+'</button><small>'+html(p.active===null?'HR status unavailable':p.active?'Active':'Not on active list')+'</small>'+([...p.issues].length?'<small>'+html([...p.issues].join(' · '))+'</small>':''),p.name)+cell(html(p.store)+'<small>'+html(p.dealer)+'</small>')+cell(html(p.area||'Unassigned')+'<small>'+html(p.subregion)+'</small>')+cell(html(p.storeType||'Needs review'))+['smartphone','realme','techlife','points','base'].map(k=>cell(num(p[k])+(k==='points'&&(p.issues.has('Missing model scores')||p.issues.has('Unmapped product / series'))?' *':''),p[k])).join('')+cell(p.stars===null?'—':p.stars+'-star<small>×'+(p.multiplier??'—')+'</small>',p.stars)+cell(money(p.regular),p.regular)+cell(money(p.c100)+'<small>'+fmt(p.c100Units)+' units</small>',p.c100)+cell(money(p.eol)+'<small>'+fmt(p.eolUnits)+' units</small>',p.eol)+cell(money(p.total),p.total)+'</tr>').join('')||emptyRow(14);
  const t=promoterIncentiveTotals(visible);$('piTotal').innerHTML='<tr>'+cell('TOTAL · '+t.count+' PS')+cell('')+cell('')+cell('')+['smartphone','realme','techlife','points'].map(k=>cell(num(t[k]))).join('')+cell('—')+cell('—')+['regular','c100','eol','total'].map(k=>cell(money(t[k]))).join('')+'</tr>';
  $('piKpis').innerHTML=[['Promoters',fmt(t.count)],['Combined Points',num(t.points)],['Regular Incentive',money(t.regular)],['Extra Incentives',money(t.extra)],['Running Incentive',money(t.total)]].map(([a,b])=>'<div class="card"><span>'+a+'</span><strong>'+b+'</strong></div>').join('');
  const notices=[];if(!report.policy)notices.push('No approved incentive scheme for this month. Amounts remain unavailable.');if(t.pending)notices.push(t.pending+' promoter(s) need review; a complete incentive total is unavailable.');if(report.unassigned)notices.push(report.unassigned+' promoter sales row(s) have no promoter identity.');if(report.excluded)notices.push(report.excluded+' sales row(s) with roles other than SP/NHT, or missing roles, are excluded.');$('piNotice').textContent=notices.join(' ');
 }
 function renderPromoterIncentives(){
  const all=salesEnriched(),months=uniq(all.map(r=>modelMonthKey(r._date)).filter(Boolean)).sort().reverse(),input=$('piMonth'),old=input.value;
  if([...input.options].map(o=>o.value).join()!==months.join())input.innerHTML=months.map(m=>'<option value="'+m+'">'+html(monthName(m))+'</option>').join('');input.value=months.includes(old)?old:months[0]||'';
  report=promoterIncentiveReport(all,window.evisRoster?.getRoster(),input.value);renderSchemeBanner(input.value);
  options('piArea',report.people.map(p=>p.area));options('piSubregion',report.people.map(p=>p.subregion));options('piDealer',report.people.map(p=>p.dealer));
  const date=Number.isFinite(report.cutoff)?new Date(report.cutoff).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'no sales date';
  $('piPeriod').textContent=monthName(input.value)+' · through '+date+' · All three product categories combined. Click a promoter for the calculation and model breakdown.';
  if(section.classList.contains('active'))$('periodLabel').textContent=monthName(input.value)+' · running incentives through '+date;
  if(popup.open)popup.close();draw();
 }
 $('piMonth').addEventListener('change',renderPromoterIncentives);['piArea','piSubregion','piDealer','piStatus'].forEach(id=>$(id).addEventListener('change',draw));$('piSearch').addEventListener('input',draw);
 document.addEventListener('click',event=>{
  if(event.target.closest('.nav-item')&&section.classList.contains('active'))renderPromoterIncentives();
  const button=event.target.closest('[data-pi-person]');if(!button)return;const p=visible[Number(button.dataset.piPerson)];if(!p)return;
  popup.innerHTML='<div class="pi-dialog-head"><h2 id="piDialogTitle">'+html(p.name)+'</h2><button type="button" class="secondary-btn" data-pi-close autofocus>Close</button></div><p>'+html(monthName($('piMonth').value)+' · '+p.store+' · '+p.area+' · '+(p.storeType||'Store type needs review'))+'</p><p class="pi-formula">Regular: '+(p.regular===null?'Unavailable':('max(0, '+num(p.points)+' − '+num(p.base)+') × '+p.multiplier+' = '+money(p.regular)))+'<br>C100 extra: '+money(p.c100)+' ('+fmt(p.c100Units)+' units) · EOL extra: '+money(p.eol)+' ('+fmt(p.eolUnits)+' units)<br>Running total: '+money(p.total)+'</p>'+([...p.issues].length?'<p>'+html([...p.issues].join(' · '))+'</p>':'')+'<div class="table-wrap"><table data-no-sort><thead><tr><th>Model</th><th>Series</th><th>Units</th><th>Points / Unit</th><th>Points</th></tr></thead><tbody>'+p.models.map(m=>'<tr>'+cell(html(m.name)+(m.bonus?'<small> · '+(m.bonus==='c100'?'C100 4G bonus':'EOL bonus')+'</small>':''))+cell(html(m.series))+cell(fmt(m.units))+cell(num(m.rate??null))+cell(num(m.missing?null:m.points))+'</tr>').join('')+'</tbody></table></div>'+(p.models.length?'':'<p>No promoter sales for this month.</p>');
  popup.querySelector('[data-pi-close]').onclick=()=>popup.close();popup.showModal();
 });
 const before=render;render=()=>{before();renderPromoterIncentives();};window.evisPromoterIncentives={render:renderPromoterIncentives};
})();
