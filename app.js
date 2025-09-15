
(() => {
  const VERSION = "1757925452";
  const qs = new URLSearchParams(location.search);
  const clientParam = qs.get('client') || '';
  const showParam = qs.get('show') || '';
  const state = {
    slides: [],
    current: 0,
    playing: false,
    timer: null,
    intervalSec: 5,
    marginPct: 5,
    sortBy: 'name',
    direction: 'asc',
    hudTimer: null,
    wakeLock: null,
    audioEl: null,
    audioAvailable: false,
    key: () => `slideshow::${clientParam}::${showParam}`
  };

  // Elements
  const el = {
    splash: document.getElementById('splash'),
    btnStart: document.getElementById('btnStart'),
    btnOpenCatalog: document.getElementById('btnOpenCatalog'),
    stage: document.getElementById('stage'),
    work: document.getElementById('workarea'),
    img: document.getElementById('slideImg'),
    hud: document.getElementById('hud'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnPlayPause: document.getElementById('btnPlayPause'),
    btnSettings: document.getElementById('btnSettings'),
    btnCatalog: document.getElementById('btnCatalog'),
    btnHome: document.getElementById('btnHome'),
    stage: document.getElementById('stage'),
    btnAudio: document.getElementById('btnAudio'),
    counter: document.getElementById('counter'),
    modalSettings: document.getElementById('modalSettings'),
    optMargin: document.getElementById('optMargin'),
    optMarginOut: document.getElementById('optMarginOut'),
    optInterval: document.getElementById('optInterval'),
    optSortBy: document.getElementById('optSortBy'),
    optDirection: document.getElementById('optDirection'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    modalCatalog: document.getElementById('modalCatalog'),
    catalogList: document.getElementById('catalogList'),
  };

  const applyMargin = () => {
    document.documentElement.style.setProperty('--margin', state.marginPct);
    const inner = document.querySelector('.frameInner');
    if (inner) inner.style.margin = state.marginPct + '%';
    el.optMarginOut.textContent = state.marginPct + '%';
  };

  const clamp = (v,min,max) => Math.max(min, Math.min(max, v));
  function adjustMargin(delta) {
    const before = state.marginPct;
    state.marginPct = clamp(state.marginPct + delta, 0, 20);
    if (state.marginPct !== before) {
      applyMargin();
      // Sync UI
      if (el.optMargin) el.optMargin.value = String(state.marginPct);
      if (el.optMarginOut) el.optMarginOut.textContent = state.marginPct + '%';
      try { localStorage.setItem(state.key(), JSON.stringify({ 
        intervalSec: state.intervalSec, marginPct: state.marginPct, sortBy: state.sortBy, direction: state.direction 
      })); } catch {}
      showHUD();
    }
  }

  function saveSettings() {
    const data = {
      intervalSec: state.intervalSec,
      marginPct: state.marginPct,
      sortBy: state.sortBy,
      direction: state.direction
    };
    localStorage.setItem(state.key(), JSON.stringify(data));
  }

  function loadSettings() {
    const raw = localStorage.getItem(state.key());
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (typeof data.intervalSec === 'number') state.intervalSec = data.intervalSec;
      if (typeof data.marginPct === 'number') state.marginPct = data.marginPct;
      if (typeof data.sortBy === 'string') state.sortBy = data.sortBy;
      if (typeof data.direction === 'string') state.direction = data.direction;
    } catch { }
  }

  function sortSlides() {
    if (state.sortBy === 'random') {
      state.slides.sort(() => Math.random() - .5);
      return;
    }
    const dir = state.direction === 'desc' ? -1 : 1;
    state.slides.sort((a,b) => {
      let av, bv;
      if (state.sortBy === 'dateModified') {
        av = a.dateModified ? Date.parse(a.dateModified) : 0;
        bv = b.dateModified ? Date.parse(b.dateModified) : 0;
      } else {
        av = a.file.toLowerCase();
        bv = b.file.toLowerCase();
      }
      return av < bv ? -1*dir : av > bv ? 1*dir : 0;
    });
  }

  function updateCounter() {
    el.counter.textContent = `${state.current+1} / ${state.slides.length}`;
  }

  function cacheBust(url) {
    const u = new URL(url, location.href);
    u.searchParams.set('v', VERSION);
    return u.toString();
  }

  async function setSlide(idx) {
    if (!state.slides.length) return;
    state.current = (idx + state.slides.length) % state.slides.length;
    const s = state.slides[state.current];
    el.img.src = cacheBust(s.src);
    el.img.alt = s.title || s.file || 'Slajd';
    updateCounter();
    prefetchNeighbors();
  }

  function next() { setSlide(state.current + 1); }
  function prev() { setSlide(state.current - 1); }

  function play() {
    if (state.playing) return;
    state.playing = true;
    el.btnPlayPause.textContent = '⏸️';
    state.timer = setInterval(next, state.intervalSec * 1000);
  }
  function pause() {
    state.playing = false;
    el.btnPlayPause.textContent = '▶️';
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }
  function togglePlay() { state.playing ? pause() : play(); }

  function showHUD() {
    el.hud.classList.remove('hud-hidden');
    el.hud.classList.add('hud-visible');
    el.hud.setAttribute('aria-hidden','false');
    if (state.hudTimer) clearTimeout(state.hudTimer);
    state.hudTimer = setTimeout(() => {
      el.hud.classList.add('hud-hidden');
      el.hud.classList.remove('hud-visible');
      el.hud.setAttribute('aria-hidden','true');
    }, 2500);
  }

  function bindControls() {
    // Tap & Hold margin adjust: left half = +1%/s, right half = -1%/s
    let holdInterval = null;
    let holdActive = false;
    let holdDir = 0;
    let holdStartX = 0, holdStartY = 0;
    const HOLD_THRESHOLD = 25; // px; if user moves more, treat as swipe and cancel hold

    const startHold = (clientX, clientY) => {
      if (el.splash && el.splash.style.display !== 'none') return;
      if (holdActive) return;
      if (document.querySelector('#hud:hover')) return; // rough guard
      const half = window.innerWidth / 2;
      holdDir = clientX < half ? +1 : -1;
      holdActive = true;
      holdStartX, holdStartY = clientX, clientY;
      // First tick after 1s, then every 1s
      holdInterval = setInterval(() => adjustMargin(holdDir), 1000);
    };
    const cancelHold = () => {
      if (holdInterval) clearInterval(holdInterval);
      holdInterval = null;
      holdActive = false;
      holdDir = 0;
    };

    // Pointer-based (covers touch/mouse)
    el.stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#hud') || e.target.closest('dialog')) return;
      startHold(e.clientX, e.clientY);
    });
    window.addEventListener('pointermove', (e) => {
      if (!holdActive) return;
      const dx = Math.abs(e.clientX - holdStartX);
      const dy = Math.abs(e.clientY - holdStartY);
      if (dx > HOLD_THRESHOLD || dy > HOLD_THRESHOLD) cancelHold();
    }, { passive: true });
    ['pointerup','pointercancel','pointerleave'].forEach(ev => {
      window.addEventListener(ev, cancelHold, { passive: true });
    });

    // Tap-to-adjust margin on stage: left half = increase, right half = decrease
    const handleTapAdjust = (x) => {
      const half = window.innerWidth / 2;
      if (x < half) adjustMargin(+1); else adjustMargin(-1);
    };

    // Buttons
    el.btnPrev.addEventListener('click', () => { prev(); showHUD(); });
    el.btnNext.addEventListener('click', () => { next(); showHUD(); });
    el.btnPlayPause.addEventListener('click', () => { togglePlay(); showHUD(); });
    el.btnSettings.addEventListener('click', () => el.modalSettings.showModal());
    el.btnCatalog.addEventListener('click', () => openCatalog());
    el.btnHome.addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); } catch(e){} showHUD(); });
    el.btnOpenCatalog.addEventListener('click', () => openCatalog());

    // Audio
    el.btnAudio.addEventListener('click', () => {
      if (!state.audioEl) return;
      state.audioEl.muted = !state.audioEl.muted;
    });

    // Settings modal
    el.optMargin.addEventListener('input', (e) => { state.marginPct = parseInt(e.target.value,10); applyMargin(); });
    el.optInterval.addEventListener('input', (e) => { state.intervalSec = Math.max(1, parseInt(e.target.value,10)||5); if (state.playing) { pause(); play(); } });
    el.optSortBy.addEventListener('change', (e) => { state.sortBy = e.target.value; sortSlides(); setSlide(state.current); });
    el.optDirection.addEventListener('change', (e) => { state.direction = e.target.value; sortSlides(); setSlide(state.current); });
    el.btnSaveSettings.addEventListener('click', (e) => { e.preventDefault(); saveSettings(); el.modalSettings.close(); });

    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { next(); showHUD(); }
      else if (e.key === 'ArrowLeft') { prev(); showHUD(); }
      else if (e.key === ' ') { e.preventDefault(); togglePlay(); showHUD(); }
    });

    // Touch swipe
    let startX = null, startY = null;
    window.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; startX = t.clientX; startY = t.clientY; });
    window.addEventListener('touchend', (e) => {
const t = e.changedTouches[0]; if (startX==null) return;
      const dx = t.clientX - startX; const dy = t.clientY - startY;
      if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) next(); else prev(); showHUD(); }
      startX = startY = null;
    
});

    // Show HUD on pointer activity
    ['mousemove','pointerdown','touchstart'].forEach(ev => window.addEventListener(ev, showHUD));
  }

  async function openCatalog() {
    await loadCatalog();
    el.modalCatalog.showModal();
  }

  async function loadCatalog() {
    el.catalogList.innerHTML = '<p>Ładowanie…</p>';
    try {
      const res = await fetch(cacheBust('albums/index.json'));
      if (!res.ok) throw new Error('Brak index.json');
      const data = await res.json();
      el.catalogList.innerHTML = '';
      data.clients.forEach(c => {
        const wrap = document.createElement('div');
        wrap.className = 'client';
        const h = document.createElement('h3');
        h.textContent = c.name || c.guid;
        wrap.appendChild(h);
        const list = document.createElement('div'); list.className = 'shows';
        (c.shows||[]).forEach(s => {
          const a = document.createElement('a');
          a.href = `?client=${encodeURIComponent(c.guid)}&show=${encodeURIComponent(s.id)}`;
          a.textContent = s.name || s.id;
          const tag = document.createElement('span'); tag.className='tag'; tag.textContent = s.id;
          a.appendChild(tag);
          a.addEventListener('click', (e) => { e.preventDefault(); location.href = a.href; location.reload(); });
          list.appendChild(a);
        });
        wrap.appendChild(list);
        el.catalogList.appendChild(wrap);
      });
    } catch (e) {
      el.catalogList.innerHTML = '<p>Nie udało się wczytać katalogu.</p>';
    }
  }

  async function requestFullscreenAndStart() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn('Fullscreen error', e);
    }
    await enableWakeLock();
    await startAudioIfAny();
    el.splash.style.display = 'none';
    showHUD();
  }

  async function enableWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        state.wakeLock = await navigator.wakeLock.request('screen');
        state.wakeLock.addEventListener('release', () => console.log('Wake Lock released'));
        document.addEventListener('visibilitychange', async () => {
          if (document.visibilityState === 'visible' && !document.fullscreenElement) return;
          try { state.wakeLock = await navigator.wakeLock.request('screen'); } catch { }
        });
      }
    } catch (e) { console.warn('WakeLock error', e); }
  }

  async function startAudioIfAny() {
    const basePath = albumPath();
    if (!basePath) return;
    const src = cacheBust(basePath + 'audio.mp3');
    try {
      const head = await fetch(src, { method: 'HEAD' });
      if (!head.ok) return;
      const a = new Audio(src);
      a.loop = true;
      a.muted = true; // zaczynamy wyciszeni – użytkownik może włączyć
      await a.play().catch(() => {});
      state.audioEl = a;
      state.audioAvailable = true;
      el.btnAudio.hidden = false;
    } catch { }
  }

  function stopAudio() {
    if (state.audioEl) { state.audioEl.pause(); state.audioEl.currentTime = 0; }
  }

  function albumPath() {
    if (!clientParam || !showParam) return '';
    return `albums/${clientParam}/${showParam}/`;
  }

  async function loadSlides() {
    const base = albumPath();
    if (!base) return;
    // Try manifest.json
    try {
      const res = await fetch(cacheBust(base + 'manifest.json'));
      if (res.ok) {
        const m = await res.json();
        state.slides = (m.slides || []).map(s => ({...s, src: base + s.file}));
      } else {
        await fallbackNumbered(base);
      }
    } catch { await fallbackNumbered(base); }
    sortSlides();
    state.current = 0;
    setSlide(0);
  }

  async function fallbackNumbered(base) {
    const pad = (n) => n.toString().padStart(2,'0');
    const found = [];
    let misses = 0; let started = false;
    for (let i=1; i<=999; i++) {
      const nameJ = `${pad(i)}.jpg`;
      const nameP = `${pad(i)}.png`;
      const urlJ = cacheBust(base + nameJ);
      const urlP = cacheBust(base + nameP);
      const okJ = await fetch(urlJ, { method: 'HEAD' }).then(r => r.ok).catch(()=>false);
      let ok = okJ, file = nameJ, src = base + nameJ;
      if (!okJ) {
        const okP = await fetch(urlP, { method: 'HEAD' }).then(r => r.ok).catch(()=>false);
        ok = okP; file = nameP; src = base + nameP;
      }
      if (ok) { found.push({ file, src }); started = true; misses = 0; }
      else if (started) { misses++; if (misses >= 3) break; }
    }
    state.slides = found;
  }

  function prefetchNeighbors() {
    const idxs = [state.current+1, state.current-1].map(i => (i + state.slides.length) % state.slides.length);
    idxs.forEach(i => { const s = state.slides[i]; if (!s) return; const img = new Image(); img.src = cacheBust(s.src); });
  }

  function initFromSettingsUI() {
    el.optMargin.value = String(state.marginPct);
    el.optInterval.value = String(state.intervalSec);
    el.optSortBy.value = state.sortBy;
    el.optDirection.value = state.direction;
    applyMargin();
  }

  // Fullscreen exit handlers
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      pause();
      stopAudio();
      if (state.wakeLock) try { state.wakeLock.release(); } catch { }
    }
  });

  // Start button
  el.btnStart.addEventListener('click', requestFullscreenAndStart);

  // Init
  bindControls();
  loadSettings();
  initFromSettingsUI();
  if (clientParam && showParam) {
    el.btnOpenCatalog.style.display = 'inline-block';
  }

  if (clientParam && showParam) {
    loadSlides();
  } else {
    el.btnOpenCatalog.click();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && el.splash.style.display !== 'none') { requestFullscreenAndStart(); }
  });

  const observer = new MutationObserver(() => {
    if (el.splash.style.display === 'none') {
      if (state.slides.length === 0) loadSlides();
      setTimeout(() => showHUD(), 100);
    }
  });
  observer.observe(el.splash, { attributes: true, attributeFilter: ['style'] });

})();
