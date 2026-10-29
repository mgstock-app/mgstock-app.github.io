/** Only one-time hexadecimal tokens from the server may become invitation links. */
export function validManagerStaffInvite(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token);
}
export function managerStaffInviteUrl(origin: string, moduleBase: string, token: string, localName?: string): string {
  if (!validManagerStaffInvite(token)) throw new Error("Invitación inválida");
  const base = new URL(origin);
  if (base.protocol !== "https:" && base.hostname !== "localhost")
    throw new Error("La invitación requiere HTTPS");
  if (base.username || base.password || base.search || base.hash)
    throw new Error("Origen de invitación inválido");
  const prefix = "/" + moduleBase.split("/").filter(Boolean).join("/");
  const link = new URL(prefix + "/unirse/?invitacion=" + token, base.origin);
  // El nombre es informativo. El servidor sigue siendo quien asigna el local al validar el token.
  const cleanName = localName?.trim().replace(/[\x00-\x1f\x7f]/g, "").slice(0, 80);
  if (cleanName) link.searchParams.set("local", cleanName);
  return link.toString();
}
export function staffInviteMessage(localName: string, url: string): string {
  return "Hola! Te invito a registrarte en GESTLOK como colaborador/a de " +
    localName + ". Entrá con tu cuenta de Google desde este enlace individual: " + url +
    "\nEl enlace se puede usar una sola vez y vence a los 7 días." +
    "\nSi se abre dentro de WhatsApp, elegí Abrir en Google Chrome para usar tu cuenta guardada.";
}

/**
 * Reopen a private HTTPS invitation in Google Chrome after a real user click.
 * Android browsers may block intents; never use a timed/automatic redirect.
 */
export function chromeInviteUrl(inviteUrl: string, platform: "android" | "ios"): string {
  const url = new URL(inviteUrl);
  if (url.protocol !== "https:" || url.hostname !== "gestlok.com.ar" ||
      !url.pathname.startsWith("/empleados/unirse/") ||
      !validManagerStaffInvite(url.searchParams.get("invitacion") || "")) {
    throw new Error("Destino de invitación inválido");
  }
  if (platform === "ios") return "googlechromes://" + url.host + url.pathname + url.search;
  return "intent://" + url.host + url.pathname + url.search +
    "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" +
    encodeURIComponent(url.toString()) + ";end";
}
