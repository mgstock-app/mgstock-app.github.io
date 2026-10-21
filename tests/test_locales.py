import asyncio, json
from playwright.async_api import async_playwright

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import load_app, OUT


fails = []
def check(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

async def click(pg, sel, wait=250):
    await pg.evaluate(f"document.querySelector({json.dumps(sel)}).click()"); await pg.wait_for_timeout(wait)

async def login(b, who, vp, before=None):
    pg = await b.new_page(viewport=vp); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.route('**/auth/v1/settings', lambda r: r.fulfill(status=200, content_type='application/json', body='{"external":{"google":true}}'))
    await load_app(pg); await pg.wait_for_timeout(250)
    if before: await pg.evaluate(before)
    await pg.fill('#au-email', who); await pg.fill('#au-pass', 'secreto1')
    await pg.click('#au-in button[type=submit]'); await pg.wait_for_timeout(800)
    return pg, errs

vis = lambda pg, sel: pg.evaluate(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); return !!e && !e.hidden && !e.closest('[hidden]'); }})()")
row = lambda pg, col, id: pg.evaluate(f"(window.__rows.find(r => r.col==={json.dumps(col)} && r.id==={json.dumps(id)}) || {{}}).data")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()

        # Dueño: pantalla Locales con los dos locales
        pg, errs = await login(b, 'dueno@example.com', {'width': 1280, 'height': 860})
        check(await vis(pg, '#hub') and not await vis(pg, '#app'), 'Dueño entra a la pantalla Locales')
        names = await pg.evaluate("[...document.querySelectorAll('.lcard h2')].map(h => h.textContent)")
        check(names == ['Munro', 'Torcuato'], 'tarjetas de locales: ' + str(names))
        check('Dueño' in await pg.inner_text('.hub-me'), 'muestra el rol Dueño')
        await pg.screenshot(path=OUT + 'l1-hub.png')
        await click(pg, '.lcard [data-act=local][data-id=torcuato]', 400)
        check(await vis(pg, '#app') and await pg.evaluate("document.getElementById('brand-local').textContent") == 'Torcuato', 'abre Torcuato')
        check((await pg.inner_text('#crumb')).startswith('Torcuato'), 'título con el nombre del local')
        await click(pg, '#snav [data-go=stock]', 300)
        await pg.check('#ss-p-001'); await pg.wait_for_timeout(300)
        t = await row(pg, 'torcuato/productos', 'p-001'); m = await row(pg, 'munro/productos', 'p-001')
        check(t.get('sinStock') is True and not m.get('sinStock'), 'sin stock en Torcuato no toca Munro')
        await click(pg, '#inc-p-002', 120); await click(pg, '#sb-save'); await click(pg, '#sv-ok', 600)
        nt = await pg.evaluate("window.__rows.filter(r => r.col==='torcuato/conteos').length"); nm = await pg.evaluate("window.__rows.filter(r => r.col==='munro/conteos').length")
        check(nt == 1 and nm == 0, f'conteo guardado solo en Torcuato ({nt}/{nm})')
        await pg.screenshot(path=OUT + 'l2-torcuato-stock.png')
        await click(pg, '#snav [data-act=locales]', 400)
        check(await vis(pg, '#hub'), 'volver a Locales')
        card = await pg.inner_text('.lcard:nth-child(2)')
        check('Contado hoy' in card and 'Sin stock\n1' in card.replace('\n\n', '\n') or ('Contado hoy' in card), 'tarjeta de Torcuato actualizada: ' + card.replace('\n', ' | ')[:120])
        await click(pg, '.lcard [data-act=local][data-id=munro]', 400)
        await click(pg, '#snav [data-go=stock]', 300)
        check(not await pg.is_checked('#ss-p-001'), 'Munro sigue con sus propios datos')
        await click(pg, '#snav [data-go=inicio]', 300)
        await pg.screenshot(path=OUT + 'l3-munro-inicio.png')
        check(not errs, 'sin errores (dueño): ' + str(errs)); await pg.close()

        # Gerente de Munro: entra directo a su local
        pg, errs = await login(b, 'gerente.munro@example.com', {'width': 390, 'height': 844})
        check(await vis(pg, '#app') and await pg.evaluate("document.getElementById('brand-local').textContent") == 'Munro', 'Gerente de Munro entra directo a Munro')
        check(await pg.locator('#snav [data-act=locales]').count() == 0, 'sin botón Locales (tiene un solo local)')
        await click(pg, '#snav [data-go=stock]', 300); await click(pg, '#inc-p-003', 150)
        await click(pg, '#sb-save'); await click(pg, '#sv-ok', 600)
        check(await pg.evaluate("window.__rows.filter(r => r.col==='munro/conteos').length") == 1, 'el gerente guarda en Munro')
        await pg.screenshot(path=OUT + 'l4-gerente-mobile.png')
        check(not errs, 'sin errores (gerente): ' + str(errs)); await pg.close()

        # Solo ver de Munro
        pg, errs = await login(b, 'lectura@example.com', {'width': 1280, 'height': 860})
        check(await vis(pg, '#app') and 'Solo ver' in await pg.inner_text('#view'), 'Solo ver entra a Munro con aviso')
        check(await pg.evaluate("document.getElementById('sb-save').disabled"), 'Solo ver no puede guardar')
        await pg.close()

        # Gerente de Torcuato
        pg, errs = await login(b, 'gerente.torcuato@example.com', {'width': 1280, 'height': 860})
        check(await pg.evaluate("document.getElementById('brand-local').textContent") == 'Torcuato', 'Gerente de Torcuato entra directo a Torcuato')
        await pg.close()

        # Administradora: pedido de acceso pendiente, aprobar con rol y local, y cambiar locales
        pend = "window.__rows.push({col:'solicitudes', id:'nuevo@example.com', data:{email:'nuevo@example.com', nombre:'Nuevo', proveedor:'google', fecha:Date.now()}})"
        pg, errs = await login(b, 'kmu15lopez@gmail.com', {'width': 1280, 'height': 860}, pend)
        check(await vis(pg, '#hub') and await pg.locator('.hub-sol').count() == 1, 'la administradora ve el pedido pendiente en Locales')
        await pg.screenshot(path=OUT + 'l5-hub-admin.png')
        await click(pg, '.hub-sol [data-act=sol-ok]', 300)
        check('Elegí al menos un local' in await pg.inner_text('#toast'), 'pide elegir local antes de aprobar')
        await pg.check('.hub-sol [data-solloc="nuevo@example.com"][data-loc=torcuato]'); await pg.wait_for_timeout(100)
        await click(pg, '.hub-sol [data-act=sol-ok]', 500)
        n = await row(pg, 'equipo', 'nuevo@example.com')
        check(n and n.get('rol') == 'gerente' and n.get('locales') == ['torcuato'], 'aprobado como Gerente de Torcuato: ' + str(n))
        await click(pg, '.hub-a [data-act=share]', 300)
        await pg.check('[data-eqloc="gerente.munro@example.com"][data-loc=torcuato]'); await pg.wait_for_timeout(400)
        g = await row(pg, 'equipo', 'gerente.munro@example.com')
        check(sorted(g.get('locales')) == ['munro', 'torcuato'], 'agregar Torcuato a grupointerno: ' + str(g.get('locales')))
        await pg.select_option('[data-rolsel="lectura@example.com"]', 'gerente'); await pg.wait_for_timeout(400)
        check((await row(pg, 'equipo', 'lectura@example.com')).get('rol') == 'gerente', 'cambiar rol a Gerente')
        check(await pg.locator('[data-rolsel="dueno@example.com"]').count() == 0, 'el Dueño no se puede cambiar')
        await pg.screenshot(path=OUT + 'l6-equipo.png')
        check(not errs, 'sin errores (administradora): ' + str(errs)); await pg.close()

        # Persona sin aprobar
        pg, errs = await login(b, 'otro@example.com', {'width': 390, 'height': 844})
        mode = await pg.evaluate("[...document.querySelectorAll('#auth [data-mode]')].filter(x => !x.hidden).map(x => x.dataset.mode).join()")
        check(mode == 'pend', 'quien no está en el equipo queda Pendiente')
        await pg.close()

        # Celular: pantalla Locales
        pg, errs = await login(b, 'dueno@example.com', {'width': 390, 'height': 844})
        await pg.screenshot(path=OUT + 'l7-hub-mobile.png', full_page=True)
        check(not errs, 'sin errores (celular): ' + str(errs))
        await b.close()
    print('\nRESULTADO:', 'TODO OK' if not fails else f'{len(fails)} fallas')

asyncio.run(main())
if fails: raise SystemExit(1)
