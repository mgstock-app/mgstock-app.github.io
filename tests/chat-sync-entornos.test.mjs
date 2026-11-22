import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';

const command=new URL('../scripts/sync-gestlok-chat-entornos.mjs',import.meta.url).pathname;
function put(root,path,data){
 const target=join(root,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,data);
}
test('al actualizar Chat, prueba/testing reciben código y SQL sin borrar sus demos ni tocar producción',()=>{
 const root=mkdtempSync(join(tmpdir(),'chat-sync-'));
 const src=join(root,'main'),dst=join(root,'prueba');
 try{
  put(src,'entornos/entornos.json',JSON.stringify({
   real:{ref:'produccion'},pruebas:{ref:'aislado'},
   entornos:{prueba:{sitio:'https://prueba.example.com'},testing:{sitio:'https://testing.example.com'}}
  }));
  put(src,'entornos/backend.mjs','// backend aislado');
  put(src,'vercel.json','{"git":{"deploymentEnabled":{"*":false,"prueba":true,"testing":true}}}');
  put(src,'scripts/vercel-ignore-entornos.mjs','// only correct project');
  put(src,'entornos/sql.txt','# base\nentornos/sql/base-pruebas.sql\nentornos/sql/semilla.sql\n');
  for(const dir of ['public/chat','supabase/functions/gestlok-chat',
   'supabase/functions/gestlok-chat-push','public/icons','public/img','public/vendor']){
   put(src,dir+'/recurso.txt','de main');
  }
  put(src,'supabase/migrations/20261121220000_gestlok_chat_nuevo.sql','select 1;');
  put(src,'supabase/migrations/20261122220000_otra_app.sql','select 2;');
  put(dst,'.git','gitdir: fake\n');
  put(dst,'entornos/construir.mjs','// constructor exclusivo de Prueba');
  put(dst,'entornos/sql/catalogo-demo.sql','-- datos ficticios');
  put(dst,'entornos/sql.txt','# viejo\nentornos/sql/base-pruebas.sql\nentornos/sql/semilla.sql\nentornos/sql/catalogo-demo.sql\n');
  put(dst,'public/chat/recurso.txt','antiguo');
  put(dst,'public/chat/obsoleto.txt','sacar');
  put(dst,'public/img/imagen-extra.txt','conservar');
  execFileSync(process.execPath,[command,src,dst,'prueba']);
  assert.equal(readFileSync(join(dst,'public/chat/recurso.txt'),'utf8'),'de main');
  assert.equal(existsSync(join(dst,'public/chat/obsoleto.txt')),false);
  assert.equal(readFileSync(join(dst,'entornos/construir.mjs'),'utf8'),'// constructor exclusivo de Prueba');
  assert.match(readFileSync(join(dst,'vercel.json'),'utf8'),/"prueba":true/);
  assert.equal(readFileSync(join(dst,'scripts/vercel-ignore-entornos.mjs'),'utf8'),'// only correct project');
  assert.equal(readFileSync(join(dst,'public/img/imagen-extra.txt'),'utf8'),'conservar');
  assert.equal(existsSync(join(dst,'supabase/migrations/20261122220000_otra_app.sql')),false);
  const sql=readFileSync(join(dst,'entornos/sql.txt'),'utf8');
  assert.match(sql,/20261121220000_gestlok_chat_nuevo.sql/);
  assert.ok(sql.indexOf('20261121220000')<sql.indexOf('entornos/sql/semilla.sql'));
  assert.ok(sql.indexOf('entornos/sql/catalogo-demo.sql')>sql.indexOf('entornos/sql/semilla.sql'));
  execFileSync(process.execPath,[command,src,dst,'testing']);
  assert.equal((readFileSync(join(dst,'entornos/sql.txt'),'utf8').match(/20261121220000/g)||[]).length,1);
  assert.equal(readFileSync(join(src,'public/chat/recurso.txt'),'utf8'),'de main');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('el sincronizador impide usar la misma rama o una base real como destino de pruebas',()=>{
 const dir=mkdtempSync(join(tmpdir(),'chat-sync-guard-'));
 try{
  put(dir,'.git','gitdir: fake');
  assert.throws(()=>execFileSync(process.execPath,[command,dir,dir,'prueba'],{stdio:'pipe'}));
  assert.throws(()=>execFileSync(process.execPath,[command,dir,join(dir,'otro'),'main'],{stdio:'pipe'}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('todo nuevo SQL Chat de main se descubre en lugar de depender de una lista manual',()=>{
 const names=['20261121220000_gestlok_chat_contadores_comandas_activas.sql',
  '20261121214500_gestlok_chat_ajustes_medios_pago_consistentes.sql'];
 for(const file of names)
  assert.ok(existsSync(new URL('../supabase/migrations/'+file,import.meta.url)));
 const code=readFileSync(command,'utf8');
 assert.match(code,/readdirSync\(join\(source,'supabase\/migrations'\)\)/);
 assert.match(code,/migrations\.filter\(path=>!present\.has\(path\)\)/);
});
