// iPhone real (simulador de iOS con Safari, en español): guía de instalación, agregar a la pantalla de
// inicio siguiendo esa guía, y abrir sin conexión. Usa Appium (XCUITest). Ver .github/workflows/celulares.yml.
import { remote } from 'webdriverio';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUT, DEMO, sleep, check, finish, server } from './common.mjs';

const { SIM_UDID, SIM_NAME, SIM_VERSION } = process.env;
const web = server();
await web.start();
const driver = await remote({
  hostname: '127.0.0.1', port: 4723, path: '/', logLevel: 'warn', connectionRetryTimeout: 900000, connectionRetryCount: 1,
  capabilities: {
    platformName: 'iOS', browserName: 'Safari',
    'appium:automationName': 'XCUITest', 'appium:udid': SIM_UDID, 'appium:deviceName': SIM_NAME, 'appium:platformVersion': SIM_VERSION,
    'appium:language': 'es-419', 'appium:locale': 'es_AR',
    'appium:newCommandTimeout': 900, 'appium:wdaLaunchTimeout': 900000, 'appium:wdaConnectionTimeout': 900000,
    'appium:simulatorStartupTimeout': 900000, 'appium:webviewConnectTimeout': 120000, 'appium:safariInitialUrl': DEMO,
  },
});
const shot = async name => { try { await driver.saveScreenshot(resolve(OUT, `ios-${name}.png`)); } catch (e) { console.log('captura', name, e.message); } };
const source = async name => { try { const s = await driver.getPageSource(); writeFileSync(resolve(OUT, `ios-${name}.xml`), s); return s; } catch { return ''; } };
const labels = src => [...src.matchAll(/<XCUIElementType(Button|Cell|Switch|StaticText)[^>]*?(?:name="([^"]*)")?[^>]*?label="([^"]*)"/g)].map(m => `${m[1]}:${m[3]}`);
/** Elementos nativos (Safari, hoja de Compartir, pantalla de inicio) por su texto visible. */
async function native(regex, { timeout = 8000 } = {}) {
  const q = `-ios predicate string:label MATCHES[c] "${regex}" OR name MATCHES[c] "${regex}"`;
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const el of await driver.$$(q)) { try { if (await el.isDisplayed()) return el; } catch {} }
    await sleep(500);
  }
  return null;
}
const $web = sel => driver.$(sel);

