import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync('public/stock/app.js','utf8');
const start=source.indexOf('      if(raw){\n        const target=JSON.parse(raw);');
const end=source.indexOf('\n      }\n    }catch{}',start);
assert.ok(start>=0&&end>start,'Encontrar navegación de regreso a local auditada');
const block=source.slice(start,end+'\n      }'.length);
function create(){
  const values=new Map();
  const sessionStorage={
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,value),
    removeItem:key=>values.delete(key)
  };
  const S={me:{email:'admin@example.com',tenant_id:'anterior'}};
  let locals=[],opened=[];
  const fn=vm.runInNewContext('(function(){ const raw=sessionStorage.getItem("gestlok:profile-next-local");'+block+'})',{
    S,sessionStorage,Date,
    mios:{some:function(){}},
    get mios(){return locals;},
    abrirLocal:id=>opened.push(id)
  });
  // Crear un contexto nuevo para cada ejecución evita atajos de módulos.
  const run=(provided,tenant,localsNow)=>{
    S.me.tenant_id=tenant;
    const ctx={S,sessionStorage,Date,mios:localsNow,abrirLocal:id=>opened.push(id)};
    const execute=vm.runInNewContext('(function(){ const raw=sessionStorage.getItem("gestlok:profile-next-local");'+block+'})',ctx);
    execute();
  };
  return {values,S,sessionStorage,opened,run};
}
test('No consume el destino cuando todavía está cargada la empresa anterior',()=>{
  const t=create();
  t.values.set('gestlok:profile-next-local',JSON.stringify({
    email:'admin@example.com',tenant_id:'molino',local_id:'acassuso',created_at:Date.now()
  }));
  t.run(null,'anterior',[{id:'munro'}]);
  assert.ok(t.values.has('gestlok:profile-next-local'),'El destino permanece guardado');
  assert.equal(t.opened.length,0);
  t.run(null,'molino',[]);
  assert.ok(t.values.has('gestlok:profile-next-local'),'Espera locales autorizados');
  t.run(null,'molino',[{id:'acassuso'}]);
  assert.deepEqual(t.opened,['acassuso']);
  assert.equal(t.values.has('gestlok:profile-next-local'),false);
});
test('Un destino vencido o de otra cuenta se descarta sin abrir locales',()=>{
  const t=create();
  t.values.set('gestlok:profile-next-local',JSON.stringify({
    email:'admin@example.com',tenant_id:'molino',local_id:'acassuso',created_at:Date.now()-700000
  }));
  t.run(null,'molino',[{id:'acassuso'}]);
  assert.equal(t.values.size,0);
  t.values.set('gestlok:profile-next-local',JSON.stringify({
    email:'otro@example.com',tenant_id:'molino',local_id:'acassuso',created_at:Date.now()
  }));
  t.run(null,'molino',[{id:'acassuso'}]);
  assert.equal(t.values.size,0);
  assert.equal(t.opened.length,0);
});
