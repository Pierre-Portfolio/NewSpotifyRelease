const router = require('express').Router();
const db     = require('../db');

// POST /api/sync/start
// Body : { user_id, date_from, date_to }
router.post('/start', async (req, res) => {
  const { user_id, date_from, date_to } = req.body;
  if (!user_id || !date_from || !date_to)
    return res.status(400).json({ error: 'user_id, date_from, date_to requis' });

  try {
    const [result] = await db.execute(
      'INSERT INTO sync_sessions (user_id, date_from, date_to) VALUES (?, ?, ?)',
      [user_id, date_from, date_to]
    );
    res.json({ session_id: result.insertId });
  } catch (err) {
    console.error('[sync/start]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/sync/:id
// Body : { artists_total?, artists_scanned?, releases_found?, tracks_added?, last_artist_name?, artist_spotify_id?, status? }
// artist_spotify_id : si présent, met à jour last_scraped_at = NOW() pour cet artiste
router.patch('/:id', async (req, res) => {
  const { artists_total, artists_scanned, releases_found, tracks_added, last_artist_name, artist_spotify_id, status } = req.body;
  const fields = [], values = [];

  if (artists_total    != null) { fields.push('artists_total = ?');    values.push(artists_total); }
  if (artists_scanned  != null) { fields.push('artists_scanned = ?');  values.push(artists_scanned); }
  if (releases_found   != null) { fields.push('releases_found = ?');   values.push(releases_found); }
  if (tracks_added     != null) { fields.push('tracks_added = ?');     values.push(tracks_added); }
  if (last_artist_name != null) { fields.push('last_artist_name = ?'); values.push(last_artist_name); }
  if (status           != null) {
    fields.push('status = ?');
    values.push(status);
    if (status === 'completed' || status === 'error') fields.push('completed_at = NOW()');
  }

  if (!fields.length && !artist_spotify_id) return res.status(400).json({ error: 'rien à mettre à jour' });

  try {
    if (fields.length) {
      values.push(req.params.id);
      await db.execute(`UPDATE sync_sessions SET ${fields.join(', ')} WHERE id = ?`, values);
    }
    if (artist_spotify_id) {
      await db.execute(
        'UPDATE artists SET last_scraped_at = NOW() WHERE spotify_id = ?',
        [artist_spotify_id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[sync/patch]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/:id/log
// Body : { level?, message }
// Ne logger que les événements importants (ok, error, warn) — pas tous les "info" pour éviter le flood
router.post('/:id/log', async (req, res) => {
  const { level = 'info', message } = req.body;
  if (!message) return res.status(400).json({ error: 'message requis' });

  try {
    await db.execute(
      'INSERT INTO sync_logs (session_id, level, message) VALUES (?, ?, ?)',
      [req.params.id, level, message]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[sync/log]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/resumable/:user_id
// Retourne la session la plus recente interrompue (running ou error, avec au moins 1 artiste scanne)
router.get('/resumable/:user_id', async (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  if (isNaN(userId)) return res.status(400).json({ error: 'user_id invalide (entier attendu)' });

  try {
    const [rows] = await db.execute(
      `SELECT id, date_from, date_to, artists_scanned, artists_total, last_artist_name, status, started_at
       FROM sync_sessions
       WHERE user_id = ?
         AND status IN ('running', 'error')
         AND artists_scanned > 0
       ORDER BY started_at DESC
       LIMIT 1`,
      [userId]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error('[sync/resumable]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/history/:user_id
router.get('/history/:user_id', async (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  if (isNaN(userId)) return res.status(400).json({ error: 'user_id invalide (entier attendu)' });

  try {
    const [rows] = await db.execute(
      'SELECT * FROM sync_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 20',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[sync/history]', err.message, { userId });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/:id/logs
router.get('/:id/logs', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM sync_logs WHERE session_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[sync/logs]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
