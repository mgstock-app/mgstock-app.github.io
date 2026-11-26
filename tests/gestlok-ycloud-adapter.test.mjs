import test from 'node:test';import assert from 'node:assert/strict';import {previewWhatsApp,projectWhatsApp,selectPreviewOption,completePreviewProduct,checkoutPreview} from '../supabase/functions/gestlok-ycloud-adapter/preview.mjs';
const sucursal={nombre:'Local ficticio',empresa:'Empresa ficticia',slug:'prueba',acepta_retiro:true,acepta_envio:false,medios_pago:['efectivo']};
const catalogo={categorias:[{id:'c1',nombre:'Empanadas'}],productos:[{id:'p1',categoria_id:'c1',nombre:'Empanada ficticia',precio:1000,activo:true,disponible:true,opciones:[]},{id:'p2',categoria_id:'c1',nombre:'Agotado ficticio',precio:2000,activo:true,disponible:false,opciones:[]}]};
test('reutiliza motor real para bienvenida y carta sin enviar mensajes',async()=>{const r=await previewWhatsApp({sucursal,catalogo,entrada:{inicio:true}});assert.ok(r.projection.messages.length);assert.equal(r.projection.sendAllowed,false);const p=projectWhatsApp({mensajes:[{tipo:'carta',categoria:'c1'}]},catalogo);assert.equal(p.options.length,1);assert.match(p.options[0].label,/Empanada ficticia/);assert.deepEqual(selectPreviewOption(p,'1'),{boton:'elegir:p1:1'});assert.equal(selectPreviewOption(p,'99'),null);});
test('no simula que las opciones obligatorias o los datos ya están resueltos',()=>{const p=projectWhatsApp({mensajes:[{tipo:'producto'},{tipo:'datos'}],accion:{tipo:'crear_pedido'}},catalogo);assert.deepEqual(p.pending,['selector_producto','formulario_datos','accion_crear_pedido']);assert.equal(p.sendAllowed,false);});
test('reclamo no ejecuta IA ni crea tickets reales',async()=>{const p=await previewWhatsApp({sucursal,catalogo,entrada:{boton:'hablar_gerente'}});assert.equal(p.projection.sendAllowed,false);assert.ok(p.projection.pending.includes('derivacion_humana'));});

test('promoción exige todas las variedades y salsas, sin saltar cantidades ni agotados',()=>{
 const cat={...catalogo,productos:[...catalogo.productos,{id:'promo',nombre:'Pack ficticio',precio:5000,activo:true,disponible:true,opciones:[{id:'emp',nombre:'Empanadas',tipo:'cantidad',total:6,valores:[{id:'carne',nombre:'Carne',producto_id:'p1'},{id:'agotada',nombre:'Agotada',producto_id:'p2'}]},{id:'salsas',nombre:'Salsas',tipo:'cantidad',total:2,valores:[{id:'ajo',nombre:'Ajo'}]}]}]};
 const projection=projectWhatsApp({mensajes:[{tipo:'producto',productos:['promo'],cantidad:1}]},cat);
 assert.equal(projection.selectors[0].groups[0].values.length,1);
 const base={projection,catalogo:cat,lotId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
 const run=options=>completePreviewProduct({...base,selection:{productId:'promo',quantity:1,options}});
 assert.equal(run({emp:{carne:6}}).ok,false);
 assert.equal(run({emp:{carne:5,agotada:1},salsas:{ajo:2}}).ok,false);
 assert.equal(run({emp:{carne:6},salsas:{ajo:1}}).ok,false);
 const r=run({emp:{carne:6},salsas:{ajo:2}});assert.equal(r.ok,true);assert.equal(r.estimatedTotal,5000);assert.equal(r.entry.agregar_varios[0].producto_id,'promo');
 assert.equal(completePreviewProduct({...base,selection:{productId:'p1',quantity:1,options:{}}}).ok,false);
});

test('checkout ficticio respeta retiro, entrega, pagos y confirmación explícita',()=>{
 const s={...sucursal,acepta_envio:true,medios_pago_envio:['efectivo','transferencia'],medios_pago_retiro:['debito']};
 const estado={carrito:[{producto_id:'p1',cantidad:2,opciones:{}}]};
 const base={sucursal:s,catalogo,estado};const datos={entrega:'envio',nombre:'Persona ficticia',telefono:'+5491100000000',direccion:'Calle ficticia 123',medio_pago:'efectivo'};
 assert.equal(checkoutPreview(base).field,'entrega');
 assert.equal(checkoutPreview({...base,datos:{...datos,telefono:'123'}}).stage,'review');
 assert.equal(checkoutPreview({...base,datos:{...datos,direccion:''}}).field,'direccion');
 assert.equal(checkoutPreview({...base,datos:{...datos,medio_pago:'debito'}}).field,'medio_pago');
 assert.equal(checkoutPreview({...base,datos}).field,'efectivo_abona');
 const complete={...datos,efectivo_abona:'5000'};
 const review=checkoutPreview({...base,datos:complete});assert.equal(review.stage,'confirm');assert.equal(review.action,undefined);
 const result=checkoutPreview({...base,datos:complete,confirmed:true});assert.equal(result.stage,'preview_order');assert.equal(result.action.tipo,'crear_pedido');assert.equal(result.sendAllowed,false);assert.equal(result.estimatedProductsTotal,2000);
 assert.equal(checkoutPreview({...base,datos:{...complete,entrega:'retiro'}}).field,'medio_pago');
});
