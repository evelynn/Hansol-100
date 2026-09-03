#!/usr/bin/env node
// hansol100 — unified CLI for the Hansol-100 all-in-one diagram studio.
//
// One entry point drives both engines and the service:
//   board    korea100studio swimlane process boards (board-v1 → SVG/PNG/motion)
//   archify  Archify typed diagrams (architecture/workflow/sequence/dataflow/lifecycle → HTML)
//   library  the shared JSON store the web service browses, searches and edits
//   serve    the web service itself
//
// `render` / `validate` / `audit` detect the engine from the JSON, so agents
// and people can use one verb regardless of diagram kind. `board …` and
// `archify …` pass through to the underlying CLIs unchanged.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectDocument, summarizeDocument, KIND_LABELS, ARCHIFY_TYPES } from "../scripts/lib/detect.mjs";
import { Library, LibraryError } from "../scripts/lib/library.mjs";
import { archifyInfo, archifyCli, deliverArchify, validateArchify, runArchify } from "../scripts/lib/archify-engine.mjs";
import { renderBoardSvg } from "../scripts/lib/render-svg.mjs";
import { buildMotionSvg } from "../scripts/lib/motion.mjs";
import { rasterize, describeRasterizer } from "../scripts/lib/rasterize.mjs";
import { VALIDATOR } from "../scripts/lib/validate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOARD_CLI = path.join(repoRoot, "scripts", "board.mjs");
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

const USAGE = `hansol100 ${pkg.version} — process boards + Archify diagrams, as a Skill and as a service

Usage: hansol100 <command> [arguments] [options]

Any diagram (engine detected from the JSON):
  render <file.json> [--out path] [--png] [--profile p] [--quality standard|showcase] [--json]
  validate <file.json> [--strict] [--json] [--quality q]
  audit <file.json> [--json]
  detect <file.json> [--json]

Engines (verbatim pass-through):
  board <render|audit|validate|motion|check> …      korea100studio board CLI (scripts/board.mjs)
  archify <render|validate|deliver|guide|…> …        Archify CLI (engines/archify/bin/archify.mjs)

Library (the service's content store; default ./library, or --library DIR / HANSOL_LIBRARY):
  library list [--kind k] [--json]
  library search <query…> [--json]
  library add <file.json> [--id id] [--force] [--json]
  library show <id>
  library remove <id>
  library export <id> [--out dir] [--png]
  library path

Service:
  serve [--port 4100] [--host 127.0.0.1] [--library DIR] [--open]

Environment:
  doctor
  --version, --help
`;

// --- tiny arg parser --------------------------------------------------------
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        continue;
      }
      const key = arg.slice(2);
      const next = argv[i + 1];
      const boolean = ["png", "json", "strict", "force", "open", "no-open", "help"];
      if (!boolean.includes(key) && next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function fail(message, code = 1) {
  console.error(`error: ${message}`);
  process.exit(code);
}

function readJson(file) {
  if (!file) fail("no JSON file given", 2);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    fail(`cannot read ${file}: ${err.message}`, 2);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`${file} is not valid JSON: ${err.message}`, 2);
  }
  return null;
}

function detectOrFail(doc, file) {
  const detected = detectDocument(doc);
  if (!detected) {
    fail(
      `${file} is neither a board-v1 board (title/lanes/stages/nodes/edges) nor an Archify diagram (diagram_type: ${ARCHIFY_TYPES.join("|")})`,
      2,
    );
  }
  return detected;
}

function libraryDir(flags) {
  return path.resolve(flags.library || process.env.HANSOL_LIBRARY || path.join(repoRoot, "library"));
}

function stem(file) {
  return path.basename(file, path.extname(file));
}

function passthrough(cli, args, cwd = process.cwd()) {
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: "inherit", cwd });
  if (result.error) fail(result.error.message);
  process.exit(result.status ?? 1);
}

// --- board helpers (shared by render/validate/export) --------------------------
async function boardValidation(doc, profile) {
  const { validateBoardDocument } = await import("../scripts/server/server.mjs");
  return validateBoardDocument(doc, { profile });
}

function writePng(svgPath, flags) {
  if (!flags.png) return null;
  const pngPath = svgPath.replace(/\.svg$/, ".png");
  const result = rasterize(svgPath, pngPath);
  if (!result.ok) {
    console.error(`Warning: PNG skipped — ${result.reason}`);
    return null;
  }
  return pngPath;
}

// --- commands ----------------------------------------------------------------

