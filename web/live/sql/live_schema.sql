create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null default 'demo-venue-1',
  name text not null,
  zone text,
  capacity integer not null default 0,
  status text not null default 'active' check (status in ('active','inactive','maintenance')),
  assigned_camera_id uuid,
  assigned_mic_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null default 'demo-venue-1',
  room_id uuid references public.rooms(id) on delete set null,
  name text not null,
  type text not null check (type in ('camera','microphone','speaker','display')),
  status text not null default 'online' check (status in ('online','offline','maintenance')),
  input_id text,
  is_default boolean not null default false,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.rooms
  add constraint rooms_assigned_camera_fk foreign key (assigned_camera_id) references public.devices(id) on delete set null;

alter table public.rooms
  add constraint rooms_assigned_mic_fk foreign key (assigned_mic_id) references public.devices(id) on delete set null;

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null default 'demo-venue-1',
  room_id uuid references public.rooms(id) on delete set null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','completed','cancelled')),
  lead_name text,
  notes text,
  created_at timestamptz not null default now()
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
  created_at timestamptz not null default now()
);

create index if not exists idx_rooms_venue_id on public.rooms(venue_id);
create index if not exists idx_devices_venue_id on public.devices(venue_id);
create index if not exists idx_schedules_venue_id on public.schedules(venue_id);
create index if not exists idx_patron_pulse_venue_id on public.patron_pulse(venue_id);
create index if not exists idx_ops_notes_venue_id on public.ops_notes(venue_id);
