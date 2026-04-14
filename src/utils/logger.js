const { getDb } = require('../db/database');

let currentSyncId = null;

function setCurrentSync(syncId) {
  currentSyncId = syncId;
}

function clearCurrentSync() {
  currentSyncId = null;
}

function log(message, options = {}) {
  const {
    level      = 'info',
    source     = 'scraper',
    artistName = null,
    trackUri   = null,
    httpStatus = null,
    syncId     = currentSyncId,
  } = options;

  const time = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Console
  const prefix = {
    info:    '\x1b[37m[INFO]\x1b[0m',
    success: '\x1b[32m[OK]\x1b[0m  ',
    error:   '\x1b[31m[ERR]\x1b[0m ',
    wait:    '\x1b[33m[WAIT]\x1b[0m',
    warn:    '\x1b[33m[WARN]\x1b[0m',
  }[level] || '[LOG] ';

  console.log(`${time} ${prefix} ${message}`);

  // DB
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO logs (sync_id, level, source, message, artist_name, track_uri, http_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(syncId, level, source, message, artistName, trackUri, httpStatus);
  } catch (e) {
    console.error('Logger DB error:', e.message);
  }
}

const logger = {
  info:    (msg, opts = {}) => log(msg, { ...opts, level: 'info' }),
  success: (msg, opts = {}) => log(msg, { ...opts, level: 'success' }),
  error:   (msg, opts = {}) => log(msg, { ...opts, level: 'error' }),
  wait:    (msg, opts = {}) => log(msg, { ...opts, level: 'wait' }),
  warn:    (msg, opts = {}) => log(msg, { ...opts, level: 'warn' }),
  setCurrentSync,
  clearCurrentSync,
};

module.exports = logger;
