import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const code=read('public/stock/gestlok-support.js');
const mobileCSS=read('app/globals.css');
const employee=read('modules/empleados/components/layout/SupportWhatsApp.tsx');
const employeeCSS=read('modules/empleados/components/layout/support-whatsapp.css');
const runtime=read('components/stock-runtime.tsx');

function scenario(store=new Map()){
 const nodes={},windowEvents={};
 const window={innerWidth:390,innerHeight:780,
   setInterval(){},
   addEventListener(type,handler){windowEvents[type]=handler;},
   removeEventListener(type){delete windowEvents[type];},
   localStorage:{
     getItem:k=>store.get(k)||null,
     setItem(k,v){store.set(k,v);}
   }
 };
 const document={
   querySelector:key=>nodes[key]||null,
   addEventListener(){},
   body:{appendChild(el){nodes['#'+el.id]=el;}},
   documentElement:{clientWidth:390,clientHeight:780},
   get hidden(){return false;},visibilityState:'visible',activeElement:null,
   createElement(tag){
     if(tag!=='a')throw Error('Unexpected DOM node '+tag);
     const handlers={},classes=new Set();
     return {
       tag,style:{},handlers,
       classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
       setAttribute(){},
       addEventListener(type,listener){handlers[type]=listener;},
       getBoundingClientRect(){
         return {
           width:56,height:56,
           left:this.style.left?Number.parseFloat(this.style.left):318,
           top:this.style.top?Number.parseFloat(this.style.top):640
         };
       },
       setPointerCapture(){},hasPointerCapture(){return false;},
       remove(){delete nodes['#gl-soporte-whatsapp'];},
     };
   }
 };
 new Script(code).runInNewContext({document,window,Number,String,Promise,Object,JSON,Math,encodeURIComponent,FormData});
 const ctx={S:{db:{},me:{id:'u'},companyName:'Mi Gusto',local:'munro',view:'stock'},
   localNombre:()=> 'Munro', nombreHoja:()=> 'Stock'};
 window.GestLokSupport.attach(ctx);
 window.GestLokSupport.render();
 return {window,document,store,element:nodes['#gl-soporte-whatsapp'],windowEvents};
}
const gesture=(h,events)=>{
 for(const [type,props] of events){
  const e={pointerId:7,pointerType:'touch',button:0,
    preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},
    ...props};
  h.element.handlers[type](e);
 }
};

test('Soporte: mover la burbuja no abre WhatsApp y tocarla sí conserva el enlace',()=>{
 const h=scenario(),el=h.element;
 assert.match(el.href,/^https:\/\/wa\.me\//);
 assert.match(el.title,/arrastrá para mover/);
 gesture(h,[['pointerdown',{clientX:342,clientY:668}],['pointermove',{clientX:218,clientY:420}],['pointerup',{clientX:218,clientY:420}]]);
 const saved=JSON.parse(h.store.get('gestlok:support-bubble-position-v1'));
 assert.equal(saved.v,1);
 assert.ok(saved.x>=0&&saved.x<=1&&saved.y>=0&&saved.y<=1);
 assert.ok(Number.parseFloat(el.style.left)<300);
 const blocked={preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
 el.handlers.click(blocked);
 assert.equal(blocked.prevented,true,'arrastrar no dispara el enlace');
 gesture(h,[['pointerdown',{clientX:220,clientY:430}],['pointerup',{clientX:220,clientY:430}]]);
 const tapped={preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
 el.handlers.click(tapped);
 assert.equal(tapped.prevented,undefined,'tocar conserva WhatsApp');
 assert.match(el.href,/Necesito%20soporte%20en%20Stock/);
});
test('Soporte: la ubicación se conserva y se adapta a otra orientación',()=>{
 const h=scenario();
 gesture(h,[['pointerdown',{clientX:340,clientY:665}],['pointermove',{clientX:-300,clientY:-900}],['pointerup',{clientX:-300,clientY:-900}]]);
 assert.equal(h.element.style.left,'12px');
 assert.equal(h.element.style.top,'12px');
 const again=scenario(h.store);
 assert.equal(again.element.style.left,'12px');
 assert.equal(again.element.style.top,'12px');
 again.window.innerWidth=280;again.window.innerHeight=520;
 again.windowEvents.resize();
 assert.equal(again.element.style.left,'12px');
 assert.equal(again.element.style.top,'12px');
});
test('Soporte: los módulos de empleados y GESTLOK ofrecen la misma burbuja móvil',()=>{
 assert.match(runtime,/gestlok-support\.js\?rev=burbuja-arrastrable-20261113/);
 assert.match(code,/pointerdown/);
 assert.match(code,/pointermove/);
 assert.match(code,/pointerup/);
 assert.match(code,/BUBBLE_POSITION_KEY/);
 assert.match(code,/blockClick/);
 assert.match(mobileCSS,/\.gl-soporte-float\.gl-soporte-is-dragging/);
 assert.match(mobileCSS,/touch-action:none/);
 assert.match(mobileCSS,/\.gl-soporte-float \.gl-soporte-name\{display:none\}/);
 assert.match(employee,/ref=\{bubbleRef\}/);
 assert.match(employee,/pointermove/);
 assert.match(employee,/BUBBLE_KEY/);
 assert.match(employee,/e\.preventDefault\(\);e\.stopImmediatePropagation\(\)/);
 assert.match(employeeCSS,/gestlok-help--dragging/);
 assert.match(employeeCSS,/touch-action:none/);
 assert.match(employeeCSS,/gestlok-help__label\{display:none\}/);
});
