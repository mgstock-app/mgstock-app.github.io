/** Only one-time hexadecimal tokens from the server may become invitation links. */
export function validManagerStaffInvite(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token);
}
export function managerStaffInviteUrl(origin: string, moduleBase: string, token: string): string {
  if (!validManagerStaffInvite(token)) throw new Error("Invitación inválida");
  const base = new URL(origin);
  if (base.protocol !== "https:" && base.hostname !== "localhost")
    throw new Error("La invitación requiere HTTPS");
  if (base.username || base.password || base.search || base.hash)
    throw new Error("Origen de invitación inválido");
  const prefix = "/" + moduleBase.split("/").filter(Boolean).join("/");
  return new URL(prefix + "/unirse/?invitacion=" + token, base.origin).toString();
}
export function staffInviteMessage(localName: string, url: string): string {
  return "Hola! Te invito a registrarte en GESTLOK como colaborador/a de " +
    localName + ". Entrá con tu cuenta de Google desde este enlace individual: " + url +
    "\nEl enlace se puede usar una sola vez y vence a los 7 días.";
}
