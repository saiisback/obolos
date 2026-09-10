(() => {
  const button = document.querySelector('.menu-button');
  const overlay = document.querySelector('.mobile-overlay');
  const video = document.querySelector('.bg-video');
  if (!(button instanceof HTMLButtonElement) || !(overlay instanceof HTMLElement)) return;
  const background = [...document.querySelectorAll('.logo, .hero, .facts')];
  const focusable = () => [button, ...overlay.querySelectorAll('a')];

  const close = () => {
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Open navigation');
    overlay.hidden = true;
    document.body.classList.remove('menu-open');
    background.forEach(element => { element.inert = false; });
  };
  const open = () => {
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', 'Close navigation');
    overlay.hidden = false;
    document.body.classList.add('menu-open');
    background.forEach(element => { element.inert = true; });
    overlay.querySelector('a')?.focus();
  };
  button.addEventListener('click', () => button.getAttribute('aria-expanded') === 'true' ? close() : open());
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay.hidden) { close(); button.focus(); return; }
    if (event.key !== 'Tab' || overlay.hidden) return;
    const items = focusable(); const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener('resize', () => { if (window.innerWidth > 720 && !overlay.hidden) close(); });
  if (video instanceof HTMLVideoElement) {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncVideo = () => { if (motion.matches) video.pause(); else void video.play().catch(() => {}); };
    syncVideo(); motion.addEventListener('change', syncVideo);
  }
})();
