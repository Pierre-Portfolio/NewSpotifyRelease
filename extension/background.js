// Service worker : file d'attente des vidéos vues → fichier Dropbox lu par le Hub, et résumé IA.
//
// ⚠ TRANSPORT : le Hub n'a pas de serveur et garde TV Time sur chaque appareil. L'extension
// écrit donc dans le dossier d'application Dropbox du Hub (MÊME App key ⇒ MÊME dossier) le
// fichier `DBX_PATH` ; le Hub le relit à l'ouverture (mobile compris) et coche les vidéos.
// Le Hub ne réécrit JAMAIS ce fichier : l'extension en est le seul auteur (jusqu'à `KEEP`
// entrées, les plus récentes). Deux navigateurs équipés ⇒ écriture en mode `update` sur la
// révision lue, rejouée une fois en cas de conflit.
const DROPBOX_APP_KEY = 'x9y0bei8lo9lx5i';   // App key PUBLIQUE du Hub (PKCE, pas de secret)
const DBX_PATH = '/hub-youtube-vus.json';
const KEEP = 500;
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
const DEF = { threshold: 25, auto: true, sumMarks: true, geminiKey: '' };

const get = keys => chrome.storage.local.get(keys);
const set = obj => chrome.storage.local.set(obj);
const settings = async () => ({ ...DEF, ...((await get('settings')).settings || {}) });

// ── Dropbox (OAuth PKCE via chrome.identity) ───────────────────────────────
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rnd = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
async function dropboxLogin() {
  const verifier = rnd(48);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = rnd(16);
  const redirect = chrome.identity.getRedirectURL();
  const url = 'https://www.dropbox.com/oauth2/authorize?' + new URLSearchParams({
    client_id: DROPBOX_APP_KEY, response_type: 'code', redirect_uri: redirect,
    code_challenge: challenge, code_challenge_method: 'S256', token_access_type: 'offline', state,
  });
  const back = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  const q = new URL(back).searchParams;
  if (q.get('state') !== state) throw new Error('Réponse Dropbox inattendue (state).');
  if (!q.get('code')) throw new Error(q.get('error_description') || q.get('error') || 'Connexion refusée.');
  const r = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: q.get('code'), grant_type: 'authorization_code', redirect_uri: redirect, client_id: DROPBOX_APP_KEY, code_verifier: verifier }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(d.error_description || 'Échange du code refusé.');
  await set({ dropbox: { access: d.access_token, expiry: Date.now() + (d.expires_in || 14400) * 1000, refresh: d.refresh_token || '' } });
  flush();
  return true;
}
async function dropboxToken() {
  const { dropbox: t } = await get('dropbox');
  if (!t) return null;
  if (Date.now() < (t.expiry || 0) - 60000) return t.access;
  if (!t.refresh) return t.access || null;
  const r = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: DROPBOX_APP_KEY }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) { if (r.status === 400 || r.status === 401) await chrome.storage.local.remove('dropbox'); return null; }
  await set({ dropbox: { ...t, access: d.access_token, expiry: Date.now() + (d.expires_in || 14400) * 1000 } });
  return d.access_token;
}
async function dbxRead(token) {
  const r = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Dropbox-API-Arg': JSON.stringify({ path: DBX_PATH }) },
  });
  if (r.status === 409) return { data: { v: 1, videos: [] }, rev: null };
  if (!r.ok) throw new Error('Dropbox HTTP ' + r.status);
  let rev = null;
  try { rev = JSON.parse(r.headers.get('Dropbox-API-Result') || '{}').rev || null; } catch {}
  let data = null;
  try { data = JSON.parse(await r.text()); } catch {}
  return { data: data && Array.isArray(data.videos) ? data : { v: 1, videos: [] }, rev };
}
async function dbxWrite(token, data, rev) {
  const mode = rev ? { '.tag': 'update', update: rev } : { '.tag': 'add' };
  return fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path: DBX_PATH, mode, autorename: false, mute: true }) },
    body: JSON.stringify(data),
  });
}

