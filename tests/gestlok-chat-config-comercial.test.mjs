import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentInquiry,scheduleInquiry,responder} from '../public/chat/motor.js';
import {readFileSync} from 'node:fs';

const s={horario:'Viernes de 10 a 18',dias_apertura:[5],atencion:{habilitado:true,abierto:false,proximo_texto:'viernes a las 10:00'},acepta_retiro:true,acepta_envio:true,medios_pago:['efectivo','transferencia'],medios_pago_retiro:['efectivo'],medios_pago_envio:['transferencia'],direccion:'Prueba 123',reservas_info:'Solicitá la reserva al gerente'};
const c={productos:[],categorias:[]};
const consultar=(texto,sucursal=s)=>responder({sucursal,catalogo:c,estado:{},entrada:{texto}}).mensajes[0].texto;
test('medios de pago con errores o lenguaje coloquial, según cada local',()=>{
  for(const frase of ['puedo tranferir','como abogo','como te pago','formas de pago','medios de pago','aceptan tarjetas','me pasas el alias']){
    assert(paymentInquiry(frase),frase);
    assert.match(consultar(frase),/Retiro.*Efectivo[\s\S]*Delivery.*Transferencia/i);
  }
  assert.equal(paymentInquiry('ya te pagué'),false);
  assert.equal(paymentInquiry('te envío el comprobante'),false);
  assert.doesNotMatch(consultar('formas de pago',{...s,medios_pago_envio:['credito']}),/Transferencia/);
});
test('preguntas de horarios y apertura sin confundir la demora del pedido',()=>{
  for(const frase of ['horarios','cuando abren?','estan trabajando','a que hora cierran','abren los domingos','trabajan hoy']){
    assert(scheduleInquiry(frase),frase);
    assert.match(consultar(frase),/cerrados/i);
  }
  assert.equal(scheduleInquiry('a qué hora llega mi pedido'),false);
  assert.match(consultar('están trabajando',{...s,atencion:{habilitado:true,abierto:true}}),/atendiendo/i);
});
test('permisos y publicación de información separados del transporte WhatsApp',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261126224500_gestlok_chat_config_comercial.sql',import.meta.url),'utf8');
 assert.match(sql,/registration_email\(\) = 'kmu15lopez@gmail.com'/);
 assert.match(sql,/Habilitación exclusiva de la administradora/);
 assert.match(sql,/gestlok_chat_private\.nivel_config\(p_sucursal, 'gestionar'\)/);
 assert.match(sql,/where id = p_sucursal and version = p_version/);
 assert.match(sql,/p_config - 'datos_transferencia'/);
 assert.match(sql,/bucket_id='gestlok-chat-cartas' and public.gestlok_chat_puede_subir_carta/);
});
