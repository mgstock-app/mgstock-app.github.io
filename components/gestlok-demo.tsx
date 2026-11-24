"use client";

// Demo pública de GESTLOK Chat (gestlok.com.ar/demo/): vista del cliente y panel del local, lado a lado.
// Usa los modos de demostración que ya existen (?demo=1&showroom=1): sin red, sin Supabase y con un
// local, productos y pedidos ficticios. Los dos marcos se hablan solo por sessionStorage de esta pestaña;
// nada llega a la base real, a Mi Gusto ni a ningún otro comercio.
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export const CLAVE_SHOWROOM = "gestlok:chat-showroom:v1";
export const URL_CLIENTE = "/chat/?demo=1&showroom=1";
export const URL_PANEL = "/chat/panel/?demo=1&showroom=1";
const SANDBOX = "allow-scripts allow-same-origin allow-forms";

type Vista = "cliente" | "local";

const PASOS: ReadonlyArray<{ titulo: string; texto: string }> = [
  { titulo: "Hacé un pedido", texto: "En la vista del cliente tocá «Hacer un pedido», elegí productos y envialo." },
  { titulo: "Llega a tu panel", texto: "Aparece en Pedidos del panel del local, listo para revisar." },
  { titulo: "Confirmalo", texto: "Cuando lo confirmás, el cliente ve el estado de su pedido al instante." },
];

// Solo borra lo de la demostración (local «demo»): nunca toca sesiones ni datos de un local real.
export function esClaveDeDemo(clave: string): boolean {
  return /^gestlok-chat:[a-z-]+:demo$/.test(clave) || clave.startsWith("gestlok-chat:cierre:demo:") ||
    clave === "gestlok-chat-panel:sucursal-demo";
}

