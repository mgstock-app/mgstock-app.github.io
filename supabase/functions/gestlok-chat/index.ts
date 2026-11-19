/* GESTLOK Chat · función segura pública (chat.gestlok.com.ar → Supabase).
 * - Es la ÚNICA puerta del público a la base: usa service_role y solo llama a public.gestlok_chat_srv_*.
 * - La sesión del cliente es un token aleatorio que vive en su teléfono; acá se guarda solo su hash SHA-256.
 * - Topes por IP, por conversación y por sucursal (en la base). Textos acotados. CORS solo para los dominios propios.
 * - Precios, totales, disponibilidad y numeración los decide la base. El asistente solo arma el carrito.
 * - No guarda nombre, teléfono ni dirección en el chat: esos datos van únicamente en el pedido.
 * Secretos: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (automáticos), GESTLOK_CHAT_SALT (opcional, recomendado),
 * GESTLOK_CHAT_ORIGINS (opcional, lista separada por comas).
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { describirLinea, pesos, responder, totalCarrito, PAGOS } from "./motor.js";

type Json = Record<string, unknown>;
const env = (k: string) => Deno.env.get(k) || "";
const ORIGENES = (env("GESTLOK_CHAT_ORIGINS") || "https://chat.gestlok.com.ar,https://gestlok.com.ar,https://www.gestlok.com.ar")
  .split(",").map((s) => s.trim()).filter(Boolean);
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const BOTON_TEXTO: Record<string, string> = {
  carta: "Ver la carta", horario: "Horario y envío", pago: "Medios de pago", finalizar: "Finalizar pedido",
  carrito: "Ver mi pedido", estado: "¿Cómo va mi pedido?", cancelar: "Cancelar pedido",
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
const ESTADOS: Record<string, string> = {
  pendiente: "está esperando la confirmación del local",
  confirmado: "fue CONFIRMADO por el local",
  rechazado: "no pudo ser tomado por el local",
  cancelado: "fue cancelado",
};
function textoPedido(p: Json) {
  return "Tu pedido " + p.codigo + " " + (ESTADOS[String(p.estado)] || String(p.estado)) + "." +
    (p.motivo && p.estado === "rechazado" ? "\nMotivo: " + p.motivo : "") +
    "\nTotal: " + pesos(p.total) + (p.medio_pago ? " · " + (PAGOS[String(p.medio_pago)] || p.medio_pago) : "");
}

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
    const opciones: Record<string, string[]> = {};
    if (a.opciones && typeof a.opciones === "object") {
      for (const [k, v] of Object.entries(a.opciones as Json).slice(0, 8)) {
        if (/^[a-z0-9_]{1,30}$/.test(k) && Array.isArray(v)) opciones[k] = v.filter((i) => typeof i === "string" && /^[a-z0-9_]{1,30}$/.test(i)).slice(0, 30);
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
    const conv = await rpc("gestlok_chat_srv_conversacion", { p_sucursal: sucId, p_token_hash: hash, p_ip_hash: ipHash });
    const convId = conv.id as string;

    if (accion === "abrir") {
      let mensajes = (conv.mensajes as Json[]) || [];
      let estado = (conv.estado as Json) || {};
      let extra: Json[] = [];
      if (conv.nueva) {
        const r = responder({ sucursal, catalogo, estado, entrada: { inicio: true } });
        estado = r.estado; extra = r.mensajes;
        await rpc("gestlok_chat_srv_turno", { p_conversacion: convId, p_token_hash: hash, p_ip_hash: ipHash,
          p_cliente: "", p_respuesta: r.mensajes.map((m: Json) => m.texto).join("\n\n"), p_estado: estado });
        mensajes = [];
      }
      return json({ ok: true, sucursal, catalogo, mensajes, nuevos: extra, carrito: (estado as Json).carrito ?? [],
        pedidos: conv.pedidos ?? [] }, 200, origen);
    }

    if (accion === "estado") {
      return json({ ok: true, ...(await rpc("gestlok_chat_srv_estado", { p_conversacion: convId, p_token_hash: hash })) }, 200, origen);
    }

    if (accion !== "mensaje") return json({ ok: false, error: "Acción desconocida" }, 400, origen);
    const entrada = limpiarEntrada(body.entrada);
    if (!entrada) return json({ ok: false, error: "Mensaje vacío" }, 400, origen);

    const r = responder({ sucursal, catalogo, estado: conv.estado, entrada });
    const mensajes: Json[] = [...r.mensajes];
    let pedido: Json | null = null;
    // Lo que queda escrito del lado del cliente (sin datos personales).
    const cliente = entrada.texto ? String(entrada.texto)
      : entrada.boton ? (BOTON_TEXTO[String(entrada.boton)] || "Elegí una opción")
      : entrada.agregar ? "Agregar: " + describirLinea(catalogo, entrada.agregar as never)
      : entrada.datos ? "Envié mis datos para el pedido"
      : "Quitar un producto";

    if (r.accion?.tipo === "crear_pedido") {
      const { data, error } = await db.rpc("gestlok_chat_srv_pedido", { p_conversacion: convId, p_token_hash: hash, p_pedido: r.accion.pedido });
      if (error) {
        mensajes.push({ texto: textoError(error) + "\nRevisá los datos y volvé a enviarlo.", tipo: "datos" });
      } else {
        pedido = (data as Json).pedido as Json;
        r.estado.carrito = []; r.estado.paso = "enviado";
        mensajes.push({ texto: "¡Listo! Enviamos tu pedido " + pedido.codigo + " al local.\nTotal: " + pesos(pedido.total) +
          "\nTe aviso acá apenas lo confirmen. Dejá esta página abierta o volvé a entrar desde el mismo teléfono." });
      }
    } else if (r.accion?.tipo === "estado") {
      const est = await rpc("gestlok_chat_srv_estado", { p_conversacion: convId, p_token_hash: hash });
      const ult = ((est.pedidos as Json[]) || [])[0];
      mensajes.push({ texto: ult ? textoPedido(ult) : "Todavía no enviaste ningún pedido desde este teléfono." });
      pedido = ult ?? null;
    } else if (r.accion?.tipo === "cancelar") {
      const { data, error } = await db.rpc("gestlok_chat_srv_cancelar", { p_conversacion: convId, p_token_hash: hash });
      if (error) mensajes.push({ texto: textoError(error) });
      else { pedido = (data as Json).pedido as Json; mensajes.push({ texto: textoPedido(pedido) }); }
    }

    try {
      await rpc("gestlok_chat_srv_turno", { p_conversacion: convId, p_token_hash: hash, p_ip_hash: ipHash,
        p_cliente: cliente.slice(0, 600), p_respuesta: mensajes.map((m) => m.texto).join("\n\n").slice(0, 2000), p_estado: r.estado });
    } catch (e) {
      // Si el pedido ya se creó, el cliente tiene que enterarse aunque no se haya podido guardar el turno.
      if (!pedido || r.accion?.tipo !== "crear_pedido") throw e;
    }
    return json({ ok: true, mensajes, carrito: r.estado.carrito, total: totalCarrito(catalogo, r.estado.carrito), pedido }, 200, origen);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code !== "P0001" && err?.code !== "22023") console.error("gestlok-chat", err?.code, err?.message);
    return json({ ok: false, error: textoError(err) }, err?.code === "P0001" ? 409 : 400, origen);
  }
});
