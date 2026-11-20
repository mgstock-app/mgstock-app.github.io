/* GESTLOK Chat · función segura pública (chat.gestlok.com.ar → Supabase).
 * - Es la ÚNICA puerta del público a la base: usa service_role y solo llama a public.gestlok_chat_srv_*.
 * - La sesión del cliente es un token aleatorio que vive en su teléfono; acá se guarda solo su hash SHA-256.
 * - Topes por IP, por conversación y por sucursal (en la base). Textos acotados. CORS solo para los dominios propios.
 * - Precios, totales, disponibilidad y numeración los decide la base. El asistente solo arma el carrito.
 * - No guarda nombre, teléfono ni dirección en el chat: esos datos van únicamente en el pedido.
 * - Prioridad: botones y carrito (asistente guiado, sin costo). La IA escribe la bienvenida y responde solo lo que
 *   el guiado no entiende; si no hay IA o falla, la consulta pasa al gerente por el mismo chat.
 * - Los avisos de estado del pedido (recibido, confirmado, listo, rechazado) los arma el sistema con los mensajes
 *   del local; la IA no interviene.
 * Secretos: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (automáticos), GESTLOK_CHAT_SALT (recomendado),
 * GESTLOK_CHAT_ORIGINS (opcional), GESTLOK_CHAT_IA_PROVEEDOR («anthropic» u «openai»), GESTLOK_CHAT_IA_CLAVE,
 * GESTLOK_CHAT_IA_MODELO y GESTLOK_CHAT_IA_URL (opcionales).
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { cierrePedido, clasificarSoporte, consultaAjena, describirLinea, formalizar, responder, textoEstadoPedido, totalCarrito } from "./motor.js";
import { bienvenidaIA, responderIA } from "./ia.js";

type Json = Record<string, unknown>;
type Turno = {
  estado: Json & { carrito: unknown[]; paso?: unknown };
  mensajes: Json[];
  accion?: { tipo: string; pedido?: unknown; motivo?: string };
  motor?: string;
};
const env = (k: string) => Deno.env.get(k) || "";
const ORIGENES = (env("GESTLOK_CHAT_ORIGINS") || "https://chat.gestlok.com.ar,https://gestlok.com.ar,https://www.gestlok.com.ar")
  .split(",").map((s) => s.trim()).filter(Boolean);
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const BOTON_TEXTO: Record<string, string> = {
  carta: "Ver la carta", horario: "Horario y envío", pago: "Medios de pago", finalizar: "Finalizar pedido",
  carrito: "Ver mi pedido", estado: "¿Cómo va mi pedido?", cancelar: "Cancelar pedido",
  soporte: "Ayuda con mi pedido", demora: "Consultar demora", reclamo_demora: "Avisar demora al gerente",
  reclamo_faltante: "Faltante en mi pedido", reclamo_otro: "Otro reclamo",
  hablar_gerente: "Hablar con el gerente", programar_si:"Sí, dejar pedido programado", programar_no:"No, gracias",
};

function cors(origen: string | null): HeadersInit {
  const ok = origen && ORIGENES.includes(origen);
  return {
    "Access-Control-Allow-Origin": ok ? origen! : ORIGENES[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origen: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origen), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
async function sha256Hex(texto: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Error de la base → texto para el cliente (solo mensajes pensados para mostrarse). */
function textoError(e: { code?: string; message?: string } | null) {
  if (e && (e.code === "P0001" || e.code === "22023") && e.message) return e.message;
  if (e?.code === "42501") return "No pudimos validar tu sesión. Recargá la página.";
  return "Hubo un problema de conexión. Probá de nuevo en un momento.";
}
async function rpc(fn: string, args: Json) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data as Json;
}
const IA = {
  proveedor: env("GESTLOK_CHAT_IA_PROVEEDOR") || (env("GESTLOK_CHAT_IA_CLAVE") ? "anthropic" : ""),
  clave: env("GESTLOK_CHAT_IA_CLAVE"), modelo: env("GESTLOK_CHAT_IA_MODELO"), url: env("GESTLOK_CHAT_IA_URL"),
};

