import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql = file('supabase/migrations/20261030205527_gestlok_creator_second_brain_private.sql');
const frontend = file('public/stock/gestlok-second-brain.js');

test('Segundo cerebro: backend protege TODO acceso con identidad de creadora real', () => {
  assert.match(sql,/create table if not exists gestlok_platform\.creator_ideas/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on gestlok_platform\.creator_ideas from public, anon, authenticated/);
  assert.match(sql,/revoke all on function public\.gestlok_creator_ideas_list\(\) from public, anon, authenticated/);
  assert.match(sql,/revoke all on function public\.gestlok_creator_ideas_save\(text,text,text,text,uuid\) from public, anon, authenticated/);
  const checks = [...sql.matchAll(/perform gestlok_platform\.require_admin\(\)/g)];
  assert.equal(checks.length,2,'lista y guardado deben validar creadora verificada');
  assert.doesNotMatch(sql,/grant (select|insert|update|delete) on gestlok_platform\.creator_ideas/i);
});

test('Solo la Creadora tiene la pestaña, sin filtrar a roles de comercio', () => {
  const runtime=file('components/stock-runtime.tsx');
  const dashboard=file('public/stock/gestlok-creator-home.js');
  const app=file('public/stock/app.js');
  assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-second-brain\.js/);
  assert.match(dashboard,/\['ideas', 'Segundo cerebro'/);
  assert.match(dashboard,/cur === 'ideas'.*GestLokSecondBrain\?\.view/s);
  assert.match(app,/GestLokSecondBrain\?\.attach\(\{S,isCreadora/);
  assert.match(frontend,/api\?\.isCreadora\?\.\(\) === true/);
  assert.match(frontend,/GestLokCreatorSupport\?\.previewRol/);
  assert.match(frontend,/gestlok_creator_ideas_list/);
  assert.match(frontend,/gestlok_creator_ideas_save/);
  assert.doesNotMatch(frontend,/localStorage\.|sessionStorage\./);
});

test('Nunca muestra ideas si el rol no es la Creadora', () => {
  const handlers={};
  const document={
    addEventListener(event,listener){handlers[event]=listener;},
    getElementById(){return null;},
    createElement(){return {style:{},textContent:''};},
    head:{appendChild(){}}
  };
  let calls=0;
  const window={GestLokSupabase:{rpc(){calls++;return Promise.resolve({data:[]});}}};
  vm.runInNewContext(frontend,{document,window,Intl,Date,queueMicrotask:fn=>fn()});
  const brain=window.GestLokSecondBrain;
  brain.attach({isCreadora:()=>false,render(){}});
  assert.equal(brain.view(),'');
  brain.refresh();
  assert.equal(calls,0);
  assert.equal(typeof handlers.submit,'function');
});