<script lang="ts">
  const sections = [
    { id: 'overview', title: 'Overview' },
    { id: 'eligibility', title: 'Eligibility Rules' },
    { id: 'overrides', title: 'Admin Overrides & Transparency' },
    { id: 'windows', title: 'Match Windows & Live Bins' },
    { id: 'budget', title: 'Budget Governance' },
    { id: 'datasources', title: 'Data Sources' },
    { id: 'privacy', title: 'Privacy & Safety' },
    { id: 'status', title: 'Platform Status' }
  ];
</script>

<style>
  .container { max-width: 900px; margin: 1.5rem auto; padding: 1rem; }
  .muted { color: #6b7280; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .chip { display: inline-block; padding: 0.2rem 0.5rem; border: 1px solid #e5e7eb; border-radius: 999px; background: #f9fafb; font-size: 0.8rem; margin-right: 0.35rem; }
  h1, h2, h3 { margin: 0.25rem 0 0.5rem 0; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .toc { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
  ul { padding-left: 1.25rem; }
</style>

<div class="container">
  <h1>Methodology</h1>
  <p class="muted">How Arsenal Matchday Pulse selects accounts, enforces time windows, and maintains transparency.</p>

  <div class="toc">
    {#each sections as s}
      <a class="chip" href={"#"+s.id}>{s.title}</a>
    {/each}
  </div>

  <div id="overview" class="card">
    <h2>Overview</h2>
    <p>
      Arsenal Matchday Pulse aggregates publicly available posts from selected fan accounts and summarizes the overall sentiment for matchday windows:
      pre-match, live, and post-match. Each platform is treated separately to enable apples-to-apples comparisons.
    </p>
  </div>

  <div id="eligibility" class="card">
    <h2>Eligibility Rules</h2>
    <p>To ensure data quality and representativeness, accounts must meet minimum thresholds:</p>
    <ul>
      <li><strong>Follower count:</strong> Minimum 500 followers (configurable per platform)</li>
      <li><strong>Account age:</strong> Minimum 6 months for Bluesky (36 months for Twitter/Threads when implemented)</li>
      <li><strong>Activity:</strong> Accounts are prioritized by follower count when selection caps apply</li>
    </ul>
    <p class="muted">
      Note: Where platform APIs do not expose account creation date, we disclose the uncertainty and rely on followers/activity metrics.
      Admin overrides can bypass eligibility requirements when needed for specific use cases.
    </p>
  </div>

  <div id="overrides" class="card">
    <h2>Admin Overrides & Transparency</h2>
    <p>
      Admins may include or exclude specific accounts for data quality or safety. Overrides can be global or per-match.
      Precedence (higher first): match EXCLUDE → match INCLUDE → global EXCLUDE → global INCLUDE.
      Overrides may bypass eligibility and can expire automatically.
    </p>
    <h3>Account Selection Transparency</h3>
    <p>
      For full transparency, we display the list of accounts used in each analysis window:
    </p>
    <ul>
      <li><strong>Pre-match window:</strong> Accounts used are shown in snapshot views</li>
      <li><strong>Live window:</strong> Accounts are displayed in real-time as data streams in</li>
      <li><strong>Post-match window:</strong> Final account list is shown in snapshot views</li>
      <li><strong>AI Summaries:</strong> Include metadata about which accounts contributed to the summary</li>
    </ul>
    <p>
      All account lists show handles and display names (when available) so users can verify the sources of sentiment data.
    </p>
  </div>

  <div id="windows" class="card">
    <h2>Match Windows & Live Bins</h2>
    <ul>
      <li>Pre-match: 2 hours before kickoff to kickoff.</li>
      <li>Live: Fixed 15-minute bins (e.g., 0–15, 15–30, with halftime collapse).</li>
      <li>Post-match: From approx full-time (90'+ injury) to 1 hour after the match.</li>
    </ul>
    <p>Comparisons and summaries are computed within each window to reflect temporal context.</p>
  </div>

  <div id="budget" class="card">
    <h2>Budget Governance</h2>
    <p>
      We limit per-platform costs to $50/month. Platforms with zero-cost public read APIs (e.g., Bluesky AppView) are treated as cost-safe.
      For platforms requiring paid access, we restrict selection and request rates to stay within budget caps.
    </p>
    <p class="muted">
      Note: Capacity planning details and pricing assumptions are only visible to admins in a protected planning view.
    </p>
  </div>

  <div id="datasources" class="card">
    <h2>Data Sources</h2>
    <ul>
      <li>Bluesky: Public AppView endpoints for reading profiles and posts.</li>
      <li>Twitter (X): Only enabled if an official, compliant, budget-fitting plan is configured.</li>
      <li>Threads: Only enabled if an official API and budget-compliant access are configured.</li>
    </ul>
  </div>

  <div id="privacy" class="card">
    <h2>Privacy & Safety</h2>
    <ul>
      <li>We summarize aggregate sentiment; we do not profile individuals.</li>
      <li>We avoid quoting or storing sensitive personal data. Public posts may be sampled for context in UI, consistent with platform policies.</li>
      <li>Admin moderation tools are available to exclude accounts when necessary.</li>
    </ul>
  </div>

  <div id="status" class="card">
    <h2>Platform Status</h2>
    <ul>
      <li><strong>Bluesky</strong>: Live.</li>
      <li><strong>Twitter (X)</strong>: Disabled by default. Will be enabled only with compliant ≤$50/mo access.</li>
      <li><strong>Threads</strong>: Disabled by default. Will be enabled only with compliant ≤$50/mo access.</li>
    </ul>
  </div>
</div>
