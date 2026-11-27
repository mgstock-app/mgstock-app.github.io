import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync('public/stock/gestlok-creator-home.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
function fixture(role=true,email='kmu15lopez@gmail.com'){
  const companies=[{tenant_id:'a',name:'Empresa A',locals:[{id:'uno',name:'Local A'},{id:'dos',name:'Local A2'}]},
    {tenant_id:'b',name:'Empresa B',locals:[{id:'uno',name:'Local B'}]}];
  const locales=[{tenant_id:'a',local_id:'uno',nombre:'Local A',sucursal_id:'chat-a'},
    {tenant_id:'a',local_id:'dos',nombre:'Local A2',sucursal_id:null},
    {tenant_id:'b',local_id:'uno',nombre:'Local B',sucursal_id:'chat-b'}];
  const numeros=[{id:'num-b',tenant_id:'b',local_id:'uno',habilitada:true,local_existe:true}];
  const calls=[],messages=[],handlers={},storage=new Map();
  const win={confirm:()=>true,scrollTo(){},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    GestLokOwnerAreas:{creatorCompanies:()=>companies,companyFolders:()=>''},
    GestLokSupabase:{rpc:async(name,args={})=>{
      calls.push({name,args:JSON.parse(JSON.stringify(args))});
      if(name==='gestlok_creator_dashboard')return {data:{scope:'creator_dashboard',generated_at:'2026-11-26T12:00:00Z',totals:{companies:2,locals:3},series:[],recent_companies:[]}};
      if(name==='gestlok_creator_microapps')return {data:[]};
      if(name==='gestlok_chat_admin_empresas')return {data:companies.map(c=>({tenant_id:c.tenant_id,nombre:c.name,habilitada:true,sucursales:[]}))};
      if(name==='gestlok_chat_admin_habilitar'){locales.find(l=>l.tenant_id===args.p_tenant&&l.local_id===args.p_sucursales[0].local_id).sucursal_id='created';return {data:{ok:true}};}
      if(name==='gestlok_chat_admin_whatsapp_premium'){
        if(args.p_accion==='agregar')numeros.push({id:'added',tenant_id:args.p_tenant,local_id:args.p_local,habilitada:true,local_existe:true});
        if(args.p_accion==='estado')numeros.find(n=>n.id===args.p_id).habilitada=args.p_habilitada;
        return {data:{locales,numeros}};
      }
      return {error:{message:'not mocked'}};
    }}};
  const document={addEventListener(n,fn){(handlers[n]??=[]).push(fn);},visibilityState:'visible'};
  vm.runInNewContext(src,{window:win,document,Date,queueMicrotask,setInterval:()=>0,clearInterval(){}});
  const h=win.GestLokCreatorHome;
  h.attach({S:{me:{email,tenant_id:'a'}},isCreadora:()=>role,render(){},toast:m=>messages.push(m)});
  const emit=(name,event)=>handlers[name]?.forEach(fn=>fn(event));
  const submit=(tenant,local,plan,numbers='')=>emit('submit',{preventDefault(){},target:{
    matches:s=>s==='[data-ch-local-plan]',dataset:{tenant,local},elements:{plan:{value:plan},numeros:{value:numbers}}}});
  return {h,submit,calls,numeros,messages,locales};
}
const writes=f=>f.calls.filter(c=>c.name==='gestlok_chat_admin_habilitar'||(c.name==='gestlok_chat_admin_whatsapp_premium'&&c.args.p_accion!=='listar'));
test('cada sucursal tiene selector y el estado Premium se obtiene por tenant y local',async()=>{
  const f=fixture();f.h.mode();await tick();f.h.setTab('locales');await tick();
  const html=f.h.view({parts:{}});
  assert.equal((html.match(/data-ch-local-plan data-tenant=/g)||[]).length,3);
  assert.match(html,/data-tenant="a" data-local="uno"[\s\S]*?<option value="chat" selected>/);
  assert.match(html,/data-tenant="b" data-local="uno"[\s\S]*?<option value="premium" selected>/);
  assert.equal((html.match(/data-ch-local-wa=/g)||[]).length,1);
  assert.match(html,/GESTLOK WAI se habilita al guardar el primer número/);
  assert.match(html,/GESTLOK Chat \(web\) \$ 70\.000/);
  assert.match(html,/GESTLOK WAI \$ 150\.000/);
  assert.doesNotMatch(html,/GESTLOK Chat Premium/);
  assert.match(html,/Local adicional \(opcional\) \$ 50\.000 por local/);
  assert.match(html,/no modifican los cobros automáticamente/);
  assert.equal(writes(f).length,0);
});
test('el plan web crea solo el local elegido y Premium registra únicamente el número autorizado',async()=>{
  const f=fixture();f.h.mode();await tick();f.h.setTab('locales');await tick();
  f.submit('a','dos','chat');await tick();await tick();
  assert.deepEqual(writes(f)[0],{name:'gestlok_chat_admin_habilitar',args:{p_tenant:'a',p_nombre:'Empresa A',p_sucursales:[{local_id:'dos'}]}});
  f.submit('a','uno','premium','invalid');await tick();
  assert.equal(writes(f).length,1);
  f.submit('a','uno','premium','');await tick();
  assert.equal(writes(f).length,1);
  f.submit('a','uno','premium','+54 9 11 0000 0001');await tick();await tick();
  assert.deepEqual(writes(f)[1],{name:'gestlok_chat_admin_whatsapp_premium',args:{p_accion:'agregar',p_tenant:'a',p_local:'uno',p_numeros:['+54 9 11 0000 0001']}});
  f.submit('a','uno','chat');await tick();await tick();
  assert.deepEqual(writes(f)[2],{name:'gestlok_chat_admin_whatsapp_premium',args:{p_accion:'estado',p_id:'added',p_habilitada:false}});
  assert.equal(f.numeros.find(n=>n.id==='num-b').habilitada,true);
});
test('una cuenta distinta o una sucursal inexistente no puede cambiar el plan',async()=>{
  const f=fixture(true,'otra@example.com');f.h.mode();await tick();f.h.setTab('locales');await tick();f.submit('a','uno','premium','+15550000001');await tick();
  assert.equal(writes(f).length,0);
  const g=fixture();g.h.mode();await tick();g.h.setTab('locales');await tick();g.submit('a','inexistente','premium','+15550000001');await tick();
  assert.equal(writes(g).length,0);
});

