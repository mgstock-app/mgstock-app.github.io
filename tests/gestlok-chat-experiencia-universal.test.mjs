import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {usaMenuInteractivo, botonesBienvenida, responder} from '../public/chat/motor.js';
const src=path=>readFileSync(new URL('../'+path, import.meta.url),'utf8');
const cat=(nombre,id)=>({
 categorias:[{id:'cat',nombre:'Productos'}],
 productos:[{id,nombre,precio:2500,activo:true,disponible:true,categoria_id:'cat',opciones:[]}]
});
const local=(empresa,slug)=>({
 empresa,slug,nombre:'Sucursal 1',menu_interactivo:true,acepta_retiro:true,
 medios_pago:['efectivo','transferencia'],pedido_minimo:0
});

test('el menú interactivo usa configuración de cualquier sucursal, no la marca Mi Gusto',()=>{
 const negocios=[
  {s:local('Panadería Centro','panaderia-centro'),c:cat('Medialuna','pan')},
  {s:local('Café Avenida','cafe-avenida'),c:cat('Café en grano','cafe')}
 ];
 for(const {s,c} of negocios){
  assert.equal(usaMenuInteractivo(s),true);
  assert.equal(botonesBienvenida(s,c)[0].id,'carta');
  const result=responder({sucursal:s,catalogo:c,entrada:{inicio:true},estado:null,mensajes:{}});
  assert.ok(result.mensajes.length>0);
  assert.ok(result.mensajes[0].texto.includes('Hacer un pedido'));
  assert.doesNotMatch(result.mensajes[0].texto, /Mi Gusto|Munro|Torcuato/);
 }
});

test('interfaz compartida: buscadores, promoción en verde, datos, GPS, recompra y push',()=>{
 const js=src('public/chat/chat.js');
 const css=src('public/chat/chat.css');
 const html=src('public/chat/index.html');
 const panel=src('public/chat/panel/panel.js');
 assert.match(js,/menu-filtro-carta/);
 assert.match(js,/menu-filtro-variedades/);
 assert.match(js,/menu-fila-promo-elegida/);
 assert.match(js,/seleccion-linea-promo/);
 assert.match(js,/No, gracias, enviar/);
 assert.match(js,/Usar mi ubicación/);
 assert.match(js,/entre_calles/);
 assert.match(js,/Hacer un nuevo pedido/);
 assert.match(html,/btn-notificaciones/);
 assert.match(html,/cliente-push\.js/);
 assert.match(panel,/panel_push_promociones/);
 assert.match(css,/menu-fila-promo-elegida/);
 assert.doesNotMatch(js,/slug\s*===?\s*['"]mi-gusto-/);
});

test('al conectar una nueva empresa se hereda el menú y los locales inactivos se normalizan',()=>{
 const sql=src('supabase/migrations/20261121173000_gestlok_chat_experiencia_universal_al_vincular.sql');
 assert.match(sql,/alter column menu_interactivo set default true/i);
 assert.match(sql,/where activa=false and menu_interactivo=false/i);
 assert.doesNotMatch(sql,/set activa\s*=\s*true/i);
 const central=src('public/stock/gestlok-chat-central.js');
 assert.match(central,/gestlok_chat_panel_inicio/);
 assert.match(central,/servidor\.locales\.has\(local\(\)\)/);
});
