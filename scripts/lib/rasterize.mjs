import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BOARD_WIDTH = 1800;
const BOARD_HEIGHT = 2400;

function has(bin) {
  const probe = process.platform === "win32" ? "where" : "which";
  return spawnSync(probe, [bin], { stdio: "ignore" }).status === 0;
}

const CHROME_CANDIDATES = [
  "chromium",
  "chromium-browser",
  "google-chrome",
  "google-chrome-stable",
  "chrome",
  "msedge",
];
const CHROME_FIXED_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

// Chrome/Chromium is the third rasterizer option: most developer machines have
// it even when librsvg/cairosvg are absent. Honors the same environment
// variables Archify's visual-check uses, so one setting serves both engines.
export function chromeBinary() {
  for (const key of ["HANSOL_CHROME", "ARCHIFY_CHROME", "CHROME_PATH"]) {
    const value = process.env[key];
    if (value && fs.existsSync(value)) return value;
  }
  for (const candidate of CHROME_CANDIDATES) if (has(candidate)) return candidate;
  for (const fixed of CHROME_FIXED_PATHS) if (fs.existsSync(fixed)) return fixed;
  return null;
}

function chromeNoSandbox() {
  if (process.env.HANSOL_CHROME_NO_SANDBOX === "1" || process.env.ARCHIFY_CHROME_NO_SANDBOX === "1") return true;
  return typeof process.getuid === "function" && process.getuid() === 0;
}

// Rasterize an SVG file to PNG using a detected system rasterizer.
// Returns { ok, tool } on success or { ok:false, reason } if none is available.
// No native npm dependency — PNG is a best-effort extra on top of SVG.
export function rasterize(svgPath, pngPath, width = BOARD_WIDTH) {
  if (has("rsvg-convert")) {
    execFileSync("rsvg-convert", ["-w", String(width), svgPath, "-o", pngPath]);
    return { ok: true, tool: "rsvg-convert" };
  }
  if (has("cairosvg")) {
    execFileSync("cairosvg", [svgPath, "-o", pngPath, "--output-width", String(width)]);
    return { ok: true, tool: "cairosvg" };
  }
  const chrome = chromeBinary();
  if (chrome) {
    const scale = Math.max(0.25, Math.min(4, width / BOARD_WIDTH));
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--disable-extensions",
      `--force-device-scale-factor=${scale}`,
      `--window-size=${BOARD_WIDTH},${BOARD_HEIGHT}`,
      `--screenshot=${path.resolve(pngPath)}`,
    ];
    if (chromeNoSandbox()) args.push("--no-sandbox");
    args.push(pathToFileURL(path.resolve(svgPath)).href);
    const result = spawnSync(chrome, args, { stdio: "ignore", timeout: 90_000 });
    if (result.status === 0 && fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
      return { ok: true, tool: `chrome (${path.basename(chrome)})` };
    }
    return { ok: false, reason: `Chrome screenshot failed (exit ${result.status ?? "signal"})` };
  }
  return { ok: false, reason: "no rasterizer (install librsvg or cairosvg, or set HANSOL_CHROME to a Chrome/Chromium binary)" };
}

export function rasterizerAvailable() {
  return Boolean(describeRasterizer());
}

export function describeRasterizer() {
  if (has("rsvg-convert")) return "rsvg-convert";
  if (has("cairosvg")) return "cairosvg";
  const chrome = chromeBinary();
  return chrome ? `chrome (${chrome})` : null;
}
