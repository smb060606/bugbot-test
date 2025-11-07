import type { RequestHandler } from '@sveltejs/kit';
/* In tests, SvelteKit $env modules are not available; read from process.env */
const envVar = (name: string) => process.env[name];
import { BUDGET_PER_PLATFORM_DOLLARS, getPlatformCostConfig, estimateMaxAccounts } from '$lib/config/budget';
import { getAccountsSnapshot } from '$lib/services/bskyService';
import { BSKY_MAX_ACCOUNTS } from '$lib/config/bsky';
import { getOverrides } from '$lib/services/accountOverrides';
import { getAccountsSnapshot as getTwitterAccountsSnapshot } from '$lib/services/twitterService';
import { TWITTER_MAX_ACCOUNTS } from '$lib/config/twitter';

type PlatformPlan = {
  platform: 'bsky' | 'twitter' | 'threads';
  status: 'ok' | 'unconfigured';
  budgetPerMonthDollars: number;
  costPerMonthDollars: number | null; // null => unconfigured/unknown
  notes?: string;
  maxAccountsAllowed?: number;
  selected?: Array<{
    did?: string;        // Bluesky
    user_id?: string;    // Twitter
    handle: string;
    displayName?: string;
    followersCount?: number;
    postsCount?: number;
    createdAt?: string | null;
    eligibility: {
      eligible: boolean;
      reasons: string[];
    };
  }>;
  overrides?: {
    include: Array<{
      identifier: string;
      identifier_type: 'did' | 'handle' | 'user_id';
      scope: 'global' | 'match';
      match_id: string | null;
      bypass_eligibility: boolean;
      expires_at: string | null;
    }>;
    exclude: Array<{
      identifier: string;
      identifier_type: 'did' | 'handle' | 'user_id';
      scope: 'global' | 'match';
      match_id: string | null;
      expires_at: string | null;
    }>;
  };
};

export const GET: RequestHandler = async ({ request }) => {
  try {
    // Admin-only guard: require ADMIN_SECRET via header
    const adminSecret = envVar('ADMIN_SECRET');
    if (!adminSecret) {
      return new Response(JSON.stringify({ error: 'admin_not_configured' }), {
        status: 501,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const token = request.headers.get('x-admin-token') ?? '';
    if (token !== adminSecret) {
      // Hide existence from public
      return new Response('Not found', { status: 404 });
    }

    const generatedAt = new Date().toISOString();
    const budget = BUDGET_PER_PLATFORM_DOLLARS;

    // Bluesky
    const bskyCfg = getPlatformCostConfig('bsky');
    const bskyPlan: PlatformPlan = {
      platform: 'bsky',
      status: bskyCfg.status,
      budgetPerMonthDollars: budget,
      costPerMonthDollars: bskyCfg.costPerMonthDollars,
      notes: bskyCfg.notes
    };

    if (bskyCfg.status === 'ok') {
      // AppView reads treated as $0 – safe to select up to existing max
      const accounts = await getAccountsSnapshot().catch(() => [] as PlatformPlan['selected']);
      const maxAllowed = Math.max(0, BSKY_MAX_ACCOUNTS);
      bskyPlan.maxAccountsAllowed = maxAllowed;
      bskyPlan.selected = (accounts ?? []).slice(0, maxAllowed);

      // Attach override summary for transparency (gracefully empty if admin env missing)
      const ov = await getOverrides({ platform: 'bsky' }).catch(() => ({ include: [], exclude: [] }));
      bskyPlan.overrides = {
        include: (ov.include || []).map((o) => ({
          identifier: o.identifier,
          identifier_type: o.identifier_type,
          scope: o.scope,
          match_id: o.match_id,
          bypass_eligibility: o.bypass_eligibility,
          expires_at: o.expires_at
        })),
        exclude: (ov.exclude || []).map((o) => ({
          identifier: o.identifier,
          identifier_type: o.identifier_type,
          scope: o.scope,
          match_id: o.match_id,
          expires_at: o.expires_at
        }))
      };
    }

    // Twitter/X
    const twitterCfg = getPlatformCostConfig('twitter');
    const twitterPlan: PlatformPlan = {
      platform: 'twitter',
      status: twitterCfg.status,
      budgetPerMonthDollars: budget,
      costPerMonthDollars: twitterCfg.costPerMonthDollars,
      notes: twitterCfg.notes
    };

    if (twitterCfg.status === 'ok') {
      // If configured, compute a selection using overrides-aware twitter service
      const cap = estimateMaxAccounts('twitter');
      const maxAllowedTw = cap?.maxAccounts ?? Math.max(0, TWITTER_MAX_ACCOUNTS);
      twitterPlan.maxAccountsAllowed = maxAllowedTw;
      (twitterPlan as any).capRationale = cap?.rationale ?? null;

      const accountsTw = await getTwitterAccountsSnapshot().catch(() => [] as PlatformPlan['selected']);
      twitterPlan.selected = (accountsTw ?? []).slice(0, maxAllowedTw);
    }

    // Attach twitter overrides summary (gracefully empty if admin env missing)
    try {
      const ovTw = await getOverrides({ platform: 'twitter' }).catch(() => ({ include: [], exclude: [] }));
      twitterPlan.overrides = {
        include: (ovTw.include || []).map((o) => ({
          identifier: o.identifier,
          identifier_type: o.identifier_type,
          scope: o.scope,
          match_id: o.match_id,
          bypass_eligibility: (o as any).bypass_eligibility ?? false,
          expires_at: o.expires_at
        })),
        exclude: (ovTw.exclude || []).map((o) => ({
          identifier: o.identifier,
          identifier_type: o.identifier_type,
          scope: o.scope,
          match_id: o.match_id,
          expires_at: o.expires_at
        }))
      };
    } catch {
      // ignore
    }

    // Threads
    const threadsCfg = getPlatformCostConfig('threads');
    const threadsPlan: PlatformPlan = {
      platform: 'threads',
      status: threadsCfg.status,
      budgetPerMonthDollars: budget,
      costPerMonthDollars: threadsCfg.costPerMonthDollars,
      notes: threadsCfg.notes
    };

    if (threadsCfg.status === 'ok') {
      const capTh = estimateMaxAccounts('threads');
      const maxAllowedTh = capTh?.maxAccounts ?? undefined;
      if (typeof maxAllowedTh === 'number') {
        threadsPlan.maxAccountsAllowed = maxAllowedTh;
        (threadsPlan as any).capRationale = capTh?.rationale ?? null;
      }
    }

    // Attach threads overrides summary (gracefully empty if admin env missing)
    try {
      const ovTh = await getOverrides({ platform: 'threads' }).catch(() => ({ include: [], exclude: [] }));
      threadsPlan.overrides = {
        include: (ovTh.include || []).map((o) => ({
          identifier: o.identifier,
          identifier_type: o.identifier_type,
          scope: o.scope,
          match_id: o.match_id,
          bypass_eligibility: (o as any).bypass_eligibility ?? false,
          expires_at: o.expires_at
        })),
        exclude: (ovTh.exclude || []).map((o) => ({
          identifier: o.identifier,
          identifier_type: o.identifier_type,
          scope: o.scope,
          match_id: o.match_id,
          expires_at: o.expires_at
        }))
      };
    } catch {
      // ignore
    }

    const payload = {
      generatedAt,
      budgetPerPlatformDollars: budget,
      platforms: {
        bsky: bskyPlan,
        twitter: twitterPlan,
        threads: threadsPlan
      }
    };

    return new Response(JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        error: 'plan_generation_failed',
        message: e?.message ?? 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
