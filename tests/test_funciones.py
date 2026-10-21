import asyncio, json
from playwright.async_api import async_playwright

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import load_app, OUT

FAKE_XLSX = """window.__xl = []; window.XLSX = {utils:{book_new:() => ({s:[]}), aoa_to_sheet:r => ({rows:r}), book_append_sheet:(wb, ws, n) => wb.s.push([n, ws.rows.length, ws.rows[0]])}, writeFile:(wb, f) => window.__xl.push([f, wb.s])};"""


fails = []
def check(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

async def click(pg, sel, wait=250):
    await pg.evaluate(f"document.querySelector({json.dumps(sel)}).click()"); await pg.wait_for_timeout(wait)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 860})
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/auth/v1/settings', lambda r: r.fulfill(status=200, content_type='application/json', body='{"external":{"google":true}}'))
        await load_app(pg); await pg.wait_for_timeout(300)
        await pg.fill('#au-email', 'kmu15lopez@gmail.com'); await pg.fill('#au-pass', 'secreto1')
        await pg.click('#au-in button[type=submit]'); await pg.wait_for_timeout(700)
        await pg.evaluate("(() => { const b = document.querySelector('#hub:not([hidden]) [data-act=local][data-id=munro]'); if (b) b.click(); })()"); await pg.wait_for_timeout(400)
        await pg.evaluate(FAKE_XLSX)

        # Mínimos y proveedores
        await click(pg, '#snav [data-go=stock]'); await click(pg, '#btn-ajustes'); await click(pg, '[data-act=aj-tab][data-tab=rapido]')
        check(await pg.locator('.qt-r').count() == 33, 'tabla rápida con 33 productos')
        await pg.fill('#qm-p-001', '5'); await pg.fill('#qp-p-001', 'Distribuidora Sur'); await pg.press('#qp-p-001', 'Tab'); await pg.wait_for_timeout(300)
        await pg.fill('#qp-p-002', 'Distribuidora Sur'); await pg.press('#qp-p-002', 'Tab'); await pg.wait_for_timeout(300)
        await pg.fill('#qm-p-007', '2,5'); await pg.fill('#qp-p-007', 'La Salsera'); await pg.press('#qp-p-007', 'Tab'); await pg.wait_for_timeout(300)
        r1 = await pg.evaluate("window.__rows.find(r => r.id==='p-001').data")
        check(r1.get('min') == 5 and r1.get('proveedor') == 'Distribuidora Sur', f"mínimo y proveedor guardados: {r1.get('min')} / {r1.get('proveedor')}")
        await pg.screenshot(path=OUT + 'x1-rapido.png')
        await click(pg, '[data-act=close]')

        # Sin stock + Pedido por proveedor
        await pg.check('#ss-p-001'); await pg.wait_for_timeout(250); await pg.check('#ss-p-007'); await pg.wait_for_timeout(250); await pg.check('#ss-p-020'); await pg.wait_for_timeout(250)
        await click(pg, '#snav [data-go=pedido]', 300)
        check(await pg.locator('#view .sh-r').count() == 3, 'pedido con 3 productos')
        await click(pg, '[data-act=ped-grp][data-g=prov]', 300)
        gs = await pg.evaluate("[...document.querySelectorAll('#view .sh-g b')].map(b => b.textContent)")
        check(gs == ['Distribuidora Sur', 'La Salsera', 'Sin proveedor'], 'grupos por proveedor: ' + str(gs))
        await pg.screenshot(path=OUT + 'x2-pedido-prov.png')
        await click(pg, '[data-act=copiar-prov][data-prov="La Salsera"]', 300)
        txt = await pg.evaluate("document.getElementById('cp-txt') ? document.getElementById('cp-txt').value : '(portapapeles)'")
        check('La Salsera' in txt or txt == '(portapapeles)', 'copiar pedido de un proveedor: ' + txt[:60].replace('\n', ' | '))
        if await pg.locator('#cp-txt').count(): await click(pg, '[data-act=close]')
        await click(pg, '[data-act=xls-pedido]', 300)
        xl = await pg.evaluate("window.__xl.slice(-1)[0]")
        check(xl and xl[0].startswith('pedido-munro-') and xl[0].endswith('.xlsx') and xl[1][0][1] == 4, 'Excel del pedido: ' + str(xl))

        # Conteos para el historial
        await click(pg, '#snav [data-go=stock]', 300)
        await click(pg, '#inc-p-003', 120); await click(pg, '#sb-save'); await click(pg, '#sv-ok', 600)
        await click(pg, '#snav [data-go=fabrica]', 300)
        hdr = await pg.inner_text('.xl-h .xh-f')
        check('ingreso mañana' in hdr and '/' in hdr, 'fecha en la columna Fábrica: ' + hdr.replace('\n', ' '))
        await pg.fill('#fl-f-001', '4'); await pg.wait_for_timeout(80); await click(pg, '#sb-save'); await click(pg, '#sv-ok', 600)
        await click(pg, '#snav [data-go=historial]', 300)
        check(await pg.locator('.hc').count() == 2, 'historial con 2 conteos')
        await pg.select_option('#h-hoja', 'fabrica'); await pg.wait_for_timeout(250)
        check(await pg.locator('.hc').count() == 1, 'filtro por hoja (Conteo Fábrica)')
        await pg.select_option('#h-per', 'ayer'); await pg.wait_for_timeout(250)
        check(await pg.locator('.hc').count() == 0, 'filtro Ayer sin conteos')
        await pg.select_option('#h-per', 'hoy'); await pg.wait_for_timeout(250)
        check(await pg.locator('.hc').count() == 1, 'filtro Hoy')
        await pg.screenshot(path=OUT + 'x3-historial.png')
        await click(pg, '[data-act=hist-clear]', 250)
        check(await pg.locator('.hc').count() == 2, 'sacar filtros')

        # Copia de seguridad
        await click(pg, '#snav [data-go=inicio]', 300); await click(pg, '[data-act=backup]', 300)
        xl = await pg.evaluate("window.__xl.slice(-1)[0]")
        names = [s[0] for s in xl[1]] if xl else []
        check(xl and xl[0].startswith('copia-de-seguridad') and names[:2] == ['Productos', 'Local + Fábrica'] and 'Equipo' in names and xl[1][0][1] == 34, 'copia de seguridad: ' + str([(s[0], s[1]) for s in xl[1]]))

        # Arrastrar en Ajustes (productos)
        await click(pg, '#snav [data-go=stock]', 300); await click(pg, '#btn-ajustes', 300)
        g1 = pg.locator('.alist [data-drag="p-001"]'); t3 = pg.locator('#ar-p-004')
        bx = await g1.bounding_box(); tb = await t3.bounding_box()
        await pg.mouse.move(bx['x'] + bx['width'] / 2, bx['y'] + bx['height'] / 2); await pg.mouse.down()
        for k in range(1, 11):
            await pg.mouse.move(bx['x'] + bx['width'] / 2, bx['y'] + (tb['y'] + tb['height'] * 0.75 - bx['y']) * k / 10); await pg.wait_for_timeout(15)
        await pg.mouse.up(); await pg.wait_for_timeout(700)
        ords = await pg.evaluate("Object.fromEntries(window.__rows.filter(r => r.col==='munro/productos' && ['p-001','p-002','p-003','p-004','p-005'].includes(r.id)).map(r => [r.id, r.data.orden]))")
        check(ords['p-002'] == 1 and ords['p-001'] == 4, 'arrastrar p-002 debajo del 4°: ' + str(ords))
        await click(pg, '[data-act=close]')
        # Arrastrar en Conteo Fábrica: el 1° pasa al bloque 2
        await click(pg, '#snav [data-go=fabrica]', 300); await click(pg, '#btn-ajustes', 300)
        g = pg.locator('[data-drag="f-001"]'); dest = pg.locator('#ar-f-006')
        bx = await g.bounding_box(); tb = await dest.bounding_box()
        await pg.mouse.move(bx['x'] + 10, bx['y'] + 10); await pg.mouse.down()
        for k in range(1, 13):
            await pg.mouse.move(bx['x'] + 10, bx['y'] + 10 + (tb['y'] + tb['height'] * 0.75 - bx['y'] - 10) * k / 12); await pg.wait_for_timeout(15)
        await pg.mouse.up(); await pg.wait_for_timeout(900)
        f1 = await pg.evaluate("window.__rows.find(r => r.id==='f-001').data")
        check(f1['bloque'] == 2, f"f-001 pasó al bloque {f1['bloque']} (orden {f1['orden']})")
        await click(pg, '[data-act=close]')

        # Sin internet: el conteo queda en espera y se guarda solo al volver
        await click(pg, '#snav [data-go=stock]', 300)
        n0 = await pg.evaluate("window.__rows.filter(r => r.col==='munro/conteos').length")
        await ctx.set_offline(True); await pg.wait_for_timeout(300)
        check('Sin internet' in await pg.inner_text('#view'), 'aviso sin internet')
        await click(pg, '#inc-p-005', 120); await click(pg, '#sb-save'); await click(pg, '#sv-ok', 400)
        check('vuelva internet' in await pg.inner_text('#sb-main'), 'conteo en espera: ' + await pg.inner_text('#sb-main'))
        await pg.screenshot(path=OUT + 'x4-offline.png')
        await ctx.set_offline(False); await pg.wait_for_timeout(1500)
        n1 = await pg.evaluate("window.__rows.filter(r => r.col==='munro/conteos').length")
        check(n1 == n0 + 1, f'se guardó solo al volver internet ({n0} → {n1})')

        # Imprimir (vista de impresión) e instalar
        await click(pg, '#snav [data-go=fabrica]', 300)
        await pg.emulate_media(media='print'); await pg.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        await pg.screenshot(path=OUT + 'x5-print.png', full_page=True)
        await pg.evaluate("window.dispatchEvent(new Event('afterprint'))"); await pg.emulate_media(media='screen')
        check(await pg.is_visible('#inst'), 'botón Instalar en el celular')
        await click(pg, '#inst', 300)
        check('Agregar a pantalla de inicio' in await pg.inner_text('#pn'), 'instrucciones para instalar')
        await click(pg, '[data-act=close]')
        check(not errs, 'sin errores de JS: ' + str(errs))
        await ctx.close()

        # Celular: botones grandes
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await load_app(pg); await pg.wait_for_timeout(300)
        await pg.fill('#au-email', 'gerente.munro@example.com'); await pg.fill('#au-pass', 'secreto1')
        await pg.click('#au-in button[type=submit]'); await pg.wait_for_timeout(700)
        await pg.evaluate("(() => { const b = document.querySelector('#hub:not([hidden]) [data-act=local][data-id=munro]'); if (b) b.click(); })()"); await pg.wait_for_timeout(400)
        await click(pg, '#snav [data-go=stock]', 300)
        bb = await pg.locator('#inc-p-001').bounding_box()
        check(bb['height'] >= 44 and bb['width'] >= 50, f"botón + en celular {bb['width']:.0f}x{bb['height']:.0f}")
        await pg.screenshot(path=OUT + 'x6-mobile-stock.png')
        check(not errs, 'sin errores de JS (celular): ' + str(errs))
        await b.close()
    print('\nRESULTADO:', 'TODO OK' if not fails else f'{len(fails)} fallas')

asyncio.run(main())
if fails: raise SystemExit(1)
