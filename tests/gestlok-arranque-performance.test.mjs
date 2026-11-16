import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const runtime=readFileSync(new URL('../components/stock-runtime.tsx',import.meta.url),'utf8');

test('El arranque prepara los módulos operativos sin cambiar dependencias críticas',()=>{
 const first=runtime.indexOf('await load("/stock/gestlok-invites.js?rev=invite-google-20261107")');
 const auth=runtime.indexOf('await load(visitor ? "/stock/gestlok-visitor-demo.js" : "/stock/auth.js');
 const batch=runtime.indexOf('await loadInOrderedBatches(queuedScripts)');
 const app=runtime.indexOf('await load("/stock/app.js?rev=munro-staff-pc-20261113")');
 assert.ok(first>0&&auth>first,'Auth debe iniciar tras invitaciones');
 assert.ok(batch>auth&&app>batch,'app.js solo ejecuta cuando los módulos están listos');
 for(const name of ['mi-gusto-conteo-morning.js','mi-gusto-conteo.js','gestlok-molino.js','gestlok-caja-diaria.js','gestlok-form-draft-guard.js'])
  assert.ok(runtime.indexOf('queueLoad("/stock/'+name)>0,'Se conserva '+name);
});

test('La descarga usa lotes de 8 scripts, sin ejecutar fuera de orden',async()=>{
 const begin=runtime.indexOf('async function loadInOrderedBatches(');
 const end=runtime.indexOf('// Fetch independent',begin);
 assert.ok(begin>0&&end>begin);
 // Evaluar la misma función, quitando únicamente anotaciones TypeScript.
 const code=runtime.slice(begin,end).replace(': string[]','').replace('new Promise<void>','new Promise');
 const scripts=[];
 const context={basePath:'',document:{createElement:()=>({}),body:{appendChild:s=>scripts.push(s)}}};
 const load=vm.runInNewContext(code+'\nloadInOrderedBatches',context);
 let finished=false;
 const task=load(Array.from({length:18},(_,i)=>'/stock/'+i+'.js')).then(()=>finished=true);
 assert.equal(scripts.length,8,'Primera tanda en paralelo');
 assert.ok(scripts.every(s=>s.async===false),'No se pierde el orden de ejecución');
 for(let i=7;i>0;i--)scripts[i].onload();
 await Promise.resolve();
 assert.equal(scripts.length,8,'La siguiente tanda no inicia antes de completar la anterior');
 scripts[0].onload();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(scripts.length,16);
 for(let i=8;i<16;i++)scripts[i].onload();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(scripts.length,18);
 scripts[16].onload();scripts[17].onload();
 await task;
 assert.equal(finished,true);
});
