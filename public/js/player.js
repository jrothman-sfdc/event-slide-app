const Player = (() => {
  let show = null;
  let currentIndex = 0;
  let isPlaying = false;
  // timer tracks the current advance countdown
  let timer = null;   // { id, durationMs, startedAt, remaining }
  let rafId = null;
  let wrapperW = 0;
  let wrapperH = 0;

  const $ = id => document.getElementById(id);
  const stage       = $('stage');
  const wrapper     = $('slide-wrapper');
  const img         = $('slide-img');
  const videoOverlay = $('video-overlay');
  const videoFrame  = $('video-frame');
  const counter     = $('slide-counter');
  const progressBar = $('progress-bar');
  const btnPlay     = $('btn-play');
  const startOverlay = $('start-overlay');

  const ICON_PLAY  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>`;
  const ICON_PAUSE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

  // ── Layout ──────────────────────────────────────────────────────────────

  function resizeStage() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let w, h;
    if (vw / vh > 16 / 9) {
      h = vh; w = Math.round(vh * 16 / 9);
    } else {
      w = vw; h = Math.round(vw * 9 / 16);
    }
    wrapper.style.width  = w + 'px';
    wrapper.style.height = h + 'px';
    wrapperW = w;
    wrapperH = h;
    if (show) repositionVideo();
  }

  function repositionVideo() {
    const slide = show.slides[currentIndex];
    if (!slide || !slide.hasVideo || !slide.video) return;
    const p = slide.video.position;
    videoOverlay.style.left   = (p.x      / 100 * wrapperW) + 'px';
    videoOverlay.style.top    = (p.y      / 100 * wrapperH) + 'px';
    videoOverlay.style.width  = (p.width  / 100 * wrapperW) + 'px';
    videoOverlay.style.height = (p.height / 100 * wrapperH) + 'px';
  }

  // ── Duration logic ───────────────────────────────────────────────────────

  function getSlideDuration(slide) {
    // If we have a Drive video and want to wait for it, use its known duration + buffer
    if (slide.waitForVideo && slide.videoDurationMs) {
      return slide.videoDurationMs + 1500;
    }
    // Explicit fixed duration from notes
    if (slide.duration) return slide.duration;
    // Fall back to show default
    return show.default_duration;
  }

  // ── Slide display ────────────────────────────────────────────────────────

  function showSlide(index) {
    clearTimer();
    currentIndex = index;
    const slide = show.slides[index];

    img.src = slide.imageUrl || '';

    if (slide.hasVideo && slide.video) {
      const fid = slide.video.fileId;
      // Setting src triggers the iframe to load & autoplay (with allow="autoplay")
      videoFrame.src = `https://drive.google.com/file/d/${encodeURIComponent(fid)}/preview`;
      videoOverlay.style.display = 'block';
      repositionVideo();
    } else {
      videoOverlay.style.display = 'none';
      // Clear src so the previous video stops playing audio
      videoFrame.src = '';
    }

    counter.textContent = `${index + 1} / ${show.slides.length}`;

    if (isPlaying) startTimer(getSlideDuration(slide));
    updatePlayBtn();

    // Preload next slide image
    const next = show.slides[index + 1];
    if (next && next.imageUrl) {
      const preload = new Image();
      preload.src = next.imageUrl;
    }
  }

  // ── Timer ────────────────────────────────────────────────────────────────

  function startTimer(durationMs) {
    clearTimer();
    const startedAt = performance.now();
    const id = setTimeout(() => {
      // Loop back to start when last slide finishes
      const nextIdx = currentIndex < show.slides.length - 1 ? currentIndex + 1 : 0;
      showSlide(nextIdx);
    }, durationMs);
    timer = { id, durationMs, startedAt, remaining: durationMs };
    animateProgress();
  }

  function clearTimer() {
    if (timer)  { clearTimeout(timer.id); timer = null; }
    if (rafId)  { cancelAnimationFrame(rafId); rafId = null; }
    progressBar.style.width = '0%';
  }

  function animateProgress() {
    if (!timer) return;
    const elapsed = performance.now() - timer.startedAt;
    progressBar.style.width = Math.min((elapsed / timer.durationMs) * 100, 100) + '%';
    rafId = requestAnimationFrame(animateProgress);
  }

  // ── Controls ─────────────────────────────────────────────────────────────

  function updatePlayBtn() {
    btnPlay.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
    btnPlay.title     = isPlaying ? 'Pause' : 'Play';
  }

  function togglePlay() {
    if (isPlaying) {
      // Pause: snapshot remaining time
      if (timer) {
        const elapsed = performance.now() - timer.startedAt;
        timer.remaining = Math.max(500, timer.durationMs - elapsed);
        clearTimeout(timer.id);
      }
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      isPlaying = false;
    } else {
      isPlaying = true;
      const remaining = timer ? timer.remaining : getSlideDuration(show.slides[currentIndex]);
      startTimer(remaining);
    }
    updatePlayBtn();
  }

  function prev() {
    const idx = currentIndex > 0 ? currentIndex - 1 : 0;
    showSlide(idx);
  }

  function next() {
    const idx = currentIndex < show.slides.length - 1 ? currentIndex + 1 : 0;
    showSlide(idx);
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  function showError(msg) {
    startOverlay.style.display = 'none';
    $('error-msg').textContent = msg;
    $('error-state').classList.add('visible');
  }

  async function init() {
    const match = location.pathname.match(/\/show\/([^/]+)/);
    if (!match) { showError('No show ID in URL.'); return; }
    const slug = match[1];

    try {
      const res = await fetch(`/api/shows/${slug}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showError(d.error || `HTTP ${res.status}`);
        return;
      }
      show = await res.json();
    } catch (e) {
      showError(`Network error: ${e.message}`);
      return;
    }

    if (!show.slides || !show.slides.length) {
      showError('This presentation has no slides.');
      return;
    }

    document.title = show.title;
    $('show-title').textContent = show.title;

    resizeStage();
    window.addEventListener('resize', resizeStage);

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (startOverlay.style.display !== 'none') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev(); }
      else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    });

    $('start-btn').addEventListener('click', () => {
      startOverlay.style.display = 'none';
      isPlaying = true;
      showSlide(0);
    });
  }

  init();

  // Expose public API for inline onclick handlers
  return { prev, next, togglePlay };
})();
