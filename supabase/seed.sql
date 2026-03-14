-- Replace UUIDs with real Supabase Auth UUIDs if manually seeding.
-- Example starter rooms:
insert into rooms (slug, title, notes)
values
  ('central-battle-room', 'Central Battle Room', 'Main cross-city room'),
  ('southern-showcase', 'Southern Showcase', 'Regional room'),
  ('late-night-finals', 'Late Night Finals', 'Final room')
on conflict (slug) do nothing;
