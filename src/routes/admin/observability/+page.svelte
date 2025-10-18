<script lang="ts">
  import { onMount } from 'svelte';

  type Status = 'ok' | 'rate_limited' | 'missing_key' | 'timeout' | 'failed';

  let adminToken = '';
  let hours = 24;
  let limit = 50;
  let statusFilter = '';

  let loadingMetrics = false;
  let loadingRecent = false;
  let errorMetrics = '';
  let errorRecent = '';

  let metrics: {
    windowStart: string;
    windowEnd: string;
    total: number;
    byStatus: Record<Status, number>;
    successRate: number;
  } | null = null;

  type Row = {
    id: string;
    created_at: string;
    match_id: string;
    platform: 'bsky' | 'twitter' | 'threads' | 'combined';
    phase: 'pre' | 'live' | 'post';
    window_minutes: number;
    posts_count: number;
    chars_count: number;
    model: string | null;
    status: Status;
    error_message: string | null;
    duration_ms: number | null;
  };

  let recent: Row[] = [];

  function saveToken() {
    try {
      sessionStorage.setItem('ADMIN_TOKEN', adminToken);
    } catch {}
  }

  function loadToken() {
    try {
      const t = sessionStorage.getItem('ADMIN_TOKEN');
      if (t) adminToken = t;
    } catch {}
  }

  async function loadMetrics() {
    loadingMetrics = true;
    errorMetrics = '';
    try {
      const qs = new URLSearchParams({
        hours: String(hours || 24),
        limit: String(Math.min(Math.max(limit || 50, 1), 5000))
      });
      const res = await fetch(`/api/admin/summaries/metrics?${qs.toString()}`, {
        headers: {
          'x-admin-token': adminToken
        }
      });
      if (!res.ok) {
        throw new Error(`Metrics fetch failed (${res.status})`);
      }
      metrics = await res.json();
    } catch (e: any) {
      errorMetrics = e?.message ?? 'Failed to load metrics';
      metrics = null;
    } finally {
      loadingMetrics = false;
    }
  }

  async function loadRecent() {
    loadingRecent = true;
    errorRecent = '';
    try {
      const params: Record<string, string> = {
        hours: String(hours || 24),
        limit: String(Math.min(Math.max(limit || 50, 1), 500))
      };
      const s = statusFilter.trim().toLowerCase();
      if (s) params.status = s;
      const qs = new URLSearchParams(params);
      const res = await fetch(`/api/admin/summaries/recent?${qs.toString()}`, {
        headers: {
          'x-admin-token': adminToken
        }
      });
      if (!res.ok) {
        throw new Error(`Recent fetch failed (${res.status})`);
      }
      recent = await res.json();
    } catch (e: any) {
      errorRecent = e?.message ?? 'Failed to load recent rows';
      recent = [];
    } finally {
      loadingRecent = false;
    }
  }

  async function refreshAll() {
    await Promise.all([loadMetrics(), loadRecent()]);
  }

  onMount(() => {
    loadToken();
  });

  function pct(n: number, d: number) {
    if (!d) return '0%';
    return `${Math.round((n / d) * 100)}%`;
  }
</script>

