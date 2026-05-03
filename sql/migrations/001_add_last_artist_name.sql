-- Migration 001 : ajoute last_artist_name a sync_sessions
-- A executer une seule fois sur la base existante
USE spotifyplus;
ALTER TABLE sync_sessions
  ADD COLUMN last_artist_name VARCHAR(255) DEFAULT NULL AFTER tracks_added;
