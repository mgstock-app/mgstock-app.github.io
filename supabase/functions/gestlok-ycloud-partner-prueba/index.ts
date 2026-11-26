import { createClient } from "npm:@supabase/supabase-js@2";
import { createPartnerLink, PartnerError } from "./partner.mjs";

const ORIGIN = "https://gestlok-prueba.vercel.app";
const headers = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Vary": "Origin"
};
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers });

Deno.serve(async (request) => {
  if (request.headers.get("origin") !== ORIGIN) return json({error:"Origen no autorizado."},403);
  if (request.method === "OPTIONS") return new Response(null, {status:204, headers});
  if (request.method !== "POST") return json({error:"Método no permitido."},405);
  const projectUrl = Deno.env.get("SUPABASE_URL") || "";
  const apiKey = Deno.env.get("YCLOUD_PARTNER_API_KEY") || "";
  const approved = Deno.env.get("YCLOUD_PARTNER_APPROVED") === "true";
  if (!approved || !apiKey || projectUrl !== "https://irqeitzbfyerxcrogkyh.supabase.co")
    return json({error:"Vinculación oficial pendiente de habilitación."},503);
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer [^\s]+$/.test(authorization)) return json({error:"Iniciá sesión."},401);
  try {
    const raw = await request.text();
    if (raw.length > 2048) return json({error:"Solicitud inválida."},400);
    let input;
    try { input = JSON.parse(raw); } catch { return json({error:"Solicitud inválida."},400); }
    if (!input || typeof input !== "object" || Array.isArray(input))
      return json({error:"Solicitud inválida."},400);
    const result = await createPartnerLink({
      approved, projectUrl, apiKey, authorization, id:input.id, onboardingType:input.onboardingType,
      authorize: async (bearer: string, id: string) => {
        const supabase = createClient(projectUrl, Deno.env.get("SUPABASE_ANON_KEY") || "", {
          global:{headers:{Authorization:bearer}},
          auth:{persistSession:false, autoRefreshToken:false}
        });
        // The RPC authenticates the caller and enforces gestlok_platform.require_admin().
        const {data, error} = await supabase.rpc("gestlok_chat_admin_whatsapp_premium", {p_accion:"listar"});
        if (error || !Array.isArray(data?.numeros)) return null;
        return data.numeros.find((row: {id:string}) => row.id === id) || null;
      }
    });
    return json(result);
  } catch (error) {
    if (error instanceof PartnerError) return json({error:error.message},error.status);
    return json({error:"No se pudo preparar la vinculación."},500);
  }
});
