"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { STORE_PATH, whatsappLabel, whatsappLink } from "./store-url";
import {
  DomeArt, Emblem, HairCardArt, HeroArt, Icon, PerfumeCardArt, Ribbon, WhatsAppGlyph, ZayroDefs, ZayroLogo,
} from "./zayro-art";

type Category = "mujer" | "hombre" | "unisex" | "capilar";
type Filter = "todos" | "perfumes" | Category;
type Product = {
  id: string; name: string; category: string; sku: string;
  price: number; stock: number; image_url: string;
  description: string; audience: Category;
};
type Catalog = { brand: string; enabled: boolean; sales_whatsapp: string; products: Product[]; currency: "ARS" };
type Config = { url: string; key: string };
declare global { interface Window { SPM_CONFIG?: Config } }

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "perfumes", label: "Perfumes" },
  { id: "mujer", label: "Mujer" },
  { id: "hombre", label: "Hombre" },
  { id: "unisex", label: "Unisex" },
  { id: "capilar", label: "Cuidado capilar" },
];
const AUDIENCE: Record<Category, string> = {
  mujer: "Femenino", hombre: "Masculino", unisex: "Unisex", capilar: "Cuidado capilar",
};
const MESSAGES = ["Envíos a todo el país", "Compras seguras", "Diversos medios de pago"];
const BENEFITS = [
  { icon: "diamond", title: "Calidad garantizada" },
  { icon: "bag", title: "Compra fácil y segura" },
  { icon: "truck", title: "Envíos a todo el país" },
  { icon: "headset", title: "Atención personalizada" },
];
type NavItem = { label: string; target: string; filter?: Filter };
const NAV: NavItem[] = [
  { label: "Inicio", target: "inicio" },
  { label: "Productos", target: "productos", filter: "todos" },
  { label: "Perfumes", target: "productos", filter: "perfumes" },
  { label: "Cuidado capilar", target: "productos", filter: "capilar" },
  { label: "Quiénes somos", target: "sobre-zayro" },
  { label: "Contacto", target: "contacto" },
];

const money = (n: number) => {
  const digits = Math.round(n * 100) % 100 ? 2 : 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(n);
};
const productPrice = (p: Product) => Number(p.price) || 0;
const hasImage = (s: string) => /^https:\/\/[^ "'<>]+$/i.test(s || "");
const inFilter = (p: Product, f: Filter) =>
  f === "todos" || (f === "perfumes" ? p.audience !== "capilar" : p.audience === f);

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
// Desplazamiento interno sin agregar #secciones ni parámetros a la dirección.
function scrollToSection(id: string) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (id === "inicio") { window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); return; }
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function ProductPlaceholder({ p }: { p: Product }) {
  return (
    <div className="zayro-ph" aria-hidden="true">
      <svg className="zayro-ph-emblem" viewBox="0 0 200 200"><Emblem cx={100} cy={100} r={100} /></svg>
      <small>{AUDIENCE[p.audience] || "Fragancia"}</small>
      <b>{p.name}</b>
      <span>ZAYRO · PARFUM</span>
    </div>
  );
}

