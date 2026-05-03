const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:              process.env.DB_HOST     || 'localhost',
  port:              process.env.DB_PORT     || 3306,
  user:              process.env.DB_USER     || 'root',
  password:          process.env.DB_PASSWORD || '',
  database:          process.env.DB_NAME     || 'spotifyplus',
  waitForConnections: true,
  connectionLimit:   10,
});

pool.getConnection()
  .then(c => { console.log('✓ MySQL connecté'); c.release(); })
  .catch(e => { console.error('✗ MySQL erreur :', e.message); process.exit(1); });

module.exports = pool;
