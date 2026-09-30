// Service worker : file d'attente des vidéos vues → fichier Google Drive lu par le Hub, et résumé IA.
//
// ⚠ TRANSPORT : le Hub n'a pas de serveur et garde TV Time sur chaque appareil. L'extension
// écrit donc dans le Google Drive de l'utilisateur, avec le MÊME ID client OAuth que le Hub :
// le scope drive.file ne montre que les fichiers créés par ce projet Google, le Hub voit donc
// `DRIVE_NAME` (rangé dans `HUB_FOLDER`) et le relit à l'ouverture, mobile compris. Le Hub ne
// réécrit JAMAIS ce fichier : l'extension en est le seul auteur (jusqu'à `KEEP` entrées, les
// plus récentes).
const GOOGLE_CLIENT_ID = '968594008637-12ssdcr5i1uutq9vru5f8444bfchephd.apps.googleusercontent.com';   // = GDRIVE_CLIENT_ID du Hub (public)
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_NAME = 'hub-youtube-vus.json';
const HUB_FOLDER = 'HUB_Pierre';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DAPI = 'https://www.googleapis.com/drive/v3/files';
const UAPI = 'https://www.googleapis.com/upload/drive/v3/files';
const RELOGIN = 'Session Google expirée — clique « Reconnecter Google Drive »';
const KEEP = 500;
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
const DEF = { threshold: 25, auto: true, sumMarks: true, geminiKey: '' };

const get = keys => chrome.storage.local.get(keys);
const set = obj => chrome.storage.local.set(obj);
const settings = async () => ({ ...DEF, ...((await get('settings')).settings || {}) });

// ── Google Drive (OAuth via chrome.identity) ───────────────────────────────
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rnd = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
// Flux implicite : un client « Application Web » exige un client_secret pour échanger un code,
// donc aucun refresh token. Le jeton (~1 h) est renouvelé SANS fenêtre (`prompt=none` +
// `login_hint` = compte choisi à la connexion) ; si la session Google de ce navigateur est
// fermée, la file attend un clic sur « Reconnecter ».
// ⚠ `include_granted_scopes=false` : le client du Hub a aussi le scope youtube, que Google
// refuse de mélanger à drive.file (Erreur 400, cf. GDRIVE_SCOPE_YT dans index.html).
// ⚠ L'adresse de retour (`getRedirectURL()`) doit figurer dans les « URI de redirection
// autorisés » de cet ID client, sinon Google affiche redirect_uri_mismatch.
async function googleAuth(interactive) {
  const { google: g } = await get('google');
  const state = rnd(16);
  const p = { client_id: GOOGLE_CLIENT_ID, response_type: 'token', redirect_uri: chrome.identity.getRedirectURL(),
    scope: DRIVE_SCOPE, include_granted_scopes: 'false', state, prompt: interactive ? 'select_account' : 'none' };
  if (g && g.email) p.login_hint = g.email;
  const details = { url: 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams(p), interactive };
  // Sans fenêtre, Google enchaîne des redirections en JS : laisser les pages charger.
  if (!interactive) Object.assign(details, { abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 15000 });
  const back = new URL(await chrome.identity.launchWebAuthFlow(details));
  const q = new URLSearchParams(back.hash.slice(1) || back.search.slice(1));
  if (q.get('state') !== state) throw new Error('Réponse Google inattendue (state).');
  const access = q.get('access_token');
  if (!access) throw new Error(q.get('error_description') || q.get('error') || 'Connexion refusée.');
  let email = (g && g.email) || '';
  if (interactive || !email) {
    const r = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: 'Bearer ' + access } });
    const d = await r.json().catch(() => ({}));
    email = (d.user && d.user.emailAddress) || email;
  }
  await set({ google: { access, expiry: Date.now() + (parseInt(q.get('expires_in'), 10) || 3600) * 1000, email } });
  return access;
}
async function driveToken(renew) {
  const { google: g } = await get('google');
  if (!g) return null;
  if (!renew && g.access && Date.now() < (g.expiry || 0) - 60000) return g.access;
  try { return await googleAuth(false); } catch { await set({ google: { ...g, access: '', expiry: 0 } }); return null; }
}
async function gfetch(url, init) {
  let tok = await driveToken();
  for (let i = 0; tok && i < 2; i++) {
    const r = await fetch(url, { ...init, headers: { ...((init && init.headers) || {}), Authorization: 'Bearer ' + tok } });
    if (r.status !== 401 || i) return r;
    tok = await driveToken(true);   // jeton révoqué avant l'heure : un renouvellement, un seul rejeu
  }
  throw new Error(RELOGIN);
}
async function driveFind(q) {
  const r = await gfetch(DAPI + '?' + new URLSearchParams({ q, spaces: 'drive', fields: 'files(id)', orderBy: 'createdTime', pageSize: '1' }));
  if (!r.ok) throw new Error('Google Drive HTTP ' + r.status);
  const d = await r.json();
  return (d.files && d.files[0] && d.files[0].id) || null;
}
// Le plus ANCIEN fichier de ce nom : deux navigateurs qui l'ont créé en même temps finissent
// par écrire dans le même (le Hub, lui, les lit tous).
async function driveRead() {
  const id = await driveFind(`name='${DRIVE_NAME}' and trashed=false`);
  if (!id) return { id: null, data: { v: 1, videos: [] } };
  const r = await gfetch(`${DAPI}/${id}?alt=media`);
  if (!r.ok) throw new Error('Google Drive HTTP ' + r.status);
  let data = null;
  try { data = JSON.parse(await r.text()); } catch {}
  return { id, data: data && Array.isArray(data.videos) ? data : { v: 1, videos: [] } };
}
async function driveWrite(id, data) {
  const body = JSON.stringify(data);
  if (id) {
    const r = await gfetch(`${UAPI}/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    if (!r.ok) throw new Error('Google Drive HTTP ' + r.status);
    return;
  }
  // Première écriture : dans le dossier des photos du Hub, créé au besoin (sinon à la racine).
  let folder = await driveFind(`mimeType='${FOLDER_MIME}' and name='${HUB_FOLDER}' and trashed=false`);
  if (!folder) {
    const r = await gfetch(DAPI + '?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: HUB_FOLDER, mimeType: FOLDER_MIME }) });
    folder = r.ok ? (await r.json()).id : null;
  }
  const b = 'hubp' + rnd(12);
  const meta = { name: DRIVE_NAME, mimeType: 'application/json', ...(folder ? { parents: [folder] } : {}) };
  const r = await gfetch(UAPI + '?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b },
    body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`
      + `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${body}\r\n--${b}--`,
  });
  if (!r.ok) throw new Error('Google Drive HTTP ' + r.status);
}

