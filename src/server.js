require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const cron    = require('node-cron');
const { initDb }    = require('./db/database');
const routes        = require('./routes/index');
const logger        = require('./utils/logger');

const app  = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ── Middleware ────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── API Routes ────────────────────────────────────────────────────
app.use('/api', routes);

// ── Fallback → index.html (SPA) ───────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Init DB + Start ───────────────────────────────────────────────
initDb();

app.listen(PORT, HOST, () => {
  logger.success(`Serveur démarré sur http://${HOST}:${PORT}`, { source: 'system' });
  logger.info(`Interface web : http://localhost:${PORT}`, { source: 'system' });
});

// ── Cron hebdomadaire (optionnel) ─────────────────────────────────
// Décommente pour lancer automatiquement chaque vendredi à 08h00
// cron.schedule('0 8 * * 5', () => {
//   const today   = new Date().toISOString().split('T')[0];
//   const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
//   logger.info('⏰ Synchro automatique hebdomadaire', { source: 'system' });
//   const { startSync } = require('./scraper/sync');
//   startSync({ dateFrom: weekAgo, dateTo: today });
// });

module.exports = app;
