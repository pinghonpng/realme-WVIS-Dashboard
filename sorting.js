// Sort only table rows; chart chronology and source data remain unchanged.
const tableSortState=new WeakMap();
const tableCollator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
function tableSortValue(text){
  const value=text.trim().replace(/\s*\*\s*$/,'').trim();
  if(!value||value==='—'||value==='–'||value==='-')return null;
  const number=value.replace(/,/g,'').replace(/%$/,'');
  return {text:value,number:/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(number)?Number(number):null};
}
function compareTableValues(a,b,numeric,direction){
  if(a===null)return b===null?0:1;
  if(b===null)return -1;
  return direction*(numeric?a.number-b.number:tableCollator.compare(a.text,b.text));
}
function sortableTableHeaders(table){const columns=[...table.tHead.querySelectorAll('th[data-sort-column]')];return columns.length?columns:[...table.tHead.rows[0].cells];}
function customerTypeColumn(table){return sortableTableHeaders(table).findIndex(h=>/^(customer type|channel)$/i.test(h.textContent.replace(/[↕↑↓]/g,'').trim()));}
function orderCustomerTypes(table,column){
 const rank=value=>{const i=['nka','rka','sme','inactive'].indexOf(value.trim().toLowerCase());return i<0?4:i;};
 tableSortState.delete(table);
 sortableTableHeaders(table).forEach(header=>{const button=header.querySelector('.table-sort-button');if(button)header.textContent=button.getAttribute('aria-label').slice(8);header.removeAttribute('aria-sort');});
 for(const body of table.tBodies){
  const rows=[...body.rows];if(rows.some(row=>!row.cells[column]||row.cells[0].colSpan>1))continue;
  const ordered=rows.map((row,index)=>({row,index})).sort((a,b)=>rank(a.row.cells[column].textContent)-rank(b.row.cells[column].textContent)||a.index-b.index);
  if(ordered.some((entry,i)=>entry.row!==rows[i]))body.append(...ordered.map(entry=>entry.row));
 }
}
function applyTableSort(table){
  const sort=tableSortState.get(table);if(!sort)return;
  const body=table.tBodies[0];if(!body)return;
  const rows=[...body.rows];
  if(rows.some(row=>row.cells.length!==sortableTableHeaders(table).length))return;
  const entries=rows.map((row,index)=>({row,index,value:tableSortValue(row.cells[sort.column].getAttribute('data-sort-value')??row.cells[sort.column].innerText)}));
  const numeric=entries.some(e=>e.value!==null)&&entries.every(e=>e.value===null||e.value.number!==null);
  entries.sort((a,b)=>compareTableValues(a.value,b.value,numeric,sort.direction)||a.index-b.index);
  if(entries.some((e,i)=>e.row!==rows[i]))body.append(...entries.map(e=>e.row));
}
function prepareSortableTables(){
  document.querySelectorAll('table').forEach(table=>{
    if(table.hasAttribute('data-no-sort')||!table.tHead||!table.tBodies.length)return;
    const typeColumn=customerTypeColumn(table);if(typeColumn>=0){orderCustomerTypes(table,typeColumn);return;}
    sortableTableHeaders(table).forEach((header,column)=>{
      if(header.querySelector('.table-sort-button'))return;
      const label=header.textContent.trim();
      header.setAttribute('aria-sort','none');
      const button=document.createElement('button');button.type='button';button.className='table-sort-button';
      button.textContent=label+' ↕';button.setAttribute('aria-label','Sort by '+label);
      header.replaceChildren(button);
      button.addEventListener('click',()=>{
        const previous=tableSortState.get(table);
        const sort={column,direction:previous?.column===column?-previous.direction:1};
        tableSortState.set(table,sort);
        sortableTableHeaders(table).forEach((cell,i)=>{
          cell.setAttribute('aria-sort',i===column?(sort.direction===1?'ascending':'descending'):'none');
          const control=cell.querySelector('.table-sort-button');
          control.textContent=control.getAttribute('aria-label').slice(8)+(i===column?(sort.direction===1?' ↑':' ↓'):' ↕');
        });
        refreshTableSorting();
      });
    });
    applyTableSort(table);
  });
}
const tableSortObserver=new MutationObserver(()=>refreshTableSorting());
function refreshTableSorting(){
  tableSortObserver.disconnect();
  prepareSortableTables();
  refreshTableSummaries();
  prepareTableVisibility();
  coverInactiveCustomerTypes();
  document.querySelectorAll('table tbody').forEach(body=>tableSortObserver.observe(body,{childList:true,subtree:true,characterData:true}));
}
const tableSortStyle=document.createElement('style');
tableSortStyle.textContent='.table-sort-button{font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:inherit;width:100%}.table-sort-button:hover{color:#111;text-decoration:underline}.table-sort-button:focus-visible{outline:2px solid #9a7900;outline-offset:4px}th[aria-sort="ascending"],th[aria-sort="descending"]{color:#111}';
document.head.appendChild(tableSortStyle);
refreshTableSorting();


