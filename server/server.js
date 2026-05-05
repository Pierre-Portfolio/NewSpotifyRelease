require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const VERSION = '1.0.9';

const app = express();

app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

app.use('/api/users',    require('./routes/users'));
app.use('/api/sync',     require('./routes/sync'));
app.use('/api/releases', require('./routes/releases'));
app.use('/api/feed',     require('./routes/feed'));
app.use('/api/artists',  require('./routes/artists'));

app.get('/api/health', (_, res) => res.json({ ok: true, version: VERSION, ts: new Date() }));

app.get('/', (_, res) => res.json({ name: 'Spotify+ backend', version: VERSION, status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\nSpotify+ backend v${VERSION} → http://localhost:${PORT}`);
  console.log('Routes : /api/users  /api/sync  /api/releases  /api/feed  /api/artists\n');
});
