// Ustawienia domyślne
const DEFAULTS = { intervalMs: 4000, autoPlay: true };

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

let manifest = null;
let index = 0;
let timer = null;
let isPlaying = DEFAULTS.autoPlay;
let wakeLock = null;

// --- Fullscreen ---
async function requestFullscreen() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    // iOS Safari (prefixed, *bywa* potrzebne w starych wersjach)
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch { /* ignoruj odrzucenie bez gestu */ }
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

// --- HUD: pokazuj tylko po dotknięciu na kilka sekund ---
let hudTimer = null;
function showHUD(ms = 3000) {
  hudEl.classList.add('show');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => hudEl.classList.remove('show'), ms);
}

// --- Manifest / Slajdy ---
async function loadManifest(name) {
  const url = `albums/${encodeURIComponent(name)}/manifest.json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Nie można wczytać manifestu: ${name}`);
  const data = await res.json();
  if (!Array.isArray(data.images)) throw new Error('manifest.json musi mieć tablicę "images"');
  return data;
}

function setCounter(i, total) {
  counterEl.textContent = `${i + 1} / ${total}`;
}

function preload(src) {
  const img = new Image();
  img.src = src;
}

function show(i) {
  if (!manifest) return;
  index = (i + manifest.images.length) % manifest.images.length;
  const src = `albums/${album}/${manifest.images[index]}`;
  imgEl.src = src;
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
      pause(); // manualna nawigacja pauzuje autoplay
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

// Inicjalizacja
(async function init() {
  try {
    // Spróbuj wejść w fullscreen OD RAZU (często zostanie zablokowane bez gestu – to ok)
    requestFullscreen().catch(() => {});
    // i tak poprosimy ponownie przy pierwszym dotknięciu

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

    // Na pierwsze dotknięcie: fullscreen + wake lock + HUD
    const userKick = async () => {
      await requestFullscreen();
      await requestWakeLock();
      showHUD(); // pokaż panel na moment po pierwszym tapnięciu
      window.removeEventListener('pointerdown', userKick);
      window.removeEventListener('keydown', userKick);
    };
    window.addEventListener('pointerdown', userKick);
    window.addEventListener('keydown', userKick);

    // Ukryj HUD na starcie
    hudEl.classList.remove('show');

    // Opcjonalnie: pokaż HUD przy delikatnym poruszeniu (tap anywhere)
    window.addEventListener('pointerdown', () => showHUD(), { passive: true });
  } catch (err) {
    alert(err.message);
    console.error(err);
  }
})();
