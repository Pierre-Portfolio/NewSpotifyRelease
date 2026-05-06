-- Migration 003 : stockage du refresh token Spotify pour le cron nocturne
ALTER TABLE users
  ADD COLUMN spotify_refresh_token TEXT DEFAULT NULL AFTER product;
