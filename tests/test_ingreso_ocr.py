"""Ingreso de mercadería: fotos y PDF (con lectores simulados; los reales se prueban en Cypress en GitHub)."""
import asyncio, io, json
from PIL import Image
from playwright.async_api import async_playwright

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import load_app, OUT
from test_ingreso import SETUP, R, click, cargar, fila

fails = []
def check(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

def tsv(words):
    return '\n'.join(f"5\t1\t1\t1\t1\t1\t{x}\t{y}\t{w}\t20\t90\t{t}" for t, x, y, w in words)
TSV = tsv([('Remito', 10, 10, 80), ('Descripción', 100, 50, 120), ('Cant.', 400, 50, 50),
           ('Jamón', 100, 90, 60), ('cocido', 170, 90, 60), ('2', 410, 92, 12),
           ('Cajas', 100, 130, 60), ('grandes', 170, 130, 70), ('5', 410, 131, 12),
           ('Producto', 100, 170, 80), ('raro', 190, 170, 40), ('9', 410, 170, 12)])
TESS = "window.__ocr = []; window.Tesseract = {createWorker: async (lang, oem, o) => { window.__ocr.push({lang, worker: o.workerPath, core: o.corePath, langs: o.langPath}); return {recognize: async () => { o.logger && o.logger({status: 'recognizing text', progress: 0.5}); return {data: {tsv: " + json.dumps(TSV) + "}}; }, terminate: async () => {}}; }};"
PDFJS = """export const GlobalWorkerOptions = {};
const item = (str, x, y) => ({str, transform: [10, 0, 0, 10, x, y], width: str.length * 6, height: 10});
export function getDocument({data}){
  const escaneado = data[10] === 0x53;
  const page = {getViewport: ({scale}) => ({width: 600 * scale, height: 800 * scale}),
    getTextContent: async () => ({items: escaneado ? [] : [item('Producto', 50, 700), item('Cantidad', 400, 700), item('Muzzarella', 50, 680), item('3,5', 410, 680), item('Manteca de ajo', 50, 660), item('1/4', 410, 660)]}),
    render: () => ({promise: Promise.resolve()})};
  return {promise: Promise.resolve({numPages: 1, getPage: async () => page})};
}"""

def png():
    b = io.BytesIO(); Image.new('RGB', (300, 200), 'white').save(b, 'PNG'); return b.getvalue()

async def login(b, email):
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.route('**/vendor/ocr/tesseract.min.js', lambda r: r.fulfill(content_type='application/javascript', body=TESS))
    await pg.route('**/vendor/pdfjs/pdf.min.js', lambda r: r.fulfill(content_type='text/javascript', body=PDFJS))
    await load_app(pg); await pg.evaluate(SETUP)
    await pg.fill('#au-email', email); await pg.fill('#au-pass', 'secreto1')
    await pg.click('#au-in button[type=submit]'); await pg.wait_for_timeout(700)
    await pg.evaluate("(() => { const b = document.querySelector('#hub:not([hidden]) [data-act=local][data-id=munro]'); if (b) b.click(); })()"); await pg.wait_for_timeout(300)
    return ctx, pg, errs

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx, pg, errs = await login(b, 'gerente.munro@example.com')
        check(await pg.locator('#ini-remito').count() == 0, 'el gerente no tiene «Ingresar remito»')
        await ctx.close()

        ctx, pg, errs = await login(b, 'dueno@example.com')
        check(await pg.locator('#ini-remito').count() == 1, 'la dueña tiene «Ingresar remito» en Inicio')
        await click(pg, '#ini-remito', 400)
        check(await pg.inner_text('#ttl') == 'Ingreso de mercadería', 'el botón abre Ingreso de mercadería')
        await click(pg, '#ing-loc-munro', 600); await click(pg, '#ing-op-ingreso', 300)
        check('Ingresar remito' in await pg.inner_text('#ing-drop') and 'image/*' in await pg.get_attribute('#ing-file', 'accept'), 'botón «Ingresar remito» acepta fotos y PDF')
        # Foto
        await cargar(pg, 'remito.png', png(), 'image/png'); await pg.wait_for_timeout(500)
        o = await pg.evaluate('window.__ocr')
        check(o and o[0]['lang'] == 'spa' and o[0]['core'].endswith('/vendor/ocr/') and o[0]['worker'].endswith('/vendor/ocr/worker.min.js'), 'OCR en español con archivos de la misma web: ' + str(o))
        j, c = await fila(pg, 'p:p-001'), await fila(pg, 'p:c-1')
        check(j and c and j['det'].endswith('2') and c['res'].endswith('8'), 'la foto se lee como tabla: Jamón 2, Cajas 3 + 5')
        check(not j['on'] and not c['on'] and await pg.locator('#ing-ocr').count() == 1, 'de una foto nada va tildado y pide revisar')
        check('Producto raro' in await pg.inner_text('#ing-ign'), 'lo desconocido de la foto queda ignorado')
        await click(pg, '#ing-tildar', 300)
        check((await fila(pg, 'p:p-001'))['on'] and (await fila(pg, 'p:c-1'))['on'], '«Tildar los que coinciden»')
        await pg.screenshot(path=OUT + 'ing-ocr-foto.png', full_page=True)
        await click(pg, '#ing-ok', 700)
        check((await pg.evaluate(R('munro', 'productos', 'p-001')))['stock'] == 2 and (await pg.evaluate(R('munro', 'productos', 'c-1')))['stock'] == 8, 'confirmar guarda lo leído de la foto')
        # PDF digital
        await click(pg, '[data-act=ing-otro]', 300)
        await cargar(pg, 'remito.pdf', b'%PDF-1.4\n%xx texto', 'application/pdf'); await pg.wait_for_timeout(500)
        m, f = await fila(pg, 'p:p-002'), await fila(pg, 'f:f-002')
        check(m and f and m['det'].endswith('3,5') and f['cant'] == '0,25' and m['on'] and await pg.locator('#ing-ocr').count() == 0, 'PDF con texto: tabla leída y tildada: ' + str((m, f)))
        # PDF escaneado
        await click(pg, '[data-act=ing-quitar]', 300)
        n0 = len(await pg.evaluate('window.__ocr'))
        await cargar(pg, 'escaneado.pdf', b'%PDF-1.4\n%Sescaneado', 'application/pdf'); await pg.wait_for_timeout(600)
        check(len(await pg.evaluate('window.__ocr')) == n0 + 1 and await pg.locator('#ing-ocr').count() == 1 and (await fila(pg, 'p:p-001')) is not None, 'PDF escaneado: usa OCR y pide revisar')
        await click(pg, '[data-act=ing-quitar]', 300)
        await cargar(pg, 'raro.heic', b'nada', 'image/heic'); await pg.wait_for_timeout(400)
        check('HEIC' in await pg.inner_text('#ing-err'), 'imagen que no se puede abrir: explica qué hacer')
        check(not errs, 'sin errores: ' + str(errs)); await ctx.close()
        await b.close()
    print('\nRESULTADO: ' + ('TODO OK' if not fails else f'{len(fails)} FALLAS'))
    sys.exit(1 if fails else 0)

asyncio.run(main())
