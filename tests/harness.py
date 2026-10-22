"""Regression suites run against the actual Next.js HTTP server; no production writes."""
import os
from pathlib import Path
D = Path(__file__).resolve().parent
OUT = str(D / 'out') + '/'
os.makedirs(OUT, exist_ok=True)
BASE_URL = os.environ.get('STOCK_TEST_URL', 'http://localhost:3000')
async def load_app(page):
    await page.route('**/vendor/supabase.js', lambda route: route.fulfill(
        content_type='application/javascript', body=(D/'mock_supabase.js').read_text(encoding='utf-8')))
    await page.route('**/*.supabase.co/**', lambda route: route.abort())
    await page.goto(BASE_URL)
    await page.wait_for_selector('#au-in:not([hidden])')

async def solo_este_local(page):
    """Responde «Solo este local» cada vez que aparece la pregunta de aplicar a todos los locales."""
    await page.evaluate("new MutationObserver(() => { const b = document.getElementById('ask-uno'); if (b) b.click(); }).observe(document.body, {childList: true})")
