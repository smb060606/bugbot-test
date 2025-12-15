import type { RequestHandler } from '@sveltejs/kit';
import { getSupabaseAdmin } from '$lib/supabaseAdmin';
import { getSupabaseClient } from '$lib/supabaseClient';

type HealthStatus = {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  services: {
    database: 'ok' | 'degraded' | 'down';
    bluesky?: 'ok' | 'degraded' | 'down';
  };
  version?: string;
};

/**
 * GET /api/health
 * Health check endpoint for monitoring and load balancers.
 * Returns 200 if healthy, 503 if degraded/down.
 */
export const GET: RequestHandler = async () => {
  const health: HealthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'ok'
    },
    version: process.env.npm_package_version
  };

  let hasErrors = false;

  // Check database connectivity
  try {
    const admin = getSupabaseAdmin();
    if (admin) {
      const { error } = await admin.from('users').select('id').limit(1);
      if (error) {
        health.services.database = 'degraded';
        hasErrors = true;
      }
    } else {
      // Fallback to anon client
      const client = getSupabaseClient();
      if (!client) {
        health.services.database = 'down';
        health.status = 'degraded';
        hasErrors = true;
      }
    }
  } catch {
    health.services.database = 'down';
    health.status = 'down';
    hasErrors = true;
  }

  // Check Bluesky connectivity (lightweight check)
  try {
    const { BskyAgent } = await import('@atproto/api');
    const { BSKY_APPVIEW_BASE } = await import('$lib/config/bsky');
    const base = BSKY_APPVIEW_BASE.endsWith('/xrpc')
      ? BSKY_APPVIEW_BASE.slice(0, -('/xrpc'.length))
      : BSKY_APPVIEW_BASE;
    const agent = new BskyAgent({ service: base });
    // Try a lightweight operation (this will fail fast if unreachable)
    await (agent as any).getProfile?.({ actor: 'bsky.app' }).catch(() => {
      throw new Error('Bluesky unreachable');
    });
    health.services.bluesky = 'ok';
  } catch {
    health.services.bluesky = 'degraded';
    // Don't mark overall as down for Bluesky issues
  }

  // Determine overall status
  if (health.services.database === 'down') {
    health.status = 'down';
  } else if (hasErrors || health.services.bluesky === 'degraded') {
    health.status = 'degraded';
  }

  const statusCode = health.status === 'down' ? 503 : health.status === 'degraded' ? 200 : 200;

  return new Response(JSON.stringify(health, null, 2), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
};

