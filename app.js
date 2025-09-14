"use strict";

// ===== Konfiguracja =====
const DEFAULTS = { intervalMs: 4000, autoPlay: true };
const BUILD_TOKEN = "20250913-2"; // podbij po każdej zmianie

// Cache-busting helper
function bust(url){ const sep = url.includes('?') ? '&' : '?'; return url + sep + 'v=' + BUILD_TOKEN; }

// Bezpieczny getter elementów
function $(id){ return document.getElementById(id); }
function on(el, evt, fn, opts){ if(el) el.addEventListener(evt, fn, opts); else console.warn(`[UI] Brak elementu #${(el && el.id) || '??'} dla zdarzenia ${evt}`); }

// Odpal po pełnym załadowaniu DOM, żeby mieć pewność, że wszystkie elementy już są
document.addEventListener('DOMContentLoaded', () => {
  // ----- Pobranie elementów (mogą nie istnieć – obsługujemy to) -----
  const qs = new URLSearchParams(location.search);
  const album = qs.get('album') || 'event1';

  const imgEl = $('slide');
  const counterEl = $('counter');
  const playPauseBtn = $('playPauseBtn');
  const prevBtn = $('prevBtn');
  const nextBtn = $('nextBtn');
  const hudEl = document.querySelector('.hud');
  const fsPromptEl = $('fsPrompt');
  const startBtn = $('startBtn');

  // Ustawienia (tylko margines)
  const workareaEl = $('workarea');
  const settingsBtn = $('settingsBtn');
  const settingsModal = $('settingsModal');
  const closeSettingsBtn = $('closeSettingsBtn');
  const saveSettingsBtn = $('saveSettingsBtn');
  const resetSettingsBtn = $('resetSettingsBtn');
  const marginPctEl = $('marginPct');
  const marginValEl = $('marginVal');
  const previewFrameEl = $('previewFrame');

  // Stałe domyślne (ukryte)
  const ASPECT_W = 16;
  const ASPECT_H = 9;
  const FIT_MODE = 'contain';
  const ALIGN_H = 'center';
  const ALIGN_V = 'center';

  let manifest = null, index = 0, timer = null, isPlaying = DEFAULTS.autoPlay, wakeLock = null;

  // ----- Fullscreen + WakeLock -----
  function isFullscreen(){ return document.fullscreenElement || document.webkitFullscreenElement; }
  async function requestFullscreen(){
    const el = document.documentElement;
    try { if (el.requestFullscreen) return await el.requestFullscreen();
          if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen(); } catch {}
  }
  async function requestWakeLock(){
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        document.addEventListener('visibilitychange', async () => {
          if (document.visibilityState === 'visible') {
            try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
          }
        });
      }
    } catch {}
  }

  // ----- HUD -----
  let hudTimer = null;
  function showHUD(ms=3000){
    if (!hudEl) return;
    hudEl.classList.add('show');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(()=>hudEl.classList.remove('show'), ms);
  }

  // ----- Manifest / Slajdy -----
  async function loadManifest(name){
    const res = await fetch(bust(`albums/${encodeURIComponent(name)}/manifest.json`), { cache:'no-store' });
    if (!res.ok) throw new Error('Nie można wczytać manifestu: '+name);
    const data = await res.json();
    if (!Array.isArray(data.images)) throw new Error('manifest.json musi mieć tablicę "images"');
    return data;
  }
  function setCounter(i,t){ if (counterEl) counterEl.textContent = `${i+1} / ${t}`; }
  function preload(src){ const img = new Image(); img.src = bust(src); }
  function show(i){
    if (!manifest || !imgEl) return;
    index = (i + manifest.images.length) % manifest.images.length;
    const src = `albums/${album}/${manifest.images[index]}`;
    imgEl.src = bust(src);
    setCounter(index, manifest.images.length);
    const nextIdx = (index + 1) % manifest.images.length;
    preload(`albums/${album}/${manifest.images[nextIdx]}`);
  }
  function play(){
    isPlaying = true;
    if (playPauseBtn) playPauseBtn.textContent = '⏸';
    clearInterval(timer);
    timer = setInterval(() => show(index + 1), manifest?.intervalMs || DEFAULTS.intervalMs);
  }
  function pause(){
    isPlaying = false;
    if (playPauseBtn) playPauseBtn.textContent = '▶';
    clearInterval(timer);
  }

  // ----- Gesty / klawisze -----
  (function(){
    let x0 = null;
    window.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive:true });
    window.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) {
        if (dx > 0) show(index - 1); else show(index + 1);
        pause(); showHUD();
      }
      x0 = null;
    });
  })();
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { show(index + 1); pause(); showHUD(); }
    else if (e.key === 'ArrowLeft') { show(index - 1); pause(); showHUD(); }
    else if (e.key.toLowerCase() === ' ') { isPlaying ? pause() : play(); showHUD(); }
  });

  on(prevBtn, 'click', () => { show(index - 1); pause(); showHUD(); });
  on(nextBtn, 'click', () => { show(index + 1); pause(); showHUD(); });
  on(playPauseBtn, 'click', () => { isPlaying ? pause() : play(); showHUD(); });

  // ----- Start (pełny ekran + Wake Lock) -----
  async function activatePresentation(e){
    if (e && e.preventDefault) e.preventDefault();
    await requestFullscreen();
    await requestWakeLock();
    if (fsPromptEl) fsPromptEl.classList.add('hidden');
    showHUD();
  }
  on(startBtn, 'click', activatePresentation);
  document.addEventListener('fullscreenchange', () => { if (!isFullscreen() && fsPromptEl) fsPromptEl.classList.remove('hidden'); });
  document.addEventListener('webkitfullscreenchange', () => { if (!isFullscreen() && fsPromptEl) fsPromptEl.classList.remove('hidden'); });

  // ----- Ustawienia: tylko margines -----
  const SETTINGS_KEY = 'slideshow_settings_v2_onlyMargin';
  const DEFAULT_SETTINGS = { marginPct: 5 };
  let SETTINGS = { ...DEFAULT_SETTINGS };

  function loadSettings(){ try{ const raw=localStorage.getItem(SETTINGS_KEY); if(raw) SETTINGS={...DEFAULT_SETTINGS, ...JSON.parse(raw)}; }catch{} }
  function saveSettings(){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); }

  function updatePreviewBase(pct){
    if (!previewFrameEl) return;
    const ratio = 16/9;
    const base = Math.max(10, 60 - pct);
    if (ratio >= 1) { previewFrameEl.style.width = base + '%'; previewFrameEl.style.height = (base/ratio) + '%'; }
    else { previewFrameEl.style.height = base + '%'; previewFrameEl.style.width = (base*ratio) + '%'; }
  }
  function updatePreview(){ updatePreviewBase(SETTINGS.marginPct); }
  function updatePreviewLive(){ const p = Number(marginPctEl?.value)||0; updatePreviewBase(p); }

  function applySettingsToUI(){
    if (marginPctEl) marginPctEl.value = SETTINGS.marginPct;
    if (marginValEl) marginValEl.textContent = SETTINGS.marginPct + '%';
    updatePreview();
  }

  function openSettings(){
    applySettingsToUI();
    if (settingsModal){
      settingsModal.classList.remove('hidden');
      settingsModal.setAttribute('aria-hidden','false');
    }
    pause(); showHUD(9999);
  }
  function closeSettings(){
    if (settingsModal){
      settingsModal.classList.add('hidden');
      settingsModal.setAttribute('aria-hidden','true');
    }
  }

  on(settingsBtn, 'click', openSettings);
  on(closeSettingsBtn, 'click', closeSettings);
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });
  }
  on(resetSettingsBtn, 'click', () => { SETTINGS = { ...DEFAULT_SETTINGS }; applySettingsToUI(); });
  on(marginPctEl, 'input', () => {
    if (marginValEl && marginPctEl) marginValEl.textContent = marginPctEl.value + '%';
    updatePreviewLive();
  });
  on(saveSettingsBtn, 'click', () => {
    SETTINGS.marginPct = Number(marginPctEl?.value) || 0;
    saveSettings(); closeSettings(); applyWorkareaLayout();
  });

  // ----- Layout workarea -----
  function applyWorkareaLayout(){
    if (!workareaEl || !imgEl) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const marginK = Math.max(0, Math.min(SETTINGS.marginPct, 40)) / 100;
    const usableW = vw * (1 - marginK * 2);
    const usableH = vh * (1 - marginK * 2);
    const targetRatio = ASPECT_W / ASPECT_H;

    let waW, waH;
    if (usableW / usableH >= targetRatio) { waH = usableH; waW = waH * targetRatio; }
    else { waW = usableW; waH = waW / targetRatio; }

    workareaEl.style.width = `${waW}px`;
    workareaEl.style.height = `${waH}px`;

    imgEl.style.objectFit = 'contain';
    imgEl.style.objectPosition = 'center center';

    updatePreview();
  }
  window.addEventListener('resize', applyWorkareaLayout);

  // ----- Init -----
  (async function init(){
    try {
      loadSettings();
      manifest = await loadManifest(album);
      show(0);
      if ((manifest.autoPlay ?? DEFAULTS.autoPlay)) play(); else pause();

      window.addEventListener('pointerdown', () => showHUD(), { passive: true });

      applyWorkareaLayout();
    } catch(err) {
      alert(err.message);
      console.error(err);
    }
  })();
});