export default function ZayroStore() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("nombre");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // En Next, los componentes cliente también generan HTML del lado del servidor.
  // El escaparate depende de un catálogo cargado en el navegador: renderizamos
  // el mismo marcador en SSR y en el primer render del cliente para hidratar sin diferencias.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    let active = true;
    getConfig().then(fetchCatalog).then(data => {
      if (active) { setCatalog(data); setError(""); }
    }).catch(() => { if (active) setError("No pudimos cargar la tienda. Intentá de nuevo más tarde."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  // Con el menú o el carrito abiertos: Escape los cierra y la página de fondo no se desplaza.
  const layerOpen = menuOpen || cartOpen;
  useEffect(() => {
    if (!layerOpen) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuOpen(false); setCartOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => { root.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [layerOpen]);

  const products = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-AR");
    const list = (catalog?.products || []).filter(p =>
      typeof p.id === "string" && typeof p.name === "string" && productPrice(p) > 0 && Number(p.stock) > 0);
    return list.filter(p => inFilter(p, filter) &&
      (!term || (p.name + " " + (p.category || "") + " " + (p.description || "")).toLocaleLowerCase("es-AR").includes(term)))
      .sort((a, b) => sort === "menor" ? productPrice(a) - productPrice(b) :
        sort === "mayor" ? productPrice(b) - productPrice(a) :
        a.name.localeCompare(b.name, "es-AR"));
  }, [catalog, filter, search, sort]);
  const chosen = (catalog?.products || []).filter(p => (cart[p.id] || 0) > 0);
  const count = chosen.reduce((sum, p) => sum + cart[p.id], 0);
  const total = chosen.reduce((sum, p) => sum + cart[p.id] * productPrice(p), 0);
  const phone = catalog?.enabled === true ? catalog.sales_whatsapp || "" : "";
  const phoneLabel = whatsappLabel(phone);
  const isReady = catalog?.enabled === true && !!phoneLabel;
  const waGeneral = isReady ? whatsappLink(phone, "Hola ZAYRO, quiero hacer una consulta.") : "";
  const waAdvice = isReady ? whatsappLink(phone, "Hola ZAYRO, ¿me ayudan a elegir un perfume?") : "";
  const waShipping = isReady ? whatsappLink(phone, "Hola ZAYRO, quiero consultar el envío. Mi código postal es: ") : "";
  const updateCart = (p: Product, add: number) => setCart(previous => {
    const next = { ...previous };
    const quantity = Math.max(0, Math.min(Number(p.stock) || 0, (previous[p.id] || 0) + add));
    if (quantity) next[p.id] = quantity; else delete next[p.id];
    return next;
  });
  const message = ["Hola, quiero consultar por estos productos de ZAYRO:", "",
    ...chosen.map(p => "- " + p.name + " × " + cart[p.id] + ": " + money(productPrice(p) * cart[p.id])),
    "", "Total estimado: " + money(total), "¿Me confirmás disponibilidad, forma de pago y entrega?"].join("\n");
  const wa = isReady && count > 0 ? whatsappLink(phone, message) : "";
  const filterLabel = FILTERS.find(f => f.id === filter)?.label || "Productos";
  const heading = search.trim() ? "Resultados para «" + search.trim() + "»" :
    filter === "todos" ? "Productos destacados" : filterLabel;

  const showProducts = (next: Filter) => {
    setFilter(next);
    setMenuOpen(false);
    window.requestAnimationFrame(() => scrollToSection("productos"));
  };
  const go = (item: NavItem) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setMenuOpen(false);
    if (item.filter) setFilter(item.filter);
    if (item.target === "inicio") { setFilter("todos"); setSearch(""); }
    window.requestAnimationFrame(() => scrollToSection(item.target));
  };
  const focusSearch = () => {
    setMenuOpen(false);
    scrollToSection("productos");
    window.setTimeout(() => document.getElementById("zayro-search")?.focus({ preventScroll: true }), 350);
  };
  const navLinks = NAV.map(item => (
    <a key={item.label} href={item.target === "inicio" ? STORE_PATH : "#" + item.target} onClick={go(item)}
      aria-current={item.filter && item.filter === filter && item.filter !== "todos" ? "true" : undefined}>{item.label}</a>
  ));

  if (!mounted) {
    return <div className="zayro"><div className="zayro-state zayro-state-boot" role="status">Cargando tienda ZAYRO…</div></div>;
  }
  return (
    <div className="zayro">
      <ZayroDefs />
      <div className="zayro-topbar" aria-label="Beneficios de compra">
        <div className="zayro-topbar-track">
          {MESSAGES.map(m => <span key={m}>{m}</span>)}
        </div>
      </div>
      <header className="zayro-header">
        <div className="zayro-header-side">
          <button type="button" className="zayro-icon-btn zayro-only-mobile" onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú" aria-expanded={menuOpen}><Icon name="menu" /></button>
          <button type="button" className="zayro-icon-btn" onClick={focusSearch} aria-label="Buscar productos"><Icon name="search" /></button>
        </div>
        <a className="zayro-logo" href={STORE_PATH} onClick={go(NAV[0])} aria-label="ZAYRO Parfum, ir al inicio">
          <ZayroLogo className="zayro-logo-svg" />
        </a>
        <div className="zayro-header-side zayro-header-right">
          <button type="button" className="zayro-icon-btn" onClick={() => setCartOpen(true)}
            aria-label={"Abrir carrito, " + count + " artículos"}>
            <Icon name="cart" /><span className="zayro-count">{count}</span>
          </button>
        </div>
      </header>
      <nav className="zayro-nav" aria-label="Secciones de la tienda">{navLinks}</nav>
      <main>
        <section className="zayro-hero" id="inicio" aria-labelledby="zayro-hero-title">
          <Ribbon className="zayro-ribbon zayro-ribbon-top" />
          <Ribbon className="zayro-ribbon zayro-ribbon-left" />
          <Ribbon className="zayro-ribbon zayro-ribbon-right" />
          <div className="zayro-hero-inner">
            <div className="zayro-hero-left">
              <h1 id="zayro-hero-title"><span className="zayro-script">Fragancias</span> <span className="zayro-hero-sub">que te representan</span></h1>
              <span className="zayro-hero-line" aria-hidden="true" />
              <Icon name="lotus" className="zayro-lotus" />
            </div>
            <HeroArt className="zayro-hero-art" />
            <div className="zayro-hero-right">
              <p className="zayro-hero-cta">Descubrí <em>nuestra colección</em></p>
              <a className="zayro-gold-pill" href="#productos" onClick={e => { e.preventDefault(); showProducts("perfumes"); }}>
                Ver perfumes <Icon name="chevron" />
              </a>
            </div>
          </div>
        </section>

        <section className="zayro-benefits" aria-label="Por qué comprar en ZAYRO">
          {BENEFITS.map(b => (
            <div className="zayro-benefit" key={b.title}><Icon name={b.icon} /><h2>{b.title}</h2></div>
          ))}
        </section>

        <section className="zayro-cats" aria-label="Categorías">
          <button type="button" className="zayro-cat" onClick={() => showProducts("perfumes")}>
            <PerfumeCardArt className="zayro-cat-art" />
            <span className="zayro-cat-copy">
              <span className="zayro-cat-title">Perfumes</span>
              <span className="zayro-gold-pill zayro-gold-pill-sm">Ver categoría <Icon name="chevron" /></span>
            </span>
          </button>
          <button type="button" className="zayro-cat zayro-cat-hair" onClick={() => showProducts("capilar")}>
            <HairCardArt className="zayro-cat-art" />
            <span className="zayro-cat-copy">
              <span className="zayro-cat-title">Cuidado capilar</span>
              <span className="zayro-gold-pill zayro-gold-pill-sm">Ver categoría <Icon name="chevron" /></span>
            </span>
          </button>
        </section>

        <section className="zayro-catalog" id="productos" aria-labelledby="zayro-catalog-title">
          <h2 className="zayro-section-title" id="zayro-catalog-title"><span>{heading}</span></h2>
          <div className="zayro-filters" role="group" aria-label="Filtrar productos">
            {FILTERS.map(f => (
              <button type="button" key={f.id} className={filter === f.id ? "selected" : ""}
                aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          <div className="zayro-controls">
            <label className="zayro-search-field"><Icon name="search" /><span className="sr-only">Buscar</span>
              <input id="zayro-search" type="search" placeholder="Buscar productos…" value={search}
                onChange={e => setSearch(e.target.value)} enterKeyHint="search" /></label>
            <label><span className="sr-only">Ordenar productos</span>
              <select value={sort} onChange={e => setSort(e.target.value)}>
                <option value="nombre">Nombre (A-Z)</option>
                <option value="menor">Menor precio</option>
                <option value="mayor">Mayor precio</option>
              </select></label>
          </div>
          {loading ? <div className="zayro-grid" role="status" aria-label="Cargando catálogo de ZAYRO…">
              {[0, 1, 2, 3].map(i => <div className="zayro-skeleton" key={i}><span /><i /><i /></div>)}
            </div> :
            error ? <div className="zayro-state" role="alert">{error}</div> :
            !isReady ? <div className="zayro-state"><h3>Estamos preparando nuestra tienda</h3><p>El catálogo público estará disponible próximamente.</p></div> :
            products.length === 0 ? <div className="zayro-state"><h3>Sin resultados</h3><p>Todavía no hay productos publicados con estos filtros.</p>
              <button type="button" onClick={() => { setFilter("todos"); setSearch(""); }}>Ver todo el catálogo</button></div> :
            <div className="zayro-grid">
              {products.map(p => {
                const inCart = cart[p.id] || 0;
                const maxed = inCart >= (Number(p.stock) || 0);
                return <article className="zayro-product" key={p.id}>
                  <div className="zayro-photo">
                    {hasImage(p.image_url) ?
                      // A product image is supplied by the shop owner in her private panel.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt={p.name} loading="lazy" referrerPolicy="no-referrer" /> :
                      <ProductPlaceholder p={p} />}
                  </div>
                  <div className="zayro-product-content">
                    <p className="zayro-product-type">{AUDIENCE[p.audience] || "Fragancia"}</p>
                    <h3>{p.name}</h3>
                    {p.description && <p className="zayro-desc">{p.description}</p>}
                    <strong>{money(productPrice(p))}</strong>
                    <button type="button" onClick={() => updateCart(p, 1)} disabled={maxed}>
                      {maxed ? "Máximo disponible" : "Agregar al carrito"}
                    </button>
                    {inCart > 0 && <small className="zayro-in-cart">En tu carrito: {inCart}</small>}
                  </div>
                </article>;
              })}
            </div>}
        </section>

        <section className="zayro-promos" aria-label="Asesoramiento y envíos">
          <article className="zayro-promo">
            <div className="zayro-promo-copy">
              <small>Asesoramiento personalizado</small>
              <h2>¿No sabés cuál <em>elegir?</em></h2>
              <p>Te asesoramos por WhatsApp{phoneLabel ? <>: <span className="zayro-nowrap">{phoneLabel}</span></> : "."}</p>
              {waAdvice && <a className="zayro-promo-btn" href={waAdvice} target="_blank" rel="noopener noreferrer">Escribinos</a>}
            </div>
            <DomeArt kind="perfume" className="zayro-promo-art" />
          </article>
          <article className="zayro-promo">
            <div className="zayro-promo-copy">
              <small>Envíos</small>
              <h2>Desde Zona Norte <em>a tu casa</em></h2>
              <p>Enviamos a todo el país. Consultá el costo con tu código postal.</p>
              {waShipping && <a className="zayro-promo-btn" href={waShipping} target="_blank" rel="noopener noreferrer">Consultar envío</a>}
            </div>
            <DomeArt kind="gift" className="zayro-promo-art" />
          </article>
        </section>

        <section className="zayro-about" id="sobre-zayro" aria-labelledby="zayro-about-title">
          <p className="zayro-eyebrow">Sobre ZAYRO</p>
          <h2 id="zayro-about-title">Seleccionamos fragancias para que encuentres <em>la que te representa</em></h2>
          <p>Perfumes femeninos, masculinos y unisex inspirados en fragancias reconocidas, junto con productos de cuidado capilar.
            Te acompañamos con atención personalizada para que elijas con confianza y recibas tu pedido en cualquier punto del país.</p>
        </section>
      </main>

      <footer className="zayro-footer" id="contacto">
        <div className="zayro-footer-inner">
          <div className="zayro-footer-brand">
            <ZayroLogo className="zayro-footer-logo" />
            <p>Fragancias que te representan.</p>
          </div>
          <nav aria-label="Secciones">
            <h2>Navegación</h2>
            {navLinks}
          </nav>
          <div>
            <h2>Contacto</h2>
            {waGeneral ? <a href={waGeneral} target="_blank" rel="noopener noreferrer">WhatsApp: {phoneLabel}</a> : <p>Consultas por WhatsApp</p>}
            <p>Zona Norte, Buenos Aires</p>
          </div>
          <div>
            <h2>Tu compra</h2>
            <p>Envíos a todo el país.</p>
            <p>Pago y entrega se coordinan por WhatsApp al confirmar tu pedido.</p>
          </div>
        </div>
        <div className="zayro-footer-legal">
          <span>© {new Date().getFullYear()} ZAYRO Parfum</span>
          <a href="/privacidad.html">Privacidad</a>
          <a href="/terminos.html">Condiciones</a>
          <small>Tienda impulsada por GESTLOK</small>
        </div>
      </footer>

      {waGeneral && <a className={"zayro-wa-float" + (count > 0 ? " lifted" : "")} href={waGeneral}
        target="_blank" rel="noopener noreferrer" aria-label="Escribinos por WhatsApp"><WhatsAppGlyph /></a>}
      {count > 0 && <div className="zayro-bottom-cart">
        <span>{count} {count === 1 ? "producto" : "productos"} · {money(total)}</span>
        <button type="button" onClick={() => setCartOpen(true)}>Ver carrito →</button>
      </div>}
      {menuOpen && <div className="zayro-overlay zayro-overlay-left" onClick={() => setMenuOpen(false)}>
        <nav className="zayro-drawer" aria-label="Menú" onClick={e => e.stopPropagation()}>
          <header>
            <ZayroLogo className="zayro-drawer-logo" />
            <button type="button" className="zayro-icon-btn" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><Icon name="close" /></button>
          </header>
          {navLinks}
          {waGeneral && <a className="zayro-drawer-wa" href={waGeneral} target="_blank" rel="noopener noreferrer">
            <WhatsAppGlyph /> Escribinos por WhatsApp</a>}
        </nav>
      </div>}
      {cartOpen && <div className="zayro-overlay" onClick={() => setCartOpen(false)}>
        <section className="zayro-cart" role="dialog" aria-modal="true" aria-label="Tu carrito" onClick={e => e.stopPropagation()}>
          <header><div><small>TU COMPRA</small><h2>Mi carrito ({count})</h2></div>
            <button type="button" aria-label="Cerrar carrito" onClick={() => setCartOpen(false)}>×</button></header>
          {count ? <div className="zayro-cart-lines">{chosen.map(p =>
            <article key={p.id}><div><h3>{p.name}</h3><p>{money(productPrice(p))} por unidad</p></div>
              <div className="zayro-qty"><button aria-label={"Quitar uno de " + p.name} onClick={() => updateCart(p, -1)}>−</button>
                <span>{cart[p.id]}</span><button aria-label={"Agregar uno de " + p.name} onClick={() => updateCart(p, 1)}>+</button></div>
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
