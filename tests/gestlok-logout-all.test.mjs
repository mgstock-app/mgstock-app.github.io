import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(p, 'utf8');
const source = read('public/stock/gestlok-logout.js');
const css = read('public/stock/gestlok-logout.css');
const roleSwitcher = read('public/stock/gestlok-role-switcher.js');
const runtime = read('components/stock-runtime.tsx');
const sw = read('scripts/sw-template.js');
const auth = read('public/stock/auth.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const session = id => ({user:{id,email:'example@test.invalid'}});

function fixture(){
 const made=[], events={}, flags={};
 let callback=null,resolveSession;
 const initialSession=new Promise(resolve=>{resolveSession=resolve;});
 function connected(node,value){node.isConnected=value;node.children.forEach(child=>connected(child,value));}
 function el(tag){
   const node={tag,id:'',hidden:false,isConnected:false,attrs:{},dataset:{},
     children:[],events:{},classList:{toggle(){}},
     append(...items){this.children.push(...items);items.forEach(x=>{x.parent=this;connected(x,this.isConnected);});},
     appendChild(item){this.append(item);return item;},
     setAttribute(k,v){this.attrs[k]=String(v);},
     addEventListener(k,fn){this.events[k]=fn;},
     contains(item){return item===this||this.children.some(x=>x.contains(item))},
     click(){this.events.click?.({target:this});}
   };
   made.push(node);return node;
 }
 const body=el('body');body.isConnected=true;
 const head=el('head');head.isConnected=true;
 const document={
   head,body,documentElement:{classList:{toggle(k,v){flags[k]=v;}}},
   createElement:el,
   getElementById(id){return made.find(n=>n.id===id&&n.isConnected)||null;},
   addEventListener(k,fn){events[k]=fn;}
 };
 const sb={auth:{onAuthStateChange(fn){callback=fn;},getSession(){return initialSession;}}};
 const window={GestLokSupabase:sb};
 vm.runInNewContext(source,{window,document,Promise});
 return {window,document,events,flags,made,resolveSession,
   emit:(event,data)=>callback(event,data),
   node:id=>document.getElementById(id),
   create:el};
}

test('Cuenta pendiente: Mi perfil es el primer toque y Cerrar sesión aparece solo al abrirlo',async()=>{
 const f=fixture();
 f.emit('SIGNED_IN',session('pending'));
 assert.equal(f.window.GestLokLogout.isVisible(),true);
 const wrap=f.node('gl-session-profile'),trigger=f.node('gl-universal-profile-trigger');
 const menu=f.node('gl-universal-profile-menu'),logout=f.node('gl-universal-logout');
 assert.equal(wrap.hidden,false);
 assert.equal(menu.hidden,true);
 assert.equal(logout.dataset.au,'out');
 trigger.click();
 assert.equal(menu.hidden,false);
 assert.equal(trigger.attrs['aria-expanded'],'true');
 trigger.click();
 assert.equal(menu.hidden,true);
 f.resolveSession({data:{session:null}});
 await tick();
 assert.equal(wrap.hidden,false,'La consulta inicial atrasada no desconecta una sesión nueva');
});

test('Perfil multiempresa: no existe botón flotante de Cerrar sesión; opción dentro del diálogo',()=>{
 const f=fixture();f.emit('SIGNED_IN',session('owner'));
 const trigger=f.create('button');trigger.id='gl-profile-switch-trigger';
 f.document.body.appendChild(trigger);
 f.window.GestLokLogout.syncProfile();
 assert.equal(f.node('gl-session-profile').hidden,true);
 assert.match(roleSwitcher,/class="gl-profile-switch-logout" data-au="out"/);
 assert.match(roleSwitcher,/window\.GestLokLogout\?\.syncProfile\?\.\(\)/);
 assert.doesNotMatch(css,/#gl-universal-logout\.gl-universal-logout\{\s*position:fixed/);
 assert.match(css,/\.gl-profile-switch-logout/);
});

test('Cerrar sesión y visitantes ocultan las acciones, sin restauración por lecturas viejas',async()=>{
 const f=fixture();f.emit('SIGNED_IN',session('owner'));
 f.emit('SIGNED_OUT',null);
 f.resolveSession({data:{session:session('old')}});
 await tick();
 assert.equal(f.window.GestLokLogout.isVisible(),false);
 assert.equal(f.node('gl-session-profile').hidden,true);
 assert.equal(f.flags['gl-universal-logout-ready'],false);
});

test('Se reutiliza siempre el cierre local de auth.js, sin cambiar permisos ni empresas',()=>{
 assert.match(source,/logout\.dataset\.au='out'/);
 assert.match(auth,/t\.dataset\.au === 'out'/);
 assert.match(auth,/sb\.auth\.signOut\(\{ scope: 'local' \}\)/);
 assert.doesNotMatch(source,/\.rpc\(|\.from\(|localStorage\.clear|sb\.auth\.signOut\(/);
 assert.match(css,/focus-visible/);
 assert.match(css,/\[hidden\]/);
});

test('La app renueva caché de perfil y cierre para PWA',()=>{
 assert.match(runtime,/\/stock\/gestlok-logout\.js\?rev=logout-profile-menu-20261107/);
 assert.match(runtime,/\/stock\/gestlok-role-switcher\.js\?rev=roles-logout-profile-20261107/);
 assert.match(runtime,/\/stock\/gestlok-creator-home\.js\?rev=molino-microapps-20261107/);
 assert.match(sw,/'\/stock\/gestlok-logout\.js'/);
 assert.match(sw,/'\/stock\/gestlok-logout\.css'/);
});

test('Empleados: perfil aprobado conserva la salida dentro del diálogo; pendientes tienen menú seguro',()=>{
 const component=read('modules/empleados/components/layout/GlobalLogout.tsx');
 const profile=read('modules/empleados/components/layout/RoleProfileSwitcher.tsx');
 const css=read('modules/empleados/styles/global-logout.css');
 const layout=read('modules/empleados/app/layout.tsx');
 const provider=read('modules/empleados/components/auth/AuthProvider.tsx');
 assert.match(layout,/<GlobalLogout \/>/);
 assert.match(layout,/<RoleProfileSwitcher \/>/);
 assert.match(component,/user\?\.status === "approved"\) return null/);
 assert.match(component,/aria-expanded=\{open\}/);
 assert.match(component,/<span>Mi perfil<\/span>/);
 assert.match(component,/onClick=\{\(\) => void signOut\(\)\}/);
 assert.match(profile,/className="module-profile-signout"/);
 assert.match(provider,/auth\.signOut\(\{ scope: "local" \}\)/);
 assert.match(css,/min-height:44px/);
 assert.doesNotMatch(css,/#gl-empleados-universal-logout\.gl-empleados-universal-logout\{\s*position:fixed/);
});
