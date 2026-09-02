-- ============================================================
-- Kids Daily Task Tracker - migration 001: accounts + sync
--
-- Run this once in the Supabase dashboard:
--   SQL Editor -> New query -> paste -> Run
--
-- Design notes
--   * One row per task, owned by auth.uid(). Row Level Security means a
--     signed-in user can only ever see and change their own rows.
--   * `updated_at` is set by the CLIENT, not by a trigger, because sync is
--     last-write-wins: whichever device touched a task most recently wins.
--   * Deletes are SOFT (`deleted_at`). A hard delete would let a stale device
--     re-upload a task it still had locally, resurrecting it forever.
--   * Points live on the profile row rather than being derived from completed
--     tasks, because "Clear done" removes finished tasks but keeps the stars.
-- ============================================================

-- ── Profiles ──────────────────────────────────────────────────
-- One row per user: their star total and their theme choice.

create table if not exists public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  points      integer     not null default 0 check (points >= 0),
  theme       text        not null default 'light' check (theme in ('light', 'dark')),
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Per-user star total and theme. updated_at is client-set for last-write-wins sync.';

-- ── Tasks ─────────────────────────────────────────────────────
-- The id is generated on the device (so tasks work offline before they are
-- ever uploaded), which is why the primary key is (user_id, id): two users
-- could in principle generate the same id, and neither should block the other.

create table if not exists public.tasks (
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id            text        not null check (char_length(id) between 1 and 64),
  text          text        not null check (char_length(text) between 1 and 80),
  priority      text        not null check (priority in ('low', 'medium', 'high')),
  completed     boolean     not null default false,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  deleted_at    timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.tasks is
  'One row per task. deleted_at is a soft delete so deletes survive sync with stale devices.';

-- Sync pulls "everything for this user changed since X", so index that.
create index if not exists tasks_user_updated_idx
  on public.tasks (user_id, updated_at desc);

-- ── Row Level Security ────────────────────────────────────────
-- Without these policies the tables are readable by nobody (RLS denies by
-- default), which is the safe direction to fail in.

alter table public.profiles enable row level security;
alter table public.tasks    enable row level security;

drop policy if exists "profiles are self-service" on public.profiles;
create policy "profiles are self-service"
  on public.profiles
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "tasks are self-service" on public.tasks;
create policy "tasks are self-service"
  on public.tasks
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Signed-out visitors use localStorage only - they never touch these tables.
revoke all on public.profiles from anon;
revoke all on public.tasks    from anon;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.tasks    to authenticated;

-- ── Profile bootstrap ─────────────────────────────────────────
-- Give every new account a profile row immediately, so the first sync has
-- something to merge against. The client also upserts its own row, so this
-- trigger is belt-and-braces rather than load-bearing.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Sanity check ──────────────────────────────────────────────
-- Both should report rowsecurity = true.
select relname, relrowsecurity as rowsecurity
from pg_class
where relname in ('tasks', 'profiles');
