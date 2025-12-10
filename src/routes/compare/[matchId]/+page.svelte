<script lang="ts">
  export let data: {
    matchId: string;
    compare: null | {
      generatedAt: string;
      matchId: string;
      kickoffISO: string | null;
      window: 'pre' | 'live' | 'post';
      sinceMin: number;
      platforms: {
        bsky?: {
          matchId: string;
          platform: 'bsky';
          window: 'pre' | 'live' | 'post';
          generatedAt: string;
          tick: number;
          sentiment: {
            pos: number;
            neu: number;
            neg: number;
            counts: { total: number; pos: number; neu: number; neg: number };
          };
          volume: number;
          accountsUsed: Array<{ did: string; handle: string; displayName?: string }>;
          topics: Array<{ keyword: string; count: number }>;
          samples: Array<{ authorHandle: string; text: string; createdAt: string }>;
        } | null;
        // twitter?: any;
        // threads?: any;
      };
    };
  };

  const matchId = data.matchId;
  const snapshot = data.compare;
</script>

<style>
  .container { max-width: 1100px; margin: 1rem auto; padding: 1rem; }
  .grid { display: grid; gap: 1rem; }
  @media (min-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; background: #fff; }
  .muted { color: #6b7280; font-size: 0.9rem; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .chips { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.35rem; }
  .chip { font-size: 0.75rem; padding: 0.15rem 0.45rem; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 999px; }
  .list { margin-top: 0.5rem; border-top: 1px dashed #e5e7eb; padding-top: 0.5rem; }
  .row { display: flex; gap: 1rem; flex-wrap: wrap; align-items: baseline; }
  h1, h2, h3 { margin: 0.2rem 0 0.6rem 0; }
</style>

<div class="container">
  <h1>Compare Platforms — {matchId}</h1>
  {#if snapshot}
    <div class="muted">
      Generated: <span class="mono">{snapshot.generatedAt}</span>
      {#if snapshot.kickoffISO} • Kickoff: <span class="mono">{snapshot.kickoffISO}</span>{/if}
      • Window: <strong>{snapshot.window.toUpperCase()}</strong>
      • Since: last {snapshot.sinceMin} min
    </div>

    <div class="grid" style="margin-top: 1rem;">
      <!-- Bluesky panel -->
      <div class="card">
        <h2>Bluesky</h2>
        {#if snapshot.platforms?.bsky}
          <div class="row">
            <div>Volume: <strong>{snapshot.platforms.bsky.volume}</strong></div>
            <div>Total posts scored: <strong>{snapshot.platforms.bsky.sentiment.counts.total}</strong></div>
          </div>
          <div class="row">
            <div class="chip">pos: {(snapshot.platforms.bsky.sentiment.pos * 100).toFixed(0)}%</div>
            <div class="chip">neu: {(snapshot.platforms.bsky.sentiment.neu * 100).toFixed(0)}%</div>
            <div class="chip">neg: {(snapshot.platforms.bsky.sentiment.neg * 100).toFixed(0)}%</div>
          </div>

          <div class="list">
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

          <div class="list">
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

          <div class="list">
            <h3>Accounts Used ({snapshot.platforms.bsky.accountsUsed.length})</h3>
            <p class="muted" style="font-size: 0.85rem; margin: 0.25rem 0 0.5rem 0;">
              These accounts contributed to the sentiment analysis for this {snapshot.window} window.
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
        {:else}
          <div class="muted">No Bluesky data yet.</div>
        {/if}
      </div>

      <!-- Twitter/Threads placeholders -->
      <div class="card">
        <h2>Twitter (X)</h2>
        <div class="muted">Planned behind explicit budget config; not enabled in this phase.</div>

        <h2 style="margin-top:1rem;">Threads</h2>
        <div class="muted">Planned behind explicit budget config; not enabled in this phase.</div>
      </div>
    </div>
  {:else}
    <p class="muted">No snapshot yet. Provide kickoff as ISO param to enforce windows, e.g.:
      <span class="mono">/compare/{matchId}?kickoff=2025-10-19T11:30:00Z&sinceMin=30</span>
    </p>
  {/if}
</div>