function cmdDetect(argv) {
  const { positional, flags } = parseArgs(argv);
  const file = positional[0];
  const doc = readJson(file);
  const detected = detectOrFail(doc, file);
  const summary = summarizeDocument(doc, detected);
  if (flags.json) {
    const { text, ...rest } = summary;
    console.log(JSON.stringify({ file, ...rest }, null, 2));
    return;
  }
  console.log(`${detected.engine}\t${detected.kind}\t${summary.title}`);
}

async function cmdRender(argv) {
  const { positional, flags } = parseArgs(argv);
  const file = positional[0];
  const doc = readJson(file);
  const detected = detectOrFail(doc, file);

  if (detected.engine === "board") {
    const profile = flags.profile || doc.profile || "default";
    const validation = await boardValidation(doc, profile);
    if (!validation.ok) {
      console.error(`error: ${file} is not a valid board:`);
      for (const e of validation.errors) console.error(`  ${e.path || ""} ${e.message}`.trim());
      process.exit(1);
    }
    const out = flags.out || `${stem(file)}.svg`;
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, renderBoardSvg(doc, { profile }));
    const png = writePng(out, flags);
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, engine: "board", kind: "board", output: path.resolve(out), png: png && path.resolve(png), audit: validation.audit }, null, 2));
    } else {
      console.log(out);
      if (png) console.log(png);
      if (validation.audit.violations.length) console.error(`note: ${validation.audit.violations.length} composition budget violation(s): ${validation.audit.violations.join(", ")}`);
    }
    return;
  }

  const out = flags.out || `${stem(file)}.html`;
  const receipt = deliverArchify(file, out, { quality: flags.quality });
  if (flags.json) console.log(JSON.stringify(receipt, null, 2));
  else if (receipt.ok) {
    console.log(receipt.output || path.resolve(out));
    const v = receipt.validation || {};
    console.log(`ok ${receipt.type}: ${v.checksPassed}/${v.checkCount} artifact checks, composition ${v.compositionProfile}: ${v.compositionStatus} (${v.errors} errors, ${v.warnings} warnings)`);
  } else {
    console.error(`error: ${receipt.error || "Archify delivery failed"}`);
    for (const d of receipt.diagnostics || []) {
      console.error(`  [${d.code}] ${d.message}${d.supportedFixes?.length ? `\n    fix: ${d.supportedFixes.join("; ")}` : ""}`);
    }
  }
  if (!receipt.ok) process.exit(receipt.exitCode || 1);
}

async function cmdValidate(argv, { auditMode = false } = {}) {
  const { positional, flags } = parseArgs(argv);
  const file = positional[0];
  const doc = readJson(file);
  const detected = detectOrFail(doc, file);

  if (detected.engine === "board") {
    const profile = flags.profile || doc.profile || "default";
    const validation = await boardValidation(doc, profile);
    if (flags.json) console.log(JSON.stringify({ engine: "board", kind: "board", file, ...validation }, null, 2));
    else if (!validation.ok) {
      console.error(`error: ${file} is not a valid board:`);
      for (const e of validation.errors) console.error(`  ${e.path || ""} ${e.message}`.trim());
    } else if (auditMode) {
      const m = validation.audit.metrics;
      console.log(`Board: ${doc.title}`);
      console.log(`score: ${validation.audit.score}`);
      console.log(`  nodePiercings: ${m.nodePiercings}`);
      console.log(`  crossings: ${m.crossings}`);
      console.log(`  bendsPerEdgeMax: ${m.bendsPerEdgeMax}`);
      console.log(`  routeStretchMax: ${m.routeStretchMax}`);
      console.log(`  adjustedLabels: ${m.adjustedLabels}`);
      if (validation.audit.violations.length) console.log(`violations: ${validation.audit.violations.join(", ")}`);
    } else {
      console.log(`OK: ${file} is a valid board (score ${validation.audit.score})`);
      if (validation.audit.violations.length) console.log(`  note: ${validation.audit.violations.length} budget violation(s): ${validation.audit.violations.join(", ")}${flags.strict ? "" : " (use --strict to fail on these)"}`);
    }
    if (!validation.ok) process.exit(1);
    if (flags.strict && validation.audit.violations.length) process.exit(1);
    return;
  }

  const receipt = validateArchify(doc, { quality: flags.quality });
  if (flags.json) console.log(JSON.stringify(receipt, null, 2));
  else if (receipt.ok) {
    console.log(`ok ${receipt.type} ${file} (${receipt.checks?.length ?? 0} artifact checks; composition ${receipt.composition?.profile}: ${receipt.composition?.summary?.errors} errors, ${receipt.composition?.summary?.warnings} warnings)`);
  } else {
    console.error(`error: ${receipt.error || "Archify validation failed"}`);
    for (const d of receipt.diagnostics || []) {
      console.error(`  [${d.code}] ${d.message}${d.supportedFixes?.length ? `\n    fix: ${d.supportedFixes.join("; ")}` : ""}`);
    }
  }
  if (!receipt.ok) process.exit(receipt.exitCode || 1);
}

