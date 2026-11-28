"""Anonymous, read-only Chromium smoke checks for public GESTLOK entry points."""
import json, os, pathlib, sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

TARGETS = {"production": "https://gestlok.com.ar/", "test": "https://gestlok-prueba.vercel.app/"}
DEVICES = {"mobile": (390, 844), "desktop": (1440, 900)}
CHECKS = ("navigation", "javascript", "responsive", "resources", "capture")
def run(target, device, output):
    width, height = DEVICES[device]
    url = TARGETS[target]
    expected_origin = urlsplit(url).netloc
    expected_scheme = urlsplit(url).scheme
    checks = {name: {"status": "not_run", "detail": "Control todavía no ejecutado."} for name in CHECKS}
    def result(key, passed, detail):
        checks[key] = {"status": "ok" if passed else "error", "detail": str(detail)[:2000]}
    blocked = []
    errors = []
    bad_resources = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, **({"executable_path":os.environ["RENATA_QA_CHROMIUM"]} if os.environ.get("RENATA_QA_CHROMIUM") else {}))
        try:
            context = browser.new_context(viewport={"width":width, "height":height}, service_workers="block", accept_downloads=False)
            try:
                def route_request(route):
                    req = route.request
                    parsed = urlsplit(req.url)
                    # No user credentials, API calls, writes, third-party scripts or cross-origin navigation.
                    allowed = req.method in ("GET", "HEAD") and parsed.scheme==expected_scheme and parsed.netloc==expected_origin
                    if req.resource_type in ("fetch", "xhr", "eventsource", "websocket"):
                        allowed = False
                    if req.is_navigation_request() and parsed.path not in ("/", "/login", "/login/"):
                        allowed = False
                    if allowed: route.continue_()
                    else:
                        blocked.append(req.resource_type)
                        route.abort()
                context.route("**/*", route_request)
                context.route_web_socket("**/*", lambda ws: ws.close())
                page = context.new_page()
                page.on("pageerror", lambda error: errors.append(type(error).__name__))
                page.on("response", lambda res: bad_resources.append(str(res.status)) if res.status>=400 and res.request.resource_type in ("document","script","stylesheet","image","font") else None)
                try:
                    response = page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    page.wait_for_timeout(2500)
                    title = page.title()
                    has_body = page.locator("body").is_visible()
                    result("navigation", bool(response and response.ok and urlsplit(page.url).netloc==expected_origin and "GESTLOK" in title.upper() and has_body), f"HTTP {response.status if response else 'sin respuesta'}; esperado GESTLOK; cuerpo visible={has_body}.")
                    overflow = page.evaluate("Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)-window.innerWidth")
                    result("responsive", overflow<=4, f"Vista {width}×{height}; desborde horizontal {overflow}px.")
                    result("javascript", not errors, f"Excepciones JS no controladas: {len(errors)}. Solicitudes bloqueadas por seguridad: {len(blocked)}.")
                    broken = page.evaluate("Array.from(document.images).filter(i=>i.complete&&i.naturalWidth===0&&i.getAttribute('src')&&new URL(i.currentSrc||i.src,location.href).origin===location.origin).length")
                    # An image or script intentionally blocked is not evidence of a server-side missing resource.
                    result("resources", not bad_resources and not broken, f"Recursos HTTP con error: {len(bad_resources)} ({', '.join(bad_resources[:12])}); imágenes no cargadas: {broken}; tráfico restringido.")
                    picture = page.screenshot(timeout=12000, animations="disabled")
                    result("capture", picture.startswith(b"\x89PNG\r\n\x1a\n"), "Captura PNG generada en memoria; no almacenada ni publicada.")
                except Exception as error:
                    result("navigation", False, "No pudo completarse la navegación: "+type(error).__name__)
            finally:
                context.close()
        finally:
            browser.close()
    pathlib.Path(output).write_text(json.dumps(checks, ensure_ascii=False), encoding="utf8")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf8") as handle:
            for key, item in checks.items():handle.write(f"{key}={item['status']}\n")
    print("Controles anónimos de navegador; no se prueban roles, pedidos ni datos reales.")
    for k,v in checks.items():print(k, v["status"], v["detail"])
def gate(path, check):
    row=json.loads(pathlib.Path(path).read_text())[check]
    print(row["detail"])
    if row["status"] != "ok":raise SystemExit(1)
if __name__ == "__main__":
    if sys.argv[1]=="gate": gate(sys.argv[2], sys.argv[3])
    else:run(*sys.argv[1:])
