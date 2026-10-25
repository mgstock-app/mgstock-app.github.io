export function isInvitationCode(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
export function resolveInvitationCode(
  query: string | null,
  cached: string | null,
): string {
  return query !== null ? query : cached || "";
}