/** Valida y recorta la entrada del cliente (nunca se confía en el navegador). */
function limpiarEntrada(e: unknown): Json | null {
  if (!e || typeof e !== "object") return null;
  const x = e as Json; const out: Json = {};
  if (typeof x.texto === "string") {
    // Sin caracteres de control (salvo salto de línea y tabulación).
    out.texto = [...x.texto].filter((c) => { const n = c.charCodeAt(0); return n === 9 || n === 10 || (n >= 32 && n !== 127); })
      .join("").trim().slice(0, 600);
  }
  if (typeof x.boton === "string" && /^[a-z0-9:_-]{1,80}$/i.test(x.boton)) out.boton = x.boton;
  if (Number.isInteger(x.quitar) && (x.quitar as number) >= 0 && (x.quitar as number) < 30) out.quitar = x.quitar;
  if (x.agregar && typeof x.agregar === "object") {
    const a = x.agregar as Json;
    const opciones: Record<string, string[] | Record<string, number>> = {};
    if (a.opciones && typeof a.opciones === "object") {
      for (const [k, v] of Object.entries(a.opciones as Json).slice(0, 8)) {
        if (!/^[a-z0-9_]{1,30}$/.test(k)) continue;
        if (Array.isArray(v)) opciones[k] = v.filter((i) => typeof i === "string" && /^[a-z0-9_]{1,30}$/.test(i)).slice(0, 30);
        // Promos: {variedad: cantidad} (enteros de 0 a 50).
        else if (v && typeof v === "object") {
          opciones[k] = Object.fromEntries(Object.entries(v as Json).slice(0, 40)
            .filter(([id, n]) => /^[a-z0-9_]{1,30}$/.test(id) && Number.isInteger(n) && (n as number) > 0 && (n as number) <= 50)) as Record<string, number>;
        }
      }
    }
    if (typeof a.producto_id === "string" && /^[0-9a-f-]{36}$/.test(a.producto_id)) {
      out.agregar = { producto_id: a.producto_id, cantidad: Number(a.cantidad), opciones, nota: String(a.nota ?? "").slice(0, 200) };
    }
  }
  if (x.datos && typeof x.datos === "object") {
    const d = x.datos as Json; const s = (k: string, n: number) => String(d[k] ?? "").trim().slice(0, n);
    out.datos = { nombre: s("nombre", 80), telefono: s("telefono", 25), entrega: s("entrega", 10), direccion: s("direccion", 200),
      horario: s("horario", 60), medio_pago: s("medio_pago", 20), nota: s("nota", 500) };
  }
  return Object.keys(out).length ? out : null;
}

