const router = require('express').Router();
const db     = require('../db');

// GET /api/feed/:user_id
// Query : ?status=unseen|seen|liked|skipped  &limit=50  &offset=0
router.get('/:user_id', async (req, res) => {
  const { status = 'unseen', limit = 50, offset = 0 } = req.query;

  try {
    const [rows] = await db.execute(`
      SELECT
        r.id, r.spotify_id, r.title, r.type,
        r.release_date, r.cover_url, r.spotify_url,
        r.tracks_count, r.discovered_at,
        a.name        AS artist_name,
        a.image_url   AS artist_image,
        COALESCE(ds.status, 'unseen') AS status
      FROM releases r
      JOIN artists a       ON a.id = r.artist_id
      JOIN user_artists ua ON ua.artist_id = a.id AND ua.user_id = ?
      LEFT JOIN discovery_status ds
                           ON ds.release_id = r.id AND ds.user_id = ?
      WHERE COALESCE(ds.status, 'unseen') = ?
      ORDER BY r.release_date DESC
      LIMIT ? OFFSET ?
    `, [req.params.user_id, req.params.user_id, status, parseInt(limit), parseInt(offset)]);

    res.json(rows);
  } catch (err) {
    console.error('[feed/get]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/feed/:user_id/next  — prochain titre à écouter (file d'attente)
// = le plus petit id avec listened = false
router.get('/:user_id/next', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        t.id, t.spotify_uri, t.title, t.track_number, t.duration_ms,
        t.listened, t.added_at,
        r.title       AS release_title,
        r.cover_url,
        r.type        AS release_type,
        r.spotify_url AS release_spotify_url,
        a.name        AS artist_name
      FROM tracks t
      JOIN releases r ON r.id = t.release_id
      JOIN artists  a ON a.id = r.artist_id
      WHERE t.user_id = ? AND t.listened = false
      ORDER BY t.id ASC
      LIMIT 1
    `, [req.params.user_id]);

    res.json(rows[0] || null);
  } catch (err) {
    console.error('[feed/next]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/feed/tracks/:id/listened  — marquer un titre comme écouté
// Body : { user_id }
router.patch('/tracks/:id/listened', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id requis' });

  try {
    await db.execute(
      'UPDATE tracks SET listened = true, listened_at = NOW() WHERE id = ? AND user_id = ?',
      [req.params.id, user_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[feed/listened]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/feed/releases/:id/status  — unseen | seen | liked | skipped
// Body : { user_id, status }
router.patch('/releases/:id/status', async (req, res) => {
  const { user_id, status } = req.body;
  if (!user_id || !status) return res.status(400).json({ error: 'user_id et status requis' });

  try {
    await db.execute(`
      INSERT INTO discovery_status (user_id, release_id, status)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE status = VALUES(status), updated_at = NOW()
    `, [user_id, req.params.id, status]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[feed/status]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
