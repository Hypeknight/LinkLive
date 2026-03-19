-- Safe migration script for existing tables.
-- Adds missing columns without removing data.

create extension if not exists pgcrypto;

alter table public.rooms
  add column if not exists venue_id text default 'demo-venue-1',
  add column if not exists zone text,
  add column if not exists capacity integer default 0,
  add column if not exists status text not null default 'scheduled',
  add column if not exists assigned_camera_id uuid,
  add column if not exists assigned_mic_id uuid,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now();

alter table public.devices
  add column if not exists venue_id text default 'demo-venue-1',
  add column if not exists label text,
  add column if not exists device_kind text,
  add column if not exists browser_device_id text,
  add column if not exists status text default 'active',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now();

alter table public.schedules
  add column if not exists venue_id text default 'demo-venue-1',
  add column if not exists room_id uuid,
  add column if not exists title text,
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists lead_name text,
  add column if not exists status text default 'scheduled',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now();

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

create index if not exists idx_rooms_venue_id on public.rooms(venue_id);
create index if not exists idx_devices_venue_id on public.devices(venue_id);
create index if not exists idx_schedules_venue_id on public.schedules(venue_id);
create index if not exists idx_patron_pulse_venue_id on public.patron_pulse(venue_id);
create index if not exists idx_ops_notes_venue_id on public.ops_notes(venue_id);
