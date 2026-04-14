const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './data/spotify.db';

// Crée le dossier data si nécessaire
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db     = getDb();
  const schema = fs.readFileSync(path.join(__dirname, '../../sql/schema.sql'), 'utf8');

  // Exécute chaque statement séparément
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    try {
      db.exec(stmt + ';');
    } catch (e) {
      // Ignore les erreurs de commentaires ou statements vides
      if (!e.message.includes('incomplete input')) {
        console.error('SQL error:', e.message, '\nStatement:', stmt.slice(0, 80));
      }
    }
  }

  console.log('✓ Base de données initialisée :', DB_PATH);
  return db;
}

module.exports = { getDb, initDb };
