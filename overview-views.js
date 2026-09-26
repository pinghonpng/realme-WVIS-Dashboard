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
// Compare each partial month against the same elapsed days in the prior month.
function overviewMonthlyGrowth(all,filters,groupKey,names){
 const coverage=new Map(),totals=new Map(names.map(n=>[n,new Map()]));
 for(const r of all){const d=trendDay(r._date),m=trendMonth(d);coverage.set(m,Math.max(coverage.get(m)||-Infinity,d));
  if(!filters.every(([k,v])=>passes(r[k],v)))continue;
  const byMonth=totals.get(r[groupKey]||'Unassigned');if(!byMonth)continue;
  if(!byMonth.has(m))byMonth.set(m,Array(32).fill(0));byMonth.get(m)[r._date.getDate()]+=r._qty;
 }
 if(!coverage.size)return [];
 const months=[...coverage.keys()].sort(),result=[];
 for(let m=months[0];m<=months.at(-1);m=modelMonthOffset(m,1)){
  const prev=modelMonthOffset(m,-1),start=trendMonthStart(m),next=trendMonthStart(modelMonthOffset(m,1)),priorStart=trendMonthStart(prev);
  const cutoff=coverage.get(m),full=cutoff===next-1,days=cutoff===undefined?0:cutoff-start+1;
  const priorDays=full?start-priorStart:Math.min(days,start-priorStart);
  const available=days>0&&coverage.has(prev)&&coverage.get(prev)>=priorStart+priorDays-1;
  result.push({month:m,comparison:monthName(m)+' 1–'+days+' vs '+monthName(prev)+' 1–'+priorDays,values:names.map(name=>{
   if(!available)return null;const byMonth=totals.get(name),sum=(key,n)=>(byMonth.get(key)||[]).slice(1,n+1).reduce((a,b)=>a+b,0),current=sum(m,days),previous=sum(prev,priorDays);
   return previous>0?(current/previous-1)*100:current===0?0:null;
  })});
 }
 return result;
}
let overviewTrendMode='monthly',overviewMixMode='series';
function overviewNonMonthFilters(){return [['areaFilter','_area'],['asmFilter','_asm'],['customerFilter','_customer'],['channelFilter','_channel'],['productTypeFilter','_productType'],['modelFilter','_model'],['seriesFilter','_series'],['priceRangeFilter','_priceRange']].map(([id,key])=>[key,selected(id)]);}
function syncTrendMonthLock(){
 const canvas=$('salesTrendChart'),dialog=document.querySelector('dialog[open]');
 const canvases=[canvas,$('areaChart')];const locked=$('overviewSection').classList.contains('active')&&overviewTrendMode==='monthly'&&canvases.some(c=>!c.closest('[hidden]')&&(!dialog||dialog.contains(c)));
 $('monthFilter').disabled=locked;$('monthFilter').title=locked?'Monthly trend shows all uploaded months. Switch to Daily or Weekly to change the selected month.':'';
}
function renderOverviewTrend(){
 const all=salesEnriched(),filters=overviewNonMonthFilters(),key=selected('areaFilter')==='ALL'?'_area':'_asm';
 const data=overviewTrendData(all,overviewTrendMode,selected('monthFilter'),filters,key),monthly=overviewTrendMode==='monthly';
 const growth=monthly?overviewMonthlyGrowth(all,filters,key,data.series.map(s=>s.name)):[];
 const colors=['#2563eb','#d28b00','#15966b','#9333ea','#db496c','#078aab','#815b37'];
 const showSma=$('trendSmaToggle').checked,datasets=[];
 data.series.forEach((s,i)=>{const color=colors[i%colors.length],base={group:s.name,borderColor:color,backgroundColor:color,pointRadius:2,borderWidth:2,tension:0};
  datasets.push({...base,label:s.name,data:s.values,yAxisID:'sales',kind:'sales'});
  if(showSma)datasets.push({...base,label:s.name+' SMA',data:s.sma,yAxisID:'sales',kind:'sma',borderColor:color+'70',borderDash:[5,4],pointRadius:0});
  if(monthly)datasets.push({...base,label:s.name+' MoM',data:growth.map(g=>g.values[i]),yAxisID:'growth',kind:'growth',borderDash:[5,4],pointStyle:'rectRot'});
 });
 const scales={x:{offset:true,grid:{display:false},ticks:{maxRotation:0,maxTicksLimit:8}},sales:{position:'left',beginAtZero:true,stack:'trend',stackWeight:2, title:{display:true,text:'Sales · units'},grid:{color:'#edf0f3'},ticks:{maxTicksLimit:5}}};
 if(monthly)scales.growth={beginAtZero:true,position:'left',stack:'trend',stackWeight:1,offset:true,title:{display:true,text:'MoM · %'},ticks:{maxTicksLimit:4,callback:v=>(v>0?'+':'')+v+'%'},grid:{color:c=>c.tick.value===0?'#818b9a':'#edf0f3',lineWidth:c=>c.tick.value===0?1.5:1}};
 $('salesTrendChart').closest('article').classList.toggle('stacked-trend',monthly);
 chart('salesTrendChart','line',data.labels,datasets,{scales:monthly?{x:scales.x,growth:scales.growth,sales:scales.sales}:scales,extra:{interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,position:'bottom',labels:{filter:item=>datasets[item.datasetIndex].kind==='sales'},onClick:(event,item,legend)=>{const c=legend.chart,group=c.data.datasets[item.datasetIndex].group,visible=c.isDatasetVisible(item.datasetIndex);c.data.datasets.forEach((d,i)=>{if(d.group===group)c.setDatasetVisibility(i,!visible);});c.update();}},tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+(ctx.dataset.kind==='growth'?(ctx.parsed.y>0?'+':'')+fmt(ctx.parsed.y,1)+'%':fmt(ctx.parsed.y,1)+' units'),footer:items=>monthly&&items.length?growth[items[0].dataIndex]?.comparison:''}}}}});
 $('trendSmaLabel').textContent='Show '+({daily:'7-day',weekly:'4-week',monthly:'3-month'}[overviewTrendMode])+' SMA';
 $('trendPeriod').textContent=data.period;document.querySelectorAll('[data-trend-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.trendMode===overviewTrendMode)));syncTrendMonthLock();
}
function renderOverviewMix(rows){
 const key={model:'_model',series:'_series',price:'_priceRange'}[overviewMixMode];let groups=sumBy(rows,key);
 if(overviewMixMode==='price'){const order=window.evisPriceRanges.getRanges().map(r=>r.name);groups.sort((a,b)=>(order.indexOf(a[0])<0?999:order.indexOf(a[0]))-(order.indexOf(b[0])<0?999:order.indexOf(b[0])));}
 const colors=['#fbbc04','#2563eb','#15966b','#9333ea','#db496c','#078aab','#815b37','#767d87','#bd6e13','#5965ad','#327342','#b54790','#508f9b','#6c527a'];
 chart('modelChart','doughnut',groups.map(x=>x[0]),[{data:groups.map(x=>x[1]),backgroundColor:groups.map((_,i)=>colors[i%colors.length]),borderWidth:0}],{legend:false,scales:{}});
 const total=groups.reduce((n,x)=>n+x[1],0),bright={'#2563eb':'#78aaff','#15966b':'#62d6ad','#9333ea':'#c49bff','#db496c':'#ff91ad','#078aab':'#6dd6eb','#815b37':'#d9b18e'};
 $('mixShareBody').innerHTML=groups.map(([name,qty],i)=>{const color=colors[i%colors.length];return '<tr><td><span class="mix-swatch" style="--swatch:'+color+';--swatch-night:'+(bright[color]||color)+'"></span>'+escapeHtml(name)+'</td><td>'+fmt(total?qty/total*100:0,1)+'%</td></tr>';}).join('')||'<tr><td colspan="2">No sales for these filters</td></tr>';
 $('mixShareTotal').textContent=total?'100.0%':'—';$('mixShareHeading').textContent=overviewMixMode==='series'?'Series':'Price Range';
 const title='By '+({model:'Model',series:'Series',price:'Price Range'}[overviewMixMode]);
 const card=$('modelChart').closest('article');card.querySelector('h2').textContent=title;card.querySelector('.fullscreen-button')?.setAttribute('aria-label','Full screen: '+title);
 const dialog=card.closest('dialog');if(dialog){dialog.setAttribute('aria-label',title+' full screen');dialog.querySelector('.fullscreen-toolbar strong').textContent=title+' full screen';}
}
(()=>{
 const mixCard=$('modelChart').closest('article'),mixLayout=document.createElement('div');mixLayout.className='mix-layout';const canvasBox=document.createElement('div');canvasBox.className='mix-canvas';$('modelChart').before(mixLayout);canvasBox.append($('modelChart'));mixLayout.append(canvasBox);
 const share=document.createElement('div');share.className='mix-share';share.innerHTML='<table aria-label="Sales mix share"><thead><tr><th id="mixShareHeading">Series</th><th>Share</th></tr></thead><tbody id="mixShareBody"></tbody><tfoot><tr><th>WVIS</th><td id="mixShareTotal">—</td></tr></tfoot></table>';mixLayout.append(share);
 function controls(canvasId,values,active,change){const card=$(canvasId).closest('article'),bar=document.createElement('div');bar.className='chart-view-controls';bar.setAttribute('role','group');bar.setAttribute('aria-label',canvasId==='salesTrendChart'?'Trend interval':'Sales grouping');for(const [value,label] of values){const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.textContent=label;if(canvasId==='salesTrendChart')button.dataset.trendMode=value;button.setAttribute('aria-pressed',String(value===active));button.onclick=()=>{bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));change(value);};bar.append(button);}card.querySelector('.card-head').after(bar);}
 controls('salesTrendChart',[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']],'monthly',value=>{overviewTrendMode=value;renderOverviewTrend();renderDealerTrend();});
 controls('modelChart',[['series','Series'],['price','Price Range']],'series',value=>{overviewMixMode=value;renderOverviewMix(state.filteredSales);});
 const sma=document.createElement('label');sma.className='trend-sma-control';sma.innerHTML='<input id="trendSmaToggle" type="checkbox"><span id="trendSmaLabel">Show 3-month SMA</span>';sma.querySelector('input').onchange=renderOverviewTrend;$('salesTrendChart').closest('article').querySelector('.chart-view-controls').append(sma);
 const period=document.createElement('div');period.id='trendPeriod';period.className='trend-period';$('salesTrendChart').before(period);
 document.addEventListener('click',event=>{if(event.target.closest('.nav-item,#overviewChartsToggle'))syncTrendMonthLock();});
 const style=document.createElement('style');style.textContent='.stacked-trend #salesTrendChart{height:440px!important;max-height:440px}.fullscreen-card.stacked-trend canvas.fullscreen-target{height:58vh!important;max-height:none}.trend-sma-control{display:flex;align-items:center;gap:5px;font-size:11px;margin-left:auto}.trend-sma-control input{accent-color:#c28b00}.chart-view-controls{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.chart-view-controls button{font-size:11px;padding:7px 10px}.chart-view-controls button[aria-pressed="true"]{background:#fbbc04;border-color:#fbbc04;color:#111}.trend-period{font-size:11px;color:#737b87;margin-bottom:8px}#monthFilter:disabled{background:#eef0f3;color:#737b87;cursor:not-allowed}.card-head{flex-wrap:wrap;gap:8px}';document.head.append(style);
})();

