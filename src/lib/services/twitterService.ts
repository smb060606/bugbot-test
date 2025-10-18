import { getOverrides } from '$lib/services/accountOverrides';
import {
  TWITTER_ALLOWLIST,
  TWITTER_MAX_ACCOUNTS,
  TWITTER_MIN_ACCOUNT_MONTHS,
  TWITTER_MIN_FOLLOWERS,
  TWITTER_DEFAULT_RECENCY_MINUTES
} from '$lib/config/twitter';

// Types mirrored after Bluesky service for parity
export type TwitterProfileBasic = {
  user_id?: string; // canonical if available
  handle: string;
  displayName?: string;
  followersCount?: number;
  postsCount?: number;
  createdAt?: string | null;
};

export type Eligibility = {
  eligible: boolean;
  reasons: string[];
};

export type SelectedAccount = {
  profile: TwitterProfileBasic;
  eligibility: Eligibility;
};

export type SimpleTweet = {
  id: string;
  author: {
    user_id?: string;
    handle: string;
    displayName?: string;
  };
  text: string;
  createdAt: string;
};

// Placeholder for future cost-aware rate planning
export const DEFAULT_RECENCY_MINUTES = TWITTER_DEFAULT_RECENCY_MINUTES;

// Placeholder resolver: convert allowlist handles to minimal profiles.
// In a future iteration, this should call Twitter API to resolve user_id,
/**
 * Create minimal TwitterProfileBasic records for a list of handles.
 *
 * @param handles - Array of Twitter handles to resolve; defaults to the configured allowlist
 * @returns An array of profiles where each entry has `handle` and `displayName` set to the handle, `followersCount` and `postsCount` left undefined, and `createdAt` set to `null`
 */
export async function resolveAllowlistProfiles(handles: string[] = TWITTER_ALLOWLIST): Promise<TwitterProfileBasic[]> {
  return handles.map((h) => ({
    handle: h,
    displayName: h,
    followersCount: undefined,
    postsCount: undefined,
    createdAt: null
  }));
}

/**
 * Compute the approximate number of months elapsed between two dates.
 *
 * @param a - One of the two dates; order does not matter
 * @param b - The other date; order does not matter
 * @returns The absolute difference in months (may be fractional) between `a` and `b`, approximating a month as 30 days
 */
function monthsBetween(a: Date, b: Date): number {
  const diffMs = Math.abs(a.getTime() - b.getTime());
  return diffMs / (1000 * 60 * 60 * 24 * 30);
}

/**
 * Evaluate a Twitter profile against configured minimum followers and account-age requirements.
 *
 * @param profile - The Twitter profile to evaluate (may omit `user_id`, `followersCount`, or `createdAt`)
 * @returns An object with `eligible` set to `true` if the profile meets the minimum followers and account-age requirements (when `createdAt` is present), `false` otherwise; `reasons` lists the checks and outcomes, including an explicit note when account age is unknown
 */
export function computeEligibility(profile: TwitterProfileBasic): Eligibility {
  const reasons: string[] = [];
  let ok = true;

  const followers = profile.followersCount ?? 0;
  if (followers < TWITTER_MIN_FOLLOWERS) {
    ok = false;
    reasons.push(`followers=${followers} < min=${TWITTER_MIN_FOLLOWERS}`);
  } else {
    reasons.push(`followers=${followers} ≥ min=${TWITTER_MIN_FOLLOWERS}`);
  }

  if (profile.createdAt) {
    const months = monthsBetween(new Date(profile.createdAt), new Date());
    if (months < TWITTER_MIN_ACCOUNT_MONTHS) {
      ok = false;
      reasons.push(`age=${months.toFixed(1)}mo < min=${TWITTER_MIN_ACCOUNT_MONTHS}mo`);
    } else {
      reasons.push(`age=${months.toFixed(1)}mo ≥ min=${TWITTER_MIN_ACCOUNT_MONTHS}mo`);
    }
  } else {
    // If we cannot determine age, disclose uncertainty; allow by followers/activity
    reasons.push('age=unknown; allowed based on followers/activity');
  }

  return { eligible: ok, reasons };
}

/**
 * Produce a stable string key for a Twitter profile using the user ID when available, otherwise the handle.
 *
 * @param p - The Twitter profile to key
 * @returns `id:<user_id>` when `user_id` is present, otherwise `handle:<handle>`
 */
function keyOf(p: TwitterProfileBasic): string {
  return p.user_id ? `id:${p.user_id}` : `handle:${p.handle}`;
}

/**
 * Selects eligible Twitter accounts applying admin include/exclude overrides.
 *
 * Precedence (high → low): match EXCLUDE, match INCLUDE, global EXCLUDE, global INCLUDE.
 *
 * @param params - Optional parameters; `matchId` limits override lookup to a specific match when provided.
 * @returns An array of selected accounts (profile and eligibility). Admin-included accounts are preserved first, then additional eligible allowlist accounts are ordered by descending follower count; the result is limited to the configured maximum number of accounts.
 */
