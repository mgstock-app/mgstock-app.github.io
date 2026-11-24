// Emma, asistente de la web pública de GESTLOK. Responde consultas simples con textos
// fijos y revisados (sin IA todavía, sin costo y sin enviar datos a ningún servicio).
// Lo que no sabe lo deriva al formulario de Contacto, que llega al panel de la creadora.

export type RespuestaEmma = { texto: string; contacto?: boolean; registrarme?: boolean; demo?: boolean };

type Tema = { claves: RegExp; texto: string; contacto?: boolean; registrarme?: boolean; demo?: boolean };

// Precios vigentes (decisión de la administradora, 23/11/2026). Mantener igual que gestlok_chat_private.cobro_ajustes.
export const PRECIOS = { cuota: 70000, adaptacion: 50000, descuentoPrimerMes: 15 } as const;
const pesos = (n: number) => "$ " + Math.round(n).toLocaleString("es-AR");
const PRIMER_MES = pesos(PRECIOS.cuota * (100 - PRECIOS.descuentoPrimerMes) / 100);
const CIERRE = " ¿Arrancamos? Tocá «Registrarme», elegí GESTLOK Chat y en pocos minutos tu comercio queda en revisión.";

export const EMMA_SALUDO =
  "¡Hola! Soy Emma, la asistente de GESTLOK. Te cuento cómo funciona GESTLOK Chat, qué le puede servir a tu comercio y cómo empezar. ¿En qué te ayudo?";

export const EMMA_SUGERENCIAS = [
  "¿Qué es GESTLOK Chat?",
  "¿Cómo funciona?",
  "Quiero ver la demo",
  "¿Cuánto cuesta?",
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
  { claves: /(descuento|promo(cion)? de lanzamiento|oferta|bonific|prueba gratis|gratis|tienen (alguna )?promo)/,
    texto: "Promo de lanzamiento: el primer mes de GESTLOK Chat tiene " + PRECIOS.descuentoPrimerMes + "% de descuento, queda en " + PRIMER_MES +
      ". Después son " + pesos(PRECIOS.cuota) + " por mes por local, con soporte incluido." + CIERRE, registrarme: true },
  { claves: /(\bdemo\b|demostracion|probar(lo)?\b|ver como (queda|anda|se ve)|verlo funcionando)/,
    texto: "Podés probarlo ahora en la demo: hacés un pedido como cliente y ves cómo le llega al panel del local, en la misma pantalla. " +
      "Es un local de ejemplo, no se envía nada a ningún comercio.", demo: true },
  { claves: /(cuanto (sale|cuesta|vale|cobran)|precio|plan(es)?\b|abono|tarifa|suscrip|mensual|presupuesto|cotiz|pago|pagar|tarjeta|mercado ?pago)/,
    texto: "GESTLOK Chat cuesta " + pesos(PRECIOS.cuota) + " por mes por local, con soporte incluido, y por lanzamiento el primer mes tiene " +
      PRECIOS.descuentoPrimerMes + "% de descuento: " + PRIMER_MES + ". Se paga con débito automático por Mercado Pago y empezás a pagar recién cuando tu chat está activo. " +
      "Si querés, por única vez (" + pesos(PRECIOS.adaptacion) + ", opcional) te dejamos todo listo: carta, precios, promos y el asistente adaptados a tu local." + CIERRE, registrarme: true },
  { claves: /(adapta|configur|cargar (la |mi )?carta|me lo arm|lo arman|carga(n|r) (los )?precios)/,
    texto: "Vos podés cargar tu carta solo, incluso desde un PDF o una foto. Si preferís no ocuparte, por " + pesos(PRECIOS.adaptacion) +
      " (una sola vez, opcional) dejamos todo listo: carta, precios, promos, mensajes y el asistente adaptados a tu local." + CIERRE, registrarme: true },
  { claves: /(registr|crear (una |mi )?cuenta|darme de alta|\balta\b|empezar|comenzar|como (lo )?uso|contratar|quiero (el|probar|usarlo))/,
    texto: "Es simple: 1) tocá «Registrarme» y creá tu cuenta con tu email; 2) elegí «GESTLOK Chat» y escribí el nombre de tu comercio y el rubro; " +
      "3) revisamos tu comercio y te lo activamos; 4) cargás tu carta y compartís el link o el QR con tus clientes. El primer mes tiene " +
      PRECIOS.descuentoPrimerMes + "% de descuento.", registrarme: true },
  { claves: /(ingres|entrar|login|iniciar sesion|contrasena|clave|olvide)/,
    texto: "Si ya tenés cuenta, tocá «Ingresar» arriba. Ahí también podés recuperar tu contraseña con «Olvidé mi contraseña»." },
  { claves: /(como funciona|que hace|funciones|paso a paso)/,
    texto: "Tu cliente abre el chat de tu local, toca «Hacer un pedido», arma su pedido con la carta y las promos, y lo envía. Te llega al panel con aviso sonoro, lo confirmás y el cliente sigue el estado en vivo. Más arriba, en «Así funciona», están las pantallas reales, y en la demo lo podés probar vos.", demo: true },
  { claves: /(\bqr\b|codigo|cartel|mesa|vidriera|instagram|whatsapp)/,
    texto: "Tu local tiene su link propio para Instagram, WhatsApp o Google, y su QR para imprimir en el mostrador, las mesas o la vidriera: el cliente lo escanea y entra directo a hacer su pedido." + CIERRE, registrarme: true },
  { claves: /(caja|scanner|escane|stock|inventario|proveedor|margen|emplead|sueldo|recibo|horario|turno|nfc|placa|micro ?apps?|aplicaciones|modulos|otras herramientas)/,
    texto: "Por ahora ofrecemos GESTLOK Chat. Estamos preparando más herramientas: si te interesa alguna, dejanos tu mensaje en Contacto y te avisamos.", contacto: true },
  { claves: /(resena|google|opinion|estrellas)/,
    texto: "Cuando el pedido está listo o sale en camino, GESTLOK Chat invita al cliente a contar su experiencia en Google, con un botón directo a tu perfil." },
  { claves: /(gestlok chat|\bchat\b|pedido|atencion|clientes? (me )?escrib|delivery|para llevar)/,
    texto: "GESTLOK Chat atiende a tus clientes por chat: ven tu catálogo, arman el pedido desde el celular y vos lo confirmás desde tu panel. Sirve para cualquier rubro y también toma pedidos programados cuando el local está cerrado. Sin comisiones por pedido: pagás solo la cuota mensual." + CIERRE, registrarme: true },
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
  return { texto: tema.texto, contacto: tema.contacto, registrarme: tema.registrarme, demo: tema.demo };
}
