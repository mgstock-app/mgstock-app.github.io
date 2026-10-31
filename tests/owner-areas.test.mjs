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
 assert.match(html,/Administrar <span>mi empresa<\/span>/);
 assert.match(html,/gl-owner-employees-locked/);assert.match(html,/aria-disabled="true"/);
 assert.doesNotMatch(html,/data-owner-area-staff|data-owner-go="staff"|Próximamente|local-ajeno/);
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
 const html=a.view([],()=> '');assert.match(html,/gl-owner-employees-locked/);
 assert.doesNotMatch(html,/<img onerror|data-owner-area-staff|data-owner-go="staff"/);assert.match(html,/&lt;img/);
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
 assert.match(registry,/Empresa ficticia|Munro/);assert.match(registry,/Registro de empresas/);
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
test('Empleados solo se habilita cuando el backend lo autoriza y está operativo; logo Mi Gusto solo por asignación',async()=>{
 const d=context();d.modules.recibos_personal={authorized:true,operational:true};d.logo_id='mi-gusto';
 const a=load(d);await a.refresh();assert.equal(a.allowed('recibos_personal'),true);
 const html=a.view([{id:'local-a'}],l=>`<b>${l.id}</b>`);
 assert.match(html,/Administrar <span>a los empleados<\/span>/);assert.match(html,/data-owner-area-staff/);
 assert.match(html,/Administrar <span>mi empresa<\/span>/);assert.match(html,/img\/mi-gusto-blanco\.png/);
 assert.match(html,/gl-owner-welcome-logo/);
 assert.match(a.header(),/Empanadas de Verdad/);
 assert.match(a.header(),/gl-oh-brand-company/);
 const sinLogo=context();sinLogo.modules.recibos_personal={authorized:true,operational:true};
 const b=load(sinLogo);await b.refresh();assert.doesNotMatch(b.view([],()=>''),/mi-gusto/);
});

