import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261105024900_mi_gusto_online_local_sin_efectivo.sql');
const js=read('public/stock/mi-gusto-cierre-online.js');

test('Mi Gusto: payload más reciente excluye efectivo de online, preserva recibos y tildes OK',()=>{
 assert.match(sql,/create or replace function gestlok_mg_online_private\.payload\(s gestlok_mg_online_private\.shifts\)/);
 assert.match(sql,/filter\(where m\.method='efectivo'\),0\) as efectivo/);
 assert.match(sql,/filter\(where m\.app and m\.method<>'efectivo'\),0\) as total_app/);
 assert.match(sql,/filter\(where m\.method<>'efectivo'\),0\) as total_ventas/);
 assert.match(sql,/'online_local',z\.total_ventas-z\.total_app/);
 assert.match(sql,/'ok',m\.cash_checked/);
 assert.match(sql,/'discount_amount',m\.discount_amount/);
 assert.doesNotMatch(sql,/\b(?:delete from|drop table|truncate table)\b/i);
});

test('Mi Gusto: ejemplo real, Online Local no suma $305.460 de efectivo',()=>{
 const movements=[
 {method:'transferencia',amount:278600,app:false},
 {method:'getnet',amount:57400,app:false},
 {method:'mercado_pago',amount:230500,app:true},
 {method:'mercado_pago',amount:24300,app:false},
 {method:'efectivo',amount:305460,app:false},
 ];
 const total=movements.reduce((v,m)=>v+m.amount,0);
 const efectivo=movements.filter(m=>m.method==='efectivo').reduce((v,m)=>v+m.amount,0);
 const online=movements.filter(m=>m.method!=='efectivo');
 const onlineTotal=online.reduce((v,m)=>v+m.amount,0);
 const app=online.filter(m=>m.app).reduce((v,m)=>v+m.amount,0);
 assert.equal(total,896260);
 assert.equal(efectivo,305460);
 assert.equal(onlineTotal,590800);
 assert.equal(app,230500);
 assert.equal(onlineTotal-app,360300);
});

test('Mi Gusto: caja UI deja efectivo aparte y preserva el detalle histórico',()=>{
 new Script(js);
 assert.match(js,/Online Local = Transferencia \+ Getnet \+ Mercado Pago/);
 assert.match(js,/El efectivo se controla aparte/);
 assert.match(js,/function cashMovementDetail\(s=snapshot\?\.active\)/);
 assert.match(js,/gestlok_mg_online_cash_ok/);
 assert.match(js,/function reportTurn\(s,turno\)/);
});
