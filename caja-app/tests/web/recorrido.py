"""Recorrido completo de la caja app en TELÉFONO y en PC contra el servidor de prueba (servidor.py).
Uso: python3 recorrido.py http://127.0.0.1:8765 carpeta_capturas
Comprueba: detección del medio, alta, PIN, apertura, cobros/gastos/ingresos/retiros, corregir, anular,
cierre cobro por cobro, panel del dueño, configuración, tope de gasto, atajos de teclado y cierre con totales (planilla 22/8)."""
import base64
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765'
FOTOS = sys.argv[2] if len(sys.argv) > 2 else '/tmp/caja-capturas'
os.makedirs(FOTOS, exist_ok=True)
UID, EMAIL = 'a1000000-0000-4000-8000-000000000001', 'duena.a@example.com'
errores = []


def sesion():
    exp = int(time.time()) + 10 * 365 * 86400
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
    tok = b({'alg': 'HS256', 'typ': 'JWT'}) + '.' + b({'sub': UID, 'role': 'authenticated', 'email': EMAIL, 'exp': exp, 'aud': 'authenticated'}) + '.firma'
    return {'access_token': tok, 'token_type': 'bearer', 'expires_in': 315360000, 'expires_at': exp, 'refresh_token': 'r',
            'user': {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': EMAIL, 'app_metadata': {'provider': 'email'},
                     'user_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'}}


