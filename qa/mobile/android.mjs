// Android real (emulador de Android con Google Chrome): instalar con un toque, modo sin conexión y demo.
// Corre dentro de reactivecircus/android-emulator-runner (ver .github/workflows/celulares.yml).
import { _android as android } from 'playwright-core';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { OUT, PORT, DEMO, sleep, check, finish, server } from './common.mjs';

const shot = async (page, name) => { try { await page.screenshot({ path: resolve(OUT, `android-${name}.png`) }); } catch (e) { console.log('captura', name, e.message); } };
const screen = async (device, name) => { try { await device.screenshot({ path: resolve(OUT, `android-${name}-pantalla.png`) }); } catch (e) { console.log('captura', name, e.message); } };
const INSTALL = /^(Install|Instalar|Add|Agregar|Añadir|Install app|Instalar app)$/i;

const web = server();
await web.start();
execSync(`adb reverse tcp:${PORT} tcp:${PORT}`);
const [device] = await android.devices();
check(!!device, `emulador conectado: ${device?.model()} (${device?.serial()})`);
const chrome = String(await device.shell('dumpsys package com.android.chrome | grep versionName')).trim();
const sdk = String(await device.shell('getprop ro.build.version.release')).trim();
check(/versionName/.test(chrome), `Android ${sdk} · Chrome ${chrome.replace('versionName=', '')}`);
await device.shell('am force-stop com.android.chrome');
await device.shell('pm clear com.android.chrome');
// Sin --bypass… Chrome espera a que la persona use la página un rato antes de ofrecer instalarla.
const ctx = await device.launchBrowser({ args: ['--bypass-app-banner-engagement-checks'] });
const page = ctx.pages()[0] || await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

