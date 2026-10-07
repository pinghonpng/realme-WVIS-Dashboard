// One schedule for background data checks. Manual refreshes bypass this schedule.
(()=>{
 const interval=15*60*1000,idleAfter=5*60*1000,jobs=new Map();
 let lastActivity=Date.now();
 const active=()=>document.visibilityState==='visible'&&Date.now()-lastActivity<idleAfter;
 function mark(name){const job=jobs.get(name);if(job)job.last=Date.now();}
 function runDue(){
  if(!active())return;
  for(const job of jobs.values()){
   if(job.running||Date.now()-job.last<interval||!job.enabled())continue;
   job.last=Date.now();job.running=true;
   Promise.resolve().then(job.run).catch(()=>{}).finally(()=>{job.running=false;});
  }
 }
 function register(name,run,enabled=()=>true){jobs.set(name,{run,enabled,last:Date.now(),running:false});}
 function activity(event){if(event.isTrusted===false)return;lastActivity=Date.now();runDue();}
 for(const event of ['pointerdown','pointermove','keydown','touchstart','scroll'])document.addEventListener(event,activity,{passive:true,capture:true});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){lastActivity=Date.now();runDue();}});
 setInterval(runDue,60000);
 window.evisRefresh={register,mark,active,interval,idleAfter};
})();
