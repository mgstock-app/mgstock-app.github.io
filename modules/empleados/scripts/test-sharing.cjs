const assert = require('node:assert/strict');
const fs = require('node:fs');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function scenario({ native = false, cancelled = false, opened = true } = {}) {
  const handlers = new Map(), nodes = new Map();
  let saved = 0;
  const state = {};
  const container = {
    set innerHTML(html) { for (const match of html.matchAll(/data-acc="([^"]+)"/g)) nodes.set(match[1], {}); },
    querySelector(selector) { return selector === '[data-est]' ? state : nodes.get(selector.match(/"([^"]+)"/)[1]); },
    querySelectorAll(selector) { const node = this.querySelector(selector); return node ? [node] : []; },
  };
  const navigator = { clipboard: { write: async () => {} }, canShare: () => true, share: async () => { if (cancelled) throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); } };
  const scope = { document: {}, window: { ClipboardItem: class {}, open: () => opened ? {} : null }, listen: (node, event, fn) => handlers.set(node, fn) };
  const ctx = { S: { downloads: true }, esTactil: () => native, esc: value => value, pintarTodo() {}, msgError: e => e.message };
  const source = fs.readFileSync('features/reports/pdf-export.js', 'utf8').replace('export function registerPdfExport', 'function registerPdfExport');
  new Function('scope', 'ctx', 'navigator', 'ClipboardItem', source + '\nregisterPdfExport(scope, ctx);')(scope, ctx, navigator, class {});
  ctx.archivoImagen = () => ({});
  ctx.esTactil = () => native;
  ctx.puedeCompartir = () => true;
  ctx.accionesEnvio(container, { img: {}, wa: 'https://example.invalid', onShared: async () => { saved++; } }, 'Prueba', {});
  const click = async name => { const node = nodes.get(name); await handlers.get(node).call(node); await flush(); };
  if (native) {
    await click('compartir');
    assert.equal(saved, cancelled ? 0 : 1, 'Cancelled native sharing must not record delivery');
  } else {
    await click('copiar');
    assert.equal(saved, 0, 'Copying/opening WhatsApp is not a confirmed delivery');
    await click('confirmar');
    await click('confirmar');
    assert.equal(saved, 1, 'Manual confirmation records history only once');
  }
}
async function main() {
  await scenario(); await scenario({ opened: false });
  await scenario({ native: true }); await scenario({ native: true, cancelled: true });
  console.log('Sharing: copy, confirmation, native success and cancellation passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
