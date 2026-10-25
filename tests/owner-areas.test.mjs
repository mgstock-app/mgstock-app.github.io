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
 assert.match(html,/Administrar mi empresa/);assert.match(html,/local-a<\/b>/);
 assert.doesNotMatch(html,/Administrar empleados|Próximamente|local-ajeno/);
});
test('Fallos de backend y contexto de otra empresa no habilitan carpetas',async()=>{
 for(const a of [load(null,{message:'offline'}),load({...context(),tenant_id:'tenant-ajeno'})]){
  await a.refresh();assert.equal(a.allowed('comercial'),false);assert.match(a.view([],()=>''),/No pudimos verificar/);
 }
});
test('Solicitud o módulo no operativo no habilita empleados; marca se escapa',async()=>{
 const d=context();d.company_name='<img onerror="x">';d.modules.recibos_personal={authorized:true,operational:false};
 const a=load(d);await a.refresh();assert.equal(a.allowed('recibos_personal'),false);
 const html=a.view([],()=> '');assert.doesNotMatch(html,/<img onerror|Administrar empleados/);assert.match(html,/&lt;img/);
});
test('Registro de creadora consulta metadatos sin ofrecer acciones de escritura',async()=>{
 const window={addEventListener(){},GestLokSupabase:{rpc:async()=>({data:{scope:'metadata_only',companies:[{name:'Empresa ficticia',owners:2,locals:[{name:'Munro'},{name:'Torcuato'}]}]},error:null})}};
 vm.runInNewContext(source,{window,document:{addEventListener(){}}});
 const a=window.GestLokOwnerAreas;a.attach({role:()=> 'creadora',S:{loaded:{e:true}},render(){}});await a.refreshAdmin();
 const html=a.adminView();assert.match(html,/Empresa ficticia|Munro/);assert.match(html,/Solo lectura/);
 assert.doesNotMatch(html,/data-act=|<button|recibo|salario/);
});
test('Un inicio ya verificado conserva la navegación autorizada al volver sin conexión',async()=>{
 const a=load();await a.refresh();
 a.attach({role:()=> 'dueno',S:{offline:true,loaded:{e:true},me:{tenant_id:'tenant-a'}},render(){throw Error('Unexpected redraw');}});
 await a.refresh();assert.equal(a.allowed('comercial'),true);
 assert.match(a.view([{id:'local-a'}],l=>l.id),/Administrar mi empresa/);
});
