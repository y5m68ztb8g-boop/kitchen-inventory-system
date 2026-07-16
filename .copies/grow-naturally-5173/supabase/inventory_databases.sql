create table if not exists public.inventory_databases (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.inventory_databases enable row level security;

-- The trial app writes through the local Vite dev server with a secret/service key.
-- No public anon policy is required for this first test.
