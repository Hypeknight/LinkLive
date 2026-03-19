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

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null default 'demo-venue-1',
  name text not null,
  zone text,
  capacity integer not null default 0,
  status text not null default 'scheduled' check (status in ('scheduled','live','completed','cancelled')),
  assigned_camera_id uuid,
  assigned_mic_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null default 'demo-venue-1',
  label text not null,
  device_kind text not null check (device_kind in ('camera','microphone')),
  browser_device_id text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, browser_device_id)
);

alter table public.rooms drop constraint if exists rooms_assigned_camera_fk;
alter table public.rooms drop constraint if exists rooms_assigned_mic_fk;
alter table public.rooms add constraint rooms_assigned_camera_fk foreign key (assigned_camera_id) references public.devices(id) on delete set null;
alter table public.rooms add constraint rooms_assigned_mic_fk foreign key (assigned_mic_id) references public.devices(id) on delete set null;

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null default 'demo-venue-1',
  room_id uuid references public.rooms(id) on delete set null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  lead_name text,
  status text not null default 'scheduled' check (status in ('scheduled','live','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
