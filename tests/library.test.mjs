import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Library, LibraryError, isValidId, slugify, scoreEntry, tokenizeQuery } from "../scripts/lib/library.mjs";
import { detectDocument, summarizeDocument } from "../scripts/lib/detect.mjs";

const generic = JSON.parse(fs.readFileSync("fixtures/generic-sample.json", "utf8"));
const gov = JSON.parse(fs.readFileSync("fixtures/gov-sample.json", "utf8"));
const workflow = JSON.parse(fs.readFileSync("engines/archify/examples/agent-tool-call.workflow.json", "utf8"));

function tempLibrary() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hansol-library-test-"));
  return new Library(dir);
}

test("detectDocument recognises boards and Archify types, rejects others", () => {
  assert.deepEqual(detectDocument(generic), { engine: "board", kind: "board" });
  assert.deepEqual(detectDocument(workflow), { engine: "archify", kind: "workflow" });
  assert.equal(detectDocument({ diagram_type: "mindmap" }), null);
  assert.equal(detectDocument({ lanes: [] }), null);
  assert.equal(detectDocument(null), null);
  assert.equal(detectDocument([]), null);
});

test("summarizeDocument exposes counts and searchable text for both engines", () => {
  const board = summarizeDocument(gov);
  assert.equal(board.kind, "board");
  assert.equal(board.profile, "gov");
  assert.equal(board.counts.nodes, gov.nodes.length);
  assert.ok(board.text.notes.length > 0, "refs become searchable notes");
  const wf = summarizeDocument(workflow);
  assert.equal(wf.kind, "workflow");
  assert.equal(wf.counts.nodes, workflow.nodes.length);
  assert.equal(wf.lanes.length, workflow.lanes.length);
});

test("ids: valid pattern, Hangul allowed, traversal rejected", () => {
  assert.ok(isValidId("software-release"));
  assert.ok(isValidId("행정심판.v2"));
  assert.ok(!isValidId("Upper"));
  assert.ok(!isValidId("../etc"));
  assert.ok(!isValidId("a/b"));
  assert.ok(!isValidId(""));
  assert.equal(slugify("Software Release Process!"), "software-release-process");
  assert.equal(slugify("행정심판 청구·심리"), "행정심판-청구-심리");
  assert.equal(slugify("***", "fallback"), "fallback");
});

test("save/get/list round-trip with revision and summaries", () => {
  const lib = tempLibrary();
  const saved = lib.save("release", generic, { create: true });
  assert.equal(saved.id, "release");
  assert.equal(saved.kind, "board");
  assert.match(saved.revision, /^[a-f0-9]{16}$/);
  const got = lib.get("release");
  assert.deepEqual(got.source, generic);
  assert.equal(lib.list().total, 1);
  assert.equal(lib.list().items[0].title, generic.title);
  assert.equal(lib.list().items[0].text, undefined, "list strips search text");
});

test("save enforces optimistic concurrency unless forced", () => {
  const lib = tempLibrary();
  const first = lib.save("doc", generic, { create: true });
  const edited = { ...generic, title: "Edited" };
  assert.throws(() => lib.save("doc", edited, { expectedRevision: "0000000000000000" }), (err) => err instanceof LibraryError && err.code === "conflict" && err.status === 409);
  const second = lib.save("doc", edited, { expectedRevision: first.revision });
  assert.notEqual(second.revision, first.revision);
  assert.equal(lib.get("doc").source.title, "Edited");
  lib.save("doc", generic, { expectedRevision: "stale", force: true });
  assert.equal(lib.get("doc").source.title, generic.title);
  assert.throws(() => lib.save("doc", generic, { create: true }), (err) => err.code === "exists");
  assert.throws(() => lib.save("nope", generic, { mustExist: true }), (err) => err.code === "not-found");
  assert.throws(() => lib.save("bad", { hello: 1 }), (err) => err.code === "invalid-document");
  assert.throws(() => lib.save("../x", generic), (err) => err.code === "invalid-id");
});

test("remove moves to trash; duplicate and nextId allocate unique ids", () => {
  const lib = tempLibrary();
  lib.save("doc", generic, { create: true });
  const copy = lib.duplicate("doc");
  assert.equal(copy.id, "doc-copy");
  assert.equal(lib.duplicate("doc").id, "doc-copy-2");
  const removed = lib.remove("doc");
  assert.ok(fs.existsSync(removed.trashedTo));
  assert.equal(lib.get("doc"), null);
  assert.throws(() => lib.remove("doc"), (err) => err.code === "not-found");
  assert.equal(lib.suggestId(gov), "행정심판-청구-심리-재결");
});

test("refresh picks up external edits and flags broken JSON", () => {
  const lib = tempLibrary();
  lib.save("doc", generic, { create: true });
  assert.equal(lib.list().items[0].title, generic.title);
  const file = path.join(lib.dir, "doc.json");
  const changed = { ...generic, title: "Changed on disk" };
  fs.writeFileSync(file, JSON.stringify(changed));
  const future = Date.now() / 1000 + 5;
  fs.utimesSync(file, future, future);
  assert.equal(lib.list().items[0].title, "Changed on disk");
  fs.writeFileSync(path.join(lib.dir, "broken.json"), "{ not json");
  const broken = lib.list().items.find((i) => i.id === "broken");
  assert.ok(broken.invalid);
  assert.equal(broken.kind, null);
  fs.writeFileSync(path.join(lib.dir, "Not-Valid-Id.json"), "{}");
  assert.equal(lib.list().items.length, 2, "files with invalid ids are ignored");
});

test("search matches Korean substrings and ranks titles above node text", () => {
  const lib = tempLibrary();
  lib.save("gov", gov, { create: true });
  lib.save("release", generic, { create: true });
  lib.save("wf", workflow, { create: true });
  const korean = lib.list({ q: "심판" });
  assert.equal(korean.total, 1);
  assert.equal(korean.items[0].id, "gov");
  assert.ok(korean.items[0].matches.some((m) => m.field === "title"));
  const multi = lib.list({ q: "재결 심리" });
  assert.equal(multi.total, 1, "all tokens must match (AND)");
  assert.equal(lib.list({ q: "재결 nonexistent" }).total, 0);
  const process = lib.list({ q: "process" });
  assert.equal(process.items[0].id, "release", "title match ranks first");
  const filtered = lib.list({ q: "agent", kind: "workflow" });
  assert.equal(filtered.total, 1);
  assert.equal(lib.list({ kind: "board" }).total, 2);
  assert.equal(lib.list({ engine: "archify" }).total, 1);
});

test("scoreEntry weights fields and requires every token", () => {
  const summary = summarizeDocument(generic);
  const title = scoreEntry(summary, tokenizeQuery("software release"));
  const node = scoreEntry(summary, tokenizeQuery("triage"));
  assert.ok(title.score > node.score);
  assert.equal(scoreEntry(summary, tokenizeQuery("software zzz")).score, 0);
  assert.equal(scoreEntry(summary, []).score, 0);
});
