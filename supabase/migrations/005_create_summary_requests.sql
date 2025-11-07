-- Audit log for summaries API requests to track cost, limits, and failures
create table if not exists public.summary_requests (
  id uuid primary key default gen_random_uuid(),
  match_id text not null,
  platform text not null check (platform in ('bsky', 'twitter', 'threads', 'combined')),
  phase text not null check (phase in ('pre', 'live', 'post')),
  window_minutes int not null,
  posts_count int not null,
  chars_count int not null,
  model text,
  prompt_tokens int,
  completion_tokens int,
  total_tokens int,
  status text not null check (status in ('ok', 'rate_limited', 'missing_key', 'timeout', 'failed')),
  error_message text,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists idx_summary_requests_match_phase
  on public.summary_requests(match_id, platform, phase, created_at desc);

-- RLS policy: read-only to anon/auth, writes via service role (admin API/server)
alter table public.summary_requests enable row level security;

do $$
begin
  -- Allow anon/auth read
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'summary_requests' and policyname = 'summary_requests_select_anon'
  ) then
    create policy summary_requests_select_anon on public.summary_requests
      for select
      to anon, authenticated
      using (true);
  end if;
end$$;
