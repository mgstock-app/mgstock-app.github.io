import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

const js=read('public/stock/gestlok-reclamos-internos.js');
const sql=read('supabase/migrations/20261029225000_gestlok_reclamos_internos_global.sql');
const app=read('public/stock/app.js');
const css=read('app/gestlok-reclamos-internos.css');

function setup({role='gerente',tenant='tenant-a',local='munro',assigned=['munro'],readonly=false}={}){
 const listeners={};
 const document={
  addEventListener:(event,fn)=>{listeners[event]=fn;},
  querySelector:()=>null
 };
 const win={GestLokSupabase:{rpc:async()=>({data:[]})},addEventListener:()=>{}};
 const ctx={window:win,document,navigator:{onLine:true},Intl,Date,Number,Array,Object,JSON,String,console,
  setInterval:()=>1,clearInterval:()=>{},FormData:class{}};
 runInNewContext(js,ctx);
 const mod=win.GestLokReclamosInternos;
 let renders=0;
 const S={me:tenant?{tenant_id:tenant}:null,local,offline:false,ro:readonly,view:'reclamos-internos'};
 mod.attach({S,render:()=>{renders++;},miRol:()=>role,misLocales:()=>assigned});
 return {mod,win,S,listeners,renders:()=>renders};
}
test('Categoría global abajo de Reseñas, accesible desde los locales actuales y futuros',()=>{
 assert.match(app,/function navAdmLocal\(\)[\s\S]*data-go="resenas"[\s\S]*data-go="reclamos-internos"/);\n assert.match(app,/pagosDiarios \? `<button data-go="cierre-online"/);
 assert.match(app,/'reclamos-internos' && puedeVerReclamos/);
 assert.match(app,/window\.GestLokReclamosInternos\?\.subscribe\(loc,push\)/);
 assert.match(app,/window\.GestLokReclamosInternos\?\.reset\(\)/);
 assert.match(app,/window\.GestLokReclamosInternos\?\.attach/);
 assert.match(read('components/stock-runtime.tsx'),/load\("\/stock\/gestlok-reclamos-internos\.js/);
 assert.match(read('app/layout.tsx'),/gestlok-reclamos-internos\.css/);
 for(const path of ['public/sw.js','scripts/sw-template.js'])
  assert.match(read(path),/'\/stock\/gestlok-reclamos-internos\.js'/);
 assert.doesNotMatch(js,/cb0dc04a-9a13-434f-a3d0-47f1d8f39670/);
 assert.doesNotMatch(sql,/cb0dc04a-9a13-434f-a3d0-47f1d8f39670/);
});
test('UI: estados únicamente pendiente/usado, fecha de Argentina, descuento editable y gerente obligatorio',()=>{
 assert.match(js,/America\/Argentina\/Buenos_Aires/);
 assert.match(js,/Gerente responsable/);
 assert.match(js,/name="discount"/);
 assert.match(js,/name="observation"/);
 assert.match(js,/name="manager"/);
 assert.match(js,/data-ri="use"/);
 assert.match(js,/confirm-used/);
 assert.match(js,/Cupón generado correctamente/);
 assert.match(js,/Reclamo guardado correctamente/);
 assert.match(js,/MG-###/);
 assert.doesNotMatch(js,/Cupón Vencido|estado.*expired/i);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:520px\)/);
 const {mod}=setup();assert(mod.permitido());
 const html=mod.view();
 assert.match(html,/Reclamos Internos/);assert.match(html,/Pendientes/);assert.match(html,/Usados/);
 assert.doesNotMatch(html,/Vencidos/);
});
test('La vista permite gerentes asignados, dueño y lectura; no expone otra sucursal ni colaboradores',()=>{
 assert(setup({role:'dueno',local:'nuevo-local',assigned:[]}).mod.permitido());
 assert(setup({role:'gerente',local:'nuevo-local',assigned:['nuevo-local']}).mod.permitido());
 assert(!setup({role:'gerente',local:'nuevo-local',assigned:['otra']}).mod.permitido());
 assert(!setup({role:'colaborador',local:'munro',assigned:['munro']}).mod.permitido());
 assert(!setup({role:'gerente',tenant:null}).mod.permitido());
 const readonly=setup({role:'lectura',readonly:true});assert(readonly.mod.permitido());
 assert.match(readonly.mod.view(),/data-ri="new" disabled/);
});
test('La base separa tenant + local, no reutiliza MG-000..999 y audita los cambios sin permitir revertir usado',()=>{
 assert.match(sql,/tenant_id uuid not null references gestlok_tenancy\.tenants/);
 assert.match(sql,/local_id text not null/);
 assert.match(sql,/code text not null unique check \(code ~ '\^MG-\[0-9\]\{3\}\$'\)/);
 assert.match(sql,/pg_catalog\.pg_advisory_xact_lock\(710622, 530\)/);
 assert.match(sql,/for i in 0\.\.999 loop/);
 assert.match(sql,/Se agotaron los 1000 códigos/);
 assert.match(sql,/case when c\.used_at is null then 'pending' else 'used' end/);
 assert.match(sql,/and used_at is null returning \* into c/);
 assert.match(sql,/and public\.mi_rol\(\) in \('creadora','dueno','gerente','editor'\)/);
 assert.match(sql,/public\.puede_editar_local\(p_local\)/);
 assert.match(sql,/public\.puede_ver_local\(p_local\)/);
 assert.match(sql,/where id=p_id and tenant_id=t and local_id=p_local/);
 assert.match(sql,/revoke all on table gestlok_reclamos_private\.coupons from public, anon, authenticated/);
 assert.match(sql,/grant execute on function public\.gestlok_reclamos_list/);
 assert.doesNotMatch(sql,/\b(delete from|drop table|truncate)\b/i);
 assert.doesNotMatch(sql,/gestlok_resenas_private\.coupons|gestlok_app_reviews/i);
});
test('Modal de alta y vista de detalles sin cupones reales',()=>{
 const {mod,listeners}=setup();
 const a={dataset:{ri:'new'}};
 listeners.click({target:{closest:()=>a}});
 const html=mod.view();
 assert.match(html,/Nuevo cupón/);assert.match(html,/MG-### · al guardar/);
 assert.match(html,/name="name" required/);
 assert.match(html,/name="phone" type="tel" required|type="tel" name="phone" required/);
 assert.match(html,/name="manager" required/);
 assert.match(html,/name="discount" required/);
 assert.match(html,/name="observation"/);
});
