const router = require('express').Router();
const db     = require('../db');

// POST /api/releases
// Body : {
//   user_id, session_id,
//   artist:  { spotify_id, name, image_url },
//   release: { spotify_id, title, type, release_date, cover_url, spotify_url, tracks_count }
// }
router.post('/', async (req, res) => {
  const { user_id, session_id, artist, release } = req.body;
  if (!user_id || !artist?.spotify_id || !release?.spotify_id)
    return res.status(400).json({ error: 'user_id, artist, release requis' });

  try {
    // Upsert artiste
    await db.execute(`
      INSERT INTO artists (spotify_id, name, image_url, last_fetched_at, last_scraped_at)
      VALUES (?, ?, ?, NOW(), '2026-03-15 00:00:00')
      ON DUPLICATE KEY UPDATE
        name            = VALUES(name),
        image_url       = VALUES(image_url),
        last_fetched_at = NOW()
    `, [artist.spotify_id, artist.name, artist.image_url || null]);

    const [[artistRow]] = await db.execute(
      'SELECT id FROM artists WHERE spotify_id = ?', [artist.spotify_id]
    );

    // Liaison user ↔ artiste
    await db.execute(`
      INSERT INTO user_artists (user_id, artist_id, synced_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE synced_at = NOW()
    `, [user_id, artistRow.id]);

    // Upsert release
    await db.execute(`
      INSERT INTO releases (spotify_id, artist_id, title, type, release_date, cover_url, spotify_url, tracks_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title        = VALUES(title),
        cover_url    = VALUES(cover_url),
        spotify_url  = VALUES(spotify_url),
        tracks_count = VALUES(tracks_count)
    `, [
      release.spotify_id, artistRow.id, release.title,
      release.type || 'single', release.release_date,
      release.cover_url || null, release.spotify_url || null,
      release.tracks_count || 0,
    ]);

    const [[releaseRow]] = await db.execute(
      'SELECT id FROM releases WHERE spotify_id = ?', [release.spotify_id]
    );

    // discovery_status uniquement pour les singles/EPs (pas les albums — on stocke les tracks)
    if (release.type !== 'album') {
      await db.execute(`
        INSERT IGNORE INTO discovery_status (user_id, release_id, status)
        VALUES (?, ?, 'unseen')
      `, [user_id, releaseRow.id]);
    }

    res.json({ release_id: releaseRow.id, artist_id: artistRow.id });
  } catch (err) {
    console.error('[releases/post]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/releases/:id/tracks
// Body : { user_id, tracks: [{ spotify_uri, title, track_number, duration_ms }] }
router.post('/:id/tracks', async (req, res) => {
  const { user_id, tracks } = req.body;
  if (!user_id || !tracks?.length)
    return res.status(400).json({ error: 'user_id et tracks[] requis' });

  try {
    for (const t of tracks) {
      await db.execute(`
        INSERT IGNORE INTO tracks (release_id, user_id, spotify_uri, title, track_number, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [req.params.id, user_id, t.spotify_uri, t.title || '', t.track_number || 1, t.duration_ms || 0]);
    }
    res.json({ ok: true, inserted: tracks.length });
  } catch (err) {
    console.error('[releases/tracks]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
