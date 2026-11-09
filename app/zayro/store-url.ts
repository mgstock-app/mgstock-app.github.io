// ZAYRO · utilidades de dirección y WhatsApp de la tienda pública.
// Sin dependencias para poder probarlas con node --test.

export const STORE_PATH = "/zayro/";

// Parámetros de seguimiento que agregan buscadores, redes y asistentes
// (por ejemplo ?utm_source=chatgpt.com). No cambian lo que muestra la tienda.
const TRACKING_EXACT = new Set([
  "fbclid", "gclid", "gclsrc", "gbraid", "wbraid", "dclid", "msclkid", "yclid",
  "twclid", "ttclid", "li_fat_id", "igshid", "igsh", "mc_cid", "mc_eid",
  "_ga", "_gl", "_hsenc", "_hsmi", "mkt_tok", "srsltid", "si", "ref_src",
]);

export function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return key.startsWith("utm_") || key.startsWith("pk_") || TRACKING_EXACT.has(key);
}

/**
 * Devuelve la dirección limpia (ruta + parámetros útiles + #sección) o null si ya está limpia.
 * Solo actúa sobre la tienda: /zayro, /zayro/ y /zayro/index.html.
 */
export function cleanStoreHref(href: string): string | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const path = url.pathname.replace(/\/index\.html$/i, "/").replace(/\/+$/, "/");
  if (path.toLowerCase() !== STORE_PATH && path.toLowerCase() !== "/zayro") return null;
  const kept = new URLSearchParams();
  let removed = false;
  url.searchParams.forEach((value, key) => {
    if (isTrackingParam(key)) removed = true; else kept.append(key, value);
  });
  const query = kept.toString();
  const clean = STORE_PATH + (query ? "?" + query : "") + url.hash;
  const current = url.pathname + url.search + url.hash;
  return removed || current !== clean ? clean : null;
}

/** Normaliza el WhatsApp de ventas al formato internacional que pide wa.me (Argentina: 549 + área + número). */
export function whatsappNumber(raw: string | null | undefined): string {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("549") && digits.length === 13) return digits;
  if (digits.startsWith("54") && digits.length === 12) return "549" + digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  // Celulares escritos con 15 (11 15 4471 5168): se quita el 15 que sigue al código de área.
  if (digits.length === 12) {
    const area = [2, 3, 4].find(size => digits.slice(size, size + 2) === "15");
    if (area) digits = digits.slice(0, area) + digits.slice(area + 2);
  }
  if (digits.length === 10) return "549" + digits;
  return /^\d{11,15}$/.test(digits) ? digits : "";
}

/** Muestra el número como lo escriben los clientes: 11 4471-5168. */
export function whatsappLabel(raw: string | null | undefined): string {
  const n = whatsappNumber(raw);
  if (!n) return "";
  if (!n.startsWith("549") || n.length !== 13) return "+" + n;
  const local = n.slice(3);
  if (local.startsWith("11")) return "11 " + local.slice(2, 6) + "-" + local.slice(6);
  return "+54 9 " + local;
}

export function whatsappLink(raw: string | null | undefined, text: string): string {
  const n = whatsappNumber(raw);
  return n ? "https://wa.me/" + n + "?text=" + encodeURIComponent(text) : "";
}
