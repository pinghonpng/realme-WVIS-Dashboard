const {csvGrid}=require('./inventory.js');
const base='https://docs.google.com/spreadsheets/d/14lzoeyj9DAyJmgTR0lTQCcIPUDjsF0FbbEnivgGrJuI/gviz/tq?tqx=out:csv&headers=0&sheet=INVENTORY%20per%20STORE&range=';
let cached,pending;
async function read(range){const r=await fetch(base+encodeURIComponent(range),{signal:AbortSignal.timeout(40000)});if(!r.ok)throw new Error('Inventory sheet unavailable.');const text=await r.text();if(/^\s*</.test(text))throw new Error('Inventory sheet did not return data.');return csvGrid(text);}
exports.loadInventory=async(force=false)=>{
 if(!force&&cached&&Date.now()-cached.time<60000)return cached.data;
 if(pending)return pending;
 pending=(async()=>{
  const candidates=await Promise.all([read('K5:BS5'),read('K6:BS6')]);
  const index=candidates.findIndex(g=>g[0]?.some(v=>/HP\.|TechLife|Nexal|realme/i.test(v)));
  if(index<0)throw new Error('Inventory model headers could not be found in K5:BS6.');
  const models=candidates[index][0].map((name,i)=>({name:name.trim(),column:i+10})).filter(m=>m.name);
  if(new Set(models.map(m=>m.name)).size!==models.length)throw new Error('Duplicate inventory model headers require review.');
  const grid=await read('A'+(index+6)+':BS');
  const stores=grid.filter(r=>r[3]?.trim()||r[7]?.trim()).map(r=>({type:r[0]?.trim(),area:r[1]?.trim(),subregion:r[5]?.trim(),sid:r[3]?.trim(),date:r[4]?.trim(),dealer:r[6]?.trim(),name:r[7]?.trim(),stock:Object.fromEntries(models.map(m=>{const v=(r[m.column]||'').trim().replace(/,/g,'');return [m.name,v!==''&&Number.isFinite(Number(v))?Number(v):null];}))}));
  if(!stores.length)throw new Error('No inventory stores returned.');
  const data={models:models.map(m=>m.name),stores,headerRow:index+5,checkedAt:new Date().toISOString()};cached={time:Date.now(),data};return data;
 })();try{return await pending;}finally{pending=null;}
};
