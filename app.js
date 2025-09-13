"use strict";

// Ustawienia domyślne + cache-busting
const DEFAULTS = { intervalMs: 4000, autoPlay: true };
const BUILD_TOKEN = new URLSearchParams(location.search).get("v") || (typeof Date !== "undefined" ? String(Date.now()) : "1");

// Query
const qs = new URLSearchParams(location.search);
const album = qs.get('album') || 'event1';

// UI
const imgEl = document.getElementById('slide');
const counterEl = document.getElementById('counter');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const splashEl = document.getElementById('splash');
const hudEl = document.querySelector('.hud');
const fsPromptEl = document.getElementById('fsPrompt');
const startBtn = document.getElementById('startBtn');

// Settings UI / workarea
const workareaEl = document.getElementById('workarea');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');

const aspectPresetEl = document.getElementById('aspectPreset');
const aspectWEl = document.getElementById('aspectW');
const aspectHEl = document.getElementById('aspectH');
const marginPctEl = document.getElementById('marginPct');
const marginValEl = document.getElementById('marginVal');
const fitModeEl = document.getElementById('fitMode');
const alignHEl = document.getElementById('alignH');
const alignVEl = document.getElementById('alignV');
const stereoModeEl = document.getElementById('stereoMode');
const previewFrameEl = document.getElementById('previewFrame');

let manifest = null;
let index = 0;
let timer = null;
let isPlaying = DEFAULTS.autoPlay;
let wakeLock = null;

// --- Fullscreen helpers ---
function isFullscreen() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}
async function requestFullscreen() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      return await el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      return el.webkitRequestFullscreen(); // iOS Safari
    }
  } catch (e) {
    // ignoruj – niektóre przeglądarki wymagają gesture-only
  }
}
function exitFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
}

// --- Wake Lock (bez wygaszania) ---
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {});
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
          try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
        }
      });
    }
  } catch {}
}

// --- HUD tylko po dotknięciu ---
let hudTimer = null;
function showHUD(ms = 3000) {
  hudEl.classList.add('show');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => hudEl.classList.remove('show'), ms);
}

// --- Cache busting helper ---
function bust(url) {
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'v=' + BUILD_TOKEN;
}

