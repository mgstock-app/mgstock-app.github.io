import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/stock/gestlok-registration.js','utf8');
const load=()=>{const window={};vm.runInNewContext(source,{window,document:{addEventListener(){}}});return window.GestLokRegistration;};
test('Dueño puede solicitar empleados, empresa o ambas sin obtener permisos',()=>{
  const g=load();
  for(const [choice,expected] of Object.entries({empleados:['recibos_personal'],empresa:['comercial'],ambas:['comercial','recibos_personal']})){
    const intent=g.parse('dueno',choice);assert.deepEqual(Array.from(intent.modules),expected);
    assert.equal(intent.kind,'dueno');assert.equal(intent.role,undefined);assert.equal(intent.enabled,undefined);
  }
});
test('Colaboradores no solicitan módulos de dueño y las selecciones desconocidas fallan',()=>{
  const g=load();assert.equal(g.parse('colaborador','ambas').modules.length,0);
  for(const args of [['creadora','ambas'],['dueno','admin'],['dueno','__proto__'],['','']])assert.throws(()=>g.parse(...args));
});
test('El panel administrativo distingue preferencias de concesión de acceso',()=>{
  const g=load();assert.match(g.label({tipoCuenta:'dueno',modulosSolicitados:['recibos_personal']}),/empleados/);
  assert.equal(g.label({tipoCuenta:'colaborador'}),'Solicitud de colaborador/a');
  const app=readFileSync('public/stock/app.js','utf8');
  assert.match(app,/if \(x.tipoCuenta === 'dueno'\).*alta independiente/s);
});

test('El catálogo permite combinar microapps y traduce la selección a áreas solicitadas',()=>{
  const g=load();
  assert.equal(g.microappLabel('scanner'),'Plan Scanner');
  assert.equal(g.microappLabel('empleados'),'Personal y recibos');
  assert.equal(g.choiceForApps(['scanner','stock','precios']),'empresa');
  assert.equal(g.choiceForApps(['empleados']),'empleados');
  assert.equal(g.choiceForApps(['scanner','empleados']),'ambas');
  assert.equal(g.choiceForApps([]),'');
});
test('La base guarda una solicitud de microapps, no permisos de empresa',()=>{
  const sql=readFileSync('supabase/migrations/20261108160000_gestlok_microapp_catalog_requests.sql','utf8');
  assert.match(sql,/microapps text\[\]/);
  assert.match(sql,/customization_notes text/);
  assert.match(sql,/gestlok_request_business_registration_v2/);
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/gestlok_platform\.admins/);
  assert.match(sql,/cardinality\(p_microapps\) not between 1 and 7/);
  assert.match(sql,/revoke all on function public\.gestlok_request_business_registration_v2/);
  assert.doesNotMatch(sql,/\btruncate\b|\bdrop\s+table\b/i);
});
