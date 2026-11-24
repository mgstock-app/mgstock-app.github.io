"use client";

// Inicio publicitario de gestlok.com.ar: Ingresar/Registrarme, carrusel de micro apps,
// Contacto (el mensaje llega al panel de la creadora) y Emma, la asistente de la web.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { EMMA_SALUDO, EMMA_SUGERENCIAS, normalizar, responderEmma } from "@/lib/gestlok-emma";

// Clave pública (anon): los permisos los controla la base. Solo puede enviar mensajes.
const SUPABASE_URL = "https://vgsepaaewbctjsjcpeta.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnc2VwYWFld2JjdGpzamNwZXRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NDEwNjEsImV4cCI6MjEwODExNzA2MX0.WFeUP95DJAOOsiZ5BbBvqT1QURmA5KJLDjlDpwuU838";

// Cuadros del carrusel: pantallas de GESTLOK Chat con un local, productos, precios y cliente ficticios («Sabores del Barrio»).
const CUADROS: ReadonlyArray<{ img: string; titulo: string; texto: string; alt: string }> = [
  { img: "1-bienvenida", titulo: "Tu cliente entra y pide", alt: "Pantalla de bienvenida del chat de un local con el botón Hacer un pedido",
    texto: "Abre el chat de tu local desde un enlace o un QR y toca «Hacer un pedido». Sin descargar nada." },
  { img: "2-carta", titulo: "Ve tu carta y tus promos", alt: "Carta del local con promociones de empanadas y botones Elegir",
    texto: "Las promociones primero y la carta completa, con precios siempre al día." },
  { img: "3-promo", titulo: "Arma su promo sin errores", alt: "Selector de una promo de 6 empanadas con cantidades por gusto",
    texto: "Elige gustos y salsas con + y −. No puede enviar una promo incompleta." },
  { img: "4-sugerencia", titulo: "Le ofrece algo más", alt: "El chat ofrece bebidas o postres antes de enviar el pedido",
    texto: "Antes de cerrar, sugiere una bebida o un postre. Ventas extra sin pedirlo vos." },
  { img: "5-gerente", titulo: "El pedido llega a tu panel", alt: "Panel del gerente con un pedido pendiente de confirmación",
    texto: "Con aviso sonoro. El gerente lo revisa y lo confirma; nada se confirma solo." },
  { img: "6-seguimiento", titulo: "Sigue su pedido en vivo", alt: "Seguimiento del pedido con las etapas Recibido, Confirmado y Listo",
    texto: "Recibido, confirmado y listo. Al terminar, lo invita a dejar su reseña en Google." },
];

const INTERVALO_MS = 6000;

const BENEFICIOS: ReadonlyArray<{ titulo: string; texto: string }> = [
  { titulo: "Pedidos sin errores", texto: "Botones y carrito: tu cliente elige de la carta, no escribe a mano." },
  { titulo: "Abierto las 24 horas", texto: "Con el local cerrado, el cliente puede dejar su pedido programado." },
  { titulo: "Vos decidís", texto: "Cada pedido lo confirma el gerente, con aviso sonoro al llegar." },
  { titulo: "Vende más", texto: "Sugiere bebida o postre antes de cerrar el pedido." },
  { titulo: "Más reseñas", texto: "Al terminar el pedido invita al cliente a contar su experiencia en Google." },
  { titulo: "Para cualquier rubro", texto: "Gastronomía, cafeterías, perfumerías, ferreterías y más, con tu carta y tus promos." },
];