// ── File d'attente ─────────────────────────────────────────────────────────
// `queue` = pas encore dans Dropbox · `recent` = historique local (popup), 50 dernières.
async function enqueue(video) {
  const { queue = [], recent = [] } = await get(['queue', 'recent']);
  const known = queue.find(x => x.id === video.id) || recent.find(x => x.id === video.id);
  // Déjà envoyée ? On complète seulement un résumé arrivé après coup.
  if (known && !(video.sum && !known.sum)) return false;
  const nq = [...queue.filter(x => x.id !== video.id), { ...(known || {}), ...video }];
  const nr = [{ ...(known || {}), ...video, sent: false }, ...recent.filter(x => x.id !== video.id)].slice(0, 50);
  await set({ queue: nq, recent: nr });
  flush();
  return !known;
}
let flushing = null;
function flush() { if (!flushing) flushing = doFlush().finally(() => { flushing = null; }); return flushing; }
async function doFlush() {
  const { queue = [] } = await get('queue');
  if (!queue.length) return { ok: true, sent: 0 };
  const token = await dropboxToken();
  if (!token) { await set({ lastError: 'Dropbox non connecté' }); return { ok: false }; }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, rev } = await dbxRead(token);
      const byId = new Map(data.videos.map(v => [v.id, v]));
      for (const v of queue) byId.set(v.id, { ...(byId.get(v.id) || {}), ...v });
      const videos = [...byId.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, KEEP);
      const r = await dbxWrite(token, { v: 1, updated: Date.now(), videos }, rev);
      if (r.status === 409 && attempt === 0) continue;   // quelqu'un a écrit entre-temps : relire
      if (!r.ok) throw new Error('Dropbox HTTP ' + r.status);
      // ⚠ Seules les entrées envoyées TELLES QUELLES quittent la file : une vidéo complétée
      // (résumé arrivé) pendant l'envoi y reste pour le passage suivant.
      const sentKeys = new Set(queue.map(v => JSON.stringify(v)));
      const sentIds = new Set(queue.map(v => v.id));
      const cur = await get(['queue', 'recent']);
      await set({
        queue: (cur.queue || []).filter(v => !sentKeys.has(JSON.stringify(v))),
        recent: (cur.recent || []).map(v => (sentIds.has(v.id) ? { ...v, sent: true } : v)),
        lastSync: Date.now(), lastError: '',
      });
      return { ok: true, sent: queue.length };
    }
  } catch (e) {
    await set({ lastError: String((e && e.message) || e) });
    return { ok: false };
  }
  return { ok: false };
}

// ── Résumé IA (même prompt que le Hub, `ytSumPrompt`) ────────────────────────
function sumPrompt(title, url) {
  return ['You are provided the title, URL and transcript of a Youtube video in triple quotes.', '',
    'Summarize the video transcript in 5 bullet points in French.', '',
    'Title: """' + (title || '') + '"""', '', 'URL: """' + (url || '') + '"""', '', 'Transcript: """"""'].join('\n');
}
async function summarize(video, force) {
  const { sums = {} } = await get('sums');
  if (!force && sums[video.id]) return sums[video.id].txt;
  const s = await settings();
  if (!s.geminiKey) throw new Error('Aucune clé Gemini : ajoute-la dans les options de l’extension (la même que dans le module 🔌 API du Hub).');
  const url = 'https://www.youtube.com/watch?v=' + encodeURIComponent(video.id);
  const body = JSON.stringify({ contents: [{ parts: [{ text: sumPrompt(video.title, url) }, { file_data: { file_uri: url } }] }] });
  const fails = [];
  for (const m of GEMINI_MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey }, body });
    if (r.status === 404 || r.status === 403 || r.status >= 500) { fails.push(m + ' → ' + r.status); continue; }
    if (r.status === 400) throw new Error('Clé Gemini invalide ou vidéo refusée (privée, restriction d’âge…).');
    if (r.status === 429) throw new Error('Quota Gemini atteint — réessaie plus tard.');
    if (!r.ok) throw new Error('Erreur IA (HTTP ' + r.status + ').');
    const j = await r.json();
    const c = j && j.candidates && j.candidates[0];
    const txt = c && c.content && c.content.parts ? c.content.parts.map(p => p.text || '').join('') : '';
    if (!txt) throw new Error('Réponse vide de l’IA.');
    const keep = Object.entries({ ...sums, [video.id]: { txt, at: Date.now() } }).sort((a, b) => b[1].at - a[1].at).slice(0, 40);
    await set({ sums: Object.fromEntries(keep) });
    return txt;
  }
  throw new Error('Aucun modèle Gemini ne répond (' + fails.join(', ') + ').');
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === 'seen') return { added: await enqueue(msg.video) };
    if (msg.type === 'summary') {
      try {
        const text = await summarize(msg.video, msg.force);
        const s = await settings();
        // Le résumé part AVEC la vidéo : le Hub le range dans son cache de résumés.
        const added = s.sumMarks ? await enqueue({ ...msg.video, sum: text.slice(0, 4000) }) : false;
        return { text, added };
      } catch (e) { return { error: String((e && e.message) || e) }; }
    }
    if (msg.type === 'login') { try { await dropboxLogin(); return { ok: true }; } catch (e) { return { error: String((e && e.message) || e) }; } }
    if (msg.type === 'logout') { await chrome.storage.local.remove('dropbox'); return { ok: true }; }
    if (msg.type === 'flush') return await flush();
    if (msg.type === 'redirect') return { url: chrome.identity.getRedirectURL() };
    return null;
  })().then(reply);
  return true;   // réponse asynchrone
});
chrome.alarms.create('flush', { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'flush') flush(); });
chrome.runtime.onStartup.addListener(() => flush());
