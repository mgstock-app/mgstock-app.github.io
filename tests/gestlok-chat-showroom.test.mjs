import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const bridge=readFileSync('public/chat/showroom-bridge.js','utf8');
const creator=readFileSync('public/stock/gestlok-creator-home.js','utf8');
const cliente=readFileSync('public/chat/chat.js','utf8');
const gerente=readFileSync('public/chat/panel/panel.js','utf8');
const htmlCliente=readFileSync('public/chat/index.html','utf8');
const htmlGerente=readFileSync('public/chat/panel/index.html','utf8');
function load(query, map=new Map()){
  const storage={
    getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)
  };
  const window={};
  vm.runInNewContext(bridge,{
    window,sessionStorage:storage,location:{search:query},
    URLSearchParams,Date,JSON,Object,Number,String,Array
  });
  return {api:window.GestLokChatShowroom,map};
}

test('modo comercial aislado: cliente y gerente comparten solo datos ficticios de la sesión',()=>{
  const store=new Map();
  const cli=load('?demo=1&showroom=1',store).api;
  const encargado=load('?demo=1&showroom=1',store).api;
  assert.equal(cli.enabled,true);
  cli.add('cliente','Quiero dos empanadas de carne');
  const pending=cli.order({cliente_nombre:'Ana de prueba',items:[{cantidad:2,nombre:'Empanada de carne'}],
    total:2400,entrega:'retiro',medio_pago:'efectivo'});
  assert.equal(encargado.read().order.estado,'pendiente');
  assert.equal(encargado.read().order.cliente_nombre,'Ana de prueba');
  assert.equal(encargado.decide(pending.id,'terminado',''),false,'no permite listo sin confirmar');
  assert.equal(encargado.decide(pending.id,'confirmado',''),true);
  assert.equal(cli.read().order.estado,'confirmado');
  encargado.add('local','Su pedido fue confirmado');
  assert.equal(cli.read().messages.at(-1).rol,'local');
  assert.equal(encargado.decide(pending.id,'terminado',''),true);
  assert.equal(cli.read().order.estado,'terminado');
  cli.reset();
  assert.equal(encargado.read().order,null);
  assert.equal(encargado.read().messages.length,0);
});
test('no existe puente si falta demo=1 o showroom=1 y nunca escribe en sesión',()=>{
  const map=new Map();
  for(const q of ['?demo=1','?showroom=1','?s=mi-gusto-munro','']){
    const {api}=load(q,map);
    assert.equal(api.enabled,false);
    assert.equal(api.order({nombre:'real'}),null);
    assert.equal(api.add('cliente','real'),null);
    assert.equal(api.decide('real','confirmado'),false);
  }
  assert.equal(map.size,0);
});
test('la creadora tiene entrada en Inicio y dos perfiles usando los modos reales sin red',()=>{
  assert.match(creator,/\['chat-prueba', 'Prueba GESTLOK Chat'/);
  assert.match(creator,/data-ch-tab="chat-prueba"/);
  assert.match(creator,/if \(!api\?\.isCreadora\?\.\(\)\) return '';/);
  assert.match(creator,/Perfil de local · Gerente/);
  assert.match(creator,/Perfil de cliente/);
  assert.match(creator,/\/chat\/panel\/\?demo=1&showroom=1/);
  assert.match(creator,/\/chat\/\?demo=1&showroom=1/);
  assert.match(creator,/data-ch-showroom-reset/);
  assert.match(htmlCliente,/showroom-bridge\.js/);
  assert.match(htmlGerente,/showroom-bridge\.js/);
  assert.match(cliente,/if \(DEMO\) return demoApi\(accion, extra\);/);
  assert.match(gerente,/if \(DEMO\) return demoRpc\(fn, args \|\| \{\}\);/);
  assert.match(cliente,/SHOWROOM\.order\(/);
  assert.match(gerente,/SHOWROOM\.decide\(/);
  assert.doesNotMatch(bridge,/supabase|\/functions\/v1|fetch\(/i);
});
