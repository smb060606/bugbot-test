import type { RequestHandler } from '@sveltejs/kit';

function authOk(expected: string | undefined, token: string | null) {
  return !!expected && !!token && token === expected;
}

function env(name: string) {
  return process.env[name];
}

/**
 * Admin metrics for summaries audit logs (summary_requests).
 * - Requires header: x-admin-token: <ADMIN_SECRET>
 * - Query params:
 *    - hours: lookback window in hours (default 24)
 *    - limit: max rows to scan from Supabase (default 1000)
 * - Response:
 *    {
 *      windowStart: ISO,
 *      windowEnd: ISO,
 *      total: number,
 *      byStatus: { ok: number, rate_limited: number, missing_key: number, timeout: number, failed: number },
 *      successRate: number (0..1),
 *    }
 */
export const GET: RequestHandler = async (event) => {
  const token = event.request.headers.get('x-admin-token');
  const expected = env('ADMIN_SECRET');
  if (!authOk(expected, token)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const supaUrl = env('SUPABASE_URL') || env('PUBLIC_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supaUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'server_misconfigured', message: 'Supabase URL or service role key missing' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const hoursParam = Number(event.url.searchParams.get('hours'));
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? hoursParam : 24;
  const limitParam = Number(event.url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 5000) : 1000;

  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  const startISO = start.toISOString();

  try {
    // Fetch statuses within window (scan limited rows, newest first)
    const url = new URL(`${supaUrl}/rest/v1/summary_requests`);
    url.searchParams.set('select', 'status');
    url.searchParams.set('created_at', `gte.${startISO}`);
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'supabase_error', status: res.status }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const rows: Array<{ status: 'ok' | 'rate_limited' | 'missing_key' | 'timeout' | 'failed' }> = await res.json();

    const byStatus = {
      ok: 0,
      rate_limited: 0,
      missing_key: 0,
      timeout: 0,
      failed: 0
    };
    for (const r of rows) {
      if (r && r.status && r.status in byStatus) {
        // @ts-ignore
        byStatus[r.status] += 1;
      }
    }
    const total = rows.length;
    const successRate = total > 0 ? byStatus.ok / total : 0;

    const payload = {
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      total,
      byStatus,
      successRate
    };

    return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'metrics_failed', message: e?.message ?? 'Unknown error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
