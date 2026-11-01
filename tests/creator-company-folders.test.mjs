import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
function load(role='creadora'){
 const listeners={};const window={addEventListener(){},GestLokSupabase:{rpc:async fn=>({data:fn==='gestlok_creator_companies_index'?{scope:'metadata_only',companies:[{tenant_id:'own',name:'Mi Gusto',locals:[{id:'munro',name:'Munro'},{id:'torcuato',name:'Torcuato'}]},{tenant_id:'other',name:'Empresa <externa>',locals:[{id:'munro',name:'Otro Munro'}]},{tenant_id:'empty',name:'Sin locales',locals:[]}]}:[],error:null})}};
 vm.runInNewContext(source,{window,document:{addEventListener(n,f){listeners[n]=f;}}});
 const api=window.GestLokOwnerAreas;api.attach({role:()=>role,S:{loaded:{e:true},me:{tenant_id:'own'}},render(){}});return api;
}
test('Locales agrupa todas las empresas y conserva el tenant de locales con el mismo id',async()=>{
 const a=load();await a.refreshAdmin();const html=a.companyFolders();
 assert.equal((html.match(/<details /g)||[]).length,3);
 assert.match(html,/data-act="local" data-id="munro"/);
 assert.match(html,/data-act="local" data-id="torcuato"/);
 assert.match(html,/data-company-local="munro" data-company-tenant="other"/);
 assert.match(html,/Empresa &lt;externa&gt;/);
 assert.match(html,/todavía no tiene locales creados/);
});
test('Otros roles no reciben el directorio de administradora',async()=>{
 for(const role of ['dueno','gerente','lectura']){const a=load(role);await a.refreshAdmin();assert.equal(a.companyFolders(),'');}
});