function loadUI(data=context(),extra={}){
 const listeners={},panels=[],nodes={};
 const pn={innerHTML:'',contains:()=>false,setAttribute(){},querySelector:()=>null};
 const document={addEventListener(n,f){listeners[n]=f;},getElementById:id=>id==='pn'?pn:null,activeElement:null,baseURI:'https://example.test/stock/'};
 const window={addEventListener(){},GestLokSupabase:{rpc:async()=>({data,error:null})},...(extra.window||{})};
 vm.runInNewContext(source,{window,document,location:{assign:u=>{nodes.assigned=u;}},URL});
 const api=window.GestLokOwnerAreas,S={loaded:{e:true},me:{tenant_id:'tenant-a',email:'ana.perez@example.com'},equipo:[{email:'ana.perez@example.com',nombre:'<b>Ana</b> María'}],panel:null};
 const calls=[];
 api.attach({role:()=> 'dueno',S,render(){calls.push('render');},openPanel(html,k){panels.push({html,k});},closePanel(){S.panel=null;calls.push('close');},
  hubStats:id=>({loaded:true,n:10,sin:id==='local-a'?2:0,bajo:1,nc:3,ped:id==='local-a'?3:0,last:null}),ic:n=>'['+n+']',rolLabel:()=> 'Dueño',openShare(){calls.push('share');},openLocal:id=>calls.push('local:'+id),toast:m=>calls.push('toast:'+m),...(extra.ctx||{})});
 const click=sel=>{const target={closest:q=>q===sel.q?sel.el:null};listeners.click({target,preventDefault(){}});};
 const nav=k=>listeners.click({target:{closest:q=>q==='[data-owner-nav]'?{dataset:{ownerNav:k}}:null},preventDefault(){}});
 return {api,S,panels,calls,nav,nodes,listeners,pn};
}
test('Cabecera: saludo con el nombre escapado, rol y aviso de stock solo si hay productos para pedir',async()=>{
 const t=loadUI();await t.api.refresh();t.api.view([{id:'local-a',nombre:'A'},{id:'local-b',nombre:'B'}],()=> '');
 const h=t.api.header();
 assert.match(h,/Hola, &lt;b&gt;ana/);assert.doesNotMatch(h,/<b>ana<\/b>/);assert.match(h,/Dueño/);
 assert.match(h,/data-owner-nav="menu"/);assert.match(h,/data-owner-nav="bell"/);assert.match(h,/gl-oh-dot/);
 const t2=loadUI(context(),{ctx:{hubStats:()=>({loaded:true,n:5,sin:0,bajo:0,nc:0,ped:0,last:null})}});await t2.api.refresh();t2.api.view([{id:'local-a',nombre:'A'}],()=> '');
 assert.doesNotMatch(t2.api.header(),/gl-oh-dot/);
});
test('Accesos generales: cuatro botones reales y soporte con enlace solo si hay número configurado',async()=>{
 const t=loadUI();await t.api.refresh();
 let html=t.api.view([],()=> '');
 for(const k of ['reports','account','settings','support'])assert.match(html,new RegExp('data-owner-nav="'+k+'"'));
 const t2=loadUI(context(),{window:{GestLokSupport:{link:()=> 'https://wa.me/5491100000000?text=hola'}}});await t2.api.refresh();
 html=t2.api.view([],()=> '');assert.match(html,/href="https:\/\/wa\.me\/5491100000000/);assert.match(html,/rel="noopener noreferrer"/);assert.doesNotMatch(html,/data-owner-nav="support"/);
});
test('Paneles: el selector y los reportes solo incluyen locales autorizados; los textos se escapan',async()=>{
 const t=loadUI();await t.api.refresh();
 t.api.view([{id:'local-a',nombre:'Munro <i>'},{id:'local-ajeno',nombre:'Ajeno'}],l=>'<article data-id="'+l.id+'"></article>');
 t.nav('reports');const rep=t.panels.at(-1).html;
 assert.match(rep,/Munro &lt;i&gt;/);assert.doesNotMatch(rep,/Ajeno|<i>/);assert.doesNotMatch(rep,/data-owner-area-staff/);
 t.nav('business');assert.equal(t.calls.includes('local:local-a'),true,'con un solo local entra directo');
 const t2=loadUI(context());await t2.api.refresh();
 const d=context();d.local_ids=['local-a','local-b'];const t3=loadUI(d);await t3.api.refresh();
 t3.api.view([{id:'local-a',nombre:'A'},{id:'local-b',nombre:'B'},{id:'local-ajeno',nombre:'X'}],l=>'<article data-id="'+l.id+'"></article>');
 t3.nav('business');const pick=t3.panels.at(-1).html;assert.match(pick,/data-id="local-a"/);assert.match(pick,/data-id="local-b"/);assert.doesNotMatch(pick,/local-ajeno/);
 t3.nav('account');const acc=t3.panels.at(-1).html;assert.match(acc,/ana\.perez@example\.com/);assert.match(acc,/data-au="out"/);
 t3.nav('support');assert.ok(t3.calls.some(c=>String(c).startsWith('toast:El soporte')));
});
test('Empleados: solo se ofrece y se abre con el módulo autorizado',async()=>{
 const d=context();d.modules.recibos_personal={authorized:true,operational:true};
 const t=loadUI(d);await t.api.refresh();
 const html=t.api.view([],()=> '');assert.match(html,/data-owner-area-staff/);assert.match(html,/Administrar <span>a los empleados<\/span>/);
 t.nav('staff');assert.match(String(t.nodes.assigned),/empleados\/$/);
 const off=loadUI();await off.api.refresh();off.nav('staff');assert.equal(off.nodes.assigned,undefined);
});
test('Un visitante o gerente no obtiene cabecera ni navegación de dueño',async()=>{
 const t=loadUI(context(),{ctx:{role:()=> 'gerente'}});await t.api.refresh();
 assert.equal(t.api.header(),'');t.nav('reports');assert.equal(t.panels.length,0);
});

test('La creadora conserva su rol y abre ambas áreas dentro del local',async()=>{
 const listeners={};let opened=0;
 const window={addEventListener(){},GestLokSupabase:{rpc:async()=>({data:{scope:'metadata_only',companies:[{tenant_id:'t-creator',name:'Empresa propia',locals:[{id:'munro'},{id:'torcuato'}],modules:{recibos_personal:true},recibonet:{organization_number:'2026002'}}]},error:null})}};
 vm.runInNewContext(source,{window,document:{addEventListener(n,f){listeners[n]=f;}}});
 const a=window.GestLokOwnerAreas;
 a.attach({role:()=> 'creadora',S:{local:'munro',loaded:{e:true},me:{tenant_id:'t-creator'},equipo:[]},render(){},openBusiness(){opened++;}});
 await a.refresh();const html=a.view([{id:'munro'},{id:'torcuato'}],()=> '');
 assert.match(html,/data-owner-nav="business"/);assert.match(html,/data-owner-area-staff/);
 listeners.click({preventDefault(){},target:{closest:sel=>sel==='[data-owner-nav]'?{dataset:{ownerNav:'business'}}:null}});
 assert.equal(opened,1,'Abre las herramientas del local, sin cambiar al rol Dueño');
});
