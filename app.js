"use strict";

// Domyślne + cache-busting
const DEFAULTS = { intervalMs: 4000, autoPlay: true };
const BUILD_TOKEN = "20250913-1"; // podbij ręcznie po każdej zmianie

// Parametry
const qs = new URLSearchParams(location.search);
const album = qs.get('album') || 'event1';

// UI
const imgEl = document.getElementById('slide');
const counterEl = document.getElementById('counter');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const hudEl = document.querySelector('.hud');
const fsPromptEl = document.getElementById('fsPrompt');
const startBtn = document.getElementById('startBtn');

// Ustawienia (TYLKO margines)
const workareaEl = document.getElementById('workarea');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const marginPctEl = document.getElementById('marginPct');
const marginValEl = document.getElementById('marginVal');
const previewFrameEl = document.getElementById('previewFrame');

// Stałe domyślne (ukryte)
const ASPECT_W = 16;
const ASPECT_H = 9;
const FIT_MODE = 'contain';
const ALIGN_H = 'center';
const ALIGN_V = 'center';

let manifest = null, index = 0, timer = null, isPlaying = DEFAULTS.autoPlay, wakeLock = null;

/* ---------- Fullscreen + Wake Lock ---------- */
function isFullscreen() { return document.fullscreenElement || document.webkitFullscreenElement; }
async function requestFullscreen() {
  const el = document.documentElement;
  try { if (el.requestFullscreen) return await el.requestFullscreen();
        if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen(); } catch {}
}
async function requestWakeLock() {
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

/* ---------- HUD tylko po dotknięciu ---------- */
let hudTimer = null;
function showHUD(ms=3000){ hudEl.classList.add('show'); clearTimeout(hudTimer); hudTimer=setTimeout(()=>hudEl.classList.remove('show'),ms); }

/* ---------- Cache-busting ---------- */
function bust(url){ const sep = url.includes('?') ? '&' : '?'; return url + sep + 'v=' + BUILD_TOKEN; }

/* ---------- Manifest / slajdy ---------- */
async function loadManifest(name){
  const res = await fetch(bust(`albums/${encodeURIComponent(name)}/manifest.json`), { cache:'no-store' });
  if (!res.ok) throw new Error('Nie można wczytać manifestu: '+name);
  const data = await res.json();
  if (!Array.isArray(data.images)) throw new Error('manifest.json musi mieć tablicę "images"');
  return data;
}
function setCounter(i,t){ counterEl.textContent = `${i+1} / ${t}`; }
function preload(src){ const img = new Image(); img.src = bust(src); }
function show(i){
  if (!manifest) return;
  index = (i + manifest.images.length) % manifest.images.length;
  const src = `albums/${album}/${manifest.images[index]}`;
  imgEl.src = bust(src);
  setCounter(index, manifest.images.length);
  const nextIdx = (index + 1) % manifest.images.length;
  preload(`albums/${album}/${manifest.images[nextIdx]}`);
}
function play(){ isPlaying=true; playPauseBtn.textContent='⏸'; clearInterval(timer); timer=setInterval(()=>show(index+1), manifest.intervalMs || DEFAULTS.intervalMs); }
function pause(){ isPlaying=false; playPauseBtn.textContent='▶'; clearInterval(timer); }

/* ---------- Gesty / klawisze ---------- */
(function(){ let x0=null;
  window.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true});
  window.addEventListener('touchend',e=>{
    if(x0==null)return;
    const dx=e.changedTouches[0].clientX-x0;
    if(Math.abs(dx)>40){ if(dx>0)show(index-1); else show(index+1); pause(); showHUD(); }
    x0=null;
  });
})();
window.addEventListener('keydown',e=>{
  if(e.key==='ArrowRight'){show(index+1);pause();showHUD();}
  else if(e.key==='ArrowLeft'){show(index-1);pause();showHUD();}
  else if(e.key.toLowerCase()===' '){ isPlaying?pause():play(); showHUD(); }
});
prevBtn.addEventListener('click',()=>{show(index-1);pause();showHUD();});
nextBtn.addEventListener('click',()=>{show(index+1);pause();showHUD();});
playPauseBtn.addEventListener('click',()=>{isPlaying?pause():play();showHUD();});

