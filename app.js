// Ustawienia domyślne
const DEFAULTS = { intervalMs: 4000, autoPlay: true };
const qs = new URLSearchParams(location.search);
const album = qs.get('album') || 'event1';
const imgEl = document.getElementById('slide');
const counterEl = document.getElementById('counter');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const splashEl = document.getElementById('splash');
let manifest = null; let index = 0; let timer = null; let isPlaying = DEFAULTS.autoPlay; let wakeLock = null;
async function loadManifest(name) {
  const url = `albums/${encodeURIComponent(name)}/manifest.json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Nie można wczytać manifestu: ${name}`);
  const data = await res.json();
  if (!Array.isArray(data.images)) throw new Error('manifest.json musi mieć tablicę "images"');
  return data;
}
function setCounter(i, total) { counterEl.textContent = `${i + 1} / ${total}`; }
function preload(src) { const img = new Image(); img.src = src; }
function show(i) {
  if (!manifest) return;
  index = (i + manifest.images.length) % manifest.images.length;
  const src = `albums/${album}/${manifest.images[index]}`;
  imgEl.src = src;
  setCounter(index, manifest.images.length);
  const nextIdx = (index + 1) % manifest.images.length;
  preload(`albums/${album}/${manifest.images[nextIdx]}`);
}
function play() { isPlaying = true; playPauseBtn.textContent = '⏸'; clearInterval(timer); timer = setInterval(() => show(index + 1), manifest.intervalMs || DEFAULTS.intervalMs); }
function pause() { isPlaying = false; playPauseBtn.textContent = '▶'; clearInterval(timer); }
async function requestWakeLock() { try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => {}); document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && !wakeLock) { try { wakeLock = await navigator.wakeLock.request('screen'); } catch {} } }); } } catch {} }
function requestFullscreenOnUserGesture() { const el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); }
(function attachSwipe() { let x0 = null; window.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true }); window.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { if (dx > 0) show(index - 1); else show(index + 1); pause(); } x0 = null; }); })();
window.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { show(index + 1); pause(); } else if (e.key === 'ArrowLeft') { show(index - 1); pause(); } else if (e.key.toLowerCase() === ' ') { isPlaying ? pause() : play(); } });
prevBtn.addEventListener('click', () => { show(index - 1); pause(); });
nextBtn.addEventListener('click', () => { show(index + 1); pause(); });
playPauseBtn.addEventListener('click', () => { isPlaying ? pause() : play(); });
(async function init() {
  try {
    manifest = await loadManifest(album);
    show(0);
    if ((manifest.autoPlay ?? DEFAULTS.autoPlay)) play(); else pause();
    let splashHidden = false;
    const hideSplash = () => { if (!splashHidden) { splashEl.classList.add('hide'); setTimeout(() => (splashEl.style.display = 'none'), 700); splashHidden = true; } };
    imgEl.addEventListener('load', hideSplash, { once: true });
    setTimeout(hideSplash, 3000);
    const userKick = async () => { requestFullscreenOnUserGesture(); await requestWakeLock(); window.removeEventListener('pointerdown', userKick); window.removeEventListener('keydown', userKick); };
    window.addEventListener('pointerdown', userKick);
    window.addEventListener('keydown', userKick);
  } catch (err) { alert(err.message); console.error(err); }
})();