function Svg({ children, size = 24, width = 1.8 }: { children: ReactNode; size?: number; width?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
}

const BURBUJA = <path d="M20 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5z" />;
const TILDE = <path d="M5 12.5l4.5 4.5L19 7.5" />;

type Mensaje = { de: "emma" | "yo"; texto: string; contacto?: boolean; registrarme?: boolean; demo?: boolean };

const TELEFONO = <><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 17.5h2" /></>;
const PANEL = <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M7 9h6M7 12h10" /></>;
type Form = { nombre: string; telefono: string; email: string; mensaje: string; acepto: boolean; web: string };
const FORM_VACIO: Form = { nombre: "", telefono: "", email: "", mensaje: "", acepto: false, web: "" };

export function validarContacto(f: Form): string {
  const nombre = f.nombre.trim();
  if (nombre.length < 2 || nombre.length > 80) return "Escribí tu nombre.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email.trim()) || f.email.trim().length > 120) return "Revisá el email.";
  if (f.telefono.trim() && !/^[0-9+() .-]{6,30}$/.test(f.telefono.trim())) return "Revisá el teléfono: solo números, espacios, guiones o +.";
  const m = f.mensaje.trim();
  if (m.length < 5) return "Escribí tu mensaje.";
  if (m.length > 2000) return "El mensaje puede tener hasta 2000 caracteres.";
  if (!f.acepto) return "Para enviar el mensaje tenés que aceptar el uso de tus datos.";
  return "";
}

export function GestlokHome() {
  const [pausado, setPausado] = useState(false);
  const [actual, setActual] = useState(0);
  const [tocando, setTocando] = useState(false);
  const pistaRef = useRef<HTMLDivElement>(null);
  const moviendoHasta = useRef(0);
  const [form, setForm] = useState<Form>(FORM_VACIO);
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok">("idle");
  const [error, setError] = useState("");
  const [emmaAbierta, setEmmaAbierta] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ de: "emma", texto: EMMA_SALUDO }]);
  const consultasHechas = mensajes.filter((m) => m.de === "yo").map((m) => normalizar(m.texto));
  const preguntasDisponibles = [
    ...EMMA_SUGERENCIAS,
    "¿Sirve para mi rubro?",
    "¿Cómo puedo cargar mi carta?",
    "¿Cómo comparto mi QR?",
    "¿Tengo que instalar una app?",
    "¿Hay descuento de lanzamiento?",
    "¿Puedo recibir reseñas de Google?",
  ];
  const sinResponder = preguntasDisponibles.filter((s) => !consultasHechas.includes(normalizar(s)));
  const sugerencias = consultasHechas.length === 0 ? EMMA_SUGERENCIAS
    : (sinResponder.length ? sinResponder : preguntasDisponibles.filter((s) => normalizar(s) !== consultasHechas[consultasHechas.length - 1])).slice(0, 4);
  const [pregunta, setPregunta] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  const preguntaRef = useRef<HTMLInputElement>(null);
  const lanzadorRef = useRef<HTMLButtonElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (emmaAbierta) preguntaRef.current?.focus();
  }, [emmaAbierta]);
  // Avance automático: se mueve solo y se detiene con «Pausar» (o mientras el mouse está encima).
  // Si el equipo pide menos movimiento, cambia de cuadro sin deslizar.
  useEffect(() => {
    if (pausado || tocando) return;
    const t = window.setTimeout(() => irA((actual + 1) % CUADROS.length), INTERVALO_MS);
    return () => window.clearTimeout(t);
  }, [pausado, tocando, actual]);

  function irA(i: number) {
    const pista = pistaRef.current;
    const tarjeta = pista?.children[i] as HTMLElement | undefined;
    if (!pista || !tarjeta) return;
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Mientras dura el desplazamiento automático no se recalcula el cuadro actual.
    moviendoHasta.current = Date.now() + 900;
    pista.scrollTo({ left: tarjeta.offsetLeft - pista.offsetLeft, behavior: quieto ? "auto" : "smooth" });
    setActual(i);
  }
  function alDesplazar() {
    const pista = pistaRef.current;
    if (!pista || Date.now() < moviendoHasta.current) return;
    const hijos = Array.from(pista.children) as HTMLElement[];
    let mejor = 0, dist = Infinity;
    hijos.forEach((h, i) => { const d = Math.abs(h.offsetLeft - pista.offsetLeft - pista.scrollLeft); if (d < dist) { dist = d; mejor = i; } });
    if (mejor !== actual) setActual(mejor);
  }
  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, escribiendo, emmaAbierta]);
  useEffect(() => {
    if (!emmaAbierta) return;
    const alTeclado = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      setEmmaAbierta(false);
      setTimeout(() => lanzadorRef.current?.focus(), 0);
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [emmaAbierta]);

  function cerrarEmma() {
    setEmmaAbierta(false);
    setTimeout(() => lanzadorRef.current?.focus(), 0);
  }
  function irAContacto() {
    setEmmaAbierta(false);
    document.getElementById("contacto")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => nombreRef.current?.focus({ preventScroll: true }), 450);
  }
  function preguntar(texto: string) {
    const t = texto.trim().slice(0, 300);
    if (!t || escribiendo) return;
    setMensajes((m) => [...m, { de: "yo", texto: t }]);
    setPregunta("");
    setEscribiendo(true);
    setTimeout(() => {
      const r = responderEmma(t);
      setMensajes((m) => [...m, { de: "emma", texto: r.texto, contacto: r.contacto, registrarme: r.registrarme, demo: r.demo }]);
      setEscribiendo(false);
    }, 450);
  }
  function cambiar<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    if (error) setError("");
  }
  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (estado === "enviando") return;
    // Campo trampa: si un robot lo completa, se descarta sin avisar.
    if (form.web) { setEstado("ok"); return; }
    const problema = validarContacto(form);
    if (problema) { setError(problema); return; }
    setEstado("enviando");
    setError("");
    try {
      const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/gestlok_contacto_enviar", {
        method: "POST",
        headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_nombre: form.nombre.trim(), p_telefono: form.telefono.trim() || null, p_email: form.email.trim(),
          p_mensaje: form.mensaje.trim(), p_consentimiento: form.acepto,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(j?.message && j.message.length < 160 ? j.message : "No se pudo enviar el mensaje. Probá de nuevo en unos minutos.");
      }
      setEstado("ok");
    } catch (e) {
      setEstado("idle");
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No se pudo enviar el mensaje. Revisá tu conexión y probá de nuevo.");
    }
  }

  return (
    <div className="glh">
      <header className="glh-top">
        <div className="glh-top-in">
          <div className="glh-acceso">
            <a className="glh-btn glh-btn-borde" href="/login/">Ingresar</a>
            <a className="glh-btn glh-btn-teal" href="/login/#registrarme">Registrarme</a>
          </div>
          <nav className="glh-nav" aria-label="Secciones">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="/demo/">Demo</a>
            <a href="#contacto">Contacto</a>
          </nav>
          <a className="glh-marca" href="#inicio" aria-label="GESTLOK, volver al inicio">
            {/* eslint-disable-next-line @next/next/no-img-element -- ícono SVG chico de la marca */}
            <img src="/icons/gestlok.svg" alt="" width={36} height={36} />
            <span>Gest<em>Lok</em></span>
          </a>
        </div>
      </header>

      <main>
        <section id="inicio" className="glh-hero">
          <img className="glh-hero-logo" src="/icons/gestlok.svg" alt="" width={88} height={88} />
          <p className="glh-marca-chat">Gest<em>Lok</em> Chat</p>
          <h1>Tus clientes piden solos por chat, las 24 horas.</h1>
          <p className="glh-bajada">Tu carta, tus promos y tus pedidos en un solo chat. El cliente arma su pedido desde el celular y vos lo confirmás desde tu panel.</p>
          <div className="glh-hero-acciones">
            <a className="glh-btn glh-btn-navy glh-btn-xl" href="#como-funciona">Ver cómo funciona</a>
            <a className="glh-btn glh-btn-claro glh-btn-xl" href="#contacto">Quiero GESTLOK Chat</a>
          </div>
        </section>

        <section id="como-funciona" className="glh-apps" aria-labelledby="glh-como-titulo" aria-roledescription="carrusel">
          <div className="glh-apps-cab">
            <div>
              <h2 id="glh-como-titulo">Así funciona GESTLOK Chat</h2>
              <p>Pantallas de GESTLOK Chat. Local, productos y precios de ejemplo.</p>
            </div>
            <div className="glh-car-ctrl">
              <button type="button" className="glh-btn glh-btn-claro glh-flecha" aria-label="Cuadro anterior" onClick={() => irA((actual + CUADROS.length - 1) % CUADROS.length)}>
                <Svg size={20} width={2}><path d="M15 6l-6 6 6 6" /></Svg>
              </button>
              <button type="button" className="glh-btn glh-btn-claro glh-pausa" onClick={() => setPausado((p) => !p)} aria-pressed={pausado}>
                <Svg size={18} width={2}>{pausado ? <path d="M8 5.5v13l10.5-6.5z" /> : <path d="M9 6v12M15 6v12" />}</Svg>
                <span>{pausado ? "Reanudar" : "Pausar"}</span>
              </button>
              <button type="button" className="glh-btn glh-btn-claro glh-flecha" aria-label="Cuadro siguiente" onClick={() => irA((actual + 1) % CUADROS.length)}>
                <Svg size={20} width={2}><path d="M9 6l6 6-6 6" /></Svg>
              </button>
            </div>
          </div>
          <div className="glh-cuadros" ref={pistaRef} onScroll={alDesplazar}
            onMouseEnter={() => setTocando(true)} onMouseLeave={() => setTocando(false)}>
            {CUADROS.map((c, i) => (
              <figure key={c.img} className={"glh-cuadro" + (i === actual ? " glh-cuadro-on" : "")} aria-label={"Paso " + (i + 1) + " de " + CUADROS.length}>
                {/* eslint-disable-next-line @next/next/no-img-element -- captura estática exportada */}
                <img src={"/img/gestlok-chat/" + c.img + ".webp"} alt={c.alt} width={300} height={649} loading={i < 3 ? "eager" : "lazy"} />
                <figcaption>
                  <span className="glh-paso">{i + 1}</span>
                  <b>{c.titulo}</b>
                  <span>{c.texto}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="glh-puntos" role="group" aria-label="Elegir cuadro">
            {CUADROS.map((c, i) => (
              <button key={c.img} type="button" aria-label={"Ir al paso " + (i + 1) + ": " + c.titulo} aria-current={i === actual ? "step" : undefined}
                className={i === actual ? "glh-punto-on" : ""} onClick={() => irA(i)}>
                {i === actual ? <span key={"p" + actual} className={"glh-progreso" + (pausado || tocando ? " glh-progreso-pausa" : "")} /> : null}
              </button>
            ))}
          </div>
        </section>

        <section id="demo" className="glh-demo-cta" aria-labelledby="glh-demo-titulo">
          <div className="glh-demo-cta-in">
            <div className="glh-demo-cta-txt">
              <span className="glh-etiqueta-oscura">Demo</span>
              <h2 id="glh-demo-titulo">Probalo antes de contratar</h2>
              <p>Hacé un pedido como cliente y mirá cómo le llega al local, en la misma pantalla. Es un local de ejemplo: no se envía nada a ningún comercio.</p>
              <a className="glh-btn glh-btn-navy glh-btn-xl" href="/demo/">Abrir la demo</a>
            </div>
            <ul className="glh-demo-cta-vistas" aria-label="Qué vas a ver en la demo">
              <li><span className="glh-app-ico"><Svg size={22} width={2}>{TELEFONO}</Svg></span><b>Vista del cliente</b><span>Arma su pedido con la carta y las promos, desde el celular.</span></li>
              <li><span className="glh-app-ico"><Svg size={22} width={2}>{PANEL}</Svg></span><b>Panel del local</b><span>Recibís el pedido, lo revisás y lo confirmás.</span></li>
            </ul>
          </div>
        </section>

        <section id="beneficios" className="glh-beneficios" aria-labelledby="glh-ben-titulo">
          <h2 id="glh-ben-titulo">Lo que hace por tu local</h2>
          <ul>
            {BENEFICIOS.map((b) => (
              <li key={b.titulo}><span className="glh-app-ico"><Svg size={22} width={2.2}>{TILDE}</Svg></span><b>{b.titulo}</b><span>{b.texto}</span></li>
            ))}
          </ul>
        </section>

        <section id="contacto" className="glh-contacto" aria-labelledby="glh-contacto-titulo">
          <div className="glh-contacto-in">
            <div className="glh-contacto-txt">
              <span className="glh-etiqueta">Contacto</span>
              <h2 id="glh-contacto-titulo">¿Querés GESTLOK en tu comercio?</h2>
              <p>Dejanos tu mensaje y te respondemos.</p>
              <ul>
                <li><Svg size={20} width={2.2}>{TILDE}</Svg><span>Tu mensaje llega directo al panel de GESTLOK.</span></li>
                <li><Svg size={20} width={2.2}>{TILDE}</Svg><span>Tus datos se usan solo para responderte.</span></li>
                <li><Svg size={20} width={2.2}>{TILDE}</Svg><span>No hace falta tener cuenta.</span></li>
              </ul>
              <button type="button" className="glh-btn glh-btn-linea" onClick={() => setEmmaAbierta(true)}>
                <Svg size={20} width={2}>{BURBUJA}</Svg><span>¿Duda rápida? Preguntale a Emma</span>
              </button>
            </div>

            {estado === "ok" ? (
              <div className="glh-form glh-gracias" role="status">
                <span className="glh-gracias-ico"><Svg size={28} width={2.4}>{TILDE}</Svg></span>
                <h3>¡Gracias{form.nombre.trim() ? ", " + form.nombre.trim().split(" ")[0] : ""}!</h3>
                <p>Recibimos tu mensaje. Te respondemos por email{form.telefono.trim() ? " o al teléfono que dejaste" : ""}.</p>
                <button type="button" className="glh-btn glh-btn-linea" onClick={() => { setForm(FORM_VACIO); setEstado("idle"); }}>Enviar otro mensaje</button>
              </div>
            ) : (
              <form className="glh-form" onSubmit={enviar} noValidate aria-labelledby="glh-form-titulo">
                <h3 id="glh-form-titulo">Escribinos</h3>
                <div className="glh-campo">
                  <label htmlFor="glh-nombre">Nombre</label>
                  <input ref={nombreRef} id="glh-nombre" name="name" type="text" autoComplete="name" maxLength={80} placeholder="Tu nombre"
                    value={form.nombre} onChange={(e) => cambiar("nombre", e.target.value)} required />
                </div>
                <div className="glh-campo">
                  <label htmlFor="glh-telefono">Teléfono <small>(opcional)</small></label>
                  <input id="glh-telefono" name="tel" type="tel" autoComplete="tel" maxLength={30} placeholder="11 1234-5678"
                    value={form.telefono} onChange={(e) => cambiar("telefono", e.target.value)} />
                </div>
                <div className="glh-campo">
                  <label htmlFor="glh-email">Email</label>
                  <input id="glh-email" name="email" type="email" autoComplete="email" maxLength={120} placeholder="tu@email.com"
                    value={form.email} onChange={(e) => cambiar("email", e.target.value)} required />
                </div>
                <div className="glh-campo">
                  <label htmlFor="glh-mensaje">Mensaje</label>
                  <textarea id="glh-mensaje" name="message" rows={4} maxLength={2000} placeholder="Contanos qué necesitás"
                    value={form.mensaje} onChange={(e) => cambiar("mensaje", e.target.value)} required />
                </div>
                <div className="glh-trampa" aria-hidden="true">
                  <label htmlFor="glh-web">No completar</label>
                  <input id="glh-web" name="web" type="text" tabIndex={-1} autoComplete="off" value={form.web} onChange={(e) => cambiar("web", e.target.value)} />
                </div>
                <label className="glh-acepto">
                  <input type="checkbox" checked={form.acepto} onChange={(e) => cambiar("acepto", e.target.checked)} />
                  <span>Acepto que GESTLOK use estos datos solo para responder mi mensaje.</span>
                </label>
                {error ? <p className="glh-error" role="alert">{error}</p> : null}
                <button type="submit" className="glh-btn glh-btn-enviar" disabled={estado === "enviando"}>
                  {estado === "enviando" ? "Enviando…" : "Enviar mensaje"}
                </button>
              </form>
            )}
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

      {emmaAbierta ? (
        <div className="glh-emma" role="dialog" aria-labelledby="glh-emma-titulo">
          <div className="glh-emma-cab">
            <span className="glh-emma-av" aria-hidden="true">E</span>
            <div>
              <h2 id="glh-emma-titulo">Emma</h2>
              <span>Asistente de GESTLOK</span>
            </div>
            <button type="button" className="glh-emma-x" onClick={cerrarEmma} aria-label="Cerrar chat con Emma">
              <Svg size={22} width={2}><path d="M6 6l12 12M18 6 6 18" /></Svg>
            </button>
          </div>
          <div className="glh-emma-lista" ref={listaRef} aria-live="polite">
            {mensajes.map((m, i) => (
              <div key={i} className={"glh-burbuja " + (m.de === "yo" ? "glh-yo" : "glh-ella")}>
                <span>{m.texto}</span>
                {m.demo ? <a className="glh-btn glh-btn-navy glh-btn-chico" href="/demo/">Abrir la demo</a> : null}
                {m.registrarme ? <a className="glh-btn glh-btn-teal glh-btn-chico" href="/login/#registrarme">Registrarme y empezar</a> : null}
                {m.contacto ? <button type="button" className="glh-btn glh-btn-navy glh-btn-chico" onClick={irAContacto}>Ir al formulario de contacto</button> : null}
              </div>
            ))}
            {escribiendo ? <div className="glh-burbuja glh-ella glh-escribe">Emma está escribiendo…</div> : null}
            {!escribiendo ? (
              <div className="glh-sugerencias" role="group" aria-label="Preguntas sugeridas">
                {sugerencias.map((s) => <button type="button" key={s} onClick={() => preguntar(s)}>{s}</button>)}
              </div>
            ) : null}
          </div>
          <form className="glh-emma-pie" onSubmit={(e) => { e.preventDefault(); preguntar(pregunta); }}>
            <div>
              <label htmlFor="glh-emma-pregunta" className="glh-oculto">Tu pregunta</label>
              <input ref={preguntaRef} id="glh-emma-pregunta" type="text" maxLength={300} autoComplete="off" placeholder="Escribí tu pregunta"
                value={pregunta} onChange={(e) => setPregunta(e.target.value)} />
              <button type="submit" aria-label="Enviar pregunta" disabled={!pregunta.trim() || escribiendo}>
                <Svg size={20} width={2}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
              </button>
            </div>
            <small>Emma responde consultas simples. Para lo demás, usá el formulario de contacto.</small>
          </form>
        </div>
      ) : (
        <button ref={lanzadorRef} type="button" className="glh-lanzador" onClick={() => setEmmaAbierta(true)}>
          <Svg size={22} width={2}>{BURBUJA}</Svg><span>Hablá con Emma</span>
        </button>
      )}
    </div>
  );
}
