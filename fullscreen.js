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
  if(section.id!=='productivitySection')move(document.querySelector('.filters'));
  const extra=section.querySelector('.push-controls');if(extra)move(extra);
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
