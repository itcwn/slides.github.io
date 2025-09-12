// (app.js z logiką fullscreen + HUD po dotknięciu)
const DEFAULTS = { intervalMs: 4000, autoPlay: true };
const qs = new URLSearchParams(location.search);
const album = qs.get('album') || 'event1';

const imgEl = document.getElementById('slide');
const counterEl = document.getElementById('counter');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const splashEl = document.getElementById('splash');
const hudEl = document.querySelector('.hud');
const fsPromptEl = document.getElementById('fsPrompt');
const startBtn = document.getElementById('startBtn');

let manifest = null, index = 0, timer = null, isPlaying = DEFAULTS.autoPlay, wakeLock = null;

function isFullscreen() { return document.fullscreenElement || document.webkitFullscreenElement; }
async function requestFullscreen() { const el = document.documentElement; if (el.requestFullscreen) return el.requestFullscreen(); if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen(); }
async function requestWakeLock() { try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible') { try { wakeLock = await navigator.wakeLock.request('screen'); } catch {} } }); } } catch {} }

let hudTimer = null;
function showHUD(ms=3000){ hudEl.classList.add('show'); clearTimeout(hudTimer); hudTimer=setTimeout(()=>hudEl.classList.remove('show'),ms); }

async function loadManifest(name){ const url=`albums/${encodeURIComponent(name)}/manifest.json`; const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error(`Nie można wczytać manifestu: ${name}`); const data=await res.json(); if(!Array.isArray(data.images)) throw new Error('manifest.json musi mieć tablicę "images"'); return data; }
function setCounter(i,t){ counterEl.textContent=`${i+1} / ${t}`; }
function preload(src){ const img=new Image(); img.src=src; }
function show(i){ if(!manifest) return; index=(i+manifest.images.length)%manifest.images.length; const src=`albums/${album}/${manifest.images[index]}`; imgEl.src=src; setCounter(index,manifest.images.length); const nextIdx=(index+1)%manifest.images.length; preload(`albums/${album}/${manifest.images[nextIdx]}`); }
function play(){ isPlaying=true; playPauseBtn.textContent='⏸'; clearInterval(timer); timer=setInterval(()=>show(index+1),manifest.intervalMs||DEFAULTS.intervalMs); }
function pause(){ isPlaying=false; playPauseBtn.textContent='▶'; clearInterval(timer); }

// gesty
(function(){ let x0=null; window.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true}); window.addEventListener('touchend',e=>{ if(x0==null)return; const dx=e.changedTouches[0].clientX-x0; if(Math.abs(dx)>40){ if(dx>0) show(index-1); else show(index+1); pause(); showHUD(); } x0=null; }); })();
// klawiatura
window.addEventListener('keydown',e=>{ if(e.key==='ArrowRight'){show(index+1);pause();showHUD();} else if(e.key==='ArrowLeft'){show(index-1);pause();showHUD();} else if(e.key.toLowerCase()===' '){isPlaying?pause():play();showHUD();} });
// przyciski
prevBtn.addEventListener('click',()=>{show(index-1);pause();showHUD();}); nextBtn.addEventListener('click',()=>{show(index+1);pause();showHUD();}); playPauseBtn.addEventListener('click',()=>{isPlaying?pause():play();showHUD();});

async function activatePresentation(){ try{await requestFullscreen();}catch{} await requestWakeLock(); fsPromptEl.classList.add('hidden'); showHUD(); }
startBtn.addEventListener('click',activatePresentation);
document.addEventListener('fullscreenchange',()=>{if(!isFullscreen()) fsPromptEl.classList.remove('hidden');});
document.addEventListener('webkitfullscreenchange',()=>{if(!isFullscreen()) fsPromptEl.classList.remove('hidden');});

(async function init(){ try{ manifest=await loadManifest(album); show(0); if((manifest.autoPlay??DEFAULTS.autoPlay)) play(); else pause(); let splashHidden=false; const hideSplash=()=>{ if(!splashHidden){ splashEl.classList.add('hide'); setTimeout(()=>splashEl.style.display='none',700); splashHidden=true; } }; imgEl.addEventListener('load',hideSplash,{once:true}); setTimeout(hideSplash,3000); window.addEventListener('pointerdown',()=>showHUD(),{passive:true}); }catch(err){ alert(err.message); console.error(err); } })();
