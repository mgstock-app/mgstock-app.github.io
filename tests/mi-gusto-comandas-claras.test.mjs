import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext, Script} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=read('public/stock/mi-gusto-cierre-online.js');
const css=read('app/mi-gusto-pagos-online.css');
const instrumented=js.replace('window.GestLokMiGustoOnline=Object.freeze(', 'window.__recentTest={movementList,configure:(state,handler)=>{snapshot=state;api=handler;}};\nwindow.GestLokMiGustoOnline=Object.freeze(');
const window={};
new Script(instrumented);
runInNewContext(instrumented,{
 window,document:{addEventListener:()=>{}},navigator:{onLine:true},
 Intl,Date,String,Number,Array,Object,console,queueMicrotask:()=>{}
});

const movement={id:'11111111-1111-4111-8111-111111111111',comanda:'72',method:'mercado_pago',amount:12900,
 created_at:'2026-11-05T02:00:00Z',app:true,observacion:'Pago junto con #71'};
const efectivo={...movement,id:'22222222-2222-4222-8222-222222222222',comanda:'71',method:'efectivo',amount:900,gross_amount:1000,discount_amount:100,app:false};
window.__recentTest.configure({active:{day:'2026-11-04',turno:'tarde',movements:[efectivo,movement]}},{
 S:{local:'munro',me:{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'},offline:false},
 miRol:()=> 'dueno',misLocales:()=>['munro','torcuato']
});

test('Mi Gusto: cada tarjeta ordena numero, monto, APP, hora/medio y acciones',()=>{
 const html=window.__recentTest.movementList();
 const a=html.indexOf('<div class="mg-on-recent-desktop">');
 const b=html.indexOf('<div class="mg-on-recent-mobile">');
 assert.ok(a>0&&b>a);
 const card=html.slice(a,b);
 const order=['class="mg-on-recent-order"','class="mg-on-recent-amount"','class="mg-on-recent-app"','class="mg-on-recent-meta"','class="mg-on-recent-commands"'];
 let prev=-1;
 for(const part of order){const index=card.indexOf(part);assert.ok(index>prev,part);prev=index;}
 assert.match(card,/#72/);
 assert.match(card,/12\.900/);
 assert.match(card,/Mercado Pago/);
 assert.match(card,/data-mgon-app="11111111-1111-4111-8111-111111111111"/);
 assert.match(card,/data-mgon-edit="11111111-1111-4111-8111-111111111111"/);
 assert.match(card,/data-mgon-delete="11111111-1111-4111-8111-111111111111"/);
 assert.match(card,/Pago junto con #71/);
 assert.match(html,/Bruto/);
 assert.match(html,/10% OFF/);
 assert.match(html,/mg-on-recent-mobile/);
});

test('Mi Gusto: comandas visibles en PC y celular sin afectar historial ni caja',()=>{
 assert.match(css,/\.mg-on-recent-row-main\{display:grid/);
 assert.match(css,/grid-template-areas:"order amount" "app meta" "commands commands"/);
 assert.match(css,/\.mg-on-recent-order\{display:grid/);
 assert.match(js,/function cashMovementDetail\(s=snapshot\?\.active\)/);
 assert.match(js,/function reportTurn\(s,turno\)/);
 assert.match(js,/gestlok_mg_online_cash_ok/);
 assert.match(read('components/stock-runtime.tsx'),/mi-gusto-cierre-online\.js\?rev=total-efectivo-20261105/);
});
