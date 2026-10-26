/* GestLok · «Instalar en el celular».
 *
 * Android (Chrome, Samsung Internet, Edge, Opera): el botón abre directamente la ventana del celular
 * «Instalar app»; la persona solo confirma con un toque. Ningún navegador deja que una página se
 * instale sin esa confirmación.
 * iPhone y iPad: Apple no permite que una página abra la instalación, así que se muestran los pasos
 * exactos de Safari (en iOS 26, ⋯ › Compartir).
 * Computadora: «Instalar en esta computadora» si Chrome o Edge lo permiten, y cómo abrirla en el celular.
 *
 * El aviso del navegador de que la app se puede instalar llega muy temprano, antes de que terminen de
 * cargar los demás archivos. Por eso app/layout.tsx lo guarda apenas abre la página (window.__glInstall);
 * si este archivo carga primero (pruebas), lo escucha igual. */
(function (root) {
  'use strict';
  const CAP = root.__glInstall || (root.__glInstall = { evt: null, installed: false });
  const fire = name => { try { root.dispatchEvent(new Event(name)); } catch {} };
  if (!CAP.listening && typeof root.addEventListener === 'function') {
    CAP.listening = true;
    root.addEventListener('beforeinstallprompt', e => { e.preventDefault(); CAP.evt = e; fire('gestlok-install-ready'); });
    root.addEventListener('appinstalled', () => { CAP.evt = null; CAP.installed = true; fire('gestlok-install-done'); });
  }

  const INAPP_ANDROID = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|; wv\)/i;
  const INAPP_IOS = /FBAN|FBAV|FBIOS|Instagram|LinkedInApp|Line\/|Snapchat|TikTok|musical_ly|Twitter|MicroMessenger|GSA\//i;

  /** Qué equipo y navegador es. env = {ua, platform, touch, standalone, prompt} (todo opcional). */
  function detect(env = {}) {
    const ua = env.ua || '';
    const ipad = /ipad/i.test(ua) || (env.platform === 'MacIntel' && (env.touch || 0) > 1);
    const ios = ipad || /iphone|ipod/i.test(ua);
    const android = !ios && /android/i.test(ua);
    let browser = 'other';
    if (ios) {
      if (INAPP_IOS.test(ua)) browser = 'inapp';
      else if (/CriOS/i.test(ua)) browser = 'chrome';
      else if (/EdgiOS/i.test(ua)) browser = 'edge';
      else if (/FxiOS/i.test(ua)) browser = 'firefox';
      else if (/Version\/[\d.]+.*Safari\//i.test(ua)) browser = 'safari';
      else browser = 'inapp'; // Sin «Safari» en el nombre: es el navegador interno de otra app.
    } else if (android) {
      if (INAPP_ANDROID.test(ua)) browser = 'inapp';
      else if (/SamsungBrowser/i.test(ua)) browser = 'samsung';
      else if (/EdgA\//i.test(ua)) browser = 'edge';
      else if (/OPR\/|Opera/i.test(ua)) browser = 'opera';
      else if (/Firefox\//i.test(ua)) browser = 'firefox';
      else if (/Chrome\//i.test(ua)) browser = 'chrome';
    } else if (/Edg\//i.test(ua)) browser = 'edge';
    else if (/Firefox\//i.test(ua)) browser = 'firefox';
    else if (/Chrome\//i.test(ua)) browser = 'chrome';
    else if (/Safari\//i.test(ua)) browser = 'safari';
    const safariVersion = Number((ua.match(/Version\/(\d+)/) || [])[1] || 0);
    return {
      ios, ipad, android, mobile: ios || android || /Mobi/i.test(ua), browser,
      // iOS 26 congela la versión del sistema en el nombre del navegador; la de Safari sí cambia.
      ios26: ios && browser === 'safari' && safariVersion >= 26,
      standalone: !!env.standalone, prompt: !!env.prompt,
    };
  }

  /** Qué hace el botón: instalar directo, esperar el permiso del navegador o mostrar los pasos. */
  function plan(d) {
    if (d.standalone) return 'standalone';
    if (d.browser === 'inapp') return 'inapp';
    if (d.mobile && d.prompt) return 'prompt';
    if (d.ios) return d.browser === 'safari' ? 'ios-safari' : 'ios-browser';
    if (d.android) return ['chrome', 'samsung', 'edge', 'opera'].includes(d.browser) ? 'android-wait' : 'android-manual';
    return 'desktop';
  }

  function current() {
    let standalone = false;
    try { standalone = root.matchMedia('(display-mode: standalone)').matches || root.matchMedia('(display-mode: fullscreen)').matches || root.navigator.standalone === true; } catch {}
    const n = root.navigator || {};
    return detect({ ua: n.userAgent, platform: n.platform, touch: n.maxTouchPoints, standalone, prompt: !!CAP.evt });
  }

  const steps = (title, list) => `<div class="steps"><b>${title}</b><ol>${list.map(s => `<li>${s}</li>`).join('')}</ol></div>`;
  const DOTS = '<b aria-label="tres puntos">⋯</b>';
  const KEBAB = '<b aria-label="menú">⋮</b>';
  const SHARE = '<svg class="gl-inst-share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';

  function androidSteps(browser) {
    if (browser === 'samsung') return steps('Samsung Internet', ['Tocá el menú <b>≡</b> (abajo a la derecha).', 'Elegí <b>Agregar página a</b> › <b>Pantalla de inicio</b>.', 'Confirmá con <b>Agregar</b>.']);
    if (browser === 'firefox') return steps('Firefox', [`Tocá el menú ${KEBAB}.`, 'Elegí <b>Instalar</b> o <b>Agregar a la pantalla de inicio</b>.', 'Confirmá con <b>Agregar</b>.']);
    const name = { edge: 'Edge', opera: 'Opera' }[browser] || 'Chrome';
    return steps(name, [`Tocá el menú ${browser === 'edge' ? DOTS : KEBAB} del navegador.`, 'Elegí <b>Instalar app</b> (en algunos celulares dice <b>Agregar a la pantalla principal</b>).', 'Confirmá con <b>Instalar</b>.']);
  }
  function iosSteps(d) {
    if (d.browser !== 'safari') {
      const name = { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox' }[d.browser] || 'el navegador';
      return steps(`iPhone o iPad (${name})`, [`Tocá <b>Compartir</b> ${SHARE} (en la barra de la dirección o en el menú ${DOTS}).`, 'Elegí <b>Agregar a pantalla de inicio</b>.', 'Tocá <b>Agregar</b>.'])
        + '<p class="gl-inst-note">Si no aparece la opción, abrí este enlace en <b>Safari</b> y seguí los pasos.</p>';
    }
    if (d.ios26) return steps('iPhone o iPad (Safari)', [`Tocá ${DOTS} (al lado de la dirección) y después <b>Compartir</b> ${SHARE}.`, 'Deslizá hacia abajo y tocá <b>Agregar a pantalla de inicio</b>.', 'Dejá activado <b>Abrir como app web</b> y tocá <b>Agregar</b>.']);
    return steps('iPhone o iPad (Safari)', [`Tocá <b>Compartir</b> ${SHARE} (${d.ipad ? 'arriba a la derecha' : 'en la barra de abajo'}).`, 'Deslizá hacia abajo y tocá <b>Agregar a pantalla de inicio</b>.', 'Tocá <b>Agregar</b>.']);
  }

  const LEAD = '<p class="lead">Queda el ícono de GestLok en la pantalla de inicio y se abre a pantalla completa, como cualquier app. Se entra con la misma cuenta y también funciona sin conexión.</p>';
  const copyBtn = '<button class="btn" type="button" data-gl-install-copy>Copiar el enlace</button>';
  const head = sub => `<div class="pn-h"><div><small>${sub}</small><h3>Instalar GestLok</h3></div><button class="ib" data-act="close" aria-label="Cerrar"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
  const link = () => { try { return root.location.origin + root.location.pathname.replace(/[^/]*$/, ''); } catch { return 'https://mgstock-app.github.io/'; } };

  function body(kind, d) {
    if (kind === 'inapp') {
      const a = link(), host = a.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const chrome = d.android ? `<a class="btn primary gl-inst-big" href="intent://${host}/#Intent;scheme=https;package=com.android.chrome;end">Abrir en Chrome</a>` : '';
      return `<p class="gl-inst-alert">Estás viendo GestLok dentro de otra app (Instagram, Facebook u otra). Desde acá no se puede instalar: abrila en <b>${d.ios ? 'Safari' : 'Chrome'}</b>.</p>${chrome}${copyBtn}
        <p class="gl-inst-note">Si no se abre sola, copiá el enlace, pegalo en ${d.ios ? 'Safari' : 'Chrome'} y tocá otra vez «Instalar en el celular».</p>`;
    }
    if (kind === 'ios-safari' || kind === 'ios-browser') {
      return `${LEAD}<p class="gl-inst-note">En iPhone y iPad, Apple no deja que una página se instale sola: son tres toques.</p>${iosSteps(d)}`;
    }
    if (kind === 'android-wait') {
      return `${LEAD}<div class="gl-inst-now" data-gl-install-state="wait" role="status" aria-live="polite"><span class="gl-inst-spin" aria-hidden="true"></span><span>Preparando la instalación…</span></div>
        <details class="gl-inst-more"><summary>¿No aparece el botón? Instalala desde el menú</summary>${androidSteps(d.browser)}</details>`;
    }
    if (kind === 'android-manual') return `${LEAD}${androidSteps(d.browser)}`;
    // Computadora
    const pc = CAP.evt
      ? '<button class="btn primary gl-inst-big" type="button" data-gl-install-now>Instalar en esta computadora</button>'
      : d.browser === 'safari' ? steps('En esta Mac (Safari)', ['Menú <b>Archivo</b> › <b>Agregar al Dock</b>.'])
        : d.browser === 'firefox' ? '<p class="gl-inst-note">Firefox no instala apps en la computadora: abrí GestLok en Chrome o Edge.</p>'
          : steps('En esta computadora', ['Tocá el ícono de instalar en la barra de la dirección, o el menú del navegador › <b>Instalar GestLok</b>.']);
    return `${LEAD}<div class="steps"><b>En el celular</b><ol><li>Abrí <b>${link().replace(/^https?:\/\//, '').replace(/\/$/, '')}</b> en el teléfono y entrá con tu cuenta.</li><li><b>Android:</b> tocá <b>Instalar en el celular</b> en el menú y confirmá con <b>Instalar</b>.</li><li><b>iPhone (Safari):</b> ${DOTS} › <b>Compartir</b> › <b>Agregar a pantalla de inicio</b> › <b>Agregar</b>.</li></ol></div>${copyBtn}${pc}`;
  }

  let ctx = null, timer = null;
  const panelOpen = () => !!(ctx && ctx.isOpen() && root.document.querySelector('[data-gl-install]'));
  function paintReady() {
    const box = root.document.querySelector('[data-gl-install-state]');
    if (!box || !CAP.evt) return;
    box.dataset.glInstallState = 'ready';
    box.innerHTML = '<button class="btn primary gl-inst-big" type="button" data-gl-install-now>Instalar GestLok</button><small>Se abre la ventana del celular: tocá <b>Instalar</b>.</small>';
    clearTimeout(timer);
  }
  function paintInstalled() {
    const box = root.document.querySelector('[data-gl-install-state]');
    if (!box) return;
    box.dataset.glInstallState = 'installed';
    box.innerHTML = '<span>GestLok ya está instalada en este celular. Buscá el ícono <b>GestLok</b> en la pantalla de inicio o en la lista de apps.</span>';
    clearTimeout(timer);
  }
  function paintTimeout() {
    const box = root.document.querySelector('[data-gl-install-state="wait"]');
    if (!box) return;
    box.dataset.glInstallState = 'manual';
    box.innerHTML = '<span>El navegador todavía no habilitó la instalación directa. Instalala desde el menú con los pasos de abajo. Si el botón aparece más tarde, se instala con un toque.</span>';
    const more = root.document.querySelector('.gl-inst-more'); if (more) more.open = true;
  }

  /** Abre la ventana del sistema. Tiene que llamarse en el mismo toque de la persona. */
  function promptNow() {
    const ev = CAP.evt;
    if (!ev) return false;
    CAP.evt = null;
    let res;
    try { res = ev.prompt(); } catch { return false; }
    Promise.resolve(res).then(() => ev.userChoice).then(choice => {
      if (choice && choice.outcome === 'accepted') ctx?.toast('Instalando GestLok… En unos segundos aparece el ícono en la pantalla de inicio.');
      else ctx?.toast('Instalación cancelada. Podés volver a intentarlo cuando quieras.');
    }).catch(() => {}).finally(() => { if (panelOpen()) ctx.closePanel(); ctx?.refresh?.(); });
    return true;
  }

  async function installedHere() {
    try {
      const n = root.navigator;
      if (!n || typeof n.getInstalledRelatedApps !== 'function') return false;
      const apps = await Promise.race([n.getInstalledRelatedApps(), new Promise(r => setTimeout(() => r([]), 1500))]);
      return Array.isArray(apps) && apps.some(a => a && a.platform === 'webapp');
    } catch { return false; }
  }

  /** Lo llama app.js desde el toque en «Instalar en el celular». Devuelve 'prompt' o 'panel'. */
  function open(options) {
    ctx = options;
    const d = current();
    const kind = plan(d);
    if (kind === 'prompt' && promptNow()) return 'prompt';
    const sub = d.mobile ? 'Celular' : 'Computadora y celular';
    ctx.openPanel(`<div data-gl-install="${kind === 'prompt' ? 'android-wait' : kind}">${head(sub)}<div class="pn-b">${body(kind === 'prompt' ? 'android-wait' : kind, d)}</div></div>`);
    if (kind === 'android-wait' || kind === 'prompt') {
      clearTimeout(timer);
      if (CAP.evt) paintReady();
      else {
        timer = setTimeout(paintTimeout, 6000);
        installedHere().then(yes => { if (yes && panelOpen()) paintInstalled(); });
      }
    }
    return 'panel';
  }

  if (root.document && typeof root.document.addEventListener === 'function') {
    root.document.addEventListener('click', e => {
      const now = e.target.closest?.('[data-gl-install-now]');
      if (now) { e.preventDefault(); if (!promptNow()) { now.disabled = true; now.textContent = 'Usá los pasos del menú'; } return; }
      const cp = e.target.closest?.('[data-gl-install-copy]');
      if (cp) {
        e.preventDefault();
        const done = () => ctx?.toast('Enlace copiado. Pegalo en el navegador del celular.');
        try { root.navigator.clipboard.writeText(link()).then(done, () => ctx?.copy?.(link())); } catch { ctx?.copy?.(link()); }
      }
    });
    root.addEventListener('gestlok-install-ready', () => { if (panelOpen()) paintReady(); });
    root.addEventListener('gestlok-install-done', () => { if (panelOpen()) ctx.closePanel(); });
  }

  root.GestLokInstall = Object.freeze({
    detect, plan, open, promptNow,
    standalone: () => current().standalone,
    available: () => !!CAP.evt,
    _body: body,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = { detect, plan, body };
})(typeof window !== 'undefined' ? window : globalThis);
