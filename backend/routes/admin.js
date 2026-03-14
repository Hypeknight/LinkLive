import express from 'express';
import { supabaseAdmin } from '../lib/supabase.js';

const router = express.Router();

router.get('/metrics', async (_req, res) => {
  try {
    const [profiles, venues, workers, rooms, polls] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('venues').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('venue_workers').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('rooms').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('patron_polls').select('*', { count: 'exact', head: true })
    ]);

    res.json({
      profiles: profiles.count || 0,
      venues: venues.count || 0,
      workers: workers.count || 0,
      rooms: rooms.count || 0,
      polls: polls.count || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load metrics.' });
  }
});

router.post('/venue/:id/activate', async (req, res) => {
  try {
    const venueId = req.params.id;
    const { mode = 'admin_override' } = req.body;

    const { error: billingError } = await supabaseAdmin
      .from('venue_billing')
      .upsert({
        venue_id: venueId,
        billing_status: mode,
        amount_due: 0,
        amount_paid: 0
      }, { onConflict: 'venue_id' });

    if (billingError) throw billingError;

    const { error: venueError } = await supabaseAdmin
      .from('venues')
      .update({
        venue_status: 'live',
        searchable: true,
        active: true
      })
      .eq('id', venueId);

    if (venueError) throw venueError;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not activate venue.' });
  }
});

router.post('/venue/:id/pause', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('venues')
      .update({ venue_status: 'paused', searchable: false })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not pause venue.' });
  }
});

export default router;
