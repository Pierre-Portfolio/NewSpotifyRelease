const axios  = require('axios');
const { getDb } = require('../db/database');
require('dotenv').config();

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI  = process.env.SPOTIFY_REDIRECT_URI;

const SCOPES = [
  'user-follow-read',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ');

// ── Auth URL ──────────────────────────────────────────────────────
function getAuthUrl() {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: 'code',
    redirect_uri:  REDIRECT_URI,
    scope:         SCOPES,
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

// ── Exchange code for tokens ──────────────────────────────────────
async function exchangeCode(code) {
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id:    CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data;
}

// ── Refresh token ─────────────────────────────────────────────────
async function refreshAccessToken(refreshToken) {
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data;
}

// ── Get valid token (auto-refresh) ───────────────────────────────
async function getValidToken() {
  const db   = getDb();
  const info = db.prepare('SELECT * FROM info_general WHERE id = 1').get();
  if (!info) throw new Error('Aucun compte connecté. Va sur /auth/login');

  const now = Date.now();
  if (now < info.token_expires_at - 60000) {
    return info.access_token;
  }

  // Refresh
  const data = await refreshAccessToken(info.refresh_token);
  db.prepare(`
    UPDATE info_general SET
      access_token     = ?,
      token_expires_at = ?
    WHERE id = 1
  `).run(data.access_token, now + data.expires_in * 1000);

  return data.access_token;
}

// ── API GET ───────────────────────────────────────────────────────
async function spotifyGet(endpoint) {
  const token = await getValidToken();
  const res   = await axios.get(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: null,
  });

  if (res.status === 429) {
    const retry = parseInt(res.headers['retry-after'] || '5');
    const err   = new Error('RATE_LIMIT');
    err.retryAfter = retry;
    err.retryMs    = retry * 1000 + 3000;
    throw err;
  }

  return { status: res.status, data: res.data };
}

// ── API PUT ───────────────────────────────────────────────────────
async function spotifyPut(endpoint, body) {
  const token = await getValidToken();
  const res   = await axios.put(`https://api.spotify.com/v1${endpoint}`, body, {
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    validateStatus: null,
  });
  return { status: res.status, data: res.data };
}

// ── Fetch all pages ───────────────────────────────────────────────
async function* spotifyPaginate(firstUrl) {
  let url = firstUrl;
  while (url) {
    const token = await getValidToken();
    const res   = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: null,
    });

    if (res.status === 429) {
      const retry = parseInt(res.headers['retry-after'] || '5');
      const err   = new Error('RATE_LIMIT');
      err.retryMs = retry * 1000 + 3000;
      throw err;
    }

    const page = res.data;
    const items = page.items || page.artists?.items || [];
    const total = page.total || page.artists?.total;
    const next  = page.next  || page.artists?.next || null;

    yield { items, total, next };
    url = next;
  }
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  getValidToken,
  spotifyGet,
  spotifyPut,
  spotifyPaginate,
};
