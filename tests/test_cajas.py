"""Hoja de lista propia (Stock Cajas): productos y categorías propios, y stock sugerido que activa la dueña."""
import asyncio, json
from playwright.async_api import async_playwright

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import load_app, OUT

fails = []
def check(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

HOJA = "{col: 'munro/hojas', id: 'h-cajas01', data: {nombre: 'Stock Cajas', tipo: 'lista', orden: 4%s}}"
SETUP = "(() => { window.__rows.push(%s, {col: 'munro/hojas', id: 'pedido', data: {oculta: true}}); %s })()"

async def click(pg, sel, wait=200):
    await pg.evaluate(f"document.querySelector({json.dumps(sel)}).click()"); await pg.wait_for_timeout(wait)

async def rows(pg):
    return await pg.evaluate("window.__rows.filter(r => r.col === 'munro/productos' && r.data.hoja === 'h-cajas01').map(r => ({id: r.id, ...r.data}))")

async def head(pg):
    return (await pg.inner_text('.sheet.k-stock .sh-h')).upper()

async def login(b, email, size, setup):
    ctx = await b.new_context(viewport=size)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await load_app(pg)
    await pg.evaluate(setup)
    await pg.evaluate("localStorage.setItem('spm-lastcat', JSON.stringify('Fiambres'))")
    await pg.fill('#au-email', email); await pg.fill('#au-pass', 'secreto1')
    await pg.click('#au-in button[type=submit]'); await pg.wait_for_timeout(700)
    await pg.evaluate("(() => { const b = document.querySelector('#hub:not([hidden]) [data-act=local][data-id=munro]'); if (b) b.click(); })()"); await pg.wait_for_timeout(300)
    return ctx, pg, errs

async def add(pg, nombre, cat, stock):
    await pg.fill('#aa-nombre', nombre); await pg.fill('#aa-cat', cat); await pg.fill('#aa-stock', stock)
    await click(pg, '#aa-form button[type=submit]', 350)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # Administradora: hoja nueva vacía, productos y categorías propios
        ctx, pg, errs = await login(b, 'kmu15lopez@gmail.com', {'width': 1280, 'height': 860}, SETUP % (HOJA % '', ''))
        menu = await pg.evaluate("[...document.querySelectorAll('#snav [data-go]')].map(b => b.querySelector('.nl').textContent)")
        check('Stock Cajas' in menu and 'Pedido' not in menu, 'menú con Stock Cajas y sin Pedido: ' + str(menu))
        check(await pg.locator('#view .kpis.k3').count() == 1 and await pg.locator('#view [data-go=pedido]').count() == 0, 'Inicio sin acceso a Pedido (quitada del menú)')
        check(await pg.locator('#view [data-go=conteo]').count() >= 1, 'Inicio con Nuevo conteo (Conteo en el menú)')
        await click(pg, '#snav [data-go=h-cajas01]', 400)
        check(await pg.locator('#sg-tg[aria-checked=false]').count() == 1, 'interruptor Stock sugerido apagado en la hoja nueva')
        await click(pg, '[data-act=aj-open][data-tab=agregar]', 300)
        check(await pg.input_value('#aa-cat') == '', 'no trae la categoría de otra hoja: ' + repr(await pg.input_value('#aa-cat')))
        check(await pg.locator('#dl-cats option').count() == 0, 'sin categorías de otras hojas')
        await add(pg, 'Caja pizza grande', 'Cajas', '10')
        await add(pg, 'Caja empanadas', 'Cajas', '3')
        await add(pg, 'Bolsa papel', 'Bolsas', '5')
        r = await rows(pg)
        check(sorted(x['nombre'] for x in r) == ['Bolsa papel', 'Caja empanadas', 'Caja pizza grande'], 'productos guardados en la hoja: ' + str([x['nombre'] for x in r]))
        base = await pg.evaluate("window.__rows.filter(r => r.col === 'munro/productos' && !r.data.hoja).length")
        check(base == 33, 'la hoja Stock no cambia: ' + str(base))
        await click(pg, '[data-act=aj-tab][data-tab=categorias]', 250)
        cats = await pg.evaluate("[...document.querySelectorAll('#aj-body .ar b')].map(b => b.textContent)")
        check(sorted(cats) == ['Bolsas', 'Cajas'], 'categorías propias: ' + str(cats))
        check('categoría nueva' in await pg.inner_text('#aj-body'), 'explica cómo crear una categoría')
        # Modificar y eliminar
        ide = next(x['id'] for x in r if x['nombre'] == 'Caja empanadas')
        idb = next(x['id'] for x in r if x['nombre'] == 'Bolsa papel')
        await click(pg, '[data-act=aj-tab][data-tab=productos]', 250)
        await click(pg, f'[data-act=aj-edit][data-id="{ide}"]', 250)
        await pg.fill('#ae-nombre', 'Caja empanadas x12'); await pg.fill('#ae-cat', 'Cajas chicas')
        await click(pg, '#ae-form button[type=submit]', 350)
        e = next(x for x in await rows(pg) if x['id'] == ide)
        check(e['nombre'] == 'Caja empanadas x12' and e['cat'] == 'Cajas chicas', 'modificar producto y categoría nueva: ' + e['nombre'] + ' / ' + e['cat'])
        await click(pg, f'[data-act=aj-del][data-id="{idb}"]', 200); await click(pg, f'[data-act=aj-del-ok][data-id="{idb}"]', 350)
        check(all(x['id'] != idb for x in await rows(pg)), 'eliminar producto')
        await click(pg, '#pn [data-act=close]', 300)
        h = await head(pg)
        check('SUGERIDO' not in h and 'LOCAL' in h and await pg.locator('.sheet.k-stock.nosug').count() == 1, 'sin columna Sugerido: ' + h.replace('\n', ' | '))
        f = await pg.evaluate("[...document.querySelectorAll('.statf button')].map(b => b.dataset.f)")
        check(f == ['todos', 'sin', 'bajo', 'nc'], 'filtros de siempre: ' + str(f))
        await pg.screenshot(path=OUT + 'cajas-1-sin-sugerido.png')
        # Activar el stock sugerido
        await click(pg, '#sg-tg', 400)
        hoja = await pg.evaluate("window.__rows.find(r => r.col === 'munro/hojas' && r.id === 'h-cajas01').data")
        check(hoja.get('sugerido') is True and hoja.get('nombre') == 'Stock Cajas' and hoja.get('tipo') == 'lista', 'guarda la hoja con el sugerido activado: ' + str(hoja))
        check('SUGERIDO' in await head(pg) and await pg.locator('#sg-tg[aria-checked=true]').count() == 1, 'aparece la columna Sugerido')
        idp = next(x['id'] for x in r if x['nombre'] == 'Caja pizza grande')
        await pg.fill(f'#sg-{idp}', '8'); await pg.press(f'#sg-{idp}', 'Tab'); await pg.wait_for_timeout(350)
        chip = await pg.evaluate(f"document.querySelector('#inc-{idp}').closest('.sh-r').querySelector('.st').textContent")
        check(chip == 'Exceso de stock', 'estado con sugerido 8 y local 10: ' + chip)
        await pg.screenshot(path=OUT + 'cajas-2-con-sugerido.png')
        await click(pg, '#snav [data-go=stock]', 400)
        check('SUGERIDO' in await head(pg), 'la hoja Stock Sugerido sigue con su columna')
        check(not errs, 'sin errores (administradora): ' + str(errs)); await ctx.close()

        # Gerente con sugerido activado: ve estados, no el interruptor, y carga el stock
        prods = "window.__rows.push({col: 'munro/productos', id: 'c-1', data: {nombre: 'Caja pizza grande', cat: 'Cajas', unidad: 'unidad', stock: 3, sinStock: false, sugerido: 8, orden: 1, hoja: 'h-cajas01'}});"
        ctx, pg, errs = await login(b, 'gerente.munro@example.com', {'width': 390, 'height': 844}, SETUP % (HOJA % ', sugerido: true', prods))
        await click(pg, '#snav [data-go=h-cajas01]', 400)
        check(await pg.locator('#sg-tg, .sg-in, .sg-e').count() == 0, 'el gerente no ve el interruptor ni edita el sugerido')
        chip = await pg.evaluate("document.querySelector('#inc-c-1').closest('.sh-r').querySelector('.st').textContent")
        check(chip == 'Poco stock', 'el gerente ve el estado: ' + chip)
        await pg.screenshot(path=OUT + 'cajas-3-gerente-celular.png')
        for _ in range(3): await click(pg, '#inc-c-1', 120)
        await click(pg, '#sb-save', 300); await click(pg, '#sv-ok', 600)
        st = await pg.evaluate("window.__rows.find(r => r.col === 'munro/productos' && r.id === 'c-1').data")
        check(st.get('stock') == 6 and st.get('sugerido') == 8, 'el gerente guarda el stock del local: ' + str(st.get('stock')))
        chip = await pg.evaluate("document.querySelector('#inc-c-1').closest('.sh-r').querySelector('.st').textContent")
        check(chip == 'Stock ideal', 'estado después de guardar: ' + chip)
        sc = await pg.evaluate("document.documentElement.scrollWidth <= innerWidth")
        check(sc, 'sin desplazamiento lateral en el celular')
        check(not errs, 'sin errores (gerente): ' + str(errs)); await ctx.close()

        # Gerente con sugerido desactivado: solo carga el stock
        oculta = "window.__rows.push({col: 'munro/hojas', id: 'conteo', data: {oculta: true}});"
        ctx, pg, errs = await login(b, 'gerente.munro@example.com', {'width': 390, 'height': 844}, SETUP % (HOJA % ', sugerido: false', prods + oculta))
        cg = await pg.evaluate("[...document.querySelectorAll('#view [data-go=stock]')].map(b => b.textContent.trim())")
        check(await pg.locator('#view [data-go=conteo], #view [data-go=pedido]').count() == 0 and 'Cargar stock' in cg, 'Inicio lleva a Stock si Conteo está quitada: ' + str(cg))
        await pg.screenshot(path=OUT + 'cajas-7-inicio-celular.png')
        await click(pg, '#snav [data-go=h-cajas01]', 400)
        check(await pg.locator('.r-sug').count() == 0 and await pg.locator('#inc-c-1:not([disabled])').count() == 1, 'sin sugerido: el gerente solo carga el stock')
        await pg.screenshot(path=OUT + 'cajas-4-gerente-sin-sugerido.png')
        check(not errs, 'sin errores (gerente, sin sugerido): ' + str(errs)); await ctx.close()
        await b.close()
    print('\nRESULTADO: ' + ('TODO OK' if not fails else f'{len(fails)} FALLAS'))
    sys.exit(1 if fails else 0)

asyncio.run(main())
