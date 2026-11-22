import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const script=new URL('../scripts/vercel-ignore-entornos.mjs',import.meta.url).pathname;
function check(branch,project,url){
 const env={...process.env,VERCEL_GIT_COMMIT_REF:branch,VERCEL_PROJECT_NAME:project||'',VERCEL_PROJECT_PRODUCTION_URL:url||''};
 const run=spawnSync(process.execPath,[script],{env,encoding:'utf8'});
 assert.equal(run.error,undefined);
 return run.status;
}
test('Vercel solo intenta publicar ramas Prueba y Testing, nunca main ni PRs',()=>{
 assert.deepEqual(config.git.deploymentEnabled,{'*':false,prueba:true,testing:true});
 assert.equal(config.ignoreCommand,'node scripts/vercel-ignore-entornos.mjs');
 for(const branch of ['main','fix/error','feat/nueva-cosa','pull/546','']) {
  assert.equal(check(branch,'gestlok-prueba'),0);
  assert.equal(check(branch,'gestlok-testing'),0);
 }
});
test('Prueba compila solo en el proyecto Prueba; Testing, solo en Testing',()=>{
 assert.equal(check('prueba','gestlok-prueba'),1);
 assert.equal(check('prueba','gestlok-testing'),0);
 assert.equal(check('testing','gestlok-testing'),1);
 assert.equal(check('testing','gestlok-prueba'),0);
});
test('El filtro de Vercel funciona con dominios oficiales si falta project_name',()=>{
 assert.equal(check('prueba','','gestlok-testing.vercel.app'),0);
 assert.equal(check('testing','','gestlok-prueba.vercel.app'),0);
 assert.equal(check('prueba','','gestlok-prueba.vercel.app'),1);
});
test('Ninguna configuración ambigua bloquea por accidente el sitio correcto',()=>{
 assert.equal(check('prueba','',''),1);
 assert.equal(check('testing','proyecto-renombrado',''),1);
});
