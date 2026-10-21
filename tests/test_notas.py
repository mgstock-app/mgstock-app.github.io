"""Observación del gerente por producto y botón Borrar datos en Stock, hojas de lista y Conteo Fábrica."""
import asyncio, json
from playwright.async_api import async_playwright

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import load_app, OUT

fails = []
def check(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

SETUP = """(() => {
  const P = id => window.__rows.find(r => r.col === 'munro/productos' && r.id === id).data;
  Object.assign(P('p-001'), {sugerido: 4, poco: 1, exceso: 6, obs: 'Va en heladera'});
  Object.assign(P('p-002'), {min: 2});
  window.__rows.push({col: 'munro/hojas', id: 'h-cajas01', data: {nombre: 'Stock Cajas', tipo: 'lista', orden: 4, sugerido: true}},
    {col: 'munro/productos', id: 'c-1', data: {nombre: 'Caja pizza grande', cat: 'Cajas', unidad: 'unidad', stock: 7, sinStock: false, sugerido: 8, orden: 1, hoja: 'h-cajas01', nota: 'Llegaron rotas 2', notaPor: 'Gerente Munro', notaFecha: 1792600000000}},
    {col: 'munro/productos', id: 'c-2', data: {nombre: 'Caja empanadas', cat: 'Cajas', unidad: 'unidad', stock: 0, sinStock: true, orden: 2, hoja: 'h-cajas01'}});
  P('p-005').stock = 2;
})()"""

def R(col, id):
    return f"window.__rows.find(r => r.col === 'munro/{col}' && r.id === '{id}').data"

async def click(pg, sel, wait=200):
    await pg.evaluate(f"document.querySelector({json.dumps(sel)}).click()"); await pg.wait_for_timeout(wait)

async def login(b, email, size):
    ctx = await b.new_context(viewport=size)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await load_app(pg); await pg.evaluate(SETUP)
    await pg.fill('#au-email', email); await pg.fill('#au-pass', 'secreto1')
    await pg.click('#au-in button[type=submit]'); await pg.wait_for_timeout(700)
    await pg.evaluate("(() => { const b = document.querySelector('#hub:not([hidden]) [data-act=local][data-id=munro]'); if (b) b.click(); })()"); await pg.wait_for_timeout(300)
    return ctx, pg, errs

async def nota(pg, k, pid, texto, key='Enter'):
    await click(pg, f'#nw-{k}-{pid} [data-act=nota]', 150)
    el = f'#nt-{k}-{pid}'
    check(await pg.evaluate(f"document.activeElement === document.querySelector('{el}')"), f'campo de observación con el foco ({pid})')
    await pg.fill(el, texto); await pg.press(el, key); await pg.wait_for_timeout(350)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------- Gerente en la hoja Stock ----------
        ctx, pg, errs = await login(b, 'gerente.munro@example.com', {'width': 1280, 'height': 900})
        await click(pg, '#snav [data-go=stock]', 400)
        check(await pg.locator('#nw-p-p-001 .addnote').count() == 1, 'botón + Observación debajo del producto')
        await nota(pg, 'p', 'p-001', 'Quedan pocas, pedir el lunes')
        d = await pg.evaluate(R('productos', 'p-001'))
        check(d.get('nota') == 'Quedan pocas, pedir el lunes' and d.get('notaPor') and d.get('notaFecha'), 'guarda la observación con autor y fecha: ' + str({k: d.get(k) for k in ('nota', 'notaPor')}))
        check('Quedan pocas' in await pg.inner_text('#nw-p-p-001 .nt'), 'la observación se ve debajo del producto')
        await nota(pg, 'p', 'p-002', 'esto no se guarda', 'Escape')
        check('nota' not in await pg.evaluate(R('productos', 'p-002')) and await pg.locator('#nw-p-p-002 .addnote').count() == 1, 'Escape cancela sin guardar')
        await nota(pg, 'p', 'p-003', 'Temporal')
        await nota(pg, 'p', 'p-003', '')
        check(not (await pg.evaluate(R('productos', 'p-003'))).get('nota'), 'dejar vacío borra la observación')
        # Cargar stock y guardar conteo
        for _ in range(3): await click(pg, '#inc-p-001', 100)
        await click(pg, '#inc-p-002', 100)
        await click(pg, '#sb-save', 300); await click(pg, '#sv-ok', 700)
        check((await pg.evaluate(R('productos', 'p-001'))).get('stock') == 3, 'conteo guardado (p-001 = 3)')
        await pg.evaluate("document.querySelector('[data-ss=\"p-004\"]').click()"); await pg.wait_for_timeout(300)
        await click(pg, '#inc-p-006', 100)
        await pg.screenshot(path=OUT + 'notas-1-stock.png')
        n_conteos = await pg.evaluate("window.__rows.filter(r => r.col === 'munro/conteos').length")
        # Borrar datos
        await click(pg, '[data-act=borrar]', 300)
        txt = await pg.inner_text('#pn')
        check('Borrar datos' in txt and 'No se tocan' in txt, 'pide confirmación antes de borrar')
        await pg.screenshot(path=OUT + 'notas-2-confirmar.png')
        await click(pg, '[data-act=borrar-ok]', 700)
        p1, p2 = await pg.evaluate(R('productos', 'p-001')), await pg.evaluate(R('productos', 'p-002'))
        check(p1.get('stock') is None and p2.get('stock') is None and not p1.get('nota'), 'borra cantidades y observaciones')
        check(p1.get('sugerido') == 4 and p1.get('poco') == 1 and p1.get('exceso') == 6 and p1.get('obs') == 'Va en heladera' and p2.get('min') == 2, 'no toca sugerido, estados, mínimo ni datos del producto')
        check(await pg.evaluate("window.__rows.filter(r => r.col === 'munro/productos').length") == 35, 'no borra productos')
        check(await pg.evaluate("window.__rows.filter(r => r.col === 'munro/conteos').length") == n_conteos and n_conteos >= 1, 'el historial queda intacto')
        check(not (await pg.evaluate(R('productos', 'p-004'))).get('sinStock') and await pg.locator('#ss-p-004:checked').count() == 0, 'destilda Sin stock')
        check(await pg.evaluate("!document.querySelector('#savebar').classList.contains('dirty')"), 'descarta lo cargado sin guardar')
        cajas = await pg.evaluate(R('productos', 'c-1'))
        check(cajas.get('stock') == 7 and cajas.get('nota') == 'Llegaron rotas 2', 'no toca las otras hojas')
        st = await pg.evaluate("document.querySelector('#inc-p-001').closest('.sh-r').querySelector('.st').textContent")
        check(st == 'Sin contar', 'la hoja queda lista para cargar: ' + st)

        # ---------- Gerente en Stock Cajas ----------
        await click(pg, '#snav [data-go=h-cajas01]', 400)
        check('Llegaron rotas 2' in await pg.inner_text('#nw-p-c-1') and 'Gerente Munro' in await pg.inner_text('#nw-p-c-1'), 'observación con autor en Stock Cajas')
        await pg.screenshot(path=OUT + 'notas-3-cajas.png')
        await click(pg, '[data-act=borrar]', 250); await click(pg, '[data-act=borrar-ok]', 600)
        c1, c2 = await pg.evaluate(R('productos', 'c-1')), await pg.evaluate(R('productos', 'c-2'))
        check(c1.get('stock') is None and not c1.get('nota') and c1.get('sugerido') == 8 and c2.get('stock') is None and not c2.get('sinStock'), 'Borrar datos en Stock Cajas')
        check((await pg.evaluate(R('productos', 'p-005'))).get('stock') is None, 'p-005 ya estaba borrado por la hoja Stock')

        # ---------- Gerente en Conteo Fábrica ----------
        await click(pg, '#snav [data-go=fabrica]', 400)
        await pg.fill('#fl-f-001', '4'); await pg.fill('#ff-f-001', '2'); await pg.wait_for_timeout(100)
        await click(pg, '#sb-save', 300); await click(pg, '#sv-ok', 700)
        f1 = await pg.evaluate(R('fabrica', 'f-001'))
        check(f1.get('local') == 4 and f1.get('fabrica') == 2, 'planilla de fábrica guardada')
        await nota(pg, 'f', 'f-001', 'Falta confirmar con fábrica')
        check((await pg.evaluate(R('fabrica', 'f-001'))).get('nota') == 'Falta confirmar con fábrica', 'observación en Conteo Fábrica')
        await pg.screenshot(path=OUT + 'notas-4-fabrica.png')
        await click(pg, '[data-act=borrar]', 250); await click(pg, '[data-act=borrar-ok]', 600)
        f1 = await pg.evaluate(R('fabrica', 'f-001'))
        check(f1.get('local') is None and f1.get('fabrica') is None and not f1.get('nota') and f1.get('resaltar') is True and f1.get('bloque') == 1 and f1.get('nombre') == 'Insumo de prueba 001', 'Borrar datos en Conteo Fábrica deja los productos')
        check(await pg.input_value('#fl-f-001') == '' and await pg.inner_text('#ft-f-001') != '6', 'la planilla queda vacía')
        check(not errs, 'sin errores (gerente): ' + str(errs)); await ctx.close()

        # ---------- Gerente en el celular ----------
        ctx, pg, errs = await login(b, 'gerente.munro@example.com', {'width': 390, 'height': 844})
        await click(pg, '#snav [data-go=h-cajas01]', 400)
        await nota(pg, 'p', 'c-2', 'Se terminaron hoy, avisar a fábrica')
        check(await pg.evaluate("document.documentElement.scrollWidth <= innerWidth"), 'sin desplazamiento lateral en el celular')
        await pg.screenshot(path=OUT + 'notas-5-celular.png')
        await click(pg, '#snav [data-go=fabrica]', 400)
        await pg.screenshot(path=OUT + 'notas-6-fabrica-celular.png')
        check(not errs, 'sin errores (celular): ' + str(errs)); await ctx.close()

        # ---------- Dueña ve la observación; Solo ver no puede escribir ni borrar ----------
        ctx, pg, errs = await login(b, 'dueno@example.com', {'width': 1280, 'height': 900})
        await click(pg, '#snav [data-go=h-cajas01]', 400)
        check('Llegaron rotas 2' in await pg.inner_text('#nw-p-c-1'), 'la dueña ve la observación del gerente')
        check(await pg.locator('[data-act=borrar]').count() == 1, 'la dueña también puede borrar datos')
        await ctx.close()
        ctx, pg, errs = await login(b, 'lectura@example.com', {'width': 1280, 'height': 900})
        await click(pg, '#snav [data-go=h-cajas01]', 400)
        check(await pg.locator('#nw-p-c-1 span.nt').count() == 1 and await pg.locator('.addnote, [data-act=borrar], button.nt').count() == 0, 'Solo ver: lee la observación pero no escribe ni borra')
        check(not errs, 'sin errores (solo ver): ' + str(errs)); await ctx.close()
        await b.close()
    print('\nRESULTADO: ' + ('TODO OK' if not fails else f'{len(fails)} FALLAS'))
    sys.exit(1 if fails else 0)

asyncio.run(main())
