// Move the existing controls and card into a modal: no duplicate filters, IDs, or stale copies.
(()=>{
 let active=null;
 function resize(){requestAnimationFrame(()=>Object.values(state.charts).forEach(c=>c.resize()));}
 function close(){if(!active)return;const {dialog,moves,card,target,button,hidden,details,collapsed,scroll,canvasSizes}=active;active=null;
  // Restore compact canvas dimensions before returning it to a CSS grid.
  canvasSizes.forEach(({canvas,width,height})=>{canvas.style.width=width;canvas.style.height=height;});
  for(const [node,marker] of moves.reverse()){marker.replaceWith(node);}
  card.classList.remove('fullscreen-card');card.classList.toggle('chart-collapsed',collapsed);target.classList.remove('fullscreen-target');target.hidden=hidden;
  details.forEach(([node,open])=>node.open=open);dialog.close();dialog.remove();document.body.classList.remove('has-fullscreen');syncTrendMonthLock();resize();button.focus({preventScroll:true});
  window.scrollTo(scroll.x,scroll.y);
  requestAnimationFrame(()=>{if(active)return;window.scrollTo(scroll.x,scroll.y);requestAnimationFrame(()=>{if(!active)window.scrollTo(scroll.x,scroll.y);});});
 }
 function open(target,button){
  if(active)return;const card=target.closest('article')||target.parentElement,section=target.closest('.dashboard-section');
  const scroll={x:window.scrollX,y:window.scrollY};
  const canvasSizes=[...card.querySelectorAll('canvas')].map(canvas=>({canvas,width:canvas.style.width,height:canvas.style.height}));
  const dialog=document.createElement('dialog');dialog.className='dashboard-fullscreen';dialog.setAttribute('aria-label',button.getAttribute('aria-label').replace('Full screen: ','')+' full screen');
  const header=document.createElement('div');header.className='fullscreen-toolbar';const title=document.createElement('strong');title.textContent=dialog.getAttribute('aria-label');
  const exit=document.createElement('button');exit.className='secondary-btn panel-icon panel-close';exit.textContent='Close full screen';exit.setAttribute('aria-label','Close full screen');exit.title='Close full screen';exit.onclick=close;header.append(title,exit);dialog.append(header);section.append(dialog);
  const moves=[];function move(node){if(!node)return;const marker=document.createComment('fullscreen-position');node.before(marker);moves.push([node,marker]);dialog.append(node);}
  const details=[...card.querySelectorAll('details')].filter(node=>node.contains(target)).map(node=>[node,node.open]);details.forEach(([node])=>node.open=true);
  active={dialog,moves,card,target,button,scroll,canvasSizes,hidden:target.hidden,details,collapsed:card.classList.contains('chart-collapsed')};card.classList.remove('chart-collapsed');
  if(!['productivitySection','asmIncentivesSection','promoterIncentivesSection','creditMemosSection'].includes(section.id))move(document.querySelector('.filters'));
  const extra=section.querySelector('.push-controls,.asm-controls,.pi-controls,.cm-controls');if(extra)move(extra);
  move(card);target.hidden=false;target.classList.add('fullscreen-target');card.classList.add('fullscreen-card');
  document.body.classList.add('has-fullscreen');dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.showModal();syncTrendMonthLock();resize();exit.focus();
 }
 function prepare(){
  document.querySelectorAll('.dashboard-section .kpi-card').forEach(card=>{
   if(card.closest('#overviewSection'))return;
   if(card.querySelector('.kpi-panel-content'))return;
   const label=card.querySelector('.kpi-label');if(!label)return;
   const head=document.createElement('div');head.className='card-head kpi-panel-heading';
   const content=document.createElement('div');content.className='kpi-panel-content';content.id=(card.querySelector('[id]')?.id||'kpi'+[...document.querySelectorAll('.kpi-card')].indexOf(card))+'Panel';
   label.before(head);head.append(label);[...card.children].filter(node=>node!==head).forEach(node=>content.append(node));card.append(content);
  });
  document.querySelectorAll('.dashboard-section .table-wrap,.dashboard-section canvas,.dashboard-section .kpi-panel-content').forEach(target=>{
   if(target.dataset.fullscreenReady)return;target.dataset.fullscreenReady='true';
   const card=target.closest('article');if(!card)return;
   const body=target.querySelector('tbody');const heading=target.previousElementSibling?.matches('.card-head')?target.previousElementSibling:target.closest('details')?.querySelector('summary')||card.querySelector('.card-head');
   const title=target.querySelector('table')?.getAttribute('aria-label')||heading?.querySelector('h2,h3,.kpi-label')?.textContent||card.querySelector('h2')?.textContent||'Table';
   const button=document.createElement('button');button.type='button';button.className='secondary-btn fullscreen-button panel-icon panel-expand';button.textContent='Full screen';button.setAttribute('aria-label','Full screen: '+title);button.dataset.target=body?.id||target.id;
   button.onclick=event=>{event.preventDefault();event.stopPropagation();open(target,button);};
   if(heading)heading.append(button);else target.before(button);
   if(target.matches('canvas,.kpi-panel-content')&&heading){
    const toggle=document.createElement('button');toggle.type='button';toggle.className='secondary-btn panel-icon panel-collapse';toggle.setAttribute('aria-controls',target.id);
    let hidden=false;try{hidden=localStorage.getItem('wvis.chartHidden.'+target.id)==='true';}catch{}
    function apply(){target.hidden=hidden;card.classList.toggle('chart-collapsed',hidden);toggle.setAttribute('aria-expanded',String(!hidden));toggle.setAttribute('aria-label',(hidden?'Show ':'Hide ')+title);toggle.title=(hidden?'Show ':'Hide ')+title;syncTrendMonthLock();}
    toggle.onclick=()=>{hidden=!hidden;try{localStorage.setItem('wvis.chartHidden.'+target.id,String(hidden));}catch{}apply();resize();};heading.insertBefore(toggle,button);apply();
   }
  });
  document.querySelectorAll('button[aria-expanded][aria-controls]').forEach(button=>{
   if(!button.id.startsWith('overviewCharts')&&!document.getElementById(button.getAttribute('aria-controls'))?.matches('.table-wrap,canvas,.kpi-panel-content'))return;
   if(!button.classList.contains('panel-icon'))button.classList.add('panel-icon','panel-collapse');
   const label=button.getAttribute('aria-label')||button.textContent;
   if(button.title!==label)button.title=label;
  });
  document.querySelectorAll('.panel-expand').forEach(button=>{const title=button.getAttribute('aria-label');if(button.title!==title)button.title=title;});
  document.querySelectorAll('.card-head,summary.table-visibility-summary').forEach(heading=>{
   const buttons=[...heading.children].filter(node=>node.matches('button.panel-icon'));
   if(!buttons.length)return;
   let controls=heading.querySelector(':scope > .panel-window-controls');
   if(!controls){controls=document.createElement('span');controls.className='panel-window-controls';heading.append(controls);}
   buttons.sort((a,b)=>Number(a.classList.contains('panel-expand'))-Number(b.classList.contains('panel-expand'))).forEach(button=>controls.append(button));
  });
 }
 document.addEventListener('DOMContentLoaded',()=>{prepare();const observer=new MutationObserver(()=>prepare());observer.observe(document.querySelector('.main'),{childList:true,subtree:true});});
 const style=document.createElement('style');style.textContent=`
 .dashboard-section .grid-2>*,.dashboard-section .grid-3>*{min-width:0}.dashboard-section .chart-card canvas{max-width:100%}
 .panel-window-controls{display:inline-flex;align-items:center;gap:4px;margin-left:auto;flex-shrink:0}.table-visibility-summary>.panel-window-controls{float:right}
 button.panel-icon{position:relative;display:inline-grid;place-items:center;width:var(--panel-icon-size,18px);height:var(--panel-icon-size,18px);min-width:var(--panel-icon-size,18px);border-radius:50%;padding:0!important;margin:0!important;font-size:0!important;line-height:1;border:1px solid rgba(0,0,0,.14);box-shadow:none;cursor:pointer}
 button.panel-icon:focus-visible{outline:3px solid #2563eb;outline-offset:4px}button.panel-icon:hover{filter:brightness(.94)}
 button.panel-collapse,button.panel-expand{display:inline-flex;align-items:center;justify-content:center;width:auto;height:auto;min-width:0;min-height:20px;border:1px solid #e2e5e9;border-radius:4px;padding:3px 6px!important;background:#fff!important;color:#636975!important;line-height:1.2;font-weight:500;white-space:nowrap}
 button.panel-collapse::after,button.panel-expand::after{font:500 11px/1.2 Montserrat,Arial,sans-serif}
 button.panel-collapse::after{content:'Hide'}button.panel-collapse[aria-expanded="false"]::after{content:'Show'}button.panel-expand::after{content:'Expand'}
 button.panel-collapse:hover,button.panel-expand:hover{background:#f4f5f7!important;color:#222!important;filter:none}
 button.panel-close{--panel-icon-size:22px;background:#ff5f57!important;color:#85150e!important}button.panel-close::after{content:'×';font:400 calc(var(--panel-icon-size,18px) * 1.04) Arial}
 .kpi-panel-heading{gap:10px;margin-bottom:0}.kpi-panel-heading .kpi-label{flex:1}.kpi-panel-heading .panel-window-controls{gap:4px}.fullscreen-card.kpi-card .kpi-value{font-size:clamp(36px,8vw,90px)}
 .chart-card.chart-collapsed{min-height:0!important;align-self:start}.chart-collapsed>canvas,.chart-collapsed>.chart-view-controls,.chart-collapsed>.trend-period,.chart-collapsed>.kpi-panel-content{display:none!important}.chart-collapsed>.card-head{margin-bottom:0}
 .fullscreen-button{white-space:nowrap}.has-fullscreen{overflow:hidden}
 dialog.dashboard-fullscreen{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;border:0;padding:20px;background:#f5f6f8;color:#17191c;overflow:auto;box-sizing:border-box}
 .dashboard-fullscreen::backdrop{background:#f5f6f8}.fullscreen-toolbar{position:sticky;top:-20px;z-index:5;background:#f5f6f8;padding:10px 0;display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.dashboard-fullscreen .filters{position:relative;margin-bottom:16px}.fullscreen-card{width:100%;box-sizing:border-box}.fullscreen-card .fullscreen-button,.fullscreen-card button[aria-expanded]{display:none}.fullscreen-card .table-wrap:not(.fullscreen-target){display:none!important}.fullscreen-card .table-cohort-heading{display:none}.fullscreen-card .fullscreen-target{display:block!important}.fullscreen-card.chart-card{min-height:65vh}.fullscreen-card canvas.fullscreen-target{max-height:none!important;height:45vh!important;width:100%!important}.dashboard-fullscreen .table-wrap{max-height:calc(100dvh - 285px)}.dashboard-fullscreen th{position:sticky;top:0}.dashboard-fullscreen .card-head{gap:12px}
 @media(max-width:700px){dialog.dashboard-fullscreen{padding:10px}.dashboard-fullscreen .filters{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard-fullscreen .table-wrap{max-height:65vh}}
 `;document.head.append(style);
})();

