import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
const context=()=>({role:'dueno',tenant_id:'tenant-a',company_name:'Empresa ficticia',local_ids:['local-a'],modules:{comercial:{authorized:true,operational:true},recibos_personal:{authorized:false,operational:false}}});
function load(data=context(),error=null){
 const window={addEventListener(){},GestLokSupabase:{rpc:async()=>({data,error})}};
 vm.runInNewContext(source,{window,document:{addEventListener(){}}});
 const api=window.GestLokOwnerAreas;api.attach({role:()=> 'dueno',S:{loaded:{e:true},me:{tenant_id:'tenant-a'}},render(){}});
 return api;
}
test('Inicio cierra el acceso mientras verifica; solo muestra áreas operativas autorizadas',async()=>{
 const a=load();assert.equal(a.allowed('comercial'),false);await a.refresh();
 const html=a.view([{id:'local-a'},{id:'local-ajeno'}],l=>`<b>${l.id}</b>`);
 assert.match(html,/Administrar <span>mi empresa<\/span>/);assert.match(html,/local-a<\/b>/);
 assert.doesNotMatch(html,/Administrar <span>a los empleados|data-owner-area-staff|Próximamente|local-ajeno/);
 assert.match(html,/Bienvenido\/a a/);assert.match(html,/<h1><span>GEST<\/span><span>LOK<\/span><\/h1>/);
});
test('Fallos de backend y contexto de otra empresa no habilitan carpetas',async()=>{
 for(const a of [load(null,{message:'offline'}),load({...context(),tenant_id:'tenant-ajeno'})]){
  await a.refresh();assert.equal(a.allowed('comercial'),false);assert.match(a.view([],()=>''),/No pudimos verificar/);
 }
});
test('Solicitud o módulo no operativo no habilita empleados; marca se escapa',async()=>{
 const d=context();d.company_name='<img onerror="x">';d.modules.recibos_personal={authorized:true,operational:false};
 const a=load(d);await a.refresh();assert.equal(a.allowed('recibos_personal'),false);
 const html=a.view([],()=> '');assert.doesNotMatch(html,/<img onerror|a los empleados|data-owner-area-staff/);assert.match(html,/&lt;img/);
});
function creator(companies,audit=[]){
 const calls=[];
 const window={addEventListener(){},confirm:()=>true,alert(){},GestLokSupabase:{rpc:async(fn,args)=>{calls.push([fn,args]);
  if(fn==='gestlok_creator_audit')return {data:audit,error:null};
  if(fn==='gestlok_creator_set_module')return {data:{enabled:args.p_enabled,changed:true},error:null};
  return {data:{scope:'metadata_only',companies},error:null};}}};
 const listeners={};
 vm.runInNewContext(source,{window,document:{addEventListener(n,f){listeners[n]=f;}}});
 const a=window.GestLokOwnerAreas;a.attach({role:()=> 'creadora',S:{loaded:{e:true}},render(){}});
 return {a,calls,listeners};
}
test('Registro de creadora consulta metadatos sin ofrecer acciones de escritura',async()=>{
 const {a}=creator([{tenant_id:'t-a',name:'Empresa ficticia',owners:2,locals:[{name:'Munro'},{name:'Torcuato'}],modules:{comercial:true,recibos_personal:false},recibonet:null}]);
 await a.refreshAdmin();
 const html=a.adminView();const registry=html.split('aria-label="Módulos autorizados"')[0];
 assert.match(registry,/Empresa ficticia|Munro/);assert.match(registry,/Solo lectura/);
 assert.doesNotMatch(registry,/data-act=|<button|recibo|salario/);
 assert.doesNotMatch(html,/@|salario|sueldo/);
 assert.doesNotMatch(html,/data-owner-module="t-a"/,'Sin vínculo verificado no se ofrece habilitar empleados');
});
test('La creadora asigna el módulo de empleados con confirmación y queda en el registro de acciones',async()=>{
 const {a,calls,listeners}=creator([{tenant_id:'t-a',name:'Mi Gusto',owners:2,locals:[{name:'Munro'}],modules:{comercial:true,recibos_personal:false},recibonet:{organization_number:'2026002'}}],
  [{at:'2026-10-25T21:00:00Z',action:'recibonet_linked',tenant_id:'t-a',detail:{}}]);
 await a.refreshAdmin();
 const html=a.adminView();
 assert.match(html,/data-owner-module="t-a" data-enable="true"/);assert.match(html,/ReciboNet 2026002/);assert.match(html,/Empresa vinculada con ReciboNet/);
 const button={dataset:{ownerModule:'t-a',enable:'true'}};
 listeners.click({preventDefault(){},target:{closest:sel=>sel==='[data-owner-module]'?button:null}});
 await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));
 assert.equal(JSON.stringify(calls.find(c=>c[0]==='gestlok_creator_set_module')[1]),JSON.stringify({p_tenant:'t-a',p_module:'recibos_personal',p_enabled:true}));
});
test('Un inicio ya verificado conserva la navegación autorizada al volver sin conexión',async()=>{
 const a=load();await a.refresh();
 a.attach({role:()=> 'dueno',S:{offline:true,loaded:{e:true},me:{tenant_id:'tenant-a'}},render(){throw Error('Unexpected redraw');}});
 await a.refresh();assert.equal(a.allowed('comercial'),true);
 assert.match(a.view([{id:'local-a'}],l=>l.id),/Administrar <span>mi empresa<\/span>/);
});
test('Empleados solo aparece cuando el backend lo autoriza y está operativo; logo Mi Gusto solo por asignación',async()=>{
 const d=context();d.modules.recibos_personal={authorized:true,operational:true};d.logo_id='mi-gusto';
 const a=load(d);await a.refresh();assert.equal(a.allowed('recibos_personal'),true);
 const html=a.view([{id:'local-a'}],l=>`<b>${l.id}</b>`);
 assert.match(html,/Administrar <span>a los empleados<\/span>/);assert.match(html,/data-owner-area-staff/);
 assert.match(html,/Administrar <span>mi empresa<\/span>/);assert.match(html,/img\/mi-gusto-blanco\.png/);
 const sinLogo=context();sinLogo.modules.recibos_personal={authorized:true,operational:true};
 const b=load(sinLogo);await b.refresh();assert.doesNotMatch(b.view([],()=>''),/mi-gusto/);
});
