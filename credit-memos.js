(()=>{
 'use strict';
 const account=window.dashboardAccount;
 if(!account||(account.role!=='admin'&&account.credit_memos!==true))return;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=value=>value===null?'—':new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(value/100);
 const key=value=>String(value??'').trim().normalize('NFKC').toUpperCase().replace(/\s+/g,' ');
 let report=null,view='available',selected='',searched='',openOrder='',loading=false;
 const tab=document.createElement('button');tab.className='nav-item';tab.dataset.section='creditMemos';tab.textContent='Credit Memos';
 document.querySelector('.nav').append(tab);
 const section=document.createElement('section');section.id='creditMemosSection';section.className='dashboard-section';
 section.innerHTML=`<article class="card cm-controls"><div class="card-head"><h2>Dealer Credit Memos</h2><button class="secondary-btn" id="cmRefresh">Refresh CMs</button></div><div class="cm-filter-row"><label id="cmDealerLabel" for="cmDealer">Customer Name · NonNKA<select id="cmDealer" disabled><option value="">Loading customers…</option></select></label><div class="cm-toggles" role="group" aria-label="Credit memo view"><button class="secondary-btn active" type="button" data-cm-view="available" aria-pressed="true">Available CMs</button><button class="secondary-btn" type="button" data-cm-view="issued" aria-pressed="false">Issued CMs</button><button class="secondary-btn" type="button" data-cm-view="used" aria-pressed="false">Used CMs</button></div></div><form id="cmLookupForm" class="cm-search-row" hidden><label for="cmLookup">CM number<input id="cmLookup" type="text" placeholder="Enter the full CM number" maxlength="120" autocomplete="off" spellcheck="false"></label><button class="secondary-btn" id="cmLookupSubmit" type="submit" disabled>Find CM</button><span class="cm-search-help">Search across all included customers.</span></form><div id="cmStatus" role="status">Select the tab to load credit memos.</div></article><div id="cmSummary" class="cm-summary"></div><article class="card table-card cm-table-card"><div class="card-head"><h2 id="cmTableTitle">Available CMs</h2></div><div id="cmReconcile" role="status"></div><div class="table-wrap"><table id="cmTable" aria-label="Dealer Credit Memos"><colgroup><col style="width:11%"><col style="width:14%"><col style="width:21%"><col style="width:5%"><col style="width:8%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:5%"></colgroup><thead><tr><th>Owner</th><th>AR No.</th><th>Description</th><th>Aging Days</th><th>Remarks</th><th>Issued Amount</th><th>Used Amount</th><th>Remaining</th><th>Available</th><th>Remarks</th></tr></thead><tbody id="cmBody"><tr><td colspan="10">Choose a customer to view credit memos.</td></tr></tbody><tfoot id="cmTotals"></tfoot></table></div><div class="cm-note">Used Amount sums INPUT USED → Amount Used only for rows marked USED in REMARKS; UNUSED rows are excluded. Remaining = Issued Amount + signed Used Amount. Available comes from INPUT AVAILABLE → AmountLeft; CMs absent from that list show ₱0.00. Differences and missing amounts are highlighted for review. — means a source amount is missing; affected totals also show —. Available CMs shows only CMs listed in INPUT AVAILABLE; Issued CMs shows all records from INPUT ISSUED. Aging uses INPUT AVAILABLE → UPDATED AGING DAYS for listed CMs; other issued CMs use INPUT ISSUED → Aging. Aging of 83 days or more is highlighted red. The last Remarks column shows EXPIRED when a CM has a positive Remaining balance but is absent from INPUT AVAILABLE.</div></article>`;
 section.insertAdjacentHTML('beforeend',`<article class="card table-card cm-usage-card" id="cmUsageCard" hidden><div class="card-head"><h2>Usage by sales order</h2></div><div class="cm-usage-intro" id="cmUsageIntro"></div><div class="table-wrap"><table id="cmUsageTable" class="cm-usage-table" aria-label="CM usage by sales order"><thead><tr><th>SO Number</th><th>Used Date</th><th>Used Amount</th></tr></thead><tbody id="cmUsageBody"></tbody><tfoot id="cmUsageTotal"></tfoot></table></div></article>`);
 document.querySelector('main').append(section);
 const orderDialog=document.createElement('dialog');orderDialog.className='cm-order-dialog';orderDialog.setAttribute('aria-labelledby','cmOrderTitle');document.body.append(orderDialog);
 const $=id=>document.getElementById(id);
 const select=$('cmDealer'),status=$('cmStatus');
 function usedAmount(value,cmNo){return value===null?'—':'<button type="button" class="cm-amount-link" data-cm-find="'+escape(cmNo)+'" aria-label="'+escape('View '+money(value)+' usage for '+cmNo)+'">'+money(value)+'</button>';}
 function activate(){document.querySelectorAll('.nav-item,.dashboard-section').forEach(n=>n.classList.remove('active'));tab.classList.add('active');section.classList.add('active');$('pageTitle').textContent='Credit Memos';if(!report)load();}
 tab.addEventListener('click',activate);
 function render(){
  if(!report)return;
  const usedView=view==='used',match=usedView?report.rows.find(r=>key(r.arNo)===searched):null;
  $('cmDealerLabel').hidden=usedView;$('cmLookupForm').hidden=!usedView;
  const dealer=report.dealers.find(d=>d.id===(usedView?match?.dealerId:selected)),all=usedView?(match?[match]:[]):report.rows.filter(r=>r.dealerId===selected),rows=view==='available'?all.filter(r=>r.availableListed):all;
  const totals=rows.reduce((t,r)=>{for(const k of Object.keys(t))t[k]=t[k]===null||r[k]===null?null:t[k]+r[k];return t;},{issuedCents:0,usedCents:0,remainingCents:0,availableCents:0});
  const mismatches=rows.filter(r=>r.differenceCents!==0).length;
  $('cmTableTitle').textContent=usedView?'CM Details'+(match?' · '+match.arNo:''):(view==='available'?'Available CMs':'Issued CMs')+(dealer?' · '+dealer.name:'');
  $('cmSummary').innerHTML=[['CMs shown',String(rows.length)],['Issued Amount',money(totals.issuedCents)],['Used Amount',money(totals.usedCents)],['Remaining',money(totals.remainingCents)],['Available',money(totals.availableCents)]].map(([label,value])=>'<div class="card"><span>'+label+'</span><strong>'+value+'</strong></div>').join('');
  const notice=$('cmReconcile');notice.className=mismatches?'cm-mismatch-note':'cm-matched-note';
  const empty=usedView?(!searched?'Enter a CM number and select Find CM.':'No CM found for '+searched+'. Check the complete CM number.'):!selected?'Choose a customer to view credit memos.':'No '+(view==='available'?'available':'issued')+' CMs found.';
  notice.textContent=!rows.length?empty:mismatches?mismatches+' CM'+(mismatches===1?'':'s')+' need review: balances differ or source amounts are missing.':'Balances match: Remaining equals Available for every CM shown.';
  $('cmBody').innerHTML=rows.length?rows.map(r=>{
   const difference=r.differenceCents!==0,tip=r.differenceCents===null?'A source amount is missing; balance cannot be verified.':difference?'Remaining − Available: '+money(r.differenceCents):'Remaining equals Available';
   return '<tr><td>'+escape(r.owner)+'</td><td>'+escape(r.arNo)+'</td><td>'+escape(r.description)+'</td><td'+(r.aging!==null&&r.aging>=83?' class="cm-aging-alert"':'')+' data-sort-value="'+(r.aging??'')+'">'+(r.aging??'—')+'</td><td class="'+(r.status?'cm-consumed':'')+'">'+r.status+'</td>'+['issuedCents','usedCents','remainingCents','availableCents'].map(k=>'<td data-sort-value="'+(r[k]??'')+'"'+((k==='remainingCents'||k==='availableCents')?' class="'+(difference?'cm-difference':'')+'" title="'+escape(tip)+'"':'')+'>'+(k==='usedCents'?usedAmount(r[k],r.arNo):money(r[k]))+'</td>').join('')+'<td>'+escape(r.remarks)+'</td></tr>';
  }).join(''):'<tr><td colspan="10">'+escape(empty)+'</td></tr>';
  $('cmTotals').innerHTML=rows.length?'<tr><th colspan="5">Total · '+rows.length+' CMs</th>'+Object.values(totals).map(n=>'<td>'+money(n)+'</td>').join('')+'<td></td></tr>':'';
  section.querySelectorAll('[data-cm-view]').forEach(button=>{const active=button.dataset.cmView===view;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  renderUsage(usedView?match:null,dealer);
  if(typeof refreshTableSorting==='function')refreshTableSorting();
 }
 const totalUsed=items=>items.reduce((sum,r)=>sum===null||r.usedCents===null?null:sum+r.usedCents,0);
 const amountCell=(value,cmNo)=>'<td class="cm-amount" data-sort-value="'+(value??'')+'">'+(cmNo?usedAmount(value,cmNo):money(value))+'</td>';
 function renderUsage(cm,customer){
  $('cmUsageCard').hidden=!cm;
  if(!cm){$('cmUsageBody').innerHTML='';$('cmUsageTotal').innerHTML='';$('cmUsageIntro').textContent='';return;}
  const entries=(report.usageTransactions||[]).filter(r=>r.cmId===key(cm.arNo));
  $('cmUsageIntro').textContent='Customer: '+(customer?.name||'—')+' · '+entries.length+' usage '+(entries.length===1?'entry':'entries')+'. Select an SO number to see all CMs used on that order. Only entries marked USED are included.';
  $('cmUsageBody').innerHTML=entries.length?entries.map(r=>'<tr><td>'+(r.soId?'<button type="button" class="cm-order-link" data-cm-order="'+escape(r.soId)+'" aria-haspopup="dialog">'+escape(r.soNo)+'</button>':'Not provided')+'</td><td class="cm-date">'+escape(r.usedDate||'—')+'</td>'+amountCell(r.usedCents,r.cmNo)+'</tr>').join(''):'<tr><td colspan="3">No USED entries recorded for this CM.</td></tr>';
  $('cmUsageTotal').innerHTML=entries.length?'<tr><th colspan="2">Total used</th>'+amountCell(totalUsed(entries))+'</tr>':'';
 }
 function showOrder(soId,refresh=false){
  if(!report)return;
  const entries=(report.usageTransactions||[]).filter(r=>r.soId===soId);if(!entries.length){if(refresh)closeOrder();return;}
  openOrder=soId;
  const cms=new Map(report.rows.map(r=>[key(r.arNo),r])),customers=new Map(report.dealers.map(d=>[d.id,d.name]));
  const cmCount=new Set(entries.map(r=>r.cmId)).size;
  orderDialog.innerHTML='<div class="cm-order-head"><h2 id="cmOrderTitle">'+escape(entries[0].soNo)+'</h2><button type="button" class="secondary-btn" data-cm-order-close autofocus>Close</button></div><p>'+cmCount+' CM'+(cmCount===1?'':'s')+' · '+entries.length+' usage '+(entries.length===1?'entry':'entries')+' · All included customers. Each row shows one recorded use and its date.</p><div class="table-wrap"><table class="cm-order-table" aria-label="Credit memos used on this sales order"><thead><tr><th>Customer Name</th><th>Owner</th><th>CM Number</th><th>Used Date</th><th>Used Amount</th></tr></thead><tbody>'+entries.map(r=>{const cm=cms.get(r.cmId);return '<tr><td>'+escape(customers.get(cm?.dealerId)||'—')+'</td><td>'+escape(cm?.owner||'—')+'</td><td>'+escape(r.cmNo)+'</td><td class="cm-date">'+escape(r.usedDate||'—')+'</td>'+amountCell(r.usedCents,r.cmNo)+'</tr>';}).join('')+'</tbody><tfoot><tr><th colspan="4">Total used on this order</th>'+amountCell(totalUsed(entries))+'</tr></tfoot></table></div>';
  if(!orderDialog.open)orderDialog.showModal();
  if(typeof refreshTableSorting==='function')refreshTableSorting();
 }
 function closeOrder(){openOrder='';if(orderDialog.open)orderDialog.close();orderDialog.innerHTML='';}
 function findCM(cmNo){
  if(!report)return;
  closeOrder();
  section.querySelector('dialog.dashboard-fullscreen [aria-label="Close full screen"]')?.click();
  searched=key(cmNo);$('cmLookup').value=cmNo;view='used';render();
  $('cmLookup').focus({preventScroll:true});$('cmLookupForm').scrollIntoView({block:'center',behavior:'smooth'});
 }
 orderDialog.addEventListener('click',event=>{if(event.target.closest('[data-cm-order-close]'))closeOrder();const cm=event.target.closest('[data-cm-find]');if(cm)findCM(cm.dataset.cmFind);});
 orderDialog.addEventListener('cancel',event=>{event.preventDefault();closeOrder();});
 async function load(force=false){
  if(loading)return;loading=true;$('cmRefresh').disabled=true;status.textContent='Loading CM source sheets…';
  try{
   const response=await fetch('/api/gateway?op=credit-memos'+(force?'&refresh=1':''),{cache:'no-store'});
   const data=await response.json();
   if(!response.ok){if(response.status===401||response.status===403){report=null;select.disabled=true;select.innerHTML='<option value="">Access unavailable</option>';$('cmBody').innerHTML='<tr><td colspan="10">Credit Memo access is not available for this account.</td></tr>';$('cmTotals').innerHTML='';$('cmSummary').innerHTML='';$('cmReconcile').textContent='';$('cmLookupSubmit').disabled=true;renderUsage(null);closeOrder();}throw new Error(data.error||'Could not load credit memos.');}
   report=data;
   select.innerHTML='<option value="">Choose a customer</option>'+data.dealers.map(d=>'<option value="'+escape(d.id)+'">'+escape(d.name)+'</option>').join('');
   if(!data.dealers.some(d=>d.id===selected))selected='';select.value=selected;select.disabled=false;$('cmLookupSubmit').disabled=false;
   const dates=data.sourceDates;
   status.textContent='Checked '+new Date(data.checkedAt).toLocaleString()+' · Source updates — Issued: '+(dates.issued||'not provided')+' · Used: '+(dates.used||'not provided')+' · Available: '+(dates.available||'not provided')+'.';
   status.textContent+=' Choices use INPUT ISSUED → Customer Name. Known NKA dealers are excluded.';
   if(data.diagnostics.availableWithoutIssued)status.textContent+=' '+data.diagnostics.availableWithoutIssued+' available CM(s) have no matching issued record and need source review.';
   render();if(openOrder)showOrder(openOrder,true);
  }catch(e){status.textContent=(report?'Refresh failed. Showing the previously checked data. ':'')+e.message;}finally{loading=false;$('cmRefresh').disabled=false;}
 }
 select.addEventListener('change',()=>{selected=select.value;render();});
 section.addEventListener('click',event=>{const button=event.target.closest('[data-cm-view]');if(button){view=button.dataset.cmView;render();}const order=event.target.closest('[data-cm-order]');if(order)showOrder(order.dataset.cmOrder);const cm=event.target.closest('[data-cm-find]');if(cm)findCM(cm.dataset.cmFind);});
 $('cmLookupForm').addEventListener('submit',event=>{event.preventDefault();if(!report)return;searched=key($('cmLookup').value);render();});
 $('cmRefresh').addEventListener('click',()=>load(true));
 setInterval(()=>{if(document.visibilityState==='visible'&&section.classList.contains('active'))load();},120000);
 const style=document.createElement('style');style.textContent=`body:has(#creditMemosSection.active) .filters{display:none!important}body:has(#creditMemosSection.active) #periodLabel{display:none}#creditMemosSection .cm-controls{margin-bottom:16px;padding:20px}.cm-filter-row{display:flex;align-items:end;gap:20px;flex-wrap:wrap}.cm-filter-row label{display:flex;flex:1 1 300px;max-width:520px;flex-direction:column;gap:8px;font-size:13px;font-weight:600}.cm-filter-row select{font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);width:100%}.cm-toggles{display:flex;gap:8px}.cm-toggles .active{background:#fff2ba!important;border-color:#e2ac00!important;color:#191919!important}.cm-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}.cm-summary>.card{padding:16px;min-width:0}.cm-summary span{display:block;font-size:12px;color:var(--muted);margin-bottom:8px}.cm-summary strong{font-size:clamp(16px,1.2vw,22px);white-space:nowrap}#cmStatus,.cm-note{font-size:12px;line-height:1.6;color:var(--muted);margin-top:14px}#cmTable{width:100%;table-layout:fixed;font-size:12px}#cmTable :is(th,td){padding:10px 6px;border:1px solid #abb3c0}#cmTable th{background:#fff2cc;color:#353020;font-size:11px;white-space:normal}#cmTable td:nth-child(n+6):nth-child(-n+9){text-align:right;white-space:nowrap}#cmTable td.cm-consumed{color:#a01791;background:#e1efda;font-weight:700}#cmTable td.cm-aging-alert{background:#ffe2e0!important;color:#b42318!important;font-weight:700}#cmTable td.cm-difference{background:#ffe2e0!important;color:#b42318!important;font-weight:700}#cmReconcile{padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:13px}.cm-mismatch-note{background:#fff0db;color:#874b00}.cm-matched-note{background:#e9f4ed;color:#24633a}html[data-theme=night] #cmTable th{background:#54461e;color:#ffe9a2}html[data-theme=night] #cmTable td.cm-consumed{background:#303f30;color:#ef9be3}html[data-theme=night] #cmTable td.cm-aging-alert,html[data-theme=night] #cmTable td.cm-difference{background:#592e32!important;color:#ffb4b4!important}html[data-theme=night] .cm-mismatch-note{background:#4c3923;color:#ffcf8a}html[data-theme=night] .cm-matched-note{background:#254430;color:#b6ebc6}@media(max-width:1100px){.cm-summary{grid-template-columns:repeat(2,minmax(0,1fr))}#cmTable{min-width:1120px}.cm-summary strong{font-size:18px}}`;
 style.textContent+=`#creditMemosSection [hidden]{display:none!important}.cm-toggles{flex-wrap:wrap}.cm-search-row{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-top:16px}.cm-search-row label{display:flex;flex-direction:column;gap:8px;flex:1 1 300px;max-width:520px;font-size:13px;font-weight:600}.cm-search-row input{font:inherit;width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text)}.cm-search-help,.cm-usage-intro{font-size:12px;line-height:1.6;color:var(--muted)}.cm-search-help{padding-bottom:10px}.cm-usage-intro{margin-bottom:12px}.cm-order-link,.cm-amount-link{border:0;padding:2px 0;background:none;color:var(--text);font:inherit;font-weight:600;text-align:left;text-decoration:underline;cursor:pointer;overflow-wrap:anywhere}.cm-order-link:focus-visible,.cm-amount-link:focus-visible{outline:2px solid #2874d0;outline-offset:3px}.cm-amount-link{white-space:nowrap;text-align:right}.cm-usage-table,.cm-order-table{width:100%;table-layout:fixed;font-size:12px}.cm-usage-table :is(th,td),.cm-order-table :is(th,td){padding:12px 10px;border:1px solid #abb3c0;overflow-wrap:anywhere}.cm-usage-table th:first-child{width:60%}.cm-date,.cm-amount{white-space:nowrap}.cm-amount{text-align:right}.cm-order-dialog{width:min(1180px,96vw);max-width:96vw;max-height:90dvh;overflow:auto;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:16px;padding:24px}.cm-order-dialog::backdrop{background:#0008}.cm-order-head{display:flex;align-items:start;justify-content:space-between;gap:16px}.cm-order-head h2{font-size:22px;overflow-wrap:anywhere;margin:0}.cm-order-dialog p{font-size:13px;line-height:1.6;color:var(--muted)}.cm-order-table th:nth-child(1),.cm-order-table th:nth-child(2){width:19%}.cm-order-table th:nth-child(3){width:28%}.cm-order-table th:nth-child(4){width:15%}.cm-order-table th:nth-child(5){width:19%}@media(max-width:700px){.cm-search-row label{max-width:none}.cm-order-dialog{padding:14px}.cm-order-table{min-width:680px}.cm-usage-table{min-width:420px}}`;
 document.head.append(style);
})();
