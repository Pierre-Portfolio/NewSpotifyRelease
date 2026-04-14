-- ╔══════════════════════════════════════════════════════════════════╗
-- ║              SPOTIFY RASPI — SCHÉMA BASE DE DONNÉES             ║
-- ╚══════════════════════════════════════════════════════════════════╝

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ──────────────────────────────────────────────────────────────────
-- TABLE 1 : info_general
-- Informations du compte Spotify connecté (1 seule row)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS info_general (
    id                  INTEGER PRIMARY KEY CHECK (id = 1), -- toujours 1 seule row
    spotify_user_id     TEXT    NOT NULL,
    display_name        TEXT,
    email               TEXT,
    plan                TEXT,                               -- 'premium', 'free', etc.
    avatar_url          TEXT,
    access_token        TEXT,                               -- token OAuth actuel
    refresh_token       TEXT,                               -- pour renouveler
    token_expires_at    INTEGER,                            -- timestamp Unix ms
    created_at          TEXT    DEFAULT (datetime('now')),
    updated_at          TEXT    DEFAULT (datetime('now'))
);

-- ──────────────────────────────────────────────────────────────────
-- TABLE 2 : tracks
-- Sons à écouter trouvés lors des synchronisations
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracks (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Identifiants Spotify
    spotify_track_uri   TEXT    NOT NULL UNIQUE,            -- 'spotify:track:XXXX'
    spotify_track_id    TEXT    NOT NULL,
    spotify_album_id    TEXT    NOT NULL,

    -- Infos d'affichage (en clair pour éviter les appels API)
    track_name          TEXT    NOT NULL,
    artist_name         TEXT    NOT NULL,
    artist_spotify_id   TEXT    NOT NULL,
    album_name          TEXT    NOT NULL,
    album_cover_url     TEXT,
    release_date        TEXT,                               -- 'YYYY-MM-DD'
    track_duration_ms   INTEGER,                            -- durée en ms
    track_number        INTEGER,                            -- numéro dans l'album

    -- Statut d'écoute
    listened            INTEGER NOT NULL DEFAULT 0,         -- 0 = non, 1 = oui
    skipped             INTEGER NOT NULL DEFAULT 0,         -- 0 = non, 1 = passé
    listened_at         TEXT,                               -- date listened = true
    skipped_at          TEXT,                               -- date skipped = true

    -- Méta
    added_at            TEXT    DEFAULT (datetime('now')),  -- date ajout en BDD
    synced_from_date    TEXT,                               -- période de synchro source

    FOREIGN KEY (artist_spotify_id) REFERENCES artists_cache(spotify_id)
);

CREATE INDEX IF NOT EXISTS idx_tracks_listened    ON tracks(listened);
CREATE INDEX IF NOT EXISTS idx_tracks_artist      ON tracks(artist_spotify_id);
CREATE INDEX IF NOT EXISTS idx_tracks_added_at    ON tracks(added_at);

-- ──────────────────────────────────────────────────────────────────
-- TABLE 3 : synchronisation
-- État de la dernière (et des précédentes) synchros (1 row active)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS synchronisation (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Statut
    status                  TEXT    NOT NULL DEFAULT 'pending',
                                                            -- 'pending','running','done','error','paused'
    completed               INTEGER NOT NULL DEFAULT 0,     -- 1 = allé jusqu'au bout

    -- Période scannée
    date_from               TEXT    NOT NULL,               -- 'YYYY-MM-DD'
    date_to                 TEXT    NOT NULL,               -- 'YYYY-MM-DD'

    -- Progression
    total_artists           INTEGER DEFAULT 0,
    artists_scanned         INTEGER DEFAULT 0,
    last_artist_name        TEXT,                           -- nom du dernier artiste traité
    last_artist_spotify_id  TEXT,                           -- id du dernier artiste traité
    last_artist_index       INTEGER DEFAULT 0,              -- index dans la liste

    -- Résultats
    tracks_found            INTEGER DEFAULT 0,
    releases_found          INTEGER DEFAULT 0,

    -- Timestamps
    started_at              TEXT    DEFAULT (datetime('now')),
    finished_at             TEXT,
    updated_at              TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_status ON synchronisation(status);

-- ──────────────────────────────────────────────────────────────────
-- TABLE 4 : artists_cache
-- Cache local des artistes suivis (évite de re-fetcher à chaque synchro)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS artists_cache (
    spotify_id          TEXT    PRIMARY KEY,
    name                TEXT    NOT NULL,
    avatar_url          TEXT,
    genres              TEXT,                               -- JSON array stringifié
    followers           INTEGER,
    last_synced_at      TEXT,                               -- dernière fois qu'on a scanné ses sorties
    created_at          TEXT    DEFAULT (datetime('now')),
    updated_at          TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_artists_name ON artists_cache(name);

-- ──────────────────────────────────────────────────────────────────
-- TABLE 5 : logs
-- Tous les logs générés par le scraper et l'interface
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id         INTEGER,                                -- référence à synchronisation.id (nullable)
    level           TEXT    NOT NULL DEFAULT 'info',        -- 'info','success','error','wait','warn'
    source          TEXT    NOT NULL DEFAULT 'scraper',     -- 'scraper','auth','playback','system'
    message         TEXT    NOT NULL,
    artist_name     TEXT,                                   -- artiste concerné si applicable
    track_uri       TEXT,                                   -- track concernée si applicable
    http_status     INTEGER,                                -- code HTTP si erreur réseau
    created_at      TEXT    DEFAULT (datetime('now')),

    FOREIGN KEY (sync_id) REFERENCES synchronisation(id)
);

CREATE INDEX IF NOT EXISTS idx_logs_sync_id    ON logs(sync_id);
CREATE INDEX IF NOT EXISTS idx_logs_level      ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);

-- ──────────────────────────────────────────────────────────────────
-- TRIGGERS : mise à jour automatique de updated_at
-- ──────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_info_general_updated
    AFTER UPDATE ON info_general
    BEGIN
        UPDATE info_general SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS trg_sync_updated
    AFTER UPDATE ON synchronisation
    BEGIN
        UPDATE synchronisation SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS trg_artists_updated
    AFTER UPDATE ON artists_cache
    BEGIN
        UPDATE artists_cache SET updated_at = datetime('now') WHERE spotify_id = NEW.spotify_id;
    END;

-- ──────────────────────────────────────────────────────────────────
-- REQUÊTES UTILES (commentées pour référence)
-- ──────────────────────────────────────────────────────────────────

-- Tracks non écoutées, les plus récentes en premier :
-- SELECT * FROM tracks WHERE listened = 0 AND skipped = 0 ORDER BY added_at DESC;

-- Marquer un track comme écouté :
-- UPDATE tracks SET listened = 1, listened_at = datetime('now') WHERE spotify_track_uri = ?;

-- Marquer un track comme passé :
-- UPDATE tracks SET skipped = 1, skipped_at = datetime('now') WHERE spotify_track_uri = ?;

-- Dernière synchro :
-- SELECT * FROM synchronisation ORDER BY started_at DESC LIMIT 1;

-- Logs de la dernière synchro :
-- SELECT * FROM logs WHERE sync_id = (SELECT MAX(id) FROM synchronisation) ORDER BY created_at ASC;

-- Stats globales :
-- SELECT
--   COUNT(*) as total,
--   SUM(listened) as ecoutees,
--   SUM(skipped) as passees,
--   SUM(CASE WHEN listened=0 AND skipped=0 THEN 1 ELSE 0 END) as en_attente
-- FROM tracks;
