const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), ts=require('typescript');
const {createClient}=require('@supabase/supabase-js');
const url='https://synthetic.supabase.co', key='sb-synthetic-auth-token', user={id:'00000000-0000-4000-8000-000000000001',email:'test@example.invalid'};
function session(exp=Math.floor(Date.now()/1000)+3600){return {access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp})).toString('base64url')+'.synthetic',refresh_token:'synthetic-refresh',token_type:'bearer',expires_at:exp,expires_in:3600,user};}
function harness(initial){
 const values=new Map(initial?[[key,JSON.stringify(initial)]]:[]), requests=[], renewed=session(Math.floor(Date.now()/1000)+7200);
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const fetcher=async(input,init)=>{requests.push({url:String(input),init});return new Response(JSON.stringify(String(input).includes('/token')?renewed:String(input).includes('/logout')?{}:user),{status:200,headers:{'Content-Type':'application/json'}});};
 const code=ts.transpileModule(fs.readFileSync('lib/supabase/browser.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};let calls=0;
 new Function('exports','require','window','fetch',code)(exports,name=>{
  if(name==='@/utils/report-config')return {reportConfig:{url,publishableKey:'public-test'}};
  if(name==='@supabase/supabase-js')return {createClient:(u,k,options)=>{calls++;assert.equal(options.auth.persistSession,true);assert.equal(options.auth.autoRefreshToken,true);assert.equal(options.auth.detectSessionInUrl,true);assert.equal(options.auth.flowType,'pkce');assert.equal(options.auth.storage,undefined);assert.equal(options.auth.storageKey,undefined);return createClient(u,k,{...options,auth:{...options.auth,storage,autoRefreshToken:false}});}};
  throw Error(name);
 },{},fetcher);
 return {client:exports.createClient(),factory:exports.createClient,storage,requests,renewed,calls:()=>calls};
}
test('reuses root session, validates it remotely and keeps a singleton',async()=>{
 const existing=session(),h=harness(existing);assert.equal(h.factory(),h.client);assert.equal(h.calls(),1);
 assert.equal((await h.client.auth.getSession()).data.session.user.id,user.id);
 assert.equal((await h.client.auth.getUser()).data.user.id,user.id);
 assert.equal(new Headers(h.requests[0].init.headers).get('Authorization'),'Bearer '+existing.access_token);assert.equal(h.requests[0].init.cache,'no-store');
});
test('refreshes expired session in shared storage, readable by the root SDK',async()=>{
 const h=harness(session(Math.floor(Date.now()/1000)-60));const {data,error}=await h.client.auth.getSession();assert.equal(error,null);assert.equal(data.session.access_token,h.renewed.access_token);
 assert.ok(h.requests.some(r=>r.url.includes('/token?grant_type=refresh_token')));
 const root=createClient(url,'public-test',{auth:{storage:h.storage,autoRefreshToken:false,detectSessionInUrl:false}});
 assert.equal((await root.auth.getSession()).data.session.access_token,h.renewed.access_token);
});
test('logout clears the shared session',async()=>{
 const h=harness(session());await h.client.auth.getSession();assert.equal((await h.client.auth.signOut()).error,null);assert.equal(h.storage.getItem(key),null);assert.equal((await h.client.auth.getSession()).data.session,null);
});
test('without a session it does not manufacture an identity',async()=>{
 const h=harness();assert.equal((await h.client.auth.getSession()).data.session,null);assert.equal(h.requests.length,0);
});
