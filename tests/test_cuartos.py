"""Cuartos de unidad: ¼ ½ ¾ en la hoja Stock y valores con cuartos en Conteo Fábrica."""
import asyncio, json
from playwright.async_api import async_playwright

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import load_app, OUT

fails = []
def check(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

SETUP = """(() => { window.__rows.push({col: 'munro/hojas', id: 'h-cajas01', data: {nombre: 'Stock Cajas', tipo: 'lista', orden: 4}},
  {col: 'munro/productos', id: 'c-1', data: {nombre: 'Caja pizza grande', cat: 'Cajas', unidad: 'unidad', stock: 3, sinStock: false, orden: 1, hoja: 'h-cajas01'}}); })()"""

def R(col, id):
    return f"window.__rows.find(r => r.col === 'munro/{col}' && r.id === '{id}').data"

async def click(pg, sel, wait=150):
    await pg.evaluate(f"document.querySelector({json.dumps(sel)}).click()"); await pg.wait_for_timeout(wait)

async def q(pg, pid):
    return await pg.evaluate(f"document.querySelector('#inc-{pid}').closest('.sh-r').querySelector('.r-q .q').textContent")

async def pressed(pg, pid):
    return await pg.evaluate(f"[...document.querySelectorAll('#inc-{pid}') ].length ? [...document.querySelector('#inc-{pid}').closest('.r-adj').querySelectorAll('.fq button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent).join('') : null")

async def login(b, email, size):
    ctx = await b.new_context(viewport=size)
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
        ctx, pg, errs = await login(b, 'gerente.munro@example.com', {'width': 1280, 'height': 900})
        await click(pg, '#snav [data-go=stock]', 400)
        check(await pg.locator('#fq1-p-001, #fq2-p-001, #fq3-p-001').count() == 3, 'botones ¼ ½ ¾ en Stock')
        for _ in range(2): await click(pg, '#inc-p-001')
        await click(pg, '#fq3-p-001')
        check(await q(pg, 'p-001') == '2,75' and await pressed(pg, 'p-001') == '¾', '2 + ¾ = 2,75: ' + await q(pg, 'p-001'))
        await click(pg, '#fq1-p-001')
        check(await q(pg, 'p-001') == '2,25' and await pressed(pg, 'p-001') == '¼', 'cambiar a ¼ = 2,25: ' + await q(pg, 'p-001'))
        await click(pg, '#fq1-p-001')
        check(await q(pg, 'p-001') == '2' and await pressed(pg, 'p-001') == '', 'tocar ¼ otra vez la saca: ' + await q(pg, 'p-001'))
        await click(pg, '#fq2-p-001'); await click(pg, '#inc-p-001')
        check(await q(pg, 'p-001') == '3,5', '½ y + mantiene la fracción: ' + await q(pg, 'p-001'))
        await click(pg, '#fq3-p-002')
        check(await q(pg, 'p-002') == '0,75', 'sin contar + ¾ = 0,75: ' + await q(pg, 'p-002'))
        await click(pg, '#dec-p-002')
        check(await q(pg, 'p-002') == '0', '− desde 0,75 queda en 0: ' + await q(pg, 'p-002'))
        await click(pg, '#fq1-p-002')
        await pg.screenshot(path=OUT + 'cuartos-1-stock.png')
        await click(pg, '#sb-save', 300); await click(pg, '#sv-ok', 700)
        a, c = await pg.evaluate(R('productos', 'p-001')), await pg.evaluate(R('productos', 'p-002'))
        check(a.get('stock') == 3.5 and c.get('stock') == 0.25 and not c.get('sinStock'), 'guarda 3,5 y 0,25: ' + str((a.get('stock'), c.get('stock'))))
        await click(pg, '#snav [data-go=h-cajas01]', 400)
        check(await pg.locator('.fq').count() == 0, 'Stock Cajas sin botones de fracción')
        # Conteo (mismos productos que Stock)
        await click(pg, '#snav [data-go=conteo]', 400)
        await pg.fill('#cq-p-003', '1 1/4'); await pg.wait_for_timeout(150)
        check(not await pg.evaluate("document.querySelector('#cq-p-003').classList.contains('bad')"), 'Conteo acepta 1 1/4')
        await click(pg, '[data-act=cinc][data-id=p-003]')
        check(await pg.input_value('#cq-p-003') == '2,25', 'Conteo + mantiene el cuarto: ' + await pg.input_value('#cq-p-003'))
        # Conteo Fábrica
        await click(pg, '#snav [data-go=fabrica]', 400)
        await pg.fill('#fl-f-001', '2 3/4'); await pg.fill('#ff-f-001', '0,25'); await pg.wait_for_timeout(150)
        check(await pg.inner_text('#ft-f-001') == '3', 'Fábrica: 2 3/4 + 0,25 = 3: ' + await pg.inner_text('#ft-f-001'))
        await pg.fill('#fl-f-002', '¾'); await pg.fill('#ff-f-002', '1,5'); await pg.wait_for_timeout(150)
        check(await pg.inner_text('#ft-f-002') == '2,25', 'Fábrica: ¾ + 1,5 = 2,25: ' + await pg.inner_text('#ft-f-002'))
        await pg.fill('#fl-f-003', '1,3'); await pg.wait_for_timeout(150)
        check(await pg.evaluate("document.querySelector('#fl-f-003').classList.contains('bad')"), 'Fábrica rechaza 1,3')
        await pg.fill('#fl-f-003', ''); await pg.wait_for_timeout(100)
        await pg.screenshot(path=OUT + 'cuartos-2-fabrica.png')
        await click(pg, '#sb-save', 300); await click(pg, '#sv-ok', 700)
        f1, f2 = await pg.evaluate(R('fabrica', 'f-001')), await pg.evaluate(R('fabrica', 'f-002'))
        check(f1.get('local') == 2.75 and f1.get('fabrica') == 0.25 and f2.get('local') == 0.75, 'Fábrica guarda cuartos: ' + str((f1.get('local'), f1.get('fabrica'), f2.get('local'))))
        check(await pg.input_value('#fl-f-001') == '2,75', 'Fábrica muestra 2,75 después de guardar')
        check(not errs, 'sin errores (gerente): ' + str(errs)); await ctx.close()

        # Celular
        ctx, pg, errs = await login(b, 'gerente.munro@example.com', {'width': 390, 'height': 844})
        await click(pg, '#snav [data-go=stock]', 400)
        await click(pg, '#inc-p-001'); await click(pg, '#fq3-p-001')
        check(await pg.evaluate("document.documentElement.scrollWidth <= innerWidth"), 'sin desplazamiento lateral en el celular')
        box = await pg.evaluate("(() => { const r = document.querySelector('#fq3-p-001').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()")
        check(box[0] >= 30 and box[1] >= 36, 'botones cómodos para tocar: ' + str(box))
        await pg.evaluate("document.querySelector('#inc-p-001').closest('.sh-r').scrollIntoView({block: 'center'})"); await pg.wait_for_timeout(150)
        await pg.screenshot(path=OUT + 'cuartos-3-celular.png')
        await click(pg, '#snav [data-go=fabrica]', 400)
        await pg.fill('#fl-f-001', '3/4'); await pg.wait_for_timeout(150)
        await pg.screenshot(path=OUT + 'cuartos-4-fabrica-celular.png')
        check(not errs, 'sin errores (celular): ' + str(errs)); await ctx.close()

        # Solo ver
        ctx, pg, errs = await login(b, 'lectura@example.com', {'width': 1280, 'height': 900})
        await click(pg, '#snav [data-go=stock]', 400)
        check(await pg.locator('.fq button:not([disabled])').count() == 0, 'Solo ver: ¼ ½ ¾ deshabilitados')
        await ctx.close()
        await b.close()
    print('\nRESULTADO: ' + ('TODO OK' if not fails else f'{len(fails)} FALLAS'))
    sys.exit(1 if fails else 0)

asyncio.run(main())
