const router = require('express').Router();
const db     = require('../db');

// POST /api/users/upsert
// Body : { spotify_id, display_name, avatar_url, product, refresh_token? }
// Appelé à chaque connexion — crée l'user ou met à jour last_login_at
router.post('/upsert', async (req, res) => {
  const { spotify_id, display_name, avatar_url, product, refresh_token } = req.body;
  if (!spotify_id) return res.status(400).json({ error: 'spotify_id requis' });

  try {
    const refreshUpdate = refresh_token ? ', spotify_refresh_token = VALUES(spotify_refresh_token)' : '';
    await db.execute(`
      INSERT INTO users (spotify_id, display_name, avatar_url, product, spotify_refresh_token, last_login_at)
      VALUES (?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        display_name  = VALUES(display_name),
        avatar_url    = VALUES(avatar_url),
        product       = VALUES(product)
        ${refreshUpdate},
        last_login_at = NOW()
    `, [spotify_id, display_name || null, avatar_url || null, product || null, refresh_token || null]);

    const [[user]] = await db.execute(
      'SELECT * FROM users WHERE spotify_id = ?',
      [spotify_id]
    );
    res.json(user);
  } catch (err) {
    console.error('[users/upsert]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