function Svg({ children, size = 20, width = 2 }: { children: ReactNode; size?: number; width?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
}

export function GestlokDemo() {
  const [vista, setVista] = useState<Vista>("cliente");
  const [nuevo, setNuevo] = useState(false);
  const [ronda, setRonda] = useState(0);
  const [aviso, setAviso] = useState("");
  const visto = useRef("");
  const vistaRef = useRef<Vista>("cliente");

  // Cuando el cliente envía un pedido, el marco lo escribe en sessionStorage y esta página
  // recibe el aviso: en el celular se marca la pestaña «Panel del local».
  useEffect(() => {
    const alCambiar = (e: StorageEvent) => {
      if (e.key !== CLAVE_SHOWROOM) return;
      try {
        const d = JSON.parse(e.newValue || "null") as { order?: { id?: string; estado?: string } } | null;
        const id = d?.order?.estado === "pendiente" ? String(d.order.id || "") : "";
        if (!id || id === visto.current) return;
        if (vistaRef.current === "local") { visto.current = id; return; }
        setNuevo(true);
      } catch { /* dato ilegible: se ignora */ }
    };
    window.addEventListener("storage", alCambiar);
    return () => window.removeEventListener("storage", alCambiar);
  }, []);

  function elegir(v: Vista) {
    setVista(v);
    vistaRef.current = v;
    if (v === "local" && nuevo) {
      try {
        const d = JSON.parse(sessionStorage.getItem(CLAVE_SHOWROOM) || "null") as { order?: { id?: string } } | null;
        visto.current = String(d?.order?.id || "");
      } catch { /* nada */ }
      setNuevo(false);
    }
  }

  function reiniciar() {
    try { sessionStorage.removeItem(CLAVE_SHOWROOM); } catch { /* sin almacenamiento */ }
    try {
      const claves: string[] = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && esClaveDeDemo(k)) claves.push(k); }
      claves.forEach((k) => localStorage.removeItem(k));
    } catch { /* sin almacenamiento */ }
    visto.current = "";
    setNuevo(false);
    elegir("cliente");
    setRonda((r) => r + 1);
    setAviso("Listo: la demostración empezó de nuevo.");
    window.setTimeout(() => setAviso(""), 4000);
  }

  return (
    <div className="glh glh-pag-demo">
      <header className="glh-top">
        <div className="glh-top-in">
          <div className="glh-acceso">
            <a className="glh-btn glh-btn-borde" href="/login/">Ingresar</a>
            <a className="glh-btn glh-btn-teal" href="/login/#registrarme">Registrarme</a>
          </div>
          <nav className="glh-nav" aria-label="Secciones">
            <Link href="/#como-funciona">Cómo funciona</Link>
            <a href="/demo/" aria-current="page">Demo</a>
            <Link href="/#contacto">Contacto</Link>
          </nav>
          <Link className="glh-marca" href="/" aria-label="GESTLOK, ir al inicio">
            {/* eslint-disable-next-line @next/next/no-img-element -- ícono SVG chico de la marca */}
            <img src="/icons/gestlok.svg" alt="" width={36} height={36} />
            <span>Gest<em>Lok</em></span>
          </Link>
        </div>
      </header>

      <main>
        <section className="glh-demo-intro" aria-labelledby="glh-demo-h1">
          <div className="glh-demo-volver-fila">
            <Link className="glh-demo-volver" href="/">
              <Svg size={18}><path d="M15 6l-6 6 6 6" /></Svg><span>Volver al inicio</span>
            </Link>
          </div>
          <h1 id="glh-demo-h1">Probá GESTLOK Chat</h1>
          <p className="glh-bajada">Hacé un pedido como cliente y mirá cómo le llega al local.</p>
          <p className="glh-demo-nota">
            <Svg size={18}><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></Svg>
            <span>Local, productos y pedidos de ejemplo. No se envía nada a ningún comercio.</span>
          </p>
          <ol className="glh-demo-pasos">
            {PASOS.map((p, i) => (
              <li key={p.titulo}><span className="glh-paso">{i + 1}</span><b>{p.titulo}</b><span>{p.texto}</span></li>
            ))}
          </ol>
        </section>

        <section className="glh-demo-escena" aria-label="Demostración de GESTLOK Chat">
          <div className="glh-demo-barra">
            <div className="glh-demo-tabs" role="tablist" aria-label="Elegir vista">
              <button type="button" role="tab" id="glh-tab-cliente" aria-controls="glh-demo-cliente" aria-selected={vista === "cliente"}
                className={vista === "cliente" ? "glh-tab-on" : ""} onClick={() => elegir("cliente")}>Vista del cliente</button>
              <button type="button" role="tab" id="glh-tab-local" aria-controls="glh-demo-local" aria-selected={vista === "local"}
                className={vista === "local" ? "glh-tab-on" : ""} onClick={() => elegir("local")}>
                Panel del local{nuevo ? <span className="glh-demo-nuevo">Nuevo pedido</span> : null}
              </button>
            </div>
            <button type="button" className="glh-btn glh-btn-claro glh-demo-reiniciar" onClick={reiniciar}
              aria-label="Empezar de nuevo" title="Empezar de nuevo">
              <Svg size={18}><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" /></Svg><span>Empezar de nuevo</span>
            </button>
          </div>
          <p className="glh-demo-aviso" role="status">{aviso}</p>
          <div className="glh-demo-marcos">
            <div id="glh-demo-cliente" role="tabpanel" aria-labelledby="glh-tab-cliente" className="glh-demo-marco glh-demo-tel"
              data-visible={vista === "cliente" ? "si" : "no"}>
              <h2 className="glh-demo-rotulo">Vista del cliente</h2>
              <iframe key={"cliente-" + ronda} title="GESTLOK Chat · Vista del cliente (demostración)" src={URL_CLIENTE}
                sandbox={SANDBOX} referrerPolicy="no-referrer" />
            </div>
            <div id="glh-demo-local" role="tabpanel" aria-labelledby="glh-tab-local" className="glh-demo-marco glh-demo-panel"
              data-visible={vista === "local" ? "si" : "no"}>
              <h2 className="glh-demo-rotulo">Panel del local</h2>
              <iframe key={"local-" + ronda} title="GESTLOK Chat · Panel del local (demostración)" src={URL_PANEL}
                sandbox={SANDBOX} referrerPolicy="no-referrer" />
            </div>
          </div>
        </section>

        <section className="glh-demo-fin" aria-labelledby="glh-demo-fin-titulo">
          <h2 id="glh-demo-fin-titulo">¿Lo querés para tu comercio?</h2>
          <p>Creá tu cuenta y elegí GESTLOK Chat, o escribinos y te ayudamos a empezar.</p>
          <div className="glh-hero-acciones">
            <a className="glh-btn glh-btn-teal glh-btn-xl" href="/login/#registrarme">Registrarme</a>
            <Link className="glh-btn glh-btn-linea glh-btn-xl" href="/#contacto">Hablar con una persona</Link>
          </div>
        </section>
      </main>

      <footer className="glh-pie">
        <div className="glh-pie-in">
          <span>© 2026 GESTLOK · Tu negocio, en orden.</span>
          <nav aria-label="Información legal">
            <a href="/conocer/">Conocé GESTLOK</a>
            <a href="/privacidad.html">Privacidad</a>
            <a href="/terminos.html">Condiciones de uso</a>
            <a href="/almacenamiento.html">Cookies y almacenamiento</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
