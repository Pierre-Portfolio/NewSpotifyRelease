const express  = require('express');
const router   = express.Router();
const { getDb } = require('../db/database');
const { getAuthUrl, exchangeCode, spotifyGet, spotifyPut } = require('../spotify/api');
const { startSync, pause, resume, stop, getState } = require('../scraper/sync');
const logger   = require('../utils/logger');

// ══════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════

// GET /auth/login → redirige vers Spotify
router.get('/auth/login', (req, res) => {
  res.redirect(getAuthUrl());
});

// GET /auth/callback → échange le code, sauvegarde les tokens
router.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.status(400).json({ error });

  try {
    const tokens = await exchangeCode(code);
    const me     = await spotifyGet('/me');

    const db = getDb();
    db.prepare(`
      INSERT INTO info_general (
        id, spotify_user_id, display_name, email, plan, avatar_url,
        access_token, refresh_token, token_expires_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        spotify_user_id  = excluded.spotify_user_id,
        display_name     = excluded.display_name,
        email            = excluded.email,
        plan             = excluded.plan,
        avatar_url       = excluded.avatar_url,
        access_token     = excluded.access_token,
        refresh_token    = excluded.refresh_token,
        token_expires_at = excluded.token_expires_at,
        updated_at       = datetime('now')
    `).run(
      me.data.id,
      me.data.display_name,
      me.data.email,
      me.data.product,
      me.data.images?.[0]?.url || null,
      tokens.access_token,
      tokens.refresh_token,
      Date.now() + tokens.expires_in * 1000
    );

    logger.success(`Compte connecté : ${me.data.display_name}`, { source: 'auth' });
    res.redirect('/');
  } catch (e) {
    logger.error(`Auth error: ${e.message}`, { source: 'auth' });
    res.status(500).json({ error: e.message });
  }
});

// GET /auth/status
router.get('/auth/status', (req, res) => {
  const db   = getDb();
  const info = db.prepare('SELECT spotify_user_id, display_name, plan, avatar_url, updated_at FROM info_general WHERE id = 1').get();
  res.json({ connected: !!info, user: info || null });
});

// ══════════════════════════════════════════════════════════════════
// SYNC
// ══════════════════════════════════════════════════════════════════

// POST /sync/start { dateFrom, dateTo }
router.post('/sync/start', async (req, res) => {
  const { dateFrom, dateTo, resumeFromIndex = 0 } = req.body;
  if (!dateFrom || !dateTo) return res.status(400).json({ error: 'dateFrom et dateTo requis' });

  const state = getState();
  if (state.isSyncing) return res.status(409).json({ error: 'Synchro déjà en cours' });

  // Lance en arrière-plan
  startSync({ dateFrom, dateTo, resumeFromIndex }).catch(e => logger.error(e.message));
  res.json({ ok: true, message: 'Synchro démarrée' });
});

// POST /sync/pause
router.post('/sync/pause',  (req, res) => { pause();  res.json({ ok: true }); });

// POST /sync/resume
router.post('/sync/resume', (req, res) => { resume(); res.json({ ok: true }); });

// POST /sync/stop
router.post('/sync/stop',   (req, res) => { stop();   res.json({ ok: true }); });

// GET /sync/state
router.get('/sync/state', (req, res) => {
  const db      = getDb();
  const state   = getState();
  const lastSync = db.prepare('SELECT * FROM synchronisation ORDER BY started_at DESC LIMIT 1').get();
  res.json({ ...state, lastSync: lastSync || null });
});

// GET /sync/history
router.get('/sync/history', (req, res) => {
  const db   = getDb();
  const rows = db.prepare('SELECT * FROM synchronisation ORDER BY started_at DESC LIMIT 20').all();
  res.json(rows);
});

// ══════════════════════════════════════════════════════════════════
// TRACKS
// ══════════════════════════════════════════════════════════════════

// GET /tracks?listened=0&limit=50&offset=0
router.get('/tracks', (req, res) => {
  const db       = getDb();
  const listened = req.query.listened ?? '0';
  const limit    = parseInt(req.query.limit  || '50');
  const offset   = parseInt(req.query.offset || '0');

  const rows = db.prepare(`
    SELECT * FROM tracks
    WHERE listened = ? AND skipped = 0
    ORDER BY added_at DESC
    LIMIT ? OFFSET ?
  `).all(listened, limit, offset);

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM tracks WHERE listened = ? AND skipped = 0
  `).get(listened).count;

  res.json({ tracks: rows, total, limit, offset });
});

// GET /tracks/stats
router.get('/tracks/stats', (req, res) => {
  const db   = getDb();
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(listened) as listened,
      SUM(skipped)  as skipped,
      SUM(CASE WHEN listened=0 AND skipped=0 THEN 1 ELSE 0 END) as pending
    FROM tracks
  `).get();
  res.json(stats);
});

// PUT /tracks/:id/listened
router.put('/tracks/:id/listened', (req, res) => {
  const db = getDb();
  db.prepare(`
    UPDATE tracks SET listened = 1, listened_at = datetime('now') WHERE id = ?
  `).run(req.params.id);
  res.json({ ok: true });
});

// PUT /tracks/:id/skipped
router.put('/tracks/:id/skipped', (req, res) => {
  const db = getDb();
  db.prepare(`
    UPDATE tracks SET skipped = 1, skipped_at = datetime('now') WHERE id = ?
  `).run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
// PLAYBACK
// ══════════════════════════════════════════════════════════════════

// POST /playback/play { uri }
router.post('/playback/play', async (req, res) => {
  const { uri, trackId } = req.body;
  if (!uri) return res.status(400).json({ error: 'uri requis' });

  try {
    const result = await spotifyPut('/me/player/play', { uris: [uri] });

    if (result.status === 204) {
      logger.success(`▶ Lecture : ${uri}`, { source: 'playback', trackUri: uri });
      res.json({ ok: true });
    } else if (result.status === 404) {
      res.status(404).json({ error: 'Aucun appareil Spotify actif' });
    } else if (result.status === 403) {
      res.status(403).json({ error: 'Accès refusé (scope ou mode dev)' });
    } else {
      res.status(result.status).json({ error: result.data });
    }
  } catch (e) {
    logger.error(`Playback error: ${e.message}`, { source: 'playback' });
    res.status(500).json({ error: e.message });
  }
});

// GET /playback/devices
router.get('/playback/devices', async (req, res) => {
  try {
    const { data } = await spotifyGet('/me/player/devices');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// LOGS
// ══════════════════════════════════════════════════════════════════

// GET /logs?syncId=X&level=error&limit=100
router.get('/logs', (req, res) => {
  const db      = getDb();
  const limit   = parseInt(req.query.limit  || '100');
  const offset  = parseInt(req.query.offset || '0');
  const syncId  = req.query.syncId  || null;
  const level   = req.query.level   || null;

  let query  = 'SELECT * FROM logs WHERE 1=1';
  const args = [];

  if (syncId) { query += ' AND sync_id = ?';  args.push(syncId); }
  if (level)  { query += ' AND level = ?';    args.push(level); }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  args.push(limit, offset);

  const rows  = db.prepare(query).all(...args);
  const total = db.prepare('SELECT COUNT(*) as count FROM logs').get().count;
  res.json({ logs: rows, total });
});

module.exports = router;