try {
  // 1) Safari abre la demo.
  await driver.url(DEMO);
  await (await $web('#hub [data-owner-nav="menu"]')).waitForDisplayed({ timeout: 180000 });
  check(true, `GestLok abre en Safari del iPhone (${SIM_NAME} · iOS ${SIM_VERSION})`);
  const ua = await driver.execute(() => navigator.userAgent);
  console.log('Navegador:', ua);
  await shot('1-inicio');
  const sw = await driver.executeAsync(done => { navigator.serviceWorker.ready.then(r => done(!!r.active), () => done(false)); setTimeout(() => done(false), 45000); });
  check(sw, 'service worker activo en Safari (lo que permite usarla sin conexión)');

  // 2) Menú › «Instalar en el celular»: la guía de Safari correcta para esta versión.
  await sleep(800);
  await (await $web('#hub [data-owner-nav="menu"]')).click();
  await (await $web('#pn [data-owner-install]')).waitForDisplayed({ timeout: 15000 });
  await (await $web('#pn [data-owner-install]')).click();
  await (await $web('#pn [data-gl-install]')).waitForDisplayed({ timeout: 15000 });
  const kind = await (await $web('#pn [data-gl-install]')).getAttribute('data-gl-install');
  const guide = await (await $web('#pn')).getText();
  const v26 = /Version\/(2[6-9]|[3-9]\d)/.test(ua);
  check(kind === 'ios-safari', `iPhone: se muestra la guía de Safari (${kind}), sin instalación automática (Apple no la permite)`);
  check(guide.includes('Agregar a pantalla de inicio') && guide.includes('Abrir como app web') === v26, `pasos para ${v26 ? 'iOS 26 (⋯ › Compartir)' : 'iOS 18 o anterior (Compartir)'}`);
  await shot('2-guia');
  await (await $web('#pn [data-act="close"]')).click();

  // 3) Sin conexión: con el servidor apagado, GestLok vuelve a abrir desde el iPhone.
  await (await $web('#hub [data-owner-area-staff]')).click();
  await (await $web('#gl-demo-emp .gl-dh-table')).waitForDisplayed({ timeout: 30000 });
  check((await (await $web('#gl-demo-emp')).getText()).includes('42:30 hs'), 'Horarios de la demo: planilla ficticia con los totales del Excel');
  await shot('3-horarios');
  web.stop();
  await driver.refresh();
  const offline = await (await $web('#hub [data-owner-nav="menu"]')).waitForDisplayed({ timeout: 60000 }).then(() => true, () => false);
  await shot('4-sin-conexion');
  check(offline, 'sin internet (servidor apagado): GestLok vuelve a abrir en Safari');
  await web.start();
  await driver.url(DEMO);
  await (await $web('#hub [data-owner-nav="menu"]')).waitForDisplayed({ timeout: 60000 });

  // 4) Siguiendo la guía con los botones reales de Safari: ⋯ › Compartir › Agregar a pantalla de inicio › Agregar.
  await driver.switchContext('NATIVE_APP');
  let src = await source('safari');
  console.log('Botones de Safari:', labels(src).filter(l => l.startsWith('Button')).join(' · '));
  let share = await native('^(Compartir|Share|ShareButton)$', { timeout: 3000 });
  if (!share) {
    const more = await native('^(Más|Más opciones|Opciones|More|MoreButton|PageFormatMenuButton|.*[⋯…].*)$', { timeout: 5000 });
    check(!!more, `Safari: botón ⋯ junto a la dirección${more ? ` («${await more.getAttribute('label')}»)` : ''}`, false);
    if (more) { await more.click(); await sleep(1500); src = await source('safari-menu'); console.log('Menú ⋯:', labels(src).join(' · ')); await shot('5-menu-tres-puntos'); }
    share = await native('^(Compartir|Share|ShareButton)$', { timeout: 6000 });
  }
  check(!!share, 'Safari: botón «Compartir» encontrado como dice la guía', false);
  if (share) {
    await share.click();
    await sleep(2500);
    await shot('6-compartir');
    let add = null;
    for (let i = 0; i < 5 && !add; i++) {
      add = await native('^(Agregar a (la )?pantalla de inicio|Agregar a inicio|Añadir a (la )?pantalla de inicio|Add to Home Screen)$', { timeout: 2500 });
      if (!add) {
        const moreActions = await native('^(Ver más|Más|More|View More|Editar acciones.*)$', { timeout: 800 });
        if (moreActions && i === 1) { await moreActions.click().catch(() => {}); await sleep(1200); }
        else await driver.execute('mobile: swipe', { direction: 'up' }).catch(() => {});
      }
    }
    src = await source('compartir');
    console.log('Hoja Compartir:', labels(src).join(' · '));
    check(!!add, `hoja Compartir: opción «${add ? await add.getAttribute('label') : 'Agregar a pantalla de inicio'}»`, false);
    if (add) {
      await add.click();
      await sleep(2500);
      src = await source('agregar');
      console.log('Agregar:', labels(src).join(' · '));
      await shot('7-agregar-a-inicio');
      const toggle = await native('^(Abrir como app web|Open as Web App)$', { timeout: 3000 });
      if (toggle) check(true, `interruptor «${await toggle.getAttribute('label')}» (valor: ${await toggle.getAttribute('value')})`, false);
      const confirm = await native('^(Agregar|Añadir|Add)$', { timeout: 6000 });
      check(!!confirm, 'botón «Agregar» para terminar', false);
      if (confirm) {
        await confirm.click();
        await sleep(4000);
        await driver.execute('mobile: pressButton', { name: 'home' }).catch(() => {});
        await sleep(2500);
        await shot('8-pantalla-de-inicio');
        const icon = await native('^GestLok$', { timeout: 15000 });
        check(!!icon, 'el ícono «GestLok» quedó en la pantalla de inicio del iPhone', false);
        if (icon) {
          await icon.click();
          await sleep(8000);
          await shot('9-app-abierta');
          check(true, 'GestLok abierta desde el ícono, a pantalla completa (captura «9-app-abierta»)', false);
        }
      }
    }
  }
} catch (e) {
  check(false, `error inesperado: ${e.message}`);
  await shot('error');
  await source('error');
} finally {
  web.stop();
  await driver.deleteSession().catch(() => {});
}
process.exit(finish('iphone') ? 1 : 0);
