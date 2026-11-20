import test from 'node:test';
import assert from 'node:assert/strict';
import {responder} from '../public/chat/motor.js';

const catalogo={categorias:[],productos:[
  {id:'a',nombre:'Empanada de carne',precio:1200,activo:true,disponible:true,opciones:[]}
]};
const estado={carrito:[{producto_id:'a',cantidad:2,opciones:{},nota:''}],paso:'datos'};
const sucursal={acepta_envio:true,descuento_efectivo_pct:10,atencion:{habilitado:false}};
const datos={nombre:'Cliente de prueba',telefono:'1155550001',entrega:'envio',direccion:'Mitre 300',horario:'',
  medio_pago:'transferencia',nota:''};

test('transferencia: ofrece efectivo 10% y espera los datos del gerente',()=>{
  const r=responder({sucursal,catalogo,estado,entrada:{datos},mensajes:{}});
  assert.match(r.mensajes[0].texto,/10% de descuento/i);
  assert.match(r.mensajes[0].texto,/gerente le enviará los datos/i);
  assert.equal(r.accion.tipo,'crear_pedido');
  assert.equal(r.accion.pedido.medio_pago,'transferencia');
  assert.equal(r.estado.carrito.length,1,'la IA no confirma el pedido');
});

test('delivery efectivo: el monto de pago viaja al servidor para calcular cambio',()=>{
  const r=responder({sucursal,catalogo,estado,entrada:{datos:{...datos,medio_pago:'efectivo',efectivo_abona:'3000'}},mensajes:{}});
  assert.equal(r.accion.pedido.efectivo_abona,'3000');
  assert.equal(r.accion.tipo,'crear_pedido');
});

test('descuento solo donde fue habilitado por la sucursal',()=>{
  const r=responder({sucursal:{...sucursal,descuento_efectivo_pct:0},catalogo,estado,entrada:{datos},mensajes:{}});
  assert.ok(!r.mensajes.some(m=>/10%/.test(m.texto)));
});
