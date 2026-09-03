// File-backed diagram library shared by the web service, the unified CLI and
// the Skill. One JSON document per file (`<id>.json`) inside one directory —
// human-editable, git-friendly, and exactly what an agent authors. The index
// is rebuilt lazily from mtimes, so hand edits and agent edits show up on the
// next request without a daemon or database.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { detectDocument, summarizeDocument } from "./detect.mjs";

// Lowercase ASCII plus Hangul syllables: URL-safe after encodeURIComponent,
// filesystem-safe everywhere, and readable for Korean titles.
export const ID_PATTERN = /^[a-z0-9가-힣][a-z0-9가-힣._-]{0,79}$/;

export class LibraryError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = "LibraryError";
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

export function isValidId(id) {
  return typeof id === "string" && ID_PATTERN.test(id) && !id.includes("..");
}

export function slugify(text, fallback = "diagram") {
  const slug = String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return isValidId(slug) ? slug : fallback;
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function revisionOf(bytes) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

// Field weights for ranking. Titles dominate; ids/notes are a weak signal so a
// stray id match never outranks a real title match.
const FIELD_WEIGHTS = {
  title: 10,
  subtitle: 4,
  lanes: 3,
  stages: 3,
  nodes: 2,
  edges: 1.5,
  notes: 1,
  ids: 0.5,
};
const FIELD_LABELS = {
  title: "title",
  subtitle: "subtitle",
  lanes: "lane",
  stages: "stage",
  nodes: "node",
  edges: "edge",
  notes: "note",
  ids: "id",
};

export function tokenizeQuery(query) {
  return normalizeText(query).split(" ").filter(Boolean);
}

// Substring matching over normalized text is deliberately simple: it behaves
// well for Korean (no word boundaries between morphemes), for identifiers, and
// for mixed-language process names. Every token must match somewhere (AND).
export function scoreEntry(summary, tokens) {
  if (!tokens.length) return { score: 0, matches: [] };
  let score = 0;
  const matches = [];
  const seen = new Set();
  for (const token of tokens) {
    let tokenScore = 0;
    for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
      const values = summary.text?.[field] || [];
      for (const raw of values) {
        const value = normalizeText(raw);
        if (!value.includes(token)) continue;
        let hit = weight;
        if (field === "title" && value.startsWith(token)) hit += 5;
        if (value === token) hit += weight; // exact field match
        tokenScore += hit;
        const key = `${field}:${raw}`;
        if (!seen.has(key) && matches.length < 6) {
          seen.add(key);
          matches.push({ field: FIELD_LABELS[field], text: String(raw).slice(0, 120) });
        }
      }
    }
    if (tokenScore === 0) return { score: 0, matches: [] };
    score += tokenScore;
  }
  return { score, matches };
}

function stripText(summary) {
  const { text, ...rest } = summary;
  return rest;
}

export class Library {
  constructor(dir, { trashDirName = ".trash" } = {}) {
    this.dir = path.resolve(dir);
    this.trashDir = path.join(this.dir, trashDirName);
    this.cache = new Map(); // id -> { mtimeMs, size, entry }
  }

