"use client";

import { useEffect, useMemo, useState } from "react";
import "./zayro.css";

type Category = "mujer" | "hombre" | "unisex" | "capilar";
type Product = {
  id: string; name: string; category: string; sku: string;
  price: number; stock: number; image_url: string;
  description: string; audience: Category;
};
type Catalog = { brand: string; enabled: boolean; sales_whatsapp: string; products: Product[]; currency: "ARS" };
type Config = { url: string; key: string };
declare global { interface Window { SPM_CONFIG?: Config } }
const categories: { id: Category | "todos"; title: string; hint: string }[] = [
  { id: "todos", title: "Todo el catálogo", hint: "Fragancias y cuidado personal" },
  { id: "mujer", title: "Mujer", hint: "Fragancias para ella" },
  { id: "hombre", title: "Hombre", hint: "Fragancias para él" },
  { id: "unisex", title: "Unisex", hint: "Para todos los estilos" },
  { id: "capilar", title: "Cuidado capilar", hint: "Tu rutina de cuidado" },
];
const money = (n: number) => new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", minimumFractionDigits: 0,
  maximumFractionDigits: n % 1 ? 2 : 0,
}).format(n);
const productPrice = (p: Product) => Number(p.price) || 0;
const hasImage = (s: string) => /^https:\/\/[^ "'<>]+$/i.test(s || "");

async function fetchCatalog(config: Config): Promise<Catalog> {
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(config.url) || !config.key) throw Error("Configuración no disponible");
  const res = await fetch(config.url + "/rest/v1/rpc/gestlok_zayro_public_catalog", {
    method: "POST",
    headers: { apikey: config.key, Authorization: "Bearer " + config.key, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  if (!res.ok) throw Error("El catálogo aún no está disponible");
  const data = await res.json();
  if (!data || !Array.isArray(data.products)) throw Error("Respuesta del catálogo inválida");
  return data;
}
function getConfig(): Promise<Config> {
  return new Promise((resolve, reject) => {
    if (window.SPM_CONFIG) { resolve(window.SPM_CONFIG); return; }
    const script = document.createElement("script");
    script.src = "/stock/config.js";
    script.async = true;
    script.onload = () => window.SPM_CONFIG ? resolve(window.SPM_CONFIG) : reject(Error("Falta configuración"));
    script.onerror = () => reject(Error("No se pudo cargar la configuración"));
    document.head.appendChild(script);
  });
}
export default function ZayroStore() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<Category | "todos">("todos");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("nombre");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  useEffect(() => {
    let active = true;
    getConfig().then(fetchCatalog).then(data => {
      if (active) { setCatalog(data); setError(""); }
    }).catch(() => { if (active) setError("No pudimos cargar la tienda. Intentá de nuevo más tarde."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const products = useMemo(() => {
    const list = (catalog?.products || []).filter(p =>
      typeof p.id === "string" && typeof p.name === "string" && productPrice(p) > 0 && Number(p.stock) > 0);
    return list.filter(p =>
      (category === "todos" || p.audience === category) &&
      (!search.trim() || (p.name + " " + (p.category || "") + " " + (p.description || ""))
        .toLocaleLowerCase("es-AR").includes(search.trim().toLocaleLowerCase("es-AR"))))
      .sort((a, b) => sort === "menor" ? productPrice(a) - productPrice(b) :
        sort === "mayor" ? productPrice(b) - productPrice(a) :
        a.name.localeCompare(b.name, "es-AR"));
  }, [catalog, category, search, sort]);
  const chosen = (catalog?.products || []).filter(p => (cart[p.id] || 0) > 0);
  const count = chosen.reduce((sum, p) => sum + cart[p.id], 0);
  const total = chosen.reduce((sum, p) => sum + cart[p.id] * productPrice(p), 0);
  const isReady = catalog?.enabled === true && /^\d{10,15}$/.test(catalog.sales_whatsapp || "");
  const updateCart = (p: Product, add: number) => setCart(previous => {
    const next = { ...previous };
    const quantity = Math.max(0, Math.min(Number(p.stock) || 0, (previous[p.id] || 0) + add));
    if (quantity) next[p.id] = quantity; else delete next[p.id];
    return next;
  });
  const message = ["Hola, quiero consultar por estos productos de ZAYRO:", "",
    ...chosen.map(p => "- " + p.name + " × " + cart[p.id] + ": " + money(productPrice(p) * cart[p.id])),
    "", "Total estimado: " + money(total), "¿Me confirmás disponibilidad, forma de pago y entrega?"].join("\n");
  const wa = isReady && count > 0
    ? "https://wa.me/" + catalog.sales_whatsapp + "?text=" + encodeURIComponent(message) : "";
  return (
    <div className="zayro">
      <div className="zayro-topnote">ZAYRO · Fragancias y cuidado personal</div>
      <header className="zayro-header">
        <a className="zayro-logo" href="/zayro/" aria-label="ZAYRO, ir al inicio">
          <span className="zayro-symbol" aria-hidden="true">✧</span>
          <span>ZAYRO</span>
        </a>
        <nav aria-label="Categorías principales">
          <button onClick={() => setCategory("todos")}>Inicio</button>
          <button onClick={() => setCategory("mujer")}>Perfumes</button>
          <button onClick={() => setCategory("capilar")}>Cuidado capilar</button>
        </nav>
        <div className="zayro-header-actions">
          <button type="button" onClick={() => document.getElementById("zayro-search")?.focus()} aria-label="Buscar productos">⌕</button>
          <button type="button" onClick={() => setCartOpen(true)} aria-label={"Abrir carrito, " + count + " artículos"}>
            <span aria-hidden="true">♧</span><span className="zayro-count">{count}</span>
          </button>
        </div>
      </header>
      <main>
        <section className="zayro-hero">
          <div className="zayro-hero-copy">
            <p className="zayro-kicker">ZAYRO PERFUMERÍA</p>
            <h1>Tu próxima fragancia, <em>encontrala acá.</em></h1>
            <p>Perfumes para ella, para él y unisex. Descubrí nuestra selección de fragancias y cuidado capilar.</p>
            <a className="zayro-gold-button" href="#zayro-catalogo">Explorar el catálogo <span aria-hidden="true">→</span></a>
          </div>
          <div className="zayro-hero-art" aria-hidden="true">
            <span className="zayro-orbit" />
            <span className="zayro-bottle b1"><i /></span>
            <span className="zayro-bottle b2"><i /></span>
            <span className="zayro-bottle b3"><i /></span>
          </div>
        </section>
        <section className="zayro-categories" aria-label="Explorar categorías">
          {categories.slice(1).map(c => (
            <button className={category === c.id ? "selected" : ""} key={c.id}
              onClick={() => { setCategory(c.id); document.getElementById("zayro-catalogo")?.scrollIntoView({behavior:"smooth"}); }}>
              <span>{c.title}</span><small>{c.hint}</small><b aria-hidden="true">↗</b>
            </button>
          ))}
        </section>
        <section className="zayro-catalog" id="zayro-catalogo">
          <div className="zayro-catalog-top">
            <div><p className="zayro-kicker">NUESTRO CATÁLOGO</p><h2>{categories.find(c => c.id === category)?.title}</h2></div>
            <div className="zayro-controls">
              <label><span className="sr-only">Buscar</span>
                <input id="zayro-search" type="search" placeholder="Buscar productos…" value={search}
                  onChange={e => setSearch(e.target.value)} /></label>
              <label><span className="sr-only">Ordenar productos</span>
                <select value={sort} onChange={e => setSort(e.target.value)}>
                  <option value="nombre">Ordenar por nombre</option>
                  <option value="menor">Menor precio</option>
                  <option value="mayor">Mayor precio</option>
                </select></label>
            </div>
          </div>
          {loading ? <div className="zayro-state" role="status">Cargando catálogo de ZAYRO…</div> :
            error ? <div className="zayro-state" role="alert">{error}</div> :
            !isReady ? <div className="zayro-state"><h3>Estamos preparando nuestra tienda</h3><p>El catálogo público estará disponible próximamente.</p></div> :
            products.length === 0 ? <div className="zayro-state">Todavía no hay productos publicados con estos filtros.</div> :
            <div className="zayro-grid">
              {products.map(p => <article className="zayro-product" key={p.id}>
                <div className="zayro-photo">
                  {hasImage(p.image_url) ?
                    // A product image is supplied by the shop owner in her private panel.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt={p.name} loading="lazy" referrerPolicy="no-referrer"/> :
                    <div className="zayro-photo-placeholder"><span>✧</span><small>ZAYRO</small></div>}
                </div>
                <div className="zayro-product-content">
                  <p className="zayro-product-type">{categories.find(c => c.id === p.audience)?.title || "Fragancias"}</p>
                  <h3>{p.name}</h3>
                  {p.description && <p className="zayro-desc">{p.description}</p>}
                  <strong>{money(productPrice(p))}</strong>
                  <button type="button" onClick={() => updateCart(p,1)}>Agregar al carrito <span aria-hidden="true">＋</span></button>
                </div>
              </article>)}
            </div>}
        </section>
        <aside className="zayro-trust"><span>✦ Selección especial de fragancias</span><span>♡ Atención personalizada</span><span>↗ Consultas y pedidos por WhatsApp</span></aside>
      </main>
      <footer className="zayro-footer">
        <div><strong>ZAYRO</strong><p>Perfumería y cuidado capilar.</p></div>
        <div><a href="/privacidad.html">Privacidad</a><a href="/terminos.html">Condiciones</a></div>
        <small>Tienda impulsada por GESTLOK</small>
      </footer>
      {count > 0 && <div className="zayro-bottom-cart">
        <span>{count} {count === 1 ? "producto" : "productos"} · {money(total)}</span>
        <button onClick={() => setCartOpen(true)}>Ver carrito →</button>
      </div>}
      {cartOpen && <div className="zayro-overlay" onClick={() => setCartOpen(false)}>
        <section className="zayro-cart" role="dialog" aria-modal="true" aria-label="Tu carrito" onClick={e=>e.stopPropagation()}>
          <header><div><small>TU COMPRA</small><h2>Mi carrito ({count})</h2></div>
            <button type="button" aria-label="Cerrar carrito" onClick={() => setCartOpen(false)}>×</button></header>
          {count ? <div className="zayro-cart-lines">{chosen.map(p =>
            <article key={p.id}><div><h3>{p.name}</h3><p>{money(productPrice(p))} por unidad</p></div>
              <div className="zayro-qty"><button aria-label={"Quitar uno de " + p.name} onClick={() => updateCart(p,-1)}>−</button>
                <span>{cart[p.id]}</span><button aria-label={"Agregar uno de " + p.name} onClick={() => updateCart(p,1)}>+</button></div>
            </article>)}</div> : <p className="zayro-empty-cart">Todavía no agregaste productos.</p>}
          <div className="zayro-checkout"><div><span>Total estimado</span><strong>{money(total)}</strong></div>
            {wa ? <a href={wa} target="_blank" rel="noopener noreferrer">Enviar pedido por WhatsApp ↗</a> :
              <button disabled>Agregá productos para consultar</button>}
            <p>El pedido y la disponibilidad se confirman por WhatsApp. No se cobra ni se reserva stock desde esta página.</p></div>
        </section>
      </div>}
    </div>
  );
}