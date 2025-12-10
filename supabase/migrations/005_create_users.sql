-- Create users table for Bluesky-authenticated users
-- Links Bluesky handles/DIDs to app user accounts

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  bsky_handle text not null unique,
  bsky_did text null, -- May be null initially, can be resolved later
  display_name text null,
  avatar_url text null,
  verified_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for lookups by handle
create index if not exists idx_users_bsky_handle on public.users(bsky_handle);
create index if not exists idx_users_bsky_did on public.users(bsky_did) where bsky_did is not null;

-- Enable RLS
alter table public.users enable row level security;

-- Policy: Users can read their own profile
do $$
begin
  if not exists (
    select 1 from pg_policies p
    where p.tablename = 'users' and p.policyname = 'users_select_own'
  ) then
    create policy users_select_own
      on public.users
      for select
      using (true); -- Public read for now; can restrict later with auth.uid()
  end if;
end$$;

-- Policy: Service role can insert/update (for auth flow)
-- Note: Inserts/updates will be done via service role in verify-challenge endpoint

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to auto-update updated_at
drop trigger if exists update_users_updated_at on public.users;
create trigger update_users_updated_at
  before update on public.users
  for each row
  execute function update_updated_at_column();

