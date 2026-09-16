// Move the existing controls and card into a modal: no duplicate filters, IDs, or stale copies.
(()=>{
 let active=null;
 function resize(){requestAnimationFrame(()=>Object.values(state.charts).forEach(c=>c.resize()));}
 function close(){if(!active)return;const {dialog,moves,card,target,button,hidden,details}=active;active=null;
  for(const [node,marker] of moves.reverse()){marker.replaceWith(node);}
  card.classList.remove('fullscreen-card');target.classList.remove('fullscreen-target');target.hidden=hidden;
  details.forEach(([node,open])=>node.open=open);dialog.close();dialog.remove();document.body.classList.remove('has-fullscreen');syncTrendMonthLock();resize();button.focus();
 }
 function open(target,button){
  if(active)return;const card=target.closest('article')||target.parentElement,section=target.closest('.dashboard-section');
  const dialog=document.createElement('dialog');dialog.className='dashboard-fullscreen';dialog.setAttribute('aria-label',button.getAttribute('aria-label').replace('Full screen: ','')+' full screen');
  const header=document.createElement('div');header.className='fullscreen-toolbar';const title=document.createElement('strong');title.textContent=dialog.getAttribute('aria-label');
  const exit=document.createElement('button');exit.className='secondary-btn';exit.textContent='Close full screen';exit.onclick=close;header.append(title,exit);dialog.append(header);section.append(dialog);
  const moves=[];function move(node){if(!node)return;const marker=document.createComment('fullscreen-position');node.before(marker);moves.push([node,marker]);dialog.append(node);}
  const details=[...card.querySelectorAll('details')].filter(node=>node.contains(target)).map(node=>[node,node.open]);details.forEach(([node])=>node.open=true);
  active={dialog,moves,card,target,button,hidden:target.hidden,details};
  if(section.id!=='productivitySection')move(document.querySelector('.filters'));
  const extra=section.querySelector('.push-controls');if(extra)move(extra);
  move(card);target.hidden=false;target.classList.add('fullscreen-target');card.classList.add('fullscreen-card');
  document.body.classList.add('has-fullscreen');dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.showModal();syncTrendMonthLock();resize();exit.focus();
 }
 function prepare(){
  document.querySelectorAll('.dashboard-section .table-wrap,.dashboard-section canvas').forEach(target=>{
   if(target.dataset.fullscreenReady)return;target.dataset.fullscreenReady='true';
   const card=target.closest('article');if(!card)return;
   const body=target.querySelector('tbody');const heading=target.previousElementSibling?.matches('.card-head')?target.previousElementSibling:target.closest('details')?.querySelector('summary')||card.querySelector('.card-head');
   const title=target.querySelector('table')?.getAttribute('aria-label')||heading?.querySelector('h2,h3')?.textContent||card.querySelector('h2')?.textContent||'Table';
   const button=document.createElement('button');button.type='button';button.className='secondary-btn fullscreen-button';button.textContent='Full screen';button.setAttribute('aria-label','Full screen: '+title);button.dataset.target=body?.id||target.id;
   button.onclick=event=>{event.preventDefault();event.stopPropagation();open(target,button);};
   if(heading)heading.append(button);else target.before(button);
  });
 }
 document.addEventListener('DOMContentLoaded',()=>{prepare();const observer=new MutationObserver(()=>prepare());observer.observe(document.querySelector('.main'),{childList:true,subtree:true});});
 const style=document.createElement('style');style.textContent=`
 .fullscreen-button{font-size:11px;white-space:nowrap}.has-fullscreen{overflow:hidden}
 dialog.dashboard-fullscreen{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;border:0;padding:20px;background:#f5f6f8;color:#17191c;overflow:auto;box-sizing:border-box}
 .dashboard-fullscreen::backdrop{background:#f5f6f8}.fullscreen-toolbar{position:sticky;top:-20px;z-index:5;background:#f5f6f8;padding:10px 0;display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.dashboard-fullscreen .filters{position:relative;margin-bottom:16px}.fullscreen-card{width:100%;box-sizing:border-box}.fullscreen-card .fullscreen-button,.fullscreen-card button[aria-expanded]{display:none}.fullscreen-card .table-wrap:not(.fullscreen-target){display:none!important}.fullscreen-card .table-cohort-heading{display:none}.fullscreen-card .fullscreen-target{display:block!important}.fullscreen-card.chart-card{min-height:65vh}.fullscreen-card canvas.fullscreen-target{max-height:none!important;height:45vh!important;width:100%!important}.dashboard-fullscreen .table-wrap{max-height:calc(100dvh - 285px)}.dashboard-fullscreen th{position:sticky;top:0}.dashboard-fullscreen .card-head{gap:12px}
 @media(max-width:700px){dialog.dashboard-fullscreen{padding:10px}.dashboard-fullscreen .filters{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard-fullscreen .table-wrap{max-height:65vh}}
 `;document.head.append(style);
})();
