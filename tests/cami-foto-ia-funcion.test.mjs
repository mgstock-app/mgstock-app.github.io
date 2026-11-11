import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync} from 'node:fs';

// La función usa `npm:@supabase/supabase-js`: se reemplaza por un doble controlado desde la prueba.
const mock=`export function createClient(url,key,opts){return globalThis.__sb.client(key,opts);}`;
const hooks=`
export async function resolve(spec,ctx,next){
 if(spec.startsWith('npm:@supabase/supabase-js'))return {url:'data:text/javascript;base64,${Buffer.from(mock).toString('base64')}',shortCircuit:true};
 return next(spec,ctx);
}`;
register('data:text/javascript;base64,'+Buffer.from(hooks).toString('base64'));

const ENV={SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'};
let handler;
globalThis.Deno={serve:fn=>{handler=fn;},env:{get:k=>ENV[k]}};
const OWNER={id:'8ddf2c6c-8d62-44de-8ce8-27eb5759daa3',email:'camilab.lopez99@gmail.com'};
const CREATOR={id:'c1',email:'kmu15lopez@gmail.com'};
const state={user:null,creatorOk:false,cred:null,hoy:0,rpcCalls:[],fetches:[],cf:null};
globalThis.__sb={client:(key)=>({
 auth:{getUser:async()=>state.user?{data:{user:state.user},error:null}:{data:{user:null},error:{message:'no'}}},
 rpc:async(name,args)=>{
  state.rpcCalls.push({key,name,args});
  if(name==='gestlok_cami_creator_authorized')return {data:state.creatorOk,error:null};
  if(name==='gestlok_cami_foto_ia_estado')return {data:{connected:!!state.cred,hoy:state.hoy},error:null};
  if(name==='gestlok_cami_foto_ia_credenciales')return {data:state.cred,error:null};
  if(name==='gestlok_cami_foto_ia_guardar'){state.cred={account_id:args.p_account,token:args.p_token};return {data:{ok:true},error:null};}
  if(name==='gestlok_cami_foto_ia_registrar')return {data:state.hoy+1,error:null};
  if(name==='gestlok_cami_foto_ia_quitar'){state.cred=null;return {data:{ok:true},error:null};}
  return {data:null,error:{message:'rpc desconocida'}};
 }
})};
globalThis.fetch=async(url,init={})=>{
 state.fetches.push({url:String(url),init});
 const r=state.cf||{status:200,body:{success:true,result:[]}};
 return new Response(JSON.stringify(r.body),{status:r.status,headers:{'content-type':'application/json'}});
};
const source=readFileSync('supabase/functions/gestlok-cami-foto-ia/index.ts','utf8');
await import('data:text/typescript;base64,'+Buffer.from(source).toString('base64')).catch(async()=>{
 // Node sin soporte de data:typescript: quitar tipos con el mismo motor de Node.
 const {stripTypeScriptTypes}=await import('node:module');
 await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
});

function fakeJpeg(w,h){
 return Buffer.from([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,
  0xff,0xc0,0,17,8,h>>8,h&255,w>>8,w&255,3,1,0x22,0,2,0x11,1,3,0x11,1,0xff,0xd9]).toString('base64');
}
async function call(body,{auth=true}={}){
 const req=new Request('https://x/functions/v1/gestlok-cami-foto-ia',{method:'POST',
  headers:{'content-type':'application/json',origin:'https://gestlok.com.ar',...(auth?{authorization:'Bearer jwt'}:{})},
  body:JSON.stringify(body)});
 const res=await handler(req);
 return {status:res.status,body:await res.json(),headers:res.headers};
}
const reset=(patch={})=>Object.assign(state,{user:OWNER,creatorOk:false,cred:null,hoy:0,rpcCalls:[],fetches:[],cf:null},patch);

test('Sin sesión o con otra cuenta no se puede usar la IA de fotos',async()=>{
 reset({user:null});
 assert.equal((await call({action:'status'},{auth:false})).status,401);
 reset({user:{id:'x',email:'otra@example.com'}});
 const r=await call({action:'status'});
 assert.equal(r.status,403);
 reset({user:CREATOR,creatorOk:false});
 assert.equal((await call({action:'status'})).status,403,'creadora sin autorización real');
 reset({user:CREATOR,creatorOk:true});
 assert.equal((await call({action:'status'})).body.ok,true,'creadora autorizada');
 assert.equal((await call({action:'status'})).headers.get('access-control-allow-origin'),'https://gestlok.com.ar');
});

test('Conectar Cloudflare: valida datos, prueba sin gastar cupo y guarda en Vault',async()=>{
 reset();
 let r=await call({action:'connect',account_id:'xyz',token:'t'.repeat(40)});
 assert.equal(r.body.code,'datos');
 assert.equal(state.fetches.length,0);
 r=await call({action:'connect',account_id:'0123456789abcdef0123456789abcdef',token:'tok_'+'a'.repeat(36)});
 assert.equal(r.body.ok,true);
 assert.match(state.fetches[0].url,/\/accounts\/0123456789abcdef0123456789abcdef\/ai\/models\/search\?per_page=1$/);
 assert.equal(state.fetches[0].init.headers.Authorization,'Bearer tok_'+'a'.repeat(36));
 const saved=state.rpcCalls.find(c=>c.name==='gestlok_cami_foto_ia_guardar');
 assert.equal(saved.key,'service');assert.equal(saved.args.p_user,OWNER.id);
 // Token rechazado por Cloudflare: no se guarda.
 reset({cf:{status:403,body:{success:false,errors:[{code:10000,message:'Authentication error'}]}}});
 r=await call({action:'connect',account_id:'0123456789abcdef0123456789abcdef',token:'tok_'+'b'.repeat(36)});
 assert.equal(r.body.code,'conexion');
 assert.equal(state.rpcCalls.some(c=>c.name==='gestlok_cami_foto_ia_guardar'),false);
});

test('Editar: sin conexión avisa; con conexión envía la foto chica a FLUX.2 con prompt fijo',async()=>{
 reset();
 let r=await call({action:'edit',image:fakeJpeg(496,496)});
 assert.equal(r.body.code,'sin_conexion');
 const aiImage=fakeJpeg(1024,1024);
 reset({cred:{account_id:'0123456789abcdef0123456789abcdef',token:'tok_x'},cf:{status:200,body:{success:true,result:{image:aiImage}}}});
 r=await call({action:'edit',image:'data:image/jpeg;base64,'+fakeJpeg(496,496),seed:7,prompt:'otra cosa'});
 assert.equal(r.body.ok,true);
 assert.equal(r.body.image,aiImage);
 assert.equal(r.body.mime,'image/jpeg');
 const f=state.fetches[0];
 assert.match(f.url,/\/ai\/run\/@cf\/black-forest-labs\/flux-2-klein-4b$/);
 assert.equal(f.init.method,'POST');
 const form=f.init.body;
 assert.ok(form instanceof FormData);
 assert.match(form.get('prompt'),/Pure white seamless studio background/);
 assert.doesNotMatch(form.get('prompt'),/otra cosa/,'el prompt no lo puede cambiar el cliente');
 assert.equal(form.get('width'),'1024');assert.equal(form.get('seed'),'7');
 assert.ok(form.get('input_image_0') instanceof Blob);
 assert.ok(state.rpcCalls.some(c=>c.name==='gestlok_cami_foto_ia_registrar'&&c.args.p_ok===true));
});

test('Editar: rechaza fotos grandes o que no son JPG (límite de Workers AI < 512 px)',async()=>{
 reset({cred:{account_id:'0123456789abcdef0123456789abcdef',token:'tok_x'}});
 assert.equal((await call({action:'edit',image:fakeJpeg(600,600)})).body.code,'datos');
 assert.equal((await call({action:'edit',image:Buffer.from('hola').toString('base64')})).body.code,'datos');
 assert.equal(state.fetches.length,0);
});

test('Cupo gratuito agotado: mensaje claro y sin cobro',async()=>{
 reset({cred:{account_id:'0123456789abcdef0123456789abcdef',token:'tok_x'},
  cf:{status:429,body:{success:false,errors:[{code:3036,message:'You have used up your daily free allocation of 10,000 neurons.'}]}}});
 const r=await call({action:'edit',image:fakeJpeg(496,496)});
 assert.equal(r.body.code,'cupo');
 assert.match(r.body.message,/21:00/);
 assert.ok(state.rpcCalls.some(c=>c.name==='gestlok_cami_foto_ia_registrar'&&c.args.p_ok===false));
 reset({cred:{account_id:'0123456789abcdef0123456789abcdef',token:'tok_x'},hoy:150});
 assert.equal((await call({action:'edit',image:fakeJpeg(496,496)})).body.code,'cupo');
 assert.equal(state.fetches.length,0);
});

test('La función no expone el token ni usa servicios pagos',()=>{
 assert.doesNotMatch(source,/api\.openai\.com|generativelanguage|replicate\.com|fal\.ai/);
 assert.match(source,/gestlok_cami_foto_ia_credenciales/);
 for(const m of source.matchAll(/output\(req,200,\{([^)]*)\}\)/g))assert.doesNotMatch(m[1],/\btoken\b/,'el token nunca vuelve al navegador');
 const sql=readFileSync('supabase/migrations/20261111060000_cami_foto_ia_cloudflare.sql','utf8');
 assert.match(sql,/vault\.create_secret/);
 assert.match(sql,/grant execute on function public\.gestlok_cami_foto_ia_credenciales\(\) to service_role/);
 assert.doesNotMatch(sql,/to authenticated|to anon|\bdelete\b|drop table/i);
});
