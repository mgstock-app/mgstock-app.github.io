const enc=new TextEncoder(),dec=new TextDecoder();
const hex=b=>Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
const bytes=s=>Uint8Array.from(s.match(/../g),x=>parseInt(x,16));
const random=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const validSecret=/^[a-f0-9]{64}$/;
export function parseCode(code){
 const [v,id,local,token,key,...extra]=String(code||'').trim().split('.');
 if(v!=='GESTLOK3'||!validId.test(id)||!['munro','torcuato'].includes(local)||!validSecret.test(token)||!validSecret.test(key)||extra.length)throw Error('Código de ensayo inválido');
 return {id,local,token,key};
}
export function makeCode(local){return parseCode(['GESTLOK3',crypto.randomUUID(),local,random(32),random(32)].join('.'));}
export function formatCode(s){return ['GESTLOK3',s.id,s.local,s.token,s.key].join('.');}
export async function hashToken(s){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s.token))));}
const keyFor=s=>crypto.subtle.importKey('raw',bytes(s.key),{name:'AES-GCM'},false,['encrypt','decrypt']);
const aad=(s,dir)=>enc.encode('gestlok-prueba-v3:'+s.id+':'+s.local+':'+dir);
function b64(v){let str='';for(let i=0;i<v.length;i+=8192)str+=String.fromCharCode(...v.subarray(i,i+8192));return btoa(str);}
export async function seal(s,dir,value){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(s,dir)},await keyFor(s),enc.encode(JSON.stringify(value))));
 return hex(iv)+'.'+b64(ciphertext);
}
export async function open(s,dir,value){
 if(typeof value!=='string'||value.length>200000)throw Error('Estado inválido');
 const [iv,body,...extra]=value.split('.');if(!/^[a-f0-9]{24}$/.test(iv)||!body||extra.length)throw Error('Estado inválido');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:aad(s,dir)},await keyFor(s),Uint8Array.from(atob(body),c=>c.charCodeAt(0)));
 return JSON.parse(dec.decode(plain));
}
export const allowedAction=(a,t)=>['pause','resume','confirm'].includes(a)&&(!t)||(a==='reply'&&typeof t==='string'&&t.trim().length>0&&t.length<=300);
