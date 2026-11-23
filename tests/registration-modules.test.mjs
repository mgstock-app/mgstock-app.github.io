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
  const g=load();
  // El gerente se registra con el código privado del local: sin código no hay solicitud.
  assert.throws(()=>g.parse('colaborador','ambas'),/código privado del local/);
  const gerente=g.parse('colaborador','ambas',null,' k7pa-3qxm ');
  assert.equal(gerente.modules.length,0);assert.equal(gerente.codigo,'K7PA3QXM');
  for(const args of [['creadora','ambas'],['dueno','admin'],['dueno','__proto__'],['','']])assert.throws(()=>g.parse(...args));
});
test('El panel administrativo distingue preferencias de concesión de acceso',()=>{
  const g=load();assert.match(g.label({tipoCuenta:'dueno',modulosSolicitados:['recibos_personal']}),/empleados/);
  assert.equal(g.label({tipoCuenta:'colaborador'}),'Solicitud de colaborador/a');
  const app=readFileSync('public/stock/app.js','utf8');
  assert.match(app,/if \(x.tipoCuenta === 'dueno'\).*alta independiente/s);
});
test('GESTLOK Chat: el dueño pide su alta con los datos del comercio y no recibe permisos',()=>{
  const g=load();
  assert.throws(()=>g.parse('dueno','chat'),/nombre de tu comercio/);
  assert.throws(()=>g.parse('dueno','chat',{nombre:'La Esquina',rubro:'armas'}),/rubro/);
  const intent=g.parse('dueno','chat',{nombre:'  La   Esquina ',rubro:'gastronomia',localidad:' Vicente López '});
  assert.deepEqual(Array.from(intent.modules),['gestlok_chat']);
  assert.deepEqual({...intent.negocio},{nombre:'La Esquina',rubro:'gastronomia',localidad:'Vicente López'});
  assert.equal(intent.role,undefined);assert.equal(intent.enabled,undefined);
  assert.match(g.label({tipoCuenta:'dueno',modulosSolicitados:['gestlok_chat'],negocio:{nombre:'La Esquina',rubro:'gastronomia'}}),
    /GESTLOK Chat · La Esquina \(Gastronomía.*Herramientas → GESTLOK Chat/);
  assert.match(source,/rpc\('gestlok_request_chat_registration',\{p_negocio:intent\.negocio\}\)/);
});
test('GESTLOK Chat: la aprobación crea empresa nueva con el chat apagado y solo la hace la administradora',()=>{
  const sql=readFileSync('supabase/migrations/20261123170000_gestlok_chat_alta_propia_comercios.sql','utf8');
  assert.match(sql,/v_admin := gestlok_platform\.exigir_creadora_microapps\(\);/);
  assert.match(sql,/r\.status <> 'pending' or r\.modules is distinct from array\['gestlok_chat'\]/);
  assert.match(sql,/gestlok_creator_crear_empresa_microapps\(r\.negocio->>'nombre', r\.email, null\)/);
  assert.match(sql,/update gestlok_chat_private\.sucursales set activa = false where tenant_id = v_tenant;/);
  assert.match(sql,/revoke all on function public\.gestlok_creator_aprobar_chat\(uuid\) from public, anon;/);
  const home=readFileSync('public/stock/gestlok-creator-home.js','utf8');
  assert.match(home,/rpc\('gestlok_creator_aprobar_chat',\{p_user:user\}\)/);
  assert.match(home,/if\(!premiumAdmin\(\)\)return '';/);
});
test('Alta pública: solo GESTLOK Chat, «Otro rubro» escrito a mano, gerente con código y Google',()=>{
  const g=load();
  assert.equal(g.parse('dueno','',{nombre:'Kiosco Sol',rubro:'almacen'}).choice,'chat');
  assert.throws(()=>g.parse('dueno','chat',{nombre:'La Esquina',rubro:'otro'}),/cuál es tu rubro/);
  assert.deepEqual({...g.parse('dueno','chat',{nombre:'La Esquina',rubro:'otro',rubro_otro:' Heladería '}).negocio},
    {nombre:'La Esquina',rubro:'otro',rubro_otro:'Heladería',localidad:''});
  assert.match(source,/Soy gerente de un local/);
  assert.doesNotMatch(source,/Soy colaborador\/a de una empresa/);
  assert.match(source,/rpc\('gestlok_request_gerente_registration',\{p_codigo:intent\.codigo\}\)/);
  assert.match(source,/Registrarme con Google/);
  assert.match(source,/Recordar mi email/);
  assert.match(g.label({tipoCuenta:'colaborador',negocio:{tipo:'gerente',empresa:'Mi Gusto',local:'Munro'}}),/gerente · Mi Gusto · Munro · La acepta el dueño/);
  const sql=readFileSync('supabase/migrations/20261123220000_gestlok_registro_gerentes_codigo.sql','utf8');
  assert.match(sql,/codigo text not null unique check \(codigo ~ '\^\[A-HJ-NP-Z2-9\]\{8\}\$'\)/);
  assert.match(sql,/perform gestlok_chat_private\.exigir\(p_sucursal, 'configurar'\);/);
  assert.match(sql,/if v_intentos >= 10 then/);
  assert.match(readFileSync('public/chat/panel/panel.js','utf8'),/rpc\('panel_gerente_resolver'/);
});
