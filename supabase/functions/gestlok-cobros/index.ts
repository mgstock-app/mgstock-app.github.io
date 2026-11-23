// GESTLOK Chat · cobros con Mercado Pago (cuota mensual por suscripción y adaptación por única vez).
// - POST {accion: 'link', tenant, tipo: 'cuota'|'adaptacion', email?} con la sesión del dueño o la administradora:
//   pregunta a la base si puede (gestlok_chat_cobro_preparar), crea el link en Mercado Pago y lo guarda.
// - POST ?webhook=mp (lo llama Mercado Pago): vuelve a pedir el recurso a Mercado Pago con la clave propia y recién
//   ahí actualiza la base (gestlok_cobros_srv_evento). Nunca confía en el contenido del aviso.
// Secretos: MP_ACCESS_TOKEN (clave de producción de Mercado Pago). Desplegar con verify_jwt = false.
import { createClient } from "jsr:@supabase/supabase-js@2";

const MP = "https://api.mercadopago.com";
const SITIO = "https://gestlok.com.ar";
const ORIGENES = ["https://gestlok.com.ar", "https://www.gestlok.com.ar", "https://gestlok-prueba.vercel.app", "https://gestlok-testing.vercel.app"];
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TOKEN = Deno.env.get("MP_ACCESS_TOKEN") ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENES.includes(o) ? o : SITIO,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" } });

async function mp(path: string, init: RequestInit = {}) {
  const r = await fetch(MP + path, {
    ...init,
    headers: { "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

const admin = () => createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

async function crearLink(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+/.test(auth)) return json(req, { error: "Iniciá sesión para continuar." }, 401);
  const datos = await req.json().catch(() => ({}));
  const tenant = String(datos?.tenant ?? ""), tipo = String(datos?.tipo ?? "");
  if (!UUID.test(tenant) || !["cuota", "adaptacion"].includes(tipo)) return json(req, { error: "Datos inválidos." }, 400);
  if (!TOKEN) return json(req, { error: "Mercado Pago todavía no está conectado. Falta cargar la clave MP_ACCESS_TOKEN." }, 503);

  const usuario = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: ctx, error } = await usuario.rpc("gestlok_chat_cobro_preparar",
    { p_tenant: tenant, p_tipo: tipo, p_email: typeof datos?.email === "string" ? datos.email : null });
  if (error || !ctx) return json(req, { error: error?.message ?? "Sin permiso." }, error?.code === "42501" ? 403 : 400);

  const aviso = new URL(req.url); aviso.search = "?webhook=mp";
  let r, link: string | undefined, id: string | undefined;
  if (tipo === "cuota") {
    r = await mp("/preapproval", {
      method: "POST",
      body: JSON.stringify({
        reason: "GESTLOK Chat · " + ctx.empresa,
        external_reference: "cuota:" + tenant,
        payer_email: ctx.payer_email,
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: Number(ctx.monto), currency_id: "ARS" },
        back_url: SITIO + "/chat/panel/?suscripcion=lista",
        status: "pending",
      }),
    });
    link = r.body?.init_point; id = r.body?.id;
  } else {
    r = await mp("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [{ title: "Adaptación de GESTLOK Chat · " + ctx.empresa, quantity: 1, unit_price: Number(ctx.monto), currency_id: "ARS" }],
        external_reference: "adaptacion:" + tenant,
        payer: { email: ctx.payer_email },
        notification_url: aviso.toString(),
        back_urls: { success: SITIO + "/chat/panel/?pago=ok", pending: SITIO + "/chat/panel/?pago=pendiente", failure: SITIO + "/chat/panel/?pago=error" },
        auto_return: "approved",
      }),
    });
    link = r.body?.init_point; id = r.body?.id;
  }
  if (!r.ok || !link || !id) {
    console.error("mercado_pago_error", r.status, JSON.stringify(r.body).slice(0, 500));
    return json(req, { error: "Mercado Pago no pudo crear el link (" + r.status + "). " + String(r.body?.message ?? "") }, 502);
  }
  const { error: e2 } = await admin().rpc("gestlok_cobros_srv_link",
    { p_tenant: tenant, p_tipo: tipo, p_mp_id: String(id), p_link: link, p_monto: Number(ctx.monto), p_email: ctx.payer_email });
  if (e2) return json(req, { error: "El link se creó pero no se pudo guardar: " + e2.message }, 500);
  return json(req, { ok: true, tipo, link, monto: Number(ctx.monto) });
}

// Mercado Pago avisa con {type, data:{id}} (o ?topic=&id= en avisos viejos). Se responde 200 salvo fallas
// transitorias, para que Mercado Pago reintente solo cuando sirve.
async function webhook(req: Request, url: URL) {
  const body = await req.json().catch(() => ({}));
  const tipo = String(body?.type ?? body?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
  const id = String(body?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (!TOKEN || !/^[A-Za-z0-9-]{1,64}$/.test(id)) return new Response("ok", { status: 200 });
  const rutas: Record<string, [string, string]> = {
    subscription_preapproval: ["preapproval", "/preapproval/"], preapproval: ["preapproval", "/preapproval/"],
    subscription_authorized_payment: ["authorized_payment", "/authorized_payments/"], authorized_payment: ["authorized_payment", "/authorized_payments/"],
    payment: ["payment", "/v1/payments/"],
  };
  const ruta = rutas[tipo];
  if (!ruta) return new Response("ok", { status: 200 });
  const r = await mp(ruta[1] + encodeURIComponent(id));
  if (r.status === 404) return new Response("ok", { status: 200 });
  if (!r.ok) return new Response("reintentar", { status: 503 });
  const { data, error } = await admin().rpc("gestlok_cobros_srv_evento", { p_tipo: ruta[0], p_recurso: r.body });
  if (error) { console.error("evento_error", error.message); return new Response("reintentar", { status: 500 }); }
  console.log("evento", ruta[0], JSON.stringify(data));
  return new Response("ok", { status: 200 });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Método no permitido." }, 405);
  try {
    if (url.searchParams.get("webhook") === "mp") return await webhook(req, url);
    return await crearLink(req);
  } catch (e) {
    console.error("gestlok_cobros", String(e));
    return json(req, { error: "No se pudo completar la operación. Probá de nuevo." }, 500);
  }
});
