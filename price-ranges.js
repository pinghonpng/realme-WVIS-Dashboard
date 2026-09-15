// One price classification per transaction, based on that row's realized SRP.
const UNCLASSIFIED_PRICE='Unclassified';
function validatePriceRanges(rows){
 if(!Array.isArray(rows)||rows.length>100)throw new Error('Use up to 100 price ranges.');
 const names=new Set();
 const ranges=rows.map((r,i)=>{
  const name=normalize(r.name),lowerText=normalize(r.lower),upperText=normalize(r.upper),lower=Number(lowerText),upper=Number(upperText);
  if(!name||name.length>80||['all','unclassified'].includes(name.toLowerCase())||names.has(name.toLowerCase()))throw new Error('Row '+(i+1)+': enter a unique price range name (not All or Unclassified).');
  if(!lowerText||!upperText||!Number.isFinite(lower)||!Number.isFinite(upper)||lower<0||upper<lower||upper>1e12)throw new Error('Row '+(i+1)+': enter valid lower and upper SRPs, with upper at least lower.');
  names.add(name.toLowerCase());return {name,lower,upper};
 });
 const ordered=[...ranges].sort((a,b)=>a.lower-b.lower);
 for(let i=1;i<ordered.length;i++)if(ordered[i].lower<=ordered[i-1].upper)throw new Error('Ranges overlap: '+ordered[i-1].name+' and '+ordered[i].name+'. Both limits are inclusive.');
 return ranges;
}
function transactionPriceRange(row,ranges){const srp=rowSrp(row);return srp===null?UNCLASSIFIED_PRICE:ranges.find(r=>srp>=r.lower&&srp<=r.upper)?.name||UNCLASSIFIED_PRICE;}
(()=>{
 let ranges=[],allowed=false,busy=false,dirty=false,base='[]',lastRows=null,lastRanges=null,enriched=[];
 const panel=document.createElement('article');panel.className='card table-card price-range-editor';
 panel.innerHTML='<div class="card-head"><div><h2>Price Ranges</h2><p>Shared definitions for every dashboard tab and sales month.</p></div></div><p class="score-note">Each transaction uses SRP = Sales Amount ÷ units sold. Lower and upper limits are inclusive; ranges must not overlap. Sales outside the ranges, or without a valid SRP, are Unclassified. Save changes to apply them across the dashboard and all devices.</p><div class="table-wrap"><table class="model-history-table" data-no-sort><thead><tr><th>PRICE RANGE</th><th>LOWER RANGE SRP</th><th>UPPER RANGE SRP</th></tr></thead><tbody id="priceRangeBody"></tbody></table></div><div class="score-actions"><button class="secondary-btn" id="addPriceRange" type="button">Add range</button><button class="secondary-btn" id="savePriceRanges" type="button">Save price ranges</button><button class="secondary-btn" id="resetPriceRanges" type="button">Discard edits</button></div><p id="priceRangeStatus" class="score-note" role="status"></p><p id="priceRangeAccess" class="score-note"></p>';
 $('lineupSection').prepend(panel);
 const style=document.createElement('style');style.textContent='.price-range-editor{margin-bottom:18px;box-shadow:none}.price-range-editor input{width:100%;min-width:100px;padding:10px;border:1px solid #d8dce2;border-radius:4px;font:inherit}.price-range-editor td:first-child>div{display:flex;gap:8px;align-items:center}.price-range-editor .remove-range{border:0;background:none;color:#a33434;cursor:pointer;padding:8px;font-size:18px}.price-range-editor input:disabled{color:#444;background:#f7f8fa;opacity:1}.price-range-editor button:disabled{opacity:.45;cursor:default}';document.head.appendChild(style);
 const say=text=>$('priceRangeStatus').textContent=text;
 function controls(){
  panel.querySelectorAll('input,.remove-range,#addPriceRange').forEach(el=>el.disabled=!allowed||busy);
  $('savePriceRanges').disabled=!allowed||busy||!dirty;$('resetPriceRanges').disabled=busy||!dirty;
  $('priceRangeAccess').textContent=allowed?'Administrator: edits apply to everyone after saving.':'View only. Sign in as administrator in Data Sources to edit the shared ranges.';
 }
 function addRow(r={name:'',lower:'',upper:''}){
  const tr=document.createElement('tr');tr.innerHTML='<td><div><input aria-label="Price range name" maxlength="80" value="'+escapeHtml(r.name)+'"><button type="button" class="remove-range" aria-label="Remove price range">×</button></div></td><td><input aria-label="Lower range SRP" type="number" min="0" step="any" value="'+escapeHtml(r.lower)+'"></td><td><input aria-label="Upper range SRP" type="number" min="0" step="any" value="'+escapeHtml(r.upper)+'"></td>';
  tr.querySelector('.remove-range').addEventListener('click',()=>{tr.remove();edited();});$('priceRangeBody').append(tr);controls();
 }
 function draw(){ $('priceRangeBody').replaceChildren();(ranges.length?ranges:[{name:'',lower:'',upper:''}]).forEach(addRow);dirty=false;base=JSON.stringify(ranges);controls(); }
 function edited(){dirty=true;say('Unsaved edits. The dashboard still uses the saved ranges.');controls();}
 panel.addEventListener('input',edited);
 $('addPriceRange').addEventListener('click',()=>{addRow();edited();});
 $('resetPriceRanges').addEventListener('click',()=>{draw();say(ranges.length?'Saved price ranges restored.':'No price ranges defined yet.');});
 function options(){const select=$('priceRangeFilter'),previous=select.value;select.innerHTML='<option value="ALL">All price ranges</option>'+ranges.map(r=>'<option value="'+escapeHtml(r.name)+'">'+escapeHtml(r.name)+'</option>').join('')+'<option value="Unclassified">Unclassified</option>';select.value=[...select.options].some(o=>o.value===previous)?previous:'ALL';}
 function setConfig(value){const next=validatePriceRanges(value||[]);if(JSON.stringify(next)===JSON.stringify(ranges))return;ranges=next;options();if(dirty)say('Shared ranges changed while you were editing. Discard edits to load the latest definitions.');else{draw();say(ranges.length+' shared price ranges loaded.');}}
 $('savePriceRanges').addEventListener('click',async()=>{
  try{
   if(base!==JSON.stringify(ranges))throw new Error('Shared ranges changed. Discard edits and try again.');
   const rows=[...$('priceRangeBody').rows].map(tr=>{const fields=tr.querySelectorAll('input');return {name:fields[0].value,lower:fields[1].value,upper:fields[2].value};}).filter(r=>Object.values(r).some(v=>normalize(v)!==''));
   const next=validatePriceRanges(rows);busy=true;controls();say('Saving shared price ranges…');await window.evisSavePriceRanges(next);dirty=false;draw();say('Price ranges saved and applied across the dashboard.');
  }catch(error){say(error.message);}finally{busy=false;controls();}
 });
 const beforeEnriched=salesEnriched;salesEnriched=()=>{const rows=beforeEnriched();if(rows!==lastRows||ranges!==lastRanges){lastRows=rows;lastRanges=ranges;enriched=rows.map(r=>({...r,_priceRange:transactionPriceRange(r,ranges)}));}return enriched;};
 const beforeFilter=filterData;filterData=()=>{beforeFilter();state.filteredSales=state.filteredSales.filter(r=>passes(r._priceRange,selected('priceRangeFilter')));};
 $('priceRangeFilter').addEventListener('change',()=>render());
 window.evisPriceRanges={setConfig,setAdmin:value=>{allowed=value;controls();}};
 options();draw();say('No price ranges defined yet. Add your ranges, then save.');
})();
