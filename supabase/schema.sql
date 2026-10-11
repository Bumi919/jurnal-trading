-- =========================================================
-- Skema database Jurnal Trading (Supabase / Postgres)
-- Cara pakai: buka SQL Editor di dashboard Supabase,
-- paste seluruh isi berkas ini, klik Run.
-- Aman dijalankan ulang (idempoten).
-- =========================================================

-- ---------- Profil (pengaturan + trading plan per user) ----------

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  currency text not null default '$',
  initial_capital numeric not null default 10000,
  max_risk_pct_trade numeric not null default 1,
  max_daily_loss_pct numeric not null default 3,
  max_loss_streak numeric not null default 3,
  plan_goal text not null default '',
  plan_allowed_symbols text not null default '',
  plan_allowed_hours text not null default '',
  plan_rules text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------- Setup / playbook ----------

create table if not exists public.setups (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  description text not null default '',
  entry_rules text not null default '',
  exit_rules text not null default '',
  checklist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists setups_user_idx on public.setups (user_id);

-- ---------- Trade ----------

create table if not exists public.trades (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null default '',
  market text not null default 'Forex',
  side text not null default 'long',
  status text not null default 'closed',
  result text not null default 'be',
  entry_date text not null default '',
  exit_date text not null default '',
  entry_price numeric not null default 0,
  exit_price numeric not null default 0,
  sl numeric not null default 0,
  tp numeric not null default 0,
  lot numeric not null default 0,
  pips numeric not null default 0,
  risk numeric not null default 0,
  pnl numeric not null default 0,
  r_multiple numeric not null default 0,
  setup_id text not null default '',
  tags text[] not null default '{}',
  quality integer not null default 0,
  mood text not null default '',
  disciplined boolean not null default false,
  notes text not null default '',
  screenshot_url text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists trades_user_idx on public.trades (user_id);
create index if not exists trades_user_entry_idx on public.trades (user_id, entry_date);

-- ---------- Checklist sesi ----------

create table if not exists public.checklist_items (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'pre',
  item_text text not null default '',
  done boolean not null default false,
  position integer not null default 0
);

create index if not exists checklist_user_idx on public.checklist_items (user_id);

-- =========================================================
-- Row Level Security: tiap user hanya bisa akses baris miliknya
-- =========================================================

alter table public.profiles enable row level security;
alter table public.setups enable row level security;
alter table public.trades enable row level security;
alter table public.checklist_items enable row level security;

drop policy if exists "own_profile" on public.profiles;
create policy "own_profile" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_setups" on public.setups;
create policy "own_setups" on public.setups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_trades" on public.trades;
create policy "own_trades" on public.trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_checklist" on public.checklist_items;
create policy "own_checklist" on public.checklist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================
-- Storage: bucket publik "screenshots" untuk lampiran chart.
-- Nama berkas: {user_id}/{trade_id}.jpg (tidak bisa ditebak).
-- =========================================================

insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', true)
on conflict (id) do update set public = true;

drop policy if exists "public_read_shots" on storage.objects;
create policy "public_read_shots" on storage.objects
  for select using (bucket_id = 'screenshots');

drop policy if exists "own_upload_shots" on storage.objects;
create policy "own_upload_shots" on storage.objects
  for insert with check (
    bucket_id = 'screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "own_update_shots" on storage.objects;
create policy "own_update_shots" on storage.objects
  for update using (
    bucket_id = 'screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "own_delete_shots" on storage.objects;
create policy "own_delete_shots" on storage.objects
  for delete using (
    bucket_id = 'screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
