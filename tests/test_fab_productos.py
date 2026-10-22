"""Conteo Fábrica: agregar, modificar y eliminar productos desde la misma planilla."""
import asyncio, json
from playwright.async_api import async_playwright

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import load_app, OUT

fails = []
def check(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

def R(id):
    return f"(window.__rows.find(r => r.col === 'munro/fabrica' && r.id === '{id}') || {{}}).data"

async def click(pg, sel, wait=250):
    await pg.evaluate(f"document.querySelector({json.dumps(sel)}).click()"); await pg.wait_for_timeout(wait)

async def login(b, email, size, mobile=False):
    ctx = await b.new_context(viewport=size, is_mobile=mobile, has_touch=mobile)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await load_app(pg)
    await pg.fill('#au-email', email); await pg.fill('#au-pass', 'secreto1')
    await pg.click('#au-in button[type=submit]'); await pg.wait_for_timeout(700)
    await pg.evaluate("(() => { const b = document.querySelector('#hub:not([hidden]) [data-act=local][data-id=munro]'); if (b) b.click(); })()"); await pg.wait_for_timeout(300)
    await click(pg, '#snav [data-go=fabrica]', 400)
    return ctx, pg, errs

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx, pg, errs = await login(b, 'gerente.munro@example.com', {'width': 1280, 'height': 900})
        check(await pg.locator('.bar [data-act=f-add-dlg]').count() == 1 and await pg.locator('.xl-add [data-act=f-add-dlg]').count() == 1, 'botón Agregar producto arriba y al final de la planilla')
        check(await pg.locator('.xpb[data-act=f-item]').count() == 27, 'cada nombre abre Modificar / Eliminar')
        # Modificar
        await click(pg, '.xpb[data-id=f-001]', 300)
        check(await pg.input_value('#afe-nombre') == 'Insumo de prueba 001' and await pg.evaluate("document.activeElement.id") == 'afe-nombre', 'abre Modificar con el nombre y el foco')
        await pg.fill('#afe-nombre', 'Manteca de Ajo grande'); await pg.select_option('#afe-bloque', '2')
        await pg.evaluate("document.querySelector('#afe-hl').click()")
        await pg.screenshot(path=OUT + 'fab-1-modificar.png')
        await click(pg, '#afe-ok', 500)
        d = await pg.evaluate(R('f-001'))
        check(d.get('nombre') == 'Manteca de Ajo grande' and d.get('bloque') == 2 and d.get('resaltar') is False, 'guarda nombre, bloque y resaltado: ' + str({k: d.get(k) for k in ('nombre', 'bloque', 'resaltar')}))
        check(await pg.evaluate("document.querySelector('#ov').hidden") and 'Manteca de Ajo grande' in await pg.inner_text('#fr-f-001'), 'cierra el cuadro y la planilla muestra el cambio')
        # Eliminar (con vuelta atrás)
        await click(pg, '.xpb[data-id=f-002]', 300); await click(pg, '#afe-del', 250)
        check('¿Eliminar' in await pg.inner_text('#pn') and await pg.locator('#afd-ok').count() == 1, 'pide confirmación para eliminar')
        await click(pg, '#pn [data-act=f-item][data-id=f-002]', 250)
        check(await pg.locator('#afe-form').count() == 1, 'Cancelar vuelve a Modificar')
        await click(pg, '#afe-del', 250); await click(pg, '#afd-ok', 500)
        check(await pg.evaluate(R('f-002')) is None and await pg.locator('#fr-f-002').count() == 0 and await pg.evaluate("document.querySelector('#ov').hidden"), 'elimina el producto de la planilla')
        # Agregar varios seguidos
        await click(pg, '.bar [data-act=f-add-dlg]', 300)
        check(await pg.evaluate("document.activeElement.id") == 'afa-nombre', 'abre Agregar con el foco en el nombre')
        await pg.fill('#afa-nombre', 'Salsa Barbacoa'); await pg.select_option('#afa-bloque', '1'); await click(pg, '#afa-ok', 500)
        check(await pg.input_value('#afa-nombre') == '' and await pg.locator('#afa-form').count() == 1, 'queda listo para agregar otro')
        await pg.fill('#afa-nombre', 'Pepinillos extra'); await pg.evaluate("document.querySelector('#afa-hl').click()"); await click(pg, '#afa-ok', 500)
        await pg.fill('#afa-nombre', 'salsa barbacoa'); await click(pg, '#afa-ok', 500)
        nuevos = await pg.evaluate("window.__rows.filter(r => r.col === 'munro/fabrica' && /barbacoa|pepinillos/i.test(r.data.nombre)).map(r => [r.data.nombre, r.data.bloque, r.data.resaltar])")
        check(sorted(n[0] for n in nuevos) == ['Pepinillos extra', 'Salsa Barbacoa'], 'agrega dos y no repite: ' + str(nuevos))
        orden = await pg.evaluate("(() => { const bq = it => Math.max(1, Math.round(+it.bloque || 1)); const xs = window.__rows.filter(r => r.col === 'munro/fabrica').map(r => r.data).sort((a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9)); return xs.every((x, i) => !i || bq(xs[i - 1]) <= bq(x)) ? 'ok' : xs.map(x => x.nombre + ':' + bq(x)).join(', '); })()")
        check(orden == 'ok', 'cada producto queda al final de su bloque, sin mezclar bloques: ' + orden)
        await click(pg, '#pn [data-act=close]', 300)
        txt = await pg.inner_text('.xl')
        check('Salsa Barbacoa' in txt and 'Pepinillos extra' in txt, 'los nuevos aparecen en la planilla')
        await pg.screenshot(path=OUT + 'fab-2-planilla.png')
        check(not errs, 'sin errores (gerente): ' + str(errs)); await ctx.close()

        # Celular
        ctx, pg, errs = await login(b, 'gerente.munro@example.com', {'width': 390, 'height': 844}, True)
        await click(pg, '.xpb[data-id=f-003]', 300)
        await pg.screenshot(path=OUT + 'fab-3-celular-modificar.png')
        await click(pg, '#pn [data-act=close]', 200)
        await click(pg, '.bar [data-act=f-add-dlg]', 300)
        await pg.screenshot(path=OUT + 'fab-4-celular-agregar.png')
        check(await pg.evaluate("document.documentElement.scrollWidth <= innerWidth"), 'sin desplazamiento lateral en el celular')
        check(not errs, 'sin errores (celular): ' + str(errs)); await ctx.close()

        # Solo ver
        ctx, pg, errs = await login(b, 'lectura@example.com', {'width': 1280, 'height': 900})
        check(await pg.locator('.xpb, [data-act=f-add-dlg]').count() == 0, 'Solo ver: no agrega ni modifica')
        await ctx.close()
        await b.close()
    print('\nRESULTADO: ' + ('TODO OK' if not fails else f'{len(fails)} FALLAS'))
    sys.exit(1 if fails else 0)

asyncio.run(main())