// A device-local reading layout. Keep the original cells, controls and handlers intact.
(()=>{
 const root=document.documentElement,media=matchMedia('(max-width:760px)'),preferenceKey='wvis.mobileView';
 const tableControls=new WeakMap(),tableLayouts=new WeakMap(),frameWidths=new WeakMap();let preference=null,queued=false,toggle,menu;
 const frameObserver=new ResizeObserver(entries=>{for(const entry of entries){const width=entry.contentRect.width;if(frameWidths.get(entry.target)!==width){frameWidths.set(entry.target,width);schedule();}}});
 try{const saved=localStorage.getItem(preferenceKey);if(saved==='true'||saved==='false')preference=saved==='true';}catch{}
 function enabled(){return preference===null?media.matches:preference;}
 function cleanLabel(cell){return (cell.querySelector('.table-sort-button')?.getAttribute('aria-label')?.replace(/^Sort by /,'')||cell.textContent).replace(/[↕↑↓]/g,'').replace(/\s+/g,' ').trim();}
 function columnsFor(table){
  const grid=[];
  [...table.tHead.rows].forEach((row,r)=>{
   grid[r]??=[];let c=0;
   [...row.cells].forEach(cell=>{
    while(grid[r][c])c++;
    for(let y=r;y<r+cell.rowSpan;y++){grid[y]??=[];for(let x=c;x<c+cell.colSpan;x++)grid[y][x]=cell;}
    c+=cell.colSpan;
   });
  });
  return Array.from({length:Math.max(0,...grid.map(row=>row.length))},(_,c)=>{
   const headers=[...new Set(grid.map(row=>row[c]).filter(Boolean))];
   return {label:headers.map(cleanLabel).filter(Boolean).join(' · '),header:headers.at(-1)};
  });
 }
 function fitTable(table,layout,columns){
  // Leave the scrollable layout before measuring so its scrollbar cannot affect the fit.
  layout.frame.classList.toggle('mobile-table-actual',layout.actual);
  if(!layout.actual){layout.frame.scrollLeft=0;layout.frame.scrollTop=0;}
  const available=layout.frame.clientWidth;if(!available)return;
  // Preserve all columns and fit the existing table without duplicating data or event handlers.
  const naturalWidth=Math.max(available,table.classList.contains('inv-dealer-table')?1100:columns*88+80);
  table.style.setProperty('--mobile-table-width',naturalWidth+'px');
  const width=Math.max(table.offsetWidth,table.scrollWidth),scale=layout.actual?1:Math.min(1,available/width);
  table.style.setProperty('--mobile-table-scale',String(scale));
  layout.frame.style.setProperty('--mobile-table-height',Math.ceil(table.offsetHeight*scale)+'px');
 }
 function prepareTable(table){
  if(!table.tHead||!table.tBodies.length||table.closest('.pi-scheme'))return;
  const columns=columnsFor(table);if(!columns.length)return;
  table.classList.add('mobile-fit-table');
  let layout=tableLayouts.get(table);
  if(!layout||table.parentElement!==layout.frame){
   const frame=document.createElement('div');frame.className='mobile-table-frame';table.before(frame);frame.append(table);
   layout={frame,actual:false};tableLayouts.set(table,layout);
  }
  const sortable=columns.map((column,index)=>({...column,index,button:column.header?.querySelector('.table-sort-button')})).filter(column=>column.button&&column.header.colSpan===1);
  let controls=tableControls.get(table);
  if(!controls){
   const bar=document.createElement('div');bar.className='mobile-table-sort';
   const label=document.createElement('label');label.append('Sort by ');
   const select=document.createElement('select');label.append(select);
   const direction=document.createElement('button');direction.type='button';direction.className='secondary-btn';
   const fit=document.createElement('button');fit.type='button';fit.className='secondary-btn';fit.textContent='Fit width';
   const actual=document.createElement('button');actual.type='button';actual.className='secondary-btn';actual.textContent='Larger text';
   bar.append(label,direction,fit,actual);layout.frame.before(bar);controls={bar,label,select,direction,fit,actual,signature:'',sortable:[]};tableControls.set(table,controls);
   fit.addEventListener('click',()=>{tableLayouts.get(table).actual=false;schedule();});
   actual.addEventListener('click',()=>{tableLayouts.get(table).actual=true;schedule();});
   select.addEventListener('change',()=>{controls.sortable.find(column=>String(column.index)===select.value)?.button.click();schedule();});
   direction.addEventListener('click',()=>{controls.sortable.find(column=>String(column.index)===select.value)?.button.click();schedule();});
  }
  controls.sortable=sortable;controls.label.hidden=!sortable.length;controls.direction.hidden=!sortable.length;
  controls.fit.setAttribute('aria-pressed',String(!layout.actual));controls.actual.setAttribute('aria-pressed',String(layout.actual));
  fitTable(table,layout,columns.length);
  const signature=JSON.stringify(sortable.map(({label,index})=>[label,index]));
  if(signature!==controls.signature){
   controls.select.replaceChildren(new Option('Choose column',''),...sortable.map(column=>new Option(column.label,String(column.index))));controls.signature=signature;
  }
  const selected=sortable.find(column=>['ascending','descending'].includes(column.header.getAttribute('aria-sort')));
  controls.select.value=selected?String(selected.index):'';
  controls.direction.disabled=!selected;
  const descending=selected?.header.getAttribute('aria-sort')==='descending',text=descending?'↓ Descending':'↑ Ascending';
  if(controls.direction.textContent!==text)controls.direction.textContent=text;
  controls.direction.setAttribute('aria-label',selected?'Reverse sort order for '+selected.label:'Choose a column to sort');
 }
 function prepare(){queued=false;frameObserver.disconnect();if(!enabled())return;document.querySelectorAll('.main table,dialog table').forEach(table=>{prepareTable(table);const layout=tableLayouts.get(table);if(layout)frameObserver.observe(layout.frame);});}
 function schedule(){if(!enabled()||queued)return;queued=true;requestAnimationFrame(prepare);}
 function closeMenu(){root.removeAttribute('data-mobile-menu');menu?.setAttribute('aria-expanded','false');}
 function apply(){
  const mobile=enabled();root.toggleAttribute('data-mobile-view',mobile);toggle?.setAttribute('aria-pressed',String(mobile));closeMenu();
  if(mobile)schedule();else frameObserver.disconnect();
  // Chart.js listens for resize; the CSS now has the final available width.
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
 }
 function start(){
  const actions=document.querySelector('.top-actions');if(!actions)return;
  toggle=document.createElement('button');toggle.id='mobileViewToggle';toggle.type='button';toggle.className='secondary-btn';toggle.textContent='Mobile view';toggle.title='Fit filters, tables and pop-ups to this screen';
  toggle.addEventListener('click',()=>{preference=!enabled();try{localStorage.setItem(preferenceKey,String(preference));}catch{}apply();});actions.prepend(toggle);
  const sidebar=document.querySelector('.sidebar');
  if(sidebar){
   menu=document.createElement('button');menu.id='mobileNavToggle';menu.type='button';menu.className='secondary-btn';menu.textContent='☰ Menu';menu.setAttribute('aria-expanded','false');
   const navs=[...sidebar.querySelectorAll('.nav,.sidebar-secondary-nav')];navs.forEach((nav,i)=>{if(!nav.id)nav.id='mobileNavigation'+i;});menu.setAttribute('aria-controls',navs.map(nav=>nav.id).join(' '));
   sidebar.querySelector('.brand')?.after(menu);
   menu.addEventListener('click',()=>{const open=!root.hasAttribute('data-mobile-menu');root.toggleAttribute('data-mobile-menu',open);menu.setAttribute('aria-expanded',String(open));});
   sidebar.addEventListener('click',event=>{if(event.target.closest('.nav-item'))closeMenu();});
   sidebar.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenu();menu.focus();}});
  }
  apply();media.addEventListener('change',()=>{if(preference===null)apply();});
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});
  // Tab changes, expanded cards, open dialogs and device rotation can change available width.
  document.addEventListener('click',schedule);document.addEventListener('change',schedule);document.addEventListener('toggle',schedule,true);window.addEventListener('resize',schedule);window.addEventListener('orientationchange',schedule);window.visualViewport?.addEventListener('resize',schedule);
  document.fonts?.ready.then(schedule);
 }
 const style=document.createElement('style');style.textContent=`
 #mobileNavToggle,.mobile-table-sort{display:none}
 #mobileViewToggle[aria-pressed="true"]{background:#fff3bf;border-color:#efb900;color:#17191c}
 html[data-mobile-view] .app-shell{display:block;min-width:0;width:100%}
 html[data-mobile-view] .sidebar{position:relative;width:100%;height:auto;min-height:0;padding:12px 16px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;overflow:visible}
 html[data-mobile-view] .sidebar .brand{margin:0;min-width:0;gap:10px}
 html[data-mobile-view] .sidebar .brand-mark{width:36px;height:36px;font-size:22px;flex-shrink:0}
 html[data-mobile-view] .sidebar .brand-name{font-size:16px}
 html[data-mobile-view] #mobileNavToggle{display:block;align-self:center;min-height:42px}
 html[data-mobile-view] .sidebar .nav,html[data-mobile-view] .sidebar .sidebar-secondary-nav,html[data-mobile-view] .sidebar .sidebar-foot{display:none}
 html[data-mobile-view][data-mobile-menu] .sidebar .nav,html[data-mobile-view][data-mobile-menu] .sidebar .sidebar-secondary-nav{display:grid;grid-column:1/-1;grid-template-columns:repeat(2,minmax(0,1fr));width:100%;padding:0;margin:0;gap:6px;overflow:visible}
 html[data-mobile-view] .sidebar .nav-item{white-space:normal;overflow-wrap:anywhere;text-align:left;min-width:0;padding:12px;font-size:14px}
 html[data-mobile-view] .main{width:100%;min-width:0;padding:16px 12px}
 html[data-mobile-view] .topbar{display:flex;flex-direction:column;align-items:stretch;gap:14px}
 html[data-mobile-view] h1{font-size:26px;overflow-wrap:anywhere}
 html[data-mobile-view] .top-actions{justify-content:flex-start;flex-wrap:wrap;gap:8px;min-width:0}
 html[data-mobile-view] .top-actions button{min-height:42px;padding:10px 12px}
 html[data-mobile-view] .updated-box{width:100%;text-align:left;align-items:flex-start;order:5}
 html[data-mobile-view] .filters,html[data-mobile-view] .pi-controls,html[data-mobile-view] .productivity-controls,html[data-mobile-view] .asm-controls{grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:12px}
 html[data-mobile-view] .filters>*,html[data-mobile-view] .pi-controls>*,html[data-mobile-view] .productivity-controls>*{min-width:0}
 html[data-mobile-view] .main select,html[data-mobile-view] dialog select,html[data-mobile-view] .main input:not([type="checkbox"]):not([type="radio"]),html[data-mobile-view] dialog input:not([type="checkbox"]):not([type="radio"]){max-width:100%;min-width:0;box-sizing:border-box;font-size:16px}
 html[data-mobile-view] .filters select,html[data-mobile-view] .pi-controls select,html[data-mobile-view] .pi-controls input,html[data-mobile-view] .productivity-controls select,html[data-mobile-view] .productivity-controls input{width:100%;min-height:42px}
 html[data-mobile-view] .grid-2,html[data-mobile-view] .grid-3,html[data-mobile-view] .upload-grid,html[data-mobile-view] .mix-layout{grid-template-columns:minmax(0,1fr)}
 html[data-mobile-view] .kpi-grid,html[data-mobile-view] .kpi-grid.four,html[data-mobile-view] .pi-kpis,html[data-mobile-view] .zero-kpis,html[data-mobile-view] .source-summary{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
 html[data-mobile-view] .kpi-card{padding:14px;min-width:0}
 html[data-mobile-view] .kpi-value{font-size:clamp(20px,4.8vw,30px);overflow-wrap:anywhere}
 html[data-mobile-view] .card{padding:14px;min-width:0;max-width:100%;box-sizing:border-box}
 html[data-mobile-view] .card-head{flex-wrap:wrap;gap:8px}
 html[data-mobile-view] .card-head h2,html[data-mobile-view] .card-head h3{font-size:18px;min-width:0;overflow-wrap:anywhere}
 html[data-mobile-view] .main canvas{max-width:100%}
 html[data-mobile-view] .chart-view-controls,html[data-mobile-view] .push-controls,html[data-mobile-view] .zero-toggle-row,html[data-mobile-view] .entity-detail-head,html[data-mobile-view] .entity-detail-kpis{flex-wrap:wrap;gap:8px;min-width:0}
 html[data-mobile-view] .push-controls select{margin:8px 0 0;max-width:100%}
 html[data-mobile-view] .table-wrap{min-width:0;max-width:100%;max-height:none!important;overflow:visible;border:0}
 html[data-mobile-view] .mobile-table-sort:not([hidden]){display:flex;align-items:end;flex-wrap:wrap;gap:8px;padding:8px 0 12px}
 html[data-mobile-view] .mobile-table-sort label{flex:1 1 180px;min-width:0;font-size:12px;font-weight:600}
 html[data-mobile-view] .mobile-table-sort select{display:block;width:100%;margin-top:5px;padding:10px;border:1px solid #c9ced8;border-radius:8px;background:var(--card,#fff);color:inherit}
 html[data-mobile-view] .mobile-table-sort button{min-height:42px}
 .mobile-table-frame{display:contents}
 html[data-mobile-view] .mobile-table-frame{display:block;position:relative;width:100%;max-width:100%;height:var(--mobile-table-height,auto);overflow:hidden;overflow:clip;scroll-behavior:auto}
 html[data-mobile-view] .mobile-table-frame.mobile-table-actual{overflow:auto;max-height:70dvh}
 html[data-mobile-view] .mobile-table-sort button[aria-pressed="true"]{background:#fff3bf;border-color:#efb900;color:#17191c}
 html[data-mobile-view] table.mobile-fit-table{display:table!important;position:relative;width:var(--mobile-table-width,100%)!important;min-width:0!important;max-width:none!important;table-layout:auto!important;transform:scale(var(--mobile-table-scale,1));transform-origin:top left;font-size:12px!important}
 html[data-mobile-view] table.mobile-fit-table>colgroup{display:table-column-group!important}
 html[data-mobile-view] table.mobile-fit-table>thead{display:table-header-group!important;position:static!important;width:auto!important;height:auto!important;overflow:visible!important;clip-path:none!important;white-space:normal!important}
 html[data-mobile-view] table.mobile-fit-table>tbody{display:table-row-group!important}
 html[data-mobile-view] table.mobile-fit-table>tfoot{display:table-footer-group!important}
 html[data-mobile-view] table.mobile-fit-table tr{display:table-row!important;width:auto!important;margin:0!important;overflow:visible!important}
 html[data-mobile-view] table.mobile-fit-table :is(th,td){display:table-cell!important;position:static!important;min-width:0!important;max-width:none!important;width:auto!important;padding:8px 6px!important;font-size:12px!important;line-height:1.4!important;white-space:normal!important;overflow-wrap:anywhere!important;border:1px solid var(--line,#d8dce2)}
 html[data-mobile-view] table.mobile-fit-table thead th{font-size:10px!important;text-align:center!important}
 html[data-mobile-view] table.mobile-fit-table tbody tr>:first-child{min-width:125px!important;max-width:190px!important}
 html[data-mobile-view] table.mobile-fit-table :is(td,th)::before{display:none!important}
 html[data-mobile-view] table.mobile-fit-table .numeric-nowrap{white-space:nowrap!important;overflow-wrap:normal!important}
 html[data-mobile-view] table.mobile-fit-table button{font:inherit}
 html[data-mobile-view] table.mobile-fit-table small{font-size:10px!important}
 html[data-mobile-view] dialog{box-sizing:border-box;width:calc(100% - 16px)!important;max-width:calc(100% - 16px)!important;min-width:0!important;padding:14px!important;max-height:calc(100dvh - 16px)!important;overflow:auto}
 html[data-mobile-view] dialog header,html[data-mobile-view] .fullscreen-toolbar{flex-wrap:wrap;gap:10px}
 html[data-mobile-view] dialog h2,html[data-mobile-view] dialog h3{font-size:20px;overflow-wrap:anywhere}
 html[data-mobile-view] dialog.dashboard-fullscreen{width:100%!important;max-width:100%!important;height:100dvh;max-height:100dvh!important}
 html[data-mobile-view] .fullscreen-toolbar{top:-14px}
 html[data-mobile-view] .pi-scheme{padding:14px}
 html[data-mobile-view] .pi-scheme-grid{grid-template-columns:minmax(0,1fr)}
 html[data-mobile-view] .pi-scheme-grid>div+div{border-left:0;border-top:1px solid var(--line);padding:12px 0 0}
 @media(max-width:360px){html[data-mobile-view] .kpi-grid,html[data-mobile-view] .kpi-grid.four,html[data-mobile-view] .pi-kpis,html[data-mobile-view] .zero-kpis{grid-template-columns:minmax(0,1fr)}}
 `;document.head.append(style);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
