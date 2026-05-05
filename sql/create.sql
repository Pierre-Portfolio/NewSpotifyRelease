-- Spotify+ Nouvelles Sorties - Schema MySQL
-- Importer dans la base "spotifyplus"
-- Voir sql/InstallDataBase.txt pour le tuto complet

USE spotifyplus;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS sync_logs;
DROP TABLE IF EXISTS tracks;
DROP TABLE IF EXISTS discovery_status;
DROP TABLE IF EXISTS releases;
DROP TABLE IF EXISTS user_artists;
DROP TABLE IF EXISTS artists;
DROP TABLE IF EXISTS sync_sessions;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- USERS
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  spotify_id    VARCHAR(100) NOT NULL UNIQUE,
  display_name  VARCHAR(255),
  avatar_url    TEXT,
  product       VARCHAR(20),
  last_login_at DATETIME,
  created_at    DATETIME DEFAULT NOW()
);

-- SYNC SESSIONS
CREATE TABLE sync_sessions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  date_from       DATE NOT NULL,
  date_to         DATE NOT NULL,
  artists_total   INT UNSIGNED DEFAULT 0,
  artists_scanned INT UNSIGNED DEFAULT 0,
  releases_found  INT UNSIGNED DEFAULT 0,
  tracks_added    INT UNSIGNED DEFAULT 0,
  last_artist_name VARCHAR(255) DEFAULT NULL,
  status          ENUM('running','completed','error','paused') DEFAULT 'running',
  started_at      DATETIME DEFAULT NOW(),
  completed_at    DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- SYNC LOGS
CREATE TABLE sync_logs (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  level      ENUM('info','ok','warn','error','wait') DEFAULT 'info',
  message    TEXT NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (session_id) REFERENCES sync_sessions(id) ON DELETE CASCADE
);

-- ARTISTS
CREATE TABLE artists (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  spotify_id      VARCHAR(100) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  image_url       TEXT,
  last_fetched_at DATETIME,
  last_scraped_at DATETIME DEFAULT '2016-01-01 00:00:00'
);

-- USER_ARTISTS
CREATE TABLE user_artists (
  user_id   INT UNSIGNED NOT NULL,
  artist_id INT UNSIGNED NOT NULL,
  synced_at DATETIME DEFAULT NOW(),
  PRIMARY KEY (user_id, artist_id),
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- RELEASES
CREATE TABLE releases (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  spotify_id    VARCHAR(100) NOT NULL UNIQUE,
  artist_id     INT UNSIGNED NOT NULL,
  title         VARCHAR(255) NOT NULL,
  type          ENUM('album','single','ep') NOT NULL,
  release_date  DATE NOT NULL,
  cover_url     TEXT,
  spotify_url   TEXT,
  tracks_count  INT UNSIGNED DEFAULT 0,
  duration_ms   INT UNSIGNED DEFAULT 0,
  discovered_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- TRACKS (file d'attente de decouverte)
-- ORDER BY id ASC WHERE listened = false => prochain titre a ecouter
CREATE TABLE tracks (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  release_id   INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  spotify_uri  VARCHAR(255) NOT NULL,
  title        VARCHAR(255) NOT NULL,
  track_number TINYINT UNSIGNED DEFAULT 1,
  duration_ms  INT UNSIGNED DEFAULT 0,
  listened     BOOLEAN DEFAULT FALSE,
  listened_at  DATETIME DEFAULT NULL,
  added_at     DATETIME DEFAULT NOW(),
  UNIQUE KEY uq_track_user (spotify_uri, user_id),
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);

-- DISCOVERY_STATUS
CREATE TABLE discovery_status (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  release_id INT UNSIGNED NOT NULL,
  status     ENUM('unseen','seen','liked','skipped') DEFAULT 'unseen',
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY uq_user_release (user_id, release_id),
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
);

-- REQUETES UTILES
-- Prochain titre a ecouter :
-- SELECT * FROM tracks WHERE user_id = ? AND listened = false ORDER BY id ASC LIMIT 1;
--
-- Feed de decouverte (releases non vues) :
-- SELECT r.*, a.name AS artist_name FROM releases r
-- JOIN artists a ON a.id = r.artist_id
-- JOIN user_artists ua ON ua.artist_id = a.id AND ua.user_id = ?
-- LEFT JOIN discovery_status ds ON ds.release_id = r.id AND ds.user_id = ?
-- WHERE COALESCE(ds.status, 'unseen') = 'unseen'
-- ORDER BY r.release_date DESC;
--
-- Logs d'une session :
-- SELECT * FROM sync_logs WHERE session_id = ? ORDER BY created_at ASC;
