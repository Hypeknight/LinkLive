-- Starter RLS for live moderation stack.
-- Adjust for your auth model before full production rollout.

alter table public.rooms enable row level security;
alter table public.devices enable row level security;
alter table public.schedules enable row level security;
alter table public.patron_pulse enable row level security;
alter table public.ops_notes enable row level security;

-- Read access for authenticated users.
drop policy if exists rooms_read_authenticated on public.rooms;
create policy rooms_read_authenticated on public.rooms
for select to authenticated using (true);

drop policy if exists devices_read_authenticated on public.devices;
create policy devices_read_authenticated on public.devices
for select to authenticated using (true);

drop policy if exists schedules_read_authenticated on public.schedules;
create policy schedules_read_authenticated on public.schedules
for select to authenticated using (true);

drop policy if exists patron_pulse_read_authenticated on public.patron_pulse;
create policy patron_pulse_read_authenticated on public.patron_pulse
for select to authenticated using (true);

drop policy if exists ops_notes_read_authenticated on public.ops_notes;
create policy ops_notes_read_authenticated on public.ops_notes
for select to authenticated using (true);

-- Write access for authenticated users while testing.
drop policy if exists rooms_write_authenticated on public.rooms;
create policy rooms_write_authenticated on public.rooms
for all to authenticated using (true) with check (true);

drop policy if exists devices_write_authenticated on public.devices;
create policy devices_write_authenticated on public.devices
for all to authenticated using (true) with check (true);

drop policy if exists schedules_write_authenticated on public.schedules;
create policy schedules_write_authenticated on public.schedules
for all to authenticated using (true) with check (true);

drop policy if exists patron_pulse_write_authenticated on public.patron_pulse;
create policy patron_pulse_write_authenticated on public.patron_pulse
for all to authenticated using (true) with check (true);

drop policy if exists ops_notes_write_authenticated on public.ops_notes;
create policy ops_notes_write_authenticated on public.ops_notes
for all to authenticated using (true) with check (true);

-- Realtime: add these tables to publication.
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.devices;
alter publication supabase_realtime add table public.schedules;
alter publication supabase_realtime add table public.patron_pulse;
alter publication supabase_realtime add table public.ops_notes;
