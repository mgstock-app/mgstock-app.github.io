"""Ingreso de mercadería: recorridos completos con archivos y datos ficticios (simulador, sin base real)."""
import asyncio, io, json, zipfile
from playwright.async_api import async_playwright

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import load_app, OUT

fails = []
def check(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

# Productos ficticios con nombres reales en las dos sucursales (los ids coinciden a propósito)
SETUP = """(() => {
  for (const L of ['munro', 'torcuato']){
    const P = id => window.__rows.find(r => r.col === L + '/productos' && r.id === id).data;
    const F = id => window.__rows.find(r => r.col === L + '/fabrica' && r.id === id).data;
    Object.assign(P('p-001'), {nombre: 'Jamón cocido', unidad: 'unidad', sugerido: 6});
    Object.assign(P('p-002'), {nombre: 'Muzzarella', unidad: 'unidad'});
    Object.assign(P('p-003'), {nombre: 'Pepperoni', unidad: 'unidad'});
    Object.assign(F('f-001'), {nombre: 'Pepperoni', local: 1, fabrica: 0});
    Object.assign(F('f-002'), {nombre: 'Manteca de Ajo', local: 2, fabrica: 0});
    window.__rows.push({col: L + '/hojas', id: 'h-cajas01', data: {nombre: 'Stock Cajas', tipo: 'lista', orden: 4}},
      {col: L + '/hojas', id: 'pedido', data: {oculta: true}},
      {col: L + '/productos', id: 'c-1', data: {nombre: 'Cajas grandes', cat: 'Cajas', unidad: 'unidad', stock: 3, sinStock: false, orden: 1, hoja: 'h-cajas01'}},
      {col: L + '/productos', id: 'c-2', data: {nombre: 'Cajas chicas', cat: 'Cajas', unidad: 'unidad', stock: 1, sinStock: false, orden: 2, hoja: 'h-cajas01'}});
  }
})()"""

CSV_A = 'Remito N° 0001-000123;;\nProducto;Cantidad;Unidad\nJamon cocido;2;\nMuzzarella;3,5;u\nCajas grandes;5;\nProducto desconocido;10;\nPepperoni;1 1/4;\nManteca de ajo;¾;\nMuzzarella;1;\nSalsa X;;\n'.encode('utf-8')

def xlsx(hojas):
    esc = lambda s: str(s).replace('&', '&amp;').replace('<', '&lt;')
    strs = []
    def si(s):
        if s not in strs: strs.append(s)
        return strs.index(s)
    col = lambda i: chr(65 + i)
    b = io.BytesIO(); z = zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED)
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types/>')
    z.writestr('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns:r="r"><sheets>' + ''.join(f'<sheet name="{esc(n)}" sheetId="{i+1}" r:id="rId{i+1}"/>' for i, (n, _) in enumerate(hojas)) + '</sheets></workbook>')
    z.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships>' + ''.join(f'<Relationship Id="rId{i+1}" Target="worksheets/sheet{i+1}.xml"/>' for i in range(len(hojas))) + '</Relationships>')
    for i, (_, filas) in enumerate(hojas):
        rows = ''
        for r, f in enumerate(filas):
            cells = ''.join((f'<c r="{col(c)}{r+1}"><v>{v}</v></c>' if isinstance(v, (int, float)) else f'<c r="{col(c)}{r+1}" t="s"><v>{si(v)}</v></c>') for c, v in enumerate(f) if v != '')
            rows += f'<row r="{r+1}">{cells}</row>'
        z.writestr(f'xl/worksheets/sheet{i+1}.xml', f'<?xml version="1.0"?><worksheet><sheetData>{rows}</sheetData></worksheet>')
    z.writestr('xl/sharedStrings.xml', '<?xml version="1.0"?><sst>' + ''.join(f'<si><t>{esc(s)}</t></si>' for s in strs) + '</sst>')
    z.close(); return b.getvalue()

XLSX_B = xlsx([('Conteo', [['Descripción', 'Cant.', 'U.M.'], ['Jamón cocido', 7, 'kg'], ['Cajas grandes', 0.5, ''], ['Cajas grandes', 2, '']]), ('Notas', [['nada']])])

