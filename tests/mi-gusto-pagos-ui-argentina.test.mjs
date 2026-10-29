import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source = read('public/stock/mi-gusto-cierre-online.js');
const styles = read('app/mi-gusto-pagos-online.css');

test('Pagos Online muestra tarjeta de carga, lista responsive y confirmación real',()=>{
 assert.match(source,/Carga manual de pedidos/);
 assert.match(source,/Guardar movimiento/);
 assert.match(source,/Últimos movimientos/);
 assert.match(source,/mg-on-recent-desktop/);
 assert.match(source,/mg-on-recent-mobile/);
 assert.match(source,/mg-on-success/);
 assert.match(source,/saveNotice=notify==='Movimiento guardado\.'/);
 assert.match(source,/data-mgon-edit/);
 assert.match(source,/data-mgon-delete/);
 assert.match(source,/data-mgon-app/);
 assert.match(source,/data-mgon-photo/);
 assert.match(source,/Foto asociada al cierre de/);
 assert.match(styles,/@media\(max-width:760px\)/);
 assert.match(styles,/\.mg-on-recent-mobile\{display:grid/);
 assert.match(styles,/\.mg-on-recent-desktop\{display:none/);
 assert.match(styles,/@media\(max-width:520px\)/);
 assert.match(styles,/\.mg-on-fields\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(styles,/font-size:16px/);
 assert.match(styles,/\.mg-on-success/);
 assert.match(read('components/stock-runtime.tsx'),/pagos-recientes-ar-20261029/);
});

test('Fecha y hora son Argentina incluso en el cambio de día UTC',()=>{
 const hooks=[];
 class Clock29 extends Date {
  constructor(...args){super(...(args.length?args:['2026-10-30T01:15:00Z']));}
  static now(){return Date.parse('2026-10-30T01:15:00Z');}
 }
 const window={};
 const document={querySelector:()=>null,addEventListener:(type,listener)=>hooks.push([type,listener])};
 runInNewContext(source,{
   window,document,Intl,Date:Clock29,String,Number,Array,Object,console,
   navigator:{onLine:true},queueMicrotask:()=>{}
 });
 const mod=window.GestLokMiGustoOnline;
 assert.equal(mod._test.todayArgentina(),'29/10/2026');
 assert.match(mod._test.timeOf('2026-10-30T01:15:00Z'),/22:15/);
 const d=read('supabase/migrations/20261029150000_mi_gusto_cierre_online.sql');
 assert.match(d,/now\(\) at time zone 'America\/Argentina\/Buenos_Aires'/);
 assert.match(d,/gestlok_mg_online_private\.today_ar\(\)/);
 const css=read('app/mi-gusto-pagos-online.css');
 assert.match(css,/\.mg-on-period/);
 const captured={};
 mod.attach({
  S:{me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},local:'munro',offline:false,view:'cierre-online'},
  miRol:()=>'gerente',misLocales:()=>['munro'],render:()=>{}
 });
 assert.match(mod.view(),/Hoy en Argentina <strong>29\/10\/2026/);
 assert.match(mod.view(),/Fecha del turno/);
});
