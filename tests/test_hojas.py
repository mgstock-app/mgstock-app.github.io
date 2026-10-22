import asyncio, json, sys
from playwright.async_api import async_playwright

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import load_app, OUT, solo_este_local


fails = []
def check(cond, msg):
    print(('OK   ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

async def login(b, who, vp):
    pg = await b.new_page(viewport=vp)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.route('**/auth/v1/settings', lambda r: r.fulfill(status=200, content_type='application/json', body='{"external":{"google":true,"email":true}}'))
    await load_app(pg); await solo_este_local(pg); await pg.wait_for_timeout(300)
    await pg.fill('#au-email', who); await pg.fill('#au-pass', 'secreto1')
    await pg.click('#au-in button[type=submit]'); await pg.wait_for_timeout(700)
    await pg.evaluate("(() => { const b = document.querySelector('#hub:not([hidden]) [data-act=local][data-id=munro]'); if (b) b.click(); })()"); await pg.wait_for_timeout(400)
    return pg, errs

async def nav(pg):
    return await pg.evaluate("[...document.querySelectorAll('#snav [data-go]:not([data-go=ingreso])')].map(b => b.querySelector('.nl').textContent)")

async def click(pg, sel, wait=250):
    await pg.evaluate(f"document.querySelector({json.dumps(sel)}).click()"); await pg.wait_for_timeout(wait)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg, errs = await login(b, 'kmu15lopez@gmail.com', {'width': 1280, 'height': 860})
        txt = await pg.inner_text('#snav')
        check('H1' not in txt and 'H5' not in txt, 'sin etiquetas H1–H5 en el menú')
        check(await nav(pg) == ['Inicio', 'Stock', 'Conteo', 'Conteo Fábrica', 'Pedido', 'Historial'], 'menú inicial: ' + str(await nav(pg)))
        check(await pg.locator('#snav [data-act=hojas]').count() == 1 and await pg.locator('#snav [data-act=hoja-new]').count() == 1, 'botones Editar y Agregar hoja en el menú')
        await pg.screenshot(path=OUT + 'h1-desktop-inicio.png')

        # Editar: renombrar Pedido
        await click(pg, '#snav [data-act=hojas]')
        check(await pg.locator('#hj-list .hj-r').count() == 5, 'panel con 5 hojas')
        await pg.screenshot(path=OUT + 'h2-panel.png')
        await click(pg, '[data-act=hoja-edit][data-id=pedido]')
        await pg.fill('#hr-nombre', 'Pedidos al proveedor'); await pg.press('#hr-nombre', 'Enter'); await pg.wait_for_timeout(300)
        check('Pedidos al proveedor' in await nav(pg), 'renombrar Pedido')
        # Subir Historial
        await click(pg, '[data-act=hoja-up][data-id=historial]', 400)
        n = await nav(pg); check(n.index('Historial') < n.index('Pedidos al proveedor'), 'subir Historial: ' + str(n))
        # Quitar Conteo del menú y volver a mostrar
        await click(pg, '[data-act=hoja-del][data-id=conteo]')
        await click(pg, '[data-act=hoja-del-ok][data-id=conteo]', 400)
        check('Conteo' not in await nav(pg), 'quitar Conteo del menú')
        check(await pg.locator('#hj-oc [data-act=hoja-show]').count() == 1, 'Conteo aparece en Quitadas del menú')
        await click(pg, '#hj-oc [data-act=hoja-show]', 400)
        check((await nav(pg))[-1] == 'Conteo', 'volver a mostrar Conteo (queda al final)')

        # Crear hoja tipo lista vacía
        await click(pg, '[data-act=hoja-add]')
        await pg.fill('#hn-nombre', 'Bebidas')
        await pg.screenshot(path=OUT + 'h3-nueva.png')
        await click(pg, '#hn-ok', 600)
        view = await pg.evaluate("document.getElementById('ttl').textContent")
        check(view == 'Bebidas', 'crear hoja Bebidas y abrirla')
        check('Todavía no hay productos' in await pg.inner_text('#view'), 'hoja nueva vacía')
        # Agregar producto desde Ajustes
        await click(pg, '#view [data-act=aj-open][data-tab=agregar]')
        await pg.fill('#aa-nombre', 'Coca Cola 2,25L'); await pg.fill('#aa-cat', 'Gaseosas'); await pg.fill('#aa-stock', '4')
        await click(pg, '#aa-form button[type=submit]', 400)
        await pg.fill('#aa-nombre', 'Agua Mineral 1,5L'); await pg.fill('#aa-cat', 'Aguas')
        await click(pg, '#aa-form button[type=submit]', 400)
        await click(pg, '[data-act=close]')
        rows = await pg.evaluate("window.__rows.filter(r => r.col==='munro/productos' && r.data.hoja).map(r => r.data.nombre)")
        check(sorted(rows) == ['Agua Mineral 1,5L', 'Coca Cola 2,25L'], 'productos guardados con la hoja: ' + str(rows))
        check(await pg.locator('#view .sh-r').count() == 2, 'la hoja muestra solo sus 2 productos')
        # Contar y guardar
        pid = await pg.evaluate("window.__rows.find(r => r.col==='munro/productos' && r.data.nombre==='Coca Cola 2,25L').id")
        await click(pg, f'#inc-{pid}', 150); await click(pg, f'#inc-{pid}', 150)
        check('2 cambio' in await pg.inner_text('#sb-main') or '1 cambio' in await pg.inner_text('#sb-main'), 'barra de guardar con cambios: ' + await pg.inner_text('#sb-main'))
        await click(pg, '#sb-save'); await click(pg, '#sv-ok', 600)
        c = await pg.evaluate("window.__rows.filter(r => r.col==='munro/conteos').map(r => r.data)")
        check(len(c) == 1 and c[0]['hoja'].startswith('h-') and c[0]['nombreHoja'] == 'Bebidas' and c[0]['total'] == 2, 'conteo guardado de Bebidas')
        st = await pg.evaluate(f"window.__rows.find(r => r.id==={json.dumps(pid)}).data.stock")
        check(st == 6, 'stock de Coca = 6')
        # Stock principal sin tocar
        await click(pg, '#snav [data-go=stock]', 300)
        check(await pg.locator('#view .sh-r').count() == 33, 'Stock sigue con sus 33 productos')

        # Crear hoja Local + Fábrica copiando de Conteo Fábrica
        await click(pg, '#snav [data-act=hoja-new]')
        await pg.fill('#hn-nombre', 'Fábrica Villa Martelli')
        await pg.click('.tpick label:has([value=fabrica])'); await pg.wait_for_timeout(100)
        opts = await pg.evaluate("[...document.querySelectorAll('#hn-copia option')].map(o => o.textContent)")
        check(any('Conteo Fábrica (27)' in o for o in opts), 'opción copiar de Conteo Fábrica: ' + str(opts))
        await pg.select_option('#hn-copia', 'fabrica')
        await click(pg, '#hn-ok', 900)
        check(await pg.evaluate("document.getElementById('ttl').textContent") == 'Fábrica Villa Martelli', 'abre la hoja Fábrica nueva')
        nf = await pg.evaluate("window.__rows.filter(r => r.col==='munro/fabrica' && r.data.hoja).length")
        check(nf == 27, f'27 productos copiados ({nf})')
        fid = await pg.evaluate("window.__rows.find(r => r.col==='munro/fabrica' && r.data.hoja && r.data.nombre).id")
        await pg.fill(f'#fl-{fid}', '3'); await pg.fill(f'#ff-{fid}', '2,5'); await pg.wait_for_timeout(100)
        check(await pg.inner_text(f'#ft-{fid}') == '5,5', 'total 3 + 2,5 = 5,5')
        await click(pg, '#sb-save'); await click(pg, '#sv-ok', 600)
        cf = await pg.evaluate("window.__rows.filter(r => r.col==='munro/conteos' && r.data.tipo==='fabrica').map(r => r.data.nombreHoja)")
        check(cf == ['Fábrica Villa Martelli'], 'conteo de la hoja Fábrica nueva: ' + str(cf))
        orig = await pg.evaluate("window.__rows.filter(r => r.col==='munro/fabrica' && !r.data.hoja && r.data.local != null).length")
        check(orig == 0, 'Conteo Fábrica original sin cambios')
        await pg.screenshot(path=OUT + 'h4-fabrica-nueva.png')

        # Historial muestra los nombres
        await click(pg, '#snav [data-go=historial]', 300)
        ht = await pg.inner_text('#view')
        check('Fábrica Villa Martelli de las' in ht and 'desde Bebidas' in ht, 'historial con nombres de hoja')
        await click(pg, '#snav [data-go=inicio]', 300)
        await pg.screenshot(path=OUT + 'h5-inicio-hojas.png', full_page=True)

        # Borrar hoja Bebidas
        bid = await pg.evaluate("window.__rows.find(r => r.col==='munro/hojas' && r.data.nombre==='Bebidas').id")
        await click(pg, '#snav [data-act=hojas]')
        await click(pg, f'[data-act=hoja-del][data-id="{bid}"]')
        check('2 productos' in await pg.inner_text('#hj-list'), 'aviso de borrar menciona 2 productos')
        await click(pg, f'[data-act=hoja-del-ok][data-id="{bid}"]', 600)
        left = await pg.evaluate(f"window.__rows.filter(r => (r.col==='munro/productos' && r.data.hoja==={json.dumps(bid)}) || (r.col==='munro/hojas' && r.id==={json.dumps(bid)})).length")
        check(left == 0 and 'Bebidas' not in await nav(pg), 'hoja Bebidas borrada con sus productos')
        await click(pg, '[data-act=close]')
        print('menú final:', await nav(pg))
        check(not errs, 'sin errores de JS (creadora): ' + str(errs))
        rows_state = await pg.evaluate("window.__rows")
        await pg.close()

        # Editor: ve las hojas y puede editarlas
        pg, errs = await login(b, 'gerente.munro@example.com', {'width': 390, 'height': 844})
        await pg.evaluate("rows => { window.__rows.length = 0; rows.forEach(r => window.__rows.push(r)); }", rows_state)
        await pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); await pg.wait_for_timeout(500)
        n = await nav(pg)
        check('Fábrica Villa Martelli' in n and 'Pedidos al proveedor' in n, 'el editor ve las mismas hojas: ' + str(n))
        check(await pg.locator('#snav [data-act=hojas]').count() == 1, 'el editor tiene Editar hojas')
        await click(pg, '[data-act=menu-open]', 300)
        await pg.screenshot(path=OUT + 'h6-mobile-menu.png')
        await click(pg, '#snav [data-act=hojas]', 300)
        await pg.screenshot(path=OUT + 'h7-mobile-panel.png')
        check(not errs, 'sin errores de JS (editor): ' + str(errs))
        await pg.close()

        # Solo ver: sin botones de edición
        pg, errs = await login(b, 'lectura@example.com', {'width': 1280, 'height': 860})
        await pg.wait_for_timeout(300)
        check(await pg.locator('#snav [data-act=hojas]').count() == 0 and await pg.locator('#snav [data-act=hoja-new]').count() == 0, 'Solo ver no tiene Editar ni Agregar hoja')
        check(not errs, 'sin errores de JS (solo ver): ' + str(errs))
        await b.close()
    print('\nRESULTADO:', 'TODO OK' if not fails else f'{len(fails)} fallas')

asyncio.run(main())
if fails: raise SystemExit(1)
