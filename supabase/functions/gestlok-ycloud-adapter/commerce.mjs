// Offline commerce adapter. The server owns each catalog binding and approved
// image URLs. No Graph/YCloud calls, no publication, no dispatch.
import {carteleraDelDia,valoresDisponibles} from '../gestlok-chat/motor.js';
const id=/^[A-Za-z0-9_-]{1,80}$/;
const catalogId=/^\d{5,25}$/;
const skuPattern=/^gl:[A-Za-z0-9_-]{1,80}:[A-Za-z0-9_-]{1,80}$/;
const text=v=>String(v??'').trim();
const short=(v,max)=>Array.from(text(v)).slice(0,max).join('');
const fields=['retailer_id','name','description','price','currency','availability','image_url','url','condition'];
const approvedUrl=v=>{
 if(typeof v!=='string'||v.length>2000)return null;
 try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash?u.href:null;}catch{return null;}
};
function minor(v){
 if(typeof v!=='number'&&typeof v!=='string'||!/^\d{1,10}(?:\.\d{1,2})?$/.test(String(v)))return null;
 const cents=Math.round(Number(v)*100);return Number.isSafeInteger(cents)&&cents>0?cents:null;
}
export function commerceBinding(route){
 const b=route?.commerceCatalog;
 if(!b||b.enabled!==true||!id.test(route?.sucursalId||'')||!catalogId.test(b.id||'')||
  typeof b.id!=='string'||b.sucursalId!==route.sucursalId||typeof route.slug!=='string'||!/^[-a-z0-9]{1,120}$/.test(route.slug)||
  !b.images||typeof b.images!=='object'||Array.isArray(b.images)||!Array.isArray(b.published))return null;
 return b;
}
export function assertDistinctCommerceCatalogs(routes){
 const ids=new Set();
 for(const route of routes){
  if(!route.commerceCatalog||route.commerceCatalog.enabled===false)continue;
  const b=commerceBinding(route);
  if(!b||ids.has(b.id))throw Error('Catálogo comercial inválido o compartido');
  ids.add(b.id);
 }
}
export function retailerId(sucursalId,productId){
 return id.test(sucursalId||'')&&id.test(productId||'')?'gl:'+sucursalId+':'+productId:null;
}
const same=(a,b)=>!!a&&!!b&&fields.every(k=>a[k]===b[k]);
export function planCommerceCatalog({route,sucursal,catalogo,ahora=new Date()}){
 const b=commerceBinding(route);
 if(!b)return {enabled:false,ready:[],upsert:[],retire:[],unavailable:[],dispatchAllowed:false};
 const c=carteleraDelDia(sucursal,catalogo,ahora).catalogo;
 const rows=[],missing=[];
 const counts=new Map();
 for(const p of c.productos||[])counts.set(p.id,(counts.get(p.id)||0)+1);
 const readbackAge=+new Date(ahora)-+new Date(b.readbackAt??NaN);
 const fresh=Number.isFinite(readbackAge)&&readbackAge>=0&&readbackAge<=10*60*1000;
 const seen=new Set();
 for(const p of c.productos||[]){
  if(p.activo===false||p.disponible===false||(c.categorias||[]).some(k=>k.id===p.categoria_id&&k.activa===false))continue;
  const sku=retailerId(route.sucursalId,p.id),price=minor(p.precio),photo=Object.hasOwn(b.images,p.id)?approvedUrl(b.images[p.id]):null;
  const availableOptions=(p.opciones||[]).every(g=>(!g.obligatorio&&g.tipo!=='cantidad')||valoresDisponibles(c,g).length>0);
  if(!sku||!price||!photo||!text(p.nombre)||!availableOptions||counts.get(p.id)!==1||seen.has(sku)){missing.push(p.id);continue;}
  seen.add(sku);
  const name=short(p.nombre,150),description=short([p.descripcion||name,(p.opciones||[]).length?'Variantes y adicionales a confirmar por chat.':''].filter(Boolean).join(' '),1000);
  const record={retailer_id:sku,name,description,price,currency:'ARS',availability:'in stock',image_url:photo,
   url:'https://gestlok.com.ar/chat/?s='+route.slug,condition:'new'};
  rows.push({productId:p.id,category:p.categoria_id,record});
 }
 // Readback MUST come from the verified provider for this specific catalog.
 // Duplicate/foreign records are never proof of synchronization or mutations.
 const ownPrefix='gl:'+route.sucursalId+':';
 const readback=new Map(),duplicates=new Set();
 for(const p of b.published){
  if(typeof p?.retailer_id!=='string'||!skuPattern.test(p.retailer_id)||!p.retailer_id.startsWith(ownPrefix))continue;
  if(readback.has(p.retailer_id))duplicates.add(p.retailer_id);else readback.set(p.retailer_id,p);
 }
 const upsert=rows.filter(r=>!duplicates.has(r.record.retailer_id)&&!same(r.record,readback.get(r.record.retailer_id))).map(r=>r.record);
 const retire=[...readback.values()].filter(p=>!duplicates.has(p.retailer_id)&&!seen.has(p.retailer_id)&&p.availability!=='out of stock').map(p=>({retailer_id:p.retailer_id,availability:'out of stock'}));
 return {enabled:true,catalogId:b.id,ready:rows.filter(r=>fresh&&!duplicates.has(r.record.retailer_id)&&same(r.record,readback.get(r.record.retailer_id))),upsert,retire,
  unavailable:[...missing,...rows.filter(r=>!fresh||duplicates.has(r.record.retailer_id)||!same(r.record,readback.get(r.record.retailer_id))).map(r=>r.productId)],dispatchAllowed:false};
}
export function commerceProductList(args,category){
 const plan=planCommerceCatalog(args);
 // A catalog that no longer matches current prices/availability is never
 // presented as authoritative. The guided menu is always available.
 if(!plan.enabled||plan.retire.length)return null;
 const selected=plan.ready.filter(r=>!category||r.category===category);
 if(!selected.length||selected.length>30)return null;
 const active=carteleraDelDia(args.sucursal,args.catalogo,args.ahora).catalogo;
 if(plan.unavailable.some(i=>active.productos.some(p=>p.id===i&&(!category||p.categoria_id===category))))return null;
 return {type:'product_list',header:{type:'text',text:'Carta del local'},body:{text:'Elegí productos y cantidades y enviá tu carrito. Las variantes y el total se revisan por chat. Escribí MENÚ para la carta guiada.'},action:{catalog_id:plan.catalogId,sections:[{title:'Productos disponibles',product_items:selected.map(r=>({product_retailer_id:r.record.retailer_id}))}]}};
}
export function isCommerceProductList(v){
 const sections=v?.action?.sections;
 return v?.type==='product_list'&&v.header?.type==='text'&&typeof v.header.text==='string'&&v.header.text.length<=60&&
  typeof v.body?.text==='string'&&v.body.text.length<=1024&&typeof v.action?.catalog_id==='string'&&catalogId.test(v.action.catalog_id)&&
  Array.isArray(sections)&&sections.length===1&&Array.isArray(sections[0].product_items)&&sections[0].product_items.length>=1&&sections[0].product_items.length<=30&&
  sections[0].product_items.every(x=>typeof x.product_retailer_id==='string'&&skuPattern.test(x.product_retailer_id));
}
// Exact Cloud API order webhook. The price is in major currency units.
// Never act on a customer message pretending to be an order.
export function readCommerceOrder(message){
 if(message?.type!=='order')return null;
 const o=message.order;
 if(typeof o?.catalog_id!=='string'||!catalogId.test(o.catalog_id)||!Array.isArray(o.product_items)||!o.product_items.length||o.product_items.length>30)return null;
 const seen=new Set(),items=[];
 for(const p of o.product_items){
  if(typeof p?.product_retailer_id!=='string'||!skuPattern.test(p.product_retailer_id)||seen.has(p.product_retailer_id)||
   !/^[1-9]\d?$/.test(String(p.quantity))||Number(p.quantity)>50||p.currency!=='ARS'||minor(p.item_price)===null)return null;
  seen.add(p.product_retailer_id);items.push({sku:p.product_retailer_id,quantity:Number(p.quantity),price:minor(p.item_price),currency:p.currency});
 }
 return {catalogId:o.catalog_id,items};
}
export function validateCommerceOrder(args,order){
 const plan=planCommerceCatalog(args);
 if(!plan.enabled||order?.catalogId!==plan.catalogId||!Array.isArray(order.items)||!order.items.length||order.items.length>30)return null;
 const seen=new Set(),items=[];
 for(const i of order.items){
  const r=plan.ready.find(x=>x.record.retailer_id===i?.sku);
  if(!r||seen.has(i.sku)||i.currency!=='ARS'||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>50||i.price!==r.record.price)return null;
  seen.add(i.sku);items.push({id:r.productId,label:r.record.name,quantity:i.quantity,price:r.record.price});
 }
 return items;
}
