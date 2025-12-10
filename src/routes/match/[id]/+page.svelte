<script lang="ts">
  import { onMount } from 'svelte';
  import { getLiveBin } from '$lib/utils/matchWindow';
import { createSSEClient, type SSEClientController } from '$lib/utils/sseClient';
  export let data: {
    matchId: string;
    kickoff: string;
    sinceMin: number;
    liveMin: number;
    currentWindow: 'pre' | 'live' | 'post';
  };

  const matchId = data.matchId;
  let active: 'pre' | 'live' | 'post' = data.currentWindow;
  let messages: string[] = [];
  let accountsUsedLive: Array<{ did?: string; handle: string; displayName?: string }> = [];

  // Build SSE URL with kickoff and timing to enforce windows
  function sseUrl(platform: 'bsky' | 'twitter') {
    const params = new URLSearchParams({
      matchId,
      kickoff: data.kickoff || '',
      liveMin: String(data.liveMin),
      sinceMin: String(data.sinceMin)
    });
    return `/live/${platform}/stream.sse?${params.toString()}`;
  }

  function connect(platform: 'bsky' | 'twitter') {
    const url = sseUrl(platform);
    const client = createSSEClient<any>(url, {
      namedListeners: {
        meta: (ev) => {
          messages = [`${platform.toUpperCase()} :: [meta] ${ev.data}`, ...messages].slice(0, 200);
        },
        ended: (ev) => {
          messages = [`${platform.toUpperCase()} :: [ended] ${ev.data}`, ...messages].slice(0, 200);
          client.stop();
        }
      },
      onMessage: (data, ev) => {
        // Keep raw message line for UI, but also parse JSON for live accounts list
        messages = [`${platform.toUpperCase()} :: ${ev.data}`, ...messages].slice(0, 200);
        if (data && data.platform === 'bsky' && Array.isArray((data as any).accountsUsed)) {
          accountsUsedLive = (data as any).accountsUsed.map((a: any) => ({
            did: a?.did,
            handle: a?.handle,
            displayName: a?.displayName
          }));
        }
      },
      onOpen: () => { /* connection established */ },
      onError: () => { /* auto-reconnect handled internally */ },
      backoffBaseMs: 1000,
      backoffMaxMs: 30000
    });
    client.start();
    return client;
  }

  let esB: SSEClientController | null = null;
  // Twitter SSE exists as placeholder; keep disabled until configured
  // let esT: EventSource | null = null;

  onMount(() => {
    esB = connect('bsky');
    // esT = connect('twitter');
    // keep live bin label reasonably fresh
    updateLiveBinLabel();
    const t = setInterval(updateLiveBinLabel, 30000);
    return () => {
      esB?.stop();
      // esT?.close();
      clearInterval(t);
    };
  });

  // Snapshot (compare) state for pre/post sections
  let snapLoading = false;
  let snapError: string | null = null;
  let snapshot: any = null;

  async function loadSnapshot() {
    snapLoading = true;
    snapError = null;
    snapshot = null;
    try {
      const qs = new URLSearchParams();
      if (data.kickoff) qs.set('kickoff', data.kickoff);
      qs.set('sinceMin', String(data.sinceMin));
      qs.set('liveMin', String(data.liveMin));
      const res = await fetch(`/api/compare/${encodeURIComponent(matchId)}?${qs.toString()}`);
      if (!res.ok) {
        let errorMessage = `Failed to load snapshot (${res.status})`;
        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          const txt = await res.text().catch(() => '');
          if (txt) errorMessage = txt;
        }
        throw new Error(errorMessage);
      }
      snapshot = await res.json();
    } catch (e: any) {
      snapError = e?.message || 'Failed to load snapshot. Please try again.';
      console.error('Snapshot load error:', e);
    } finally {
      snapLoading = false;
    }
  }

  // AI Summary UI state (reusing existing endpoint)
  let summaryOpen = false;
  let summaryLoading = false;
  let summaryError: string | null = null;
  let summaryText: string | null = null;
  let summaryMeta: { phase?: string; accountsUsed?: Array<{ did: string; handle: string; displayName?: string }>; liveBin?: { index: number; startMinute: number; endMinute: number } } | null = null;
  let summaryPlatform: 'combined' | 'bsky' | 'twitter' | 'threads' = 'combined';

  // Live bin label (e.g., "15–30") computed from kickoff; updates periodically
  let liveBinLabel: string = '';
  function updateLiveBinLabel() {
    if (!data.kickoff) {
      liveBinLabel = '';
      return;
    }
    const bin = getLiveBin(data.kickoff, Date.now());
    liveBinLabel = `${bin.startMinute}–${bin.endMinute}`;
  }

  async function loadSummary(phase: 'pre' | 'live' | 'post') {
    summaryLoading = true;
    summaryError = null;
    summaryText = null;
    summaryMeta = null;
    try {
      const qs = new URLSearchParams({
        matchId,
        platform: summaryPlatform,
        kickoff: data.kickoff || '',
        liveMin: String(data.liveMin),
        mode: phase
      });
      const res = await fetch(`/api/summaries/latest?${qs.toString()}`);
      if (!res.ok) {
        let errorMessage = `Failed to load summary (${res.status})`;
        try {
          const err = await res.json();
          if (err.error === 'rate_limited') {
            errorMessage = `Rate limit reached. Please wait ${Math.ceil((err.retryAfterMs || 60000) / 1000)} seconds before trying again.`;
          } else if (err.error === 'openai_timeout') {
            errorMessage = 'Summary generation timed out. Please try again.';
          } else if (err.error === 'missing_api_key') {
            errorMessage = 'AI summary service is not configured.';
          } else {
            errorMessage = err.message || err.error || errorMessage;
          }
        } catch {
          // Use default error message
        }
        throw new Error(errorMessage);
      }
      const payload = await res.json();
      summaryText = payload?.summary || '(No summary generated yet)';
      summaryMeta = {
        phase: payload?.phase,
        accountsUsed: Array.isArray(payload?.accountsUsed) ? payload.accountsUsed : undefined,
        liveBin: payload?.liveBin ?? null
      };
    } catch (e: any) {
      summaryError = e?.message || 'Failed to load summary. Please try again.';
      console.error('Summary load error:', e);
    } finally {
      summaryLoading = false;
    }
  }