// Summary rows stay outside tbody so sorting never moves or counts them.
function summaryNumber(text){
 const clean=text.trim().replace(/[,₱%]/g,'').replace(/\s*\*$/,'').trim();
 return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean)?Number(clean):null;
}
function summarySum(rows,column){
 let total=0,partial=false;
 for(const row of rows){const text=row.cells[column].textContent,value=summaryNumber(text);if(value===null)return {value:null,partial:false};total+=value;partial=partial||text.includes('*');}
 return {value:total,partial};
}
function refreshTableSummaries(){
 const sums={topStoresBody:[3],bottomStoresBody:[3],storeTableBody:[5,6],psTableBody:[4],lineupTableBody:[2,3,4],promoterScoreBody:[2,3,4,6],subregionScoreBody:[1,2,3],performanceareaBody:[1,2,4,5,6,7],performancesubregionBody:[1,2,4,5,6,7]};
 document.querySelectorAll('table').forEach(table=>{
  if(table.hasAttribute('data-no-sort')||!table.tHead||!table.tBodies.length)return;
  if(table.tFoot&&(table.tFoot.dataset.summary==='history'||!table.tFoot.hasAttribute('data-summary-auto')))return;
  const body=table.tBodies[0],id=body.id,columns=sortableTableHeaders(table).length;
  const rows=[...body.rows].filter(row=>row.cells.length===columns&&row.cells[0].colSpan===1);
  const values=Array(columns).fill('—');values[0]='WVIS';
  const totals=new Map();
  const text=(total,digits=0)=>total.value===null?'—':fmt(total.value,digits)+(total.partial?' *':'');
  for(const column of sums[id]||[]){const total=summarySum(rows,column);totals.set(column,total);values[column]=text(total,['promoterScoreBody','subregionScoreBody'].includes(id)&&column!==(id==='promoterScoreBody'?2:1)?2:0);}
  if(id==='promoterScoreBody'){
   const points=totals.get(3),target=totals.get(4);
   values[5]=points.value!==null&&target.value>0?pct(points.value/target.value*100)+(points.partial?' *':''):'—';
   values[7]=fmt(rows.filter(r=>r.cells[7].dataset.performanceStatus==='passed').length)+' reached / '+fmt(rows.length)+' PS';
  }
  if(id==='performanceareaBody'||id==='performancesubregionBody'){
   const score=totals.get(2),headcount=totals.get(1);values[2]=text(score,2);values[3]=score.value!==null&&headcount.value>0?fmt(score.value/headcount.value,2)+(score.partial?' *':''):'—';
  }
  if(id==='psTableBody')values[5]=fmt(rows.filter(r=>summaryNumber(r.cells[4].textContent)>0).length)+' with sales / '+fmt(rows.length)+' PS';
  if(id==='scoreCatalogBody'){values[0]='WVIS · '+fmt(rows.length)+' models';values[1]=fmt(new Set(rows.map(r=>r.cells[1].textContent)).size)+' series';}
  if(id==='departedBody'){values[0]='WVIS · '+fmt(rows.length)+' promoters';values[3]=fmt(rows.length)+' resigned';}
  const footer=table.tFoot||table.createTFoot();footer.setAttribute('data-summary-auto','');footer.title='Summary of the displayed rows; rates, prices, IDs and dates are not added together.';
  footer.innerHTML='<tr>'+values.map((value,i)=>i?'<td>'+escapeHtml(value)+'</td>':'<th scope="row">'+escapeHtml(value)+'</th>').join('')+'</tr>';
 });
}
const summaryStyle=document.createElement('style');summaryStyle.textContent='table tfoot th,table tfoot td{background:#eef0f3;font-weight:700;border:1px solid #d8dce2;border-top:2px solid #999fa8;text-align:center}table tfoot .up{color:#238344}table tfoot .down{color:#c63c3c}table tfoot .steady{color:#286bc1}table tfoot .model-rate{white-space:nowrap}';document.head.appendChild(summaryStyle);


