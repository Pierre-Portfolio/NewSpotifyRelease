-- Migration 002 : ajout colonne last_scraped_at sur la table artists
-- Date : 2026-05-05
-- But  : savoir quand un artiste a été scrappé pour la dernière fois

USE spotifyplus;

ALTER TABLE artists
  ADD COLUMN last_scraped_at DATETIME DEFAULT NULL
  AFTER last_fetched_at;

-- Initialiser tous les artistes existants au 15 mars 2026
SET SQL_SAFE_UPDATES = 0;
UPDATE artists SET last_scraped_at = '2026-03-14 00:00:00' WHERE id > 0;
SET SQL_SAFE_UPDATES = 1;