export async function selectEligibleAccounts(params?: { matchId?: string | null }): Promise<SelectedAccount[]> {
  const matchId = params?.matchId ?? null;

  // 1) Start from allowlist-based resolution (support vi.spyOn in tests by referencing module namespace)
  let baseProfiles: TwitterProfileBasic[] = [];
  try {
    const selfMod: any = await import('./twitterService');
    if (selfMod && typeof selfMod.resolveAllowlistProfiles === 'function') {
      baseProfiles = await selfMod.resolveAllowlistProfiles();
    } else {
      baseProfiles = await resolveAllowlistProfiles();
    }
  } catch {
    baseProfiles = await resolveAllowlistProfiles();
  }

  // 2) Load overrides (per-match takes precedence over global)
  let ov: any;
  try {
    ov = await getOverrides({ platform: 'twitter', matchId });
  } catch {
    ov = { include: [], exclude: [] };
  }
  const inc = (ov?.include ?? []) as any[];
  const exc = (ov?.exclude ?? []) as any[];

  // Build exclude set
  const excludeKeys = new Set<string>();
  for (const o of exc) {
    const key = o.identifier_type === 'user_id' ? `id:${o.identifier}` : `handle:${o.identifier}`;
    excludeKeys.add(key);
  }

  const isExcluded = (p: TwitterProfileBasic) => {
    const idKey = p.user_id ? `id:${p.user_id}` : null;
    const hKey = p.handle ? `handle:${p.handle}` : null;
    return (idKey && excludeKeys.has(idKey)) || (hKey && excludeKeys.has(hKey));
  };

  // For includes, resolve to minimal profiles by identifier
  const includeByKey = new Map<string, TwitterProfileBasic>();
  for (const o of inc) {
    const key = o.identifier_type === 'user_id' ? `id:${o.identifier}` : `handle:${o.identifier}`;
    includeByKey.set(
      key,
      o.identifier_type === 'user_id'
        ? { user_id: o.identifier, handle: o.handle || o.identifier, displayName: o.handle || o.identifier, createdAt: null }
        : { handle: o.identifier, displayName: o.identifier, createdAt: null }
    );
  }

  // 3) Build include list honoring bypass eligibility and excludes
  const selectedInclude: SelectedAccount[] = [];
  for (const o of inc) {
    const key = o.identifier_type === 'user_id' ? `id:${o.identifier}` : `handle:${o.identifier}`;
    const p = includeByKey.get(key);
    if (!p) continue;
    if (isExcluded(p)) continue;

    const elig = o.bypass_eligibility ? { eligible: true, reasons: ['admin:include override (bypass=true)'] } : computeEligibility(p);
    if (!o.bypass_eligibility && !elig.eligible) continue;

    selectedInclude.push({ profile: p, eligibility: elig });
  }

  // 4) Build eligible base list (exclude excluded and already included)
  const selectedBase: SelectedAccount[] = [];
  for (const p of baseProfiles) {
    if (isExcluded(p)) continue;
    const alreadyIncluded = selectedInclude.find((si) => keyOf(si.profile) === keyOf(p));
    if (alreadyIncluded) continue;
    const elig = computeEligibility(p);
    if (!elig.eligible) continue;
    selectedBase.push({ profile: p, eligibility: elig });
  }

  // 5) Merge with includes prioritized, sort by followers desc, and cap to max accounts
  const merged = [...selectedInclude, ...selectedBase];
  merged.sort((a, b) => (b.profile.followersCount ?? 0) - (a.profile.followersCount ?? 0));

  if (merged.length > TWITTER_MAX_ACCOUNTS) {
    const includesCount = selectedInclude.length;
    const remaining = Math.max(TWITTER_MAX_ACCOUNTS - includesCount, 0);
    return [...selectedInclude, ...selectedBase.slice(0, remaining)];
  }

  return merged;
}

/**
 * Fetches recent tweets authored by the provided accounts within the given time window.
 *
 * @param accounts - Selected accounts to retrieve tweets for
 * @param sinceMinutes - Time window, in minutes, to look back for tweets (defaults to DEFAULT_RECENCY_MINUTES)
 * @returns An array of tweets authored by the provided accounts created within the specified time window
 */
export async function fetchRecentTweetsForAccounts(
  _accounts: SelectedAccount[],
  _sinceMinutes: number = DEFAULT_RECENCY_MINUTES
): Promise<SimpleTweet[]> {
  return [];
}

/**
 * Produce a planner-style snapshot of selected Twitter accounts with profile fields and computed eligibility.
 *
 * @returns An array of account snapshots where each item contains:
 * - `user_id` (optional) — the account's user id when known
 * - `handle` — the account handle
 * - `displayName` (optional) — the account display name when known
 * - `followersCount` (optional) — the follower count when known
 * - `postsCount` (optional) — the posts/tweets count when known
 * - `createdAt` — the account creation timestamp as an ISO string or `null` when unavailable
 * - `eligibility` — the computed eligibility object with `eligible` and `reasons`
 */
export async function getAccountsSnapshot(): Promise<
  Array<{
    user_id?: string;
    handle: string;
    displayName?: string;
    followersCount?: number;
    postsCount?: number;
    createdAt?: string | null;
    eligibility: Eligibility;
  }>
> {
  const accounts = await selectEligibleAccounts();
  return accounts.map((a) => ({
    user_id: a.profile.user_id,
    handle: a.profile.handle,
    displayName: a.profile.displayName,
    followersCount: a.profile.followersCount,
    postsCount: a.profile.postsCount,
    createdAt: a.profile.createdAt ?? null,
    eligibility: a.eligibility
  }));
}
