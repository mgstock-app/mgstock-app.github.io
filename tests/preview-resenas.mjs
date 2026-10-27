// Vista local ficticia para QA visual. Nunca conecta con Supabase ni con datos reales.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reseñas · QA ficticia</title><link rel="stylesheet" href="/resenas.css"><style>body{margin:0;background:#f7f8f6;font:14px system-ui}main{padding:28px;max-width:1000px;margin:auto}header.qa{background:#161917;color:white;padding:18px}button,input{font:inherit}</style><header class="qa">GESTLOK · Mi Gusto — Munro · VISTA FICTICIA DE PRUEBA</header><main id="qa"></main><script src="/resenas.js"></script><script>
let n=3;const rows=[{id:'1',customer_name:'Cliente ficticio A',phone:'1122337788',code:'A7BC32',status:'pending',created_at:'2026-11-01T15:00:00Z'}, {id:'2',customer_name:'Cliente ficticio B',phone:'1133445566',code:'BC42AF',status:'used',created_at:'2026-11-01T15:00:00Z',used_at:'2026-11-02T15:00:00Z'}, {id:'3',customer_name:'Cliente ficticio C',phone:'1144556677',code:'F91DAC',status:'expired',created_at:'2026-10-01T15:00:00Z'}];
window.GestLokSupabase={rpc:async(name,p)=>{
 if(name==='gestlok_resenas_list')return {data:rows};
 if(name==='gestlok_resenas_create'){
  if(rows.some(r=>r.phone===p.p_phone))return {error:{message:'ya tiene'}};
  const id=String(++n),r={id,customer_name:p.p_name,phone:p.p_phone,code:'AA'+n.toString(16).toUpperCase().padStart(4,'0'),status:'pending',created_at:new Date().toISOString()};rows.push(r);return {data:r};
 }
 const r=rows.find(r=>r.id===p.p_id);if(!r||r.status!=='pending')return {error:{message:'utilizado'}};
 r.status='used';r.used_at=new Date().toISOString();return {data:r};
}};
const S={me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',view:'resenas',offline:false};
const render=()=>document.getElementById('qa').innerHTML=window.GestLokResenas.view();
window.GestLokResenas.attach({S,render,miRol:()=> 'gerente',misLocales:()=>['munro']});render();window.GestLokResenas.subscribe('munro',()=>{});
</script></html>`;
const files={'/resenas.js':new URL('../public/stock/mi-gusto-resenas.js',import.meta.url),'/resenas.css':new URL('../app/mi-gusto-resenas.css',import.meta.url)};
createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 const file=files[req.url];if(!file){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');res.end(readFileSync(file));
}).listen(3140,'127.0.0.1',()=>console.log('QA ficticia: http://localhost:3140 (sin Supabase)'));
