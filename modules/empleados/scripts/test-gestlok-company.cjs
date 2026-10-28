const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const source=fs.readFileSync('components/gestlok/GestlokContext.tsx','utf8');
function load(options={}){
  const requests=[];
  const env={NEXT_PUBLIC_GESTLOK_SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_GESTLOK_PUBLISHABLE_KEY:'public-fixture'};
  const session=options.session===null?null:JSON.stringify({access_token:'fixture-token',expires_at:Math.floor(Date.now()/1000)+3600});
  const win={localStorage:{getItem:()=>session}};
  const fetcher=async(url,config)=>{
    requests.push({url,config});
    if(url.endsWith('/gestlok_owner_area_context'))return options.owner || {ok:false,status:403};
    if(url.endsWith('/mi_acceso'))return options.member || {ok:false,status:403};
    if(url.endsWith('/gestlok_my_role_contexts'))return options.contexts || {ok:true,json:async()=>[]};
    throw new Error('Unexpected request');
  };
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};
  new Function('require','exports','process','window','fetch',compiled)(
    name=>{
      if(name==='react')return {createContext:()=>({}),useContext:()=>null,useEffect(){},useState:x=>[x,()=>{}]};
      if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props})};
      throw new Error(name);
    },
    exports,{env},win,fetcher);
  return {fetch:()=>exports.loadGestlokCompany(fetcher),requests};
}
test('el dueño conserva logo verificado por backend y vínculo',async()=>{
 const x=load({owner:{ok:true,json:async()=>({role:'dueno',company_name:'Mi Gusto',logo_id:'mi-gusto',recibonet:{organization_number:'2026002',internal_name:'Alessandro'}})}});
 const v=await x.fetch();assert.equal(v.company_name,'Mi Gusto');assert.equal(v.logo_id,'mi-gusto');assert.equal(v.recibonet.organization_number,'2026002');
 assert.equal(x.requests.length,1);
});
test('el gerente de Mi Gusto obtiene solo el nombre y marca de su empresa',async()=>{
 const x=load({member:{ok:true,json:async()=>({rol:'gerente',tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670',locales:['munro']})}});
 const v=await x.fetch();assert.deepEqual(v,{company_name:'Mi Gusto',logo_id:'mi-gusto',recibonet:null});
 assert.equal(x.requests.length,3);
 assert.equal(x.requests[1].config.headers.Authorization,'Bearer fixture-token');
 assert.equal(x.requests[2].config.headers.Authorization,'Bearer fixture-token');
});
test('una empresa distinta conserva su propia identidad y nunca recibe el logo de Mi Gusto',async()=>{
 const x=load({
   member:{ok:true,json:async()=>({rol:'gerente',tenant_id:'otra-empresa'})},
   contexts:{ok:true,json:async()=>[{tenant_id:'otra-empresa',company_name:'Perfumería'}]}
 });
 assert.deepEqual(await x.fetch(),{company_name:'Perfumería',logo_id:null,recibonet:null});
});
test('los roles sin permiso no reciben identidad privada de la empresa',async()=>{
 for(const m of [{rol:'anon',tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},null]){
  const x=load({member:{ok:true,json:async()=>m}});assert.equal(await x.fetch(),null);
 }
 const x=load({session:null});assert.equal(await x.fetch(),null);assert.equal(x.requests.length,0);
});
