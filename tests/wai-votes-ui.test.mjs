import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/chat/wai/wai.js','utf8');
const node=(tag,attrs={},...children)=>({tag,...attrs,children:children.filter(v=>v!=null)});
const ctx=vm.createContext({node});
vm.runInContext(source.slice(source.indexOf('function renderVote('),source.indexOf('function renderMessage(')),ctx);
const opts=[{id:'sm_2_1',label:'2 × Criolla'},{id:'sm_1_2',label:'1 × Cheddar'},{id:'sm_1_3',label:'1 × Ajo'}];
const msg=(v={})=>({estado:'aceptado',interaccion:{opciones:opts,multiple:true,cantidad:3,...v}});
test('WAI: first accepted poll is compact, green, read-only; unselected choices remain in collapsed history',()=>{
 const card=ctx.renderVote(msg({seleccion:'sm_2_1,sm_1_2',estado_votacion:'seleccionada'}),{});
 assert.match(card.class,/wai-vote-closed/);
 assert.equal(card.children[0].children[0],'✓ Votación finalizada');
 assert.equal(card.children.filter(x=>x.class==='wai-option chosen').length,2);
 const history=card.children.find(x=>x.tag==='details');
 assert.equal(history.open,undefined);
 assert.deepEqual(history.children[1].children.map(x=>x.children[0]),['1 × Ajo']);
 assert.equal(card.children.some(x=>x.tag==='button'||x.onclick),false);
});
test('WAI: unanswered current poll shows quantity, closed or stale poll collapses all previous options',()=>{
 const pending=ctx.renderVote(msg({estado_votacion:'abierta'}),{});
 assert.match(pending.class,/wai-vote-open/);
 assert.equal(pending.children[0].children.join(''),'Esperando selección · 3 en total');
 assert.equal(pending.children.filter(x=>x.class==='wai-option').length,3);
 for(const estado_votacion of ['respondida','reemplazada','finalizada','vencida','cancelada','sin_confirmar']){
  const closed=ctx.renderVote(msg({estado_votacion}),{});
  assert.match(closed.class,/wai-vote-closed/);
  assert.equal(closed.children.filter(x=>x.class?.includes('wai-option chosen')).length,0);
  assert.equal(closed.children[1].tag,'details');
 }
 // Review remains actionable when its own invitation closed the chat.
 assert.match(ctx.renderVote(msg({estado_votacion:'abierta'}),{cerrado_at:'today'}).class,/wai-vote-open/);
});