// --- Manifest / Slajdy ---
async function loadManifest(name) {
  const url = bust(`albums/${encodeURIComponent(name)}/manifest.json`);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Nie można wczytać manifestu: ${name}`);
  const data = await res.json();
  if (!Array.isArray(data.images)) throw new Error('manifest.json musi mieć tablicę "images"');
  return data;
}
function setCounter(i, total) { counterEl.textContent = `${i + 1} / ${total}`; }
function preload(src) { const img = new Image(); img.src = bust(src); }
function show(i) {
  if (!manifest) return;
  index = (i + manifest.images.length) % manifest.images.length;
  const src = `albums/${album}/${manifest.images[index]}`;
  imgEl.src = bust(src);
  setCounter(index, manifest.images.length);
  const nextIdx = (index + 1) % manifest.images.length;
  preload(`albums/${album}/${manifest.images[nextIdx]}`);
}
function play() {
  isPlaying = true;
  playPauseBtn.textContent = '⏸';
  clearInterval(timer);
  timer = setInterval(() => show(index + 1), manifest.intervalMs || DEFAULTS.intervalMs);
}
function pause() {
  isPlaying = false;
  playPauseBtn.textContent = '▶';
  clearInterval(timer);
}

// Gesty dotykowe (swipe)
(function attachSwipe() {
  let x0 = null;
  window.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  window.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) {
      if (dx > 0) show(index - 1); else show(index + 1);
      pause();
      showHUD();
    }
    x0 = null;
  });
})();

// Klawiatura
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') { show(index + 1); pause(); showHUD(); }
  else if (e.key === 'ArrowLeft') { show(index - 1); pause(); showHUD(); }
  else if (e.key.toLowerCase() === ' ') { isPlaying ? pause() : play(); showHUD(); }
});

// Przyciski
prevBtn.addEventListener('click', () => { show(index - 1); pause(); showHUD(); });
nextBtn.addEventListener('click', () => { show(index + 1); pause(); showHUD(); });
playPauseBtn.addEventListener('click', () => { isPlaying ? pause() : play(); showHUD(); });

// --- Aktywacja prezentacji po świadomym kliknięciu ---
async function activatePresentation(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  await requestFullscreen();
  await requestWakeLock();
  fsPromptEl.classList.add('hidden');
  showHUD();
}
startBtn.addEventListener('click', activatePresentation);

// Jeśli użytkownik wyjdzie z pełnego ekranu, pokaż z powrotem prompt
document.addEventListener('fullscreenchange', () => { if (!isFullscreen()) fsPromptEl.classList.remove('hidden'); });
document.addEventListener('webkitfullscreenchange', () => { if (!isFullscreen()) fsPromptEl.classList.remove('hidden'); });

// ==== USTAWIENIA / WORKAREA ====
const SETTINGS_KEY = 'slideshow_settings_v1';
const DEFAULT_SETTINGS = {
  aspectW: 16,
  aspectH: 9,
  marginPct: 0,      // procent względem krótszego boku ekranu
  fitMode: 'contain',// 'contain' | 'cover'
  alignH: 'center',  // 'left' | 'center' | 'right'
  alignV: 'center',  // 'top' | 'center' | 'bottom'
  stereoMode: 'single'
};
let SETTINGS = { ...DEFAULT_SETTINGS };

function loadSettings() { try { const raw = localStorage.getItem(SETTINGS_KEY); if (raw) SETTINGS = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }; } catch {} }
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); }

function updatePreview() {
  const ratio = SETTINGS.aspectW / SETTINGS.aspectH;
  if (ratio >= 1) {
    previewFrameEl.style.width = `${Math.max(10, 60 - SETTINGS.marginPct)}%`;
    previewFrameEl.style.height = `${Math.max(10, (60 - SETTINGS.marginPct) / ratio)}%`;
  } else {
    previewFrameEl.style.height = `${Math.max(10, 60 - SETTINGS.marginPct)}%`;
    previewFrameEl.style.width = `${Math.max(10, (60 - SETTINGS.marginPct) * ratio)}%`;
  }
}

function applySettingsToUI() {
  aspectWEl.value = SETTINGS.aspectW;
  aspectHEl.value = SETTINGS.aspectH;
  marginPctEl.value = SETTINGS.marginPct;
  marginValEl.textContent = `${SETTINGS.marginPct}%`;
  fitModeEl.value = SETTINGS.fitMode;
  alignHEl.value = SETTINGS.alignH;
  alignVEl.value = SETTINGS.alignV;
  stereoModeEl.value = SETTINGS.stereoMode;
  updatePreview();
}

function openSettings() {
  applySettingsToUI();
  settingsModal.classList.remove('hidden');
  settingsModal.setAttribute('aria-hidden','false');
  pause();
  showHUD(9999);
}
function closeSettings() {
  settingsModal.classList.add('hidden');
  settingsModal.setAttribute('aria-hidden','true');
}

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });

aspectPresetEl.addEventListener('change', () => {
  const v = aspectPresetEl.value;
  if (v === 'custom') return;
  const [aw, ah] = v.split(':').map(Number);
  aspectWEl.value = aw;
  aspectHEl.value = ah;
});

marginPctEl.addEventListener('input', () => {
  marginValEl.textContent = `${marginPctEl.value}%`;
  updatePreviewLive();
});

function updatePreviewLive() {
  const temp = { ...SETTINGS, marginPct: Number(marginPctEl.value) };
  const ratio = (Number(aspectWEl.value)||16) / (Number(aspectHEl.value)||9);
  const old = { ...SETTINGS };
  SETTINGS = { ...temp, aspectW: ratio*100, aspectH: 100 }; // tylko dla podglądu
  updatePreview();
  SETTINGS = old;
}

resetSettingsBtn.addEventListener('click', () => {
  SETTINGS = { ...DEFAULT_SETTINGS };
  applySettingsToUI();
});

saveSettingsBtn.addEventListener('click', () => {
  SETTINGS.aspectW = Math.max(1, Number(aspectWEl.value) || DEFAULT_SETTINGS.aspectW);
  SETTINGS.aspectH = Math.max(1, Number(aspectHEl.value) || DEFAULT_SETTINGS.aspectH);
  SETTINGS.marginPct = Number(marginPctEl.value) || 0;
  SETTINGS.fitMode = fitModeEl.value;
  SETTINGS.alignH = alignHEl.value;
  SETTINGS.alignV = alignVEl.value;
  SETTINGS.stereoMode = stereoModeEl.value;
  saveSettings();
  closeSettings();
  applyWorkareaLayout();
});

// Główna funkcja: dopasowuje 'workarea' i obraz do ustawień
function applyWorkareaLayout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const marginK = Math.max(0, Math.min(SETTINGS.marginPct, 40)) / 100;
  const usableW = vw * (1 - marginK * 2);
  const usableH = vh * (1 - marginK * 2);

  const targetRatio = SETTINGS.aspectW / SETTINGS.aspectH;

  let waW, waH;
  if (usableW / usableH >= targetRatio) {
    waH = usableH;
    waW = waH * targetRatio;
  } else {
    waW = usableW;
    waH = waW / targetRatio;
  }

  // ✅ poprawione template stringi
  workareaEl.style.width = `${waW}px`;
  workareaEl.style.height = `${waH}px`;

  imgEl.style.objectFit = SETTINGS.fitMode;
  const posX = SETTINGS.alignH === 'left' ? 'left' : (SETTINGS.alignH === 'right' ? 'right' : 'center');
  const posY = SETTINGS.alignV === 'top' ? 'top' : (SETTINGS.alignV === 'bottom' ? 'bottom' : 'center');
  imgEl.style.objectPosition = `${posX} ${posY}`;

  updatePreview();
}

window.addEventListener('resize', applyWorkareaLayout);

// Inicjalizacja
(async function init() {
  try {
    loadSettings();
    manifest = await loadManifest(album);
    show(0);
    if ((manifest.autoPlay ?? DEFAULTS.autoPlay)) play(); else pause();

    // Splash znika po załadowaniu 1. slajdu albo po 3s
    let splashHidden = false;
    const hideSplash = () => {
      if (!splashHidden) {
        splashEl.classList.add('hide');
        setTimeout(() => (splashEl.style.display = 'none'), 700);
        splashHidden = true;
      }
    };
    imgEl.addEventListener('load', hideSplash, { once: true });
    setTimeout(hideSplash, 3000);

    // Pokaż HUD po każdym tapnięciu
    window.addEventListener('pointerdown', () => showHUD(), { passive: true });

    applyWorkareaLayout();
  } catch (err) {
    alert(err.message);
    console.error(err);
  }
})();
