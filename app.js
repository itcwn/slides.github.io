 "use strict";

const BUILD_TOKEN = "20250914163929";

// helpers
function bust(url) { const sep = url.includes('?') ? '&' : '?'; return url + sep + 'v=' + BUILD_TOKEN; }
function pad6(nStr) { const digits = String(nStr).replace(/\D/g, ''); return digits.padStart(6,'0').slice(-6); }

document.addEventListener('DOMContentLoaded', () => {
  const qs = new URLSearchParams(location.search);
  const clientRaw = qs.get('client') || qs.get('clientId') || qs.get('IDClient') || '1';
  const showRaw   = qs.get('show')   || qs.get('showId')   || qs.get('IDShow')   || '1';
  const client = pad6(clientRaw);
  const show = pad6(showRaw);
  const albumBase = `albums/${client}/${show}`;

  // UI
  const imgEl = document.getElementById('slide');
  const counterEl = document.getElementById('counter');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const hudEl = document.querySelector('.hud');
  const fsPromptEl = document.getElementById('fsPrompt');
  const startBtn = document.getElementById('startBtn');
  const browseBtn = document.getElementById('browseBtn');
  const catalogModal = document.getElementById('catalogModal');
  const catalogContent = document.getElementById('catalogContent');
  const closeCatalogBtn = document.getElementById('closeCatalogBtn');
  const audioBtn = document.getElementById('audioBtn');
  const bgAudio = document.getElementById('bgAudio');

  // Settings
  const workareaEl = document.getElementById('workarea');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const resetSettingsBtn = document.getElementById('resetSettingsBtn');
  const marginPctEl = document.getElementById('marginPct');
  const marginValEl = document.getElementById('marginVal');
  const intervalSecEl = document.getElementById('intervalSec');
  const previewFrameEl = document.getElementById('previewFrame');
  const sortByEl = document.getElementById('sortBy');
  const sortDirEl = document.getElementById('sortDir');

  const ASPECT_W = 16, ASPECT_H = 9;
  const FIT_MODE = 'contain', ALIGN_H = 'center', ALIGN_V = 'center';

  let images = [];
  let index = 0;
  let timer = null;
  let isPlaying = true;
  let wakeLock = null;

  // HUD
  function showHUD(ms=3000) { if(!hudEl) return; hudEl.classList.add('show'); clearTimeout(window.__hudTimer); window.__hudTimer=setTimeout(()=>hudEl.classList.remove('show'),ms); }
  function setCounter(i,t) { if(counterEl) counterEl.textContent = `${i+1} / ${t}`; }
  function currentIntervalMs() { const sec = Number(localStorage.getItem('slideshow_interval_sec') || intervalSecEl?.value || 5); return Math.max(1, sec) * 1000; }

  // HEAD helper
  async function headInfo(url) { try { const res = await fetch(bust(url), { method:'HEAD', cache:'no-store' }); return res; } catch { return null; } }
  async function fileExists(url) { const res = await headInfo(url); return !!(res && (res.status===200 || res.status===304)); }

  // Discover images (manifest -> index.json -> brute force numbers)
  async function discoverImages(basePath) {
    try { const r = await fetch(bust(`${basePath}/manifest.json`), { cache:'no-store' }); if (r.ok) { const d = await r.json(); if (Array.isArray(d.images) && d.images.length) return d.images.map(String); } } catch {}
    try { const r = await fetch(bust(`${basePath}/index.json`), { cache:'no-store' }); if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length) return d.map(String); } } catch {}
    const exts = ['jpg','jpeg','png','webp','gif'];
    const names = [];
    for (let i=1;i<=500;i++) { const list=[String(i), String(i).padStart(2,'0'), String(i).padStart(3,'0')]; for (const n of list) for (const e of exts) names.push(`${n}.${e}`); }
    const found = [];
    const batch = 20;
    for (let i=0;i<names.length;i+=batch) {
      const part = names.slice(i,i+batch);
      const results = await Promise.all(part.map(async fn => (await fileExists(`${basePath}/${fn}`)) ? fn : null));
      for (const r of results) if (r) found.push(r);
    }
    return found;
  }

  // Discover one audio file
  async function discoverAudio(basePath) {
    const exts = ['mp3','m4a','ogg','wav','aac'];
    const nameSets = [
      ['audio','music','soundtrack','bg','background','theme'],
      ['audio1','audio01','audio001','track1','track01','track001']
    ];
    for (const set of nameSets) { for (const n of set) { for (const e of exts) { const url = `${basePath}/${n}.${e}`; if (await fileExists(url)) return url; } } }
    for (let i=2;i<=5;i++) { for (const e of exts) { const url = `${basePath}/track${i}.${e}`; if (await fileExists(url)) return url; } }
    return null;
  }

  // Sorting
  async function sortImages(list, basePath, sortBy, dir) {
    let arr = list.map(name => ({ name, key: name, mtime: 0 }));
    if (sortBy === 'modified') {
      const infos = await Promise.all(arr.map(async item => {
        const res = await headInfo(`${basePath}/${item.name}`);
        let t = 0; if (res) { const lm = res.headers.get('Last-Modified'); if (lm) t = Date.parse(lm) || 0; }
        return { ...item, mtime: t, key: t };
      }));
      arr = infos;
    } else if (sortBy === 'random') {
      for (let i=arr.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
      return arr.map(x=>x.name);
    } else {
      arr.forEach(it => it.key = it.name.toLowerCase());
    }
    arr.sort((a,b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    if (dir === 'desc') arr.reverse();
    return arr.map(x=>x.name);
  }

  function show(i) {
    if (!images.length || !imgEl) return;
    index = (i + images.length) % images.length;
    const src = `${albumBase}/${images[index]}`;
    imgEl.src = bust(src);
    setCounter(index, images.length);
  }

  function startTimer() { clearInterval(timer); timer=setInterval(()=>show(index+1), currentIntervalMs()); }
  function play() { isPlaying=true; if (playPauseBtn) playPauseBtn.textContent='⏸'; startTimer(); }
  function pause() { isPlaying=false; if (playPauseBtn) playPauseBtn.textContent='▶'; clearInterval(timer); }

  // Fullscreen / WakeLock
  function isFullscreen() { return document.fullscreenElement || document.webkitFullscreenElement; }
  async function requestFullscreen() { const el=document.documentElement; try { if (el.requestFullscreen) return await el.requestFullscreen(); if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen(); } catch {} }
  async function requestWakeLock() { try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible') { try { wakeLock = await navigator.wakeLock.request('screen'); } catch {} } }); } } catch {} }

  // Audio
  function updateAudioBtn() { if(!audioBtn||!bgAudio) return; audioBtn.textContent = (bgAudio.paused || bgAudio.muted) ? '🎵' : '🔊'; }
  if (audioBtn) audioBtn.addEventListener('click', async () => { if(!bgAudio) return; try { if (bgAudio.paused) { await bgAudio.play(); bgAudio.muted=false; } else { bgAudio.muted=!bgAudio.muted; if (bgAudio.muted) await bgAudio.play().catch(()=>{}); } } catch {} updateAudioBtn(); showHUD(); });

  async function activatePresentation(e) { if(e&&e.preventDefault)e.preventDefault(); await requestFullscreen(); await requestWakeLock(); if(fsPromptEl) fsPromptEl.classList.add('hidden'); showHUD(); if(bgAudio && bgAudio.src) { try { await bgAudio.play(); } catch {} } }
  if (startBtn) startBtn.addEventListener('click', activatePresentation);

  function onFsChange() { if (!isFullscreen()) { if (fsPromptEl) fsPromptEl.classList.remove('hidden'); if (bgAudio) { try { bgAudio.pause(); bgAudio.currentTime=0; } catch {} } } }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  // Gesty / klawisze
  (function(){ let x0=null; window.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true}); window.addEventListener('touchend',e=>{ if(x0==null)return; const dx=e.changedTouches[0].clientX-x0; if(Math.abs(dx)>40){ if(dx>0)show(index-1); else show(index+1); pause(); showHUD(); } x0=null; }); })();
  window.addEventListener('keydown',e=>{ if(e.key==='ArrowRight'){show(index+1);pause();showHUD();} else if(e.key==='ArrowLeft'){show(index-1);pause();showHUD();} else if(e.key.toLowerCase()===' '){ isPlaying?pause():play(); showHUD(); } });
  if (prevBtn) prevBtn.addEventListener('click',()=>{ show(index-1); pause(); showHUD(); });
  if (nextBtn) nextBtn.addEventListener('click',()=>{ show(index+1); pause(); showHUD(); });
  if (playPauseBtn) playPauseBtn.addEventListener('click',()=>{ isPlaying?pause():play(); showHUD(); });

  // Settings
  const SETTINGS_KEY = 'slideshow_settings_v6_catalog';
  const DEFAULT_SETTINGS = { marginPct: 5, intervalSec: 5, sortBy: 'name', sortDir: 'asc' };
  let SETTINGS = { ...DEFAULT_SETTINGS };
  function loadSettings(){ try { const raw=localStorage.getItem(SETTINGS_KEY); if(raw) SETTINGS={...DEFAULT_SETTINGS, ...JSON.parse(raw)}; } catch {} const legacy=localStorage.getItem('slideshow_interval_sec'); if(legacy) SETTINGS.intervalSec=Math.max(1, Number(legacy)||DEFAULT_SETTINGS.intervalSec); }
  function saveSettings(){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); localStorage.setItem('slideshow_interval_sec', String(SETTINGS.intervalSec)); }
  function updatePreviewBase(pct){ if(!previewFrameEl) return; const ratio=16/9; const base=Math.max(8, 40-pct); if(ratio>=1){ previewFrameEl.style.width=base+'%'; previewFrameEl.style.height=(base/ratio)+'%'; } else { previewFrameEl.style.height=base+'%'; previewFrameEl.style.width=(base*ratio)+'%'; } }
  function updatePreview(){ updatePreviewBase(SETTINGS.marginPct); }
  function updatePreviewLive(){ const p=Number(marginPctEl?.value)||0; updatePreviewBase(p); }
  function applySettingsToUI(){ if(marginPctEl) marginPctEl.value=SETTINGS.marginPct; if(marginValEl) marginValEl.textContent=SETTINGS.marginPct+'%'; if(intervalSecEl) intervalSecEl.value=SETTINGS.intervalSec; if(sortByEl) sortByEl.value=SETTINGS.sortBy; if(sortDirEl) sortDirEl.value=SETTINGS.sortDir; updatePreview(); }
  function openSettings(){ applySettingsToUI(); if(settingsModal){ settingsModal.classList.remove('hidden'); settingsModal.setAttribute('aria-hidden','false'); } pause(); showHUD(9999); }
  function closeSettings(){ if(settingsModal){ settingsModal.classList.add('hidden'); settingsModal.setAttribute('aria-hidden','true'); } }
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);
  if (settingsModal) settingsModal.addEventListener('click', (e)=>{ if(e.target===settingsModal) closeSettings(); });
  if (resetSettingsBtn) resetSettingsBtn.addEventListener('click', ()=>{ SETTINGS={...DEFAULT_SETTINGS}; applySettingsToUI(); });
  if (marginPctEl) marginPctEl.addEventListener('input', ()=>{ if(marginValEl) marginValEl.textContent=marginPctEl.value+'%'; updatePreviewLive(); });
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', async ()=>{ SETTINGS.marginPct=Number(marginPctEl?.value)||DEFAULT_SETTINGS.marginPct; SETTINGS.intervalSec=Math.max(1, Number(intervalSecEl?.value)||DEFAULT_SETTINGS.intervalSec); SETTINGS.sortBy=(sortByEl?.value)||DEFAULT_SETTINGS.sortBy; SETTINGS.sortDir=(sortDirEl?.value)||DEFAULT_SETTINGS.sortDir; saveSettings(); closeSettings(); applyWorkareaLayout(); if(isPlaying) startTimer(); images=await sortImages(images, albumBase, SETTINGS.sortBy, SETTINGS.sortDir); index=0; show(0); });

  function applyWorkareaLayout(){ if(!workareaEl||!imgEl) return; const vw=window.innerWidth, vh=window.innerHeight; const marginK=Math.max(0, Math.min(SETTINGS.marginPct,40))/100; const usableW=vw*(1-marginK*2); const usableH=vh*(1-marginK*2); const targetRatio=ASPECT_W/ASPECT_H; let waW,waH; if(usableW/usableH>=targetRatio){ waH=usableH; waW=waH*targetRatio; } else { waW=usableW; waH=waW/targetRatio; } workareaEl.style.width=`${waW}px`; workareaEl.style.height=`${waH}px`; imgEl.style.objectFit=FIT_MODE; imgEl.style.objectPosition=`${ALIGN_H} ${ALIGN_V}`; updatePreview(); }
  window.addEventListener('resize', applyWorkareaLayout);

  // Catalog (lista wszystkich pokazów) z albums/index.json
  async function openCatalog() {
    if (!catalogModal || !catalogContent) return;
    catalogContent.innerHTML = '<div class="hint">Wczytywanie…</div>';
    catalogModal.classList.remove('hidden');
    catalogModal.setAttribute('aria-hidden', 'false');
    try {
      const res = await fetch(bust('albums/index.json'), { cache:'no-store' });
      if (!res.ok) throw new Error('Brak pliku albums/index.json');
      const data = await res.json();
      let clients = [];
      if (Array.isArray(data.clients)) {
        clients = data.clients.map(c => ({ id: String(c.id), name: c.name || c.id, shows: (c.shows||[]).map(String) }));
      } else {
        clients = Object.keys(data).map(k => ({ id: k, name: k, shows: (data[k]||[]).map(String) }));
      }
      const parts = [];
      clients.forEach(c => {
        const showsHtml = c.shows.map(s => {
          const link = `?client=${parseInt(c.id,10)}&show=${parseInt(s,10)}`;
          return `<a class="show-link" href="${link}">${s}</a>`;
        }).join('');
        parts.push(`<div class="client-card"><div class="client-title">Klient ${c.name ? (c.name + ' ') : ''}<code>${c.id}</code></div><div class="show-grid">${showsHtml}</div></div>`);
      });
      catalogContent.innerHTML = parts.join('') || '<div class="hint">Brak wpisów w index.json.</div>';
    } catch (e) {
      catalogContent.innerHTML = '<div class="hint">Nie udało się wczytać listy. Dodaj plik <code>albums/index.json</code> (przykład w ZIP-ie).</div>';
    }
  }
  function closeCatalog() { if(catalogModal){ catalogModal.classList.add('hidden'); catalogModal.setAttribute('aria-hidden','true'); } }
  if (browseBtn) browseBtn.addEventListener('click', openCatalog);
  if (closeCatalogBtn) closeCatalogBtn.addEventListener('click', closeCatalog);
  if (catalogModal) catalogModal.addEventListener('click', (e)=>{ if(e.target===catalogModal) closeCatalog(); });

  // Init
  (async function init(){
    try {
      // ustawienia i layout
      loadSettings(); applySettingsToUI(); applyWorkareaLayout();
      // obrazy
      let list = await discoverImages(albumBase);
      if (!list.length) throw new Error('Nie znaleziono obrazów w ' + albumBase + '. Dodaj manifest.json, index.json lub pliki 01.jpg, 02.jpg ...');
      list = await sortImages(list, albumBase, DEFAULT_SETTINGS.sortBy || 'name', DEFAULT_SETTINGS.sortDir || 'asc');
      images = list;
      // audio
      const audioUrl = await discoverAudio(albumBase);
      if (audioUrl && bgAudio) bgAudio.src = bust(audioUrl);
      // start
      show(0); play();
      window.addEventListener('pointerdown', ()=>showHUD(), { passive: true });
      updateAudioBtn();
    } catch(err) { console.error(err); alert(err.message); }
  })();
});