Deno.serve(async (req) => {
  const origen = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origen) });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405, origen);
  if (origen && !ORIGENES.includes(origen)) return json({ ok: false, error: "Origen no permitido" }, 403, origen);
  const crudo = await req.text();
  if (crudo.length > 12000) return json({ ok: false, error: "Mensaje demasiado largo" }, 413, origen);
  let body: Json;
  try { body = JSON.parse(crudo); } catch { return json({ ok: false, error: "Pedido inválido" }, 400, origen); }

  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "Pedido inválido" }, 400, origen);
  const slug = String(body.slug ?? "").toLowerCase();
  const token = String(body.token ?? "");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return json({ ok: false, error: "Chat inexistente" }, 404, origen);
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return json({ ok: false, error: "Sesión inválida" }, 400, origen);
  const hash = "\\x" + await sha256Hex(token);
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const dia = new Date().toISOString().slice(0, 10);
  const ipHash = (await sha256Hex((env("GESTLOK_CHAT_SALT") || "gestlok-chat") + "|" + dia + "|" + ip)).slice(0, 32);
  const accion = String(body.accion ?? "");

  try {
    const suc = await rpc("gestlok_chat_srv_sucursal", { p_slug: slug });
    if (!suc.ok) return json({ ok: false, motivo: suc.motivo, sucursal: suc.sucursal ?? null }, suc.motivo === "pausado" ? 200 : 404, origen);
    const sucursal = suc.sucursal as Json; const catalogo = suc.catalogo as Json; const sucId = suc.id as string;
    const privado = (suc.privado as Json) || {};
    const mensajesLocal = (privado.mensajes as Json) || {};
    // Cada pedido lleva el texto que corresponde a su estado, con los mensajes que configuró el local.
    // El código es solo interno del gerente. No se expone en el JSON ni en la charla pública.
    const sinCodigo = (v: string) => String(v||'').replace(/\bpedido\s+[A-Z]{1,4}-\d{4,}\b/gi,'pedido')
       .replace(/\b[A-Z]{1,4}-\d{4,}\b/g,'').replace(/\s+([.!?,])/g,'$1');
    const conAviso = (p: Json) => {
      const visible: Json = {...p};
      delete visible.codigo;
      // Pedido terminado: invitación a reseñar (solo con link de Google del local) y «Gracias por elegirnos».
      const cierre = cierrePedido(p, mensajesLocal);
      return {...visible, aviso:sinCodigo(textoEstadoPedido(p,sucursal,mensajesLocal)), ...(cierre || {})};
    };
    const conv = await rpc("gestlok_chat_srv_conversacion", { p_sucursal: sucId, p_token_hash: hash, p_ip_hash: ipHash });
    const convId = conv.id as string;

    if (accion === "abrir") {
      let mensajes = (conv.mensajes as Json[]) || [];
      let estado = (conv.estado as Json) || {};
      let extra: Json[] = [];
      if (conv.nueva) {
        const r = responder({ sucursal, catalogo, estado, entrada: { inicio: true }, mensajes: mensajesLocal });
        estado = r.estado; extra = r.mensajes;
        // La bienvenida la escribe la IA (si está activa y con clave). Botones, carrito, carta y avisos siguen
        // siendo del sistema. Si la IA tarda, falla o responde algo dudoso, queda la bienvenida guiada.
        if (privado.ia_activa !== false && IA.clave && extra.length) {
          try {
            const saludo = await bienvenidaIA({ sucursal, privado, config: IA });
            const at = (sucursal.atencion as Json) || {};
            extra = at.habilitado && at.abierto === false
              // Cerrado: saludo de la IA y, debajo, el aviso del sistema con la próxima apertura y sus botones.
              ? [{ texto: saludo }, { ...extra[0], texto: String(extra[0].texto || "").replace(/^Gracias por comunicarse\.\s*/, "") }, ...extra.slice(1)]
              : [{ ...extra[0], texto: saludo }, ...extra.slice(1)];
          } catch (e) {
            console.warn("gestlok-chat bienvenida IA no disponible → guiada", (e as Error)?.message);
          }
        }
        await rpc("gestlok_chat_srv_turno", { p_conversacion: convId, p_token_hash: hash, p_ip_hash: ipHash,
          p_cliente: "", p_respuesta: extra.map((m: Json) => m.texto).join("\n\n"), p_estado: estado });
        mensajes = [];
      }
      const soporte = await rpc("gestlok_chat_srv_respuestas", {
        p_conversacion: convId, p_token_hash: hash, p_desde: 0 });
      return json({ ok: true, sucursal, catalogo,
        mensajes: mensajes.map(m=>({...m,texto:sinCodigo(String(m.texto||''))})),
        nuevos:extra.map(m=>({...m,texto:sinCodigo(String(m.texto||''))})),
        carrito: (estado as Json).carrito ?? [],
        pedidos: ((conv.pedidos as Json[]) ?? []).map(conAviso),
        soporte_pendiente: soporte.soporte_pendiente }, 200, origen);
    }

    if (accion === "estado") {
      const desde = Number.isSafeInteger(body.desde) && (body.desde as number) >= 0
        ? (body.desde as number) : 0;
      const [est, soporte] = await Promise.all([
        rpc("gestlok_chat_srv_estado", { p_conversacion: convId, p_token_hash: hash }),
        rpc("gestlok_chat_srv_respuestas", { p_conversacion: convId, p_token_hash: hash, p_desde: desde })]);
      return json({ ok: true, pedidos: ((est.pedidos as Json[]) ?? []).map(conAviso),
        mensajes_local: ((soporte.mensajes_local as Json[]) || []).map(m=>({...m,texto:sinCodigo(String(m.texto||''))})),
        soporte_pendiente: soporte.soporte_pendiente }, 200, origen);
    }

    if (accion !== "mensaje") return json({ ok: false, error: "Acción desconocida" }, 400, origen);
    let entrada = limpiarEntrada(body.entrada);
    if (!entrada) return json({ ok: false, error: "Mensaje vacío" }, 400, origen);
    const textoOriginal = typeof entrada.texto === "string" ? String(entrada.texto) : "";
    let clase = clasificarSoporte(entrada);
    if (!clase && textoOriginal && consultaAjena(textoOriginal)) clase='consulta';
    if (!clase && textoOriginal) {
      // Si el gerente está atendiendo un reclamo, los siguientes mensajes también llegan al humano.
      const activo = await rpc("gestlok_chat_srv_respuestas", {
        p_conversacion: convId, p_token_hash: hash, p_desde: Number.MAX_SAFE_INTEGER });
      if (activo.soporte_pendiente) clase = String(activo.tipo_soporte || "otro");
    }
    if (clase && clase !== "consulta_demora") {
      // Reclamos prioritarios, sin IA: registrar el texto y la alerta en una sola transacción.
      const detalle = textoOriginal || BOTON_TEXTO[String(entrada.boton)] || "Consulta al gerente";
      const ticket = await rpc("gestlok_chat_srv_reclamo", {
        p_conversacion: convId, p_token_hash: hash, p_ip_hash: ipHash,
        p_tipo: clase, p_detalle: detalle });
      return json({ ok: true, mensajes: [{ texto: sinCodigo(String(ticket.texto)),
          botones: [{id:"estado",texto:"Estado de mi pedido"},{id:"soporte",texto:"Más ayuda"}] }],
        carrito: (conv.estado as Json)?.carrito || [], soporte_pendiente: true,
        motor: "guiado" }, 200, origen);
    }
    // Pedido ya enviado: bloquear charla libre antes de llegar a la IA.
    // Estado y reclamos siguen por el servidor, sin gasto de tokens.
    // Los pedidos se consultan de esta conversación y este token, nunca por ID del cliente.
    const pedidosActuales = Array.isArray(conv.pedidos) ? conv.pedidos as Json[] : [];
    const ultimoPedido = pedidosActuales[0] as Json | undefined;
    if (ultimoPedido && ["pendiente", "confirmado", "terminado"].includes(String(ultimoPedido.estado || ""))) {
      const boton = String(entrada.boton || "");
      const consultaEstado = boton === "estado" || /\\b(estado|como va|seguimiento|confirmaron|ya esta listo)\\b/i.test(textoOriginal);
      if (!consultaEstado && boton !== "soporte" && boton !== "reclamo_faltante" && boton !== "reclamo_otro" && boton !== "reclamo_demora" && boton !== "hablar_gerente" && boton !== "demora" && boton !== "cancelar") {
        return json({ok:true,mensajes:[{texto:"Su pedido ya fue recibido. Puede consultar su estado o solicitar ayuda al gerente.",
          botones:[{id:"estado",texto:"Ver estado del pedido"},{id:"soporte",texto:"Necesito ayuda"}]}],
          carrito:(conv.estado as Json)?.carrito || [],motor:"guiado"},200,origen);
      }
    }
    if (clase === "consulta_demora") entrada = {boton:"demora"};

    // Primero botones y carrito: el asistente guiado (sin costo) resuelve carta, pedidos, horarios, pagos y estado.
    // La IA (Gemini u otra) entra SOLO cuando el guiado no entiende un texto libre: consultas importantes y raras.
    const noEntiende = (t: Turno) => t.mensajes.length === 1 && !t.accion &&
      /^(No (le|te) entendí bien|No (puedo|sabemos) responder)/i.test(String(t.mensajes[0].texto || ''));
    let r = responder({ sucursal, catalogo, estado: conv.estado, entrada, mensajes: mensajesLocal }) as Turno;
    if (textoOriginal && noEntiende(r) && privado.ia_activa !== false && IA.clave) {
      try {
        r = await responderIA({ sucursal, privado, catalogo, estado: conv.estado, historial: conv.mensajes,
          texto: textoOriginal, config: IA }) as Turno;
      } catch (e) {
        console.warn("gestlok-chat IA no disponible → gerente", (e as Error)?.message);
      }
    }
    // Si tampoco el motor de respaldo comprende la pregunta, el gerente la recibe.
    // No se deriva un pedido válido ni una consulta de menú.
    if (textoOriginal && r.mensajes.length === 1 &&
      /^(No (le|te) entendí bien|No (puedo|sabemos) responder)/i.test(String(r.mensajes[0].texto||'')) &&
      !r.accion) {
      const t=await rpc("gestlok_chat_srv_reclamo",{
        p_conversacion:convId,p_token_hash:hash,p_ip_hash:ipHash,
        p_tipo:'consulta',p_detalle:textoOriginal});
      return json({ok:true,mensajes:[{texto:sinCodigo(String(t.texto))}],
        carrito:(conv.estado as Json)?.carrito || [],soporte_pendiente:true,motor:'guiado'},200,origen);
    }
    if (r.accion?.tipo === 'derivar') {
      const t = await rpc("gestlok_chat_srv_reclamo",{
        p_conversacion:convId,p_token_hash:hash,p_ip_hash:ipHash,
        p_tipo:'consulta',p_detalle: textoOriginal || String(r.accion.motivo||'Consulta al gerente')});
      return json({ok:true,mensajes:[{texto:sinCodigo(String(t.texto))}], 
        carrito:(conv.estado as Json)?.carrito || [],soporte_pendiente:true,motor:'ia'},200,origen);
    }
    const mensajes: Json[] = r.mensajes.map(m=>({...m,texto:sinCodigo(formalizar(String(m.texto||'')))}));
    let pedido: Json | null = null;
    // Lo que queda escrito del lado del cliente (sin datos personales).
    const cliente = textoOriginal || (entrada.texto ? String(entrada.texto)
      : entrada.boton ? (BOTON_TEXTO[String(entrada.boton)] || "Elegí una opción")
      : entrada.agregar ? "Agregar: " + describirLinea(catalogo, entrada.agregar as never)
      : entrada.datos ? "Envié mis datos para el pedido"
      : "Quitar un producto");

    if (r.accion?.tipo === "crear_pedido") {
      const { data, error } = await db.rpc("gestlok_chat_srv_pedido", { p_conversacion: convId, p_token_hash: hash, p_pedido: r.accion.pedido });
      if (error) {
        mensajes.push({ texto: sinCodigo(formalizar(textoError(error))) + "\nRevise los datos e intente nuevamente.", tipo: "datos" });
      } else {
        pedido = conAviso((data as Json).pedido as Json);
        r.estado.carrito = []; r.estado.paso = "enviado";
        r.estado.programado = false; // Cada nuevo pedido requiere consentimiento independiente.
        r.estado.sugerido = false; // El próximo pedido vuelve a recibir la venta sugerida.
        mensajes.push({ texto: String(pedido.aviso) });
      }
    } else if (r.accion?.tipo === "estado") {
      const est = await rpc("gestlok_chat_srv_estado", { p_conversacion: convId, p_token_hash: hash });
      const ult = ((est.pedidos as Json[]) || [])[0];
      pedido = ult ? conAviso(ult) : null;
      mensajes.push({ texto: pedido ? String(pedido.aviso) : "Todavía no hay pedidos enviados desde este chat." });
    } else if (r.accion?.tipo === "cancelar") {
      const { data, error } = await db.rpc("gestlok_chat_srv_cancelar", { p_conversacion: convId, p_token_hash: hash });
      if (error) mensajes.push({ texto: sinCodigo(formalizar(textoError(error))) });
      else { pedido = conAviso((data as Json).pedido as Json); mensajes.push({ texto: String(pedido.aviso) }); }
    }

    try {
      await rpc("gestlok_chat_srv_turno", { p_conversacion: convId, p_token_hash: hash, p_ip_hash: ipHash,
        p_cliente: cliente.slice(0, 600), p_respuesta: mensajes.map((m) => m.texto).join("\n\n").slice(0, 2000), p_estado: r.estado });
    } catch (e) {
      // Si el pedido ya se creó, el cliente tiene que enterarse aunque no se haya podido guardar el turno.
      if (!pedido || r.accion?.tipo !== "crear_pedido") throw e;
    }
    return json({ ok: true, mensajes:mensajes.map(m=>({...m,texto:sinCodigo(String(m.texto||''))})),
      atencion:sucursal.atencion, carrito: r.estado.carrito, total: totalCarrito(catalogo, r.estado.carrito), pedido,
      motor: r.motor === "ia" ? "ia" : "guiado" }, 200, origen);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code !== "P0001" && err?.code !== "22023") console.error("gestlok-chat", err?.code, err?.message);
    return json({ ok: false, error: textoError(err) }, err?.code === "P0001" ? 409 : 400, origen);
  }
});