// Table visibility is independent of filters, sorting and shared data.
function prepareTableVisibility(){
 document.querySelectorAll('table').forEach(table=>{
  const body=table.tBodies[0],wrap=table.closest('.table-wrap');if(!body?.id||!wrap||table.dataset.visibilityReady)return;
  const contentId=wrap.id||body.id+'Content';wrap.id=contentId;
  if([...document.querySelectorAll('button[aria-controls]')].some(button=>button.getAttribute('aria-controls')===contentId)){table.dataset.visibilityReady='true';return;}
  const title=table.getAttribute('aria-label')||table.closest('details')?.querySelector('summary')?.textContent||table.closest('article')?.querySelector('h2,h3')?.textContent||'table';
  const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.setAttribute('aria-controls',contentId);
  const previous=wrap.previousElementSibling,summary=table.closest('details')?.querySelector('summary');
  let heading;
  if(previous?.matches('h2,h3')){
   heading=document.createElement('div');heading.className='card-head table-visibility-heading';
   if(previous.classList.contains('productivity-cohort-title'))heading.classList.add('table-cohort-heading');
   previous.before(heading);heading.append(previous);
  }else if(summary){
   heading=summary;heading.classList.add('table-visibility-summary');
  }else heading=table.closest('article')?.querySelector('.card-head');
  if(!heading){heading=document.createElement('div');heading.className='card-head';const label=document.createElement('h2');label.textContent=title;heading.append(label);wrap.before(heading);}
  heading.append(button);
  let hidden=false;try{hidden=localStorage.getItem('evis.hidden.'+body.id)==='true';}catch{}
  function apply(){wrap.hidden=hidden;button.textContent=hidden?'Show table':'Hide table';button.setAttribute('aria-expanded',String(!hidden));button.setAttribute('aria-label',(hidden?'Show ':'Hide ')+title);}
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();hidden=!hidden;try{localStorage.setItem('evis.hidden.'+body.id,String(hidden));}catch{}apply();});apply();table.dataset.visibilityReady='true';
 });
}
const tableVisibilityStyle=document.createElement('style');tableVisibilityStyle.textContent='.card-head>.secondary-btn{flex-shrink:0;margin-left:12px}.table-visibility-heading>h2,.table-visibility-heading>h3{margin:0}.table-cohort-heading{margin-top:26px;margin-bottom:12px}.table-visibility-summary{min-height:40px;align-content:center}.table-visibility-summary>.secondary-btn{float:right;margin-left:12px}.table-visibility-summary::after{content:"";display:table;clear:both}.table-wrap[hidden]{display:none!important}';document.head.appendChild(tableVisibilityStyle);

// Visual cover only: keep row values available to sorting and total calculations.
function coverInactiveCustomerTypes(){
 document.querySelectorAll('table').forEach(table=>{
  if(!table.tHead)return;
  const column=customerTypeColumn(table);
  for(const body of table.tBodies)for(const row of body.rows){
   const inactive=column>=0&&row.cells[column]?.textContent.trim().toLowerCase()==='inactive';
   row.classList.toggle('inactive-customer-cover',inactive);
  }
 });
}
const inactiveCustomerStyle=document.createElement('style');inactiveCustomerStyle.textContent='table tbody tr.inactive-customer-cover,table tbody tr.inactive-customer-cover>*,table tbody tr.inactive-customer-cover>* *{background:#000!important;color:#000!important;border-color:#000!important;text-shadow:none!important}';document.head.appendChild(inactiveCustomerStyle);
