import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const src=readFileSync('public/stock/gestlok-updates.js','utf8');
const migration=readFileSync('supabase/migrations/20261113015000_avisos_autorizados_por_solicitud.sql','utf8');
const open=avisos=>{
 const window={};
 vm.runInNewContext(src,{window,document:{addEventListener(){}},Intl,Date,Number,Math,String,Array,RegExp});
 window.GestLokUpdates.attach({
   S:{local:'munro',avisos,allProds:[{sinStock:true}],vencimientos:[],conteos:[]},
   localNombre:()=> 'Munro'
 });
 return window.GestLokUpdates;
};
test('Solo se ven publicaciones expresamente autorizadas, sin ocultar datos operativos',()=>{
 const api=open([
   {id:'a',titulo:'Conteo realizado',fecha:9000},
   {id:'b',titulo:'Pedido revisado',fecha:8000},
   {id:'c',titulo:'Actualización autorizada',detalle:'Horarios listos',fecha:7000,publicacion_autorizada:true},
   {id:'d',titulo:'Se añadió un producto',fecha:6000}
 ]);
 const home=api.homeAlerts(),center=api.viewAlerts();
 for(const result of [home,center]){
   assert.match(result,/Actualización autorizada/);
   assert.doesNotMatch(result,/Conteo realizado|Pedido revisado|Se añadió un producto/);
 }
 assert.doesNotMatch(center,/productos sin stock|Aún no hay conteos registrados hoy/);
 assert.match(center,/únicamente a pedido de la administradora/);
});
test('No se muestran mensajes sin aprobación, aunque la base conserve el historial',()=>{
 const api=open([{id:'auto',titulo:'Conteo realizado',fecha:100000}]);
 assert.match(api.homeAlerts(),/Sin novedades por ahora/);
 assert.match(api.viewAlerts(),/Sin notificaciones nuevas/);
});
test('SQL no elimina documentos y restringe lectura por rol y local',()=>{
 assert.match(migration,/DROP TRIGGER IF EXISTS gestlok_notify_docs_changes ON public\.docs/);
 assert.match(migration,/AS RESTRICTIVE FOR SELECT TO authenticated/);
 assert.match(migration,/public\.mi_rol\(\) IN \('creadora','dueno','gerente'\)/);
 assert.match(migration,/public\.puede_ver_local\(split_part\(col,'\/',1\)\)/);
 assert.match(migration,/publicacion_autorizada/);
 assert.doesNotMatch(migration,/DELETE FROM public\.docs|TRUNCATE/);
 assert.doesNotMatch(migration,/gestlok_push_capture|gestlok_push_devices/);
});
