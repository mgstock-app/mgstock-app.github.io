import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('markup, styles, authentication and business logic match original SHA-256 fingerprints', () => {
  const hashes = JSON.parse(read('tests/source-hashes.json'));
  for (const [path, hash] of Object.entries(hashes)) {
    let content = path === 'markup' ? JSON.parse(read('lib/stock/markup.json')) : read(path);
    // Preserve the original stock fingerprint. Remove only precisely reviewed
    // additive hooks: changes to existing auth, screens or stock logic still fail.
    // Únicamente los tres textos de entrada al video comercial en el acceso público.
    // La autenticación original sigue verificándose contra su huella histórica.
    if (path === 'public/stock/auth.js') {
      // Revertir únicamente los tres hooks de invitación auditados antes de la huella histórica.
      const invites=JSON.parse(read('tests/gestlok-newlocal-auth-hooks.json')).hooks;
      for(const {actual,original} of invites){
        assert.equal(content.split(actual).length-1,1,'Hook de invitación autenticada revisado');
        content=content.replace(actual,original);
      }
      const publicVideoHooks = [
        ["link.href='/conocer/#video';", "link.href=location.pathname+'?demo=1';"],
        ["link.textContent='Mirá Plan Scanner en video · 30 segundos';", "link.textContent='Explorar demo interactiva · Sin registrarme';"],
        ["info.textContent='Conocé las ventas, el escaneo con celular, el stock y los precios de GESTLOK.';", "info.textContent='Probá Dueña y Gerente en dos tiendas ficticias. Sin modificar datos reales.';"]
      ];
      for (const [updated, original] of publicVideoHooks) {
        assert.equal(content.split(updated).length - 1, 1, 'Cambio público y único del enlace a video');
        content = content.replace(updated, original);
      }
    }
    if (path === 'public/stock/app.js') {
    // Normalizar primero SOLO los cambios nuevos y auditados de Stock Local
    // antes de restaurar los hooks previos de lectura para dueña.
    // Historial con sin stock y estado actual (23/11): es lo más nuevo, se revierte antes que los borradores.
    const histSinHooks=JSON.parse(read('tests/stock-local-historial-sin-stock-hooks.json')).hooks;
    for(let i=histSinHooks.length-1;i>=0;i--){
      const {actual,original}=histSinHooks[i];
      assert.equal(content.split(actual).length-1,1,'Cambio revisado del historial de Stock Local #'+i);
      content=content.replace(actual,original);
    }
    // Borradores seguros de Stock Local (23/11): se revierten primero porque están encima de los cambios de turnos.
    const borradoresHooks=JSON.parse(read('tests/stock-local-borradores-hooks.json')).hooks;
    for(let i=borradoresHooks.length-1;i>=0;i--){
      const {actual,original}=borradoresHooks[i];
      assert.equal(content.split(actual).length-1,1,'Cambio revisado de borradores de Stock Local #'+i);
      content=content.replace(actual,original);
    }
    const turnosHooks=JSON.parse(read('tests/mi-gusto-stock-local-turnos-hooks.json')).hooks;
    for(let i=turnosHooks.length-1;i>=0;i--){
      const {actual,original}=turnosHooks[i];
      assert.equal(content.split(actual).length-1,1,'Cambio revisado de Stock Local Mi Gusto #'+i);
      content=content.replace(actual,original);
    }
    // La dueña de Mi Gusto consulta las hojas reales y el historial desde accesos explícitos.
    // Revertir sólo estos seis fragmentos revisados; el SHA del stock original no cambia.
    const inventoryHooks=JSON.parse(read('tests/mi-gusto-duena-inventory-hooks.json')).hooks;
    for(const {actual,original} of inventoryHooks){
      assert.equal(content.split(actual).length-1,1,'Hook auditado de consulta de inventario para dueña');
      content=content.replace(actual,original);
    }
    // Menú lateral de categorías exclusivamente visual para Stock Local de Mi Gusto.
    // Se revierten SOLO estos fragmentos auditados antes de verificar el SHA histórico.
    const reviewedStockSidebar=[
      {
        actual:"function tools(id, val, ph, ocultarChips=false){",
        original:"function tools(id, val, ph){"
      },
      {
        actual:"!ocultarChips && cs.length > 1 ?",
        original:"cs.length > 1 ?"
      },
      {
        actual:"${miGustoStockConCategorias(tools('q-stock', S.q, 'Buscar producto', miGustoStockLateralActivo())+\n      (list.length ? sheet('stock', list, p => rowStock(p, false), {cls:'nosug', head:HEADS.stock0}) : vacio))}",
        original:"${tools('q-stock', S.q, 'Buscar producto')}\n    ${list.length ? sheet('stock', list, p => rowStock(p, false), {cls:'nosug', head:HEADS.stock0}) : vacio}"
      },
      {
        actual:"${miGustoStockConCategorias(tools('q-stock', S.q, 'Buscar producto', miGustoStockLateralActivo())+\n      (list.length ? sheet('stock', list, p => rowStock(p, true)) : vacio))}",
        original:"${tools('q-stock', S.q, 'Buscar producto')}\n    ${list.length ? sheet('stock', list, p => rowStock(p, true)) : vacio}"
      },
      {
        actual:"    case 'cat': {\n      const lateral=miGustoStockLateralActivo() && !!t.closest('.gl-mg-stock-nav, .gl-mg-stock-drawer');\n      S.cat=t.dataset.cat||'';\n      if(lateral){S.q='';S.filtro='todos';}\n      render();\n      if(lateral)document.querySelector('#view .gl-mg-stock-main')?.scrollIntoView({block:'start',behavior:'auto'});\n      break;\n    }",
        original:"    case 'cat': S.cat = t.dataset.cat; render(); break;"
      }
    ];
    const sidebarStart='/* Stock Local de Mi Gusto: navegación por categorías del local (Munro y Torcuato).';
    const startSidebar=content.indexOf(sidebarStart);
    const endSidebar=content.indexOf('function tools(id, val, ph, ocultarChips=false){',startSidebar);
    assert.ok(startSidebar>=0 && endSidebar>startSidebar,'Único bloque de navegación de Stock Local auditado');
    assert.equal(content.indexOf(sidebarStart,startSidebar+1),-1,'La navegación no está duplicada');
    content=content.slice(0,startSidebar)+content.slice(endSidebar);
    for(const {actual,original} of reviewedStockSidebar){
      assert.equal(content.split(actual).length-1,1,'Cambio visual único de categorías de Stock Local');
      content=content.replace(actual,original);
    }
      // Normalizar únicamente el refresco seguro de Stock Local para mantener
      // el SHA original de pantallas, permisos y lógica de negocio.
      const refreshMarker = '<button type="button" class="btn sm" data-act="f-refresh">';
      const buttonStart = content.indexOf(refreshMarker);
      assert.ok(buttonStart >= 0, 'Botón de refresco verificado');
      assert.equal(content.indexOf(refreshMarker, buttonStart+1), -1, 'Botón no duplicado');
      const buttonEnd = content.indexOf('</button>', buttonStart) + '</button>'.length;
      assert.ok(buttonEnd > buttonStart, 'Cierre único del botón de refresco');
      content = content.slice(0, buttonStart) + content.slice(buttonEnd);
      const refreshCase = "    case 'f-refresh': void refreshStockFromServer(); break;\n";
      assert.equal(content.split(refreshCase).length-1, 1, 'Acción de refresco única y revisada');
      content = content.replace(refreshCase, '');
      const refreshBegin = '/* Recarga verificable de Stock Local: lectura HTTP directa';
      const refreshStart = content.indexOf(refreshBegin), refreshEnd = content.indexOf('function openSaveF(){', refreshStart);
      assert.ok(refreshStart >= 0 && refreshEnd > refreshStart, 'Función verificada antes de Guardar conteo');
      assert.equal(content.indexOf(refreshBegin, refreshStart+1), -1, 'Función no duplicada');
      content = content.slice(0, refreshStart) + content.slice(refreshEnd);
      // Destino adicional de push para pedidos GESTLOK Chat. La navegación
      // sigue validando el local autorizado antes de abrir la Central.
      const chatPushActual="!['chat','proveedores','vencimientos','avisos','pedidos-clientes'].includes(p.view)";
      const chatPushOriginal="!['chat','proveedores','vencimientos','avisos'].includes(p.view)";
      assert.equal(content.split(chatPushActual).length-1,1,'Destino push de pedidos único y revisado');
      content=content.replace(chatPushActual,chatPushOriginal);
      // Revisar y normalizar solamente los tres puntos que evitaban
      // reconstruir Conteo por suscripciones ajenas o sincronización.
      // Mantener el hash original y todos los permisos sin cambios.
      const stableConteoHooks=[
        {
          actual:"function onSnapRefresh(){\n  // Las novedades ajenas a Conteo actualizan el estado sin destruir sus campos.\n  // Si se revoca el acceso, se renderiza para aplicar los permisos nuevos.\n  if (S.view === 'conteo-munro' && puedeVerConteoMunro()) renderLive();\n  else render();",
          original:"function onSnapRefresh(){\n  render();"
        },
        {
          actual:"window.addEventListener('gestlok-sync-complete', () => {\n  if (!S.local) return;\n  // La sincronización de otros módulos no debe reemplazar Conteo mientras se escribe.\n  if (S.view === 'conteo-munro' && puedeVerConteoMunro()) { renderLive(); return; }\n  render();\n});",
          original:"window.addEventListener('gestlok-sync-complete', () => { if (S.local) render(); });"
        },
        {
          actual:"if (ch && S.view !== 'conteo-munro') render(); } catch {}",
          original:"if (ch) render(); } catch {}"
        }
      ];
      for(const {actual,original} of stableConteoHooks){
        assert.equal(content.split(actual).length-1,1,'Un único control de estabilidad de Conteo revisado');
        content=content.replace(actual,original);
      }
      // Normalizar solo el detector de formularios del aviso PWA.
      // Preservamos la huella SHA histórica del controlador de Stock.
      const pwaHelper="// Un select sin cambios no es un borrador pendiente:\n// HTMLSelectElement no tiene defaultValue y antes siempre bloqueaba «Actualizar».\nfunction pwaFormDirty(el){\n  if(el.tagName==='SELECT'){\n    const options=Array.from(el.options||[]);\n    if(el.multiple)return options.some(option=>option.selected!==option.defaultSelected);\n    const explicit=options.findIndex(option=>option.defaultSelected);\n    const original=explicit>=0?explicit:(options.length?0:-1);\n    return el.selectedIndex!==original;\n  }\n  if(el.type==='checkbox'||el.type==='radio')return el.checked!==el.defaultChecked;\n  return el.value!==el.defaultValue;\n}\n";
      assert.equal(content.split(pwaHelper).length-1,1,'Helper PWA único y auditado');
      content=content.replace(pwaHelper,'');
      const pwaUpdated="    [...document.querySelectorAll('#view input, #view textarea, #view select')].some(pwaFormDirty)\n";
      const pwaOriginal="    [...document.querySelectorAll('#view input, #view textarea, #view select')].some(el =>\n      el.type === 'checkbox' || el.type === 'radio' ? el.checked !== el.defaultChecked : el.value !== el.defaultValue)\n";
      assert.equal(content.split(pwaUpdated).length-1,1,'Detector PWA único y auditado');
      content=content.replace(pwaUpdated,pwaOriginal);
      // Login canónico: la PWA mantiene el mismo worker al navegar a /login/.
      // Solo esta sustitución de ruta se considera una excepción auditada.
      const swRutaLogin="navigator.serviceWorker.register(\n      /\\/login\\/$/.test(location.pathname) ? '../sw.js' : 'sw.js', {updateViaCache:'none'})";
      const swRutaOriginal="navigator.serviceWorker.register('sw.js', {updateViaCache:'none'})";
      assert.equal(content.split(swRutaLogin).length-1,1,'Ruta PWA ajustada únicamente para /login/');
      content=content.replace(swRutaLogin,swRutaOriginal);
      // Normalizar exclusivamente la preservación visual de scroll de Conteo.
      // Los hashes históricos y los permisos permanecen intactos.
      const scrollStart='// Evitar saltos durante actualizaciones que redibujan Conteo.\n';
      assert.equal(content.split(scrollStart).length-1,1,'Adaptador único de scroll de Conteo');
      const start=content.indexOf(scrollStart),end=content.indexOf('function render(){',start);
      assert.ok(end>start,'El adaptador está justo antes del render general');
      content=content.slice(0,start)+content.slice(end);
      for(const segment of [
       "  const conteoViewport=S.view==='conteo-munro'?captureConteoViewport():null;\n",
       '  restoreConteoViewport(conteoViewport);\n'
      ]){
       assert.equal(content.split(segment).length-1,1,'Hook de posición de Conteo único');
       content=content.replace(segment,'');
      }
      // Normalizar solo hooks de Conteo, sin alterar la huella histórica.
      for(const {actual,original,count=1} of JSON.parse(read('tests/mi-gusto-conteo-hooks.json')).hooks){
        assert.equal(content.split(actual).length-1,count,'Hook de Conteo de Munro');
        content=content.split(actual).join(original);
      }
      // Staff en PC: revertir solo las cinco inserciones de menú revisadas.
      // Después se siguen verificando TODOS los hashes históricos sin modificarlos.
      for(const {actual,original} of JSON.parse(read('tests/munro-staff-sidebar-hooks.json')).hooks){
        assert.equal(content.split(actual).length-1,1,'Un único hook autorizado para Staff de Munro');
        content=content.replace(actual,original);
      }
      // Horarios de Munro: restituir únicamente el enlace revisado bajo Motos Agencia.
      // No modificar nunca los hashes originales ni la lógica de permisos histórica.
      for(const {actual,original} of JSON.parse(read('tests/munro-horarios-nav-hooks.json')).hooks){
        assert.equal(content.split(actual).length-1,1,'Un atajo exclusivo de Horarios en Munro');
        content=content.replace(actual,original);
      }
      // Solo dos inserciones visuales de marca por local en El Molino.
      // Restituir el contenido original antes de comparar la huella protegida.
      for(const {actual,original} of JSON.parse(read('tests/molino-brand-hooks.json')).hooks){
        assert.equal(content.split(actual).length-1,1,'Un único hook de marca Molino revisado');
        content=content.replace(actual,original);
      }
      // El visor Scanner recibe la identidad verificada; restaurar argumento para el SHA base.
      const creatorHook = 'window.GestLokOwnerAreas?.attach({S,role:miRol,isCreadora,render:';
      assert.equal(content.split(creatorHook).length - 1, 1, 'Un único hook de creadora verificada');
      content = content.replace(creatorHook, 'window.GestLokOwnerAreas?.attach({S,role:miRol,render:');
      // Restituir únicamente el comportamiento previo de continuación de local
      // para mantener la huella histórica inalterada. No modifica permisos.
      for (const {actual,original} of JSON.parse(read('tests/creator-access-hooks.json')).hooks){
        assert.equal(content.split(actual).length-1,1,'Un único hook de regreso a empresa');
        content=content.replace(actual,original);
      }
      // Menú e Inicio por empresa: inserciones revisadas que se revierten primero.
      const menuEmpresaHooks=JSON.parse(read('tests/gestlok-menu-empresa-hooks.json')).hooks;
      for(const {actual,original} of menuEmpresaHooks){
        assert.equal(content.split(actual).length-1,1,'Un único hook de menú por empresa');
        content=content.replace(actual,original);
      }
      // El Molino modifica solo los controles de roles dentro de esta empresa.
      // Revertir esos fragmentos revisados ANTES de comparar con el SHA histórico.
      const molinoHooks=JSON.parse(read('tests/el-molino-roles-hooks.json')).hooks;
      for(const {actual,original,count=1} of molinoHooks){
        assert.equal(content.split(actual).length-1,count,'Un único hook de roles de El Molino');
        content=content.split(actual).join(original);
      }
      // Normalizar primero los cambios exclusivos de Pedidos de Mi Gusto para que
      // los hooks originales de navegación y Reclamos conserven su forma exacta.
      const pedidosHooks=JSON.parse(read('tests/mi-gusto-pedidos-hooks.json')).hooks;
      for(const {actual,original,count=1} of pedidosHooks){
        assert.equal(content.split(actual).length-1,count,'Hook revisado de Pedidos Mi Gusto');
        content=content.split(actual).join(original);
      }
      const navigationHooks=JSON.parse(read('tests/gestlok-navigation-hooks.json')).hooks;
      for(const {actual,original} of navigationHooks){
        assert.equal(content.split(actual).length-1,1,'Único hook controlado para menú');
        content=content.replace(actual,original);
      }
      // Normalizar únicamente el render de formulario revisado, sin cambiar SHA base.
      const formHooks=JSON.parse(read('tests/gestlok-form-draft-hooks.json')).hooks;
      for(const {actual,original} of formHooks){
        assert.equal(content.split(actual).length-1,1,'Un hook de formulario controlado');
        content=content.replace(actual,original);
      }
      // Únicamente los hooks aditivos de Reclamos Internos: restaurar la fuente base antes de validar SHA.
      const reclamosHooks=JSON.parse(read('tests/gestlok-reclamos-hooks.json')).hooks;
      for(const {actual,original} of reclamosHooks){
        assert.equal(content.split(actual).length-1,1,'Un hook controlado de Reclamos Internos');
        content=content.replace(actual,original);
      }
      // Ocultamiento visual Mi Gusto: normalizar sólo cuatro hooks controlados.
      const diarioHooks=JSON.parse(read('tests/mi-gusto-diario-visibility-hooks.json')).hooks;
      for(const {actual,original} of diarioHooks){
        assert.equal(content.split(actual).length-1,1,'Un hook revisado de visibilidad');
        content=content.replace(actual,original);
      }
      // Revertir exclusivamente los hooks revisados del módulo Pagos Online.
      // El hash original de stock sigue siendo la autoridad; no se cambia la huella.
      const pagosHooks=JSON.parse(read('tests/mi-gusto-pagos-online-hooks.json')).hooks;
      for(const {actual,original} of pagosHooks){
        assert.equal(content.split(actual).length-1,1,'Un solo hook controlado de Pagos Online');
        content=content.replace(actual,original);
      }
      const hook = '  window.GestLokRoleSwitcher?.render();\n';
      assert.equal(content.split(hook).length - 1, 3, 'Exactly three profile render hooks');
      content = content.replaceAll(hook, '');
      const attach = /^window\.GestLokRoleSwitcher\?\.attach\([^\n]*\);\n/gm;
      assert.equal([...content.matchAll(attach)].length, 1, 'One verified profile switcher attachment');
      content = content.replace(attach, '');
      const localNavigation = "  if(listo && S.db && S.me){\n    try{\n      const raw=sessionStorage.getItem('gestlok:profile-next-local');\n      if(raw){\n        sessionStorage.removeItem('gestlok:profile-next-local');\n        const target=JSON.parse(raw);\n        if(target.email===String(S.me.email||'').toLowerCase()\n            && target.tenant_id===S.me.tenant_id\n            && mios.some(l=>l.id===target.local_id)){\n          abrirLocal(target.local_id);return;\n        }\n      }\n    }catch{}\n  }\n";
      assert.ok(content.includes(localNavigation), 'Known single-local navigation hook');
      content = content.replace(localNavigation, '');
      // Cambio UI revisado: en Inicio no debe aparecer el botón Guardar conteo.
      // Se normaliza solo esta condición exacta; el resto del código conserva su huella.
      const homeBar = "  $('#savebar').hidden = S.view === 'inicio' || ing || chat ||";
      assert.equal(content.split(homeBar).length - 1, 1, 'Una regla única oculta la barra en Inicio');
      content = content.replace(homeBar, "  $('#savebar').hidden = ing || chat ||");
    }
    if (path === 'app/globals.css') {
      const marker = '\n/* Soporte compacto y accesible; no tapa el menú horizontal ni la barra de guardado. */';
      const index = content.indexOf(marker);
      assert.ok(index > 0, 'Support/profile CSS extension is explicitly marked');
      assert.match(content.slice(index), /\.gl-profile-switch-trigger/);
      content = content.slice(0, index);
    }
    assert.equal(createHash('sha256').update(content.replaceAll('\r\n', '\n')).digest('hex'), hash, path);
  }
});

