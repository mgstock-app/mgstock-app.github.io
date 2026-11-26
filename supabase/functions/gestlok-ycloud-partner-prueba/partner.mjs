// Gestlok Prueba only. No WhatsApp messages, no number registration or billing.
// YCloud Partner Direct Link: https://docs.ycloud.com/en/partner-center/technical-development-partners/partner-direct-link-tp-lite
const TEST_PROJECT = 'https://irqeitzbfyerxcrogkyh.supabase.co';
const PARTNER_ENDPOINT = 'https://api.ycloud.com/v2/partner/embeddedSignup/links';
const TYPES = new Set(['WHATSAPP_BUSINESS_PLATFORM','WHATSAPP_BUSINESS_APP']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PartnerError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function createPartnerLink({approved = false, projectUrl, apiKey, authorization, id,
  onboardingType, authorize, fetcher = fetch, now = Date.now}) {
  // Fail closed in production or until Gestlok receives actual approval.
  if (projectUrl !== TEST_PROJECT || approved !== true || !apiKey)
    throw new PartnerError(503, 'Vinculación oficial pendiente de habilitación.');
  if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
    throw new PartnerError(401, 'Iniciá sesión como administradora.');
  if (typeof id !== 'string' || !UUID.test(id) || !TYPES.has(onboardingType))
    throw new PartnerError(400, 'Solicitud de vinculación inválida.');
  // Admin lookup must verify the actual authenticated user through the RPC,
  // not trust a claimed role, business ID, or phone number from the browser.
  const row = await authorize(authorization, id);
  if (row?.id !== id || row?.habilitada !== true || row?.local_existe !== true)
    throw new PartnerError(403, 'La habilitación interna no está autorizada.');
  // Only an opaque stable ID is shared, not the phone, person, or local name.
  // A link is NOT evidence of a connected WhatsApp number.
  let response;
  try {
    response = await fetcher(PARTNER_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'X-API-Key':apiKey, Accept:'application/json'},
      body: JSON.stringify({partnerCustomerId:id, onboardingType, locale:'es_ES'}),
      redirect: 'error',
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new PartnerError(502, 'No se pudo solicitar el enlace oficial.');
  }
  if (!response.ok) throw new PartnerError(502, 'YCloud no pudo generar el enlace oficial.');
  try {
    const data = await response.json();
    const url = new URL(data.onboardingUrl);
    const expiresAt = data.expiresAt;
    if (url.origin !== 'https://connect.ycloud.com' || url.username || url.password ||
        url.pathname !== '/open/whatsapp/onboard' || url.search ||
        !new URLSearchParams(url.hash.slice(1)).get('token') ||
        !Number.isFinite(expiresAt) || expiresAt <= now() || expiresAt > now() + 2*60*60*1000+60000)
      throw new Error('Invalid link');
    return {onboardingUrl:url.href, expiresAt, status:'pendiente_autorizacion_comercio'};
  } catch {
    // Never leak the provider response, API key or the temporary link in errors.
    throw new PartnerError(502, 'YCloud devolvió un enlace inválido.');
  }
}
