import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const leer = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');

test('no hay pestaña Conversaciones pero se mantiene el chat vinculado a cada pedido y soporte',()=>{
 const js=leer('public/chat/panel/panel.js');
 assert.doesNotMatch(js, /\['charlas', 'Conversaciones'\]/);
 assert.match(js, /Abrir chat del cliente/);
 assert.match(js, /abrirCharla\(/);
 assert.match(js, /panel_responder/);
 assert.match(js, /verSoporte/);
 assert.match(js, /comandas-resumen/);
 assert.match(js, /activar-sonido-panel/);
});

test('el backend separa por local pendientes, avisables y en preparación, sin DEMOSTRACIONES',()=>{
 const sql=leer('supabase/migrations/20261121220000_gestlok_chat_contadores_comandas_activas.sql');
 assert.match(sql, /gestlok_tenancy\.current_tenant_id\(\)/);
 assert.match(sql, /gestlok_chat_private\.nivel\(s\.id\)/);
 assert.match(sql, /p\.sucursal_id = s\.id/g);
 assert.match(sql, /'pendientes_avisables'/);
 assert.match(sql, /'en_preparacion'/);
 assert.match(sql, /coalesce\(to_jsonb\(p\)->>'es_prueba','false'\) <> 'true'/g);
 assert.match(sql, /p\.programado_para is null or p\.programado_para <= now\(\)/);
 assert.doesNotMatch(sql, /grant (execute|all) .* anon|disable row level security/i);
 const pg=leer('tests/db/gestlok-chat-postgres.test.mjs');
 const embed=leer('tests/gestlok-chat-confirmacion.test.mjs');
 assert.match(pg, /20261121220000_gestlok_chat_contadores_comandas_activas\.sql/);
 assert.match(embed, /20261121220000_gestlok_chat_contadores_comandas_activas\.sql/);
});

test('la central recuerda comandas en ambos estados y el sonido se desbloquea con un gesto',async()=>{
 const codigo=leer('public/stock/gestlok-chat-central.js');
 const handlers=new Map();let reloj=1000,avisos=0,osciladores=0;
 let alerta=null;
 class Reloj extends Date {static now(){return reloj;}}
 class AudioSimulado {
   state='suspended';currentTime=0;destination={};
   resume(){this.state='running';return Promise.resolve();}
   createOscillator(){return {type:'',frequency:{value:0},connect(){},disconnect(){},start(){osciladores++;},stop(){}};}
   createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 }
 const document={
   hidden:false,
   addEventListener:(name,fn)=>handlers.set(name,[...(handlers.get(name)||[]),fn]),
   querySelector:()=>null,
   querySelectorAll:()=>[],
   getElementById:()=>alerta,
   createElement:()=>({innerHTML:'',setAttribute(){},remove(){alerta=null;}}),
   body:{appendChild(el){alerta=el;avisos++;}},
 };
 const data={habilitado:true,empresa:'Ejemplo',sucursales:[{id:'local-1',local_id:'munro',
   nombre:'Sucursal 1',nivel:'configurar',pendientes:1,pendientes_avisables:1,en_preparacion:2,reclamos:0}]};
 const window={
   AudioContext:AudioSimulado,
   GestLokSupabase:{rpc:async()=>({data,error:null})},
   GestLokMobileDock:{refresh(){}}
 };
 runInNewContext(codigo,{window,document,navigator:{onLine:true,vibrate(){}},
   Date:Reloj,Map,Promise,console,setInterval(){},clearInterval(){},queueMicrotask(){}});
 const api={S:{local:'munro',me:{tenant_id:'tenant-1'},ro:false,offline:false},
   miRol:()=> 'gerente',misLocales:()=>['munro'],render(){}};
 const central=window.GestLokMiGustoOrders;
 central.attach(api);
 await central._test.descubrir();
 assert.equal(central._test.estado().pendientes,1);
 assert.equal(central._test.estado().enPreparacion,2);
 assert.equal(central._test.estado().soundReady,false);
 reloj+=120000;central._test.recordarPedido();
 assert.match(alerta.innerHTML,/Comandas por confirmar/);
 assert.equal(osciladores,0,'sin gesto no se reproduce audio');
 for(const fn of handlers.get('pointerdown')||[])fn({});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(central._test.estado().soundReady,true);
 reloj+=120000;central._test.recordarPedido();
 assert.ok(osciladores>=3,'suena después de habilitarlo');
 const antes=osciladores;
 central._test.actualizar(0,0,0,0);
 assert.equal(alerta,null,'sin comandas ni reclamos desaparece el aviso');
 central._test.actualizar(0,0,2,0);
 reloj+=300000;central._test.recordarPedido();
 assert.match(alerta.innerHTML,/Comandas en preparación/);
 assert.ok(osciladores>antes,'preparación también genera recordatorios audibles');
 document.hidden=true;
 const ocultos=osciladores;
 reloj+=300000;central._test.recordarPedido();
 assert.equal(osciladores,ocultos,'no intenta sonar en segundo plano');
});

test('el panel y la app usan recursos renovados para evitar código cacheado',()=>{
 const pag=leer('public/chat/panel/index.html');
 const panel=leer('public/chat/panel/panel.js');
 const central=leer('public/stock/gestlok-chat-central.js');
 const runtime=leer('components/stock-runtime.tsx');
 assert.match(pag,/panel\.js\?v=20261123cobros2/);
 assert.match(pag,/panel\.css\?v=20261121bordes1/);
 assert.match(panel,/VERSION_CSS = '20261121bordes1'/);
 assert.match(central,/VERSION_PANEL='20261123cobros2'/);
 assert.match(runtime,/chat-badge-20261122/);
 assert.match(central,/RECORDAR_PENDIENTES_MS=120000/);
 assert.match(central,/RECORDAR_PREPARACION_MS=300000/);
 assert.match(central,/data-gcc-comandas/);
});