def contexto(p, nav, telefono):
    if telefono:
        d = dict(p.devices['iPhone 13'])
        d.pop('default_browser_type', None)
        ctx = nav.new_context(**d, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
    else:
        ctx = nav.new_context(viewport={'width': 1366, 'height': 900}, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
    ctx.add_init_script("if(!localStorage.getItem('caja-app-auth'))localStorage.setItem('caja-app-auth',%s);" % json.dumps(json.dumps(sesion())))
    page = ctx.new_page()
    page.on('pageerror', lambda e: errores.append('pageerror: %s' % e))
    # Los 4xx esperables (PIN de cajera con tope, validaciones) y las fuentes externas bloqueadas no cuentan: sí cualquier error de JavaScript.
    page.on('console', lambda m: errores.append('console: %s' % m.text) if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)
    return ctx, page


def foto(page, nombre):
    page.wait_for_timeout(250)
    page.screenshot(path=os.path.join(FOTOS, nombre + '.png'), full_page=True)
    ancho = page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    assert ancho <= 1, '%s: hay desplazamiento horizontal (%spx)' % (nombre, ancho)


def hoja(page):
    return page.locator('#hoja .hoja-caja')


def mov(page, tipo, monto, chip=None, medio=None, detalle=None, por_atajo=None):
    if por_atajo:
        page.keyboard.press(por_atajo)
    else:
        page.locator('.acciones-caja [data-tipo="%s"]' % tipo).click()
    h = hoja(page)
    expect(h).to_be_visible()
    h.locator('input[name=monto]').fill(monto)
    if chip:
        h.locator('[data-grupo=categoria] .chip', has_text=chip).click()
    if medio:
        h.locator('[data-grupo=medio] .chip', has_text=medio).first.click()
    if detalle:
        h.locator('input[name=detalle]').fill(detalle)
    h.locator('button.prim').click()


def esperar_sin_hoja(page):
    expect(page.locator('#hoja')).to_be_hidden()


with sync_playwright() as p:
    nav = p.chromium.launch()

    # ================= TELÉFONO =================
    ctx, page = contexto(p, nav, True)
    page.goto(BASE + '/caja/')
    page.wait_for_selector('form[data-form=crearComercio]')
    assert page.evaluate('document.documentElement.dataset.medio') == 'telefono', 'el teléfono no se detectó'
    foto(page, 'tel-00-alta')
    page.fill('input[name=nombre]', 'Almacén La Esquina')
    page.fill('input[name=local]', 'Centro')
    page.fill('input[name=yo]', 'Sofía')
    page.fill('input[name=pin]', '1234')
    page.fill('input[name=pin2]', '1234')
    page.click('text=Crear y empezar')
    page.wait_for_selector('text=Abrir la caja de hoy')
    foto(page, 'tel-01-abrir')
    page.click('text=Sí, hay')
    page.wait_for_selector('h1:text-is("Caja de hoy")')
    mov(page, 'cobro', '1500')
    esperar_sin_hoja(page)
    mov(page, 'cobro', '2.500', medio='Transferencia')
    esperar_sin_hoja(page)
    mov(page, 'gasto', '400', chip='Delivery', detalle='Moto')
    esperar_sin_hoja(page)
    mov(page, 'retiro', '1000', chip='Retiro del dueño')
    esperar_sin_hoja(page)
    mov(page, 'ingreso', '5000', chip='Aporte de cambio')
    esperar_sin_hoja(page)
    # saldo = 0 + 1500 + 5000 − 400 − 1000
    expect(page.locator('.resumen-grid .tarjeta', has_text='Efectivo que debería haber')).to_contain_text('$ 5.100')
    expect(page.locator('.tarjeta', has_text='Cobrado hoy')).to_contain_text('$ 4.000')
    foto(page, 'tel-02-abierta')
    # Repetir el mismo envío no duplica (misma clave de operación)
    page.locator('.acciones-caja [data-tipo="cobro"]').click()
    h = hoja(page)
    h.locator('input[name=monto]').fill('700')
    op = h.locator('form').get_attribute('data-op')
    r1 = page.evaluate("async (op) => { const s=window.__caja.S; const r=await (await fetch('/rest/v1/rpc/caja_app_registrar',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JSON.parse(localStorage.getItem('caja-app-auth')).access_token},body:JSON.stringify({p_token:s.op.token,p_caja:s.estado.caja.id,p_operacion:op,p_tipo:'cobro',p_medio:'Efectivo',p_monto:700,p_categoria:null,p_detalle:''})})).json(); return r.repetida; }", op)
    assert r1 is False
    h.locator('button.prim').click()
    esperar_sin_hoja(page)
    expect(page.locator('#aviso')).to_contain_text('Ya estaba guardado')
    # Corregir el cobro de 1500 → 1600
    page.locator('.mov', has_text='$ 1.500').click()
    hoja(page).locator('text=Corregir importe o medio').click()
    h = hoja(page)
    h.locator('input[name=monto]').fill('1600')
    h.locator('[data-grupo=motivo] .chip', has_text='Importe equivocado').click()
    h.locator('button.prim').click()
    esperar_sin_hoja(page)
    # Anular la transferencia
    page.locator('.mov:not(.anulado)', has_text='$ 2.500').click()
    hoja(page).locator('button', has_text='Anular').click()
    h = hoja(page)
    h.locator('[data-grupo=motivo] .chip', has_text='Cargado dos veces').click()
    h.locator('button.peligro').click()
    esperar_sin_hoja(page)
    # saldo = 0 + (1600 + 700) + 5000 − 400 − 1000 = 5900
    expect(page.locator('.resumen-grid .tarjeta', has_text='Efectivo que debería haber')).to_contain_text('$ 5.900')
    expect(page.locator('.mov.anulado')).to_have_count(2)
    foto(page, 'tel-03-correcciones')
    # Cierre
    page.locator('.cerrar-caja').click()
    page.wait_for_selector('h2:has-text("Revisá los cobros por medio")')
    page.locator('input[data-medio="Efectivo"]').check()
    foto(page, 'tel-04a-cierre-medios')
    page.click('text=Siguiente')
    page.fill('input[data-cierre=arqueo]', '5.850')
    expect(page.locator('#cierre-dif')).to_contain_text('Faltante')
    expect(page.locator('#cierre-dif')).to_contain_text('−$ 50')
    foto(page, 'tel-04b-arqueo')
    page.click('text=Siguiente')
    page.fill('input[data-cierre=retiro]', '3000')
    page.click('text=Siguiente')
    expect(page.locator('#error-cierre')).to_contain_text('a dónde va')
    page.locator('[data-grupo=destino] .chip', has_text='Caja fuerte').click()
    expect(page.locator('#cierre-queda')).to_contain_text('$ 2.850')
    page.click('text=Siguiente')
    foto(page, 'tel-04c-confirmar')
    page.click('text=Cerrar caja definitivamente')
    page.wait_for_selector('h1:has-text("Caja cerrada")')
    expect(page.locator('.caja-dif')).to_contain_text('Faltante')
    expect(page.locator('.tarjeta', has_text='Queda para mañana')).to_contain_text('$ 2.850')
    foto(page, 'tel-05-cerrada')
    # Menú del teléfono
    page.locator('.quien').click()
    expect(hoja(page)).to_contain_text('Hoy en los locales')
    foto(page, 'tel-06-menu')
    hoja(page).locator('.opcion', has_text='Hoy en los locales').click()
    page.wait_for_selector('h1:has-text("Hoy en los locales")')
    foto(page, 'tel-07-hoy')
    ctx.close()

    # ================= PC =================
    ctx, page = contexto(p, nav, False)
    page.goto(BASE + '/caja/')
    page.wait_for_selector('h1:has-text("¿Quién está en la caja?")')
    assert page.evaluate('document.documentElement.dataset.medio') == 'pc', 'la PC no se detectó'
    expect(page.locator('.lateral')).to_be_visible()
    foto(page, 'pc-00-pin')
    page.locator('.persona', has_text='Sofía').click()
    page.keyboard.type('9999')
    expect(page.locator('#error-pin')).to_contain_text('PIN incorrecto')
    page.keyboard.type('1234')
    page.wait_for_selector('h1:has-text("Caja cerrada")')
    foto(page, 'pc-01-cerrada')
    page.locator('.lateral nav button', has_text='Hoy en los locales').click()
    page.wait_for_selector('h1:has-text("Hoy en los locales")')
    foto(page, 'pc-02-hoy')
    page.locator('.lateral nav button', has_text='Historial').click()
    page.wait_for_selector('table')
    expect(page.locator('tbody tr')).to_have_count(1)
    expect(page.locator('tbody tr')).to_contain_text('−$ 50')
    foto(page, 'pc-03-historial')
    page.locator('tbody tr').click()
    expect(hoja(page)).to_contain_text('Faltante')
    page.keyboard.press('Escape')
    with page.expect_download() as dl:
        page.click('text=Descargar para Excel')
    contenido = open(dl.value.path(), encoding='utf-8-sig').read()
    assert 'Centro' in contenido and '-50' in contenido, contenido
    # Configuración
    page.locator('.lateral nav button', has_text='Configuración').click()
    page.wait_for_selector('h1:has-text("Configuración")')
    foto(page, 'pc-04-config')
    page.locator('[data-act=editarPersona][data-id=""]').click()
    h = hoja(page)
    h.locator('input[name=nombre]').fill('Lucía Gómez')
    h.locator('select[name=rol]').select_option('cajero')
    h.locator('input[name=pin]').fill('1111')
    h.locator('input[name=tope]').fill('5.000')
    h.locator('button.prim').click()
    esperar_sin_hoja(page)
    expect(page.locator('.lista li', has_text='Lucía Gómez')).to_contain_text('tope $ 5.000')
    page.locator('[data-act=editarLocal][data-id=""]').click()
    hoja(page).locator('input[name=nombre]').fill('Norte')
    hoja(page).locator('button.prim').click()
    esperar_sin_hoja(page)
    for m in ['Posnet', 'Mercado Pago', 'PedidosYa']:
        page.fill('[data-nuevo=medios]', m)
        page.locator('[data-act=agregarItem][data-lista=medios]').click()
    for m in ['Débito', 'Crédito', 'Mercado Pago QR', 'Transferencia']:
        page.locator('[data-lista=medios] .chip[data-valor="%s"] button' % m).click()
    page.locator('form[data-form=configListas] button.prim').click()
    expect(page.locator('#aviso')).to_contain_text('Listas guardadas')
    page.locator('input[name=modo][value=totales]').check()
    page.locator('form[data-form=configGeneral] button.prim').click()
    expect(page.locator('#aviso')).to_contain_text('Guardado')
    # Vista elegida a mano y vuelta a automática
    page.locator('[data-act=fijarVista][data-valor=telefono]').first.click()
    assert page.evaluate('document.documentElement.dataset.medio') == 'telefono'
    page.locator('.quien').click()
    hoja(page).locator('.opcion', has_text='Vista').click()
    hoja(page).locator('.opcion', has_text='Automática').click()
    assert page.evaluate('document.documentElement.dataset.medio') == 'pc'
    # Este equipo pasa al local Norte
    page.locator('select[data-act-change=cambiarLocal]').select_option(label='Norte')
    expect(page.locator('#aviso')).to_contain_text('Norte')
    page.locator('.lateral nav button', has_text='Caja de hoy').click()
    page.wait_for_selector('h1:has-text("¿Quién está en la caja?")')
    page.locator('.persona', has_text='Lucía').click()
    page.keyboard.type('1111')
    page.wait_for_selector('text=Abrir la caja de hoy')
    page.click('text=No, hay otro monto')
    page.fill('#abrir-otro input[name=monto]', '981.200')
    page.keyboard.press('Enter')
    page.wait_for_selector('h1:text-is("Caja de hoy")')
    expect(page.locator('.acciones-caja [data-tipo=cobro]')).to_have_count(0)
    # Tope de gasto de la cajera (atajo G)
    mov(page, 'gasto', '890.260', chip='Proveedores', por_atajo='g')
    expect(hoja(page).locator('.error')).to_contain_text('supera tu límite')
    page.keyboard.press('Escape')
    page.locator('.lateral [data-act=cambiarPersona]').click()
    page.locator('.persona', has_text='Sofía').click()
    page.keyboard.type('1234')
    page.wait_for_selector('h1:text-is("Caja de hoy")')
    mov(page, 'gasto', '890.260', chip='Proveedores', por_atajo='g')
    esperar_sin_hoja(page)
    mov(page, 'retiro', '36.000', chip='Adelanto a empleado', por_atajo='r')
    esperar_sin_hoja(page)
    foto(page, 'pc-05-abierta-totales')
    page.locator('.acciones-caja [data-act=iniciarCierre]').click()
    page.fill('input[data-cierre=venta]', '1.493.400')
    page.fill('input[data-medio=Posnet]', '376.600')
    page.fill('input[data-medio="Mercado Pago"]', '350.000')
    page.fill('input[data-medio=PedidosYa]', '98.350')
    expect(page.locator('#cierre-ef')).to_contain_text('$ 668.450')
    foto(page, 'pc-06a-totales')
    page.click('text=Siguiente')
    page.fill('input[data-cierre=arqueo]', '733.900')
    expect(page.locator('.tarjeta', has_text='Saldo teórico')).to_contain_text('$ 723.390')
    expect(page.locator('#cierre-dif')).to_contain_text('$ 10.510')
    expect(page.locator('#cierre-dif')).to_contain_text('Sobrante')
    foto(page, 'pc-06b-arqueo')
    page.click('text=Siguiente')
    page.click('text=Siguiente')
    page.click('text=Cerrar caja definitivamente')
    page.wait_for_selector('h1:has-text("Caja cerrada")')
    expect(page.locator('.caja-dif')).to_contain_text('Sobrante')
    expect(page.locator('.caja-dif')).to_contain_text('$ 10.510')
    foto(page, 'pc-07-cerrada-totales')
    page.locator('.lateral nav button', has_text='Hoy en los locales').click()
    page.wait_for_selector('h1:has-text("Hoy en los locales")')
    expect(page.locator('.panel-grid .tarjeta')).to_have_count(2)
    foto(page, 'pc-08-hoy-dos-locales')
    ctx.close()

    # ================= SIN SESIÓN (pantalla de acceso) =================
    ctx = nav.new_context(viewport={'width': 390, 'height': 800}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errores.append('pageerror: %s' % e))
    page.goto(BASE + '/caja/')
    page.wait_for_selector('form[data-form=entrar]')
    assert page.evaluate('document.documentElement.dataset.medio') == 'telefono'
    foto(page, 'tel-08-acceso')
    page.click('text=Crear una cuenta')
    page.wait_for_selector('form[data-form=crearCuenta]')
    ctx.close()
    nav.close()

if errores:
    print('ERRORES DE PÁGINA:\n' + '\n'.join(errores))
    sys.exit(1)
print('RECORRIDO OK · capturas en', FOTOS)
