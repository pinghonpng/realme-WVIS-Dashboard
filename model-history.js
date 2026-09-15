// Model comparisons use calendar months and the same non-month filters.
function modelMonthKey(date){return !date||isNaN(date)?'':`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;}
function modelMonthOffset(month,offset){const [y,m]=month.split('-').map(Number);return modelMonthKey(new Date(y,m-1+offset,1));}
function modelRate(current,previous){
  if(current===null||previous===null)return {text:'—',value:null,kind:'missing'};
  if(previous===0)return current===0?{text:'0.00%',value:0,kind:'steady'}:{text:'New',value:null,kind:'up'};
  const value=(current-previous)/previous*100;
  return {text:`${value>0?'+':''}${value.toFixed(2)}%`,value,kind:Math.abs(value)<=1+1e-9?'steady':value>0?'up':'down'};
}
function modelRateCell(current,previous){const rate=modelRate(current,previous),symbol={up:'▲',down:'▼',steady:'━',missing:''}[rate.kind];return `<td data-sort-value="${rate.value??''}" class="model-rate ${rate.kind}"><span aria-hidden="true">${symbol}</span> ${rate.text}</td>`;}
function modelHistoryData(all,month,filters){
  const months=Array.from({length:5},(_,i)=>modelMonthOffset(month,-i));
  const buckets=new Map(months.map(m=>[m,{latest:0,rows:[],sales:new Map()}]));
  all.forEach(r=>{const bucket=buckets.get(modelMonthKey(r._date));if(!bucket)return;bucket.latest=Math.max(bucket.latest,r._date.getDate());if(filters.every(([key,value])=>passes(r[key],value))){bucket.rows.push(r);const model=r._model||'Unknown';bucket.sales.set(model,(bucket.sales.get(model)||0)+r._qty);}});
  const cutoff=buckets.get(month).latest,previous=months[1];
  const [py,pm]=previous.split('-').map(Number),previousEnd=Math.min(cutoff,new Date(py,pm,0).getDate());
  const prior=buckets.get(previous),matched=new Map();
  prior.rows.filter(r=>r._date.getDate()<=previousEnd).forEach(r=>{const model=r._model||'Unknown';matched.set(model,(matched.get(model)||0)+r._qty);});
  return {months,buckets,cutoff,previousEnd,matched,matchedAvailable:cutoff>0&&prior.latest>=previousEnd};
}
function renderModelHistory(rows){
  const month=selected('monthFilter');if(!/^\d{4}-\d{2}$/.test(month))return;
  const filters=[['_area',selected('areaFilter')],['_asm',selected('asmFilter')],['_customer',selected('customerFilter')],['_channel',selected('channelFilter')],['_model',selected('modelFilter')],['_series',selected('seriesFilter')]];
  const history=modelHistoryData(salesEnriched(),month,filters),{months,buckets}=history;
  const past=[months[3],months[2],months[1]],table=$('modelTableBody').closest('table');
  const pair=(from,to)=>from.slice(0,4)===to.slice(0,4)?monthName(from).replace(/\s*\d{4}/,'')+' → '+monthName(to):monthName(from)+' → '+monthName(to);
  const labels=['Model','Sales','Market Share',monthName(months[1]),pair(months[1],month),...past.map(m=>monthName(m)),...past.map(m=>pair(modelMonthOffset(m,-1),m))];
  table.classList.add('model-history-table');
  if(!table.tHead.querySelector('[data-sort-column]'))table.tHead.innerHTML='<tr>'+labels.slice(0,5).map((label,i)=>`<th rowspan="2" scope="col" data-sort-column="${i}">${escapeHtml(label)}</th>`).join('')+'<th colspan="3" scope="colgroup">Monthly Sales</th><th colspan="3" scope="colgroup">Increase Rate</th></tr><tr>'+labels.slice(5).map((label,i)=>`<th scope="col" data-sort-column="${i+5}">${escapeHtml(label)}</th>`).join('')+'</tr>';
  else [...table.tHead.querySelectorAll('[data-sort-column]')].forEach((cell,i)=>{const button=cell.querySelector('.table-sort-button');if(button){button.setAttribute('aria-label','Sort by '+labels[i]);button.textContent=labels[i]+({'ascending':' ↑','descending':' ↓'}[cell.getAttribute('aria-sort')]||' ↕');}else cell.textContent=labels[i];});
  const models=uniq(months.slice(0,4).flatMap(m=>[...buckets.get(m).sales.keys()]));
  const total=rows.reduce((sum,r)=>sum+r._qty,0),current=buckets.get(month);
  const complete=m=>{const [y,num]=m.split('-').map(Number);return buckets.get(m).latest===new Date(y,num,0).getDate();};
  const monthly=(m,model)=>buckets.get(m).latest?buckets.get(m).sales.get(model)||0:null;
  $('modelTableBody').innerHTML=models.map(model=>{
    const sales=current.sales.get(model)||0,prior=history.matchedAvailable?history.matched.get(model)||0:null;
    return `<tr><td><strong>${escapeHtml(model)}</strong></td><td>${fmt(sales)}</td><td>${pct(total?sales/total*100:0)}</td><td>${prior===null?'—':fmt(prior)}</td>${modelRateCell(current.latest?sales:null,prior)}${past.map(m=>{const value=monthly(m,model);return `<td>${value===null?'—':fmt(value)+(complete(m)?'':' *')}</td>`;}).join('')}${past.map(m=>{const prev=modelMonthOffset(m,-1);return modelRateCell(complete(m)?monthly(m,model):null,complete(prev)?monthly(prev,model):null);}).join('')}</tr>`;
  }).join('')||emptyRow(labels.length);
  table.closest('article').querySelector('.card-head p').textContent=`Current sales: ${monthName(month)} 1–${history.cutoff||'—'}. Previous period: ${monthName(months[1])} 1–${history.previousEnd||'—'}. Market share uses selected-view units. IR = (new − previous) / previous. Blue line: ±1%; green: increase; red: decrease. New = zero prior sales. Past months show all uploaded sales; * means data ends before month-end, and incomplete/missing comparisons show —. All filters apply to both periods.`;
}
renderModelTable=renderModelHistory;
const modelHistoryStyle=document.createElement('style');
modelHistoryStyle.textContent='.model-history-table{border-collapse:collapse}.model-history-table th,.model-history-table td{border:1px solid #d8dce2;text-align:center;vertical-align:middle}.model-history-table th{background:#f7f8fa}.model-history-table th[scope=colgroup]{background:#eef0f3;font-size:12px}.model-history-table .table-sort-button{text-align:center}#modelTableBody .model-rate{white-space:nowrap;font-weight:600}#modelTableBody .up{color:#238344}#modelTableBody .down{color:#c63c3c}#modelTableBody .steady{color:#286bc1}#modelTableBody td{font-variant-numeric:tabular-nums}';
document.head.appendChild(modelHistoryStyle);
