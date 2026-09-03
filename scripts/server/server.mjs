// Hansol-100 service: a zero-dependency HTTP server that turns the diagram
// library into a shareable web app — browse, search, view, edit, validate and
// export process boards (korea100studio engine) and Archify diagrams from one
// place. The same JSON files the Skill authors are what the service serves, so
// agents and people edit the same source of truth.
//
// Binds to 127.0.0.1 by default; pass --host 0.0.0.0 (CLI) to share on a LAN.
// There is no authentication: treat it as a team-internal tool.

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Library, LibraryError, isValidId } from "../lib/library.mjs";
import { ARCHIFY_TYPES, KIND_LABELS, detectDocument, summarizeDocument } from "../lib/detect.mjs";
import { validateBoard, checkReferentialIntegrity } from "../lib/validate.mjs";
import { renderBoardSvg } from "../lib/render-svg.mjs";
import { computeComposition } from "../lib/composition.mjs";
import { buildMotionSvg } from "../lib/motion.mjs";
import { rasterize, describeRasterizer } from "../lib/rasterize.mjs";
import { convertDocument, conversionTargets, ConvertError } from "../lib/convert.mjs";
import {
  ARCHIFY_TEMPLATE_FILES,
  archifyInfo,
  readArchifyTemplate,
  renderArchifyHtml,
  validateArchify,
} from "../lib/archify-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const DEFAULT_UI_DIR = path.join(__dirname, "ui");
export const DEFAULT_LIBRARY_DIR = path.join(repoRoot, "library");

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const PREVIEW_TTL_MS = 15 * 60 * 1000;
const PREVIEW_MAX = 40;
const HTML_CACHE_MAX = 30;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const UI_CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "frame-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

export function packageVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
}

// ---------------------------------------------------------------------------
// Engine-neutral document operations (also used by the CLI)
// ---------------------------------------------------------------------------

// Board: JSON Schema → referential integrity → layout/composition. Returns
// { ok, errors[], audit? } and never throws.
export function validateBoardDocument(doc, { profile } = {}) {
  const { valid, errors } = validateBoard(doc);
  if (!valid) {
    return {
      ok: false,
      errors: errors.map((e) => ({ path: e.instancePath || "/", message: e.message, params: e.params })),
    };
  }
  const problems = checkReferentialIntegrity(doc);
  if (problems.length) return { ok: false, errors: problems.map((message) => ({ path: "", message })) };
  try {
    const comp = computeComposition(doc, profile || doc.profile || "default");
    return { ok: true, errors: [], audit: { score: comp.score, metrics: comp.metrics, violations: comp.violations } };
  } catch (err) {
    return { ok: false, errors: [{ path: "", message: `layout failed: ${String(err.message).split("\n")[0]}` }] };
  }
}

export function validateDocument(doc, { profile, quality, thorough = false } = {}) {
  const detected = detectDocument(doc);
  if (!detected) {
    return {
      ok: false,
      engine: null,
      kind: null,
      errors: [{ path: "", message: "document is neither a board-v1 board nor an Archify diagram" }],
    };
  }
  if (detected.engine === "board") return { ...detected, ...validateBoardDocument(doc, { profile }) };
  if (thorough) {
    const receipt = validateArchify(doc, { quality });
    return {
      ...detected,
      ok: receipt.ok,
      errors: (receipt.diagnostics || []).map((d) => ({ path: d.subject?.path || "", message: d.message, code: d.code, supportedFixes: d.supportedFixes })),
      receipt,
    };
  }
  const render = renderArchifyHtml(doc, { quality });
  return {
    ...detected,
    ok: render.ok,
    errors: render.ok
      ? []
      : (render.diagnostics || []).map((d) => ({ path: d.subject?.path || "", message: d.message, code: d.code, supportedFixes: d.supportedFixes })),
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  res.end(body);
}

function sendError(res, err) {
  if (err instanceof LibraryError) {
    return sendJson(res, err.status, { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
  }
  if (err instanceof HttpError) {
    return sendJson(res, err.status, { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
  }
  return sendJson(res, 500, { error: { code: "internal", message: err?.message || "internal error" } });
}

function sendBody(res, status, body, contentType, { etag, download, cache = "no-cache" } = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  const headers = {
    "content-type": contentType,
    "content-length": buffer.length,
    "cache-control": cache,
    "x-content-type-options": "nosniff",
  };
  if (etag) headers.etag = `"${etag}"`;
  if (download) headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;
  res.writeHead(status, headers);
  res.end(buffer);
}

function notModified(req, etag) {
  const match = req.headers["if-none-match"];
  return Boolean(etag && match && match.split(",").map((s) => s.trim()).includes(`"${etag}"`));
}

function readJsonBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return; // keep draining so the client receives a clean 413
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return reject(new HttpError(413, "payload-too-large", `request body exceeds ${limit} bytes`));
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(new HttpError(400, "invalid-json", `request body is not valid JSON: ${err.message}`));
      }
    });
    req.on("error", (err) => reject(new HttpError(400, "body-error", err.message)));
  });
}

