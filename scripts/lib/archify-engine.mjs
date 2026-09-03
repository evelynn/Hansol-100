// Thin, dependency-free driver for the vendored Archify engine
// (engines/archify). Every Archify capability stays available through the
// upstream CLI; this module only adds what the merged product needs:
// programmatic render/validate/deliver with structured diagnostics, so the
// web service and the unified CLI can treat Archify documents like boards.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ARCHIFY_TYPES } from "./detect.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAX_BUFFER = 64 * 1024 * 1024;

// Engine resolution order — the vendored copy is the default, but Hansol-100
// never *requires* it: an Archify installed on its own (as a Skill, or a
// repository checkout) works just as well, and without any Archify the
// product runs in board-only mode.
//   1. HANSOL_ARCHIFY_ROOT (explicit; points at a clean package or at the
//      `archify/` directory of a repository checkout)
//   2. engines/archify (vendored, tested with this release)
//   3. a discovered stand-alone install: ~/.claude/skills/archify,
//      ~/.agents/skills/archify, ~/.config/opencode/skills/archify,
//      or a sibling checkout ../archify/archify
export function archifyCandidates() {
  const home = os.homedir();
  return [
    { source: "env", root: process.env.HANSOL_ARCHIFY_ROOT ? path.resolve(process.env.HANSOL_ARCHIFY_ROOT) : null },
    { source: "vendored", root: path.join(repoRoot, "engines", "archify") },
    { source: "discovered", root: path.join(home, ".claude", "skills", "archify") },
    { source: "discovered", root: path.join(home, ".agents", "skills", "archify") },
    { source: "discovered", root: path.join(home, ".config", "opencode", "skills", "archify") },
    { source: "discovered", root: path.join(repoRoot, "..", "archify", "archify") },
  ].filter((c) => c.root);
}

function hasCli(root) {
  return fs.existsSync(path.join(root, "bin", "archify.mjs"));
}

export function archifyResolution() {
  const candidates = archifyCandidates();
  if (candidates[0].source === "env") {
    // An explicit root is authoritative: never fall through silently.
    return { ...candidates[0], available: hasCli(candidates[0].root) };
  }
  for (const candidate of candidates) if (hasCli(candidate.root)) return { ...candidate, available: true };
  return { ...candidates[0], available: false };
}

export function archifyRoot() {
  return archifyResolution().root;
}

export function archifyCli() {
  return path.join(archifyRoot(), "bin", "archify.mjs");
}

export function archifyAvailable() {
  return archifyResolution().available;
}

export function archifyInfo() {
  const resolution = archifyResolution();
  const root = resolution.root;
  const info = { available: resolution.available, source: resolution.source, root, version: null, vendor: null };
  if (!info.available) return info;
  try {
    info.version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version ?? null;
  } catch {
    info.version = null;
  }
  try {
    info.vendor = JSON.parse(fs.readFileSync(path.join(root, "VENDOR.json"), "utf8"));
  } catch {
    info.vendor = null;
  }
  return info;
}

function baseEnv(extra = {}) {
  return {
    ...process.env,
    // The service and CLI never want the engine to reach the network.
    ARCHIFY_UPDATE_CHECK_DISABLED: "1",
    ...extra,
  };
}

// Run the upstream CLI verbatim. Returns spawnSync's result (status, stdout,
// stderr) with UTF-8 strings; never throws for a non-zero exit.
export function runArchify(args, { cwd, env = {}, timeout = 120_000, stdio = "pipe" } = {}) {
  if (!archifyAvailable()) {
    return { status: 127, stdout: "", stderr: `Archify engine not found at ${archifyRoot()}`, error: null };
  }
  const result = spawnSync(process.execPath, [archifyCli(), ...args], {
    cwd: cwd || process.cwd(),
    encoding: "utf8",
    env: baseEnv(env),
    timeout,
    maxBuffer: MAX_BUFFER,
    stdio,
  });
  return {
    status: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null,
  };
}

