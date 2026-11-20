import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {textoEstadoPedido} from '../supabase/functions/gestlok-chat/motor.js';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('confirmación manual, permisos y aislamiento sobre PostgreSQL embebido', async () => {
 const db = new PGlite({extensions:{pgcrypto}});
 try {
  await db.exec(read('tests/fixtures/chat/base.sql'));
  for (const file of ['20261119210000_gestlok_chat_base.sql','20261119233500_gestlok_chat_comercializar.sql','20261120000406_gestlok_chat_confirmacion_manual.sql','20261120010751_gestlok_chat_pagos_por_entrega.sql','20261120010908_gestlok_chat_pagos_retiro_delivery_columnas.sql']) {
   await db.exec(read('supabase/migrations/' + file));
   await db.exec(read('supabase/migrations/' + file));
  }
  try { await db.exec(read('supabase/tests/gestlok-chat-permisos.sql')); assert.fail('Falta informe'); }
  catch(e) {
   assert.match(e.message, /INFORME/);
   const lines = e.message.split('\n');
   assert.deepEqual(lines.filter(l=>l.startsWith('FALLA')), []);
   assert.ok(lines.filter(l=>l.startsWith('OK')).length >= 85);
  }
 } finally { await db.close(); }
});
test('el mensaje pendiente nunca anuncia preparación aunque exista una plantilla anterior', () => {
 const p = {estado:'pendiente',codigo:'XX-001',total:1000};
 assert.match(textoEstadoPedido(p, {}, {recibido:'Ya lo estamos preparando'}), /pendiente de revisión y confirmación/);
 assert.match(textoEstadoPedido({...p,estado:'confirmado'}, {}, {}), /gerente confirmó/);
});
test('función pública → pedido completo → gerente → estado del cliente', async () => {
 const {default: ts} = await import('typescript');
 const db = new PGlite({extensions:{pgcrypto}});
 let handler;
 const previous = globalThis.Deno;
 globalThis.Deno = {env:{get:k=>({SUPABASE_URL:'http://local',SUPABASE_SERVICE_ROLE_KEY:'test'})[k]},serve:h=>{handler=h;}};
 try {
  await db.exec(read('tests/fixtures/chat/base.sql'));
  for(const f of ['20261119210000_gestlok_chat_base.sql','20261120000406_gestlok_chat_confirmacion_manual.sql','20261120010751_gestlok_chat_pagos_por_entrega.sql','20261120010908_gestlok_chat_pagos_retiro_delivery_columnas.sql']) await db.exec(read('supabase/migrations/'+f));
  const fixture = read('tests/db/gestlok-chat-funcion.test.mjs').match(/const SEMILLA = `([\s\S]*?)`;/)[1];
  await db.exec(fixture);
  globalThis.__chatTestClient = {rpc:async (fn,args) => {
   try {
    const data = await db.transaction(async tx=>{
     await tx.exec('set local role service_role');
     const params=Object.keys(args).map((k,i)=>`${k} => $${i+1}`).join(',');
     const r=await tx.query(`select public.${fn}(${params}) as data`,Object.entries(args).map(([k,v])=>k === 'p_token_hash' ? Uint8Array.from(Buffer.from(v.slice(2),'hex')) : v));
     return r.rows[0].data;
    });
    return {data,error:null};
   } catch(e) { return {data:null,error:{code:e.code,message:e.message}}; }
  }};
  let source=read('supabase/functions/gestlok-chat/index.ts').replace(/import \{ createClient \} from "npm:[^"]+";/,'const createClient = () => globalThis.__chatTestClient;');
  for(const f of ['motor.js','ia.js']) source=source.replace('"./'+f+'"',JSON.stringify(new URL('../supabase/functions/gestlok-chat/'+f,import.meta.url).href));
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  const base={slug:'mi-gusto-munro',token:'tokenDePruebaDelClienteNumero0001abcdEFGH'};
  const call=async (body)=>{
   const r=await handler(new Request('http://local/',{method:'POST',headers:{origin:'https://chat.gestlok.com.ar','content-type':'application/json'},body:JSON.stringify(body)}));
   return {status:r.status,...await r.json()};
  };
  assert.equal((await call(null)).status,400);
  assert.equal((await call({...base,accion:'abrir'})).ok,true);
  assert.equal((await call({...base,accion:'mensaje',entrada:{texto:'2 empanadas de carne'}})).carrito.length,1);
  await db.exec("update gestlok_chat_private.sucursales set medios_pago = array['efectivo','transferencia','credito'], medios_pago_envio = array['efectivo','transferencia'] where slug = 'mi-gusto-munro'");
  const pagoNoPermitido = await call({...base,accion:'mensaje',entrada:{datos:{nombre:'Ana',telefono:'1155551234',
    entrega:'envio',direccion:'Mitre 200',medio_pago:'credito',horario:'21:30'}}});
  assert.equal(pagoNoPermitido.pedido, null, 'rechaza tarjeta en delivery');
  assert.match(pagoNoPermitido.mensajes.at(-1).texto, /no está disponible para delivery/);
  assert.equal(pagoNoPermitido.carrito.length, 1, 'conserva el carrito después de rechazar pago');

  const r=await call({...base,accion:'mensaje',entrada:{datos:{nombre:'Ana',telefono:'1155551234',entrega:'envio',direccion:'Mitre 200',medio_pago:'efectivo',horario:'21:30',nota:'Tocar timbre'}}});
  assert.equal(r.pedido.estado,'pendiente');
  assert.equal(Number(r.pedido.total),2500);
  assert.match(r.pedido.aviso,/pendiente de revisión/);
  const row=(await db.query('select * from gestlok_chat_private.pedidos')).rows[0];
  assert.equal(row.nota,'Tocar timbre'); assert.equal(row.horario,'21:30'); assert.equal(row.confirmado_at,null);
  const decide=async decision=>db.transaction(async tx=>{
   await tx.query("select set_config('request.jwt.claims', $1, true)",[JSON.stringify({sub:'c0000000-0000-4000-8000-000000000003',email:'gerente.munro@prueba.example',role:'authenticated'})]);
   await tx.exec('set local role authenticated');
   return tx.query('select public.gestlok_chat_panel_decidir($1,$2)',[row.id,decision]);
  });
  await assert.rejects(()=>decide('terminado'),/primero debe confirmarse/);
  await decide('confirmado');
  let status=await call({...base,accion:'estado'});
  assert.equal(status.pedidos[0].estado,'confirmado'); assert.match(status.pedidos[0].aviso,/gerente confirmó/);
  await decide('terminado');
  status=await call({...base,accion:'estado'});
  assert.equal(status.pedidos[0].estado,'terminado');
  assert.equal((await call({...base,token:'otroTokenDeOtroCliente000000000000000002',accion:'estado'})).pedidos.length,0);
 } finally { globalThis.Deno=previous; delete globalThis.__chatTestClient; await db.close(); }
});