  ensureDir() {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  filePath(id) {
    if (!isValidId(id)) throw new LibraryError("invalid-id", `invalid diagram id "${id}"`, 400);
    return path.join(this.dir, `${id}.json`);
  }

  // Rescan the directory; re-parse only files whose mtime/size changed.
  refresh() {
    this.ensureDir();
    const seen = new Set();
    for (const name of fs.readdirSync(this.dir)) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -5);
      if (!isValidId(id)) continue;
      const full = path.join(this.dir, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      seen.add(id);
      const cached = this.cache.get(id);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) continue;
      this.cache.set(id, { mtimeMs: stat.mtimeMs, size: stat.size, entry: this.readEntry(id, full, stat) });
    }
    for (const id of [...this.cache.keys()]) if (!seen.has(id)) this.cache.delete(id);
    return [...this.cache.values()].map((c) => c.entry);
  }

  readEntry(id, full, stat) {
    const bytes = fs.readFileSync(full);
    const base = {
      id,
      bytes: stat.size,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      revision: revisionOf(bytes),
    };
    let doc;
    try {
      doc = JSON.parse(bytes.toString("utf8"));
    } catch (err) {
      return { ...base, engine: null, kind: null, title: id, subtitle: "", invalid: `JSON parse error: ${err.message}`, text: { title: [id] } };
    }
    const detected = detectDocument(doc);
    if (!detected) {
      return { ...base, engine: null, kind: null, title: doc?.title || doc?.meta?.title || id, subtitle: "", invalid: "unknown document shape (neither board-v1 nor an Archify diagram)", text: { title: [id] } };
    }
    return { ...base, ...summarizeDocument(doc, detected) };
  }

  list({ q = "", kind, engine, profile, sort = "updated", limit = 200, offset = 0 } = {}) {
    const tokens = tokenizeQuery(q);
    let entries = this.refresh();
    if (kind) entries = entries.filter((e) => e.kind === kind);
    if (engine) entries = entries.filter((e) => e.engine === engine);
    if (profile) entries = entries.filter((e) => e.profile === profile);
    let scored = entries.map((entry) => ({ entry, ...scoreEntry(entry, tokens) }));
    if (tokens.length) scored = scored.filter((s) => s.score > 0);
    const compare = {
      updated: (a, b) => b.entry.updatedAt.localeCompare(a.entry.updatedAt),
      title: (a, b) => a.entry.title.localeCompare(b.entry.title, "ko"),
      relevance: (a, b) => b.score - a.score || b.entry.updatedAt.localeCompare(a.entry.updatedAt),
    };
    scored.sort(tokens.length && sort === "updated" ? compare.relevance : compare[sort] || compare.updated);
    const total = scored.length;
    const items = scored.slice(offset, offset + limit).map(({ entry, score, matches }) => ({
      ...stripText(entry),
      ...(tokens.length ? { score, matches } : {}),
    }));
    return { total, items, query: q, tokens };
  }

  exists(id) {
    return fs.existsSync(this.filePath(id));
  }

  get(id) {
    const full = this.filePath(id);
    if (!fs.existsSync(full)) return null;
    const stat = fs.statSync(full);
    const entry = this.readEntry(id, full, stat);
    const bytes = fs.readFileSync(full, "utf8");
    let source = null;
    try {
      source = JSON.parse(bytes);
    } catch {
      source = null;
    }
    return { ...stripText(entry), source, raw: source === null ? bytes : undefined };
  }

  // Create or replace one document. `expectedRevision` implements optimistic
  // concurrency for multi-user editing: a stale revision fails with 409 unless
  // `force` is set. Writes are atomic (temp file + rename).
  save(id, doc, { expectedRevision, force = false, create = false, mustExist = false } = {}) {
    const full = this.filePath(id);
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      throw new LibraryError("invalid-document", "document must be a JSON object", 422);
    }
    if (!detectDocument(doc)) {
      throw new LibraryError(
        "invalid-document",
        "document is neither a board-v1 board nor an Archify diagram (diagram_type)",
        422,
      );
    }
    const exists = fs.existsSync(full);
    if (create && exists) throw new LibraryError("exists", `diagram "${id}" already exists`, 409);
    if (mustExist && !exists) throw new LibraryError("not-found", `diagram "${id}" does not exist`, 404);
    if (exists && !force && expectedRevision) {
      const current = revisionOf(fs.readFileSync(full));
      if (current !== expectedRevision) {
        throw new LibraryError("conflict", `diagram "${id}" was modified by someone else`, 409, {
          currentRevision: current,
          expectedRevision,
        });
      }
    }
    this.ensureDir();
    const payload = `${JSON.stringify(doc, null, 2)}\n`;
    const tmp = path.join(this.dir, `.${id}.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, full);
    this.cache.delete(id);
    return this.get(id);
  }

  // Soft delete: move into .trash with a timestamp so mistakes are recoverable.
  remove(id) {
    const full = this.filePath(id);
    if (!fs.existsSync(full)) throw new LibraryError("not-found", `diagram "${id}" does not exist`, 404);
    fs.mkdirSync(this.trashDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(this.trashDir, `${id}.${stamp}.json`);
    fs.renameSync(full, target);
    this.cache.delete(id);
    return { id, trashedTo: target };
  }

  duplicate(id, newId) {
    const current = this.get(id);
    if (!current) throw new LibraryError("not-found", `diagram "${id}" does not exist`, 404);
    if (current.source === null) throw new LibraryError("invalid-document", `diagram "${id}" is not valid JSON`, 422);
    const target = newId || this.nextId(`${id}-copy`);
    return this.save(target, current.source, { create: true });
  }

  nextId(base) {
    const root = slugify(base);
    if (!this.exists(root)) return root;
    for (let n = 2; n < 10_000; n += 1) {
      const candidate = `${root}-${n}`.slice(0, 80);
      if (!this.exists(candidate)) return candidate;
    }
    throw new LibraryError("exists", "could not allocate a unique id", 500);
  }

  // Derive a stable id for a document that has none yet.
  suggestId(doc) {
    const title = doc?.title ?? doc?.meta?.title ?? "";
    const detected = detectDocument(doc);
    const fallback = detected ? detected.kind : "diagram";
    return this.nextId(slugify(title, fallback));
  }

  stats() {
    const entries = this.refresh();
    const byKind = {};
    for (const e of entries) byKind[e.kind ?? "invalid"] = (byKind[e.kind ?? "invalid"] || 0) + 1;
    return { dir: this.dir, total: entries.length, byKind };
  }
}