</script>

<style>
  .container { max-width: 1100px; margin: 1rem auto; padding: 1rem; }
  .grid { display: grid; gap: 1rem; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; background: #fff; }
  .muted { color: #6b7280; font-size: 0.9rem; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .chips { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.35rem; }
  .chip { font-size: 0.75rem; padding: 0.15rem 0.45rem; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 999px; }
  .tabs { display: flex; gap: 0.5rem; }
  .tab { padding: 0.35rem 0.7rem; border: 1px solid #e5e7eb; border-radius: 6px; background: #fafafa; cursor: pointer; transition: all 0.2s; }
  .tab.active { background: #eef2ff; border-color: #c7d2fe; }
  .tab:hover:not(:disabled) { background: #f3f4f6; }
  .tab:disabled { opacity: 0.6; cursor: not-allowed; }
  ul.msgs { max-height: 280px; overflow: auto; }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>

<div class="container">
  <h1>Match: <span class="mono">{matchId}</span></h1>
  <div class="muted">
    Kickoff: <span class="mono">{data.kickoff || 'not set'}</span> • Window: <strong>{active.toUpperCase()}</strong> • Since: last {data.sinceMin} min
  </div>

  <div class="tabs" style="margin: 0.75rem 0;">
    <button class="tab {active === 'pre' ? 'active' : ''}" on:click={() => (active = 'pre')}>Pre</button>
    <button class="tab {active === 'live' ? 'active' : ''}" on:click={() => (active = 'live')}>Live</button>
    <button class="tab {active === 'post' ? 'active' : ''}" on:click={() => (active = 'post')}>Post</button>
  </div>

  {#if active === 'live'}
    <div class="card">
      <h2>Live Stream (Bluesky)</h2>
      <div class="muted">Stream URL: <span class="mono">{sseUrl('bsky')}</span></div>
      <ul class="msgs">
        {#each messages as m}
          <li class="text-sm font-mono">{m}</li>
        {/each}
        {#if !messages.length}
          <li class="muted">Waiting for live ticks...</li>
        {/if}
      </ul>

      {#if accountsUsedLive.length}
        <div style="margin-top:0.5rem; padding-top: 0.5rem; border-top: 1px solid #e5e7eb;">
          <h3>Accounts Used (Live) ({accountsUsedLive.length})</h3>
          <p class="muted" style="font-size: 0.85rem; margin: 0.25rem 0 0.5rem 0;">
            These accounts are currently being monitored for live sentiment analysis.
            <a href="/methodology#overrides" style="color: #3b82f6; text-decoration: underline;">Learn more</a>.
          </p>
          <div class="chips">
            {#each accountsUsedLive as a}
              <span class="chip" title={a.did ? `DID: ${a.did}` : ''}>
                @{a.handle}{a.displayName ? ` (${a.displayName})` : ''}
              </span>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if active !== 'live'}
    <div class="card">
      <div class="flex items-center justify-between">
        <h2>{active === 'pre' ? 'Pre-Match Snapshot' : 'Post-Match Snapshot'}</h2>
        <button class="tab" on:click={() => void loadSnapshot()} disabled={snapLoading}>
          {snapLoading ? 'Loading…' : 'Refresh Snapshot'}
        </button>
      </div>
      {#if snapError}
        <div class="error-message" style="padding: 0.75rem; background: #fee2e2; border: 1px solid #fecaca; border-radius: 6px; color: #991b1b; margin-top: 0.5rem;">
          <strong>Error loading snapshot:</strong> {snapError}
        </div>
      {:else if snapshot}
        <div class="muted">
          Generated: <span class="mono">{snapshot.generatedAt}</span> • Window: <strong>{snapshot.window.toUpperCase()}</strong>
        </div>
        {#if snapshot.platforms?.bsky}
          <div style="margin-top:0.5rem;">
            <div>Volume: <strong>{snapshot.platforms.bsky.volume}</strong></div>
            <div class="chips" style="margin-top:0.25rem;">
              <span class="chip">pos {(snapshot.platforms.bsky.sentiment.pos * 100).toFixed(0)}%</span>
              <span class="chip">neu {(snapshot.platforms.bsky.sentiment.neu * 100).toFixed(0)}%</span>
              <span class="chip">neg {(snapshot.platforms.bsky.sentiment.neg * 100).toFixed(0)}%</span>
            </div>

            <div style="margin-top:0.5rem;">
              <h3>Topics</h3>
              <div class="chips">
                {#each snapshot.platforms.bsky.topics as t}
                  <span class="chip">{t.keyword} • {t.count}</span>
                {/each}
                {#if !snapshot.platforms.bsky.topics?.length}
                  <span class="muted">No topic matches yet.</span>
                {/if}
              </div>
            </div>

            <div style="margin-top:0.5rem;">
              <h3>Sample Posts</h3>
              {#if snapshot.platforms.bsky.samples?.length}
                {#each snapshot.platforms.bsky.samples as s}
                  <div style="margin: 0.4rem 0;">
                    <span class="mono">@{s.authorHandle}</span> — <span class="muted">{new Date(s.createdAt).toLocaleTimeString()}</span>
                    <div>{s.text}</div>
                  </div>
                {/each}
              {:else}
                <div class="muted">No samples available.</div>
              {/if}
            </div>

            <div style="margin-top:0.5rem; padding-top: 0.5rem; border-top: 1px solid #e5e7eb;">
              <h3>Accounts Used ({snapshot.platforms.bsky.accountsUsed.length})</h3>
              <p class="muted" style="font-size: 0.85rem; margin: 0.25rem 0 0.5rem 0;">
                These accounts contributed to the sentiment analysis for this {active} window.
                <a href="/methodology#overrides" style="color: #3b82f6; text-decoration: underline;">Learn more about account selection</a>.
              </p>
              <div class="chips">
                {#each snapshot.platforms.bsky.accountsUsed as a}
                  <span class="chip" title={a.did ? `DID: ${a.did}` : ''}>
                    @{a.handle}{a.displayName ? ` (${a.displayName})` : ''}
                  </span>
                {/each}
              </div>
            </div>
          </div>
        {:else}
          <div class="muted">No Bluesky data yet for snapshot.</div>
        {/if}
      {:else}
        <div class="muted">Click "Refresh Snapshot" to load the latest {active} summary.</div>
      {/if}
    </div>
  {/if}

  <div class="card" style="margin-top:1rem;">
    <div class="flex items-center justify-between">
      <h2>
        AI Summary
        {#if active === 'live' && liveBinLabel}
          <span class="muted">(current bin {liveBinLabel} min)</span>
        {:else if active === 'pre'}
          <span class="muted">(full pre-match window)</span>
        {:else if active === 'post'}
          <span class="muted">(full post-match window)</span>
        {/if}
      </h2>
      <div class="flex items-center gap-2">
        <label class="text-sm text-gray-600">Platform</label>
        <select bind:value={summaryPlatform} class="border rounded px-2 py-1 text-sm">
          <option value="combined">Combined</option>
          <option value="bsky">Bluesky</option>
          <option value="twitter">Twitter</option>
          <option value="threads">Threads</option>
        </select>
        <button
          class="px-3 py-1 rounded border bg-gray-50 hover:bg-gray-100"
          on:click={() => { summaryOpen = true; void loadSummary(active); }}
          disabled={summaryLoading}
        >
          {summaryLoading ? 'Loading...' : 'View AI Summary'}
        </button>
      </div>
    </div>

    {#if summaryOpen}
      <div class="rounded bg-gray-50 p-3 text-sm text-gray-800 whitespace-pre-line" style="margin-top:0.5rem;">
        {#if summaryLoading}
          <div class="text-gray-600" style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="display: inline-block; width: 16px; height: 16px; border: 2px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.6s linear infinite;"></span>
            Generating summary...
          </div>
        {:else if summaryError}
          <div class="error-message" style="padding: 0.75rem; background: #fee2e2; border: 1px solid #fecaca; border-radius: 6px; color: #991b1b;">
            <strong>Error:</strong> {summaryError}
          </div>
        {:else if summaryText}
          {summaryText}
        {:else}
          <div class="text-gray-500">No summary available yet. Try again later.</div>
        {/if}
      </div>
      {#if summaryMeta}
        <div class="muted" style="margin-top:0.5rem;">
          Phase: <strong>{summaryMeta.phase ? summaryMeta.phase.toUpperCase() : 'N/A'}</strong>
          {#if summaryMeta.liveBin}
            • Bin: {summaryMeta.liveBin.startMinute}–{summaryMeta.liveBin.endMinute}
          {/if}
          {#if summaryMeta.accountsUsed?.length}
            • Accounts used: {summaryMeta.accountsUsed.length}
          {/if}
        </div>
      {/if}
      <div class="text-xs text-gray-500">
        Summaries are generated from recent posts in the specified window. Content is aggregate-only and avoids personal data.
      </div>
    {/if}
  </div>
</div>
