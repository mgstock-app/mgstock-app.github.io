import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {planCommerceCatalog,commerceProductList,readCommerceOrder,validateCommerceOrder,retailerId,assertDistinctCommerceCatalogs} from '../supabase/functions/gestlok-ycloud-adapter/commerce.mjs';
import {conversationPreview} from '../supabase/functions/gestlok-ycloud-adapter/conversation.mjs';
import {createMetaDirectHandler} from '../scripts/gestlok-meta-direct/receiver.mjs';
import {projectMetaServiceTurn} from '../scripts/gestlok-meta-direct/outbound-preview.mjs';
const now=new Date('2026-11-26T22:00:00Z'),phone='+5491100000000';
const sucursal={nombre:'Local ficticio',empresa:'Comercio ficticio',acepta_retiro:true,acepta_envio:true,medios_pago:['efectivo','transferencia'],medios_pago_retiro:['efectivo','transferencia'],medios_pago_envio:['efectivo','transferencia']};
const baseCat={categorias:[{id:'emp',nombre:'Empanadas'},{id:'promo',nombre:'Promociones'}],productos:[
 {id:'carne',nombre:'Carne',categoria_id:'emp',precio:1200,activo:true,disponible:true,opciones:[]},
 {id:'combo',nombre:'Combo 2 empanadas',categoria_id:'promo',precio:2100,activo:true,disponible:true,opciones:[
  {id:'sabores',nombre:'Empanadas',tipo:'cantidad',total:2,valores:[{id:'carne',nombre:'Carne',producto_id:'carne'},{id:'queso',nombre:'Queso'}]}]}
]};
function fixture(s=sucursal){
 const catalogo=structuredClone(baseCat);
 const route={empresa:'ficticia',sucursal:'local-a',sucursalId:'a',slug:'local-ficticio-a',waba:'11111',phoneId:'22222',to:'+5491100000001',allowSenders:[phone],
  commerceCatalog:{enabled:true,id:'12345678',sucursalId:'a',readbackAt:now.toISOString(),images:{carne:'https://example.com/carne.jpg',combo:'https://example.com/combo.jpg'},published:[]}};
 const args={route,sucursal:s,catalogo,ahora:now};
 route.commerceCatalog.published=planCommerceCatalog(args).upsert;
 return args;
}
const nativeOrder=(args,items=[['carne',2,1200],['combo',1,2100]])=>({type:'order',order:{catalog_id:args.route.commerceCatalog.id,product_items:items.map(([id,quantity,item_price])=>({product_retailer_id:retailerId(args.route.sucursalId,id),quantity,item_price,currency:'ARS'}))}});
function client(args){
 let state,last,n=0;
 const send=async(event)=>{last=await conversationPreview({identity:{empresa:args.route.empresa,sucursal:args.route.sucursal,phone},sucursal:args.sucursal,catalogo:args.catalogo,commerceRoute:args.route,ahora:now,session:state,event:{id:'e'+(++n),text:'',...event}});state=structuredClone(last.session);return last;};
 return {send,say:text=>send({text}),click:async(option)=>{
  const o=last.options.find(x=>x.id===option);assert.ok(o,'Opción '+option+' en '+JSON.stringify(last.options));const id=Object.keys(last.session.nativeMenu||{}).find(k=>last.session.nativeMenu[k]===String(o.number));
  return send(id?{interactiveId:id}:{text:String(o.number)});
 },get last(){return last;}};
}
test('sincronización de catálogo por local y fotos aprobadas, sin alterar artículos ajenos',()=>{
 const args=fixture(),b=args.route.commerceCatalog;
 assert.equal(planCommerceCatalog(args).ready.length,2);
 assert.deepEqual(planCommerceCatalog(args).upsert,[]);
 assert.deepEqual(planCommerceCatalog(args).retire,[]);
 assert.equal(commerceProductList(args).type,'product_list');
 assert.equal(commerceProductList(args,'promo').action.sections[0].product_items.length,1);
 const foreign={...b.published[0],retailer_id:'gl:b:carne'};b.published.push(foreign);
 args.catalogo.productos[0].precio=1450;
 assert.equal(planCommerceCatalog(args).upsert[0].price,145000);
 assert.equal(commerceProductList(args),null);
 args.catalogo.productos[1].disponible=false;
 assert.deepEqual(planCommerceCatalog(args).retire,[{retailer_id:'gl:a:combo',availability:'out of stock'}]);
 assert.ok(!JSON.stringify(planCommerceCatalog(args).retire).includes('gl:b:'));
 b.images.carne='https://example.com/private.jpg?secret=token';
 assert.ok(!planCommerceCatalog(args).upsert.length);
 assert.equal(commerceProductList(args),null);
 assert.throws(()=>assertDistinctCommerceCatalogs([args.route,{...args.route,sucursal:'b'}]));
});
test('catálogo desactivado, precios alterados, divisa, cantidades, SKUs y catálogo ajeno fallan cerrado',()=>{
 const args=fixture(),m=nativeOrder(args);
 assert.equal(validateCommerceOrder(args,readCommerceOrder(m)).length,2);
 for(const change of [
  x=>x.order.catalog_id='87654321',
  x=>x.order.product_items[0].product_retailer_id='gl:other:carne',
  x=>x.order.product_items[0].quantity=99,
  x=>x.order.product_items[0].item_price='1.00',
  x=>x.order.product_items[0].currency='USD',
  x=>x.order.product_items.push(x.order.product_items[0])
 ]){
  const x=structuredClone(m);change(x);assert.equal(validateCommerceOrder(args,readCommerceOrder(x)),null);
 }
 args.catalogo.productos[0].precio=1500;assert.equal(validateCommerceOrder(args,readCommerceOrder(m)),null);
 args.route.commerceCatalog.enabled=false;assert.equal(commerceProductList(args),null);
});
test('pedido nativo: catálogo real proyectado, validación de sabores, cantidades y confirmación gerente',async()=>{
 const args=fixture(),u=client(args);
 await u.say('Hola');await u.click('carta');assert.equal(u.last.native.type,'product_list');
 const p=projectMetaServiceTurn({from:args.route.to,to:phone,metaPhoneId:args.route.phoneId,turn:u.last,lastInboundAt:+now-1000,now});
 assert.equal(p.payloads[0].interactive.type,'product_list');assert.equal(p.dispatchAllowed,false);
 await u.send({cart:readCommerceOrder(nativeOrder(args))});
 assert.equal(u.last.session.stage,'native_cart_review');assert.equal(u.last.session.engine.carrito.length,0);
 await u.click('review_native');assert.equal(u.last.session.stage,'product_review');
 await u.click('add');assert.equal(u.last.session.stage,'flavor');assert.equal(u.last.session.engine.carrito.length,0);
 await u.say('1x1, 2x1');assert.equal(u.last.session.stage,'product_review');
 await u.click('add');assert.equal(u.last.session.engine.carrito.length,2);assert.equal(u.last.action,undefined);
 await u.click('finalizar');if(u.last.session.stage==='menu')await u.click('finalizar');
 await u.click('retiro');await u.say('Cliente ficticio');await u.click('transferencia');
 assert.equal(u.last.session.stage,'confirm');assert.match(u.last.messages.join(' '),/4\.500/);
 await u.click('confirm');assert.equal(u.last.action.type,'simulated_order');assert.equal(u.last.sendAllowed,false);
 assert.equal(u.last.session.stage,'submitted');
});
test('cart import atómico: precio cambia durante revisión o cancelar deja cero líneas',async()=>{
 const args=fixture(),u=client(args);
 await u.send({cart:readCommerceOrder(nativeOrder(args))});
 await u.click('review_native');await u.click('add');assert.equal(u.last.session.engine.carrito.length,0);
 args.catalogo.productos[0].precio=1400;
 await u.say('1x2');await u.click('add');assert.equal(u.last.session.engine.carrito.length,0);
 assert.match(u.last.messages.join(' '),/catálogo cambió/);
 const b=fixture(),v=client(b);
 await v.send({cart:readCommerceOrder(nativeOrder(b))});await v.click('review_native');await v.click('add');await v.say('cancelar carrito');
 assert.equal(v.last.session.engine.carrito.length,0);assert.equal(v.last.session.nativeCart,undefined);
});
test('local cerrado: programa pedido y solicita confirmación, nunca se crea un pedido inmediato',async()=>{
 const args=fixture({...sucursal,atencion:{habilitado:true,abierto:false,proxima_apertura:'2026-11-27T15:00:00.000Z'}});
 const u=client(args);await u.send({cart:readCommerceOrder(nativeOrder(args,[['carne',1,1200]]))});
 await u.click('review_native');await u.click('add');await u.click('finalizar');assert.equal(u.last.action,undefined);
 assert.ok(u.last.options.some(x=>x.id==='programar_si'));await u.click('programar_si');
 assert.equal(u.last.session.engine.programado,true);assert.equal(u.last.action,undefined);
 await u.click('finalizar');if(u.last.session.stage==='menu')await u.click('finalizar');
 await u.click('retiro');await u.say('Cliente ficticio');await u.click('transferencia');await u.click('confirm');
 assert.equal(u.last.action.type,'simulated_order');assert.equal(u.last.sendAllowed,false);
});
test('webhook Meta firmado, deduplicado, aislado por ruta y nunca autoriza envío',async()=>{
 const args=fixture();const route=args.route,secret='secreto-ficticio-solo-prueba-123456789';
 let state=null,rev=0,commits=0;const seen=new Set();
 const store={isExcluded:async()=>false,load:async()=>({state,revision:rev,sucursal:args.sucursal,catalogo:args.catalogo}),
  commit:async x=>{if(seen.has(x.messageId))return {status:'duplicate'};assert.equal(x.order,null);assert.equal(x.customer,'Carrito de WhatsApp');seen.add(x.messageId);commits++;state=structuredClone(x.state);rev++;return {status:'committed'};}};
 const h=createMetaDirectHandler({projectRef:'irqeitzbfyerxcrogkyh',appSecret:secret,verifyToken:secret,routes:[route],store,enabled:true,dryRunOnly:true,now:()=>+now});
 const m={...nativeOrder(args),id:'wamid.cart01',from:phone.slice(1),timestamp:String(Math.floor(+now/1000))};
 const raw=Buffer.from(JSON.stringify({object:'whatsapp_business_account',entry:[{id:route.waba,changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{phone_number_id:route.phoneId},messages:[m]}}]}]}));
 const request={method:'POST',url:'/webhooks/meta',raw,signature:'sha256='+createHmac('sha256',secret).update(raw).digest('hex')};
 assert.equal((await h({...request,signature:'sha256='+'0'.repeat(64)})).status,403);
 assert.equal(commits,0);assert.equal((await h(request)).sendAllowed,false);assert.equal(state.stage,'native_cart_review');await h(request);assert.equal(commits,1);
});

