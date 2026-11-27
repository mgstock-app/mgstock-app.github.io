import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
class Elem {
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.textContent='';this.value='';this.disabled=false;this.hidden=false;this.open=false;}
 setAttribute(k,v){this.attributes[k]=v;if(k==='value')this.value=v;}
 append(...a){this.children.push(...a);if(this.tagName==='select'&&!this.value&&a.length)this.value=a[0]?.value||'';}
 replaceChildren(...a){this.children=[];if(this.tagName==='select')this.value='';this.append(...a);}
 showModal(){this.open=true;} close(){this.open=false;}
}
const all=e=>[e,...e.children.flatMap(all)];
const fixture={ok:true,local:'Mi Gusto prueba',productos:[{id:'pack',nombre:'Pack 6 empanadas + 2 salsas',precio:31500,categoria:'Promociones',grupos:[{id:'empanadas',nombre:'Empanadas',tipo:'cantidad',total:6,valores:[{id:'burger',nombre:'Big Burger'}]},{id:'salsas',nombre:'Salsas',tipo:'cantidad',total:2,valores:[{id:'cheddar',nombre:'Cheddar'},{id:'ajo',nombre:'Ajo'}]}],salsa_precio:900}],retiro:true,delivery:true,envio:4000,minimo:0,demora_retiro:'35 min',demora_envio:'35 min',pagos_retiro:['efectivo'],pagos_envio:['transferencia'],whatsapp:'5491100000093'};
test('carta WAI: cantidad exacta, salsas repetidas, total y confirmación por WhatsApp',async()=>{
 const ids=Object.fromEntries(['app','local','bar','count','subtotal','cart','close','modal','modalTitle','modalBody'].map(k=>[k,new Elem('div')]));
 const payload=[];
 const env={document:{getElementById:k=>ids[k],createElement:t=>new Elem(t)},window:{GESTLOK_CHAT_CONFIG:{url:'https://example.invalid',key:'test',entorno:'prueba'}},location:{hash:'#00000000-0000-0000-0000-000000000001'},fetch:async(url,opts)=>({ok:true,json:async()=>url.endsWith('_preparar')?(payload.push(JSON.parse(opts.body)),{ok:true,referencia:'00000000-1111-2222-3333-444444444444',total:36400,demora:'35 min'}):fixture}),structuredClone,Intl,alert:()=>{throw Error('unexpected alert')},navigator:{},console};
 vm.runInNewContext(readFileSync(new URL('../public/chat/wai/menu/menu.js',import.meta.url),'utf8'),env);
 await new Promise(r=>setImmediate(r));
 all(ids.app).find(e=>e.tagName==='button'&&e.textContent==='Elegir +').onclick();
 const modal=()=>all(ids.modalBody), add=()=>modal().find(e=>String(e.textContent).startsWith('Agregar al pedido'));
 assert.equal(add().disabled,true);
 for(let i=0;i<6;i++)modal().find(e=>e.attributes['aria-label']==='Agregar Big Burger').onclick();
 for(let i=0;i<2;i++)modal().find(e=>e.attributes['aria-label']==='Agregar Cheddar').onclick();
 modal().filter(e=>e.attributes['aria-label']==='Agregar Ajo').at(-1).onclick();
 assert.equal(add().disabled,false);add().onclick();ids.cart.onclick();
 const fields=modal();fields.find(e=>e.attributes.placeholder==='Tu nombre').value='Cliente ficticio';
 const selects=fields.filter(e=>e.tagName==='select');selects[0].value='delivery';selects[0].onchange();
 fields.find(e=>e.attributes.placeholder==='Calle y altura').value='Calle Ejemplo 123';
 fields.find(e=>e.attributes.placeholder==='Entre calles').value='Calle A y Calle B';selects[1].value='transferencia';
 await fields.find(e=>e.tagName==='form').onsubmit({preventDefault(){}});
 const data=payload[0].p_datos;
 assert.deepEqual(data.lineas[0].grupos,{empanadas:{burger:6},salsas:{cheddar:2}});
 assert.deepEqual(data.lineas[0].salsas_extra,{ajo:1});
 assert.equal(data.total,36400);
 assert.equal(data.pago,'transferencia');
 assert.match(modal().find(e=>e.tagName==='a').attributes.href,/https:\/\/wa\.me\/5491100000093\?text=Confirmo%20mi%20pedido%20WAI/);
});
