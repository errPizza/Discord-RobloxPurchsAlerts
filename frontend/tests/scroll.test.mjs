import assert from "node:assert/strict";
import test from "node:test";

import { closestSectionHash, sectionScrollTop } from "../src/utils/scroll.js";

const absoluteSection = (top, height) => ({
  getBoundingClientRect: () => ({ top: top - window.scrollY, height }),
});

test("el scroll y el navbar comparten posiciones estables incluso con anchors anidados", () => {
  globalThis.window = { scrollY: 0, innerHeight: 1000 };
  globalThis.document = {
    documentElement: { scrollHeight: 4000 },
    querySelector: () => ({ getBoundingClientRect: () => ({ height: 100 }) }),
  };

  const sections = [
    { hash: "#inicio", element: absoluteSection(0, 800) },
    { hash: "#logros", element: absoluteSection(650, 100) },
    { hash: "#nosotros", element: absoluteSection(850, 500) },
    { hash: "#equipo", element: absoluteSection(2500, 800) },
    { hash: "#contacto", element: absoluteSection(2700, 500) },
  ];

  assert.equal(sectionScrollTop(sections[0].element, "#inicio"), 0);
  assert.equal(sectionScrollTop(sections[1].element, "#logros"), 150);
  assert.equal(closestSectionHash(sections, 0), "#inicio");
  assert.equal(closestSectionHash(sections, 150), "#logros");
  assert.equal(closestSectionHash(sections, 550), "#nosotros");
  assert.equal(closestSectionHash(sections, 2350), "#equipo");
  assert.equal(closestSectionHash(sections, 2400), "#contacto");

  const nearBottom = absoluteSection(3800, 100);

  assert.equal(sectionScrollTop(nearBottom, "#contacto"), 3000);
});
