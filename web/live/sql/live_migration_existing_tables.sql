create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'venue' check (role in ('admin','moderator','ops','venue')),
  venue_id text not null default 'demo-venue-1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms
  add column if not exists venue_id text default 'demo-venue-1',
  add column if not exists zone text,
  add column if not exists capacity integer default 0,
  add column if not exists status text not null default 'scheduled',
  add column if not exists assigned_camera_id uuid,
  add column if not exists assigned_mic_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.devices
  add column if not exists venue_id text default 'demo-venue-1',
  add column if not exists label text default 'Unnamed Device',
  add column if not exists device_kind text default 'camera',
  add column if not exists browser_device_id text,
  add column if not exists status text default 'active',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.schedules
  add column if not exists venue_id text default 'demo-venue-1',
  add column if not exists room_id uuid,
  add column if not exists title text,
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists lead_name text,
  add column if not exists status text default 'scheduled',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.patron_pulse (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null default 'demo-venue-1',
  room_id uuid references public.rooms(id) on delete set null,
  pulse_score integer not null default 0 check (pulse_score between 0 and 100),
  crowd_count integer not null default 0,
  energy_level integer not null default 1 check (energy_level between 1 and 10),
  source text not null default 'manual',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_notes (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null default 'demo-venue-1',
  room_id uuid references public.rooms(id) on delete set null,
  title text not null,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  assigned_to text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_assigned_camera_fk') then
    alter table public.rooms add constraint rooms_assigned_camera_fk foreign key (assigned_camera_id) references public.devices(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rooms_assigned_mic_fk') then
    alter table public.rooms add constraint rooms_assigned_mic_fk foreign key (assigned_mic_id) references public.devices(id) on delete set null;
  end if;
end $$;

create unique index if not exists uq_devices_venue_browser_device_id on public.devices(venue_id, browser_device_id);
create index if not exists idx_profiles_venue_id on public.profiles(venue_id);
create index if not exists idx_rooms_venue_id on public.rooms(venue_id);
create index if not exists idx_devices_venue_id on public.devices(venue_id);
create index if not exists idx_schedules_venue_id on public.schedules(venue_id);
create index if not exists idx_patron_pulse_venue_id on public.patron_pulse(venue_id);
create index if not exists idx_ops_notes_venue_id on public.ops_notes(venue_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_profiles_touch_updated_at on public.profiles;
create trigger trg_profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists trg_rooms_touch_updated_at on public.rooms;
create trigger trg_rooms_touch_updated_at before update on public.rooms for each row execute function public.touch_updated_at();
drop trigger if exists trg_devices_touch_updated_at on public.devices;
create trigger trg_devices_touch_updated_at before update on public.devices for each row execute function public.touch_updated_at();
drop trigger if exists trg_schedules_touch_updated_at on public.schedules;
create trigger trg_schedules_touch_updated_at before update on public.schedules for each row execute function public.touch_updated_at();
drop trigger if exists trg_ops_notes_touch_updated_at on public.ops_notes;
create trigger trg_ops_notes_touch_updated_at before update on public.ops_notes for each row execute function public.touch_updated_at();
