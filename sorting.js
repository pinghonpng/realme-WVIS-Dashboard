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
function applyTableSort(table){
  const sort=tableSortState.get(table);if(!sort)return;
  const body=table.tBodies[0];if(!body)return;
  const rows=[...body.rows];
  if(rows.some(row=>row.cells.length!==table.tHead.rows[0].cells.length))return;
  const entries=rows.map((row,index)=>({row,index,value:tableSortValue(row.cells[sort.column].getAttribute('data-sort-value')??row.cells[sort.column].innerText)}));
  const numeric=entries.some(e=>e.value!==null)&&entries.every(e=>e.value===null||e.value.number!==null);
  entries.sort((a,b)=>compareTableValues(a.value,b.value,numeric,sort.direction)||a.index-b.index);
  if(entries.some((e,i)=>e.row!==rows[i]))body.append(...entries.map(e=>e.row));
}
function prepareSortableTables(){
  document.querySelectorAll('table').forEach(table=>{
    if(!table.tHead||!table.tBodies.length)return;
    [...table.tHead.rows[0].cells].forEach((header,column)=>{
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
        [...table.tHead.rows[0].cells].forEach((cell,i)=>{
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
  document.querySelectorAll('table tbody').forEach(body=>tableSortObserver.observe(body,{childList:true,subtree:true,characterData:true}));
}
const tableSortStyle=document.createElement('style');
tableSortStyle.textContent='.table-sort-button{font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:inherit;width:100%}.table-sort-button:hover{color:#111;text-decoration:underline}.table-sort-button:focus-visible{outline:2px solid #9a7900;outline-offset:4px}th[aria-sort="ascending"],th[aria-sort="descending"]{color:#111}';
document.head.appendChild(tableSortStyle);
refreshTableSorting();
