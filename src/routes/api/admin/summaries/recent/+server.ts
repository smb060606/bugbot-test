import type { RequestHandler } from '@sveltejs/kit';

function authOk(expected: string | undefined, token: string | null) {
  return !!expected && !!token && token === expected;
}

function env(name: string) {
  return process.env[name];
}

/**
 * Admin: Recent summary_requests rows for observability
 * - Requires header: x-admin-token: <ADMIN_SECRET>
 * - Query params:
 *    - hours: lookback window in hours (default 24)
 *    - limit: max rows (default 50, max 500)
 *    - status: optional filter by status (ok|rate_limited|missing_key|timeout|failed)
 * - Response: array of recent rows with selected columns
 */
export const GET: RequestHandler = async (event) => {
  const token = event.request.headers.get('x-admin-token');
  const expected = env('ADMIN_SECRET');
  if (!authOk(expected, token)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supaUrl = env('SUPABASE_URL') || env('PUBLIC_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supaUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'server_misconfigured', message: 'Supabase URL or service role key missing' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const hoursParam = Number(event.url.searchParams.get('hours'));
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? hoursParam : 24;
  const limitParam = Number(event.url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 50;
  const status = (event.url.searchParams.get('status') || '').toLowerCase();

  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  const startISO = start.toISOString();

  try {
    const url = new URL(`${supaUrl}/rest/v1/summary_requests`);
    // select a subset of columns for the grid
    url.searchParams.set(
      'select',
      [
        'id',
        'created_at',
        'match_id',
        'platform',
        'phase',
        'window_minutes',
        'posts_count',
        'chars_count',
        'model',
        'status',
        'error_message',
        'duration_ms'
      ].join(',')
    );
    url.searchParams.set('created_at', `gte.${startISO}`);
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', String(limit));
    if (status && ['ok', 'rate_limited', 'missing_key', 'timeout', 'failed'].includes(status)) {
      url.searchParams.set('status', `eq.${status}`);
    }

    const res = await fetch(url.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'supabase_error', status: res.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const rows = await res.json();
    return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'recent_failed', message: e?.message ?? 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