try {
  // 1) Abre la demo en el celular.
  await page.goto(DEMO, { timeout: 120000 });
  await page.waitForSelector('#hub [data-owner-nav="menu"]', { state: 'visible', timeout: 120000 });
  check(true, 'GestLok abre en Chrome de Android (demo de la dueña)');
  await shot(page, '1-inicio');
  const sw = await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active)).catch(() => false);
  check(sw, 'service worker activo (lo que permite usarla sin conexión)');

  // 2) Chrome avisa que se puede instalar; la app lo guarda apenas abre.
  let ready = await page.waitForFunction(() => !!window.__glInstall?.evt, null, { timeout: 60000 }).then(() => true, () => false);
  if (!ready) { await page.reload(); ready = await page.waitForFunction(() => !!window.__glInstall?.evt, null, { timeout: 60000 }).then(() => true, () => false); }
  check(ready, 'Chrome habilitó la instalación directa (aviso «beforeinstallprompt» guardado)');

  // 3) Menú › «Instalar en el celular»: la ventana del sistema aparece sin pasar por la guía.
  await page.waitForSelector('#hub [data-owner-nav="menu"]', { state: 'visible', timeout: 60000 });
  await sleep(800);
  await page.click('#hub [data-owner-nav="menu"]');
  await page.waitForSelector('#pn [data-owner-install]', { state: 'visible', timeout: 15000 });
  await shot(page, '2-menu');
  await page.click('#pn [data-owner-install]');
  const guide = await page.waitForSelector('#pn [data-gl-install]', { timeout: 2500 }).then(() => true, () => false);
  check(!guide || !ready, 'un toque: no se mostró la guía, se abrió la instalación directa');
  const dialog = await device.wait({ text: INSTALL }, { timeout: 20000 }).then(() => true, () => false);
  if (!dialog) console.log('Android: no se detectó el botón de instalación; revisar captura de la pantalla nativa');
  await screen(device, '3-ventana-instalar');
  check(dialog, 'apareció la ventana de Android «Instalar app» con el botón Instalar');
  if (dialog) {
    await device.tap({ text: INSTALL });
    // Algunos Android piden confirmar el ícono en la pantalla de inicio.
    const confirm = await device.wait({ text: /^(Add automatically|Agregar automáticamente|Add|Agregar)$/i }, { timeout: 8000 }).then(() => true, () => false);
    if (confirm) { await screen(device, '4-confirmar'); await device.tap({ text: /^(Add automatically|Agregar automáticamente|Add|Agregar)$/i }).catch(() => {}); }
    const toast = await page.waitForFunction(() => /Instalando GestLok|instalada/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 30000 }).then(() => true, () => false);
    check(toast, 'GestLok confirma «Instalando GestLok…» después de tocar Instalar');
    const installed = await page.waitForFunction(() => window.__glInstall?.installed === true, null, { timeout: 90000 }).then(() => true, () => false);
    check(installed, 'Android avisó que la app quedó instalada (evento appinstalled)', false);
    await device.shell('input keyevent KEYCODE_HOME');
    await sleep(3000);
    await screen(device, '5-pantalla-de-inicio');
    const icon = await device.wait({ text: 'GestLok' }, { timeout: 15000 }).then(() => true, () => false);
    check(icon, 'el ícono «GestLok» está en la pantalla de inicio', false);
    if (icon) {
      await device.tap({ text: 'GestLok' });
      await sleep(6000);
      await screen(device, '6-app-abierta');
      check(true, 'se abrió GestLok desde el ícono (captura «6-app-abierta»)', false);
    }
    // De vuelta a la pestaña de Chrome donde corre la prueba.
    await device.shell('monkey -p com.android.chrome -c android.intent.category.LAUNCHER 1').catch(() => {});
    await sleep(1500);
  }

  // 4) Sin conexión: la demo sigue funcionando, lo guardado queda pendiente y se envía al volver.
  await page.bringToFront().catch(() => {});
  await page.goto(DEMO, { timeout: 60000 });
  await page.waitForSelector('#hub [data-owner-area-staff]', { state: 'visible', timeout: 60000 });
  await sleep(800);
  await page.click('#hub [data-owner-area-staff]');
  await page.waitForSelector('#gl-demo-emp .gl-dh-table', { state: 'visible', timeout: 30000 });
  check((await page.textContent('#gl-demo-emp')).includes('42:30 hs'), 'Horarios de la demo: planilla ficticia con los totales del Excel');
  await ctx.setOffline(true);
  await page.selectOption('[data-dh-p="3"][data-dh-d="4"][data-dh-k="4"]', '').catch(async () => {
    await page.evaluate(() => { const s = document.querySelector('[data-dh-p="3"][data-dh-d="4"][data-dh-k="4"]'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
  });
  const pend = await page.waitForSelector('#gl-offline-sync', { state: 'visible', timeout: 15000 }).then(() => true, () => false);
  await shot(page, '7-sin-conexion-pendiente');
  check(pend && /guardado/i.test(await page.textContent('#gl-offline-sync')), 'sin conexión: el cambio queda guardado en el celular («Se envían solos»)');
  await ctx.setOffline(false);
  const sent = await page.waitForFunction(() => /enviado/i.test(document.querySelector('#gl-offline-sync')?.textContent || '') || window.GestLokOffline?.pending?.() === 0, null, { timeout: 30000 }).then(() => true, () => false);
  check(sent, 'al volver internet se envía solo');
  await shot(page, '8-enviado');

  // 5) Reabrir sin conexión: la app sale del service worker.
  await ctx.setOffline(true);
  web.stop();
  await page.goto(DEMO, { timeout: 60000 }).catch(() => {});
  const offlineOpen = await page.waitForSelector('#hub [data-owner-nav="menu"]', { state: 'visible', timeout: 60000 }).then(() => true, () => false);
  await shot(page, '9-abre-sin-conexion');
  check(offlineOpen, 'sin internet (servidor apagado): GestLok vuelve a abrir desde el celular');
  check(!errors.length, `sin errores de la página${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} catch (e) {
  check(false, `error inesperado: ${e.message}`);
  await shot(page, 'error');
  await screen(device, 'error');
} finally {
  await ctx.close().catch(() => {});
  web.stop();
  device?.close();
}
process.exit(finish('android') ? 1 : 0);
