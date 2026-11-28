import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/chat/wai/wai.js','utf8');
// Harness mínimo: el cajón Vincular con la tarjeta de aceptación del riesgo.
function harness(estado){
  class Element{
    constructor(tag,attrs={},...children){this.tag=tag;Object.assign(this,attrs);this.children=children;this.isConnected=true;this.checked=false;this.textContent='';this.disabled=!!attrs.disabled;}
    append(...c){this.children.push(...c);}
    replaceChildren(...c){this.children=c;}
  }
  const node=(...a)=>new Element(...a),button=(t,f,c,attrs={})=>node('button',{onclick:f,class:c,...attrs},t);
  const calls=[];
  const context={node,button,drawerKind:'conexion',connectionList:null,authorizationHost:null,authorizationDraft:null,riskHost:null,riesgo:null,riesgoBusy:false,
    drawerBody:node('main'),drawerStatus:node('p'),rows:[],chats:[],labels:{},portal:{administradora:false},connectionBusy:false,sessionLocal:{id:'local-1'},generation:1,
    trialEnvironment:()=>false,time:()=>'',refresh:async()=>{},rpc:async(name,args)=>{calls.push({name,args});if(args?.p_accion==='aceptar')return {...estado,aceptado:true,aceptado_at:'2026-11-28T00:00:00Z'};return estado;}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function renderConnection(){'),source.indexOf("document.addEventListener('keydown'")),context);
  const find=(e,p)=>{if(!e||typeof e!=='object')return null;if(p(e))return e;for(const c of e.children||[]){const f=find(c,p);if(f)return f;}return null;};
  const text=e=>!e||typeof e!=='object'?String(e??''):(e.children||[]).map(text).join(' ');
  return {context,calls,find,text,tick:()=>new Promise(r=>setTimeout(r,0))};
}
test('el dueño acepta el riesgo de la conexión no oficial antes del QR',async()=>{
  const h=harness({aceptado:false,puede_aceptar:true});
  h.context.renderConnection();await h.tick();
  assert.equal(h.calls[0].name,'wai_riesgo');assert.equal(h.calls[0].args.p_sucursal,'local-1');
  assert.match(h.text(h.context.drawerBody),/No es la API oficial de Meta/);
  const check=h.find(h.context.drawerBody,e=>e.type==='checkbox'),accept=h.find(h.context.drawerBody,e=>e.tag==='button'&&e.children[0]==='Aceptar y continuar');
  assert.ok(check&&accept);assert.equal(accept.disabled,true,'sin marcar la casilla no se acepta');
  await accept.onclick();assert.equal(h.calls.length,1);
  h.context.renderConnection();assert.equal(h.find(h.context.drawerBody,e=>e.type==='checkbox'),check,'el sondeo no borra la casilla');
  check.checked=true;check.onchange();assert.equal(accept.disabled,false);
  await accept.onclick();await h.tick();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[1])),{name:'wai_riesgo',args:{p_sucursal:'local-1',p_accion:'aceptar'}});
  assert.match(h.text(h.context.drawerBody),/aceptada por el dueño/);
  assert.match(h.context.drawerStatus.textContent,/QR/);
});
test('el gerente ve el aviso pero no puede aceptar por el dueño',async()=>{
  const h=harness({aceptado:false,puede_aceptar:false});
  h.context.renderConnection();await h.tick();
  assert.match(h.text(h.context.drawerBody),/El dueño del local tiene que aceptarlo/);
  assert.equal(h.find(h.context.drawerBody,e=>e.tag==='button'&&e.children[0]==='Aceptar y continuar'),null);
});
test('el servidor central se prepara sin cuadros del navegador y deja el archivo a mano',()=>{
  const central=source.slice(source.indexOf('let centralFile=null;'),source.indexOf(" let busy=false,actionBusy=false,last='',fail=false;"));
  assert.ok(central.length>500);
  assert.doesNotMatch(central,/\bconfirm\(/,'confirm() no aparece en el navegador integrado de Claude');
  assert.match(central,/Sí, preparar/);assert.match(central,/Descargar archivo/);assert.match(central,/Copiar contenido/);
  assert.match(central,/entorno:'produccion'/);assert.match(central,/\]\.filter\(Boolean\)\);/,'replaceChildren no debe recibir null');assert.doesNotMatch(central,/revokeObjectURL\(url\),1000/,'el enlace no se invalida enseguida');
});
