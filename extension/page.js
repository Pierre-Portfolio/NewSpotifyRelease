// Monde « MAIN » de la page YouTube : seul endroit où le lecteur (`#movie_player`) expose ses
// méthodes. On y lit les métadonnées de la vidéo en cours (titre, chaîne, durée) et on les
// passe au script isolé (content.js) par postMessage. Rien d'autre ne sort d'ici.
(() => {
  const SRC = 'hubpierre-yt';
  let lastSent = '';
  const urlId = () => {
    const u = new URL(location.href);
    if (u.pathname === '/watch') return u.searchParams.get('v') || '';
    const m = u.pathname.match(/^\/shorts\/([\w-]{6,})/);
    return m ? m[1] : '';
  };
  const read = () => {
    const id = urlId();
    if (!id) return;
    for (const sel of ['#movie_player', '#shorts-player']) {
      const p = document.querySelector(sel);
      let d = null;
      try { d = p && p.getPlayerResponse && p.getPlayerResponse(); } catch {}
      const v = d && d.videoDetails;
      if (!v || v.videoId !== id) continue;
      const msg = { source: SRC, id, title: v.title || '', channel: v.author || '', channelId: v.channelId || '',
        lengthSeconds: Number(v.lengthSeconds) || 0, live: !!v.isLiveContent && !(Number(v.lengthSeconds) > 0),
        pubDate: (d.microformat && d.microformat.playerMicroformatRenderer && d.microformat.playerMicroformatRenderer.publishDate) || '' };
      const key = JSON.stringify(msg);
      if (key !== lastSent) { lastSent = key; window.postMessage(msg, location.origin); }
      return;
    }
  };
  document.addEventListener('yt-navigate-finish', () => setTimeout(read, 800));
  setInterval(read, 3000);
  read();
})();
