const router = require('express').Router();
const db     = require('../db');

// GET /api/artists/scraped-dates/:user_id
// Retourne un objet { spotify_id: last_scraped_at } pour tous les artistes de l'utilisateur
router.get('/scraped-dates/:user_id', async (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  if (isNaN(userId)) return res.status(400).json({ error: 'user_id invalide (entier attendu)' });

  try {
    const [rows] = await db.execute(`
      SELECT a.spotify_id, a.last_scraped_at
      FROM artists a
      JOIN user_artists ua ON ua.artist_id = a.id
      WHERE ua.user_id = ?
    `, [userId]);

    const map = {};
    for (const row of rows) {
      map[row.spotify_id] = row.last_scraped_at
        ? new Date(row.last_scraped_at).toISOString().slice(0, 10)
        : '2016-01-01';
    }
    res.json(map);
  } catch (err) {
    console.error('[artists/scraped-dates]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
