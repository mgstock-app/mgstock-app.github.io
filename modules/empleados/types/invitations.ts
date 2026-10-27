export interface JoinLink {
  id: string;
  token: string;
  expires_at: string;
  revoked_at: string | null;
  local_id: string | null;
  uses: number;
  max_uses: number;
}
