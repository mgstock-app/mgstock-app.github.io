import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cartaMarcaHabilitada,hojasCartaMarca} from '../public/chat/carta-marca.mjs';
test('carta visual opcional, marca preservada y comercio nuevo apagado',()=>{
 const slug='otro-local',entorno='produccion';
 assert.equal(cartaMarcaHabilitada(entorno,{slug},slug),false);
 assert.equal(cartaMarcaHabilitada(entorno,{slug,carta_visual_activa:true},slug),true);
 assert.equal(cartaMarcaHabilitada(entorno,{slug,carta_visual_marca:'mi-gusto',carta_visual_activa:false},slug),false);
 assert.equal(cartaMarcaHabilitada(entorno,{slug,carta_visual_marca:'mi-gusto'},slug),true);
 assert.equal(cartaMarcaHabilitada(entorno,{slug,carta_visual_activa:true},'otro'),false);
 assert.equal(cartaMarcaHabilitada(entorno,{slug,carta_visual_activa:true},slug,true),false);
 const p='11111111-1111-1111-1111-111111111111/1-a.webp',s={carta_visual_activa:true,carta_visual_hojas:[{path:p,titulo:'Carta',promo:true},{path:'https://evil.test/x',titulo:'No'}]};
 assert.equal(hojasCartaMarca('promos',s,'https://ejemplo.supabase.co').length,1);
 assert.equal(hojasCartaMarca('todo',s,'https://evil.test').length,0);
 assert.equal(hojasCartaMarca('todo',{...s,carta_visual_activa:false},'https://ejemplo.supabase.co').length,0);
 assert.equal(hojasCartaMarca('todo',{carta_visual_activa:true,carta_visual_marca:'mi-gusto'}).length,5);
});
test('permisos, bucket separado y menú interactivo',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261125213000_gestlok_chat_carta_visual_opcional.sql',import.meta.url),'utf8');
 assert.match(sql,/gestlok_chat_private.exigir\(p_sucursal/);
 assert.match(sql,/gestlok_chat_private.nivel/);
 assert.match(sql,/carta_visual_revision=p_revision/);
 assert.match(sql,/gestlok-chat-cartas/);
 assert.match(sql,/h->>'path' not in/);
 const js=readFileSync(new URL('../public/chat/chat.js',import.meta.url),'utf8');
 assert.match(js,/if\(!hojas.length\)return abrirCarta/);
});
