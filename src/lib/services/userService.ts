import { getSupabaseAdmin } from '$lib/supabaseAdmin';
import { BskyAgent } from '@atproto/api';
import { BSKY_APPVIEW_BASE } from '$lib/config/bsky';

export type User = {
  id: string;
  bskyHandle: string;
  bskyDid?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  verifiedAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

let agentPromise: Promise<BskyAgent> | null = null;

function getServiceBase(): string {
  return BSKY_APPVIEW_BASE.endsWith('/xrpc')
    ? BSKY_APPVIEW_BASE.slice(0, -('/xrpc'.length))
    : BSKY_APPVIEW_BASE;
}

async function getAgent(): Promise<BskyAgent> {
  if (!agentPromise) {
    agentPromise = (async () => {
      const agent = new BskyAgent({ service: getServiceBase() });
      return agent;
    })();
  }
  return agentPromise;
}

/**
 * Resolve a Bluesky handle to its DID (Decentralized Identifier).
 */
async function resolveDidFromHandle(handle: string): Promise<string | null> {
  try {
    const agent = await getAgent();
    const res: any = await (agent as any).getProfile?.({ actor: handle });
    return res?.data?.did ?? null;
  } catch {
    return null;
  }
}

/**
 * Get or create a user from a Bluesky handle.
 * If the user exists, updates last_seen_at and optionally DID/displayName.
 * Returns the user record or null if Supabase is not configured.
 */
export async function getOrCreateUser(handle: string): Promise<User | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const normalizedHandle = handle.trim().toLowerCase();

  // Try to resolve DID and profile info
  const did = await resolveDidFromHandle(normalizedHandle);
  let displayName: string | null = null;
  let avatarUrl: string | null = null;

  if (did) {
    try {
      const agent = await getAgent();
      const profile: any = await (agent as any).getProfile?.({ actor: did });
      displayName = profile?.data?.displayName ?? null;
      avatarUrl = profile?.data?.avatar ?? null;
    } catch {
      // Ignore profile fetch errors
    }
  }

  // Upsert user
  const { data, error } = await admin
    .from('users')
    .upsert(
      {
        bsky_handle: normalizedHandle,
        bsky_did: did,
        display_name: displayName,
        avatar_url: avatarUrl,
        last_seen_at: new Date().toISOString()
      },
      {
        onConflict: 'bsky_handle',
        ignoreDuplicates: false
      }
    )
    .select()
    .single();

  if (error) {
    console.error('getOrCreateUser: upsert failed', { error: String(error) });
    return null;
  }

  return {
    id: data.id,
    bskyHandle: data.bsky_handle,
    bskyDid: data.bsky_did,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    verifiedAt: data.verified_at,
    lastSeenAt: data.last_seen_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

/**
 * Get a user by Bluesky handle.
 */
export async function getUserByHandle(handle: string): Promise<User | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const normalizedHandle = handle.trim().toLowerCase();
  const { data, error } = await admin
    .from('users')
    .select('*')
    .eq('bsky_handle', normalizedHandle)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    bskyHandle: data.bsky_handle,
    bskyDid: data.bsky_did,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    verifiedAt: data.verified_at,
    lastSeenAt: data.last_seen_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

