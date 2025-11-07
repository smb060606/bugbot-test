import type { RequestHandler } from './$types';
import { buildTick } from '$lib/services/bskyService';
import { DEFAULT_RECENCY_MINUTES, DEFAULT_TICK_INTERVAL_SEC } from '$lib/config/bsky';
import { getWindowState, DEFAULT_LIVE_DURATION_MIN } from '$lib/utils/matchWindow';

export const GET: RequestHandler = async ({ setHeaders, url, request }) => {
  const sseHeaders = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  } as const;

  // In SvelteKit runtime, setHeaders is provided on the event.
  // In tests, the event object may not include setHeaders; guard accordingly.
  if (typeof setHeaders === 'function') {
    setHeaders(sseHeaders as any);
  }

  const matchId = url.searchParams.get('matchId') ?? 'demo';

  // Optional override for testing (pre|live|post). If omitted, we compute window dynamically.
  const windowParam = (url.searchParams.get('window') ?? '').toLowerCase();
  const forceWindow: 'pre' | 'live' | 'post' | null =
    windowParam === 'pre' || windowParam === 'post' || windowParam === 'live'
      ? (windowParam as any)
      : null;

  // Kickoff time (ISO string) and optional live duration to determine match windows
  const kickoffISO = url.searchParams.get('kickoff') ?? '';
  const liveMinParam = Number(url.searchParams.get('liveMin'));
  const liveDurationMin = Number.isFinite(liveMinParam) && liveMinParam > 0 ? liveMinParam : DEFAULT_LIVE_DURATION_MIN;

  const nInterval = Number(url.searchParams.get('intervalSec'));
  const intervalSec = Math.max(1, Number.isFinite(nInterval) && nInterval > 0 ? nInterval : DEFAULT_TICK_INTERVAL_SEC);

  const nSince = Number(url.searchParams.get('sinceMin'));
  const sinceMin = Number.isFinite(nSince) && nSince > 0 ? nSince : DEFAULT_RECENCY_MINUTES;

  // Support resuming from Last-Event-ID (header or query param ?lastEventId=)
  const lastEventIdHeader = request?.headers?.get('last-event-id') || null;
  const lastEventIdParam = url.searchParams.get('lastEventId');
  const parsedLast = Number(lastEventIdParam ?? lastEventIdHeader);
  const startTick = Number.isFinite(parsedLast) && parsedLast >= 0 ? parsedLast + 1 : 0;

  // Heartbeat keep-alive interval (seconds)
  const nHeartbeat = Number(url.searchParams.get('heartbeatSec'));
  const heartbeatSec = Number.isFinite(nHeartbeat) && nHeartbeat > 0 ? nHeartbeat : 15;

  const encoder = new TextEncoder();
  let stopped = false;
  let closer: ReturnType<typeof setTimeout> | null = null;
  let pinger: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Initial comment to open the stream in some proxies and communicate parameters
      const intro = {
        matchId,
        kickoffISO: kickoffISO || '(none)',
        liveDurationMin,
        intervalSec,
        sinceMin,
        mode: forceWindow ? `force:${forceWindow}` : 'dynamic'
      };
      // Batch initial frames into a single chunk so tests/readers observe them together
      const init = `: stream start
retry: ${Math.max(1000, intervalSec * 1000)}
event: meta
data: ${JSON.stringify(intro)}

`;
      controller.enqueue(encoder.encode(init));

      // Heartbeat comments to keep proxies/connections alive
      pinger = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive ${Date.now()}\n\n`));
        } catch {
          // ignore enqueue errors on closed controller
        }
      }, heartbeatSec * 1000);

      let tick = startTick;

      const loop = async () => {
        while (!stopped) {
          try {
            // Determine current window once
            const state = forceWindow ?? getWindowState({ kickoffISO, liveDurationMin });
            const dynamic = state === 'ended' ? 'post' : state;

            // Build and send tick
            const payload = await buildTick(matchId, dynamic as 'pre' | 'live' | 'post', tick++, sinceMin);
            // Include SSE id for resume support
            controller.enqueue(encoder.encode(`id: ${tick}\ndata: ${JSON.stringify(payload)}\n\n`));

            // If window has ended, emit ended event and break after final tick
            if (!forceWindow && state === 'ended') {
              controller.enqueue(encoder.encode(`event: ended\ndata: ${JSON.stringify({ matchId, at: new Date().toISOString() })}\n\n`));
              break;
            }
          } catch (e) {
            const err = { message: 'tick_failed' };
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(err)}\n\n`));
          }
          await new Promise((r) => setTimeout(r, intervalSec * 1000));
        }

        // Close after loop exits
        if (pinger) {
          clearInterval(pinger);
          pinger = null;
        }
        try {
          controller.close();
        } catch {
          // no-op
        }
      };

      loop().catch(() => {
        try {
          controller.close();
        } catch {
          // ignore
        }
      });

      // Soft cap the connection to 15 minutes; client can reconnect
      closer = setTimeout(() => {
        stopped = true;
        if (pinger) {
          clearInterval(pinger);
          pinger = null;
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
      }, 15 * 60 * 1000);
    },
    cancel() {
      stopped = true;
      if (closer) {
        clearTimeout(closer);
        closer = null;
      }
      if (pinger) {
        clearInterval(pinger);
        pinger = null;
      }
    }
  });

  return new Response(stream, { headers: new Headers(sseHeaders) });
};