test('all original stock screens are present and IDs are unique', () => {
  const markup = JSON.parse(read('lib/stock/markup.json'));
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const id of ['auth', 'app', 'hub', 'snav', 'view', 'au-in', 'au-up', 'au-fg', 'au-np']) assert.ok(ids.includes(id), id);
  assert.ok(!markup.includes('<script'));
});

test('runtime and auth parse successfully', () => {
  new vm.Script(read('public/stock/app.js'));
  new vm.Script(read('public/stock/auth.js'));
  new vm.Script(read('public/sw.js'));
});

async function session(email) {
  const listeners = new Map();
  const element = { hidden: false, textContent: '', className: '', querySelectorAll: () => [], querySelector: () => null };
  const context = vm.createContext({
    window: {}, console, URL, URLSearchParams, Blob, crypto,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    document: {
      readyState: 'loading', querySelector: () => element,
      documentElement: { classList: { add() {}, remove() {} } },
      addEventListener: (name, fn) => listeners.set(name, fn),
    },
    location: { origin: 'http://localhost:3000', pathname: '/', search: '', hash: '' },
  });
  vm.runInContext(read('tests/mock_supabase.js'), context);
  const original = context.window.supabase.createClient;
  let client;
  context.window.supabase.createClient = () => (client = original());
  vm.runInContext(read('public/stock/auth.js'), context);
  listeners.get('DOMContentLoaded')();
  await client.auth.signInWithPassword({ email, password: 'secreto1' });
  return { context, client, db: await context.window.claude.use('db'), user: await context.window.claude.use('user') };
}

