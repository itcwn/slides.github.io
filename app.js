document.addEventListener("DOMContentLoaded", () => {
  console.log("Slideshow app init");

  const qs = new URLSearchParams(window.location.search);
  let clientParam = qs.get("client");
  let showParam = qs.get("show");

  // pad do 6 cyfr
  let clientId = clientParam ? clientParam.padStart(6, "0") : null;
  let showId = showParam ? showParam.padStart(6, "0") : null;

  // folder bazowy
  let basePath = clientId && showId
    ? `albums/${clientId}/${showId}/`
    : null;

  // DOM refs
  const stageEl = document.getElementById("stage");
  const splashEl = document.getElementById("splash");
  const fullscreenPromptEl = document.getElementById("fullscreenPrompt");
  const hudEl = document.getElementById("hud");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const closeSettingsBtn = document.getElementById("closeSettings");
  const marginRange = document.getElementById("marginRange");
  const intervalInput = document.getElementById("intervalInput");
  const sortSelect = document.getElementById("sortSelect");
  const sortDirSelect = document.getElementById("sortDirSelect");
  const audioBtn = document.getElementById("audioBtn");
  const catalogBtn = document.getElementById("catalogBtn");
  const catalogModal = document.getElementById("catalogModal");
  const closeCatalogBtn = document.getElementById("closeCatalog");
  const catalogList = document.getElementById("catalogList");

  let slides = [];
  let currentIndex = 0;
  let autoplayInterval = null;
  let autoplayDelay = 5000;
  let wakeLock = null;
  let audioEl = null;

  // ------------------------
  // FULLSCREEN + WAKE LOCK
  // ------------------------
  function enterFullscreen() {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
    requestWakeLock();
  }

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch (err) {
      console.warn("Wake lock failed:", err);
    }
  }

  // ------------------------
  // SLIDESHOW
  // ------------------------
  function showSlide(idx) {
    if (slides.length === 0) return;
    currentIndex = (idx + slides.length) % slides.length;
    stageEl.innerHTML = "";
    const img = document.createElement("img");
    img.src = slides[currentIndex].src;
    stageEl.appendChild(img);
  }

  function nextSlide() {
    showSlide(currentIndex + 1);
  }

  function prevSlide() {
    showSlide(currentIndex - 1);
  }

  function startAutoplay() {
    stopAutoplay();
    autoplayInterval = setInterval(nextSlide, autoplayDelay);
  }

  function stopAutoplay() {
    if (autoplayInterval) clearInterval(autoplayInterval);
    autoplayInterval = null;
  }

  // ------------------------
  // SETTINGS
  // ------------------------
  function loadSettings() {
    const s = JSON.parse(localStorage.getItem("slideshowSettings") || "{}");
    marginRange.value = s.margin || 5;
    intervalInput.value = s.interval || 5;
    sortSelect.value = s.sort || "name";
    sortDirSelect.value = s.sortDir || "asc";
    applySettings();
  }

  function applySettings() {
    const s = {
      margin: parseInt(marginRange.value, 10),
      interval: parseInt(intervalInput.value, 10),
      sort: sortSelect.value,
      sortDir: sortDirSelect.value
    };
    localStorage.setItem("slideshowSettings", JSON.stringify(s));
    document.body.style.setProperty("--workarea-margin", s.margin + "%");
    autoplayDelay = s.interval * 1000;
    if (autoplayInterval) startAutoplay();
    sortSlides(s.sort, s.sortDir);
    showSlide(currentIndex);
  }

  // ------------------------
  // SORTING
  // ------------------------
  function sortSlides(type, dir) {
    if (slides.length === 0) return;
    slides.sort((a, b) => {
      let cmp = 0;
      if (type === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (type === "date") {
        cmp = (a.date || 0) - (b.date || 0);
      } else if (type === "random") {
        cmp = Math.random() - 0.5;
      }
      return dir === "asc" ? cmp : -cmp;
    });
  }

  // ------------------------
  // LOAD IMAGES & AUDIO
  // ------------------------
  async function loadSlides() {
    if (!basePath) return;
    try {
      const res = await fetch(basePath + "manifest.json?" + Date.now());
      if (res.ok) {
        const data = await res.json();
        slides = data.map(name => ({
          src: basePath + name + "?" + Date.now(),
          name
        }));
      }
    } catch (e) {
      console.warn("manifest.json missing, fallback scan...");
      slides = [
        { src: basePath + "01.jpg", name: "01.jpg" },
        { src: basePath + "02.jpg", name: "02.jpg" }
      ];
    }
    showSlide(0);
  }

  async function loadAudio() {
    if (!basePath) return;
    const candidates = ["audio.mp3", "music.mp3", "bg.mp3"];
    for (let file of candidates) {
      try {
        const res = await fetch(basePath + file);
        if (res.ok) {
          audioEl = new Audio(basePath + file + "?" + Date.now());
          audioEl.loop = true;
          return;
        }
      } catch (e) {}
    }
  }

  // ------------------------
  // CATALOG
  // ------------------------
  async function loadCatalog() {
    try {
      const res = await fetch("albums/index.json?" + Date.now());
      if (!res.ok) return;
      const data = await res.json();
      catalogList.innerHTML = "";
      data.clients.forEach(c => {
        const div = document.createElement("div");
        div.className = "client";
        div.innerHTML = `<h3>${c.name} (${c.id})</h3>`;
        const ul = document.createElement("ul");
        c.shows.forEach(s => {
          const a = document.createElement("a");
          a.textContent = "Show " + s;
          a.href = `?client=${c.id}&show=${s}`;
          const li = document.createElement("li");
          li.appendChild(a);
          ul.appendChild(li);
        });
        div.appendChild(ul);
        catalogList.appendChild(div);
      });
    } catch (e) {
      console.warn("Catalog load error", e);
    }
  }

  // ------------------------
  // INIT
  // ------------------------
  async function init() {
    loadSettings();
    await loadSlides();
    await loadAudio();
    loadCatalog();
  }

  // ------------------------
  // EVENT LISTENERS
  // ------------------------
  document.getElementById("nextBtn").addEventListener("click", nextSlide);
  document.getElementById("prevBtn").addEventListener("click", prevSlide);
  document.getElementById("playBtn").addEventListener("click", startAutoplay);
  document.getElementById("pauseBtn").addEventListener("click", stopAutoplay);

  settingsBtn.addEventListener("click", () => settingsModal.style.display = "block");
  closeSettingsBtn.addEventListener("click", () => settingsModal.style.display = "none");
  marginRange.addEventListener("input", applySettings);
  intervalInput.addEventListener("input", applySettings);
  sortSelect.addEventListener("change", applySettings);
  sortDirSelect.addEventListener("change", applySettings);

  audioBtn.addEventListener("click", () => {
    if (!audioEl) return;
    if (audioEl.paused) {
      audioEl.play();
      audioBtn.textContent = "🔇";
    } else {
      audioEl.pause();
      audioBtn.textContent = "🎵";
    }
  });

  catalogBtn.addEventListener("click", () => catalogModal.style.display = "block");
  closeCatalogBtn.addEventListener("click", () => catalogModal.style.display = "none");

  document.getElementById("fullscreenBtn").addEventListener("click", () => {
    fullscreenPromptEl.style.display = "none";
    enterFullscreen();
  });

  init();
});