// ── File d'attente ─────────────────────────────────────────────────────────
// `queue` = pas encore dans Drive · `recent` = historique local (popup), 50 dernières.
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
  const { queue = [], google } = await get(['queue', 'google']);
  if (!queue.length) return { ok: true, sent: 0 };
  if (!google) { await set({ lastError: 'Google Drive non connecté' }); return { ok: false }; }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { id, data } = await driveRead();
      const byId = new Map(data.videos.map(v => [v.id, v]));
      for (const v of queue) byId.set(v.id, { ...(byId.get(v.id) || {}), ...v });
      const videos = [...byId.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, KEEP);
      await driveWrite(id, { v: 1, updated: Date.now(), videos });
      // Drive n'a pas d'écriture conditionnelle : on RELIT, et si un autre navigateur équipé a
      // écrasé l'envoi entre la lecture et l'écriture, on refait le tour une fois.
      const have = new Set((await driveRead()).data.videos.map(v => v && v.id));
      if (attempt === 0 && queue.some(v => !have.has(v.id))) continue;
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
    if (msg.type === 'login') {
      try { await googleAuth(true); await set({ lastError: '' }); flush(); return { ok: true }; }
      catch (e) { return { error: String((e && e.message) || e) }; }
    }
    // ⚠ Pas de révocation du jeton : elle retirerait l'accès à tout l'ID client, Hub compris.
    if (msg.type === 'logout') { await chrome.storage.local.remove('google'); return { ok: true }; }
    if (msg.type === 'flush') return await flush();
    if (msg.type === 'redirect') return { url: chrome.identity.getRedirectURL() };
    return null;
  })().then(reply);
  return true;   // réponse asynchrone
});
chrome.alarms.create('flush', { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'flush') flush(); });
chrome.runtime.onStartup.addListener(() => flush());
