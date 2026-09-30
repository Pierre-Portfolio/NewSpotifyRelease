// Script isolé sur youtube.com : compte le temps RÉELLEMENT lu de la vidéo en cours (pas la
// position : sauter à la fin ne compte pas), et quand il atteint le seuil (25 % par défaut)
// demande au service worker de l'ajouter à TV Time. Ajoute aussi le bouton ✨ Résumé IA.
(() => {
  const SRC = 'hubpierre-yt';
  const DEF = { threshold: 25, auto: true, sumMarks: true };
  let settings = { ...DEF };
  let meta = null;             // dernières métadonnées reçues de page.js
  let cur = { id: '', played: 0, last: null, done: false };
  const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r); }); } catch { res(null); } });

  chrome.storage.local.get('settings', o => { settings = { ...DEF, ...(o.settings || {}) }; });
  chrome.storage.onChanged.addListener(ch => { if (ch.settings) settings = { ...DEF, ...(ch.settings.newValue || {}) }; });

  const urlId = () => {
    const u = new URL(location.href);
    if (u.pathname === '/watch') return u.searchParams.get('v') || '';
    const m = u.pathname.match(/^\/shorts\/([\w-]{6,})/);
    return m ? m[1] : '';
  };
  const isShort = () => location.pathname.startsWith('/shorts/');
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.source !== SRC) return;
    meta = e.data;
  });
  // Format attendu par le Hub (`ytSeenMarkAnywhere`) : `dur` en MINUTES arrondies.
  const videoFor = (id, how, video) => {
    const m = meta && meta.id === id ? meta : null;
    const secs = (m && m.lengthSeconds) || (video && isFinite(video.duration) ? video.duration : 0);
    return { id, how, at: Date.now(), title: (m && m.title) || document.title.replace(/ - YouTube$/, ''),
      channel: (m && m.channel) || '', channelId: (m && m.channelId) || '',
      dur: Math.round(secs / 60), pubDate: (m && m.pubDate) || '', short: isShort() };
  };

  const toast = txt => {
    const t = document.createElement('div');
    t.className = 'hubp-toast'; t.textContent = txt;
    document.documentElement.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  };

  // ── Comptage du temps lu ─────────────────────────────────────────────────
  // ⚠ Les PUBS passent dans le même <video> : rien n'est compté tant que le lecteur porte
  // `.ad-showing`. Un saut (écart > 1,5 s entre deux `timeupdate`) n'est pas compté non plus.
  const onTime = e => {
    const v = e.target;
    const id = urlId();
    if (!id) return;
    if (id !== cur.id) cur = { id, played: 0, last: null, done: false };
    const ad = !!document.querySelector('.ad-showing');
    const t = v.currentTime;
    if (!ad && !v.paused && cur.last != null) {
      const d = t - cur.last;
      if (d > 0 && d < 1.5) cur.played += d;
    }
    cur.last = ad ? null : t;
    if (cur.done || !settings.auto || ad) return;
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    if (!dur || (meta && meta.id === id && meta.live)) return;
    if (cur.played >= dur * (settings.threshold || 25) / 100) {
      cur.done = true;
      send({ type: 'seen', video: videoFor(id, (settings.threshold || 25) + '%', v) }).then(r => {
        if (r && r.added) toast('✓ Ajoutée à TV Time (' + (settings.threshold || 25) + ' % vus)');
      });
    }
  };
  document.addEventListener('timeupdate', e => { if (e.target && e.target.tagName === 'VIDEO') onTime(e); }, true);

  // ── ✨ Résumé IA (pages /watch seulement : un Short est trop court à résumer) ─────
  let panel = null;
  const closePanel = () => { if (panel) { panel.remove(); panel = null; } };
  const openSummary = async force => {
    const id = urlId();
    if (!id || isShort()) return;
    closePanel();
    panel = document.createElement('div');
    panel.className = 'hubp-panel';
    panel.innerHTML = '<div class="hubp-head"><b>✨ Résumé IA</b><span class="hubp-sp"></span><button class="hubp-re" title="Régénérer">↻</button><button class="hubp-x" title="Fermer">✕</button></div><div class="hubp-body">Gemini regarde la vidéo…</div>';
    document.documentElement.appendChild(panel);
    panel.querySelector('.hubp-x').onclick = closePanel;
    panel.querySelector('.hubp-re').onclick = () => openSummary(true);
    const video = document.querySelector('video');
    const r = await send({ type: 'summary', force: !!force, video: videoFor(id, 'ia', video) });
    if (!panel) return;
    const body = panel.querySelector('.hubp-body');
    body.textContent = '';
    if (!r || r.error) { body.textContent = '⚠ ' + ((r && r.error) || 'Pas de réponse de l’extension.'); return; }
    // Texte BRUT (jamais innerHTML) : la réponse d'une IA n'est pas du HTML de confiance.
    r.text.split('\n').filter(l => l.trim()).forEach(l => { const p = document.createElement('p'); p.textContent = l.replace(/^\s*[*-]\s*/, '• ').replace(/\*\*/g, ''); body.appendChild(p); });
    if (r.added) { const p = document.createElement('p'); p.className = 'hubp-ok'; p.textContent = '✓ Ajoutée à TV Time'; body.appendChild(p); }
  };
  const ensureButton = () => {
    let b = document.getElementById('hubp-sum-btn');
    const show = !!urlId() && !isShort();
    if (!show) { if (b) b.remove(); closePanel(); return; }
    if (b) return;
    b = document.createElement('button');
    b.id = 'hubp-sum-btn'; b.textContent = '✨ Résumé IA'; b.title = 'Résumer cette vidéo avec Gemini (Hub de Pierre)';
    b.onclick = () => openSummary(false);
    document.documentElement.appendChild(b);
  };
  document.addEventListener('yt-navigate-finish', () => { closePanel(); setTimeout(ensureButton, 500); });
  setInterval(ensureButton, 2000);
  ensureButton();
})();