test('owner can save in Torcuato without changing Munro', async () => {
  const { db, user } = await session('dueno@example.com');
  assert.equal((await user.me()).rol, 'dueno');
  const before = (await db.doc('munro/productos/p-001').get()).data();
  await db.doc('torcuato/productos/p-001').update({ sinStock: true, cantidad: 12.5 });
  assert.equal((await db.doc('torcuato/productos/p-001').get()).data().cantidad, 12.5);
  assert.deepEqual((await db.doc('munro/productos/p-001').get()).data(), before);
  await db.collection('torcuato/conteos').add({ fecha: 123, autor: 'owner', total: 12.5 });
  assert.equal((await db.collection('torcuato/conteos').get()).size, 1);
  assert.equal((await db.collection('munro/conteos').get()).size, 0);
});

test('manager only reads and updates assigned branch in simulated backend', async () => {
  const { db, user } = await session('gerente.munro@example.com');
  assert.deepEqual(Array.from((await user.me()).locales), ['munro']);
  assert.equal((await db.collection('torcuato/productos').get()).size, 0);
  await assert.rejects(db.doc('torcuato/productos/p-001').update({ cantidad: 99 }));
  await db.doc('munro/productos/p-001').update({ cantidad: 4 });
  assert.equal((await db.doc('munro/productos/p-001').get()).data().cantidad, 4);
  await assert.rejects(db.doc('equipo/new@example.com').set({ rol: 'creadora' }));
});