async function cmdLibrary(argv) {
  const [sub, ...rest] = argv;
  const { positional, flags } = parseArgs(rest);
  const dir = libraryDir(flags);
  const library = new Library(dir);
  const kindLabel = (kind) => KIND_LABELS[kind]?.en ?? kind ?? "invalid";

  try {
    switch (sub) {
      case "path":
        console.log(dir);
        return;
      case "list": {
        const result = library.list({ kind: flags.kind, engine: flags.engine, sort: flags.sort || "updated", limit: 10_000 });
        if (flags.json) return console.log(JSON.stringify(result, null, 2));
        if (!result.total) return console.log(`(library is empty: ${dir})`);
        for (const item of result.items) {
          console.log(`${item.id.padEnd(36)} ${kindLabel(item.kind).padEnd(14)} ${item.title}${item.invalid ? `  [invalid: ${item.invalid}]` : ""}`);
        }
        console.log(`${result.total} diagram(s) in ${dir}`);
        return;
      }
      case "search": {
        const q = positional.join(" ");
        if (!q) fail("library search needs a query", 2);
        const result = library.list({ q, kind: flags.kind, limit: 10_000 });
        if (flags.json) return console.log(JSON.stringify(result, null, 2));
        for (const item of result.items) {
          const where = (item.matches || []).slice(0, 3).map((m) => `${m.field}: ${m.text}`).join(" · ");
          console.log(`${item.id.padEnd(36)} ${kindLabel(item.kind).padEnd(14)} ${item.title}\n    ${where}`);
        }
        console.log(`${result.total} match(es) for "${q}"`);
        return;
      }
      case "add": {
        const file = positional[0];
        const doc = readJson(file);
        detectOrFail(doc, file);
        const { validateDocument } = await import("../scripts/server/server.mjs");
        const validation = validateDocument(doc);
        if (!validation.ok && !flags.force) {
          console.error(`error: ${file} failed validation (use --force to store it as a draft):`);
          for (const e of validation.errors) console.error(`  ${e.path || ""} ${e.message}`.trim());
          process.exit(1);
        }
        const id = flags.id || library.suggestId(doc);
        const item = library.save(id, doc, { force: true });
        if (flags.json) return console.log(JSON.stringify({ item, validation: { ok: validation.ok, errors: validation.errors } }, null, 2));
        console.log(`${item.id}\t${path.join(dir, `${item.id}.json`)}`);
        if (!validation.ok) console.error(`warning: stored as a draft with ${validation.errors.length} validation error(s)`);
        return;
      }
      case "show": {
        const item = library.get(positional[0] || "");
        if (!item) fail(`no diagram "${positional[0]}" in ${dir}`, 1);
        console.log(JSON.stringify(item.source, null, 2));
        return;
      }
      case "remove": {
        const result = library.remove(positional[0] || "");
        console.log(`moved to ${result.trashedTo}`);
        return;
      }
      case "export": {
        const item = library.get(positional[0] || "");
        if (!item) fail(`no diagram "${positional[0]}" in ${dir}`, 1);
        const outDir = path.resolve(flags.out || ".");
        fs.mkdirSync(outDir, { recursive: true });
        const jsonPath = path.join(outDir, `${item.id}.json`);
        fs.writeFileSync(jsonPath, `${JSON.stringify(item.source, null, 2)}\n`);
        const written = [jsonPath];
        if (item.engine === "board") {
          const profile = flags.profile || item.source.profile || "default";
          const validation = await boardValidation(item.source, profile);
          if (!validation.ok) fail(`board "${item.id}" is not valid: ${validation.errors[0]?.message}`);
          const svgPath = path.join(outDir, `${item.id}.svg`);
          fs.writeFileSync(svgPath, renderBoardSvg(item.source, { profile }));
          written.push(svgPath);
          const motionPath = path.join(outDir, `${item.id}.motion.svg`);
          fs.writeFileSync(motionPath, buildMotionSvg(item.source, { profile }));
          written.push(motionPath);
          const png = writePng(svgPath, flags);
          if (png) written.push(png);
        } else {
          const htmlPath = path.join(outDir, `${item.id}.html`);
          const receipt = deliverArchify(jsonPath, htmlPath, { quality: flags.quality });
          if (!receipt.ok) fail(`Archify delivery failed for "${item.id}": ${receipt.error}`);
          written.push(htmlPath);
        }
        for (const w of written) console.log(w);
        return;
      }
      default:
        console.error(USAGE);
        fail(`unknown library subcommand "${sub ?? ""}"`, 2);
    }
  } catch (err) {
    if (err instanceof LibraryError) fail(err.message, err.status === 404 ? 1 : 1);
    throw err;
  }
}

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === "darwin" ? ["open", [url]] : platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    const child = spawn(command[0], command[1], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // opening is best-effort
  }
}

