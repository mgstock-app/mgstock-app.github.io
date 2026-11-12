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

test('Motos Agencia: solo Mi Gusto – Munro; dueños con importes, gerentes de Munro corrigen también el historial', () => {
  const script = file('public/stock/munro-motos.js');
  const app = file('public/stock/app.js');
  assert.match(script, /const TENANT = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'/);
  assert.match(script, /api\.S\.local === 'munro'/);
  assert.match(script, /rol\(\) === 'gerente' && api\.misLocales\(\)\.includes\('munro'\)/);
  assert.match(script, /const esDueno = \(\) => \['creadora','dueno'\]\.includes\(rol\(\)\)/);
  assert.match(script, /const editable = semana => permitido\(\) && api\.canW\(\) && semana <= semanaActual\(\)/);
  assert.match(script, /podés corregir horarios con «Modificar»/);
  assert.match(script, /function historialHTML\(\)\{\s*if \(!permitido\(\)\) return '';\s*const dueno = esDueno\(\);/);
  assert.match(script, /\(dueno \? '<th>Total pago<\/th>' : ''\)/);
  assert.match(script, /\(dueno && api\.canW\(\) \? '<button class="mo-pill" data-mo-act="tarifas"/);
  assert.match(script, /function tarifasForm\(\)\{\s*if \(!esDueno\(\) \|\| !api\.canW\(\) \|\| !tarifasAbiertas\) return ''/);
  for (const nombre of ['Lucas', 'Alex', 'Aye']) assert.ok(script.includes("nombre:'" + nombre + "'"));
  assert.doesNotMatch(script, /C\('(productos|conteos|hojas|diario|munro_control)'\)/);
  assert.match(app, /'munro_control', 'agencia_motos'\]/);
  assert.match(app, /\(puedeVerMotos\(\) \? `<button data-go="motos">\$\{ic\('moto'\)\}<span class="nl">Motos Agencia<\/span>/);
  assert.match(app, /<details class="snav-folder"[\s\S]*Administración de local/);
  assert.match(app, /if \(!puedeVerMotos\(\) && !puedeVerResenas\(\) && !puedeVerPagosOnline\(\) && !puedeVerReclamos\(\)\) return items;/);
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

test('Motos Agencia: los gerentes de Munro leen el historial pero no el valor por hora', () => {
  const sql = file('supabase/migrations/20261102160000_gestlok_munro_motos_historial_gerentes.sql');
  assert.match(sql, /alter policy gestlok_munro_motos_gerente_read on public\.docs/);
  assert.match(sql, /public\.mi_rol\(\) not in \('creadora', 'dueno'\)\s+then id <> 'tarifas'/);
  assert.doesNotMatch(sql, /\b(drop |delete from|truncate|update public\.docs)/i);
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

test('Motos Agencia: migración permite corregir semanas cerradas sin abrir tarifas ni futuras', () => {
  const sql = file('supabase/migrations/20261111020000_munro_motos_gerente_edita_historial.sql');
  const script = file('public/stock/munro-motos.js');
  assert.match(sql, /alter policy gestlok_munro_motos_write_insert on public\.docs/);
  assert.match(sql, /alter policy gestlok_munro_motos_write_update on public\.docs/);
  assert.match(sql, /alter policy gestlok_munro_motos_write_delete on public\.docs/);
  assert.match(sql, /public\.mi_rol\(\) = 'gerente' and public\.puede_editar_local\('munro'\)/);
  assert.match(sql, /id = 'tarifas' and public\.mi_rol\(\) in \('creadora','dueno'\)/);
  assert.match(sql, /substring\(id from 3 for 10\) <= to_char/);
  assert.match(script, /podés corregir semanas anteriores/);
  assert.match(script, /editable\(s\) \? 'Ver y editar' : 'Ver detalle'/);
  assert.doesNotMatch(sql, /\b(delete from|truncate|update public\.docs)\b/i);
});

test('Agencia Motos: valida las 24 h, detecta el error de la foto y no suma jornadas inválidas', () => {
  const {_t:t} = cargar();
  const superpuestos = t.validarDia({tm_e:'11:30',tm_s:'15:00',tt_e:'11:30',tt_s:'23:00'});
  assert.equal(superpuestos.minutos, 0);
  assert.ok(superpuestos.errores.some(e => e.includes('se superponen')));
  assert.ok(superpuestos.campos.includes('tt_e'));
  assert.ok(superpuestos.campos.includes('tm_s'));
  assert.equal(t.minutosDia({tm_e:'11:30',tm_s:'15:00',tt_e:'11:30',tt_s:'23:00'}), 0);

  const correcto = t.validarDia({tm_e:'11:30',tm_s:'15:00',tt_e:'19:00',tt_s:'23:00'});
  assert.equal(correcto.errores.length, 0);
  assert.equal(correcto.minutos, 450);

  const incompleto = t.validarDia({tm_e:'11:30'});
  assert.equal(incompleto.minutos, 0);
  assert.ok(incompleto.campos.includes('tm_s'));

  const iguales = t.validarDia({tt_e:'19:00',tt_s:'19:00'});
  assert.ok(iguales.errores.some(e => e.includes('iguales')));

  const fueraDe24 = t.validarDia({tm_e:'07:00',tm_s:'19:00',tt_e:'20:00',tt_s:'10:00'});
  assert.ok(fueraDe24.errores.some(e => e.includes('24 horas')));

  // Caso real denunciado: el primer campo es entrada mañana y el segundo salida mañana.
  // 19:00 -> 15:00 no representa 20 horas trabajadas: es un horario incorrecto.
  const mananaInvertida = t.validarDia({tm_e:'19:00',tm_s:'15:00'});
  assert.equal(mananaInvertida.minutos, 0);
  assert.ok(mananaInvertida.errores.some(e => e.includes('salida del turno mañana')));
  assert.ok(mananaInvertida.campos.includes('tm_e'));
  assert.ok(mananaInvertida.campos.includes('tm_s'));
  assert.equal(t.minutosDia({tm_e:'19:00',tm_s:'15:00'}), 0);

  // Tampoco aceptar 20 horas si esa misma combinación se carga en turno tarde.
  const tardeImposible = t.validarDia({tt_e:'19:00',tt_s:'15:00'});
  assert.equal(tardeImposible.minutos, 0);
  assert.ok(tardeImposible.errores.some(e => e.includes('supera 16 horas')));
  assert.ok(tardeImposible.campos.includes('tt_s'));

  // Se conserva el turno tarde nocturno y el orden válido mañana -> tarde.
  const jornadaCorrecta = t.validarDia({tm_e:'09:00',tm_s:'15:00',tt_e:'19:00',tt_s:'00:00'});
  assert.equal(jornadaCorrecta.errores.length, 0);
  assert.equal(jornadaCorrecta.minutos, 660);

  const noche = t.validarDia({tt_e:'19:33',tt_s:'00:00'});
  assert.equal(noche.errores.length, 0);
  assert.equal(noche.minutos, 267);
  assert.equal(t.validarDia({}).errores.length, 0);
  assert.ok(t.validarDia({tm_e:'25:00',tm_s:'19:00'}).errores.length > 0);
});

test('Agencia Motos: campos incorrectos y total en rojo, sin bloquear otros locales', () => {
  const js = file('public/stock/munro-motos.js');
  const css = file('app/munro-motos.css');
  assert.match(js, /function validarDia\(c\)/);
  assert.match(js, /const validacion = validarDia\(data\)/);
  assert.match(js, /mo-time-error/);
  assert.match(js, /mo-error-summary/);
  assert.match(js, /aria-invalid="true"/);
  assert.match(js, /lang="es-AR"/);
  assert.match(css, /\.mo-time\.mo-time-error:disabled/);
  assert.match(css, /\.mo-error-summary\[hidden\]/);
  assert.match(js, /api\.S\.local === 'munro'/);
});
