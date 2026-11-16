import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { releaseAudience,TENANTS } from '../scripts/pwa-release-scope.mjs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261116174600_mi_gusto_conteo_conciliar_manana_noche.sql');
const morning=read('public/stock/mi-gusto-conteo-morning.js');
const main=read('public/stock/mi-gusto-conteo.js');
const css=read('app/mi-gusto-conteo.css');
const runtime=read('components/stock-runtime.tsx');

for(const local of ['munro','torcuato']){
 test(local+': compara noche de D-1 y mañana de D con validaciones en el servidor',()=>{
  const prefix='gestlok_'+local+'_conteo',priv=prefix+'_private';
  assert.ok(sql.includes('create or replace function public.'+prefix+'_compare_morning(p_day date)'));
  assert.ok(sql.includes('create or replace function public.'+prefix+'_ack_morning('));
  assert.ok(sql.includes('create or replace function public.'+prefix+'_finalize(p_day date,p_shift text)'));
  assert.ok(sql.includes('perform '+priv+'.require_access(true,false)'));
  assert.ok(sql.includes('left join '+priv+'.shifts b'));
  assert.ok(sql.includes('on b.day=p_day-1'));
  assert.ok(sql.includes("and m.shift='manana_entrada'"));
  assert.ok(sql.includes("where x.night_total<>x.morning_total and not x.acknowledged"));
  assert.ok(sql.includes('create table if not exists '+priv+'.morning_reconciliations'));
  assert.ok(sql.includes('alter table '+priv+'.morning_reconciliations enable row level security'));
  assert.ok(sql.includes('revoke all on '+priv+'.morning_reconciliations from public,anon,authenticated'));
  assert.ok(sql.includes('night_updated_at'));
  assert.ok(sql.includes('acknowledged_by uuid not null'));
  assert.ok(sql.includes('create or replace function '+priv+'.reject_morning_consumption()'));
  assert.ok(sql.includes('before insert or update on '+priv+'.shifts'));
  assert.ok(sql.includes('revoke all on function public.'+prefix+'_ack_morning'));
  assert.ok(sql.includes('grant execute on function public.'+prefix+'_ack_morning'));
  assert.ok(sql.includes("coalesce((v.x->>'qty')::bigint,0)"));
 });
}
test('Excepción 14/11 Munro: no altera el turno real, pero sirve como noche anterior del 15/11',()=>{
 assert.match(sql,/local/i); // aislamiento por esquemas
 assert.match(sql,/p_day=date '2026-11-15'/);
 assert.match(sql,/then 'manana_entrada' else 'noche_salida'/);
 assert.match(sql,/p_day-1/);
 assert.doesNotMatch(sql,/update .*shifts set shift=/);
});
test('Mañana entrada no tiene Consumos pero los otros turnos siguen intactos',()=>{
 assert.match(main,/shift==='manana_entrada'\?'':extraTable\('consumption'/);
 assert.match(main,/shift==='manana_entrada'\?'':'<button type="button" data-gcm-nav-extras="consumption"/);
 assert.match(main,/if\(kind==='consumption'&&shift==='manana_entrada'\)return/);
 assert.match(main,/rec.shift==='manana_entrada'\?'':/);
 assert.match(main,/if\(hasConsumption\)write\('10 ESPACIOS DE CONSUMO'/);
});
test('Se resaltan productos en rojo y se priorizan empanadas y pizzas',()=>{
 assert.match(main,/data-gcm-morning-row/);
 assert.match(main,/gcm-morning-difference/);
 assert.match(css,/\.gcm-count-data-table tbody tr\.gcm-morning-difference/);
 assert.match(css,/\.gcm-morning-item\.is-confirmed/);
 assert.match(main,/\/EMPANADA\/i\.test\(a\)/);
 assert.match(main,/\/PIZZA\/i\.test\(a\)/);
 assert.match(main,/if\(currentShift==='manana_entrada'\)/);
 assert.match(main,/await verifyTurnSaved\(true\)/);
 assert.match(main,/await morning\(\)\?\.load\(morningCtx\(\),false\)/);
 assert.match(runtime,/mi-gusto-conteo-morning\.js\?rev=conciliacion-20261116/);
 assert.ok(runtime.indexOf('mi-gusto-conteo-morning.js?rev')<runtime.indexOf('mi-gusto-conteo.js?rev'),'orden de carga');
 assert.doesNotThrow(()=>new vm.Script(main));
 assert.doesNotThrow(()=>new vm.Script(morning));
});
function makeHarness(){
 const events=new Map(),calls=[];
 const win={confirm:()=>true},doc={addEventListener:(name,fn)=>events.set(name,fn),querySelector:()=>null};
 vm.runInNewContext(morning,{window:win,document:doc,Date,setTimeout,clearTimeout,console});
 let ack=false;
 const row=()=>({id:'pizza',section:'PIZZAS',name:'Pizza GR',
  night_total:20,morning_total:18,difference:-2,acknowledged:ack,night_updated_at:'2026-11-15T23:00:00Z'});
 const ctx={local:'munro',day:'2026-11-16',editable:true,toast:()=>{},render:()=>{},
 rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='gestlok_munro_conteo_compare_morning')return {baseline_ready:true,previous_day:'2026-11-15',rows:[row()]};
  if(name==='gestlok_munro_conteo_ack_morning'){ack=args.p_confirm;return {ok:true};}
  throw Error('Unexpected RPC '+name);
 }};
 return {mod:win.GestLokConteoMorning,ctx,events,calls,ack:()=>ack};
}
test('Diferencia visible + checkbox OK; al confirmar se guarda y libera el pendiente',async()=>{
 const h=makeHarness();
 const data=await h.mod.load(h.ctx,false);
 assert.equal(data.rows.length,1);
 assert.equal(h.mod.ready(),false);
 assert.equal(h.mod.pending().length,1);
 assert.match(h.mod.panel(),/Pizza GR/);
 assert.match(h.mod.panel(),/Diferencia/);
 assert.match(h.mod.panel(),/data-gcm-morning-ok="pizza"/);
 assert.match(h.mod.panel(),/20/);
 assert.match(h.mod.panel(),/18/);
 const input={dataset:{gcmMorningOk:'pizza'},checked:true,closest:s=>s==='[data-gcm-morning-ok]'?input:s==='.gcm-count-screen'?{}:null};
 h.events.get('change')({target:input,preventDefault(){},stopImmediatePropagation(){}});
 for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.ack(),true);
 assert.equal(h.mod.ready(),true);
 assert.equal(h.mod.pending().length,0);
 assert.ok(h.calls.some(c=>c.name==='gestlok_munro_conteo_ack_morning'&&c.args.p_product==='pizza'&&c.args.p_confirm===true));
});
test('Al cambiar de local no reutiliza las diferencias de Munro en Torcuato',async()=>{
 const h=makeHarness();await h.mod.load(h.ctx,false);
 assert.equal(h.mod.pending().length,1);
 const other={...h.ctx,local:'torcuato'};
 h.mod.connect(other);
 assert.equal(h.mod.pending().length,0);
 assert.match(h.mod.panel(),/Verificá los totales/);
});

test('PWA: cachear el controlador nocturno solo avisa a Mi Gusto, no a otras empresas',()=>{
 const older="const SHELL = ['/', '/stock/mi-gusto-conteo.js'].map(path => BASE + path);";
 const updated="const SHELL = ['/', '/stock/mi-gusto-conteo-morning.js', '/stock/mi-gusto-conteo.js'].map(path => BASE + path);";
 const patch='@@ -1 +1 @@\n-'+older+'\n+'+updated+'\n';
 assert.deepEqual(releaseAudience(['scripts/sw-template.js'],{'scripts/sw-template.js':patch}),[TENANTS.miGusto]);
 assert.deepEqual(releaseAudience(['scripts/sw-template.js'],{'scripts/sw-template.js':'@@\n-console.log(1)\n+console.log(2)'}),['*']);
});
