create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key,
  role text not null check (role in ('owner','worker','moderator','admin')),
  display_name text,
  email text,
  phone text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profiles_role on profiles(role);
create index if not exists idx_profiles_email on profiles(email);

create table if not exists owner_settings (
  owner_profile_id uuid primary key references profiles(id) on delete cascade,
  allow_friend_requests boolean not null default true,
  allow_direct_messages boolean not null default true,
  timezone text default 'America/Chicago',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references profiles(id) on delete cascade,
  slug text unique not null,
  name text not null,
  street_address text,
  city text,
  state text,
  zip text,
  country text default 'USA',
  during_hours_contact_name text,
  during_hours_contact_phone text,
  active_email text,
  description text,
  active boolean not null default true,
  searchable boolean not null default false,
  venue_status text not null default 'pending_payment' check (venue_status in ('draft','pending_payment','pending_review','live','paused','inactive','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_venues_owner on venues(owner_profile_id);
create index if not exists idx_venues_status on venues(venue_status);
create index if not exists idx_venues_city_state on venues(city, state);

create table if not exists venue_settings (
  venue_id uuid primary key references venues(id) on delete cascade,
  patron_pulse_enabled boolean not null default true,
  public_visibility boolean not null default false,
  allow_outgoing_messages boolean not null default false,
  allow_private_event_requests boolean not null default false,
  venue_can_message_as_self boolean not null default true,
  venue_can_message_as_owner boolean not null default true,
  require_schedule_approval boolean not null default true,
  local_controls_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists venue_metrics (
  venue_id uuid primary key references venues(id) on delete cascade,
  total_events integer not null default 0,
  total_private_events integer not null default 0,
  total_public_events integer not null default 0,
  total_messages_sent integer not null default 0,
  total_messages_received integer not null default 0,
  total_votes_received integer not null default 0,
  total_votes_cast integer not null default 0,
  total_workers integer not null default 0,
  venue_health_score numeric(5,2) not null default 100.00,
  last_live_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists venue_workers (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  access_level text not null check (access_level in ('low','medium','high')),
  active boolean not null default true,
  assigned_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, profile_id)
);

create table if not exists profile_friends (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references profiles(id) on delete cascade,
  addressee_profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_profile_id, addressee_profile_id)
);

create table if not exists friendly_venues (
  id uuid primary key default gen_random_uuid(),
  requester_venue_id uuid not null references venues(id) on delete cascade,
  addressee_venue_id uuid not null references venues(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_venue_id, addressee_venue_id)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null check (conversation_type in ('direct_user','direct_venue','group','support','pipeline')),
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_by_venue_id uuid references venues(id) on delete set null,
  subject text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  participant_profile_id uuid references profiles(id) on delete cascade,
  participant_venue_id uuid references venues(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (conversation_id, participant_profile_id, participant_venue_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_profile_id uuid references profiles(id) on delete set null,
  sender_venue_id uuid references venues(id) on delete set null,
  sent_as text not null default 'profile' check (sent_as in ('profile','venue')),
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists event_pipelines (
  id uuid primary key default gen_random_uuid(),
  created_by_profile_id uuid references profiles(id) on delete set null,
  initiating_venue_id uuid not null references venues(id) on delete cascade,
  target_venue_id uuid not null references venues(id) on delete cascade,
  title text not null,
  description text,
  event_visibility text not null default 'private' check (event_visibility in ('private','public')),
  status text not null default 'pending' check (status in ('pending','negotiating','approved','declined','cancelled','completed')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists event_pipeline_schedule_options (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references event_pipelines(id) on delete cascade,
  proposed_by_profile_id uuid references profiles(id) on delete set null,
  proposed_start timestamptz not null,
  proposed_end timestamptz not null,
  status text not null default 'proposed' check (status in ('proposed','accepted','declined','expired')),
  created_at timestamptz not null default now()
);

create table if not exists venue_billing (
  venue_id uuid primary key references venues(id) on delete cascade,
  billing_status text not null default 'pending_payment' check (billing_status in ('pending_payment','paid','coupon_applied','admin_override','failed','refunded')),
  current_plan text default 'starter',
  amount_due numeric(10,2) not null default 0.00,
  amount_paid numeric(10,2) not null default 0.00,
  billing_cycle text default 'monthly',
  next_due_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists venue_payments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  payment_method text default 'simulated',
  payment_status text not null check (payment_status in ('pending','succeeded','failed','refunded')),
  amount numeric(10,2) not null default 0.00,
  currency text not null default 'USD',
  transaction_reference text,
  created_at timestamptz not null default now()
);

create table if not exists coupon_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  description text,
  discount_type text not null check (discount_type in ('percent','fixed','activation')),
  discount_value numeric(10,2) not null default 0.00,
  active boolean not null default true,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists venue_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  coupon_id uuid not null references coupon_codes(id) on delete cascade,
  redeemed_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (venue_id, coupon_id)
);

create table if not exists venue_admin_overrides (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  moderator_profile_id uuid not null references profiles(id) on delete cascade,
  override_type text not null check (override_type in ('billing','activation','visibility','restriction')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists venue_devices (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  device_type text not null check (device_type in ('camera','audio_input','audio_interface','screen','computer')),
  label text,
  device_identifier text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists venue_device_preferences (
  venue_id uuid primary key references venues(id) on delete cascade,
  preferred_camera_id uuid references venue_devices(id) on delete set null,
  preferred_audio_input_id uuid references venue_devices(id) on delete set null,
  preferred_audio_interface_id uuid references venue_devices(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists venue_local_control_state (
  venue_id uuid primary key references venues(id) on delete cascade,
  room_slug text,
  camera_enabled boolean not null default true,
  microphone_enabled boolean not null default true,
  local_controls_locked boolean not null default false,
  current_show_mode text default 'idle',
  updated_at timestamptz not null default now()
);

create table if not exists moderator_roles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  moderator_level text not null check (moderator_level in ('support','operations','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,
  created_by_profile_id uuid references profiles(id) on delete set null,
  incident_type text not null check (incident_type in ('support','device','billing','conduct','content','technical','other')),
  status text not null default 'open' check (status in ('open','investigating','resolved','closed')),
  severity text not null default 'low' check (severity in ('low','medium','high','critical')),
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists moderator_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  venue_id uuid references venues(id) on delete cascade,
  moderator_profile_id uuid not null references profiles(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  notes text,
  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists room_venues (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade,
  role text not null default 'participant' check (role in ('participant','judge','observer')),
  sort_order int not null default 1,
  unique (room_id, venue_id)
);

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  starts_at timestamptz,
  segment_title text not null,
  segment_type text not null,
  description text,
  sort_order int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists show_state (
  room_id uuid primary key references rooms(id) on delete cascade,
  current_segment text,
  current_round text,
  judge_venue_id uuid references venues(id) on delete set null,
  battle_left_venue_id uuid references venues(id) on delete set null,
  battle_right_venue_id uuid references venues(id) on delete set null,
  winner_venue_id uuid references venues(id) on delete set null,
  portal_open boolean not null default false,
  timer_running boolean not null default false,
  remaining_seconds int not null default 60,
  event_type text,
  updated_at timestamptz not null default now()
);

create table if not exists patron_polls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  type text not null check (type in ('next_city','next_game','winner')),
  question text not null,
  status text not null default 'open' check (status in ('draft','open','closed','approved','cancelled')),
  closes_at timestamptz,
  approved_option_id uuid,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists patron_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references patron_polls(id) on delete cascade,
  option_key text not null,
  label text not null,
  sort_order int not null default 1
);

create table if not exists patron_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references patron_polls(id) on delete cascade,
  option_id uuid not null references patron_poll_options(id) on delete cascade,
  voter_session_id text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_session_id)
);

create or replace function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at before update on profiles for each row execute function set_updated_at();
drop trigger if exists trg_owner_settings_updated_at on owner_settings;
create trigger trg_owner_settings_updated_at before update on owner_settings for each row execute function set_updated_at();
drop trigger if exists trg_venues_updated_at on venues;
create trigger trg_venues_updated_at before update on venues for each row execute function set_updated_at();
drop trigger if exists trg_venue_settings_updated_at on venue_settings;
create trigger trg_venue_settings_updated_at before update on venue_settings for each row execute function set_updated_at();
drop trigger if exists trg_venue_metrics_updated_at on venue_metrics;
create trigger trg_venue_metrics_updated_at before update on venue_metrics for each row execute function set_updated_at();
drop trigger if exists trg_venue_workers_updated_at on venue_workers;
create trigger trg_venue_workers_updated_at before update on venue_workers for each row execute function set_updated_at();
drop trigger if exists trg_conversations_updated_at on conversations;
create trigger trg_conversations_updated_at before update on conversations for each row execute function set_updated_at();
drop trigger if exists trg_event_pipelines_updated_at on event_pipelines;
create trigger trg_event_pipelines_updated_at before update on event_pipelines for each row execute function set_updated_at();
drop trigger if exists trg_venue_billing_updated_at on venue_billing;
create trigger trg_venue_billing_updated_at before update on venue_billing for each row execute function set_updated_at();
drop trigger if exists trg_venue_device_preferences_updated_at on venue_device_preferences;
create trigger trg_venue_device_preferences_updated_at before update on venue_device_preferences for each row execute function set_updated_at();
drop trigger if exists trg_venue_local_control_state_updated_at on venue_local_control_state;
create trigger trg_venue_local_control_state_updated_at before update on venue_local_control_state for each row execute function set_updated_at();
drop trigger if exists trg_incidents_updated_at on incidents;
create trigger trg_incidents_updated_at before update on incidents for each row execute function set_updated_at();
drop trigger if exists trg_show_state_updated_at on show_state;
create trigger trg_show_state_updated_at before update on show_state for each row execute function set_updated_at();

alter table profiles enable row level security;
alter table owner_settings enable row level security;
alter table venues enable row level security;
alter table venue_settings enable row level security;
alter table venue_metrics enable row level security;
alter table venue_workers enable row level security;
alter table profile_friends enable row level security;
alter table friendly_venues enable row level security;
alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;
alter table event_pipelines enable row level security;
alter table event_pipeline_schedule_options enable row level security;
alter table venue_billing enable row level security;
alter table venue_payments enable row level security;
alter table coupon_codes enable row level security;
alter table venue_coupon_redemptions enable row level security;
alter table venue_admin_overrides enable row level security;
alter table venue_devices enable row level security;
alter table venue_device_preferences enable row level security;
alter table venue_local_control_state enable row level security;
alter table moderator_roles enable row level security;
alter table incidents enable row level security;
alter table moderator_notes enable row level security;
alter table rooms enable row level security;
alter table room_venues enable row level security;
alter table schedules enable row level security;
alter table show_state enable row level security;
alter table patron_polls enable row level security;
alter table patron_poll_options enable row level security;
alter table patron_votes enable row level security;

-- Policies

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated using (true);
drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists owner_settings_read_self on owner_settings;
create policy owner_settings_read_self on owner_settings for select to authenticated using (owner_profile_id = auth.uid());
drop policy if exists owner_settings_insert_self on owner_settings;
create policy owner_settings_insert_self on owner_settings for insert to authenticated with check (owner_profile_id = auth.uid());
drop policy if exists owner_settings_update_self on owner_settings;
create policy owner_settings_update_self on owner_settings for update to authenticated using (owner_profile_id = auth.uid()) with check (owner_profile_id = auth.uid());

drop policy if exists venues_read on venues;
create policy venues_read on venues for select to authenticated using (true);
drop policy if exists venues_insert_owner on venues;
create policy venues_insert_owner on venues for insert to authenticated with check (owner_profile_id = auth.uid());
drop policy if exists venues_update_owner_or_mod on venues;
create policy venues_update_owner_or_mod on venues for update to authenticated using (owner_profile_id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin'))) with check (owner_profile_id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));

drop policy if exists venue_settings_read on venue_settings;
create policy venue_settings_read on venue_settings for select to authenticated using (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_settings.venue_id and profile_id = auth.uid() and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_settings_insert_owner on venue_settings;
create policy venue_settings_insert_owner on venue_settings for insert to authenticated with check (venue_id in (select id from venues where owner_profile_id = auth.uid()));
drop policy if exists venue_settings_update_owner_or_high_or_mod on venue_settings;
create policy venue_settings_update_owner_or_high_or_mod on venue_settings for update to authenticated using (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_settings.venue_id and profile_id = auth.uid() and access_level = 'high' and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin'))) with check (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_settings.venue_id and profile_id = auth.uid() and access_level = 'high' and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));

drop policy if exists venue_metrics_read on venue_metrics;
create policy venue_metrics_read on venue_metrics for select to authenticated using (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_metrics.venue_id and profile_id = auth.uid() and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));

drop policy if exists venue_workers_read on venue_workers;
create policy venue_workers_read on venue_workers for select to authenticated using (profile_id = auth.uid() or exists (select 1 from venues where id = venue_workers.venue_id and owner_profile_id = auth.uid()) or exists (select 1 from venue_workers vw2 where vw2.venue_id = venue_workers.venue_id and vw2.profile_id = auth.uid() and vw2.access_level = 'high' and vw2.active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_workers_insert_owner_or_high on venue_workers;
create policy venue_workers_insert_owner_or_high on venue_workers for insert to authenticated with check (exists (select 1 from venues where id = venue_workers.venue_id and owner_profile_id = auth.uid()) or exists (select 1 from venue_workers vw2 where vw2.venue_id = venue_workers.venue_id and vw2.profile_id = auth.uid() and vw2.access_level = 'high' and vw2.active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_workers_update_owner_or_high on venue_workers;
create policy venue_workers_update_owner_or_high on venue_workers for update to authenticated using (exists (select 1 from venues where id = venue_workers.venue_id and owner_profile_id = auth.uid()) or exists (select 1 from venue_workers vw2 where vw2.venue_id = venue_workers.venue_id and vw2.profile_id = auth.uid() and vw2.access_level = 'high' and vw2.active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin'))) with check (exists (select 1 from venues where id = venue_workers.venue_id and owner_profile_id = auth.uid()) or exists (select 1 from venue_workers vw2 where vw2.venue_id = venue_workers.venue_id and vw2.profile_id = auth.uid() and vw2.access_level = 'high' and vw2.active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));

drop policy if exists conversations_read on conversations;
create policy conversations_read on conversations for select to authenticated using (exists (select 1 from conversation_participants cp where cp.conversation_id = conversations.id and (cp.participant_profile_id = auth.uid() or cp.participant_venue_id in (select id from venues where owner_profile_id = auth.uid()))));
drop policy if exists conversation_participants_read on conversation_participants;
create policy conversation_participants_read on conversation_participants for select to authenticated using (true);
drop policy if exists messages_read on messages;
create policy messages_read on messages for select to authenticated using (exists (select 1 from conversation_participants cp where cp.conversation_id = messages.conversation_id and (cp.participant_profile_id = auth.uid() or cp.participant_venue_id in (select id from venues where owner_profile_id = auth.uid()))));
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert to authenticated with check (true);

drop policy if exists profile_friends_read on profile_friends;
create policy profile_friends_read on profile_friends for select to authenticated using (requester_profile_id = auth.uid() or addressee_profile_id = auth.uid());
drop policy if exists profile_friends_insert on profile_friends;
create policy profile_friends_insert on profile_friends for insert to authenticated with check (requester_profile_id = auth.uid());
drop policy if exists friendly_venues_read on friendly_venues;
create policy friendly_venues_read on friendly_venues for select to authenticated using (requester_venue_id in (select id from venues where owner_profile_id = auth.uid()) or addressee_venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists friendly_venues_insert on friendly_venues;
create policy friendly_venues_insert on friendly_venues for insert to authenticated with check (requester_venue_id in (select id from venues where owner_profile_id = auth.uid()));

drop policy if exists event_pipelines_read on event_pipelines;
create policy event_pipelines_read on event_pipelines for select to authenticated using (initiating_venue_id in (select id from venues where owner_profile_id = auth.uid()) or target_venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists event_pipelines_insert on event_pipelines;
create policy event_pipelines_insert on event_pipelines for insert to authenticated with check (initiating_venue_id in (select id from venues where owner_profile_id = auth.uid()));

drop policy if exists venue_billing_read on venue_billing;
create policy venue_billing_read on venue_billing for select to authenticated using (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_payments_read on venue_payments;
create policy venue_payments_read on venue_payments for select to authenticated using (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_payments_insert on venue_payments;
create policy venue_payments_insert on venue_payments for insert to authenticated with check (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists coupon_codes_read on coupon_codes;
create policy coupon_codes_read on coupon_codes for select to authenticated using (true);
drop policy if exists venue_coupon_redemptions_insert on venue_coupon_redemptions;
create policy venue_coupon_redemptions_insert on venue_coupon_redemptions for insert to authenticated with check (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_admin_overrides_read on venue_admin_overrides;
create policy venue_admin_overrides_read on venue_admin_overrides for select to authenticated using (exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_admin_overrides_insert on venue_admin_overrides;
create policy venue_admin_overrides_insert on venue_admin_overrides for insert to authenticated with check (exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));

drop policy if exists venue_devices_read on venue_devices;
create policy venue_devices_read on venue_devices for select to authenticated using (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_devices.venue_id and profile_id = auth.uid() and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_devices_insert on venue_devices;
create policy venue_devices_insert on venue_devices for insert to authenticated with check (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_devices.venue_id and profile_id = auth.uid() and access_level = 'high' and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_device_preferences_read on venue_device_preferences;
create policy venue_device_preferences_read on venue_device_preferences for select to authenticated using (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_device_preferences.venue_id and profile_id = auth.uid() and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_device_preferences_insert on venue_device_preferences;
create policy venue_device_preferences_insert on venue_device_preferences for insert to authenticated with check (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_device_preferences.venue_id and profile_id = auth.uid() and access_level = 'high' and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_device_preferences_update on venue_device_preferences;
create policy venue_device_preferences_update on venue_device_preferences for update to authenticated using (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_device_preferences.venue_id and profile_id = auth.uid() and access_level = 'high' and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin'))) with check (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_device_preferences.venue_id and profile_id = auth.uid() and access_level = 'high' and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));

drop policy if exists venue_local_control_state_read on venue_local_control_state;
create policy venue_local_control_state_read on venue_local_control_state for select to authenticated using (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_local_control_state.venue_id and profile_id = auth.uid() and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_local_control_state_insert on venue_local_control_state;
create policy venue_local_control_state_insert on venue_local_control_state for insert to authenticated with check (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_local_control_state.venue_id and profile_id = auth.uid() and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists venue_local_control_state_update on venue_local_control_state;
create policy venue_local_control_state_update on venue_local_control_state for update to authenticated using (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_local_control_state.venue_id and profile_id = auth.uid() and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin'))) with check (venue_id in (select id from venues where owner_profile_id = auth.uid()) or exists (select 1 from venue_workers where venue_id = venue_local_control_state.venue_id and profile_id = auth.uid() and active = true) or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));

drop policy if exists incidents_read on incidents;
create policy incidents_read on incidents for select to authenticated using (venue_id in (select id from venues where owner_profile_id = auth.uid()) or profile_id = auth.uid() or created_by_profile_id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists incidents_insert on incidents;
create policy incidents_insert on incidents for insert to authenticated with check (true);
drop policy if exists moderator_notes_read on moderator_notes;
create policy moderator_notes_read on moderator_notes for select to authenticated using (exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists moderator_notes_insert on moderator_notes;
create policy moderator_notes_insert on moderator_notes for insert to authenticated with check (exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));
drop policy if exists moderator_roles_read on moderator_roles;
create policy moderator_roles_read on moderator_roles for select to authenticated using (profile_id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

drop policy if exists rooms_read on rooms;
create policy rooms_read on rooms for select to authenticated using (true);
drop policy if exists room_venues_read on room_venues;
create policy room_venues_read on room_venues for select to authenticated using (true);
drop policy if exists schedules_read on schedules;
create policy schedules_read on schedules for select to authenticated using (true);
drop policy if exists show_state_read on show_state;
create policy show_state_read on show_state for select to authenticated using (true);

drop policy if exists patron_polls_read on patron_polls;
create policy patron_polls_read on patron_polls for select using (true);
drop policy if exists patron_poll_options_read on patron_poll_options;
create policy patron_poll_options_read on patron_poll_options for select using (true);
drop policy if exists patron_votes_insert on patron_votes;
create policy patron_votes_insert on patron_votes for insert with check (true);