function withTempDir(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function typeOf(doc) {
  const type = doc?.diagram_type;
  if (!ARCHIFY_TYPES.includes(type)) {
    throw new Error(`not an Archify document (diagram_type must be one of ${ARCHIFY_TYPES.join(", ")})`);
  }
  return type;
}

// Parse the renderer's fail-closed JSON diagnostic boundary. Falls back to a
// single unclassified diagnostic carrying the raw stderr tail.
export function parseRendererFailure(stderr, status) {
  const trimmed = String(stderr || "").trim();
  const lastLine = trimmed.split("\n").filter(Boolean).at(-1) || "";
  for (const candidate of [trimmed, lastLine]) {
    try {
      const payload = JSON.parse(candidate);
      if (payload && payload.ok === false && Array.isArray(payload.diagnostics)) {
        return { error: payload.error || payload.diagnostics[0]?.message || "Renderer failed.", diagnostics: payload.diagnostics };
      }
    } catch {
      // not JSON; try the next candidate
    }
  }
  return {
    error: "Renderer failed before emitting a structured diagnostic.",
    diagnostics: [
      {
        code: "internal/unclassified",
        severity: "error",
        message: trimmed.slice(-2000) || `Renderer exited with status ${status}.`,
        subject: {},
        evidence: { exitCode: status },
        supportedFixes: [],
      },
    ],
  };
}

// Render one Archify document to a self-contained HTML string. Uses the typed
// renderer directly (the same entry the upstream CLI's validate/deliver use)
// so failures arrive as structured diagnostics instead of a stack trace.
export function renderArchifyHtml(doc, { quality } = {}) {
  const type = typeOf(doc);
  if (!archifyAvailable()) {
    return { ok: false, type, error: `Archify engine not found at ${archifyRoot()}`, diagnostics: [] };
  }
  const renderer = path.join(archifyRoot(), "renderers", type, `render-${type}.mjs`);
  return withTempDir("hansol-archify-render-", (dir) => {
    const input = path.join(dir, `${type}.json`);
    const output = path.join(dir, `${type}.html`);
    fs.writeFileSync(input, JSON.stringify(doc));
    const result = spawnSync(process.execPath, [renderer, input, output], {
      cwd: dir,
      encoding: "utf8",
      env: baseEnv({
        ARCHIFY_DIAGNOSTIC_FORMAT: "json",
        ...(quality ? { ARCHIFY_QUALITY_PROFILE: quality } : {}),
      }),
      timeout: 120_000,
      maxBuffer: MAX_BUFFER,
    });
    if (result.status !== 0 || !fs.existsSync(output)) {
      const failure = parseRendererFailure(result.stderr, result.status);
      return { ok: false, type, ...failure };
    }
    return { ok: true, type, html: fs.readFileSync(output, "utf8") };
  });
}

// Full upstream validation (render + 9 artifact checks). Returns the parsed
// `validate --json` receipt with an `ok` flag; never throws on diagnostics.
export function validateArchify(doc, { quality } = {}) {
  const type = typeOf(doc);
  return withTempDir("hansol-archify-validate-", (dir) => {
    const input = path.join(dir, `${type}.json`);
    fs.writeFileSync(input, JSON.stringify(doc));
    const args = ["validate", type, input, "--json"];
    if (quality) args.push("--quality", quality);
    const result = runArchify(args, { cwd: dir });
    try {
      const receipt = JSON.parse(result.stdout);
      return { ...receipt, ok: receipt.ok === true && result.status === 0, type, exitCode: result.status };
    } catch {
      const failure = parseRendererFailure(result.stderr || result.stdout, result.status);
      return { ok: false, type, exitCode: result.status, ...failure };
    }
  });
}

// Atomic delivery through the upstream CLI (`deliver --json`). Paths are the
// caller's; the receipt is returned parsed. Exit status is preserved.
export function deliverArchify(inputPath, outputPath, { quality, cwd } = {}) {
  const doc = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const type = typeOf(doc);
  const args = ["deliver", type, path.resolve(inputPath), path.resolve(outputPath), "--json"];
  if (quality) args.push("--quality", quality);
  const result = runArchify(args, { cwd });
  let receipt;
  try {
    receipt = JSON.parse(result.stdout);
  } catch {
    receipt = { ok: false, ...parseRendererFailure(result.stderr || result.stdout, result.status) };
  }
  return { ...receipt, ok: receipt.ok === true && result.status === 0, type, exitCode: result.status };
}

// Starter documents for the service and `hansol100 library` — one per type,
// taken from the engine's own examples so they always match the vendored
// schema version.
export const ARCHIFY_TEMPLATE_FILES = {
  architecture: "web-app.architecture.json",
  workflow: "agent-tool-call.workflow.json",
  sequence: "cache-miss-request.sequence.json",
  dataflow: "product-analytics.dataflow.json",
  lifecycle: "agent-run.lifecycle.json",
};

export function readArchifyTemplate(kind) {
  const file = ARCHIFY_TEMPLATE_FILES[kind];
  if (!file) return null;
  const full = path.join(archifyRoot(), "examples", file);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8"));
}
