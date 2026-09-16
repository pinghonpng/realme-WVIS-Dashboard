// Calendar buckets use UTC day numbers derived from local upload dates, avoiding DST shifts.
function trendDay(date){return Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000);}
function trendMonth(day){return new Date(day*86400000).toISOString().slice(0,7);}
function trendMonthStart(month){const [y,m]=month.split('-').map(Number);return Date.UTC(y,m-1,1)/86400000;}
function trendWeek(day){return day-((new Date(day*86400000).getUTCDay()+6)%7);}
function overviewTrendData(all,mode,month,filters,groupKey){
 const coverage=new Map();for(const row of all){const d=trendDay(row._date),m=trendMonth(d);coverage.set(m,Math.max(coverage.get(m)||-Infinity,d));}
 if(!coverage.size)return {labels:[],series:[],period:''};
 const months=[...coverage.keys()].sort(),first=trendMonthStart(months[0]),last=Math.max(...coverage.values());
 const end=mode==='monthly'?last:Math.min(last,trendMonthStart(modelMonthOffset(month,1))-1);
 const start=mode==='monthly'?first:trendMonthStart(mode==='weekly'?modelMonthOffset(month,-2):month);
 const bucket=d=>mode==='monthly'?trendMonthStart(trendMonth(d)):mode==='weekly'?trendWeek(d):d;
 const step=d=>mode==='monthly'?trendMonthStart(modelMonthOffset(trendMonth(d),1)):d+(mode==='weekly'?7:1);
 const buckets=[];for(let d=bucket(first);d<=end;d=step(d))buckets.push(d);
 const matching=all.filter(r=>filters.every(([key,value])=>passes(r[key],value)));
 const names=[...new Set(matching.filter(r=>trendDay(r._date)<=end&&trendDay(r._date)>=bucket(start)).map(r=>r[groupKey]||'Unassigned'))].sort();
 const totals=new Map(names.map(name=>[name,new Map()]));
 for(const row of matching){const values=totals.get(row[groupKey]||'Unassigned');if(values){const key=bucket(trendDay(row._date));values.set(key,(values.get(key)||0)+row._qty);}}
 const covered=d=>coverage.has(trendMonth(d))&&d<=coverage.get(trendMonth(d));
 const valid=buckets.map(d=>{if(mode==='monthly')return coverage.has(trendMonth(d));for(let i=Math.max(d,first);i<=Math.min(step(d)-1,end);i++)if(!covered(i))return false;return d<=end;});
 const visible=buckets.map((d,i)=>({d,i})).filter(x=>x.d>=bucket(start));
 const windowSize={daily:7,weekly:4,monthly:3}[mode];
 const dayLabel=d=>new Date(d*86400000).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
 const labels=visible.map(({d})=>{const next=step(d),cutoff=mode==='monthly'?coverage.get(trendMonth(d)):end;const partial=cutoff!==undefined&&cutoff<next-1;return mode==='monthly'?new Date(d*86400000).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'})+(partial?' (1–'+new Date(cutoff*86400000).getUTCDate()+')':''):mode==='weekly'?dayLabel(d)+' – '+dayLabel(Math.min(d+6,end))+(partial?' (partial)':''):dayLabel(d);});
 const series=names.map(name=>{const values=buckets.map((d,i)=>valid[i]?(totals.get(name).get(d)||0):null);return {name,values:visible.map(({i})=>values[i]),sma:visible.map(({i})=>{const slice=values.slice(i-windowSize+1,i+1);return i>=windowSize-1&&slice.every(v=>v!==null)?slice.reduce((s,v)=>s+v,0)/windowSize:null;})};});
 return {labels,series,period:mode==='monthly'?'All uploaded months':mode==='weekly'?monthName(modelMonthOffset(month,-2))+' – '+monthName(month):monthName(month)};
}
let overviewTrendMode='monthly',overviewMixMode='model';
function overviewNonMonthFilters(){return [['areaFilter','_area'],['asmFilter','_asm'],['customerFilter','_customer'],['channelFilter','_channel'],['modelFilter','_model'],['seriesFilter','_series'],['priceRangeFilter','_priceRange']].map(([id,key])=>[key,selected(id)]);}
function syncTrendMonthLock(){
 const canvas=$('salesTrendChart'),dialog=document.querySelector('dialog[open]');
 const locked=$('overviewSection').classList.contains('active')&&overviewTrendMode==='monthly'&&!canvas.closest('[hidden]')&&(!dialog||dialog.contains(canvas));
 $('monthFilter').disabled=locked;$('monthFilter').title=locked?'Monthly trend shows all uploaded months. Switch to Daily or Weekly to change the selected month.':'';
}
function renderOverviewTrend(){
 const data=overviewTrendData(salesEnriched(),overviewTrendMode,selected('monthFilter'),overviewNonMonthFilters(),selected('areaFilter')==='ALL'?'_area':'_asm');
 const colors=['#2563eb','#d28b00','#15966b','#9333ea','#db496c','#078aab','#815b37'];
 const datasets=data.series.flatMap((s,i)=>{const color=colors[i%colors.length];return [{label:s.name,data:s.values,borderColor:color,backgroundColor:color,pointRadius:2,borderWidth:2,tension:.2},{label:s.name+' · '+({daily:'7-day',weekly:'4-week',monthly:'3-month'}[overviewTrendMode])+' SMA',data:s.sma,borderColor:color+'70',backgroundColor:color+'70',borderDash:[5,4],pointRadius:0,borderWidth:2,tension:.2}];});
 chart('salesTrendChart','line',data.labels,datasets,{legend:true,extra:{interaction:{mode:'index',intersect:false}}});
 $('trendPeriod').textContent=data.period;syncTrendMonthLock();
}
function renderOverviewMix(rows){
 const key={model:'_model',series:'_series',price:'_priceRange'}[overviewMixMode];let groups=sumBy(rows,key);
 if(overviewMixMode==='price'){const order=window.evisPriceRanges.getRanges().map(r=>r.name);groups.sort((a,b)=>(order.indexOf(a[0])<0?999:order.indexOf(a[0]))-(order.indexOf(b[0])<0?999:order.indexOf(b[0])));}
 const colors=['#fbbc04','#2563eb','#15966b','#9333ea','#db496c','#078aab','#815b37','#767d87'];
 chart('modelChart','doughnut',groups.map(x=>x[0]),[{data:groups.map(x=>x[1]),backgroundColor:groups.map((_,i)=>colors[i%colors.length]),borderWidth:0}],{legend:true,scales:{}});
 const title='By '+({model:'Model',series:'Series',price:'Price Range'}[overviewMixMode]);
 const card=$('modelChart').closest('article');card.querySelector('h2').textContent=title;card.querySelector('.fullscreen-button')?.setAttribute('aria-label','Full screen: '+title);
 const dialog=card.closest('dialog');if(dialog){dialog.setAttribute('aria-label',title+' full screen');dialog.querySelector('.fullscreen-toolbar strong').textContent=title+' full screen';}
}
(()=>{
 function controls(canvasId,values,active,change){const card=$(canvasId).closest('article'),bar=document.createElement('div');bar.className='chart-view-controls';bar.setAttribute('role','group');bar.setAttribute('aria-label',canvasId==='salesTrendChart'?'Trend interval':'Sales grouping');for(const [value,label] of values){const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.textContent=label;button.setAttribute('aria-pressed',String(value===active));button.onclick=()=>{bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));change(value);};bar.append(button);}card.querySelector('.card-head').after(bar);}
 controls('salesTrendChart',[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']],'monthly',value=>{overviewTrendMode=value;renderOverviewTrend();});
 controls('modelChart',[['model','Model'],['series','Series'],['price','Price Range']],'model',value=>{overviewMixMode=value;renderOverviewMix(state.filteredSales);});
 const period=document.createElement('div');period.id='trendPeriod';period.className='trend-period';$('salesTrendChart').before(period);
 document.addEventListener('click',event=>{if(event.target.closest('.nav-item,#overviewChartsToggle'))syncTrendMonthLock();});
 const style=document.createElement('style');style.textContent='.chart-view-controls{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.chart-view-controls button{font-size:11px;padding:7px 10px}.chart-view-controls button[aria-pressed="true"]{background:#fbbc04;border-color:#fbbc04;color:#111}.trend-period{font-size:11px;color:#737b87;margin-bottom:8px}#monthFilter:disabled{background:#eef0f3;color:#737b87;cursor:not-allowed}.card-head{flex-wrap:wrap;gap:8px}';document.head.append(style);
})();
