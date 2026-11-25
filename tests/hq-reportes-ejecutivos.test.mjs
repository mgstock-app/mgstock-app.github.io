import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Alex separa decisión, resumen y respaldo sin alterar los informes previos',()=>{
const s=read('public/stock/gestlok-creator-home.js');
const fn=s.slice(s.indexOf('  function hqReportParts('),s.indexOf('  function hqReportCard('));
const parse=vm.runInNewContext(fn+';hqReportParts');
const x=parse('INFORME DE DIRECCIÓN · PARA APROBACIÓN\nTÍTULO: Revisar caja\nTIPO: DECISIÓN\nPRIORIDAD: ALTA\nSITUACIÓN: Falta evidencia.\nACCIÓN: Autorizar una prueba.\n\nPROPUESTAS REGISTRADAS\nTexto largo');
assert.equal(x.valid,true);assert.equal(x.action,'Autorizar una prueba.');assert.equal(x.evidence,'Texto largo');
assert.equal(parse('Informe anterior sin etiquetas').valid,false);
assert.equal(parse('TÍTULO: A\nTIPO: INFORMATIVO\nPRIORIDAD: BAJA\nSITUACIÓN: B\nACCIÓN: C').type,'INFORMATIVO');
assert.match(s,/Marcar revisado/);assert.match(s,/No ejecuta cambios ni publicaciones/);assert.match(s,/esc\(p\.action\)/);
for(const name of ['gestlok-hq-agent','gestlok-hq-worker'])assert.match(read('supabase/functions/'+name+'/index.ts'),/TIPO: DECISIÓN o INFORMATIVO/);
});
