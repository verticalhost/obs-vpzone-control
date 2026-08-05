export type ChatEvent = {
  id: string; type: string; username: string; body: string; ts: number; color?: string | null; count?: number;
  code?: string; retry_after_ms?: number; nonce?: string; is_subscriber?: boolean; is_owner?: boolean; is_mod?: boolean;
  is_founder?: boolean; is_ambassador?: boolean; vpz_plus?: boolean; emoteMap?: Record<string, string> | null;
  metadata?: Record<string, unknown> | null;
}
export type Settings = { slug: string; clientId: string; authenticated: boolean; profile: { username: string; display_name?: string | null; avatar_url?: string | null } | null }
export type Category = { name: string; cover_url?: string | null; live_count?: number }
export type Channel = { slug: string; title?: string; category?: string; is_live?: boolean; viewer_count?: number; owner?: { username: string; display_name?: string | null; avatar_url?: string | null; is_verified?: boolean } }
