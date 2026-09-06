import { t, getLang } from "./i18n.js";

// Tiny DOM builder: h("div.card", { onclick }, "text", childEl, [more]). Strings
// become text nodes, so user-provided content is never parsed as HTML.
export function h(tag, attrs, ...children) {
  if (attrs && (attrs instanceof Node || typeof attrs !== "object" || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className += (el.className ? " " : "") + value;
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key in el && key !== "list" && typeof value !== "object" && (key === "value" || key === "checked" || key === "selected" || key === "disabled" || key === "hidden" || key === "textContent")) el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function toast(message, type = "info", ms = 3200) {
  const host = document.getElementById("toasts");
  const el = h("div.toast", { class: type }, message);
  host.append(el);
  setTimeout(() => el.remove(), ms);
}

export function toastError(err) {
  const message = err?.message || String(err);
  toast(t("toast.error", { message }), "error", 5000);
}

export function debounce(fn, wait = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = (then - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(getLang() === "ko" ? "ko" : "en", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString();
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export const ARCHIFY_TYPES = ["architecture", "workflow", "sequence", "dataflow", "lifecycle"];

// Mirrors scripts/lib/detect.mjs so the editor can route before the server is asked.
export function detect(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  if (typeof doc.diagram_type === "string" && ARCHIFY_TYPES.includes(doc.diagram_type)) return { engine: "archify", kind: doc.diagram_type };
  if (Array.isArray(doc.lanes) && Array.isArray(doc.stages) && Array.isArray(doc.nodes) && Array.isArray(doc.edges) && typeof doc.title === "string") return { engine: "board", kind: "board" };
  return null;
}

export function slugify(text, fallback = "diagram") {
  const slug = String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return /^[a-z0-9가-힣][a-z0-9가-힣._-]{0,79}$/.test(slug) ? slug : fallback;
}

export function isValidId(id) {
  return /^[a-z0-9가-힣][a-z0-9가-힣._-]{0,79}$/.test(id || "") && !String(id).includes("..");
}

export function download(content, filename, type = "application/octet-stream") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Rasterize an SVG string in the browser (no server-side dependency). The board
// SVG is self-contained (system fonts, no external assets) so the canvas stays
// untainted and toBlob works.
export function svgToPngBlob(svgText, scale = 1) {
  return new Promise((resolve, reject) => {
    const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const root = parsed.documentElement;
    const width = Number(root.getAttribute("width")) || 1800;
    const height = Number(root.getAttribute("height")) || 2400;
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("PNG encoding failed"))), "image/png");
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG could not be decoded for PNG export"));
    };
    img.src = url;
  });
}

export function encodeId(id) {
  return encodeURIComponent(id);
}

// Small dropdown menu: dropdown("Export ▾", [{ label, onclick, hint }]).
export function dropdown(label, items, { className = "btn" } = {}) {
  const list = h("div.menu-list", { role: "menu", hidden: true });
  const button = h("button", { type: "button", class: className, "aria-haspopup": "true", "aria-expanded": "false" }, label);
  const root = h("div.menu", button, list);
  const close = () => {
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocumentClick, true);
  };
  const onDocumentClick = (event) => {
    if (!root.contains(event.target)) close();
  };
  button.addEventListener("click", () => {
    if (list.hidden) {
      list.hidden = false;
      button.setAttribute("aria-expanded", "true");
      setTimeout(() => document.addEventListener("click", onDocumentClick, true), 0);
    } else close();
  });
  for (const item of items) {
    if (item.group) {
      list.append(h("div.menu-group", item.group));
      continue;
    }
    const entry = h("a", { href: item.href || "#", role: "menuitem" }, item.label, item.hint ? h("small", item.hint) : null);
    entry.addEventListener("click", (event) => {
      if (!item.href) event.preventDefault();
      close();
      item.onclick?.(event);
    });
    list.append(entry);
  }
  return root;
}
