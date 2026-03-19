alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.devices enable row level security;
alter table public.schedules enable row level security;
alter table public.patron_pulse enable row level security;
alter table public.ops_notes enable row level security;

create or replace function public.current_user_role()
returns text language sql stable as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_venue_id()
returns text language sql stable as $$
  select venue_id from public.profiles where id = auth.uid()
$$;

-- profiles

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
for select to authenticated using (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- rooms

drop policy if exists rooms_read_same_venue on public.rooms;
create policy rooms_read_same_venue on public.rooms
for select to authenticated using (venue_id = public.current_user_venue_id());

drop policy if exists rooms_write_moderator on public.rooms;
create policy rooms_write_moderator on public.rooms
for all to authenticated
using (
  venue_id = public.current_user_venue_id()
  and public.current_user_role() in ('admin','moderator','ops')
)
with check (
  venue_id = public.current_user_venue_id()
  and public.current_user_role() in ('admin','moderator','ops')
);

-- devices

drop policy if exists devices_read_same_venue on public.devices;
create policy devices_read_same_venue on public.devices
for select to authenticated using (venue_id = public.current_user_venue_id());

drop policy if exists devices_write_moderator on public.devices;
create policy devices_write_moderator on public.devices
for all to authenticated
using (
  venue_id = public.current_user_venue_id()
  and public.current_user_role() in ('admin','moderator','ops')
)
with check (
  venue_id = public.current_user_venue_id()
  and public.current_user_role() in ('admin','moderator','ops')
);

-- schedules

drop policy if exists schedules_read_same_venue on public.schedules;
create policy schedules_read_same_venue on public.schedules
for select to authenticated using (venue_id = public.current_user_venue_id());

drop policy if exists schedules_write_moderator on public.schedules;
create policy schedules_write_moderator on public.schedules
for all to authenticated
using (
  venue_id = public.current_user_venue_id()
  and public.current_user_role() in ('admin','moderator','ops')
)
with check (
  venue_id = public.current_user_venue_id()
  and public.current_user_role() in ('admin','moderator','ops')
);

-- patron pulse

drop policy if exists patron_pulse_read_same_venue on public.patron_pulse;
create policy patron_pulse_read_same_venue on public.patron_pulse
for select to authenticated using (venue_id = public.current_user_venue_id());

drop policy if exists patron_pulse_write_moderator on public.patron_pulse;
create policy patron_pulse_write_moderator on public.patron_pulse
for all to authenticated
using (
  venue_id = public.current_user_venue_id()
  and public.current_user_role() in ('admin','moderator','ops')
)
with check (
  venue_id = public.current_user_venue_id()
  and public.current_user_role() in ('admin','moderator','ops')
);

-- ops notes

drop policy if exists ops_notes_read_same_venue on public.ops_notes;
create policy ops_notes_read_same_venue on public.ops_notes
for select to authenticated using (venue_id = public.current_user_venue_id());

drop policy if exists ops_notes_write_moderator on public.ops_notes;
create policy ops_notes_write_moderator on public.ops_notes
for all to authenticated
using (
  venue_id = public.current_user_venue_id()
  and public.current_user_role() in ('admin','moderator','ops')
)
with check (
  venue_id = public.current_user_venue_id()
  and public.current_user_role() in ('admin','moderator','ops')
);

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.devices;
alter publication supabase_realtime add table public.schedules;
alter publication supabase_realtime add table public.patron_pulse;
alter publication supabase_realtime add table public.ops_notes;
