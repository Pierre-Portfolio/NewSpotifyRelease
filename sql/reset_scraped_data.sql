-- ============================================================
-- RESET DES DONNÉES SCRAPÉES
-- À utiliser après la migration 002_add_last_scraped_at.sql
-- Efface toutes les musiques/releases/sessions, conserve les users et artistes
-- ============================================================

USE spotifyplus;

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE sync_logs;
TRUNCATE TABLE tracks;
TRUNCATE TABLE discovery_status;
TRUNCATE TABLE releases;
TRUNCATE TABLE sync_sessions;

SET FOREIGN_KEY_CHECKS = 1;

-- Réinitialiser le champ last_scraped_at au 15 mars 2026 pour tous les artistes
SET SQL_SAFE_UPDATES = 0;
UPDATE artists SET last_scraped_at = '2026-03-14 00:00:00' WHERE id > 0;
SET SQL_SAFE_UPDATES = 1;

-- Vérification
SELECT 'sync_logs'       AS table_name, COUNT(*) AS nb FROM sync_logs       UNION ALL
SELECT 'tracks',                         COUNT(*)       FROM tracks          UNION ALL
SELECT 'discovery_status',               COUNT(*)       FROM discovery_status UNION ALL
SELECT 'releases',                       COUNT(*)       FROM releases        UNION ALL
SELECT 'sync_sessions',                  COUNT(*)       FROM sync_sessions;
