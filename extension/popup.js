const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r); }));
const $ = id => document.getElementById(id);
const when = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
async function render() {
  const o = await chrome.storage.local.get(['dropbox', 'queue', 'recent', 'lastSync', 'lastError', 'settings']);
  const s = { threshold: 25, auto: true, sumMarks: true, ...(o.settings || {}) };
  const st = $('status');
  st.textContent = '';
  const line = (txt, cls) => { const d = document.createElement('div'); d.textContent = txt; if (cls) d.className = cls; st.appendChild(d); };
  line(o.dropbox ? '☁️ Dropbox connecté' : '☁️ Dropbox non connecté — rien ne part vers le Hub', o.dropbox ? 'ok' : 'warn');
  line(`▶️ ${s.auto ? `Vidéo comptée vue à ${s.threshold} % lus` : 'Comptage automatique coupé'}${s.sumMarks ? ' · ✨ un résumé IA la compte aussi' : ''}`);
  line(`${(o.queue || []).length} en attente d'envoi${o.lastSync ? ' · dernier envoi ' + when(o.lastSync) : ''}`);
  if (o.lastError && o.dropbox) line('⚠ ' + o.lastError, 'warn');
  $('login').textContent = o.dropbox ? 'Déconnecter Dropbox' : 'Connecter Dropbox';
  const list = $('recent');
  list.textContent = '';
  const rec = (o.recent || []).slice(0, 12);
  if (!rec.length) { const d = document.createElement('div'); d.className = 'dim'; d.textContent = 'Aucune vidéo pour l’instant.'; list.appendChild(d); }
  for (const v of rec) {
    const a = document.createElement('a');
    a.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.id); a.target = '_blank'; a.rel = 'noopener';
    a.className = 'item';
    a.textContent = `${v.sent ? '✓' : '⏳'} ${v.how === 'ia' ? '✨' : '▶️'} ${v.title || v.id}`;
    const sm = document.createElement('small'); sm.textContent = `${v.channel || ''} · ${when(v.at)}`;
    a.appendChild(sm); list.appendChild(a);
  }
}
$('login').onclick = async () => {
  const { dropbox } = await chrome.storage.local.get('dropbox');
  const r = await send({ type: dropbox ? 'logout' : 'login' });
  if (r && r.error) alert(r.error);
  render();
};
$('flush').onclick = async () => { await send({ type: 'flush' }); render(); };
$('opts').onclick = e => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
chrome.storage.onChanged.addListener(render);
render();
