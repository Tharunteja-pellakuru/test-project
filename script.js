(() => {
  'use strict';

  const stage    = document.getElementById('stage');
  const track    = document.getElementById('track');
  const cards    = Array.from(track.querySelectorAll('.card'));
  const prevBtn  = document.getElementById('prevBtn');
  const nextBtn  = document.getElementById('nextBtn');
  const dotsWrap = document.getElementById('dots');

  const COUNT = cards.length;
  const STEP_ANGLE = 360 / COUNT;
  const AUTOPLAY_DELAY = 4200;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let active = 0;
  let radius = 360;
  let autoplayTimer = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragDeltaX = 0;

  // Depth presets keyed by |diff| from the active card. The ring itself
  // (translateZ / rotateY per card) is fixed and circular — these only
  // add emphasis (a bit of extra scale + fade + blur) on top of the
  // natural perspective falloff.
  const POSITIONS = {
    0: { op: 1,    bl: '0px', z: 50, scaleExtra: 1.05 },
    1: { op: 0.82, bl: '1px', z: 40, scaleExtra: 0.92 },
    2: { op: 0.42, bl: '2px', z: 30, scaleExtra: 0.8  },
  };
  const HIDDEN = { op: 0, bl: '3px', z: 10, scaleExtra: 0.72 };

  function shortestDiff(index, activeIndex, n) {
    let diff = index - activeIndex;
    if (diff > n / 2) diff -= n;
    if (diff < -n / 2) diff += n;
    return diff;
  }

  function computeRadius() {
    const w = stage.clientWidth;
    return Math.max(210, Math.min(w * 0.46, 480));
  }

  // Fixed circular placement — set once (and on resize). This is what
  // makes the layout a true ring instead of a flat fan.
  function layoutRing() {
    radius = computeRadius();
    cards.forEach((card) => {
      const idx = Number(card.dataset.index);
      card.style.setProperty('--card-angle', `${idx * STEP_ANGLE}deg`);
      card.style.setProperty('--radius', `${radius}px`);
    });
  }

  function render() {
    cards.forEach((card) => {
      const idx = Number(card.dataset.index);
      const diff = shortestDiff(idx, active, COUNT);
      const abs = Math.min(Math.abs(diff), 3);
      const preset = abs > 2 ? HIDDEN : POSITIONS[abs];

      card.style.setProperty('--op', preset.op);
      card.style.setProperty('--bl', preset.bl);
      card.style.setProperty('--z', preset.z);
      card.style.setProperty('--scale-extra', preset.scaleExtra);
      card.style.setProperty('--pe', abs > 2 ? 'none' : 'auto');

      const isActive = diff === 0;
      card.dataset.active = String(isActive);
      card.setAttribute('aria-hidden', String(!isActive));
      if (!isActive) card.classList.remove('is-revealed');
    });

    // Rotate the whole ring so the active card faces the camera.
    track.style.setProperty('--track-angle', `${-active * STEP_ANGLE}deg`);

    dotsWrap.querySelectorAll('.dot-btn').forEach((dot, i) => {
      dot.setAttribute('aria-current', String(i === active));
    });
  }

  function goTo(index, { restart = true } = {}) {
    active = ((index % COUNT) + COUNT) % COUNT;
    cards.forEach((c) => c.classList.remove('is-revealed'));
    render();
    if (restart) restartAutoplay();
  }

  function next() { goTo(active + 1); }
  function prev() { goTo(active - 1); }

  // ---- Dots ----
  cards.forEach((card, i) => {
    const title = card.querySelector('.card__title').textContent;
    const dot = document.createElement('button');
    dot.className = 'dot-btn';
    dot.type = 'button';
    dot.role = 'tab';
    dot.setAttribute('aria-label', `Go to entry ${i + 1}: ${title}`);
    dot.addEventListener('click', () => goTo(i));
    dotsWrap.appendChild(dot);
  });

  // ---- Buttons ----
  nextBtn.addEventListener('click', next);
  prevBtn.addEventListener('click', prev);

  // ---- Card click: front card toggles its content reveal (for touch/
  // no-hover devices), a side card brings itself to front ----
  cards.forEach((card) => {
    card.addEventListener('click', () => {
      if (card.dataset.active === 'true') {
        card.classList.toggle('is-revealed');
      } else {
        goTo(Number(card.dataset.index));
      }
    });
  });

  // ---- Keyboard ----
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
  });

  // ---- Autoplay ----
  function startAutoplay() {
    if (prefersReducedMotion) return;
    stopAutoplay();
    autoplayTimer = setInterval(next, AUTOPLAY_DELAY);
  }
  function stopAutoplay() {
    if (autoplayTimer) clearInterval(autoplayTimer);
    autoplayTimer = null;
  }
  function restartAutoplay() { startAutoplay(); }

  stage.addEventListener('pointerenter', stopAutoplay);
  stage.addEventListener('pointerleave', () => { if (!isDragging) startAutoplay(); });
  stage.addEventListener('focusin', stopAutoplay);
  stage.addEventListener('focusout', startAutoplay);

  // ---- Drag / swipe ----
  stage.addEventListener('pointerdown', (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragDeltaX = 0;
    stage.setPointerCapture(e.pointerId);
    stopAutoplay();
  });

  stage.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    dragDeltaX = e.clientX - dragStartX;
  });

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    const threshold = 50;
    if (dragDeltaX > threshold) prev();
    else if (dragDeltaX < -threshold) next();
    dragDeltaX = 0;
    startAutoplay();
  }

  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('dragstart', (e) => e.preventDefault());

  // ---- Resize: keep the ring radius proportional to the stage ----
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutRing, 120);
  });

  // ---- Init ----
  layoutRing();
  render();
  startAutoplay();
})();