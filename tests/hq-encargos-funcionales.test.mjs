import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('HQ registra encargos limitados y no autónomos',()=>{
 const sql=read('supabase/migrations/20261125210000_gestlok_hq_encargos_funcionales.sql');
 assert.match(sql,/not t.targeted/);assert.match(sql,/old.state is distinct from 'working'/);
 assert.match(sql,/desarrollo\|marketing\|difusion\|testing/);assert.match(sql,/true,false\) returning id/);
 assert.match(sql,/and p.targeted/);assert.match(sql,/revoke all on function/);
});
test('HQ entrega archivos y prepara GitHub sin publicar',()=>{
 const js=read('public/stock/gestlok-creator-home.js');
 assert.match(js,/data-ch-hq-piece/);assert.match(js,/image\/svg\+xml/);
 assert.match(js,/issues\/new\?title=/);assert.match(js,/encodeURIComponent/);
 assert.match(js,/!parent.targeted/);
 for(const f of ['gestlok-hq-agent','gestlok-hq-worker']){
 const s=read('supabase/functions/'+f+'/index.ts');assert.match(s,/SOLICITUD_HQ/);assert.match(s,/PIEZA_HQ/);assert.match(s,/GESTLOK_HQ_GROQ_FREE_API_KEY/);
 }
});
