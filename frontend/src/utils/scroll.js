function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function scrollToSection(hash, updateHistory = true) {
  const element = document.querySelector(hash);

  if (!element) return false;

  const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height || 0;
  const bounds = element.getBoundingClientRect();
  const absoluteTop = window.scrollY + bounds.top;
  const visibleHeight = Math.max(0, window.innerHeight - headerHeight);
  const targetTop = hash === "#inicio"
    ? absoluteTop - headerHeight
    : absoluteTop - headerHeight - Math.max(0, (visibleHeight - bounds.height) / 2);

  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });

  if (updateHistory && window.location.hash !== hash) window.history.replaceState(null, "", hash);

  return true;
}
