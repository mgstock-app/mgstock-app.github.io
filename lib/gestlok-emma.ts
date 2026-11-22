// Emma, asistente de la web pública de GESTLOK. Responde consultas simples con textos
// fijos y revisados (sin IA todavía, sin costo y sin enviar datos a ningún servicio).
// Lo que no sabe lo deriva al formulario de Contacto, que llega al panel de la creadora.

export type RespuestaEmma = { texto: string; contacto?: boolean };

type Tema = { claves: RegExp; texto: string; contacto?: boolean };

export const EMMA_SALUDO =
  "¡Hola! Soy Emma, la asistente de GESTLOK. Te cuento qué hace cada micro app, cómo registrarte y qué le puede servir a tu comercio. ¿En qué te ayudo?";

export const EMMA_SUGERENCIAS = [
  "¿Qué es GESTLOK?",
  "¿Qué micro apps hay?",
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
    texto: "Los planes dependen de las micro apps que elijas y de la cantidad de locales. Dejanos tu mensaje en Contacto y te pasamos una propuesta.", contacto: true },
  { claves: /(registr|crear (una |mi )?cuenta|darme de alta|\balta\b|empezar|comenzar|como (lo )?uso)/,
    texto: "Tocá «Registrarme» arriba y creá tu cuenta con tu email. Para entrar a tu empresa, GESTLOK la da de alta con ese mismo email y te habilita el acceso. Si todavía no hablaste con nosotros, dejanos un mensaje en Contacto." },
  { claves: /(ingres|entrar|login|iniciar sesion|contrasena|clave|olvide)/,
    texto: "Si ya tenés cuenta, tocá «Ingresar» arriba. Ahí también podés recuperar tu contraseña con «Olvidé mi contraseña»." },
  { claves: /(stock|inventario|proveedor|conteo|mercaderia|existencia)/,
    texto: "Stock y proveedores te deja controlar existencias y conteos por local, y organizar los pedidos a tus proveedores." },
  { claves: /(precio|margen|costo|lista de precios)/,
    texto: "La micro app Precios reúne costos, márgenes y precios de venta para que estén siempre al día." },
  { claves: /(gestlok chat|\bchat\b|pedido|atencion|clientes? (me )?escrib|delivery|para llevar)/,
    texto: "GESTLOK Chat atiende a tus clientes por chat: ven tu catálogo, arman el pedido desde el celular y vos lo confirmás desde tu panel. Sirve para cualquier rubro y también toma pedidos programados cuando el local está cerrado." },
  { claves: /(caja|arqueo|medios? de pago|cierre|apertura|retiro|gasto)/,
    texto: "GESTLOK Caja ordena la caja del día: apertura, cobros por medio de pago, gastos, retiros y arqueo al cerrar." },
  { claves: /(scanner|escane|codigo de barras|vender|ventas|cobrar)/,
    texto: "Con Plan Scanner escaneás los productos con la cámara del celular, armás el carrito, cobrás y el stock se descuenta solo." },
  { claves: /(emplead|personal|recibo|legajo|sueldo|horario|turno|colaborador)/,
    texto: "Empleados guarda legajos y recibos con permisos para cada rol, y Horarios organiza los turnos semanales con el historial de cada colaborador." },
  { claves: /(resena|google|cupon|opinion|estrellas)/,
    texto: "Reseñas con cupón te ayuda a sumar reseñas en Google: el cliente deja su opinión y recibe un cupón de descuento." },
  { claves: /(nfc|\bqr\b|placa|carta|menu)/,
    texto: "Con NFC y QR tenés placas para reseñas y cartas: el cliente acerca el celular o escanea el código. El destino se puede cambiar sin reimprimir la placa." },
  { claves: /(sucursal|varios locales|otro local|dos locales|cadena)/,
    texto: "GESTLOK trabaja por empresa y sucursal: cada local tiene sus datos, y Vínculo entre sucursales ordena pedidos, envíos y avisos entre tus locales." },
  { claves: /(micro ?apps?|aplicaciones|apps|funciones|que hace|herramientas|modulos)/,
    texto: "Hoy GESTLOK tiene: GESTLOK Chat, GESTLOK Caja, Plan Scanner, Stock y proveedores, Precios, Empleados, Horarios, Reseñas con cupón, NFC y QR y Vínculo entre sucursales. Preguntame por cualquiera y te cuento más." },
  { claves: /(celular|instal|android|iphone|computadora|descarg|play store|app store)/,
    texto: "GESTLOK funciona en el navegador del celular y de la computadora. En Android y iPhone podés agregarlo a la pantalla de inicio, sin descargar nada de una tienda." },
  { claves: /(rubro|ferreteria|cafeteria|perfumeria|kiosco|restaurant|gastronom|pet ?shop|almacen|negocio|comercio)/,
    texto: "GESTLOK se adapta a distintos rubros: gastronomía, cafeterías, perfumerías, ferreterías, pet shops y más. Cada comercio elige las micro apps que le sirven." },
  { claves: /(segur|datos|privacidad|confiable)/,
    texto: "Cada empresa y cada local tienen sus propios datos y permisos: nadie ve la información de otro comercio. La política de privacidad está al pie de la página." },
  { claves: /(gestlok|para que sirve|de que se trata)/,
    texto: "GESTLOK es una plataforma web para ordenar tu negocio. Reúne micro apps para atención por chat, caja, stock, precios, personal y más, y cada comercio usa las que necesita." },
  { claves: /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey)\b/,
    texto: "¡Hola! ¿En qué te ayudo? Puedo contarte qué es GESTLOK, qué micro apps hay y cómo registrarte." },
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
