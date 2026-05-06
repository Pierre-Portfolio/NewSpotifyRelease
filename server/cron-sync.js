/**
 * cron-sync.js — Scraping nocturne Spotify (max 99 artistes/run)
 *
 * Crontab Raspi : 0 2 * * * cd /chemin/app && node server/cron-sync.js >> /var/log/spotify-cron.log 2>&1
 *
 * Logique :
 *  - Pour chaque user avec un refresh_token en DB
 *  - Rafraîchit le token Spotify
 *  - Charge les artistes suivis, triés par last_scraped_at ASC (les plus vieux en premier)
 *  - Scrape jusqu'à MAX_ARTISTS artistes, sauvegarde releases + tracks en DB
 *  - Met à jour last_scraped_at après chaque artiste
 */

require('dotenv').config();
const db = require('./db');

const CLIENT_ID    = '672e41f0308f4378b4f2331844e08b20';
const MARKET       = 'FR';
const MAX_ARTISTS  = 99;
const DELAY_MS     = 4000; // délai entre artistes (4s + jitter)
const DATE_FROM    = '2016-01-01';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = () => Math.floor(Math.random() * 2000);
const today  = () => new Date().toISOString().slice(0, 10);
const log    = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

// ── Token Spotify ─────────────────────────────────────────────────────────────

async function refreshSpotifyToken(refreshToken) {
  const body = new URLSearchParams({
    client_id:     CLIENT_ID,
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  });
  const res  = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  // Spotify peut émettre un nouveau refresh_token (rotation)
  return { accessToken: data.access_token, newRefresh: data.refresh_token || null };
}

// ── Appels Spotify API ────────────────────────────────────────────────────────

async function spotifyGet(url, accessToken, retries = 3) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 429) {
    const wait = parseInt(res.headers.get('Retry-After') || '10', 10) * 1000 + 1000;
    log(`⚠ Rate limit 429 — attente ${wait / 1000}s`);
    await sleep(wait);
    return retries > 0 ? spotifyGet(url, accessToken, retries - 1) : null;
  }
  if (!res.ok) return null;
  return res.json();
}

// ── Pagination artistes suivis ────────────────────────────────────────────────

async function fetchAllFollowedArtists(accessToken) {
  const artists = [];
  let url = 'https://api.spotify.com/v1/me/following?type=artist&limit=50';
  while (url) {
    const data = await spotifyGet(url, accessToken);
    if (!data?.artists?.items) break;
    artists.push(...data.artists.items);
    url = data.artists.next || null;
  }
  return artists;
}

// ── Sauvegarde en DB (direct, sans passer par l'API HTTP) ────────────────────

async function saveRelease(userId, sessionId, artist, release) {
  await db.execute(`
    INSERT INTO artists (spotify_id, name, image_url, last_fetched_at)
    VALUES (?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE name = VALUES(name), image_url = VALUES(image_url), last_fetched_at = NOW()
  `, [artist.spotify_id, artist.name, artist.image_url || null]);

  const [[artistRow]] = await db.execute(
    'SELECT id FROM artists WHERE spotify_id = ?', [artist.spotify_id]
  );

  await db.execute(`
    INSERT INTO user_artists (user_id, artist_id, synced_at) VALUES (?, ?, NOW())
    ON DUPLICATE KEY UPDATE synced_at = NOW()
  `, [userId, artistRow.id]);

  await db.execute(`
    INSERT INTO releases (spotify_id, artist_id, title, type, release_date, cover_url, spotify_url, tracks_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE title = VALUES(title), cover_url = VALUES(cover_url),
      spotify_url = VALUES(spotify_url), tracks_count = VALUES(tracks_count)
  `, [
    release.spotify_id, artistRow.id, release.title,
    release.type || 'single', release.release_date,
    release.cover_url || null, release.spotify_url || null,
    release.tracks_count || 0,
  ]);

  const [[releaseRow]] = await db.execute(
    'SELECT id FROM releases WHERE spotify_id = ?', [release.spotify_id]
  );

  if (release.type !== 'album') {
    await db.execute(`
      INSERT IGNORE INTO discovery_status (user_id, release_id, status) VALUES (?, ?, 'unseen')
    `, [userId, releaseRow.id]);
  }

  return releaseRow.id;
}

