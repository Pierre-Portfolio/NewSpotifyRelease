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
  const r = await send({ type: 'redirect' });
  $('redirect').textContent = (r && r.url) || '';
}
$('save').onclick = async () => {
  const t = Math.min(100, Math.max(5, parseInt($('threshold').value, 10) || 25));
  await chrome.storage.local.set({ settings: { threshold: t, auto: $('auto').checked, sumMarks: $('sumMarks').checked, geminiKey: $('geminiKey').value.trim() } });
  $('saved').textContent = '✓ Enregistré'; setTimeout(() => { $('saved').textContent = ''; }, 2000);
  load();
};
$('copy').onclick = () => navigator.clipboard.writeText($('redirect').textContent);
$('login').onclick = async () => {
  const { google } = await chrome.storage.local.get('google');
  const r = await send({ type: google && google.access ? 'logout' : 'login' });
  if (r && r.error) alert(r.error + '\n\nSi Google affichait « Erreur 400 : redirect_uri_mismatch », l’adresse ci-dessus n’est pas encore dans les URI de redirection de l’ID client du Hub (la prise en compte peut prendre quelques minutes).');
  load();
};
load();