function dealerTrendData(all,mode,month,filters){
 const top=['RULLS CELLPHONES','Cellcom Word Communications','GALLEON ENTERPRISES','PLAY TELECOM','D Cell City'],topSet=new Set(top);
 const selectedDealer=filters.find(([key])=>key==='_customer')?.[1];if(selectedDealer&&selectedDealer!=='ALL')topSet.add(selectedDealer);
 const mapped=all.map(r=>({...r,_dealerTrend:topSet.has(r._customer||'Unassigned')?(r._customer||'Unassigned'):'Others'}));
 const data=overviewTrendData(mapped,mode,month,filters,'_dealerTrend');data.series.sort((a,b)=>(a.name==='Others'?99:top.indexOf(a.name))-(b.name==='Others'?99:top.indexOf(b.name)));
 return {...data,top,mapped};
}
function renderDealerTrend(){
 const filters=overviewNonMonthFilters(),data=dealerTrendData(salesEnriched(),overviewTrendMode,selected('monthFilter'),filters),monthly=overviewTrendMode==='monthly',showMom=monthly&&$('dealerMomToggle').checked;
 const growth=showMom?overviewMonthlyGrowth(data.mapped,filters,'_dealerTrend',data.series.map(s=>s.name)):[],colors=['#2563eb','#d28b00','#15966b','#9333ea','#db496c','#767d87'],datasets=[];
 data.series.forEach((s,i)=>{const color=s.name==='Others'?'#767d87':colors[Math.max(0,data.top.indexOf(s.name))],base={group:s.name,borderColor:color,backgroundColor:color,pointRadius:2,borderWidth:2,tension:0};datasets.push({...base,label:s.name,data:s.values,yAxisID:'sales',kind:'sales'});if($('dealerSmaToggle').checked)datasets.push({...base,label:s.name+' SMA',data:s.sma,yAxisID:'sales',kind:'sma',borderColor:color+'70',borderDash:[5,4],pointRadius:0});if(showMom)datasets.push({...base,label:s.name+' MoM',data:growth.map(g=>g.values[i]),yAxisID:'growth',kind:'growth',borderDash:[5,4],pointStyle:'rectRot'});});
 const scales={x:{offset:true,grid:{display:false},ticks:{maxRotation:0,maxTicksLimit:6}}};
 if(showMom)scales.growth={beginAtZero:true,position:'left',stack:'trend',stackWeight:1,offset:true,title:{display:true,text:'MoM · %'},ticks:{maxTicksLimit:4,callback:v=>(v>0?'+':'')+v+'%'},grid:{color:c=>c.tick.value===0?'#818b9a':'#edf0f3'}};
 scales.sales={position:'left',beginAtZero:true,stack:'trend',stackWeight:2,title:{display:true,text:'Sales · units'},grid:{color:'#edf0f3'},ticks:{maxTicksLimit:5}};
 chart('areaChart','line',data.labels,datasets,{scales,extra:{interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:10,font:{size:10},filter:item=>datasets[item.datasetIndex].kind==='sales'},onClick:(event,item,legend)=>{const c=legend.chart,group=c.data.datasets[item.datasetIndex].group,visible=c.isDatasetVisible(item.datasetIndex);c.data.datasets.forEach((d,i)=>{if(d.group===group)c.setDatasetVisibility(i,!visible);});c.update();}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmt(c.parsed.y,1)+(c.dataset.kind==='growth'?'%':' units'),footer:items=>showMom&&items.length?growth[items[0].dataIndex]?.comparison:''}}}}});
 $('dealerTrendPeriod').textContent=data.period+(selected('customerFilter')==='ALL'?' · Top 5 + Others': ' · Selected dealer');$('dealerSmaLabel').textContent='Show '+({daily:'7-day',weekly:'4-week',monthly:'3-month'}[overviewTrendMode])+' SMA';$('dealerMomControl').hidden=!monthly;
 document.querySelectorAll('[data-trend-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.trendMode===overviewTrendMode)));syncTrendMonthLock();
}
(()=>{
 const card=$('areaChart').closest('article');card.classList.add('dealer-trend-card');card.querySelector('h2').textContent='Dealer Sales Trend';
 const bar=document.createElement('div');bar.className='chart-view-controls';bar.setAttribute('aria-label','Dealer trend interval');
 for(const [mode,label] of [['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']]){const b=document.createElement('button');b.type='button';b.className='secondary-btn';b.dataset.trendMode=mode;b.textContent=label;b.setAttribute('aria-pressed',String(mode===overviewTrendMode));b.onclick=()=>{overviewTrendMode=mode;renderOverviewTrend();renderDealerTrend();};bar.append(b);}
 const choices=document.createElement('div');choices.className='dealer-trend-options';choices.innerHTML='<label><input id="dealerSmaToggle" type="checkbox"><span id="dealerSmaLabel">Show 3-month SMA</span></label><label id="dealerMomControl"><input id="dealerMomToggle" type="checkbox" checked>Show MoM</label>';bar.append(choices);card.querySelector('.card-head').after(bar);choices.querySelectorAll('input').forEach(input=>input.onchange=renderDealerTrend);
 const period=document.createElement('div');period.className='trend-period';period.id='dealerTrendPeriod';$('areaChart').before(period);
 const style=document.createElement('style');style.textContent='.grid-2:has(#salesTrendChart){grid-template-columns:repeat(2,minmax(0,1fr))}.dealer-trend-card #areaChart{height:440px!important;max-height:440px}.dealer-trend-options{display:flex;gap:10px;flex-wrap:wrap;margin-left:auto;font-size:11px}.dealer-trend-options label{display:flex;gap:4px;align-items:center}.grid-3:has(#modelChart){grid-template-columns:minmax(0,.8fr) minmax(0,1.5fr) minmax(0,.8fr)}.mix-layout{display:grid;grid-template-columns:minmax(130px,.9fr) minmax(150px,1.1fr);gap:14px;align-items:center}.mix-canvas{height:260px;min-width:0;position:relative}.mix-canvas canvas{max-height:260px!important}.mix-share{max-height:310px;overflow:auto;border:1px solid var(--line);border-radius:10px}.mix-share th{position:sticky;top:0;background:var(--card)}.mix-share :is(td,th){padding:7px 8px;font-size:10px}.mix-share td:first-child{overflow-wrap:anywhere}.mix-share :is(td,th):last-child{text-align:right;white-space:nowrap}.mix-swatch{display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--swatch);margin-right:6px}html[data-theme=night] .mix-swatch{background:var(--swatch-night)}.chart-collapsed .mix-layout{display:none}.fullscreen-card .mix-layout{grid-template-columns:minmax(0,1.2fr) minmax(250px,1fr)}.fullscreen-card .mix-canvas{height:55vh}.fullscreen-card .mix-canvas canvas.fullscreen-target{height:55vh!important;max-height:none!important}.fullscreen-card .mix-share{max-height:55vh}.fullscreen-card .mix-share :is(td,th){font-size:13px;padding:10px}.fullscreen-card.dealer-trend-card canvas.fullscreen-target{height:58vh!important;max-height:none!important}@media(max-width:1180px){.grid-3:has(#modelChart){grid-template-columns:1fr}}@media(max-width:1000px){.grid-2:has(#salesTrendChart){grid-template-columns:1fr}}@media(max-width:520px){.mix-layout,.fullscreen-card .mix-layout{grid-template-columns:1fr}.mix-share{max-height:250px}}';document.head.append(style);
})();
