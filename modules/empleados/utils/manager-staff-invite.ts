/** Only 256-bit hexadecimal invitation tokens from the server may become links. */
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
  const cleanName = localName?.trim().split("").filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join("").slice(0, 80);
  if (cleanName) link.searchParams.set("local", cleanName);
  return link.toString();
}
export function staffInviteMessage(localName: string, url: string): string {
  return "¡Hola! 🖤 Te compartimos el enlace general de GESTLOK para colaboradores del local " +
    localName + ". Cada persona debe abrirlo e ingresar con su propia cuenta de Google:\n" + url +
    "\nCuando ingreses, completá tu legajo (nombre, apellido, teléfono y alias). La fecha de ingreso es opcional." +
    "\nEl acceso queda asignado únicamente a este local. Si se abre dentro de WhatsApp, elegí Abrir en Google Chrome.";
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