def R(loc, col, id):
    return f"(window.__rows.find(r => r.col === '{loc}/{col}' && r.id === '{id}') || {{}}).data"

async def click(pg, sel, wait=250):
    await pg.evaluate(f"document.querySelector({json.dumps(sel)}).click()"); await pg.wait_for_timeout(wait)

async def login(b, email, size=None, mobile=False):
    ctx = await b.new_context(viewport=size or {'width': 1280, 'height': 900}, is_mobile=mobile, has_touch=mobile)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await load_app(pg); await pg.evaluate(SETUP)
    await pg.fill('#au-email', email); await pg.fill('#au-pass', 'secreto1')
    await pg.click('#au-in button[type=submit]'); await pg.wait_for_timeout(700)
    await pg.evaluate("(() => { const b = document.querySelector('#hub:not([hidden]) [data-act=local][data-id=munro]'); if (b) b.click(); })()"); await pg.wait_for_timeout(300)
    return ctx, pg, errs

async def cargar(pg, nombre, datos, mime):
    await pg.set_input_files('#ing-file', files=[{'name': nombre, 'mimeType': mime, 'buffer': datos}]); await pg.wait_for_timeout(700)

async def fila(pg, key):
    return await pg.evaluate(f"(() => {{ const r = document.getElementById('ing-g-{key}'); if (!r) return null; return {{on: r.querySelector('[data-ingon]').checked, det: r.children[3].innerText.replace(/\\n/g, ' '), cant: r.querySelector('[data-ingcant]').value, act: r.children[5].innerText.replace(/\\n/g, ' '), res: r.children[6].innerText.replace(/\\n/g, ' '), est: r.querySelector('.ing-e .st').textContent}}; }})()")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------- Gerente y Solo ver: no ven ni pueden usar Ingreso ----------
        for who in ['gerente.munro@example.com', 'lectura@example.com']:
            ctx, pg, errs = await login(b, who)
            check(await pg.locator('#snav [data-go=ingreso]').count() == 0, f'{who}: sin «Ingreso de mercadería» en el menú')
            await pg.evaluate("(() => { const x = document.createElement('button'); x.dataset.go = 'ingreso'; x.id = 'trucho'; document.body.appendChild(x); x.click(); })()"); await pg.wait_for_timeout(300)
            check(await pg.locator('#ing-loc-torcuato').count() == 0 and await pg.inner_text('#ttl') == 'Panel del local', f'{who}: la ruta directa vuelve a Inicio')
            res = await pg.evaluate("""(async () => { const c = window.supabase.createClient();
              const r = await c.rpc('importar_mercaderia', {p_local: 'munro', p_operacion: 'ingreso', p_items: [{col: 'productos', id: 'p-001', campo: 'stock', cantidad: 5, antes: null}], p_archivo: {}, p_clave: 'clave-gerente-01'});
              const h = await c.from('docs').select('id,data').eq('col', 'importaciones').range(0, 999);
              return {err: r.error && r.error.message, hist: (h.data || []).length}; })()""")
            check(res['err'] == 'MGS:sin_permiso' and (await pg.evaluate(R('munro', 'productos', 'p-001'))).get('stock') is None, f'{who}: la base rechaza la importación directa')
            check(res['hist'] == 0, f'{who}: no puede leer el historial de ingresos')
            await ctx.close()

        # ---------- Administradora: recorrido completo en Torcuato ----------
        ctx, pg, errs = await login(b, 'kmu15lopez@gmail.com')
        check(await pg.locator('#snav [data-go=ingreso]').count() == 1, 'la administradora ve «Ingreso de mercadería»')
        await click(pg, '#snav [data-go=ingreso]', 400)
        check(await pg.inner_text('#ttl') == 'Ingreso de mercadería' and await pg.locator('#ing-file').count() == 0, 'pide sucursal y operación antes del archivo')
        await click(pg, '#ing-loc-torcuato', 600); await click(pg, '#ing-op-ingreso', 300)
        check(await pg.locator('#ing-file').count() == 1, 'con sucursal y operación se habilita el archivo')
        await cargar(pg, 'remito-a.csv', CSV_A, 'text/csv')
        check(await pg.locator('#ing-vista').count() == 1, 'muestra la vista previa')
        j, m, c1, f2 = await fila(pg, 'p:p-001'), await fila(pg, 'p:p-002'), await fila(pg, 'p:c-1'), await fila(pg, 'f:f-002')
        check(j and j['on'] and j['det'].endswith('2') and j['res'].endswith('2') and j['est'] == 'Coincide', 'Jamón cocido: coincide, 2: ' + str(j))
        check(m and m['det'].endswith('4,5') and m['on'], 'Muzzarella repetida se suma (3,5 + 1 = 4,5): ' + str(m))
        check(c1 and c1['act'].endswith('3') and c1['res'].endswith('8'), 'Cajas grandes va a Stock Cajas: 3 + 5 = 8: ' + str(c1))
        check(f2 and f2['cant'] == '0,75' and f2['act'].endswith('2') and f2['res'].endswith('2,75'), 'Manteca de Ajo (¾) en Conteo Fábrica, Local: ' + str(f2))
        ign = await pg.inner_text('#ing-ign')
        check('Producto desconocido' in ign and 'Salsa X' in ign, 'productos desconocidos y sin cantidad quedan ignorados')
        pend = await pg.inner_text('#ing-pend')
        check('Pepperoni' in pend and await pg.evaluate("document.querySelector('#ing-ok').disabled"), 'Pepperoni está en dos hojas: pide elegir y bloquea Confirmar')
        await pg.screenshot(path=OUT + 'ing-1-vista.png', full_page=True)
        dec = await pg.evaluate("document.querySelector('#ing-pend select').id")
        await pg.select_option('#' + dec, 'f:f-001'); await pg.wait_for_timeout(250)
        pe = await fila(pg, 'f:f-001')
        check(pe and pe['cant'] == '1,25' and pe['res'].endswith('2,25'), 'Pepperoni a Conteo Fábrica (Local 1 + 1 1/4): ' + str(pe))
        await pg.select_option('[data-ingcampo="f:f-002"]', 'fabrica'); await pg.wait_for_timeout(250)
        f2 = await fila(pg, 'f:f-002')
        check(f2['act'].endswith('0') and f2['res'].endswith('0,75'), 'Manteca pasa a la columna Fábrica: ' + str(f2))
        check(await pg.evaluate("window.__log.filter(x => x[0] === 'importar').length") == 0, 'nada se guardó antes de confirmar')
        await click(pg, '#ing-ok', 700)
        check(await pg.locator('#ing-listo').count() == 1, 'confirma y muestra el resumen')
        t = {k: await pg.evaluate(R('torcuato', c, i)) for k, (c, i) in {'j': ('productos', 'p-001'), 'm': ('productos', 'p-002'), 'c1': ('productos', 'c-1'), 'pp': ('productos', 'p-003'), 'f1': ('fabrica', 'f-001'), 'f2': ('fabrica', 'f-002')}.items()}
        check(t['j']['stock'] == 2 and t['m']['stock'] == 4.5 and t['c1']['stock'] == 8 and t['pp'].get('stock') is None, 'Torcuato: Jamón 2, Muzzarella 4,5, Cajas 8, Pepperoni de Stock sin tocar')
        check(t['f1']['local'] == 2.25 and t['f1']['fabrica'] == 0 and t['f2']['fabrica'] == 0.75 and t['f2']['local'] == 2, 'Conteo Fábrica respeta Local y Fábrica')
        check(t['j'].get('sugerido') == 6 and t['j']['nombre'] == 'Jamón cocido', 'no toca sugerido ni nombres')
        mu = await pg.evaluate(R('munro', 'productos', 'p-001'))
        check(mu.get('stock') is None and (await pg.evaluate(R('munro', 'productos', 'c-1')))['stock'] == 3, 'Munro queda igual')
        h = await pg.evaluate("window.__rows.filter(r => r.col === 'importaciones').map(r => r.data)")
        check(len(h) == 1 and h[0]['local'] == 'torcuato' and h[0]['por'] == 'kmu15lopez@gmail.com' and len(h[0]['items']) == 5 and any('Producto desconocido' in x for x in h[0]['ignorados']), 'historial: usuario, sucursal, 5 productos e ignorados')
        prods = await pg.evaluate("window.__rows.filter(r => /\\/productos$/.test(r.col)).length")
        check(prods == 70, 'no crea productos: ' + str(prods))
        await pg.wait_for_timeout(300)
        check('Ingreso' in await pg.inner_text('#ing-hist') and 'remito-a.csv' in await pg.inner_text('#ing-hist'), 'el historial aparece en la pantalla')
        await click(pg, '#ing-hist [data-act=ing-hist]', 250)
        check('2,25' in await pg.inner_text('#ing-hist'), 'detalle del historial con antes y después')

        # ---------- Mismo archivo: aviso de duplicado ----------
        await click(pg, '[data-act=ing-otro]', 300)
        await cargar(pg, 'remito-a.csv', CSV_A, 'text/csv')
        await pg.select_option('#' + await pg.evaluate("document.querySelector('#ing-pend select').id"), label='No importar')
        await click(pg, '#ing-ok', 600)
        check('ya se importó' in (await pg.inner_text('#pn')).lower(), 'avisa que el archivo ya se importó')
        await click(pg, '#pn [data-act=close]', 300)
        check((await pg.evaluate(R('torcuato', 'productos', 'p-001')))['stock'] == 2, 'Cancelar el aviso no cambia nada')
        await click(pg, '#ing-ok', 600); await click(pg, '#pn [data-act=ing-forzar]', 700)
        check((await pg.evaluate(R('torcuato', 'productos', 'p-001')))['stock'] == 4 and (await pg.evaluate("window.__rows.filter(r => r.col === 'importaciones').length")) == 2, 'Importar igual suma de nuevo y queda registrado')

        # ---------- Conteo desde Excel: reemplaza, unidades y valores distintos ----------
        await click(pg, '[data-act=ing-otro]', 300); await click(pg, '#ing-op-conteo', 300)
        await cargar(pg, 'conteo-b.xlsx', XLSX_B, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        check(await pg.locator('#ing-hoja').count() == 1 and await pg.input_value('#ing-col-producto') == '0' and await pg.input_value('#ing-col-cantidad') == '1', 'Excel: elige hoja y detecta columnas')
        j, c1 = await fila(pg, 'p:p-001'), await fila(pg, 'p:c-1')
        check(j['est'] == 'Unidad distinta' and not j['on'] and j['res'].endswith('7'), 'Jamón en kg pero el producto es por unidad: no va tildado: ' + str(j))
        check(c1['est'] == 'Valores distintos' and not c1['on'] and c1['cant'] == '', 'Cajas grandes con 0,5 y 2: pide la cantidad: ' + str(c1))
        await pg.fill('[data-ingcant="p:c-1"]', '2'); await pg.press('[data-ingcant="p:c-1"]', 'Tab'); await pg.wait_for_timeout(250)
        check((await fila(pg, 'p:c-1'))['on'], 'al escribir la cantidad correcta queda tildado')
        await pg.evaluate("document.querySelector('[data-ingon=\"p:p-001\"]').click()"); await pg.wait_for_timeout(250)
        # Conflicto: alguien cambia Jamón mientras se revisa
        await pg.evaluate("(() => { const r = window.__rows.find(r => r.col === 'torcuato/productos' && r.id === 'p-001'); r.data.stock = 9; })()")
        await click(pg, '#ing-ok', 700)
        msg = await pg.inner_text('#ing-msg')
        check('cambiaron' in msg and (await pg.evaluate(R('torcuato', 'productos', 'c-1')))['stock'] == 13, 'conflicto: no guarda nada y avisa: ' + msg[:80])
        j = await fila(pg, 'p:p-001')
        check(j['act'].endswith('9'), 'la vista previa se actualiza con el valor nuevo: ' + str(j))
        await click(pg, '#ing-ok', 700)
        check((await pg.evaluate(R('torcuato', 'productos', 'p-001')))['stock'] == 7 and (await pg.evaluate(R('torcuato', 'productos', 'c-1')))['stock'] == 2, 'Conteo reemplaza: Jamón 7, Cajas 2')

        # ---------- Falta de internet: no suma dos veces ----------
        await click(pg, '[data-act=ing-otro]', 300); await click(pg, '#ing-op-ingreso', 300)
        csv = 'Producto;Cantidad\nCajas chicas;2\n'.encode('utf-8')
        await cargar(pg, 'red.csv', csv, 'text/csv')
        await pg.evaluate("window.__rpcFalla = 'despues'"); await click(pg, '#ing-ok', 700)
        check('No llegó la respuesta' in await pg.inner_text('#ing-msg'), 'sin respuesta: ofrece reintentar')
        await click(pg, '#ing-retry', 700)
        check((await pg.evaluate(R('torcuato', 'productos', 'c-2')))['stock'] == 3 and await pg.locator('#ing-listo').count() == 1, 'reintento con la misma clave: suma una sola vez (1 + 2 = 3)')
        await click(pg, '[data-act=ing-otro]', 300)
        await cargar(pg, 'red2.csv', 'Producto;Cantidad\nCajas chicas;1\n'.encode('utf-8'), 'text/csv')
        await pg.evaluate("window.__rpcFalla = 'antes'"); await click(pg, '#ing-ok', 700)
        check((await pg.evaluate(R('torcuato', 'productos', 'c-2')))['stock'] == 3, 'se cortó antes de guardar: no cambió nada')
        await click(pg, '#ing-retry', 700)
        check((await pg.evaluate(R('torcuato', 'productos', 'c-2')))['stock'] == 4, 'el reintento guarda una vez')

        # ---------- Cancelar y archivo sin coincidencias ----------
        await click(pg, '[data-act=ing-otro]', 300)
        n0 = await pg.evaluate("window.__log.filter(x => x[0] === 'importar').length")
        await cargar(pg, 'nada.csv', 'Producto;Cantidad\nTornillos;100\n'.encode('utf-8'), 'text/csv')
        check(await pg.locator('#ing-nada').count() == 1 and await pg.evaluate("document.querySelector('#ing-ok').disabled"), 'sin coincidencias: no deja confirmar')
        await click(pg, '[data-act=ing-cancelar]', 300)
        check(await pg.locator('#ing-file').count() == 1 and await pg.evaluate("window.__log.filter(x => x[0] === 'importar').length") == n0, 'Cancelar no guarda nada')
        await cargar(pg, 'foto.jpg', b'\xff\xd8\xff', 'image/jpeg')
        check('próxima etapa' in await pg.inner_text('#ing-err'), 'fotos todavía no: lo explica')
        check(not errs, 'sin errores (administradora): ' + str(errs)); await ctx.close()

        # ---------- Dueña en el celular ----------
        ctx, pg, errs = await login(b, 'dueno@example.com', {'width': 390, 'height': 844}, True)
        check(await pg.locator('#snav [data-go=ingreso]').count() == 1, 'la dueña ve «Ingreso de mercadería»')
        await click(pg, '#snav [data-go=ingreso]', 400); await click(pg, '#ing-loc-munro', 600); await click(pg, '#ing-op-ingreso', 300)
        await cargar(pg, 'remito-a.csv', CSV_A, 'text/csv')
        check(await pg.evaluate("document.documentElement.scrollWidth <= innerWidth"), 'celular: sin desplazamiento lateral')
        await pg.screenshot(path=OUT + 'ing-2-celular.png', full_page=True)
        await click(pg, '#ing-loc-torcuato', 700)
        check(await pg.locator('#ing-vista').count() == 1 and 'Torcuato' in await pg.inner_text('#ing-vista'), 'cambiar de sucursal recalcula con los productos de esa sucursal')
        check(not errs, 'sin errores (dueña): ' + str(errs)); await ctx.close()
        await b.close()
    print('\nRESULTADO: ' + ('TODO OK' if not fails else f'{len(fails)} FALLAS'))
    sys.exit(1 if fails else 0)

asyncio.run(main())
