const { getDb }          = require('../db/database');
const { spotifyGet, spotifyPaginate } = require('../spotify/api');
const logger             = require('../utils/logger');
require('dotenv').config();

const DELAY_MIN = parseInt(process.env.DELAY_MIN_MS || '11000');
const DELAY_MAX = parseInt(process.env.DELAY_MAX_MS || '15000');

let isSyncing  = false;
let isPaused   = false;
let stopSignal = false;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitWhilePaused() {
  while (isPaused && !stopSignal) {
    await sleep(500);
  }
}

function getState() {
  return { isSyncing, isPaused, stopSignal };
}

function pause()  { if (isSyncing) { isPaused = true;  logger.wait('⏸ Synchro mise en pause.'); } }
function resume() { if (isSyncing) { isPaused = false; logger.info('▶ Reprise de la synchro.'); } }
function stop()   { stopSignal = true; isPaused = false; logger.warn('⛔ Arrêt demandé.'); }

// ── Sync principale ───────────────────────────────────────────────
async function startSync({ dateFrom, dateTo, resumeFromIndex = 0 } = {}) {
  if (isSyncing) {
    logger.warn('Une synchro est déjà en cours.');
    return;
  }

  isSyncing   = true;
  isPaused    = false;
  stopSignal  = false;

  const db     = getDb();
  const cutoff  = new Date(dateFrom);
  const ceiling = new Date(dateTo + 'T23:59:59');

  // Crée une entrée de synchro
  const syncRow = db.prepare(`
    INSERT INTO synchronisation (status, date_from, date_to, artists_scanned)
    VALUES ('running', ?, ?, ?)
  `).run(dateFrom, dateTo, resumeFromIndex);

  const syncId = syncRow.lastInsertRowid;
  logger.setCurrentSync(syncId);

  logger.info(`── Synchro démarrée (id: ${syncId}) ──────────────────`);
  logger.info(`Période : ${dateFrom} → ${dateTo}`);

  let artistsScanned  = resumeFromIndex;
  let totalArtists    = 0;
  let tracksFound     = 0;
  let releasesFound   = 0;
  let artistIndex     = 0;
  const seenUris      = new Set();

  try {
    // ── Étape 1 : vérifie le compte ──
    logger.info('── Étape 1 : compte Spotify ──────────────────────────');
    const { status: meStatus, data: me } = await spotifyGet('/me');
    if (meStatus !== 200) throw new Error(`/me retourné ${meStatus}`);

    logger.success(`Compte : ${me.display_name} (${me.id})`);
    db.prepare(`
      UPDATE info_general SET
        spotify_user_id = ?, display_name = ?, plan = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(me.id, me.display_name, me.product);

    // ── Étape 2 : artistes en streaming ──────────────────────────
    logger.info('── Étape 2 : scan des artistes ───────────────────────');

    for await (const page of spotifyPaginate('https://api.spotify.com/v1/me/following?type=artist&limit=50')) {
      if (stopSignal) break;

      if (page.total && totalArtists === 0) {
        totalArtists = page.total;
        db.prepare('UPDATE synchronisation SET total_artists = ? WHERE id = ?')
          .run(totalArtists, syncId);
        logger.info(`Total artistes suivis : ${totalArtists}`);

        // Met à jour le cache artistes
        for (const a of page.items) {
          db.prepare(`
            INSERT INTO artists_cache (spotify_id, name, avatar_url, followers, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(spotify_id) DO UPDATE SET
              name       = excluded.name,
              avatar_url = excluded.avatar_url,
              followers  = excluded.followers,
              updated_at = datetime('now')
          `).run(a.id, a.name, a.images?.[0]?.url || null, a.followers?.total || 0);
        }
      }

      for (const artist of page.items) {
        if (stopSignal) break;
        artistIndex++;

        // Reprend à partir de l'index sauvegardé
        if (artistIndex <= resumeFromIndex) continue;

        await waitWhilePaused();
        if (stopSignal) break;

        artistsScanned++;

        // Mise à jour progression en BDD
        db.prepare(`
          UPDATE synchronisation SET
            artists_scanned        = ?,
            last_artist_name       = ?,
            last_artist_spotify_id = ?,
            last_artist_index      = ?,
            tracks_found           = ?,
            releases_found         = ?,
            updated_at             = datetime('now')
          WHERE id = ?
        `).run(artistsScanned, artist.name, artist.id, artistIndex, tracksFound, releasesFound, syncId);

        logger.info(`Scan ${artistsScanned}/${totalArtists} — ${artist.name}`);

        // Sorties de cet artiste
        const { data: albumsData } = await spotifyGet(
          `/artists/${artist.id}/albums?include_groups=album,single&limit=10&market=FR`
        );

        if (!albumsData?.items) {
          logger.warn(`${artist.name} — aucun album retourné`);
        } else {
          const inPeriod = albumsData.items.filter(album => {
            const d = new Date(album.release_date);
            return d >= cutoff && d <= ceiling;
          });

          if (inPeriod.length === 0) {
            logger.info(`— ${artist.name} · aucune sortie dans la période`);
          }

          for (const album of inPeriod) {
            // Pistes
            const { data: tracksData } = await spotifyGet(
              `/albums/${album.id}/tracks?limit=50`
            );
            if (!tracksData?.items) continue;

            for (const track of tracksData.items) {
              if (seenUris.has(track.uri)) continue;
              seenUris.add(track.uri);

              // Insère en BDD
              try {
                db.prepare(`
                  INSERT OR IGNORE INTO tracks (
                    spotify_track_uri, spotify_track_id, spotify_album_id,
                    track_name, artist_name, artist_spotify_id,
                    album_name, album_cover_url, release_date,
                    track_duration_ms, track_number, synced_from_date
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  track.uri,
                  track.id,
                  album.id,
                  track.name,
                  artist.name,
                  artist.id,
                  album.name,
                  album.images?.[0]?.url || null,
                  album.release_date,
                  track.duration_ms,
                  track.track_number,
                  `${dateFrom}:${dateTo}`
                );

                tracksFound++;
                logger.success(
                  `✓ ${artist.name} — ${track.name}`,
                  { artistName: artist.name, trackUri: track.uri }
                );
              } catch (e) {
                logger.warn(`Doublon ignoré : ${track.uri}`);
              }
            }

            releasesFound++;
          }
        }

        // Mise à jour last_synced_at dans le cache
        db.prepare(`
          UPDATE artists_cache SET last_synced_at = datetime('now') WHERE spotify_id = ?
        `).run(artist.id);

        // Délai anti rate-limit
        const isLast = artistIndex >= totalArtists;
        if (!isLast && !stopSignal) {
          const delay = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);
          logger.wait(`⏳ Pause ${(delay / 1000).toFixed(1)}s`);
          await sleep(delay);
        }
      }
    }

    // ── Fin ──
    const completed = !stopSignal;
    db.prepare(`
      UPDATE synchronisation SET
        status       = ?,
        completed    = ?,
        tracks_found = ?,
        releases_found = ?,
        artists_scanned = ?,
        finished_at  = datetime('now'),
        updated_at   = datetime('now')
      WHERE id = ?
    `).run(
      completed ? 'done' : 'paused',
      completed ? 1 : 0,
      tracksFound,
      releasesFound,
      artistsScanned,
      syncId
    );

    if (completed) {
      logger.success(`🎵 Synchro terminée — ${tracksFound} titres trouvés depuis ${releasesFound} sorties.`);
    } else {
      logger.warn(`Synchro interrompue à l'artiste ${artistsScanned}/${totalArtists}.`);
    }

  } catch (err) {
    if (err.message === 'RATE_LIMIT') {
      logger.error(`🚫 RATE LIMIT 429 — Retry-After : ${err.retryAfter}s`);
      logger.error(`Synchro arrêtée après ${artistsScanned} artistes.`);
      db.prepare(`
        UPDATE synchronisation SET status = 'error', finished_at = datetime('now') WHERE id = ?
      `).run(syncId);
    } else {
      logger.error(`Erreur inattendue : ${err.message}`);
      db.prepare(`
        UPDATE synchronisation SET status = 'error', finished_at = datetime('now') WHERE id = ?
      `).run(syncId);
    }
  } finally {
    isSyncing  = false;
    isPaused   = false;
    stopSignal = false;
    logger.clearCurrentSync();
  }
}

module.exports = { startSync, pause, resume, stop, getState };
