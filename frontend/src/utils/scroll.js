function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function sectionScrollTop(element, hash) {
  if (!element) return 0;

  const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height || 0;
  const bounds = element.getBoundingClientRect();
  const absoluteTop = window.scrollY + bounds.top;
  const visibleHeight = Math.max(0, window.innerHeight - headerHeight);
  const centeredOffset = Math.max(0, (visibleHeight - bounds.height) / 2);
  const requestedTop = hash === "#inicio" ? absoluteTop - headerHeight : absoluteTop - headerHeight - centeredOffset;
  const maximumTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  return Math.min(Math.max(0, requestedTop), maximumTop);
}

export function closestSectionHash(sections, currentTop = window.scrollY) {
  let closestHash = sections[0]?.hash || "#inicio";
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const { hash, element } of sections) {
    const distance = Math.abs(currentTop - sectionScrollTop(element, hash));

    if (distance < closestDistance) {
      closestDistance = distance;
      closestHash = hash;
    }
  }

  return closestHash;
}

export function scrollToSection(hash, updateHistory = true) {
  const element = document.querySelector(hash);

  if (!element) return false;

  window.scrollTo({
    top: sectionScrollTop(element, hash),
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });

  if (updateHistory && window.location.hash !== hash) window.history.replaceState(null, "", hash);

  return true;
}