test('sin lectura reciente del proveedor o con catálogo superior al límite, vuelve a carta guiada',()=>{
 const args=fixture();
 assert.equal(commerceProductList({...args,ahora:new Date(+now+11*60000)}),null);
 assert.equal(validateCommerceOrder({...args,ahora:new Date(+now+11*60000)},readCommerceOrder(nativeOrder(args))),null);
 for(let i=0;i<31;i++){const id='p'+i;args.catalogo.productos.push({id,nombre:'Producto '+i,precio:10,categoria_id:'emp'});args.route.commerceCatalog.images[id]='https://example.com/'+id+'.jpg';}
 args.route.commerceCatalog.published.push(...planCommerceCatalog(args).upsert);
 assert.equal(commerceProductList(args),null);
 assert.equal(commerceProductList(args,'promo').type,'product_list');
});
test('un carrito recibido no reemplaza ni mezcla una selección pendiente',async()=>{
 const args=fixture(),u=client(args);await u.send({cart:readCommerceOrder(nativeOrder(args))});
 await u.click('review_native');await u.click('add');
 const previous=structuredClone(u.last.session.nativeCart);
 await u.send({cart:readCommerceOrder(nativeOrder(args,[['carne',1,1200]]))});
 assert.deepEqual(u.last.session.nativeCart,previous);
 assert.equal(u.last.session.engine.carrito.length,0);
 assert.match(u.last.messages.join(' '),/No se reemplazó/);
});
