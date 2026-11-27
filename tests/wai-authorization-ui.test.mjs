import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/chat/wai/wai.js','utf8');
test('autorización inline WAI conserva número y consentimiento durante polling, requiere señal y consentimiento',async()=>{
  class Element{
    constructor(tag,attrs={},...children){this.tag=tag;Object.assign(this,attrs);this.children=children;this.isConnected=true;this.value='';this.checked=false;this.textContent='';this.disabled=!!attrs.disabled;}
    append(...c){this.children.push(...c);}
    replaceChildren(...c){this.children=c;}
    focus(){this.focused=true;}
  }
  function find(e,p){if(!e||typeof e!=='object')return null;if(p(e))return e;for(const c of e.children||[]){const f=find(c,p);if(f)return f;}return null;}
  const node=(...a)=>new Element(...a);
  const button=(t,f,c,attrs={})=>node('button',{onclick:f,class:c,...attrs},t);
  const calls=[];
  const context={node,button,drawerKind:'conexion',connectionList:null,authorizationHost:null,authorizationDraft:null,drawerBody:node('main'),drawerStatus:node('p'),rows:[{id:'line-1',estado:'conectado',habilitada:true,preparada:true,numero:'+5491100000000'}],chats:[],labels:{},portal:{administradora:true,piloto_disponible:true},connectionBusy:false,sessionLocal:{id:'local-1'},generation:1,trialEnvironment:()=>true,time:()=>'',refresh:async()=>{},rpc:async(name,args)=>{calls.push({name,args});context.chats=[{linea:'line-1'}];},prepareTrial(){},connectionAction(){}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function renderConnection(){'),source.indexOf("document.addEventListener('keydown'")),context);
  context.renderConnection();
  const open=find(context.drawerBody,e=>e.tag==='button'&&e.children[0]==='Autorizar contacto de ensayo');
  assert.ok(open);
  open.onclick();
  const form=find(context.drawerBody,e=>e.tag==='form');
  const input=find(form,e=>e.type==='tel'),consent=find(form,e=>e.type==='checkbox'),submit=find(form,e=>e.type==='submit');
  assert.ok(input.focused);input.value='+5491100000001';
  await form.onsubmit({preventDefault(){}});assert.equal(calls.length,0);
  consent.checked=true;context.renderConnection();
  assert.equal(find(context.drawerBody,e=>e.tag==='form'),form);
  assert.equal(input.value,'+5491100000001');assert.equal(consent.checked,true);
  context.rows[0].estado='sin_senal';context.renderConnection();assert.equal(submit.disabled,true);
  await form.onsubmit({preventDefault(){}});assert.equal(calls.length,0);
  context.rows[0].estado='conectado';context.renderConnection();assert.equal(submit.disabled,false);
  await form.onsubmit({preventDefault(){}});
  assert.equal(calls.length,1);assert.equal(calls[0].name,'wai_piloto_autorizar');assert.equal(calls[0].args.p_id,'line-1');assert.equal(calls[0].args.p_tester,'+5491100000001');
  assert.equal(find(context.drawerBody,e=>e.tag==='form'),null);assert.match(context.drawerStatus.textContent,/Ensayo autorizado/);
  context.portal.administradora=false;context.renderConnection();assert.equal(find(context.drawerBody,e=>e.tag==='button'&&e.children[0]==='Autorizar contacto de ensayo'),null);
});
