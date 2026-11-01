import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('robots.txt y sitemap incluyen exclusivamente páginas públicas',()=>{
  const robots=read('public/robots.txt'),sitemap=read('public/sitemap.xml');
  assert.match(robots,/User-agent:\s*\*/);
  assert.match(robots,/Sitemap: https:\/\/gestlok\.com\.ar\/sitemap\.xml/);
  assert.match(sitemap,/https:\/\/gestlok\.com\.ar\/<\/loc>/);
  assert.match(sitemap,/https:\/\/gestlok\.com\.ar\/conocer\/<\/loc>/);
  assert.doesNotMatch(sitemap,/\/empleados\/|\/stock\/|\/admin\/|\/cupones\/|\/recibos\//);
});

test('La portada tiene un título descriptivo y URL canónica GESTLOK',()=>{
  const layout=read('app/layout.tsx');
  assert.match(layout,/GESTLOK \| Software de gestión de negocios y locales/);
  assert.match(layout,/https:\/\/gestlok\.com\.ar/);
  assert.match(layout,/alternates:\s*\{ canonical: "\/" \}/);
  assert.match(layout,/openGraph:/);
  assert.doesNotMatch(layout,/metadataBase: new URL\(process\.env\.NEXT_PUBLIC_SITE_URL \|\| "http:\/\/localhost:3000"\)/);
  assert.match(read('app/page.tsx'),/href="\/conocer\/"/);
});

test('Página de presentación SEO pública no da acceso a módulos protegidos',()=>{
  const page=read('app/conocer/page.tsx');
  assert.match(page,/export const metadata: Metadata/);
  assert.match(page,/canonical:\s*"\/conocer\/"/);
  assert.match(page,/SoftwareApplication/);
  assert.match(page,/Todo tu negocio, en orden/);
  assert.match(page,/Probar GESTLOK/);
  assert.match(page,/demo=1/);
  assert.match(page,/permisos y módulos habilitados/);
  assert.doesNotMatch(page,/supabase|service_role|auth\.getSession|private_key|password|token/i);
  assert.doesNotMatch(page,/reviewRating|aggregateRating|offers:/i);
});

test('Google Search Console encuentra token de propiedad en la metadata de la página inicial',()=>{
  const layout=read('app/layout.tsx');
  assert.match(layout,/verification:\s*\{ google: "AUtQ56Jt0oBiuGWVHklpmNKiJxpkSpRiF6OZbHLHCoM" \}/);
  assert.match(layout,/alternates:\s*\{ canonical: "\/" \}/);
});
