import Link from "next/link";
import type { Metadata } from "next";
import "./conocer.css";

export const metadata: Metadata = {
  title: "Conocé GESTLOK | Gestión de negocios y locales",
  description: "Conocé GESTLOK: una plataforma para organizar stock, proveedores y la gestión de empresas y sucursales. Explorá la demo e ingresá a tu cuenta.",
  alternates: { canonical: "/conocer/" },
  openGraph: {
    title: "GESTLOK | Todo tu negocio, en orden",
    description: "Organizá tu negocio en un solo lugar: stock, proveedores y herramientas para equipos y sucursales.",
    url: "https://gestlok.com.ar/conocer/",
    siteName: "GESTLOK",
    locale: "es_AR",
    type: "website",
  },
  robots: { index: true, follow: true },
};

const sections = [
  { title: "Productos y stock", text: "Controlá mercadería, movimientos y conteos diarios de cada local." },
  { title: "Proveedores y pedidos", text: "Organizá productos, listas de pedido y seguimiento de proveedores." },
  { title: "Vencimientos y avisos", text: "Llevá un registro de fechas importantes y pendientes de tu operación." },
  { title: "Personal y horarios", text: "Administrá empleados, turnos y recibos con permisos según cada rol." },
  { title: "Varios locales", text: "Trabajá por empresa y sucursal, manteniendo separados los accesos y la información." },
  { title: "Pagos y tareas diarias", text: "Reuní herramientas de uso frecuente según los módulos habilitados de cada comercio." },
];

export default function ConocerGestlok() {
  const software = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GESTLOK",
    url: "https://gestlok.com.ar/",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android, iOS",
    description: "Plataforma web de gestión para comercios, empresas y sucursales con herramientas de stock, proveedores y administración.",
    inLanguage: "es-AR",
  };
  return (
    <main className="gl-public-site">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(software).replace(/</g, "\\u003c") }} />
      <header className="gl-public-header">
        <Link className="gl-public-brand" href="/" aria-label="GESTLOK: ir al inicio">
          <img src="/icons/gestlok.svg" width="38" height="38" alt="" />
          <span>GESTLOK</span>
        </Link>
        <nav aria-label="Navegación pública">
          <Link href="/?demo=1">Probar la demo</Link>
          <Link className="gl-public-header-cta" href="/">Ingresar</Link>
        </nav>
      </header>

      <div className="gl-public-shell">
        <section className="gl-public-hero">
          <span className="gl-public-eyebrow">GESTIÓN PARA COMERCIOS</span>
          <h1>Todo tu negocio, en orden.</h1>
          <p className="gl-public-lead">GESTLOK reúne herramientas para organizar el trabajo diario de tu negocio: productos, stock, proveedores, personal y sucursales, desde un mismo lugar.</p>
          <div className="gl-public-actions">
            <Link className="gl-public-primary" href="/?demo=1">Explorar demo interactiva</Link>
            <Link className="gl-public-secondary" href="/">Entrar a GESTLOK</Link>
          </div>
          <p className="gl-public-caption">Accedé desde el navegador de tu computadora o celular. Las funciones disponibles dependen de los permisos y módulos habilitados.</p>
        </section>

        <section className="gl-public-features" aria-labelledby="gl-public-features-heading">
          <div className="gl-public-section-heading">
            <span className="gl-public-eyebrow">HERRAMIENTAS</span>
            <h2 id="gl-public-features-heading">Una plataforma para distintas áreas de tu negocio</h2>
            <p>Todo organizado por empresa, sucursal y usuario autorizado.</p>
          </div>
          <div className="gl-public-feature-grid">
            {sections.map(section => (
              <article className="gl-public-feature" key={section.title}>
                <h3>{section.title}</h3>
                <p>{section.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="gl-public-mobile" aria-labelledby="gl-public-mobile-heading">
          <div>
            <span className="gl-public-eyebrow">EN TU CELULAR</span>
            <h2 id="gl-public-mobile-heading">GESTLOK también se puede instalar como app</h2>
            <p>En Android y iPhone podés agregar GESTLOK a tu pantalla de inicio y acceder con tu cuenta, sin necesidad de descargar una aplicación de una tienda.</p>
            <Link href="/">Abrir GESTLOK e instalar</Link>
          </div>
        </section>

        <section className="gl-public-final">
          <h2>¿Querés conocer cómo funciona?</h2>
          <p>Explorá una demostración con ejemplos ficticios, sin acceder a datos de negocios reales.</p>
          <Link className="gl-public-primary" href="/?demo=1">Probar GESTLOK</Link>
        </section>
      </div>
      <footer className="gl-public-footer">
        <span>© GESTLOK · Todo tu negocio, en orden.</span>
        <nav aria-label="Documentos legales">
          <a href="/privacidad.html">Privacidad</a>
          <a href="/terminos.html">Condiciones de uso</a>
          <Link href="/">Ingresar</Link>
        </nav>
      </footer>
    </main>
  );
}
