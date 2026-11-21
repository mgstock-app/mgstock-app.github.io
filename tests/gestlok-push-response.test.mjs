import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// La función atiende suscripciones y preferencias; una llamada recursiva aquí daba HTTP 500.
const source=readFileSync(new URL('../supabase/functions/gestlok-push/index.ts',import.meta.url),'utf8');

test('GESTLOK Push: respuesta HTTP usa el helper JSON sin recursión',()=>{
 const encontrado=source.match(/const reply=\(status:number,data:unknown\)=>([^;]+);/);
 assert.ok(encontrado,'El helper de respuesta debe existir');
 assert.equal(encontrado[1].trim(),'json(status,data,accepted)');
 assert.doesNotMatch(source,/const reply=\(status:number,data:unknown\)=>reply\(/);
});

test('GESTLOK Push: rechazos y respuestas mantienen comprobación de origen',()=>{
 assert.match(source,/if\(origin&&!allowedOrigins\.has\(origin\)\)return reply\(403,/);
 assert.match(source,/return reply\(403,\{ok:false,error:"Solo personal autorizado puede gestionar notificaciones"\}\)/);
 assert.match(source,/return reply\(200,\{ok:true,preferences:await prefOf/);
});
