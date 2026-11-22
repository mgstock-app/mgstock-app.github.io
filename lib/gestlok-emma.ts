// Emma, asistente de la web pública de GESTLOK. Responde consultas simples con textos
// fijos y revisados (sin IA todavía, sin costo y sin enviar datos a ningún servicio).
// Lo que no sabe lo deriva al formulario de Contacto, que llega al panel de la creadora.

export type RespuestaEmma = { texto: string; contacto?: boolean };

type Tema = { claves: RegExp; texto: string; contacto?: boolean };

export const EMMA_SALUDO =
  "¡Hola! Soy Emma, la asistente de GESTLOK. Te cuento cómo funciona GESTLOK Chat, qué le puede servir a tu comercio y cómo empezar. ¿En qué te ayudo?";

export const EMMA_SUGERENCIAS = [
  "¿Qué es GESTLOK Chat?",
  "¿Cómo funciona?",
  "¿Cómo me registro?",
  "Hablar con una persona",
] as const;

const NO_SE =
  "Esa consulta prefiero que la vea una persona del equipo. Dejanos tu mensaje en Contacto y te respondemos.";

// El orden importa: gana el primer tema que coincide.
const TEMAS: Tema[] = [
  { claves: /\b(gracias|genial|perfecto|buenisimo)\b/, texto: "¡De nada! Si necesitás algo más, acá estoy." },
  { claves: /(hablar con|una persona|humano|asesor|vendedor|contact|comunicar)/,
    texto: "Claro. Dejanos tu mensaje en el formulario de Contacto y una persona del equipo te responde.", contacto: true },
  { claves: /(cuanto (sale|cuesta|vale|cobran)|plan(es)?\b|abono|tarifa|suscrip|mensual|presupuesto|cotiz)/,
    texto: "El precio depende de la cantidad de locales. Dejanos tu mensaje en Contacto y te pasamos una propuesta.", contacto: true },
  { claves: /(registr|crear (una |mi )?cuenta|darme de alta|\balta\b|empezar|comenzar|como (lo )?uso)/,
    texto: "Tocá «Registrarme» arriba y creá tu cuenta con tu email. Para entrar a tu empresa, GESTLOK la da de alta con ese mismo email y te habilita el acceso. Si todavía no hablaste con nosotros, dejanos un mensaje en Contacto." },
  { claves: /(ingres|entrar|login|iniciar sesion|contrasena|clave|olvide)/,
    texto: "Si ya tenés cuenta, tocá «Ingresar» arriba. Ahí también podés recuperar tu contraseña con «Olvidé mi contraseña»." },
  { claves: /(como funciona|que hace|funciones|paso a paso)/,
    texto: "Tu cliente abre el chat de tu local, toca «Hacer un pedido», arma su pedido con la carta y las promos, y lo envía. Te llega al panel con aviso sonoro, lo confirmás y el cliente sigue el estado en vivo. Más arriba, en «Así funciona», están las pantallas reales." },
  { claves: /(caja|scanner|escane|stock|inventario|proveedor|precio|margen|emplead|sueldo|recibo|horario|turno|nfc|\bqr\b|placa|sucursal|micro ?apps?|aplicaciones|modulos|otras herramientas)/,
    texto: "Por ahora ofrecemos GESTLOK Chat. Estamos preparando más herramientas: si te interesa alguna, dejanos tu mensaje en Contacto y te avisamos.", contacto: true },
  { claves: /(resena|google|opinion|estrellas)/,
    texto: "Cuando el pedido está listo o sale en camino, GESTLOK Chat invita al cliente a contar su experiencia en Google, con un botón directo a tu perfil." },
  { claves: /(gestlok chat|\bchat\b|pedido|atencion|clientes? (me )?escrib|delivery|para llevar)/,
    texto: "GESTLOK Chat atiende a tus clientes por chat: ven tu catálogo, arman el pedido desde el celular y vos lo confirmás desde tu panel. Sirve para cualquier rubro y también toma pedidos programados cuando el local está cerrado." },
  { claves: /(cupon)/,
    texto: "GESTLOK Chat no da cupones a cambio de reseñas: Google lo prohíbe. Invita al cliente a contar su experiencia, sin incentivos." },
  { claves: /(celular|instal|android|iphone|computadora|descarg|play store|app store)/,
    texto: "GESTLOK funciona en el navegador del celular y de la computadora. En Android y iPhone podés agregarlo a la pantalla de inicio, sin descargar nada de una tienda." },
  { claves: /(rubro|ferreteria|cafeteria|perfumeria|kiosco|restaurant|gastronom|pet ?shop|almacen|negocio|comercio)/,
    texto: "GESTLOK Chat sirve para cualquier rubro: gastronomía, cafeterías, perfumerías, ferreterías, pet shops y más. Cada local carga su carta o catálogo y sus promos." },
  { claves: /(segur|datos|privacidad|confiable)/,
    texto: "Cada empresa y cada local tienen sus propios datos y permisos: nadie ve la información de otro comercio. La política de privacidad está al pie de la página." },
  { claves: /(gestlok|para que sirve|de que se trata)/,
    texto: "GESTLOK Chat es el chat de pedidos de tu local: tus clientes piden solos con tu carta y tus promos, las 24 horas, y vos confirmás cada pedido desde tu panel." },
  { claves: /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey)\b/,
    texto: "¡Hola! ¿En qué te ayudo? Puedo contarte qué es GESTLOK Chat, cómo funciona y cómo empezar." },
];

export function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[¿?¡!.,;:()"']/g, " ").replace(/\s+/g, " ").trim();
}

export function responderEmma(pregunta: string): RespuestaEmma {
  const t = normalizar(pregunta);
  if (!t) return { texto: "Escribí tu pregunta y te ayudo." };
  const tema = TEMAS.find((x) => x.claves.test(t));
  if (!tema) return { texto: NO_SE, contacto: true };
  return { texto: tema.texto, contacto: tema.contacto };
}