function requireSource(body) {
  const source = body?.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new HttpError(400, "missing-source", "body.source must be a JSON object (the diagram document)");
  }
  return source;
}

function requireId(id) {
  if (!isValidId(id)) throw new HttpError(400, "invalid-id", `invalid diagram id "${id}"`);
  return id;
}

function hashOf(...parts) {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(String(part));
  return hash.digest("hex").slice(0, 20);
}

class LruCache {
  constructor(max) {
    this.max = max;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

function boardTemplate() {
  const template = JSON.parse(fs.readFileSync(path.join(repoRoot, "templates", "board.template.json"), "utf8"));
  delete template._comment;
  return template;
}

function boardTemplateKo() {
  return {
    schema_version: 1,
    profile: "gov",
    title: "새 업무 프로세스",
    subtitle: "행위자(레인) × 단계로 업무 흐름을 정리합니다",
    lanes: ["신청인", "담당 부서", "결정 기관"],
    stages: ["G0 접수", "G1 검토", "G2 결정"],
    nodes: [
      { id: "n1", lane: "신청인", stage: "G0 접수", label: "신청서 제출", emphasis: "lead" },
      { id: "n2", lane: "담당 부서", stage: "G0 접수", label: "접수·형식 확인", emphasis: "normal" },
      { id: "n3", lane: "신청인", stage: "G1 검토", label: "보완 자료 제출", emphasis: "loop", note: "보완 요청 시 재제출" },
      { id: "n4", lane: "담당 부서", stage: "G1 검토", label: "내용 검토", emphasis: "key" },
      { id: "n5", lane: "결정 기관", stage: "G2 결정", label: "결정·통지", emphasis: "lead" },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", type: "sequence" },
      { id: "e2", source: "n2", target: "n4", type: "sequence", label: "접수 완료" },
      { id: "e3", source: "n4", target: "n3", type: "loop", label: "보완 요청" },
      { id: "e4", source: "n3", target: "n4", type: "sequence", label: "재검토" },
      { id: "e5", source: "n4", target: "n5", type: "sequence" },
    ],
  };
}

export function listTemplates() {
  const templates = [
    { name: "board", engine: "board", kind: "board", title: "Process board (English)", description: "2 lanes × 2 stages starter, default profile" },
    { name: "board-ko", engine: "board", kind: "board", title: "업무 프로세스 보드 (한국어)", description: "3 레인 × 3 단계 시작 보드, gov 프로필" },
  ];
  for (const kind of ARCHIFY_TYPES) {
    const doc = readArchifyTemplate(kind);
    if (!doc) continue;
    templates.push({
      name: kind,
      engine: "archify",
      kind,
      title: doc.meta?.title || kind,
      description: `Archify ${kind} example (${ARCHIFY_TEMPLATE_FILES[kind]})`,
    });
  }
  return templates;
}

export function readTemplate(name) {
  if (name === "board") return boardTemplate();
  if (name === "board-ko") return boardTemplateKo();
  if (ARCHIFY_TYPES.includes(name)) return readArchifyTemplate(name);
  return null;
}

export function createApp({
  libraryDir = DEFAULT_LIBRARY_DIR,
  uiDir = DEFAULT_UI_DIR,
  log = () => {},
  now = () => Date.now(),
} = {}) {
  const library = new Library(libraryDir);
  library.ensureDir();
  const htmlCache = new LruCache(HTML_CACHE_MAX);
  const previews = new Map(); // token -> { html, createdAt }
  const pngDir = path.join(os.tmpdir(), "hansol100-png-cache");

  function prunePreviews() {
    const cutoff = now() - PREVIEW_TTL_MS;
    for (const [token, entry] of previews) if (entry.createdAt < cutoff) previews.delete(token);
    while (previews.size > PREVIEW_MAX) previews.delete(previews.keys().next().value);
  }

  function archifyHtmlFor(doc, quality) {
    const key = hashOf(JSON.stringify(doc), quality || "");
    const cached = htmlCache.get(key);
    if (cached) return { ok: true, html: cached, cached: true };
    const result = renderArchifyHtml(doc, { quality });
    if (result.ok) htmlCache.set(key, result.html);
    return result;
  }

  function loadDiagram(id) {
    const item = library.get(requireId(id));
    if (!item) throw new HttpError(404, "not-found", `diagram "${id}" does not exist`);
    if (item.source === null) throw new HttpError(422, "invalid-json", `diagram "${id}" is not valid JSON`);
    return item;
  }

  function requireEngine(item, engine) {
    if (item.engine !== engine) {
      throw new HttpError(409, "wrong-engine", `diagram "${item.id}" is a ${item.kind} document; this endpoint needs ${engine}`);
    }
  }

  function boardSvg(item, profile) {
    const validation = validateBoardDocument(item.source, { profile });
    if (!validation.ok) throw new HttpError(422, "invalid-board", "board is not valid", { errors: validation.errors });
    return renderBoardSvg(item.source, { profile: profile || item.source.profile || "default" });
  }

  // ----- API handlers -----

  const api = {
    async health() {
      const archify = archifyInfo();
      return {
        ok: true,
        name: "hansol-100",
        version: packageVersion(),
        engines: {
          board: { available: true, profiles: ["default", "gov"] },
          archify: {
            available: archify.available,
            source: archify.source,
            root: archify.root,
            version: archify.version,
            types: ARCHIFY_TYPES,
            upstream: archify.vendor?.source ?? null,
          },
        },
        rasterizer: describeRasterizer(),
        kinds: KIND_LABELS,
        library: library.stats(),
      };
    },

    async list(query) {
      const limit = Math.min(500, Math.max(1, Number(query.get("limit")) || 200));
      const offset = Math.max(0, Number(query.get("offset")) || 0);
      return library.list({
        q: query.get("q") || "",
        kind: query.get("kind") || undefined,
        engine: query.get("engine") || undefined,
        profile: query.get("profile") || undefined,
        sort: query.get("sort") || "updated",
        limit,
        offset,
      });
    },

    async create(body) {
      const source = requireSource(body);
      const id = body.id ? requireId(body.id) : library.suggestId(source);
      const validation = validateDocument(source);
      if (!validation.engine) throw new HttpError(422, "unknown-document", validation.errors[0].message);
      if (!validation.ok && !body.allowInvalid) {
        throw new HttpError(422, "invalid-document", "document failed validation (send allowInvalid: true to save a draft)", { errors: validation.errors });
      }
      const item = library.save(id, source, { create: true });
      return { item, validation: { ok: validation.ok, errors: validation.errors } };
    },

    async update(id, body) {
      const source = requireSource(body);
      const validation = validateDocument(source);
      if (!validation.engine) throw new HttpError(422, "unknown-document", validation.errors[0].message);
      if (!validation.ok && !body.allowInvalid) {
        throw new HttpError(422, "invalid-document", "document failed validation (send allowInvalid: true to save a draft)", { errors: validation.errors });
      }
      const item = library.save(requireId(id), source, {
        expectedRevision: typeof body.revision === "string" ? body.revision : undefined,
        force: body.force === true,
      });
      return { item, validation: { ok: validation.ok, errors: validation.errors } };
    },

    async remove(id) {
      return library.remove(requireId(id));
    },

    async duplicate(id, body) {
      const target = body?.id ? requireId(body.id) : undefined;
      return { item: library.duplicate(requireId(id), target) };
    },

    async preview(body, query) {
      const source = requireSource(body);
      const detected = detectDocument(source);
      if (!detected) {
        return { ok: false, engine: null, kind: null, errors: [{ path: "", message: "document is neither a board-v1 board nor an Archify diagram" }] };
      }
      if (detected.engine === "board") {
        const profile = body.profile || query.get("profile") || undefined;
        const validation = validateBoardDocument(source, { profile });
        if (!validation.ok) return { ok: false, ...detected, errors: validation.errors };
        const svg = renderBoardSvg(source, { profile: profile || source.profile || "default" });
        return { ok: true, ...detected, svg, audit: validation.audit, errors: [] };
      }
      const quality = body.quality || query.get("quality") || undefined;
      const result = archifyHtmlFor(source, quality);
      if (!result.ok) return { ok: false, ...detected, error: result.error, diagnostics: result.diagnostics || [], errors: (result.diagnostics || []).map((d) => ({ path: d.subject?.path || "", message: d.message, code: d.code })) };
      prunePreviews();
      const token = randomBytes(12).toString("hex");
      previews.set(token, { html: result.html, createdAt: now() });
      return { ok: true, ...detected, previewUrl: `/api/preview/${token}.html`, token, bytes: Buffer.byteLength(result.html), errors: [] };
    },

    async validate(body, query) {
      const source = requireSource(body);
      const thorough = body.thorough !== false;
      const result = validateDocument(source, {
        profile: body.profile || query.get("profile") || undefined,
        quality: body.quality || query.get("quality") || undefined,
        thorough,
      });
      return result;
    },

    async convert(body, query) {
      const source = requireSource(body);
      const to = body.to || query.get("to");
      if (!to) throw new HttpError(400, "missing-target", `body.to is required (targets: ${conversionTargets(source).join(", ") || "none"})`);
      let result;
      try {
        result = convertDocument(source, to, { quality: body.quality, profile: body.profile });
      } catch (err) {
        if (err instanceof ConvertError) throw new HttpError(422, `convert/${err.code}`, err.message, err.details);
        throw err;
      }
      const validation = validateDocument(result.document, { thorough: body.thorough !== false, quality: body.quality });
      return { ok: validation.ok, from: result.from, to, source: result.document, validation: { ok: validation.ok, errors: validation.errors, ...(validation.receipt ? { receipt: validation.receipt } : {}), ...(validation.audit ? { audit: validation.audit } : {}) } };
    },

    async trash() {
      if (!fs.existsSync(library.trashDir)) return { items: [] };
      const items = fs.readdirSync(library.trashDir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => {
          const stat = fs.statSync(path.join(library.trashDir, name));
          const match = /^(.*)\.(\d{4}-\d{2}-\d{2}T[0-9-]+Z)\.json$/.exec(name);
          return { file: name, id: match ? match[1] : name.slice(0, -5), trashedAt: match ? match[2].replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ":$1:$2.$3Z") : null, bytes: stat.size };
        })
        .sort((a, b) => b.file.localeCompare(a.file));
      return { items };
    },

    async restore(file) {
      if (!/^[a-z0-9가-힣][A-Za-z0-9가-힣._-]*\.json$/.test(file)) {
        throw new HttpError(400, "invalid-trash-file", "invalid trash file name");
      }
      const full = path.join(library.trashDir, file);
      if (!fs.existsSync(full)) throw new HttpError(404, "not-found", "trash entry does not exist");
      const match = /^(.*)\.\d{4}-\d{2}-\d{2}T[0-9-]+Z\.json$/.exec(file);
      const baseId = match ? match[1] : file.slice(0, -5);
      const id = library.exists(baseId) ? library.nextId(baseId) : baseId;
      const doc = JSON.parse(fs.readFileSync(full, "utf8"));
      const item = library.save(id, doc, { create: true });
      fs.rmSync(full, { force: true });
      return { item };
    },
  };

  // ----- routing -----

  async function handleApi(req, res, url) {
    const segments = url.pathname.split("/").filter(Boolean).slice(1).map((s) => decodeURIComponent(s)); // drop "api"
    const method = req.method;
    const query = url.searchParams;

    if (segments.length === 1 && segments[0] === "health" && method === "GET") return sendJson(res, 200, await api.health());
    if (segments.length === 1 && (segments[0] === "diagrams" || segments[0] === "search") && method === "GET") return sendJson(res, 200, await api.list(query));
    if (segments.length === 1 && segments[0] === "diagrams" && method === "POST") return sendJson(res, 201, await api.create(await readJsonBody(req)));
    if (segments.length === 1 && segments[0] === "preview" && method === "POST") return sendJson(res, 200, await api.preview(await readJsonBody(req), query));
    if (segments.length === 1 && segments[0] === "validate" && method === "POST") return sendJson(res, 200, await api.validate(await readJsonBody(req), query));
    if (segments.length === 1 && segments[0] === "convert" && method === "POST") return sendJson(res, 200, await api.convert(await readJsonBody(req), query));
    if (segments.length === 1 && segments[0] === "templates" && method === "GET") return sendJson(res, 200, { items: listTemplates() });
    if (segments.length === 2 && segments[0] === "templates" && method === "GET") {
      const doc = readTemplate(segments[1]);
      if (!doc) throw new HttpError(404, "not-found", `unknown template "${segments[1]}"`);
      return sendJson(res, 200, { name: segments[1], source: doc, summary: summarizeDocument(doc) && (({ text, ...rest }) => rest)(summarizeDocument(doc)) });
    }
    if (segments.length === 1 && segments[0] === "trash" && method === "GET") return sendJson(res, 200, await api.trash());
    if (segments.length === 3 && segments[0] === "trash" && segments[2] === "restore" && method === "POST") return sendJson(res, 200, await api.restore(segments[1]));
    if (segments.length === 2 && segments[0] === "preview" && method === "GET" && segments[1].endsWith(".html")) {
      prunePreviews();
      const entry = previews.get(segments[1].slice(0, -5));
      if (!entry) throw new HttpError(404, "not-found", "preview expired; render it again");
      return sendBody(res, 200, entry.html, CONTENT_TYPES[".html"], { cache: "no-store" });
    }

    if (segments[0] !== "diagrams" || segments.length < 2) throw new HttpError(404, "not-found", `no API route for ${method} ${url.pathname}`);
    const id = requireId(segments[1]);

    if (segments.length === 2) {
      if (method === "GET") {
        const item = loadDiagram(id);
        return sendJson(res, 200, { ...item, conversions: conversionTargets(item.source) });
      }
      if (method === "PUT") return sendJson(res, 200, await api.update(id, await readJsonBody(req)));
      if (method === "DELETE") return sendJson(res, 200, await api.remove(id));
      throw new HttpError(405, "method-not-allowed", `${method} not allowed`);
    }

    if (segments.length === 3) {
      const action = segments[2];
      if (action === "duplicate" && method === "POST") return sendJson(res, 201, await api.duplicate(id, await readJsonBody(req)));
      if (method !== "GET") throw new HttpError(405, "method-not-allowed", `${method} not allowed`);
      const item = loadDiagram(id);
      const download = query.get("download") ? `${id}.${action.replace(/^render\./, "")}` : undefined;

      if (action === "source.json") {
        return sendBody(res, 200, `${JSON.stringify(item.source, null, 2)}\n`, CONTENT_TYPES[".json"], { etag: item.revision, download: download && `${id}.json` });
      }
      if (action === "render.svg") {
        requireEngine(item, "board");
        const profile = query.get("profile") || undefined;
        const etag = hashOf(item.revision, profile || "");
        if (notModified(req, etag)) return sendBody(res, 304, "", CONTENT_TYPES[".svg"], { etag });
        return sendBody(res, 200, boardSvg(item, profile), CONTENT_TYPES[".svg"], { etag, download: download && `${id}.svg` });
      }
      if (action === "motion.svg") {
        requireEngine(item, "board");
        const profile = query.get("profile") || item.source.profile || "default";
        const validation = validateBoardDocument(item.source, { profile });
        if (!validation.ok) throw new HttpError(422, "invalid-board", "board is not valid", { errors: validation.errors });
        const etag = hashOf("motion", item.revision, profile);
        if (notModified(req, etag)) return sendBody(res, 304, "", CONTENT_TYPES[".svg"], { etag });
        return sendBody(res, 200, buildMotionSvg(item.source, { profile }), CONTENT_TYPES[".svg"], { etag, download: download && `${id}.motion.svg` });
      }
      if (action === "render.png") {
        requireEngine(item, "board");
        if (!describeRasterizer()) throw new HttpError(501, "no-rasterizer", "no PNG rasterizer on this machine (install librsvg/cairosvg or set HANSOL_CHROME); use the browser export instead");
        const width = Math.min(4000, Math.max(400, Number(query.get("width")) || 1800));
        const profile = query.get("profile") || undefined;
        fs.mkdirSync(pngDir, { recursive: true });
        const key = hashOf(item.revision, profile || "", width);
        const pngPath = path.join(pngDir, `${key}.png`);
        if (!fs.existsSync(pngPath)) {
          const svgPath = path.join(pngDir, `${key}.svg`);
          fs.writeFileSync(svgPath, boardSvg(item, profile));
          const result = rasterize(svgPath, pngPath, width);
          fs.rmSync(svgPath, { force: true });
          if (!result.ok) throw new HttpError(500, "rasterize-failed", result.reason);
        }
        return sendBody(res, 200, fs.readFileSync(pngPath), CONTENT_TYPES[".png"], { etag: key, download: download && `${id}.png` });
      }
      if (action === "render.html") {
        requireEngine(item, "archify");
        const quality = query.get("quality") || undefined;
        const etag = hashOf(item.revision, quality || "");
        if (notModified(req, etag)) return sendBody(res, 304, "", CONTENT_TYPES[".html"], { etag });
        const result = archifyHtmlFor(item.source, quality);
        if (!result.ok) throw new HttpError(422, "render-failed", result.error || "render failed", { diagnostics: result.diagnostics });
        return sendBody(res, 200, result.html, CONTENT_TYPES[".html"], { etag, download: download && `${id}.html` });
      }
      if (action === "audit") {
        if (item.engine === "board") {
          const profile = query.get("profile") || undefined;
          return sendJson(res, 200, { ...validateBoardDocument(item.source, { profile }), engine: "board", kind: "board" });
        }
        const receipt = validateArchify(item.source, { quality: query.get("quality") || undefined });
        return sendJson(res, 200, { ok: receipt.ok, engine: "archify", kind: item.kind, receipt });
      }
    }
    throw new HttpError(404, "not-found", `no API route for ${method} ${url.pathname}`);
  }

  function serveStatic(req, res, url) {
    if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "method-not-allowed", `${req.method} not allowed`);
    let name = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    if (name.startsWith("assets/")) name = name.slice("assets/".length);
    // SPA routes are hash-based; anything else with a path is a static asset.
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) throw new HttpError(404, "not-found", "not found");
    const full = path.join(uiDir, name);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new HttpError(404, "not-found", `not found: ${name}`);
    const ext = path.extname(name).toLowerCase();
    const body = fs.readFileSync(full);
    const headers = {
      "content-type": CONTENT_TYPES[ext] || "application/octet-stream",
      "content-length": body.length,
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
    };
    if (ext === ".html") {
      headers["content-security-policy"] = UI_CSP;
      headers["referrer-policy"] = "no-referrer";
    }
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  }

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) await handleApi(req, res, url);
      else serveStatic(req, res, url);
    } catch (err) {
      if (!res.headersSent) sendError(res, err);
      else res.end();
    } finally {
      log(`${req.method} ${url.pathname}${url.search} → ${res.statusCode} ${Date.now() - started}ms`);
    }
  });

  // Browsers reuse idle connections; a long keep-alive avoids the close/reuse
  // race that surfaces as ERR_CONNECTION_RESET on a busy editing session.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  return {
    server,
    library,
    listen(port = 4100, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          const address = server.address();
          const displayHost = address.family === "IPv6" ? `[${address.address}]` : address.address;
          resolve({ port: address.port, host: address.address, url: `http://${displayHost}:${address.port}/` });
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