<section class="container">
  <h1>Admin: Summaries Observability</h1>

  <div class="card">
    <h2>Admin Token</h2>
    <div class="row">
      <input
        type="password"
        placeholder="Enter ADMIN_SECRET"
        bind:value={adminToken}
        autocomplete="off"
      />
      <button on:click={saveToken}>Save</button>
    </div>
    <small>Token is stored in this tab's sessionStorage. Do not share.</small>
  </div>

  <div class="card">
    <h2>Controls</h2>
    <div class="row controls">
      <label>
        Lookback (hours)
        <input type="number" min="1" max="720" bind:value={hours} />
      </label>
      <label>
        Limit
        <input type="number" min="1" max="500" bind:value={limit} />
      </label>
      <label>
        Status
        <select bind:value={statusFilter}>
          <option value="">All</option>
          <option value="ok">ok</option>
          <option value="rate_limited">rate_limited</option>
          <option value="missing_key">missing_key</option>
          <option value="timeout">timeout</option>
          <option value="failed">failed</option>
        </select>
      </label>
      <button on:click={refreshAll} disabled={loadingMetrics || loadingRecent}>Refresh</button>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Metrics</h2>
      {#if loadingMetrics}
        <p>Loading metrics…</p>
      {:else if errorMetrics}
        <p class="error">{errorMetrics}</p>
      {:else if !metrics}
        <p class="muted">No data.</p>
      {:else}
        <p class="muted">
          Window: {new Date(metrics.windowStart).toLocaleString()} → {new Date(metrics.windowEnd).toLocaleString()}
        </p>
        <div class="stats">
          <div class="stat">
            <div class="label">Total</div>
            <div class="value">{metrics.total}</div>
          </div>
          <div class="stat">
            <div class="label">Success</div>
            <div class="value">{metrics.byStatus.ok} ({pct(metrics.byStatus.ok, metrics.total)})</div>
          </div>
          <div class="stat">
            <div class="label">Rate limited</div>
            <div class="value">{metrics.byStatus.rate_limited}</div>
          </div>
          <div class="stat">
            <div class="label">Missing key</div>
            <div class="value">{metrics.byStatus.missing_key}</div>
          </div>
          <div class="stat">
            <div class="label">Timeout</div>
            <div class="value">{metrics.byStatus.timeout}</div>
          </div>
          <div class="stat">
            <div class="label">Failed</div>
            <div class="value">{metrics.byStatus.failed}</div>
          </div>
        </div>
        <div class="bar">
          {#if metrics.total > 0}
            <div class="bar-ok" style="width: {Math.max(1, Math.round((metrics.byStatus.ok / metrics.total) * 100))}%;">
              ok
            </div>
            <div class="bar-fail" style="width: {Math.max(1, Math.round(((metrics.total - metrics.byStatus.ok) / metrics.total) * 100))}%;">
              non-ok
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="card">
      <h2>Recent Activity</h2>
      {#if loadingRecent}
        <p>Loading recent…</p>
      {:else if errorRecent}
        <p class="error">{errorRecent}</p>
      {:else if recent.length === 0}
        <p class="muted">No recent rows.</p>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Status</th>
                <th>Match</th>
                <th>Platform</th>
                <th>Phase</th>
                <th>Win (m)</th>
                <th>Posts</th>
                <th>Chars</th>
                <th>Model</th>
                <th>Duration (ms)</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {#each recent as r}
                <tr class={r.status !== 'ok' ? 'row-error' : ''}>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.status}</td>
                  <td>{r.match_id}</td>
                  <td>{r.platform}</td>
                  <td>{r.phase}</td>
                  <td>{r.window_minutes}</td>
                  <td>{r.posts_count}</td>
                  <td>{r.chars_count}</td>
                  <td>{r.model ?? '-'}</td>
                  <td>{r.duration_ms ?? '-'}</td>
                  <td class="error-cell">{r.error_message ?? ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }
  .row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .controls input, .controls select {
    min-width: 120px;
  }
  .card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;
    background: #fff;
  }
  .grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr 1fr;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .stat {
    background: #f9f9f9;
    border: 1px solid #eee;
    padding: 0.75rem;
    border-radius: 6px;
  }
  .stat .label {
    font-size: 0.8rem;
    color: #666;
  }
  .stat .value {
    font-weight: 600;
    font-size: 1.1rem;
  }
  .bar {
    display: flex;
    height: 16px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #eee;
  }
  .bar-ok {
    background: #2e7d32;
    color: #fff;
    font-size: 0.7rem;
    text-align: center;
  }
  .bar-fail {
    background: #c62828;
    color: #fff;
    font-size: 0.7rem;
    text-align: center;
  }
  .muted { color: #666; }
  .error { color: #b00020; }
  .table-wrap {
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th, td {
    border-bottom: 1px solid #eee;
    padding: 0.5rem;
    text-align: left;
    vertical-align: top;
  }
  .row-error td {
    background: #fff5f5;
  }
  .error-cell {
    max-width: 320px;
    word-break: break-word;
    white-space: pre-wrap;
  }
</style>
