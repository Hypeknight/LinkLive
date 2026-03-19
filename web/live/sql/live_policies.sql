alter table public.rooms enable row level security;
alter table public.devices enable row level security;
alter table public.schedules enable row level security;
alter table public.patron_pulse enable row level security;
alter table public.ops_notes enable row level security;

-- Replace with your real auth logic. This starter policy allows authenticated users.
drop policy if exists rooms_select_authenticated on public.rooms;
drop policy if exists rooms_insert_authenticated on public.rooms;
drop policy if exists rooms_update_authenticated on public.rooms;
drop policy if exists rooms_delete_authenticated on public.rooms;
create policy rooms_select_authenticated on public.rooms for select to authenticated using (true);
create policy rooms_insert_authenticated on public.rooms for insert to authenticated with check (true);
create policy rooms_update_authenticated on public.rooms for update to authenticated using (true) with check (true);
create policy rooms_delete_authenticated on public.rooms for delete to authenticated using (true);

drop policy if exists devices_select_authenticated on public.devices;
drop policy if exists devices_insert_authenticated on public.devices;
drop policy if exists devices_update_authenticated on public.devices;
drop policy if exists devices_delete_authenticated on public.devices;
create policy devices_select_authenticated on public.devices for select to authenticated using (true);
create policy devices_insert_authenticated on public.devices for insert to authenticated with check (true);
create policy devices_update_authenticated on public.devices for update to authenticated using (true) with check (true);
create policy devices_delete_authenticated on public.devices for delete to authenticated using (true);

drop policy if exists schedules_select_authenticated on public.schedules;
drop policy if exists schedules_insert_authenticated on public.schedules;
drop policy if exists schedules_update_authenticated on public.schedules;
drop policy if exists schedules_delete_authenticated on public.schedules;
create policy schedules_select_authenticated on public.schedules for select to authenticated using (true);
create policy schedules_insert_authenticated on public.schedules for insert to authenticated with check (true);
create policy schedules_update_authenticated on public.schedules for update to authenticated using (true) with check (true);
create policy schedules_delete_authenticated on public.schedules for delete to authenticated using (true);

drop policy if exists patron_pulse_select_authenticated on public.patron_pulse;
drop policy if exists patron_pulse_insert_authenticated on public.patron_pulse;
drop policy if exists patron_pulse_update_authenticated on public.patron_pulse;
drop policy if exists patron_pulse_delete_authenticated on public.patron_pulse;
create policy patron_pulse_select_authenticated on public.patron_pulse for select to authenticated using (true);
create policy patron_pulse_insert_authenticated on public.patron_pulse for insert to authenticated with check (true);
create policy patron_pulse_update_authenticated on public.patron_pulse for update to authenticated using (true) with check (true);
create policy patron_pulse_delete_authenticated on public.patron_pulse for delete to authenticated using (true);

drop policy if exists ops_notes_select_authenticated on public.ops_notes;
drop policy if exists ops_notes_insert_authenticated on public.ops_notes;
drop policy if exists ops_notes_update_authenticated on public.ops_notes;
drop policy if exists ops_notes_delete_authenticated on public.ops_notes;
create policy ops_notes_select_authenticated on public.ops_notes for select to authenticated using (true);
create policy ops_notes_insert_authenticated on public.ops_notes for insert to authenticated with check (true);
create policy ops_notes_update_authenticated on public.ops_notes for update to authenticated using (true) with check (true);
create policy ops_notes_delete_authenticated on public.ops_notes for delete to authenticated using (true);
