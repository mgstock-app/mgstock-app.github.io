import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const file = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function cargar(){
  const ctx = {window:{}, document:{querySelector:()=>null}, navigator:{onLine:true}, Intl, Date, Math, Number, String, Set, Map, Array, Object, JSON, CSS:{escape:s=>s}};
  runInNewContext(file('public/stock/munro-motos.js'), ctx);
  return ctx.window.GestLokMunroMotos;
}

test('Motos Agencia: semana de lunes a domingo en hora de Buenos Aires y cierre automático el lunes', () => {
  const {_t:t} = cargar();
  assert.equal(t.lunesDe('2026-10-26'), '2026-10-26');
  assert.equal(t.lunesDe('2026-11-01'), '2026-10-26');
  assert.equal(t.lunesDe('2026-11-02'), '2026-11-02');
  assert.deepEqual([...t.diasDe('2026-10-26')], ['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
  // Domingo 23:30 en Buenos Aires (02:30 UTC del lunes) sigue siendo la semana anterior.
  assert.equal(t.semanaActual(new Date('2026-11-02T02:30:00Z')), '2026-10-26');
  assert.equal(t.semanaActual(new Date('2026-11-02T03:00:00Z')), '2026-11-02');
  assert.equal(t.numeroSemana('2026-10-26'), 44);
  assert.equal(t.numeroSemana('2025-12-29'), 1);
});

test('Motos Agencia: horas por turno, cruce de medianoche, turnos incompletos e importes', () => {
  const {_t:t} = cargar();
  assert.equal(t.turno('08:00', '16:30'), 510);
  assert.equal(t.turno('19:33', '00:00'), 267);
  assert.equal(t.turno('19:36', ''), 0);
  assert.equal(t.turno('25:00', '26:00'), 0);
  assert.equal(t.minutosDia({tm_e:'08:00', tm_s:'12:00', tt_e:'19:00', tt_s:'23:30'}), 510);
  assert.equal(t.fmtH(510), '8:30');
  assert.equal(t.fmtH(267), '4:27');
  // 4:27 h a $9.500 la hora = $42.275 (ejemplo del diseño aprobado).
  assert.equal(t.importe(267, 9500), 42275);
  assert.equal(t.importe(510, 0), 0);
});

test('Motos Agencia: el valor por hora rige desde su semana y no cambia el historial', () => {
  const {_t:t} = cargar();
  const valores = {lucas:[{desde:'2026-10-19', valor:9000}, {desde:'2026-11-02', valor:9500}]};
  assert.equal(t.tarifaEn(valores, 'lucas', '2026-10-12'), 0);
  assert.equal(t.tarifaEn(valores, 'lucas', '2026-10-26'), 9000);
  assert.equal(t.tarifaEn(valores, 'lucas', '2026-11-09'), 9500);
  assert.equal(t.tarifaEn(valores, 'aye', '2026-11-09'), 0);
});

test('Motos Agencia: solo Mi Gusto – Munro; dueños con historial, gerentes de Munro cargan la semana', () => {
  const script = file('public/stock/munro-motos.js');
  const app = file('public/stock/app.js');
  assert.match(script, /const TENANT = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'/);
  assert.match(script, /api\.S\.local === 'munro'/);
  assert.match(script, /rol\(\) === 'gerente' && api\.misLocales\(\)\.includes\('munro'\)/);
  assert.match(script, /const esDueno = \(\) => \['creadora','dueno'\]\.includes\(rol\(\)\)/);
  assert.match(script, /esDueno\(\) \|\| semana === semanaActual\(\)/);
  assert.match(script, /function historialHTML\(\)\{\s*if \(!esDueno\(\)\) return ''/);
  assert.match(script, /function tarifasForm\(\)\{\s*if \(!esDueno\(\) \|\| !api\.canW\(\) \|\| !tarifasAbiertas\) return ''/);
  for (const nombre of ['Lucas', 'Alex', 'Aye']) assert.ok(script.includes("nombre:'" + nombre + "'"));
  assert.doesNotMatch(script, /C\('(productos|conteos|hojas|diario|munro_control)'\)/);
  assert.match(app, /'munro_control', 'agencia_motos'\]/);
  assert.match(app, /\(puedeVerMotos\(\) \? `<button data-go="motos">\$\{ic\('moto'\)\}<span class="nl">Motos Agencia<\/span>/);
  assert.match(app, /<details class="snav-folder"[\s\S]*Administración de local/);
  assert.match(app, /if \(!puedeVerMotos\(\)\) return items;/);
  assert.match(app, /\(v === 'motos' && puedeVerMotos\(\)\)/);
  assert.match(app, /window\.GestLokMunroMotos\?\.subscribe\(loc,push\)/);
});

test('Motos Agencia queda disponible sin conexión y el servidor repite los permisos', () => {
  assert.match(file('components/stock-runtime.tsx'), /load\("\/stock\/munro-motos\.js/);
  for (const sw of ['scripts/sw-template.js', 'public/sw.js']) assert.match(file(sw), /'\/stock\/munro-motos\.js'/);
  assert.match(file('app/layout.tsx'), /import "\.\/munro-motos\.css";/);
  const sql = file('supabase/migrations/20261027000000_gestlok_munro_agencia_motos.sql');
  assert.match(sql, /tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid\s+and col = 'munro\/agencia_motos'/);
  assert.match(sql, /public\.mi_rol\(\) = 'gerente' and public\.puede_editar_local\('munro'\)/);
  assert.match(sql, /id = 'tarifas' and public\.mi_rol\(\) in \('creadora', 'dueno'\)/);
  assert.match(sql, /data->>'semana' = substring\(id from 3 for 10\)/);
  assert.doesNotMatch(sql, /\b(delete from|truncate|update public\.docs)\b/i);
});

test('Motos Agencia: «Modificar» habilita la planilla y «Guardar» envía los cambios; los nombres se editan por tarjeta', () => {
  const script = file('public/stock/munro-motos.js');
  assert.match(script, /\(puede && edicion \? '' : ' disabled'\)/);
  assert.match(script, /data-mo-act="modificar"/);
  assert.match(script, /data-mo-act="guardar"/);
  assert.match(script, /data-mo-act="cancelar"/);
  assert.match(script, /async function cargarCelda\(input\)\{[\s\S]*borrador\.set\(id/);
  assert.match(script, /async function guardarTodo\(\)\{[\s\S]*col\(\)\.doc\(id\)\.set\(data\)/);
  assert.match(script, /id="mo-name-form"/);
  assert.match(script, /col\(\)\.doc\('motos'\)\.set\(data\)/);
  assert.match(script, /beforeunload/);
  const {_t:t} = cargar();
  const valores = {lucas:[{desde:'2026-10-26', nombre:'Lucas P.', etiqueta:'Moto 1'}]};
  assert.equal(t.nombreEn(valores, 'lucas', '2026-10-19'), null);
  assert.equal(t.nombreEn(valores, 'lucas', '2026-11-02').nombre, 'Lucas P.');
  const sql = file('supabase/migrations/20261027010000_gestlok_munro_motos_nombres.sql');
  assert.match(sql, /id = 'motos' or public\.gestlok_motos_semana_abierta\(id\)/);
  assert.match(sql, /id not in \('tarifas', 'motos'\)/);
});