async function saveTracks(releaseId, userId, tracks) {
  for (const t of tracks) {
    await db.execute(`
      INSERT IGNORE INTO tracks (release_id, user_id, spotify_uri, title, track_number, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [releaseId, userId, t.uri, t.name || '', t.track_number || 1, t.duration_ms || 0]);
  }
}

// ── Sync d'un utilisateur ─────────────────────────────────────────────────────

async function syncUser(user) {
  log(`━━ Début sync user #${user.id} (${user.display_name || user.spotify_id})`);

  // 1. Rafraîchir le token
  let accessToken, newRefresh;
  try {
    ({ accessToken, newRefresh } = await refreshSpotifyToken(user.spotify_refresh_token));
  } catch (err) {
    log(`✗ Token invalide pour user #${user.id} : ${err.message}`);
    return;
  }

  // Si Spotify a rotaté le refresh token, on le met à jour en DB
  if (newRefresh) {
    await db.execute('UPDATE users SET spotify_refresh_token = ? WHERE id = ?', [newRefresh, user.id]);
  }

  // 2. Créer la session de sync
  const [sessionResult] = await db.execute(
    'INSERT INTO sync_sessions (user_id, date_from, date_to) VALUES (?, ?, ?)',
    [user.id, DATE_FROM, today()]
  );
  const sessionId = sessionResult.insertId;

  // 3. Charger les dates de dernier scrapping par artiste
  const [scrapedRows] = await db.execute(`
    SELECT a.spotify_id, a.last_scraped_at
    FROM artists a
    JOIN user_artists ua ON ua.artist_id = a.id
    WHERE ua.user_id = ?
  `, [user.id]);
  const scrapedDates = {};
  for (const r of scrapedRows) scrapedDates[r.spotify_id] = r.last_scraped_at;

  // 4. Charger les URIs déjà en base (dédup)
  const [uriRows] = await db.execute('SELECT spotify_uri FROM tracks WHERE user_id = ?', [user.id]);
  const knownUris = new Set(uriRows.map(r => r.spotify_uri));

  // 5. Charger tous les artistes suivis
  const allArtists = await fetchAllFollowedArtists(accessToken);
  log(`✓ ${allArtists.length} artistes suivis récupérés`);

  // 6. Trier par last_scraped_at ASC : les plus anciens en premier
  allArtists.sort((a, b) => {
    const da = scrapedDates[a.id] ? new Date(scrapedDates[a.id]) : new Date(0);
    const db_ = scrapedDates[b.id] ? new Date(scrapedDates[b.id]) : new Date(0);
    return da - db_;
  });

  await db.execute(
    'UPDATE sync_sessions SET artists_total = ? WHERE id = ?',
    [allArtists.length, sessionId]
  );

  // 7. Scraper jusqu'à MAX_ARTISTS artistes
  let artistsScanned = 0, releasesFound = 0, tracksAdded = 0;
  const ceiling = new Date(today());
  const seenUris = new Set();

  for (const artist of allArtists) {
    if (artistsScanned >= MAX_ARTISTS) {
      log(`⏸ Limite de ${MAX_ARTISTS} artistes atteinte`);
      break;
    }

    const cutoff = new Date(
      scrapedDates[artist.id]
        ? new Date(scrapedDates[artist.id]).toISOString().slice(0, 10)
        : DATE_FROM
    );

    // Albums de l'artiste
    const albumsData = await spotifyGet(
      `https://api.spotify.com/v1/artists/${artist.id}/albums?include_groups=album,single&limit=10&market=${MARKET}`,
      accessToken
    );

    if (albumsData?.items) {
      const inRange = albumsData.items.filter(a => {
        const d = new Date(a.release_date);
        return d >= cutoff && d <= ceiling;
      });

      for (const album of inRange) {
        const releaseId = await saveRelease(user.id, sessionId, {
          spotify_id: artist.id,
          name:       artist.name,
          image_url:  artist.images?.[0]?.url || null,
        }, {
          spotify_id:   album.id,
          title:        album.name,
          type:         album.album_type,
          release_date: album.release_date,
          cover_url:    album.images?.[0]?.url || null,
          spotify_url:  album.external_urls?.spotify || null,
          tracks_count: album.total_tracks || 0,
        });

        releasesFound++;

        // Tracks de l'album
        const tracksData = await spotifyGet(
          `https://api.spotify.com/v1/albums/${album.id}/tracks?limit=50`,
          accessToken
        );

        if (tracksData?.items) {
          const newTracks = tracksData.items.filter(t => t.uri && !seenUris.has(t.uri) && !knownUris.has(t.uri));
          newTracks.forEach(t => seenUris.add(t.uri));

          if (newTracks.length > 0) {
            await saveTracks(releaseId, user.id, newTracks);
            tracksAdded += newTracks.length;
          }
        }
      }
    }

    // Mettre à jour last_scraped_at pour cet artiste
    await db.execute(
      'UPDATE artists SET last_scraped_at = NOW() WHERE spotify_id = ?',
      [artist.id]
    );

    artistsScanned++;

    // Mise à jour session
    await db.execute(`
      UPDATE sync_sessions
      SET artists_scanned = ?, releases_found = ?, tracks_added = ?, last_artist_name = ?
      WHERE id = ?
    `, [artistsScanned, releasesFound, tracksAdded, artist.name, sessionId]);

    log(`  [${artistsScanned}/${Math.min(allArtists.length, MAX_ARTISTS)}] ${artist.name} — ${releasesFound} sorties, ${tracksAdded} titres`);

    await sleep(DELAY_MS + jitter());
  }

  // 8. Clôturer la session
  await db.execute(`
    UPDATE sync_sessions
    SET status = 'completed', completed_at = NOW(),
        artists_scanned = ?, releases_found = ?, tracks_added = ?
    WHERE id = ?
  `, [artistsScanned, releasesFound, tracksAdded, sessionId]);

  log(`✓ Sync terminée — ${artistsScanned} artistes, ${releasesFound} sorties, ${tracksAdded} titres`);
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

(async () => {
  log('=== Cron Spotify+ démarré ===');
  try {
    const [users] = await db.execute(
      'SELECT id, spotify_id, display_name, spotify_refresh_token FROM users WHERE spotify_refresh_token IS NOT NULL'
    );
    log(`${users.length} utilisateur(s) à synchroniser`);

    for (const user of users) {
      try {
        await syncUser(user);
      } catch (err) {
        log(`✗ Erreur user #${user.id} : ${err.message}`);
      }
    }
  } catch (err) {
    log(`✗ Erreur fatale : ${err.message}`);
    process.exit(1);
  } finally {
    await db.end().catch(() => {});
    log('=== Cron terminé ===');
    process.exit(0);
  }
})();
