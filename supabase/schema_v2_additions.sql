-- V2 additions for owner/venue/admin workflow

create table if not exists owner_settings (
  profile_id uuid primary key references profiles(id) on delete cascade,
  messaging_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table venues
  add column if not exists street_address text,
  add column if not exists state text,
  add column if not exists zip text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists billing_status text not null default 'pending_payment',
  add column if not exists visibility_status text not null default 'draft';

create table if not exists venue_settings (
  venue_id uuid primary key references venues(id) on delete cascade,
  allow_public_messaging boolean not null default true,
  allow_private_events boolean not null default true,
  patron_pulse_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists venue_metrics (
  venue_id uuid primary key references venues(id) on delete cascade,
  total_events int not null default 0,
  total_votes int not null default 0,
  total_messages int not null default 0,
  last_live_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists worker_permissions (
  profile_id uuid not null references profiles(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade,
  permission_level text not null check (permission_level in ('low','medium','high')),
  can_message_as_venue boolean not null default false,
  can_manage_workers boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (profile_id, venue_id)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('user_user','user_venue','venue_venue','support')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_profile_id uuid references profiles(id) on delete set null,
  sender_venue_id uuid references venues(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists friendly_venues (
  id uuid primary key default gen_random_uuid(),
  venue_a_id uuid not null references venues(id) on delete cascade,
  venue_b_id uuid not null references venues(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  unique (venue_a_id, venue_b_id)
);

create table if not exists event_pipelines (
  id uuid primary key default gen_random_uuid(),
  from_venue_id uuid not null references venues(id) on delete cascade,
  to_venue_id uuid not null references venues(id) on delete cascade,
  proposed_title text,
  proposed_date date,
  proposed_time time,
  status text not null default 'proposed' check (status in ('proposed','accepted','declined','scheduled','cancelled')),
  created_at timestamptz not null default now()
);
