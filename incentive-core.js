// Shared calculation engine for live reports and locked monthly archives.
(function(){
const normalize=s=>String(s??'').trim();
function find(obj,...names){ const keys=Object.keys(obj||{}), label=k=>String(k).replace(/^.*[^\x00-\x7F]/,'').trim().replace(/\s+/g,' ').toLowerCase(), aliases={'qty':['sell out'],'ps id':['sr code'],'ps name':['sr name'],'customer':['short name'],'asm':['sub region'],'area':['region']}; for(const name of names){const key=keys.find(k=>k.toLowerCase()===name.toLowerCase());if(key!==undefined && normalize(obj[key])!=='')return obj[key];} for(const name of names){for(const wanted of [name.toLowerCase(),...(aliases[name.toLowerCase()]||[])]){const key=keys.find(k=>label(k)===wanted);if(key!==undefined && normalize(obj[key])!=='')return obj[key];}} return ''; }
// Current employment status comes from the linked HR sheet, not sales activity.
function rosterName(value){return normalize(value).replace(/^\d{5,}\s+/,'').normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase();}
function rosterCode(value){return normalize(value).replace(/\.0$/,'');}
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

function modelMonthKey(date){return !date||isNaN(date)?'':date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');}
// Approved September policy. Other months require their own approved scheme.
const PROMOTER_INCENTIVE_POLICIES={
 '2026-09':{bonusModels:{c100:['C100'],eol:['12PRO+','13PRO','13PRO+','14PRO','14PRO+','15PRO']},bonusTiers:{c100:[[5,800],[10,1800]],eol:[[2,600],[4,1400]]},techlifeMinimum:60,base:{EVIS:140,NEGROS:170,PANAY:170},thresholds:{Multibrand:[275,400,550],'Concept / Kiosk':[425,550,750]},multipliers:{EVIS:[22,26,32,36],NEGROS:[20,24,30,34],PANAY:[20,24,30,34]}}
};
function promoterIncentiveFormat(value){
 const s=normalize(value).toLowerCase().replace(/[\s_-]+/g,' ');
 if(/^(?:multi ?brand|exclusive)(?: store)?$/.test(s))return 'Multibrand';
 if(/^(concept|kiosk)(?: store)?$/.test(s)||s==='concept / kiosk')return 'Concept / Kiosk';
 return '';
}
function promoterIncentiveBonusModel(code,month='2026-09'){
 const s=normalize(code).toUpperCase();if(!/^HP[.\s]/.test(s))return '';
 const model=s.replace(/^HP[.\s]+/,'').split('(')[0].replace(/\b[45]G\b/g,'').replace(/\s/g,'');
 const models=PROMOTER_INCENTIVE_POLICIES[month]?.bonusModels;if(!models)return '';
 if(models.c100.includes(model)&&!/5G/.test(s))return 'c100';
 return models.eol.includes(model)?'eol':'';
}
function promoterIncentiveAmounts(points,area,format,c100Units,eolUnits,month,techlifePoints=0){
 const policy=PROMOTER_INCENTIVE_POLICIES[month],base=policy?.base[area]??null,thresholds=policy?.thresholds[format];
 const stars=Number.isFinite(points)&&thresholds?thresholds.filter(t=>points>=t).length:null;
 const multiplier=stars!==null?policy?.multipliers[area]?.[stars]??null:null;
 const techlifeEligible=policy&&Number.isFinite(techlifePoints)?techlifePoints>=policy.techlifeMinimum:null;
 const excludedTechlife=techlifeEligible===false?techlifePoints:techlifeEligible===true?0:null;
 const paidPoints=Number.isFinite(points)&&excludedTechlife!==null?points-excludedTechlife:null;
 const regular=base!==null&&multiplier!==null&&paidPoints!==null?Math.round(Math.max(0,paidPoints-base)*multiplier*100)/100:null;
 const bonus=(units,tiers)=>tiers.reduce((amount,[target,reward])=>units>=target?reward:amount,0);
 const c100=policy?bonus(c100Units,policy.bonusTiers.c100):null;
 const eol=policy?bonus(eolUnits,policy.bonusTiers.eol):null;
 return {base,stars,multiplier,techlifeEligible,excludedTechlife,paidPoints,regular,c100,eol,extra:policy?c100+eol:null,total:regular===null?null:regular+c100+eol};
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
  const bonus=promoterIncentiveBonusModel(code,month);if(bonus)p[bonus+'Units']+=r._qty;
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
  Object.assign(p,promoterIncentiveAmounts(incomplete?NaN:p.points,p.area,p.format,p.c100Units,p.eolUnits,month,p.techlife));
  if(!PROMOTER_INCENTIVE_POLICIES[month])p.issues.add('Monthly scheme not set');
  p.models=[...p.models.values()].sort((a,b)=>a.name.localeCompare(b.name));
 }
 return {people:[...people.values()].sort((a,b)=>(b.total??-Infinity)-(a.total??-Infinity)||a.name.localeCompare(b.name)),cutoff,excluded,unassigned,policy:PROMOTER_INCENTIVE_POLICIES[month]};
}
function promoterIncentiveTotals(people){
 const recipients=people.filter(p=>Number.isFinite(p.total)&&p.total>0);
 const total={count:people.length,pending:people.filter(p=>p.total===null).length,active:people.filter(p=>p.active===true).length,inactive:people.filter(p=>p.active===false).length,statusUnknown:people.filter(p=>p.active===null).length,withIncentive:recipients.filter(p=>p.active===true).length,noIncentive:people.filter(p=>p.active===true&&p.total===0).length,activePending:people.filter(p=>p.active===true&&p.total===null).length};
 total.withShare=total.active?total.withIncentive/total.active*100:0;total.noShare=total.active?total.noIncentive/total.active*100:0;
 total.averageIncentive=recipients.length?recipients.reduce((sum,p)=>sum+p.total,0)/recipients.length:null;
 for(const key of ['smartphone','realme','techlife','points','regular','c100','eol','extra','total'])total[key]=people.some(p=>p[key]===null)?null:people.reduce((s,p)=>s+p[key],0);
 return total;
}

// Archive input is deliberately independent of live filters and future catalogs.
function incentiveArchiveReport(input){
 const catalog=new Map(input.catalog.map(m=>[normalize(m.model).replace(/\s+/g,' ').toLowerCase(),m]));
 const rows=input.sales.map(r=>{const m=catalog.get(normalize(r._model).replace(/\s+/g,' ').toLowerCase()),rate=m?.points??null;
  return {...r,_date:new Date(r._date+'T12:00:00Z'),_series:m?.series||'Unmapped series',_scoreRate:rate,_points:rate===null?null:r._qty*rate};});
 return promoterIncentiveReport(rows,input.roster,input.month);
}
function incentiveReportJSON(report){return JSON.parse(JSON.stringify(report,(key,value)=>value instanceof Set?[...value]:value));}
function incentiveReportRestore(report){return {...report,people:report.people.map(p=>({...p,issues:new Set(p.issues)}))};}

const api={incentiveArchiveReport,incentiveReportJSON,incentiveReportRestore,PROMOTER_INCENTIVE_POLICIES,promoterIncentiveFormat,promoterIncentiveBonusModel,promoterIncentiveAmounts,promoterIncentiveReport,promoterIncentiveTotals};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(window,api);
})();