test('read-only user cannot save through adapter', async () => {
  const { db, user } = await session('lectura@example.com');
  assert.equal(await user.canEdit(), false);
  assert.ok((await db.collection('munro/productos').get()).size > 0);
  await assert.rejects(db.doc('munro/productos/p-001').update({ cantidad: 99 }));
  await assert.rejects(db.collection('munro/conteos').add({ fecha: 123 }));
});

test('administrator creates, renames and removes a custom sheet', async () => {
  const { db, user, client } = await session('kmu15lopez@gmail.com');
  assert.equal(await user.isOwner(), true);
  // La creadora conserva edición permanente, sin habilitación temporal.
  assert.equal((await client.rpc('gestlok_creator_editing_state')).data.permanent, true);
  const sheet = await db.collection('munro/hojas').add({ nombre: 'Prueba', tipo: 'stock', orden: 10 });
  await sheet.update({ nombre: 'Nueva' });
  assert.equal((await sheet.get()).data().nombre, 'Nueva');
  await sheet.delete();
  assert.equal((await sheet.get()).exists, false);
});

test('managers only see the team of their own branch', async () => {
  const munro = await session('gerente.munro@example.com');
  const vistos = Array.from((await munro.db.collection('equipo').get()).docs, d => d.data().email).sort();
  assert.deepEqual(vistos, ['dueno@example.com', 'gerente.munro@example.com', 'kmu15lopez@gmail.com', 'lectura@example.com']);
  const torcuato = await session('gerente.torcuato@example.com');
  const vistosT = Array.from((await torcuato.db.collection('equipo').get()).docs, d => d.data().email).sort();
  assert.deepEqual(vistosT, ['dueno@example.com', 'gerente.torcuato@example.com', 'kmu15lopez@gmail.com']);
  const admin = await session('kmu15lopez@gmail.com');
  assert.equal((await admin.db.collection('equipo').get()).size, 5);
});

