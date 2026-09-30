(()=>{
 'use strict';
 const account=window.dashboardAccount;
 if(!account||(account.role!=='admin'&&account.credit_memos!==true))return;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=value=>value===null?'—':new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(value/100);
 let report=null,view='available',selected='',loading=false;
 const tab=document.createElement('button');tab.className='nav-item';tab.dataset.section='creditMemos';tab.textContent='Credit Memos';
 document.querySelector('.nav').append(tab);
 const section=document.createElement('section');section.id='creditMemosSection';section.className='dashboard-section';
 section.innerHTML=`<article class="card cm-controls"><div class="card-head"><h2>Dealer Credit Memos</h2><button class="secondary-btn" id="cmRefresh">Refresh CMs</button></div><div class="cm-filter-row"><label for="cmDealer">Customer Name · NonNKA<select id="cmDealer" disabled><option value="">Loading customers…</option></select></label><div class="cm-toggles" role="group" aria-label="Credit memo view"><button class="secondary-btn active" type="button" data-cm-view="available" aria-pressed="true">Available CMs</button><button class="secondary-btn" type="button" data-cm-view="issued" aria-pressed="false">Issued CMs</button></div></div><div id="cmStatus" role="status">Select the tab to load credit memos.</div></article><div id="cmSummary" class="cm-summary"></div><article class="card table-card cm-table-card"><div class="card-head"><h2 id="cmTableTitle">Available CMs</h2></div><div id="cmReconcile" role="status"></div><div class="table-wrap"><table id="cmTable" aria-label="Dealer Credit Memos"><colgroup><col style="width:11%"><col style="width:14%"><col style="width:21%"><col style="width:5%"><col style="width:8%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:5%"></colgroup><thead><tr><th>Owner</th><th>AR No.</th><th>Description</th><th>Aging Days</th><th>Remarks</th><th>Issued Amount</th><th>Used Amount</th><th>Remaining</th><th>Available</th><th>Remarks</th></tr></thead><tbody id="cmBody"><tr><td colspan="10">Choose a customer to view credit memos.</td></tr></tbody><tfoot id="cmTotals"></tfoot></table></div><div class="cm-note">Remaining = Issued Amount + signed Used Amount. Available comes from INPUT AVAILABLE → AmountLeft; CMs absent from that list show ₱0.00. Differences and missing amounts are highlighted for review. — means a source amount is missing; affected totals also show —. Available CMs shows only CMs listed in INPUT AVAILABLE; Issued CMs shows all records from INPUT ISSUED. Aging uses INPUT AVAILABLE → UPDATED AGING DAYS for listed CMs; other issued CMs use INPUT ISSUED → Aging. Aging of 83 days or more is highlighted red.</div></article>`;
 document.querySelector('main').append(section);
 const $=id=>document.getElementById(id);
 const select=$('cmDealer'),status=$('cmStatus');
 function activate(){document.querySelectorAll('.nav-item,.dashboard-section').forEach(n=>n.classList.remove('active'));tab.classList.add('active');section.classList.add('active');$('pageTitle').textContent='Credit Memos';if(!report)load();}
 tab.addEventListener('click',activate);
 function render(){
  if(!report)return;
  const dealer=report.dealers.find(d=>d.id===selected),all=report.rows.filter(r=>r.dealerId===selected),rows=view==='available'?all.filter(r=>r.availableListed):all;
  const totals=rows.reduce((t,r)=>{for(const k of Object.keys(t))t[k]=t[k]===null||r[k]===null?null:t[k]+r[k];return t;},{issuedCents:0,usedCents:0,remainingCents:0,availableCents:0});
  const mismatches=rows.filter(r=>r.differenceCents!==0).length;
  $('cmTableTitle').textContent=(view==='available'?'Available CMs':'Issued CMs')+(dealer?' · '+dealer.name:'');
  $('cmSummary').innerHTML=[['CMs shown',String(rows.length)],['Issued Amount',money(totals.issuedCents)],['Used Amount',money(totals.usedCents)],['Remaining',money(totals.remainingCents)],['Available',money(totals.availableCents)]].map(([label,value])=>'<div class="card"><span>'+label+'</span><strong>'+value+'</strong></div>').join('');
  const notice=$('cmReconcile');notice.className=mismatches?'cm-mismatch-note':'cm-matched-note';
  notice.textContent=!selected?'Choose a customer to see their balances.':!rows.length?'No '+(view==='available'?'available':'issued')+' CMs for this customer.':mismatches?mismatches+' CM'+(mismatches===1?'':'s')+' need review: balances differ or source amounts are missing.':'Balances match: Remaining equals Available for every CM shown.';
  $('cmBody').innerHTML=rows.length?rows.map(r=>{
   const difference=r.differenceCents!==0,tip=r.differenceCents===null?'A source amount is missing; balance cannot be verified.':difference?'Remaining − Available: '+money(r.differenceCents):'Remaining equals Available';
   return '<tr><td>'+escape(r.owner)+'</td><td>'+escape(r.arNo)+'</td><td>'+escape(r.description)+'</td><td'+(r.aging!==null&&r.aging>=83?' class="cm-aging-alert"':'')+' data-sort-value="'+(r.aging??'')+'">'+(r.aging??'—')+'</td><td class="'+(r.status?'cm-consumed':'')+'">'+r.status+'</td>'+['issuedCents','usedCents','remainingCents','availableCents'].map(k=>'<td data-sort-value="'+(r[k]??'')+'"'+((k==='remainingCents'||k==='availableCents')?' class="'+(difference?'cm-difference':'')+'" title="'+escape(tip)+'"':'')+'>'+money(r[k])+'</td>').join('')+'<td></td></tr>';
  }).join(''):'<tr><td colspan="10">'+(!selected?'Choose a customer to view credit memos.':'No '+(view==='available'?'available':'issued')+' CMs found.')+'</td></tr>';
  $('cmTotals').innerHTML=rows.length?'<tr><th colspan="5">Total · '+rows.length+' CMs</th>'+Object.values(totals).map(n=>'<td>'+money(n)+'</td>').join('')+'<td></td></tr>':'';
  section.querySelectorAll('[data-cm-view]').forEach(button=>{const active=button.dataset.cmView===view;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  if(typeof refreshTableSorting==='function')refreshTableSorting();
 }
 async function load(force=false){
  if(loading)return;loading=true;$('cmRefresh').disabled=true;status.textContent='Loading CM source sheets…';
  try{
   const response=await fetch('/api/gateway?op=credit-memos'+(force?'&refresh=1':''),{cache:'no-store'});
   const data=await response.json();
   if(!response.ok){if(response.status===401||response.status===403){report=null;select.disabled=true;select.innerHTML='<option value="">Access unavailable</option>';$('cmBody').innerHTML='<tr><td colspan="10">Credit Memo access is not available for this account.</td></tr>';$('cmTotals').innerHTML='';$('cmSummary').innerHTML='';$('cmReconcile').textContent='';}throw new Error(data.error||'Could not load credit memos.');}
   report=data;
   select.innerHTML='<option value="">Choose a customer</option>'+data.dealers.map(d=>'<option value="'+escape(d.id)+'">'+escape(d.name)+'</option>').join('');
   if(!data.dealers.some(d=>d.id===selected))selected='';select.value=selected;select.disabled=false;
   const dates=data.sourceDates;
   status.textContent='Checked '+new Date(data.checkedAt).toLocaleString()+' · Source updates — Issued: '+(dates.issued||'not provided')+' · Used: '+(dates.used||'not provided')+' · Available: '+(dates.available||'not provided')+'.';
   status.textContent+=' Choices use INPUT ISSUED → Customer Name. Known NKA dealers are excluded.';
   if(data.diagnostics.availableWithoutIssued)status.textContent+=' '+data.diagnostics.availableWithoutIssued+' available CM(s) have no matching issued record and need source review.';
   render();
  }catch(e){status.textContent=(report?'Refresh failed. Showing the previously checked data. ':'')+e.message;}finally{loading=false;$('cmRefresh').disabled=false;}
 }
 select.addEventListener('change',()=>{selected=select.value;render();});
 section.addEventListener('click',event=>{const button=event.target.closest('[data-cm-view]');if(button){view=button.dataset.cmView;render();}});
 $('cmRefresh').addEventListener('click',()=>load(true));
 setInterval(()=>{if(document.visibilityState==='visible'&&section.classList.contains('active'))load();},120000);
 const style=document.createElement('style');style.textContent=`body:has(#creditMemosSection.active) .filters{display:none!important}body:has(#creditMemosSection.active) #periodLabel{display:none}#creditMemosSection .cm-controls{margin-bottom:16px;padding:20px}.cm-filter-row{display:flex;align-items:end;gap:20px;flex-wrap:wrap}.cm-filter-row label{display:flex;flex:1 1 300px;max-width:520px;flex-direction:column;gap:8px;font-size:13px;font-weight:600}.cm-filter-row select{font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);width:100%}.cm-toggles{display:flex;gap:8px}.cm-toggles .active{background:#fff2ba!important;border-color:#e2ac00!important;color:#191919!important}.cm-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}.cm-summary>.card{padding:16px;min-width:0}.cm-summary span{display:block;font-size:12px;color:var(--muted);margin-bottom:8px}.cm-summary strong{font-size:clamp(16px,1.2vw,22px);white-space:nowrap}#cmStatus,.cm-note{font-size:12px;line-height:1.6;color:var(--muted);margin-top:14px}#cmTable{width:100%;table-layout:fixed;font-size:12px}#cmTable :is(th,td){padding:10px 6px;border:1px solid #abb3c0}#cmTable th{background:#fff2cc;color:#353020;font-size:11px;white-space:normal}#cmTable td:nth-child(n+6):nth-child(-n+9){text-align:right;white-space:nowrap}#cmTable td.cm-consumed{color:#a01791;background:#e1efda;font-weight:700}#cmTable td.cm-aging-alert{background:#ffe2e0!important;color:#b42318!important;font-weight:700}#cmTable td.cm-difference{background:#ffe2e0!important;color:#b42318!important;font-weight:700}#cmReconcile{padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:13px}.cm-mismatch-note{background:#fff0db;color:#874b00}.cm-matched-note{background:#e9f4ed;color:#24633a}html[data-theme=night] #cmTable th{background:#54461e;color:#ffe9a2}html[data-theme=night] #cmTable td.cm-consumed{background:#303f30;color:#ef9be3}html[data-theme=night] #cmTable td.cm-aging-alert,html[data-theme=night] #cmTable td.cm-difference{background:#592e32!important;color:#ffb4b4!important}html[data-theme=night] .cm-mismatch-note{background:#4c3923;color:#ffcf8a}html[data-theme=night] .cm-matched-note{background:#254430;color:#b6ebc6}@media(max-width:1100px){.cm-summary{grid-template-columns:repeat(2,minmax(0,1fr))}#cmTable{min-width:1120px}.cm-summary strong{font-size:18px}}`;
 document.head.append(style);
})();
