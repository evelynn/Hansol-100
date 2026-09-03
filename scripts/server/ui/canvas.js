import { h, clear } from "./util.js";
import { t } from "./i18n.js";

// A scrollable sheet that shows one board SVG (or an <img>) at a chosen zoom.
// Zoom changes the sheet width; the browser handles scrolling and layout, so
// there is no transform math and text stays crisp.
export function createCanvas() {
  const sheet = h("div.sheet");
  const el = h("div.canvas", sheet);
  let mode = "width";
  let aspect = 2400 / 1800;
  let percent = 100;
  const listeners = new Set();

  function intrinsicWidth() {
    const svg = sheet.querySelector("svg");
    if (!svg) return 1800;
    const viewBox = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    if (viewBox.length === 4 && viewBox[2] > 0) return viewBox[2];
    return Number(svg.getAttribute("width")) || 1800;
  }

  function readAspect() {
    const svg = sheet.querySelector("svg");
    if (!svg) return;
    const viewBox = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) aspect = viewBox[3] / viewBox[2];
  }

  function apply() {
    const available = el.clientWidth - 32;
    const availableHeight = el.clientHeight - 32;
    let width;
    if (mode === "width") width = available;
    else if (mode === "page") width = Math.min(available, availableHeight / aspect);
    else if (mode === "actual") width = intrinsicWidth();
    else width = available * (percent / 100);
    width = Math.max(120, Math.round(width));
    sheet.style.width = `${width}px`;
    percent = Math.round((width / Math.max(1, available)) * 100);
    for (const fn of listeners) fn(percent, mode);
  }

  const observer = new ResizeObserver(() => apply());
  observer.observe(el);

  return {
    el,
    sheet,
    setSvg(svgText) {
      sheet.innerHTML = svgText; // renderer output; escaped server-side, no scripts (CSP also blocks them)
      readAspect();
      apply();
    },
    setImage(url) {
      clear(sheet);
      sheet.append(h("img", { src: url, alt: "" }));
      apply();
    },
    clear() {
      clear(sheet);
    },
    setStale(flag) {
      el.classList.toggle("stale", Boolean(flag));
    },
    zoom(next) {
      if (next === "in" || next === "out") {
        const base = mode === "custom" ? percent : percent;
        mode = "custom";
        percent = Math.min(400, Math.max(20, Math.round(base * (next === "in" ? 1.25 : 0.8))));
      } else {
        mode = next;
      }
      apply();
    },
    onZoom(fn) {
      listeners.add(fn);
      fn(percent, mode);
    },
    svgText() {
      const svg = sheet.querySelector("svg");
      return svg ? svg.outerHTML : null;
    },
    destroy() {
      observer.disconnect();
    },
  };
}

export function zoomBar(canvas) {
  const label = h("span.zoom-label", "100%");
  const bar = h(
    "span.toolbar",
    h("button.btn.small", { type: "button", onclick: () => canvas.zoom("width") }, t("zoom.fitWidth")),
    h("button.btn.small", { type: "button", onclick: () => canvas.zoom("page") }, t("zoom.fitPage")),
    h("button.btn.small", { type: "button", onclick: () => canvas.zoom("actual") }, t("zoom.actual")),
    h("button.btn.small", { type: "button", "aria-label": "zoom out", onclick: () => canvas.zoom("out") }, "−"),
    label,
    h("button.btn.small", { type: "button", "aria-label": "zoom in", onclick: () => canvas.zoom("in") }, "+"),
  );
  canvas.onZoom((percent) => {
    label.textContent = `${percent}%`;
  });
  return bar;
}
