import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/stock/app.js', import.meta.url), 'utf8');
const start = source.indexOf('let stockRefreshBusy = false;');
const end = source.indexOf('\nfunction openSaveF(){', start);
assert.ok(start > 0 && end > start, 'El refresco del stock debe estar implementado');
const refreshCode = source.slice(start, end) + '\nthis.refreshStockFromServer = refreshStockFromServer;';

function fixture({ rows, fail = false, draft = {} } = {}){
  const button = { disabled:false, textContent:'', innerHTML:'' };
  const events = [];
  const stock = { id:'pepperoni', nombre:'PEPPERONI', hoja:'h-724a77f119', local:0, sinStock:true };
  const S = {local:'munro',view:'h-724a77f119',allFab:[{...stock}],loaded:{f:true},fdraft:draft};
  const ctx = {
    S, URL,
    window: {
      SPM_CONFIG:{url:'https://example.supabase.co',key:'anon-publica'},
      GestLokSupabase:{auth:{getSession:async()=>({data:{session:{access_token:'token-de-prueba'}}})}}
    },
    navigator:{onLine:true},
    document:{querySelector:()=>button},
    isFabV:()=>true,
    ic:()=>'<svg/>',
    withCtx:(_view,fn)=>fn(),
    fPend:()=>S.fdraft.pepperoni?.l !== undefined && S.fdraft.pepperoni.l !== S.allFab[0].local ? [S.allFab[0]] : [],
    onSnapRefresh:()=>events.push(['render']),
    toast:(message,error)=>events.push(['toast',message,error]),
    fetch:async(url,options)=>{
      events.push(['fetch',url,options]);
      if(fail)throw new Error('sin conexión con el servidor');
      return {ok:true,json:async()=>rows??[{id:'pepperoni',data:{...stock,local:0.5,sinStock:false}}]};
    }
  };
  runInNewContext(refreshCode,ctx);
  return {ctx,S,events,button};
}

test('Stock Local Munro lee la fuente real de Supabase y corrige ceros visuales', async()=>{
  const f=fixture();
  await f.ctx.refreshStockFromServer();
  assert.equal(f.S.allFab[0].local,0.5);
  assert.equal(f.S.allFab[0].sinStock,false);
  const request=f.events.find(e=>e[0]==='fetch');
  assert.equal(new URL(request[1]).searchParams.get('col'),'eq.munro/fabrica');
  assert.equal(request[2].cache,'no-store');
  assert.ok(f.events.some(e=>e[0]==='render'));
  assert.ok(f.events.some(e=>e[0]==='toast' && /actualizado desde el servidor/i.test(e[1])));
});

test('Conserva los borradores locales que todavía no fueron guardados',async()=>{
  const draft={pepperoni:{l:0}},f=fixture({draft});
  await f.ctx.refreshStockFromServer();
  assert.deepEqual(f.S.fdraft,draft);
  assert.equal(f.S.allFab[0].local,0.5);
  assert.ok(f.events.some(e=>e[0]==='toast' && /cambios sin guardar/i.test(e[1])));
});

test('Ante error de red conserva la planilla previa, sin sobrescribir la base',async()=>{
  const f=fixture({fail:true});
  await f.ctx.refreshStockFromServer();
  assert.equal(f.S.allFab[0].local,0);
  assert.ok(f.events.some(e=>e[0]==='toast' && /no se pudo actualizar/i.test(e[1])));
  assert.equal(f.button.disabled,false);
});

test('Un resultado vacío inesperado no reemplaza una planilla existente',async()=>{
  const f=fixture({rows:[]});
  await f.ctx.refreshStockFromServer();
  assert.equal(f.S.allFab.length,1);
  assert.equal(f.S.allFab[0].local,0);
});
