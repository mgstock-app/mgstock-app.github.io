import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(p, 'utf8');
function fixture(controlled = true) {
  const handlers = {}, elements = [];
  let reloads = 0;
  const element = () => ({style:{},children:[],listeners:{},setAttribute(){},append(...c){this.children.push(...c);},addEventListener(n,f){this.listeners[n]=f;}});
  const navigator = {onLine:true,serviceWorker:{controller:controlled?{}:null,addEventListener(n,f){handlers[n]=f;}}};
  const window = {location:{reload(){reloads++;}}};
  const document = {createElement:element,body:{appendChild(e){elements.push(e);}}};
  vm.runInNewContext(read('public/stock/gestlok-pwa-update.js'), {navigator,window,document});
  return {handlers,elements,navigator,window,reloads:()=>reloads};
}
test('Una instalación nueva no pide recargar; una actualización avisa solo una vez', () => {
  const first=fixture(false);first.handlers.controllerchange();assert.equal(first.elements.length,0);
  first.handlers.controllerchange();assert.equal(first.elements.length,1);
  first.handlers.controllerchange();assert.equal(first.elements.length,1);
  assert.equal(first.reloads(),0);
});
test('Actualizar requiere una elección explícita, conexión y ningún cambio pendiente', () => {
  const f=fixture();f.handlers.controllerchange();
  const [message,button]=f.elements[0].children;
  button.listeners.click();assert.equal(f.reloads(),0);
  assert.match(message.textContent,/Guardá/);
  f.window.GestLokPWAUpdate.attach(()=>false);
  f.navigator.onLine=false;button.listeners.click();assert.equal(f.reloads(),0);
  f.navigator.onLine=true;button.listeners.click();assert.equal(f.reloads(),1);
});
test('Todos los controladores del arranque están disponibles en la caché sin conexión', () => {
  const runtime=read('components/stock-runtime.tsx'), worker=read('scripts/sw-template.js');
  for(const [,asset] of runtime.matchAll(/"(\/(?:stock|vendor)\/[^"?]+\.js)(?:\?[^"\n]*)?"/g)) {
    assert.ok(worker.includes("'"+asset+"'"),asset);
  }
});
test('La PWA puede recuperar app.js versionado sin conexión, sin interceptar datos privados',async()=>{
  const handlers={},lookups=[];
  const cached=new Response('controller');
  vm.runInNewContext(read('scripts/sw-template.js'),{URL,Response,fetch:async()=>{throw Error('offline');},self:{
    location:{href:'https://example.com/sw.js',origin:'https://example.com'},addEventListener(n,f){handlers[n]=f;}
  },caches:{match:async key=>{lookups.push(key);return key==='https://example.com/stock/app.js'?cached:undefined;}}});
  let result;
  handlers.fetch({request:{url:'https://example.com/stock/app.js?rev=new',method:'GET',headers:new Headers()},respondWith(p){result=p;}});
  assert.equal(await (await result).text(),'controller');
  assert.equal(lookups.length,2);
});
