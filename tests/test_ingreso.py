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
    Object.assign(P('p-001'), {nombre: 'Jamón cocido', unidad: 'unidad'});
    Object.assign(F('f-001'), {nombre: 'Muzzarella', local: 4, fabrica: 0});
    const it = (id, hoja, nombre, local, fabrica, orden) => ({col: L + '/fabrica', id, data: {nombre, bloque: 1, orden, local, fabrica, sinStock: false, resaltar: false, hoja}});
    window.__rows.push({col: L + '/hojas', id: 'h-ing01', data: {nombre: 'Stock', tipo: 'ingreso', orden: 5}},
      {col: L + '/hojas', id: 'h-ing02', data: {nombre: 'Depósito', tipo: 'ingreso', orden: 6}},
      {col: L + '/hojas', id: 'pedido', data: {oculta: true}},
      it('i-1', 'h-ing01', 'Jamón cocido', 1, null, 1), it('i-2', 'h-ing01', 'Muzzarella', null, null, 2), it('i-3', 'h-ing01', 'Cajas grandes', 3, 1, 3),
      it('i-4', 'h-ing01', 'Pepperoni', null, null, 4), it('i-7', 'h-ing01', 'Cajas chicas', 0, 1, 5),
      it('i-5', 'h-ing02', 'Pepperoni', 2, null, 1), it('i-6', 'h-ing02', 'Manteca de Ajo', 2, 0, 2));
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
        F = lambda loc, i: R(loc, 'fabrica', i)
        # ---------- Gerente y Solo ver: no ven ni pueden usar Ingreso ----------
        for who in ['gerente.munro@example.com', 'lectura@example.com']:
            ctx, pg, errs = await login(b, who)
            check(await pg.locator('#snav [data-go=ingreso]').count() == 0, f'{who}: sin «Ingreso de mercadería» en el menú')
            await pg.evaluate("(() => { const x = document.createElement('button'); x.dataset.go = 'ingreso'; x.id = 'trucho'; document.body.appendChild(x); x.click(); })()"); await pg.wait_for_timeout(300)
            check(await pg.locator('#ing-loc-torcuato').count() == 0 and await pg.inner_text('#ttl') == 'Panel del local', f'{who}: la ruta directa vuelve a Inicio')
            res = await pg.evaluate("""(async () => { const c = window.supabase.createClient();
              const r = await c.rpc('importar_mercaderia', {p_local: 'munro', p_operacion: 'ingreso', p_items: [{col: 'fabrica', id: 'i-1', campo: 'fabrica', cantidad: 5, antes: null}], p_archivo: {}, p_clave: 'clave-gerente-01'});
              const h = await c.from('docs').select('id,data').eq('col', 'importaciones').range(0, 999);
              return {err: r.error && r.error.message, hist: (h.data || []).length}; })()""")
            check(res['err'] == 'MGS:sin_permiso' and (await pg.evaluate(F('munro', 'i-1'))).get('fabrica') is None, f'{who}: la base rechaza la importación directa')
            check(res['hist'] == 0, f'{who}: no puede leer el historial de ingresos')
            if who.startswith('gerente'):
                await click(pg, '#snav [data-go=h-ing01]', 400)
                check(await pg.locator('#ff-i-1:not([disabled])').count() == 1 and await pg.locator('#fl-i-1:not([disabled])').count() == 1, 'gerente: puede cargar Local e Ingreso a mano')
                await pg.fill('#ff-i-1', '2,5'); await pg.wait_for_timeout(150)
                await click(pg, '#sb-save', 300); await click(pg, '#sv-ok', 700)
                fi = await pg.evaluate(F('munro', 'i-1'))
                check(fi.get('fabrica') == 2.5 and fi.get('local') == 1, 'gerente: el Ingreso cargado a mano se guarda (2,5) y Local queda igual: ' + str(fi))
                await pg.fill('#ff-i-1', ''); await pg.wait_for_timeout(150); await click(pg, '#sb-save', 300); await click(pg, '#sv-ok', 700)
                check('Stock real' in await pg.inner_text('.xl-h') and await pg.locator('.bar [data-go=ingreso]').count() == 0, 'gerente: ve «Stock real» y no tiene «Ingresar remito»')
            await ctx.close()

        # ---------- Administradora: recorrido completo en Torcuato ----------
        ctx, pg, errs = await login(b, 'admin@example.com')
        r = await pg.evaluate("""(async () => { const c = window.supabase.createClient(); await c.auth.signInWithPassword({email: 'admin@example.com', password: 'secreto1'});
          const r = await c.rpc('importar_mercaderia', {p_local: 'munro', p_operacion: 'conteo', p_items: [{col: 'productos', id: 'p-001', campo: 'stock', cantidad: 5, antes: null}], p_archivo: {}, p_clave: 'clave-admin-01'});
          const f = await c.rpc('importar_mercaderia', {p_local: 'munro', p_operacion: 'conteo', p_items: [{col: 'fabrica', id: 'f-001', campo: 'fabrica', cantidad: 5, antes: 0}], p_archivo: {}, p_clave: 'clave-admin-02'});
          return [r.error && r.error.message, f.error && f.error.message]; })()""")
        check(r == ['MGS:destino', 'MGS:destino'], 'la base no deja tocar Stock Sugerido ni Conteo Fábrica: ' + str(r))
        check(await pg.locator('#snav [data-go=ingreso]').count() == 1, 'la administradora ve «Ingreso de mercadería»')
        await click(pg, '#snav [data-go=ingreso]', 400)
        await click(pg, '#ing-loc-torcuato', 600)
        check('«Stock»' in await pg.inner_text('.ing') and 'no se tocan' in await pg.inner_text('.ing'), 'avisa que solo se carga la columna Ingreso')
        await click(pg, '#ing-op-ingreso', 300)
        await cargar(pg, 'remito-a.csv', CSV_A, 'text/csv')
        j, m, c1, f6 = await fila(pg, 'f:i-1'), await fila(pg, 'f:i-2'), await fila(pg, 'f:i-3'), await fila(pg, 'f:i-6')
        check(j and j['on'] and j['det'].endswith('2') and j['res'].endswith('2'), 'Jamón cocido: 2 al Ingreso: ' + str(j))
        check(m and m['det'].endswith('4,5'), 'Muzzarella repetida se suma (3,5 + 1 = 4,5): ' + str(m))
        check(c1 and c1['act'].endswith('1') and c1['res'].endswith('6'), 'Cajas grandes: Ingreso 1 + 5 = 6: ' + str(c1))
        check(f6 and f6['cant'] == '0,75', 'Manteca de Ajo ¾ en Depósito: ' + str(f6))
        ign = await pg.inner_text('#ing-ign')
        check('Producto desconocido' in ign and 'Salsa X' in ign, 'productos desconocidos y sin cantidad quedan ignorados')
        check('Pepperoni' in await pg.inner_text('#ing-pend') and await pg.evaluate("document.querySelector('#ing-ok').disabled"), 'Pepperoni está en dos hojas: pide elegir')
        await pg.screenshot(path=OUT + 'ing-1-vista.png', full_page=True)
        await pg.select_option('#' + await pg.evaluate("document.querySelector('#ing-pend select').id"), 'f:i-5'); await pg.wait_for_timeout(250)
        check((await fila(pg, 'f:i-5'))['res'].endswith('1,25'), 'Pepperoni a Depósito')
        await click(pg, '#ing-ok', 700)
        check(await pg.locator('#ing-listo').count() == 1, 'confirma y muestra el resumen')
        t = {k: await pg.evaluate(F('torcuato', k)) for k in ['i-1', 'i-2', 'i-3', 'i-4', 'i-5', 'i-6']}
        check(t['i-1']['fabrica'] == 2 and t['i-1']['local'] == 1 and t['i-2']['fabrica'] == 4.5 and t['i-3']['fabrica'] == 6 and t['i-5']['fabrica'] == 1.25 and t['i-6']['fabrica'] == 0.75 and t['i-4']['fabrica'] is None, 'Torcuato: se suma a la columna Ingreso, Local no cambia')
        check((await pg.evaluate(R('torcuato', 'productos', 'p-001'))).get('stock') is None and (await pg.evaluate(F('torcuato', 'f-001')))['fabrica'] == 0, 'Stock Sugerido y Conteo Fábrica no se tocan')
        check((await pg.evaluate(F('munro', 'i-1'))).get('fabrica') is None, 'Munro queda igual')
        h = await pg.evaluate("window.__rows.filter(r => r.col === 'importaciones').map(r => r.data)")
        check(len(h) == 1 and h[0]['local'] == 'torcuato' and len(h[0]['items']) == 5 and any('Producto desconocido' in x for x in h[0]['ignorados']), 'historial: sucursal, 5 productos e ignorados')
        await pg.wait_for_timeout(300)
        check('remito-a.csv' in await pg.inner_text('#ing-hist'), 'el historial aparece en la pantalla')

        # ---------- Mismo archivo: aviso de duplicado ----------
        await click(pg, '[data-act=ing-otro]', 300)
        await cargar(pg, 'remito-a.csv', CSV_A, 'text/csv')
        await pg.select_option('#' + await pg.evaluate("document.querySelector('#ing-pend select').id"), label='No importar')
        await click(pg, '#ing-ok', 600)
        check('ya se importó' in (await pg.inner_text('#pn')).lower(), 'avisa que el archivo ya se importó')
        await click(pg, '#pn [data-act=close]', 300)
        check((await pg.evaluate(F('torcuato', 'i-1')))['fabrica'] == 2, 'Cancelar el aviso no cambia nada')
        await click(pg, '#ing-ok', 600); await click(pg, '#pn [data-act=ing-forzar]', 700)
        check((await pg.evaluate(F('torcuato', 'i-1')))['fabrica'] == 4, 'Importar igual suma de nuevo')

        # ---------- Reemplazar desde Excel, valores distintos y conflicto ----------
        await click(pg, '[data-act=ing-otro]', 300); await click(pg, '#ing-op-conteo', 300)
        await cargar(pg, 'conteo-b.xlsx', XLSX_B, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        check(await pg.locator('#ing-hoja').count() == 1, 'Excel: elige hoja y detecta columnas')
        c1 = await fila(pg, 'f:i-3')
        check(c1['est'] == 'Valores distintos' and not c1['on'], 'Cajas grandes con 0,5 y 2: pide la cantidad: ' + str(c1))
        await pg.fill('[data-ingcant="f:i-3"]', '2'); await pg.press('[data-ingcant="f:i-3"]', 'Tab'); await pg.wait_for_timeout(250)
        await pg.evaluate("(() => { const r = window.__rows.find(r => r.col === 'torcuato/fabrica' && r.id === 'i-1'); r.data.fabrica = 9; })()")
        await click(pg, '#ing-ok', 700)
        check('cambiaron' in await pg.inner_text('#ing-msg') and (await pg.evaluate(F('torcuato', 'i-3')))['fabrica'] == 11, 'conflicto: no guarda nada y avisa')
        await click(pg, '#ing-ok', 700)
        check((await pg.evaluate(F('torcuato', 'i-1')))['fabrica'] == 7 and (await pg.evaluate(F('torcuato', 'i-3')))['fabrica'] == 2, 'Reemplazar: Ingreso queda en 7 y 2')

        # ---------- Falta de internet: no suma dos veces ----------
        await click(pg, '[data-act=ing-otro]', 300); await click(pg, '#ing-op-ingreso', 300)
        await cargar(pg, 'red.csv', 'Producto;Cantidad\nCajas chicas;2\n'.encode('utf-8'), 'text/csv')
        await pg.evaluate("window.__rpcFalla = 'despues'"); await click(pg, '#ing-ok', 700)
        check('No llegó la respuesta' in await pg.inner_text('#ing-msg'), 'sin respuesta: ofrece reintentar')
        await click(pg, '#ing-retry', 700)
        check((await pg.evaluate(F('torcuato', 'i-7')))['fabrica'] == 3, 'reintento con la misma clave: suma una sola vez')
        await click(pg, '[data-act=ing-otro]', 300)
        await cargar(pg, 'red2.csv', 'Producto;Cantidad\nCajas chicas;1\n'.encode('utf-8'), 'text/csv')
        await pg.evaluate("window.__rpcFalla = 'antes'"); await click(pg, '#ing-ok', 700)
        check((await pg.evaluate(F('torcuato', 'i-7')))['fabrica'] == 3, 'se cortó antes de guardar: no cambió nada')
        await click(pg, '#ing-retry', 700)
        check((await pg.evaluate(F('torcuato', 'i-7')))['fabrica'] == 4, 'el reintento guarda una vez')

        # ---------- Cancelar, sin coincidencias y formato ----------
        await click(pg, '[data-act=ing-otro]', 300)
        await cargar(pg, 'nada.csv', 'Producto;Cantidad\nTornillos;100\n'.encode('utf-8'), 'text/csv')
        check(await pg.locator('#ing-nada').count() == 1 and await pg.evaluate("document.querySelector('#ing-ok').disabled"), 'sin coincidencias: no deja confirmar')
        await click(pg, '[data-act=ing-cancelar]', 300)
        check(await pg.locator('#ing-file').count() == 1, 'Cancelar no guarda nada')
        await cargar(pg, 'planilla.ods', b'xx', 'application/vnd.oasis.opendocument.spreadsheet')
        check('Formato no admitido' in await pg.inner_text('#ing-err'), 'formato no admitido: lo explica')
        check(not errs, 'sin errores (administradora): ' + str(errs)); await ctx.close()

        # ---------- Dueña en el celular: Munro y la hoja Stock ----------
        ctx, pg, errs = await login(b, 'dueno@example.com', {'width': 390, 'height': 844}, True)
        await click(pg, '#snav [data-go=ingreso]', 400); await click(pg, '#ing-loc-munro', 600); await click(pg, '#ing-op-ingreso', 300)
        await cargar(pg, 'remito-a.csv', CSV_A, 'text/csv')
        check(await pg.evaluate("document.documentElement.scrollWidth <= innerWidth"), 'celular: sin desplazamiento lateral')
        await pg.screenshot(path=OUT + 'ing-2-celular.png', full_page=True)
        await pg.select_option('#' + await pg.evaluate("document.querySelector('#ing-pend select').id"), label='No importar')
        await click(pg, '#ing-ok', 700)
        await click(pg, '#snav [data-go=h-ing01]', 500)
        tot = await pg.inner_text('#ft-i-1')
        check('Stock real' in await pg.inner_text('.xl-h') and tot == '3', 'hoja Stock: Local 1 + Ingreso 2 = Stock real 3: ' + tot)
        await pg.screenshot(path=OUT + 'ing-3-hoja-stock.png')
        await click(pg, '[data-act=tot-nombre]', 300); await pg.fill('#tn-nombre', 'Stock total'); await click(pg, '#tn-ok', 400)
        check('Stock total' in await pg.inner_text('.xl-h') and (await pg.evaluate(R('munro', 'hojas', 'h-ing01'))).get('total') == 'Stock total', 'la dueña renombra «Stock real»')
        check(not errs, 'sin errores (dueña): ' + str(errs)); await ctx.close()
        await b.close()
    print('\nRESULTADO: ' + ('TODO OK' if not fails else f'{len(fails)} FALLAS'))
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    asyncio.run(main())
