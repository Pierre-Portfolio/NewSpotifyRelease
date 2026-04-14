require('dotenv').config();
const { initDb } = require('./database');
initDb();
process.exit(0);
