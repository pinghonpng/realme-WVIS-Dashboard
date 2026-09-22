const crypto=require('node:crypto');
const {promisify}=require('node:util');const scrypt=promisify(crypto.scrypt);
const hashToken=value=>crypto.createHash('sha256').update(value).digest('hex');
async function hashPassword(password){if(typeof password!=='string'||password.length<10||password.length>128)throw Object.assign(new Error('Use a password with 10–128 characters.'),{status:400});const salt=crypto.randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64)).toString('hex');}
async function checkPassword(password,hash){if(typeof password!=='string'||password.length>128)return false;const [salt,value]=String(hash||'').split(':');if(!salt||!value)return false;const actual=await scrypt(password,salt,64),expected=Buffer.from(value,'hex');return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}
function username(value){const name=String(value||'').trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._@-]{2,79}$/.test(name))throw Object.assign(new Error('Username must be 3–80 characters: letters, numbers, dots, @, underscores or hyphens.'),{status:400});return name;}
const token=()=>crypto.randomBytes(32).toString('hex');
module.exports={hashToken,hashPassword,checkPassword,username,token};
