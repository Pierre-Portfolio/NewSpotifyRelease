const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r); }));
const $ = id => document.getElementById(id);
const DEF = { threshold: 25, auto: true, sumMarks: true, geminiKey: '' };
async function load() {
  const o = await chrome.storage.local.get(['settings', 'dropbox']);
  const s = { ...DEF, ...(o.settings || {}) };
  $('auto').checked = !!s.auto; $('threshold').value = s.threshold; $('sumMarks').checked = !!s.sumMarks; $('geminiKey').value = s.geminiKey || '';
  $('dbx').textContent = o.dropbox ? '✓ connecté' : 'non connecté';
  $('login').textContent = o.dropbox ? 'Déconnecter' : 'Connecter Dropbox';
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
  const { dropbox } = await chrome.storage.local.get('dropbox');
  const r = await send({ type: dropbox ? 'logout' : 'login' });
  if (r && r.error) alert(r.error + '\n\nL’adresse de redirection ci-dessus est-elle bien ajoutée dans la console Dropbox ?');
  load();
};
load();
