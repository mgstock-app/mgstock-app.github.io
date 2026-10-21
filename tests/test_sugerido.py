import asyncio, json
from playwright.async_api import async_playwright

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import load_app

fails = []
def check(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

async def click(pg, sel, wait=200):
    await pg.evaluate(f"document.querySelector({json.dumps(sel)}).click()"); await pg.wait_for_timeout(wait)

async def chip(pg, pid):
    return await pg.evaluate(f"document.querySelector('#inc-{pid}').closest('.sh-r').querySelector('.st').textContent")

async def login(b, email, size, setup=None):
    ctx = await b.new_context(viewport=size)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await load_app(pg)
    if setup: await pg.evaluate(setup)
    await pg.fill('#au-email', email); await pg.fill('#au-pass', 'secreto1')
    await pg.click('#au-in button[type=submit]'); await pg.wait_for_timeout(700)
    await pg.evaluate("(() => { const b = document.querySelector('#hub:not([hidden]) [data-act=local][data-id=munro]'); if (b) b.click(); })()"); await pg.wait_for_timeout(300)
    await click(pg, '#snav [data-go=stock]', 400)
    return ctx, pg, errs

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx, pg, errs = await login(b, 'kmu15lopez@gmail.com', {'width': 1280, 'height': 860})
        check(await pg.locator('.sheet.k-stock .sh-h').inner_text() == 'N°\nSIN STOCK\nPRODUCTO\nESTADO\nLOCAL\nAJUSTAR\nSUGERIDO' or 'SUGERIDO' in (await pg.locator('.sheet.k-stock .sh-h').inner_text()).upper(), 'columnas Local y Sugerido')
        await pg.fill('#sg-p-001', '4'); await pg.press('#sg-p-001', 'Tab'); await pg.wait_for_timeout(300)
        r = await pg.evaluate("window.__rows.find(r => r.col === 'munro/productos' && r.id === 'p-001').data")
        check(r.get('sugerido') == 4, 'la administradora guarda el sugerido: ' + str(r.get('sugerido')))
        for _ in range(4): await click(pg, '#inc-p-001', 120)
        check(await chip(pg, 'p-001') == 'Stock ideal', 'local 4 = sugerido 4: ' + await chip(pg, 'p-001'))
        await click(pg, '#inc-p-001', 120)
        check(await chip(pg, 'p-001') == 'Exceso de stock', 'local 5 > sugerido: ' + await chip(pg, 'p-001'))
        for _ in range(3): await click(pg, '#dec-p-001', 120)
        check(await chip(pg, 'p-001') == 'Poco stock', 'local 2 = mitad del sugerido: ' + await chip(pg, 'p-001'))
        await click(pg, '[data-act=est][data-id=p-001]', 300)
        check(await pg.locator('#es-sug').input_value() == '4', 'panel Estados con el sugerido')
        await pg.fill('#es-poco', '5'); await click(pg, '#es-ok', 300)
        check(await pg.locator('#est-form').count() == 1, 'rechaza poco stock mayor que el sugerido')
        await pg.fill('#es-poco', '1'); await pg.fill('#es-exc', '6'); await pg.wait_for_timeout(100)
        prev = await pg.inner_text('#es-prev')
        check('hasta 1' in prev and 'más de 6' in prev, 'vista previa de los estados: ' + prev.replace('\n', ' · '))
        await click(pg, '#es-ok', 400)
        r = await pg.evaluate("window.__rows.find(r => r.col === 'munro/productos' && r.id === 'p-001').data")
        check(r.get('poco') == 1 and r.get('exceso') == 6 and await pg.locator('#est-form').count() == 0, 'guarda poco stock 1 y exceso 6')
        check(await chip(pg, 'p-001') == 'Stock ideal', 'local 2 con poco stock 1: ' + await chip(pg, 'p-001'))
        for _ in range(4): await click(pg, '#inc-p-001', 120)
        check(await chip(pg, 'p-001') == 'Stock ideal', 'local 6 con exceso desde más de 6: ' + await chip(pg, 'p-001'))
        await click(pg, '#inc-p-001', 120)
        check(await chip(pg, 'p-001') == 'Exceso de stock', 'local 7: ' + await chip(pg, 'p-001'))
        for _ in range(5): await click(pg, '#dec-p-001', 120)
        for _ in range(2): await click(pg, '#dec-p-001', 120)
        check(await chip(pg, 'p-001') == 'Sin stock', 'local 0: ' + await chip(pg, 'p-001'))
        counts = await pg.evaluate("Object.fromEntries([...document.querySelectorAll('.statf.st6 button')].map(b => [b.dataset.f, +b.querySelector('.v').textContent]))")
        check(list(counts) == ['todos', 'sin', 'poco', 'ideal', 'exc', 'nc'] and counts['sin'] >= 1, 'filtros por estado: ' + str(counts))
        await click(pg, '[data-act=filtro][data-f=sin]', 250)
        check(await pg.locator('#inc-p-001').count() == 1, 'filtro Sin stock muestra el producto')
        check(not errs, 'sin errores (administradora): ' + str(errs)); await ctx.close()

        setup = "(() => { const r = window.__rows.find(r => r.col === 'munro/productos' && r.id === 'p-001'); r.data.sugerido = 4; r.data.stock = 6; })()"
        ctx, pg, errs = await login(b, 'gerente.munro@example.com', {'width': 390, 'height': 844}, setup)
        check(await pg.locator('.sg-in, .sg-e').count() == 0, 'el gerente no puede editar sugerido ni estados')
        check(await chip(pg, 'p-001') == 'Exceso de stock', 'el gerente ve el estado: ' + await chip(pg, 'p-001'))
        sug = await pg.evaluate("document.querySelector('#inc-p-001').closest('.sh-r').querySelector('.r-sug').innerText")
        check('4' in sug and 'sobran 2' in sug, 'el gerente ve el sugerido: ' + sug.replace('\n', ' '))
        check(not errs, 'sin errores (gerente): ' + str(errs)); await ctx.close()
        await b.close()
    print('\nRESULTADO: ' + ('TODO OK' if not fails else f'{len(fails)} FALLAS'))
    sys.exit(1 if fails else 0)

asyncio.run(main())
