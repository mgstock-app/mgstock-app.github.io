import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const sql=readFileSync("supabase/migrations/20261108173000_zayro_public_shop.sql","utf8");
const js=readFileSync("public/stock/gestlok-zayro-admin.js","utf8");
const page=readFileSync("app/zayro/zayro-store-client.tsx","utf8");
const shell=readFileSync("app/zayro/page.tsx","utf8");
const layout=readFileSync("app/zayro/layout.tsx","utf8");
const css=readFileSync("app/zayro/zayro.css","utf8");
const art=readFileSync("app/zayro/zayro-art.tsx","utf8");

test("ZAYRO conserva exclusividad de empresa y Dueña",()=>{
  assert.match(sql,/gestlok_zayro_is_owner/);
  assert.match(sql,/d\.col='equipo'/);
  assert.match(sql,/gestlok_zayro_admin_product/);
  assert.match(sql,/gestlok_zayro_admin_settings/);
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/where p\.tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'/);
  assert.match(sql,/owner_uid=\(select auth\.uid\(\)\)/);
  assert.match(sql,/revoke all on public\.gestlok_zayro_publications from public,anon,authenticated/);
  assert.match(sql,/revoke all on public\.gestlok_zayro_settings from public,anon,authenticated/);
  assert.match(sql,/enable row level security/);
});
test("Catálogo anónimo solo ve productos publicados, activos, con precio y stock; no expone costo",()=>{
  assert.match(sql,/create or replace function public\.gestlok_zayro_public_catalog\(\)/);
  assert.match(sql,/grant execute on function public\.gestlok_zayro_public_catalog\(\) to anon,authenticated/);
  assert.match(sql,/z\.published is true and p\.active is true and p\.in_stock is true/);
  assert.match(sql,/coalesce\(p\.stock_quantity,0\)>0/);
  assert.match(sql,/coalesce\(p\.manual_sale_price,p\.unit_price,0\)>0/);
  const segment=sql.slice(sql.indexOf("create or replace function public.gestlok_zayro_public_catalog()"),
    sql.indexOf("-- Panel privado"));
  assert.doesNotMatch(segment,/'cost_price'|'markup_percent'|'owner_uid'|'customer'|'user_id'/);
  assert.match(segment,/'enabled'/);
  assert.doesNotMatch(sql,/\btruncate\b|\bdrop\s+table\b/i);
});
test("ZAYRO usa un carrito que consulta por WhatsApp, nunca confirma pagos o venta automática",()=>{
  assert.match(page,/gestlok_zayro_public_catalog/);
  assert.match(page,/Agregar al carrito/);
  assert.match(page,/Enviar pedido por WhatsApp/);
  assert.match(page,/No se cobra ni se reserva stock desde esta página/);
  assert.doesNotMatch(page,/\.from\(["'](?:docs|gestlok_pilot_orders|gestlok_pilot_products)/);
  assert.doesNotMatch(page,/gestlok_zayro_admin_product|gestlok_zayro_admin_settings/);
});
test("Panel privado no ofrece la tienda a cuentas y tenants ajenos",()=>{
  assert.doesNotThrow(()=>new vm.Script(js));
  const listeners={},window={};const document={addEventListener:(k,cb)=>listeners[k]=cb};
  vm.runInNewContext(js,{window,document});
  const g=window.GestLokZayroAdmin;
  const ctx=(tenant,email,role="dueno")=>({S:{me:{tenant_id:tenant,email}},role:()=>role});
  const good=g.homeTile(ctx("2a97bf8d-7d08-4aa7-b051-5d1a4dc80103","camilab.lopez99@gmail.com"));
  assert.match(good,/Tienda Online · ZAYRO/);
  assert.equal(g.homeTile(ctx("00000000-0000-0000-0000-000000000002","camilab.lopez99@gmail.com")),"");
  assert.equal(g.homeTile(ctx("2a97bf8d-7d08-4aa7-b051-5d1a4dc80103","otro@example.invalid")),"");
  assert.equal(g.homeTile(ctx("2a97bf8d-7d08-4aa7-b051-5d1a4dc80103","camilab.lopez99@gmail.com","colaborador")),"");
});
test("El script y sus enlaces se cargan solo para usuarios autenticados",()=>{
  const runtime=readFileSync("components/stock-runtime.tsx","utf8");
  const owner=readFileSync("public/stock/gestlok-owner-areas.js","utf8");
  assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-zayro-admin\.js/);
  assert.match(owner,/GestLokZayroAdmin\?\.homeTile\?\.\(api\)/);
  assert.match(page,/className="zayro"/);
});

test("El render de la vidriera se inicia en el navegador sin provocar hidratación de HTML variable",()=>{
  assert.ok(shell.includes('dynamic(() => import("./zayro-store-client")'));
  assert.ok(shell.includes("ssr: false"));
  assert.ok(shell.includes("Preparando la tienda ZAYRO"));
});

test("Camila ve su vista previa privada y puede abrir la tienda pública",()=>{
  assert.match(js,/Vista previa privada/);
  assert.match(js,/data-zayro-preview-toggle/);
  assert.match(js,/publicProducts=products\.filter\(p=>p\.published===true/);
  assert.match(js,/data-zayro-open/);
  assert.match(js,/href="\/zayro\//);
  assert.match(js,/gestlok_zayro_admin_catalog/);
  assert.match(js,/gestlok_zayro_admin_product/);
  assert.match(js,/gestlok_zayro_admin_settings/);
  assert.match(js,/preview=!preview;render\(\)/);
});

test("La tienda queda en /zayro/: quita ?utm_source=chatgpt.com y parámetros de seguimiento",async()=>{
  const {cleanStoreHref,isTrackingParam}=await import("../app/zayro/store-url.ts");
  const b="https://gestlok.com.ar";
  assert.equal(cleanStoreHref(b+"/zayro/?utm_source=chatgpt.com"),"/zayro/");
  assert.equal(cleanStoreHref(b+"/zayro/?utm_source=chatgpt.com&utm_medium=referral&fbclid=x&gclid=y"),"/zayro/");
  assert.equal(cleanStoreHref(b+"/zayro/?UTM_Source=a&srsltid=b"),"/zayro/");
  assert.equal(cleanStoreHref(b+"/zayro"),"/zayro/");
  assert.equal(cleanStoreHref(b+"/zayro/index.html?utm_campaign=z"),"/zayro/");
  assert.equal(cleanStoreHref(b+"/zayro/?utm_source=chatgpt.com#productos"),"/zayro/#productos");
  assert.equal(cleanStoreHref(b+"/zayro/?fbclid=1&q=perfume"),"/zayro/?q=perfume");
  assert.equal(cleanStoreHref(b+"/zayro/"),null);
  assert.equal(cleanStoreHref(b+"/?utm_source=chatgpt.com"),null,"no toca otras páginas de GESTLOK");
  assert.equal(cleanStoreHref(b+"/empleados/?utm_source=x"),null);
  assert.equal(cleanStoreHref("no es una url"),null);
  assert.ok(isTrackingParam("utm_term")&&isTrackingParam("fbclid")&&!isTrackingParam("q"));
  assert.match(shell,/cleanStoreHref\(window\.location\.href\)/);
  assert.match(shell,/window\.history\.replaceState\(null, "", clean\)/);
  assert.match(layout,/canonical: "\/zayro\/"/);
  assert.match(layout,/url: "https:\/\/gestlok\.com\.ar\/zayro\/"/);
});

test("Los enlaces internos de ZAYRO no agregan parámetros ni recargan la página",()=>{
  assert.doesNotMatch(page+layout,/utm_|\?ref=|chatgpt/i);
  assert.match(page,/href=\{item\.target === "inicio" \? STORE_PATH : "#" \+ item\.target\}/);
  assert.match(page,/e\.preventDefault\(\);/);
  assert.match(page,/scrollIntoView/);
  assert.match(js,/href="\/zayro\/"/,"el panel privado abre la dirección limpia");
});

test("WhatsApp de ventas se convierte al formato internacional de Argentina",async()=>{
  const {whatsappNumber,whatsappLabel,whatsappLink}=await import("../app/zayro/store-url.ts");
  assert.equal(whatsappNumber("1144715168"),"5491144715168");
  assert.equal(whatsappNumber("+54 11 4471-5168"),"5491144715168");
  assert.equal(whatsappNumber("011 15 4471 5168"),"5491144715168");
  assert.equal(whatsappNumber("5491144477888"),"5491144477888");
  assert.equal(whatsappNumber("123"),"");
  assert.equal(whatsappLabel("1144715168"),"11 4471-5168");
  assert.equal(whatsappLink("1144715168","Hola ZAYRO"),"https://wa.me/5491144715168?text=Hola%20ZAYRO");
  assert.equal(whatsappLink("","Hola"),"");
  assert.match(page,/whatsappLink\(phone, message\)/);
});

test("Inicio premium de ZAYRO: barra, logo, menú, banner, beneficios, categorías, destacados, banners y WhatsApp",()=>{
  for(const cls of ["zayro-topbar","zayro-header","zayro-nav","zayro-hero","zayro-benefits","zayro-cats",
    "zayro-catalog","zayro-promos","zayro-about","zayro-footer","zayro-wa-float","zayro-drawer"])
    assert.ok(page.includes('className="'+cls)||page.includes('"'+cls+' ')||page.includes('"'+cls+'"'),cls);
  for(const text of ["Envíos a todo el país","Compras seguras","Diversos medios de pago","Fragancias","que te representan",
    "Ver perfumes","Calidad garantizada","Compra fácil y segura","Atención personalizada","Ver categoría",
    "Productos destacados","¿No sabés cuál","Desde Zona Norte","Quiénes somos","Contacto"])
    assert.ok(page.includes(text),text);
  assert.match(art,/export function ZayroLogo/);
  assert.match(art,/PARFUM/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/--z-gold/);
});

test("Los estilos de ZAYRO quedan aislados y no cambian otras pantallas de GESTLOK",()=>{
  const body=css.replace(/\/\*[\s\S]*?\*\//g,"");
  const selectors=[];
  const walk=text=>{
    let i=0;
    while(i<text.length){
      const open=text.indexOf("{",i);if(open<0)break;
      const head=text.slice(i,open).trim();
      let depth=1,j=open+1;
      while(j<text.length&&depth){if(text[j]==="{")depth++;else if(text[j]==="}")depth--;j++;}
      const inner=text.slice(open+1,j-1);
      if(/^@media|^@supports/.test(head))walk(inner);
      else if(!/^@keyframes/.test(head))selectors.push(...head.split(",").map(x=>x.trim()).filter(Boolean));
      i=j;
    }
  };
  walk(body);
  assert.ok(selectors.length>100);
  const outside=selectors.filter(sel=>!/^(\.zayro|:where\(\.zayro\)|html:has\(\.zayro\))/.test(sel));
  assert.deepEqual(outside,[]);
  assert.doesNotMatch(layout,/import\s+["']\.\.\//,"no importa estilos globales");
});
