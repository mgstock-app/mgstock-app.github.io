"""Nombres de bloques y «¿Aplicar a todos los locales?» para administradora y dueña (simulador, datos ficticios)."""
import asyncio, json
from playwright.async_api import async_playwright

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import load_app, OUT

fails = []
def check(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

SETUP = """(() => { window.__rows.push(
  {col: 'munro/hojas', id: 'h-c1', data: {nombre: 'Stock Cajas', tipo: 'lista', orden: 4}},
  {col: 'torcuato/hojas', id: 'h-c2', data: {nombre: 'Stock cajas', tipo: 'lista', orden: 4}}); })()"""

def R(col, cond):
    return f"window.__rows.filter(r => r.col === '{col}' && ({cond})).map(r => ({{id: r.id, ...r.data}}))"

async def click(pg, sel, wait=300):
    await pg.evaluate(f"document.querySelector({json.dumps(sel)}).click()"); await pg.wait_for_timeout(wait)

async def login(b, email, size=None):
    ctx = await b.new_context(viewport=size or {'width': 1280, 'height': 900})
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await load_app(pg); await pg.evaluate(SETUP)
    await pg.fill('#au-email', email); await pg.fill('#au-pass', 'secreto1')
    await pg.click('#au-in button[type=submit]'); await pg.wait_for_timeout(700)
    await pg.evaluate("(() => { const b = document.querySelector('#hub:not([hidden]) [data-act=local][data-id=munro]'); if (b) b.click(); })()"); await pg.wait_for_timeout(300)
    return ctx, pg, errs

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx, pg, errs = await login(b, 'admin@example.com')
        await click(pg, '#snav [data-go=fabrica]', 400)
        heads = await pg.evaluate("[...document.querySelectorAll('.xl-bq b')].map(x => x.textContent)")
        check(heads[:2] == ['Bloque 1', 'Bloque 2'], 'cada bloque tiene su encabezado: ' + str(heads))
        # Nombre de bloque → todos los locales
        await click(pg, '#bq-e-1'); await pg.fill('#bq-nombre', 'Fiambres'); await click(pg, '#bq-ok', 300)
        txt = await pg.inner_text('#ask-todos')
        check('todos los locales de Dueno' in txt and 'Munro y Torcuato' in txt, 'pregunta si aplicar a todos los locales de la dueña: ' + txt[:90].replace('\n', ' '))
        await click(pg, '#ask-todos-ok', 600)
        hm = await pg.evaluate("(window.__rows.find(r => r.col === 'munro/hojas' && r.id === 'fabrica') || {}).data")
        ht = await pg.evaluate("(window.__rows.find(r => r.col === 'torcuato/hojas' && r.id === 'fabrica') || {}).data")
        check(hm and hm['bloques'] == {'1': 'Fiambres'} and ht and ht['bloques'] == {'1': 'Fiambres'}, 'el nombre del bloque se guarda en los dos locales')
        check((await pg.evaluate("document.querySelector('.xl-bq b').textContent")) == 'Fiambres', 'la planilla muestra «Fiambres»')
        await click(pg, '#bq-e-2'); await pg.fill('#bq-nombre', 'Mangas'); await click(pg, '#bq-ok', 300); await click(pg, '#ask-uno', 500)
        check((await pg.evaluate("(window.__rows.find(r => r.col === 'torcuato/hojas' && r.id === 'fabrica') || {}).data"))['bloques'] == {'1': 'Fiambres'}, '«Solo Munro» no toca Torcuato')
        # Agregar producto a todos
        await click(pg, '.bar [data-act=f-add-dlg]')
        opts = await pg.evaluate("[...document.querySelectorAll('#afa-bloque option')].map(o => o.textContent)")
        check('Fiambres' in opts and 'Mangas' in opts, 'el cuadro de agregar muestra los nombres de bloque: ' + str(opts))
        await pg.fill('#afa-nombre', 'Jamón crudo'); await pg.select_option('#afa-bloque', '1'); await click(pg, '#afa-ok', 300)
        check(await pg.locator('#ask-todos').count() == 1 and len(await pg.evaluate(R('munro/fabrica', "r.data.nombre === 'Jamón crudo'"))) == 0, 'no guarda hasta responder')
        await click(pg, '#ask-todos-ok', 700)
        mu, to = await pg.evaluate(R('munro/fabrica', "r.data.nombre === 'Jamón crudo'")), await pg.evaluate(R('torcuato/fabrica', "r.data.nombre === 'Jamón crudo'"))
        check(len(mu) == 1 and len(to) == 1 and to[0]['bloque'] == 1 and to[0].get('local') is None and 'hoja' not in to[0], 'producto agregado en Munro y Torcuato (sin cantidades)')
        await click(pg, '#pn [data-act=close]')
        # Modificar a todos
        await click(pg, '.xpb[data-id=f-003]'); await pg.fill('#afe-nombre', 'Manteca de ajo'); await click(pg, '#afe-ok', 300); await click(pg, '#ask-todos-ok', 700)
        t3 = await pg.evaluate(R('torcuato/fabrica', "r.id === 'f-003'"))
        check(t3[0]['nombre'] == 'Manteca de ajo', 'modificación aplicada en Torcuato')
        # Eliminar solo en Munro
        await click(pg, '.xpb[data-id=f-004]'); await click(pg, '#afe-del'); await click(pg, '#afd-ok', 300); await click(pg, '#ask-uno', 600)
        check(not await pg.evaluate(R('munro/fabrica', "r.id === 'f-004'")) and len(await pg.evaluate(R('torcuato/fabrica', "r.id === 'f-004'"))) == 1, 'eliminar «Solo Munro» deja Torcuato igual')
        # Cancelar
        await click(pg, '.xpb[data-id=f-005]'); await click(pg, '#afe-del'); await click(pg, '#afd-ok', 300)
        await click(pg, '#ask-todos [data-r=""]', 400)
        check(len(await pg.evaluate(R('munro/fabrica', "r.id === 'f-005'"))) == 1, 'Cancelar no elimina nada')
        await click(pg, '#pn [data-act=close]')
        await pg.screenshot(path=OUT + 'bloques-1.png')
        # Hoja de lista con distinto id en cada local
        await click(pg, '#snav [data-go=h-c1]', 400)
        await click(pg, '[data-act=aj-open][data-tab=agregar]', 300)
        await pg.fill('#aa-nombre', 'Caja pizza'); await pg.fill('#aa-cat', 'Cajas'); await click(pg, '#aa-form button[type=submit]', 300)
        await click(pg, '#ask-todos-ok', 700)
        tc = await pg.evaluate(R('torcuato/productos', "r.data.nombre === 'Caja pizza'"))
        check(len(tc) == 1 and tc[0]['hoja'] == 'h-c2' and tc[0].get('stock') is None, 'se agrega en la hoja «Stock cajas» de Torcuato')
        check(not errs, 'sin errores (administradora): ' + str(errs)); await ctx.close()

        # Gerente: sin pregunta, solo su local
        ctx, pg, errs = await login(b, 'gerente.munro@example.com')
        await click(pg, '#snav [data-go=fabrica]', 400)
        await click(pg, '.bar [data-act=f-add-dlg]'); await pg.fill('#afa-nombre', 'Producto gerente'); await click(pg, '#afa-ok', 500)
        check(await pg.locator('#ask-todos').count() == 0 and len(await pg.evaluate(R('munro/fabrica', "r.data.nombre === 'Producto gerente'"))) == 1 and not await pg.evaluate(R('torcuato/fabrica', "r.data.nombre === 'Producto gerente'")), 'el gerente agrega solo en su local, sin pregunta')
        check(not errs, 'sin errores (gerente): ' + str(errs)); await ctx.close()
        await b.close()
    print('\nRESULTADO: ' + ('TODO OK' if not fails else f'{len(fails)} FALLAS'))
    sys.exit(1 if fails else 0)

asyncio.run(main())
