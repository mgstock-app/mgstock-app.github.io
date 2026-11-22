"use client";

// Inicio publicitario de gestlok.com.ar: Ingresar/Registrarme, carrusel de micro apps,
// Contacto (el mensaje llega al panel de la creadora) y Emma, la asistente de la web.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { EMMA_SALUDO, EMMA_SUGERENCIAS, responderEmma } from "@/lib/gestlok-emma";

// Clave pública (anon): los permisos los controla la base. Solo puede enviar mensajes.
const SUPABASE_URL = "https://vgsepaaewbctjsjcpeta.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnc2VwYWFld2JjdGpzamNwZXRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NDEwNjEsImV4cCI6MjEwODExNzA2MX0.WFeUP95DJAOOsiZ5BbBvqT1QURmA5KJLDjlDpwuU838";

type IdApp = "chat" | "caja" | "scanner" | "stock" | "precios" | "empleados" | "horarios" | "resenas" | "nfc" | "sucursales";

const MICRO_APPS: ReadonlyArray<{ id: IdApp; nombre: string; texto: string }> = [
  { id: "chat", nombre: "GESTLOK Chat", texto: "Pedidos y consultas por chat, también con el local cerrado." },
  { id: "caja", nombre: "GESTLOK Caja", texto: "Apertura, medios de pago, gastos, retiros y arqueo del día." },
  { id: "scanner", nombre: "Plan Scanner", texto: "Escaneá con el celular, cobrá y el stock se descuenta solo." },
  { id: "stock", nombre: "Stock y proveedores", texto: "Existencias, conteos y pedidos a proveedores por local." },
  { id: "precios", nombre: "Precios", texto: "Costos, márgenes y precios de venta siempre al día." },
  { id: "empleados", nombre: "Empleados", texto: "Legajos y recibos, con permisos para cada rol." },
  { id: "horarios", nombre: "Horarios", texto: "Turnos semanales e historial de cada colaborador." },
  { id: "resenas", nombre: "Reseñas con cupón", texto: "Más reseñas en Google, con un beneficio para tu cliente." },
  { id: "nfc", nombre: "NFC y QR", texto: "Placas para reseñas y cartas: acercan el celular o escanean." },
  { id: "sucursales", nombre: "Vínculo entre sucursales", texto: "Pedidos, envíos y avisos entre tus locales." },
];

const ICONOS: Record<IdApp, ReactNode> = {
  chat: <><path d="M20 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5z" /><path d="M9 11h6M9 14h4" /></>,
  caja: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10.5h18M15.5 15h2" /></>,
  scanner: <><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M8.5 9v6M11 9v6M13.5 9v6M15.5 9v6" /></>,
  stock: <><path d="M12 3 20 7.5 12 12 4 7.5z" /><path d="M4 7.5v9L12 21l8-4.5v-9M12 12v9" /></>,
  precios: <><path d="M20.5 12.6 12.6 20.5a1.6 1.6 0 0 1-2.3 0L3.5 13.7V3.5h10.2l6.8 6.8a1.6 1.6 0 0 1 0 2.3z" /><circle cx="8" cy="8" r="1.4" /></>,
  empleados: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2 .7 3.5 2.6 3.5 5.7" /></>,
  horarios: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  resenas: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  nfc: <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><path d="M14 14h2.5v2.5H14zM20.5 14v.01M14 20.5h.01M17.5 20.5h3v-3" /></>,
  sucursales: <path d="M3 10 4.5 5h5L11 10M4 10v9h6v-9M13 10l1.5-5h5L21 10M14 10v9h6v-9M10 14.5h4" />,
};

function Svg({ children, size = 24, width = 1.8 }: { children: ReactNode; size?: number; width?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
}

const BURBUJA = <path d="M20 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5z" />;
const TILDE = <path d="M5 12.5l4.5 4.5L19 7.5" />;

type Mensaje = { de: "emma" | "yo"; texto: string; contacto?: boolean };
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
  const [form, setForm] = useState<Form>(FORM_VACIO);
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok">("idle");
  const [error, setError] = useState("");
  const [emmaAbierta, setEmmaAbierta] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ de: "emma", texto: EMMA_SALUDO }]);
  const [pregunta, setPregunta] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  const preguntaRef = useRef<HTMLInputElement>(null);
  const lanzadorRef = useRef<HTMLButtonElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (emmaAbierta) preguntaRef.current?.focus();
  }, [emmaAbierta]);
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
      setMensajes((m) => [...m, { de: "emma", texto: r.texto, contacto: r.contacto }]);
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

  const tarjetas = [...MICRO_APPS.map((a) => ({ ...a, copia: false })), ...MICRO_APPS.map((a) => ({ ...a, copia: true }))];

  return (
    <div className="glh">
      <header className="glh-top">
        <div className="glh-top-in">
          <div className="glh-acceso">
            <a className="glh-btn glh-btn-borde" href="/login/">Ingresar</a>
            <a className="glh-btn glh-btn-teal" href="/login/#registrarme">Registrarme</a>
          </div>
          <nav className="glh-nav" aria-label="Secciones">
            <a href="#micro-apps">Micro apps</a>
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
          {/* eslint-disable-next-line @next/next/no-img-element -- ícono SVG de la marca */}
          <img className="glh-hero-logo" src="/icons/gestlok.svg" alt="" width={88} height={88} />
          <h1>Gest<em>Lok</em></h1>
          <p className="glh-lema">Tu negocio, en orden.</p>
          <p className="glh-bajada">Micro apps para comercios: atención por chat, caja, stock, precios, personal y más. Desde el celular o la computadora.</p>
          <div className="glh-hero-acciones">
            <a className="glh-btn glh-btn-navy glh-btn-xl" href="#micro-apps">Ver micro apps</a>
            <a className="glh-btn glh-btn-claro glh-btn-xl" href="#contacto">Contacto</a>
          </div>
        </section>

        <section id="micro-apps" className="glh-apps" aria-labelledby="glh-apps-titulo">
          <div className="glh-apps-cab">
            <div>
              <h2 id="glh-apps-titulo">Micro apps GESTLOK</h2>
              <p>Cada comercio usa las que necesita, con sus propios datos y permisos.</p>
            </div>
            <button type="button" className="glh-btn glh-btn-claro glh-pausa" onClick={() => setPausado((p) => !p)} aria-pressed={pausado}>
              <Svg size={18} width={2}>{pausado ? <path d="M8 5.5v13l10.5-6.5z" /> : <path d="M9 6v12M15 6v12" />}</Svg>
              <span>{pausado ? "Reanudar" : "Pausar"}</span>
            </button>
          </div>
          <div className="glh-carrusel">
            <div className={"glh-pista" + (pausado ? " glh-pausada" : "")}>
              {tarjetas.map((a, i) => (
                <article key={a.id + i} className="glh-app" aria-hidden={a.copia || undefined}>
                  <span className="glh-app-ico"><Svg>{ICONOS[a.id]}</Svg></span>
                  <h3>{a.nombre}</h3>
                  <p>{a.texto}</p>
                </article>
              ))}
            </div>
          </div>
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
                {m.contacto ? <button type="button" className="glh-btn glh-btn-navy glh-btn-chico" onClick={irAContacto}>Ir al formulario de contacto</button> : null}
              </div>
            ))}
            {escribiendo ? <div className="glh-burbuja glh-ella glh-escribe">Emma está escribiendo…</div> : null}
            {mensajes.length === 1 ? (
              <div className="glh-sugerencias">
                {EMMA_SUGERENCIAS.map((s) => <button type="button" key={s} onClick={() => preguntar(s)}>{s}</button>)}
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