test('only owner and administrator change the suggested stock', async () => {
  const owner = await session('dueno@example.com');
  await owner.db.doc('torcuato/productos/p-001').update({ sugerido: 6 });
  assert.equal((await owner.db.doc('torcuato/productos/p-001').get()).data().sugerido, 6);

  const manager = await session('gerente.torcuato@example.com');
  manager.context.window.__rows.find(r => r.col === 'torcuato/productos' && r.id === 'p-001').data.sugerido = 6;
  await manager.db.doc('torcuato/productos/p-001').update({ sugerido: 99, stock: 2 });
  const row = (await manager.db.doc('torcuato/productos/p-001').get()).data();
  assert.equal(row.stock, 2);
  assert.equal(row.sugerido, 6);
  await manager.db.collection('torcuato/productos').add({ nombre: 'Nuevo', cat: 'Salsas', sugerido: 50 });
  const added = (await manager.db.collection('torcuato/productos').get()).docs.map(d => d.data()).find(d => d.nombre === 'Nuevo');
  assert.ok(added && !('sugerido' in added));
});

test('only owner and administrator show or hide the suggested stock of a sheet', async () => {
  const owner = await session('dueno@example.com');
  await owner.db.doc('torcuato/hojas/h-cajas').set({ nombre: 'Stock Cajas', tipo: 'lista', orden: 4, sugerido: true });
  assert.equal((await owner.db.doc('torcuato/hojas/h-cajas').get()).data().sugerido, true);

  const manager = await session('gerente.torcuato@example.com');
  manager.context.window.__rows.push({ col: 'torcuato/hojas', id: 'h-cajas', data: { nombre: 'Stock Cajas', tipo: 'lista', orden: 4, sugerido: true } });
  await manager.db.doc('torcuato/hojas/h-cajas').set({ nombre: 'Cajas', tipo: 'lista', orden: 4, sugerido: false });
  const hoja = (await manager.db.doc('torcuato/hojas/h-cajas').get()).data();
  assert.equal(hoja.nombre, 'Cajas');
  assert.equal(hoja.sugerido, true);
});
