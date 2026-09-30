const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r); }));
const $ = id => document.getElementById(id);
const DEF = { threshold: 25, auto: true, sumMarks: true, geminiKey: '' };
async function load() {
  const o = await chrome.storage.local.get(['settings', 'google']);
  const s = { ...DEF, ...(o.settings || {}) };
  $('auto').checked = !!s.auto; $('threshold').value = s.threshold; $('sumMarks').checked = !!s.sumMarks; $('geminiKey').value = s.geminiKey || '';
  const g = o.google;
  $('gdrive').textContent = !g ? 'non connecté' : g.access ? '✓ connecté' + (g.email ? ' · ' + g.email : '') : '⚠ session expirée';
  $('login').textContent = !g ? 'Connecter Google Drive' : g.access ? 'Déconnecter' : 'Reconnecter Google Drive';
}
$('save').onclick = async () => {
  const t = Math.min(100, Math.max(5, parseInt($('threshold').value, 10) || 25));
  await chrome.storage.local.set({ settings: { threshold: t, auto: $('auto').checked, sumMarks: $('sumMarks').checked, geminiKey: $('geminiKey').value.trim() } });
  $('saved').textContent = '✓ Enregistré'; setTimeout(() => { $('saved').textContent = ''; }, 2000);
  load();
};
$('login').onclick = async () => {
  const { google } = await chrome.storage.local.get('google');
  const r = await send({ type: google && google.access ? 'logout' : 'login' });
  if (r && r.error) alert(r.error);
  load();
};
load();