async function cmdServe(argv) {
  const { flags } = parseArgs(argv);
  const { createApp } = await import("../scripts/server/server.mjs");
  const port = Number(flags.port ?? process.env.HANSOL_PORT ?? 4100);
  const host = flags.host || process.env.HANSOL_HOST || "127.0.0.1";
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`invalid port "${flags.port}"`, 2);
  const dir = libraryDir(flags);
  const quiet = Boolean(flags.quiet);
  const app = createApp({ libraryDir: dir, log: quiet ? () => {} : (line) => console.log(line) });
  const info = await app.listen(port, host);
  const archify = archifyInfo();
  console.log(`Hansol-100 studio ${pkg.version}`);
  console.log(`  library : ${dir} (${app.library.stats().total} diagram(s))`);
  console.log(`  engines : board ✓  archify ${archify.available ? `✓ ${archify.version}` : "✗ (engines/archify missing)"}`);
  console.log(`  png     : ${describeRasterizer() || "browser export only (no server-side rasterizer)"}`);
  console.log(`  url     : ${info.url}`);
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    console.log("  note    : bound to a non-loopback address — anyone on the network can edit the library (no authentication)");
  }
  console.log("Press Ctrl-C to stop.");
  if (flags.open) openBrowser(info.url);
  const shutdown = () => {
    console.log("\nstopping…");
    app.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function cmdDoctor() {
  const checks = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push([nodeMajor >= 20, `Node.js v${process.versions.node} (requires >=20)`]);
  checks.push([fs.existsSync(BOARD_CLI), "Board engine (scripts/board.mjs)"]);
  checks.push([true, `Board schema validator: ${VALIDATOR === "ajv" ? "ajv (npm dependency installed)" : "built-in mirror (ajv not installed; run `npm install` for JSON-Schema-exact messages)"}`]);
  const archify = archifyInfo();
  checks.push([archify.available, `Archify engine (engines/archify) ${archify.available ? `v${archify.version}${archify.vendor ? ` @ ${String(archify.vendor.source?.commit || "").slice(0, 12)}` : ""}` : "missing — run `npm run sync:archify -- --from <archify-repo>`"}`]);
  if (archify.available) {
    const doctor = runArchify(["doctor"]);
    checks.push([doctor.status === 0, `Archify doctor ${doctor.status === 0 ? "ready" : `failed (exit ${doctor.status})`}`]);
  }
  const rasterizer = describeRasterizer();
  checks.push([true, `PNG rasterizer: ${rasterizer || "none (SVG always works; PNG export available in the browser UI)"}`]);
  const ui = path.join(repoRoot, "scripts", "server", "ui", "index.html");
  checks.push([fs.existsSync(ui), "Service UI (scripts/server/ui)"]);
  const dir = libraryDir({});
  let count = "n/a";
  try {
    count = new Library(dir).stats().total;
  } catch {
    count = "unreadable";
  }
  checks.push([true, `Library: ${dir} (${count} diagram(s))`]);

  console.log("Hansol-100 doctor\n");
  let failures = 0;
  for (const [ok, label] of checks) {
    if (!ok) failures += 1;
    console.log(`[${ok ? "ok" : "FAIL"}] ${label}`);
  }
  console.log(failures ? `\n${failures} problem(s) found.` : "\nHansol-100 is ready.");
  if (failures) process.exit(1);
}

// --- main ----------------------------------------------------------------------
async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    return;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    console.log(pkg.version);
    return;
  }
  switch (command) {
    case "board":
      return passthrough(BOARD_CLI, rest);
    case "archify":
    case "diagram": {
      const info = archifyInfo();
      if (!info.available) fail(`Archify engine not found at ${info.root} — run \`npm run sync:archify -- --from <archify-repo>\``);
      return passthrough(archifyCli(), rest);
    }
    case "detect":
      return cmdDetect(rest);
    case "render":
      return cmdRender(rest);
    case "validate":
      return cmdValidate(rest);
    case "audit":
      return cmdValidate(rest, { auditMode: true });
    case "library":
    case "lib":
      return cmdLibrary(rest);
    case "serve":
      return cmdServe(rest);
    case "doctor":
      return cmdDoctor();
    default:
      console.error(`error: unknown command '${command}'\n`);
      console.error(USAGE);
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
