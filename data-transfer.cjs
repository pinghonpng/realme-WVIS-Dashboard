const {createHash}=require('node:crypto');
const sheets=new Map(),pending=new Map(),ttl=60000;
const tag=body=>'"'+createHash('sha256').update(body).digest('hex')+'"';

// Call only AFTER authenticating/authorizing the request. Shared CDN caching stays off.
function sendConditional(req,res,body,etag=tag(body),browserCache=false){
 res.setHeader('ETag',etag);
 res.setHeader('CDN-Cache-Control','no-store');
 res.setHeader('Vercel-CDN-Cache-Control','no-store');
 if(browserCache)res.setHeader('Cache-Control','private, no-cache, must-revalidate');
 const candidates=String(req.headers['if-none-match']||'').split(',').map(v=>v.trim().replace(/^W\//,''));
 if(candidates.includes(etag)||candidates.includes('*')){res.statusCode=304;return res.end();}
 return res.end(body);
}
async function readSheet(id,tab,force=false){
 const key=JSON.stringify([id,tab]),saved=sheets.get(key);
 if(!force&&saved&&Date.now()-saved.at<ttl)return saved;
 if(pending.has(key))return pending.get(key);
 const request=(async()=>{
  const response=await fetch('https://docs.google.com/spreadsheets/d/'+id+'/gviz/tq?tqx=out:csv&headers=1&sheet='+encodeURIComponent(tab),{signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Object.assign(new Error('Google Sheet unavailable.'),{status:502});
  const text=await response.text();
  if(/^\s*</.test(text))throw Object.assign(new Error('Google returned a page instead of sheet data.'),{status:502});
  const result={text,etag:tag(text),at:Date.now()};
  if(sheets.size>=5&&!sheets.has(key))sheets.delete(sheets.keys().next().value);
  sheets.set(key,result);return result;
 })();
 pending.set(key,request);
 try{return await request;}finally{pending.delete(key);}
}
module.exports={sendConditional,readSheet};