/* ---------- Start (pełny ekran + Wake Lock) ---------- */
async function activatePresentation(e){
  if(e && e.preventDefault) e.preventDefault();
  await requestFullscreen();
  await requestWakeLock();
  fsPromptEl.classList.add('hidden');
  showHUD();
}
startBtn.addEventListener('click', activatePresentation);
document.addEventListener('fullscreenchange',()=>{ if(!isFullscreen()) fsPromptEl.classList.remove('hidden'); });
document.addEventListener('webkitfullscreenchange',()=>{ if(!isFullscreen()) fsPromptEl.classList.remove('hidden'); });

/* ---------- Ustawienia: tylko margines (domyślnie 5%) ---------- */
const SETTINGS_KEY = 'slideshow_settings_v2_onlyMargin';
const DEFAULT_SETTINGS = { marginPct: 5 };
let SETTINGS = { ...DEFAULT_SETTINGS };

function loadSettings(){ try{ const raw=localStorage.getItem(SETTINGS_KEY); if(raw) SETTINGS={...DEFAULT_SETTINGS, ...JSON.parse(raw)}; }catch{} }
function saveSettings(){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); }

function applySettingsToUI(){
  marginPctEl.value = SETTINGS.marginPct;
  marginValEl.textContent = SETTINGS.marginPct + '%';
  updatePreview();
}
function openSettings(){ applySettingsToUI(); settingsModal.classList.remove('hidden'); settingsModal.setAttribute('aria-hidden','false'); pause(); showHUD(9999); }
function closeSettings(){ settingsModal.classList.add('hidden'); settingsModal.setAttribute('aria-hidden','true'); }
settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e)=>{ if(e.target===settingsModal) closeSettings(); });
resetSettingsBtn.addEventListener('click', ()=>{ SETTINGS={...DEFAULT_SETTINGS}; applySettingsToUI(); });
marginPctEl.addEventListener('input', ()=>{ marginValEl.textContent = marginPctEl.value + '%'; updatePreviewLive(); });
saveSettingsBtn.addEventListener('click', ()=>{ SETTINGS.marginPct = Number(marginPctEl.value)||0; saveSettings(); closeSettings(); applyWorkareaLayout(); });

function updatePreview(){
  const ratio = ASPECT_W / ASPECT_H;
  const base = Math.max(10, 60 - SETTINGS.marginPct);
  if (ratio >= 1) { previewFrameEl.style.width = base + '%'; previewFrameEl.style.height = (base/ratio) + '%'; }
  else { previewFrameEl.style.height = base + '%'; previewFrameEl.style.width = (base*ratio) + '%'; }
}
function updatePreviewLive(){
  const tempPct = Number(marginPctEl.value)||0;
  const ratio = ASPECT_W / ASPECT_H;
  const base = Math.max(10, 60 - tempPct);
  if (ratio >= 1) { previewFrameEl.style.width = base + '%'; previewFrameEl.style.height = (base/ratio) + '%'; }
  else { previewFrameEl.style.height = base + '%'; previewFrameEl.style.width = (base*ratio) + '%'; }
}

/* ---------- Layout workarea ---------- */
function applyWorkareaLayout(){
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

  imgEl.style.objectFit = FIT_MODE;
  imgEl.style.objectPosition = `${ALIGN_H} ${ALIGN_V}`;

  updatePreview();
}
window.addEventListener('resize', applyWorkareaLayout);

/* ---------- Init ---------- */
(async function init(){
  try {
    loadSettings();
    manifest = await loadManifest(album);
    show(0);
    if ((manifest.autoPlay ?? DEFAULTS.autoPlay)) play(); else pause();

    // Pokaż HUD po każdym tapnięciu
    window.addEventListener('pointerdown', ()=>showHUD(), { passive: true });

    applyWorkareaLayout();
  } catch(err) {
    alert(err.message);
    console.error(err);
  }
})();
