import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const source=read('public/stock/gestlok-logout.js');
const css=read('public/stock/gestlok-logout.css');
const runtime=read('components/stock-runtime.tsx');
const sw=read('scripts/sw-template.js');
const auth=read('public/stock/auth.js');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 let callback=null,resolveSession,revision=0;
 const login=new Promise(resolve=>{resolveSession=resolve;});
 let sessionEvents=0;
 const ids=new Map();
 const dom={};
 const button={id:'',dataset:{},className:'',type:'',hidden:true,
   isConnected:false,disabled:false,attrs:{},
   setAttribute(k,v){this.attrs[k]=v;},
   removeAttribute(k){delete this.attrs[k];},
   querySelector(name){return name==='span'?label:null;},
   closest(q){return q==='#gl-universal-logout'?this:null;}};
 const label={textContent:''};
 const document={
  head:{appendChild(el){ids.set(el.id,el);}},
  body:{appendChild(el){el.isConnected=true;ids.set(el.id,el);}},
  getElementById(id){return ids.get(id)||null;},
  createElement(tag){return tag==='button'?button:{id:'',rel:'',href:''};},
  documentElement:{classList:{toggle(k,v){dom[k]=v;}}},
  addEventListener(_event,fn){dom.listener=fn;}
 };
 const sb={auth:{
  onAuthStateChange(fn){callback=fn;sessionEvents++;},
  getSession(){return login;}
 }};
 const window={GestLokSupabase:sb};
 vm.runInNewContext(source,{window,document,Promise});
 return {window,button,label,document,ids,dom,resolveSession,
   emit:(name,session)=>callback(name,session),sessionEvents:()=>sessionEvents};
}
const session=(id,role)=>({user:{id,email:role+'@example.test'}});

test('El botón es global, accesible y visible para todos los roles, incluso pendientes',async()=>{
 const f=fixture();
 assert.equal(f.sessionEvents(),1);
 assert.equal(f.button.hidden,true);
 for(const [i,role] of ['dueno','gerente','colaborador','creadora','sin-rol','solicitud-pendiente'].entries()){
  f.emit(i===0?'INITIAL_SESSION':'SIGNED_IN',session('uid-'+i,role));
  assert.equal(f.button.hidden,false,role);
  assert.equal(f.button.dataset.au,'out');
  assert.equal(f.button.attrs['aria-label'],'Cerrar sesión de GESTLOK en este dispositivo');
  assert.equal(f.label.textContent,'Cerrar sesión',role);
  assert.equal(f.window.GestLokLogout.isVisible(),true);
 }
 assert.equal(f.document.getElementById('gl-universal-logout'),f.button);
 assert.equal(f.dom['gl-universal-logout-ready'],true);
 f.resolveSession({data:{session:null}});
 await tick();
 assert.equal(f.button.hidden,false,'La consulta inicial tardía no puede ocultar la sesión activa');
});

test('No aparece en visitantes, se oculta al salir y no reabre por lecturas atrasadas',async()=>{
 const f=fixture();
 f.emit('SIGNED_IN',session('test','gerente'));
 f.emit('SIGNED_OUT',null);
 f.resolveSession({data:{session:session('old','dueno')}});
 await tick();
 assert.equal(f.button.hidden,true);
 assert.equal(f.window.GestLokLogout.isVisible(),false);
 assert.equal(f.dom['gl-universal-logout-ready'],false);
});

test('La acción reutiliza la salida LOCAL sin desconectar otros equipos ni borrar datos',()=>{
 assert.match(source,/button\.dataset\.au='out'/);
 assert.match(auth,/t\.dataset\.au === 'out'/);
 assert.match(auth,/sb\.auth\.signOut\(\{ scope: 'local' \}\)/);
 assert.doesNotMatch(source,/\.rpc\(|\.from\(|delete\(|localStorage\.clear|signOut\(/);
 assert.doesNotMatch(source,/rol|tenant_id|local_id|mi_rol/);
});

test('Está disponible sobre la pantalla Pendiente, sin tapar el menú inferior móvil',()=>{
 assert.match(css,/html\.auth-on #gl-universal-logout/);
 assert.match(css,/@media\(max-width:899px\)/);
 assert.match(css,/bottom:max\(85px/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/focus-visible/);
 assert.match(css,/\[hidden\]\{display:none!important\}/);
});

test('Se carga para todos los usuarios autenticados y nunca en la demo',()=>{
 assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-logout\.js\?rev=logout-for-all-20261107"\)/);
 const authPos=runtime.indexOf('await load(visitor ? "/stock/gestlok-visitor-demo.js" : "/stock/auth.js');
 const logoutPos=runtime.indexOf('if (!visitor) await load("/stock/gestlok-logout.js');
 assert.ok(authPos>=0&&logoutPos>authPos);
 assert.match(sw,/'\/stock\/gestlok-logout\.js'/);
 assert.match(sw,/'\/stock\/gestlok-logout\.css'/);
});
