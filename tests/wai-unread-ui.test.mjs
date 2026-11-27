import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/chat/wai/wai.js','utf8');
test('WAI muestra nuevos mensajes sin marcar por polling; solo marca IDs visibles de la conversación abierta',async()=>{
 const element=(tag,attrs={},...children)=>({tag,...attrs,children,isConnected:true,replaceChildren(...c){this.children=c;}});
 const messages=[{id:'m1',direccion:'entrada',leido:false,texto:'Hola'},{id:'m2',direccion:'salida',leido:true,texto:'Hola también'}];
 const chats=[{id:'c1',cliente:'+5491100000000',mensajes:messages}];
 const calls=[];
 const context={node:element,selected:null,document:{hidden:false},drawerKind:'',sessionLocal:{id:'local'},destroyed:false,thread:{isConnected:true,scrollHeight:200,scrollTop:100,clientHeight:100},readBusy:new Set(),chats,generation:1,list:element('div'),search:{value:''},unreadSummary:element('span'),selection(){},rpc:async(name,args)=>{calls.push({name,args});return args.p_mensajes.length;}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function displayName('),source.indexOf('function empty(')),context);
 context.renderList();assert.match(context.list.children[0].class,/unread/);assert.equal(context.unreadSummary.textContent,'1 sin leer');
 await context.markVisibleRead();assert.equal(calls.length,0);
 context.selected='c1';context.drawerKind='conexion';await context.markVisibleRead();assert.equal(calls.length,0);
 context.drawerKind='';context.document.hidden=true;await context.markVisibleRead();assert.equal(calls.length,0);
 context.document.hidden=false;context.thread.scrollHeight=500;await context.markVisibleRead();assert.equal(calls.length,0);
 context.thread.scrollTop=400;await context.markVisibleRead();assert.equal(calls.length,1);assert.equal(calls[0].name,'wai_marcar_leidos');assert.equal(calls[0].args.p_mensajes.join(','),'m1');
 assert.equal(messages[0].leido,true);assert.equal(context.unreadSummary.hidden,true);assert.doesNotMatch(context.list.children[0].class,/unread/);
 messages.push({id:'m3',direccion:'entrada',leido:false,texto:'Nuevo'});context.renderList();assert.equal(context.unreadSummary.textContent,'1 sin leer');
 context.rpc=async()=>{throw Error('sin señal')};await context.markVisibleRead();assert.equal(messages[2].leido,false);
});

test('nombre de agenda y alias se distinguen: alias prioritario y búsqueda por teléfono o ambos nombres',()=>{
 const element=(tag,attrs={},...children)=>({tag,...attrs,children,replaceChildren(...c){this.children=c;}});
 const c={id:'c1',cliente:'+5491100000000',nombre_agenda:'María Agenda',alias:'Cliente frecuente',mensajes:[]};
 const ctx={node:element,chats:[c],selected:null,list:element('div'),search:{value:''},unreadSummary:element('span'),selection(){}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function displayName('),source.indexOf('async function markVisibleRead(')),ctx);
 assert.equal(ctx.displayName(c),'Cliente frecuente');assert.equal(ctx.displayName({...c,alias:null}),'María Agenda');assert.equal(ctx.displayName({...c,alias:null,nombre_agenda:null}),c.cliente);
 for(const value of ['frecuente','maría','00000000']){ctx.search.value=value;ctx.renderList();assert.equal(ctx.list.children[0].tag,'button');}
 ctx.search.value='inexistente';ctx.renderList();assert.equal(ctx.list.children[0].tag,'p');
});
