import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createApp, listTemplates, validateDocument } from "../scripts/server/server.mjs";

const generic = JSON.parse(fs.readFileSync("fixtures/generic-sample.json", "utf8"));
const gov = JSON.parse(fs.readFileSync("fixtures/gov-sample.json", "utf8"));
const workflow = JSON.parse(fs.readFileSync("engines/archify/examples/agent-tool-call.workflow.json", "utf8"));
delete workflow.meta.output;

let app;
let base;
let dir;

test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hansol-server-test-"));
  fs.writeFileSync(path.join(dir, "release.json"), JSON.stringify(generic));
  fs.writeFileSync(path.join(dir, "gov.json"), JSON.stringify(gov));
  fs.writeFileSync(path.join(dir, "wf.json"), JSON.stringify(workflow));
  app = createApp({ libraryDir: dir });
  const info = await app.listen(0);
  base = info.url.replace(/\/$/, "");
});

test.after(async () => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(pathname, init) {
  const res = await fetch(base + pathname, init);
  const type = res.headers.get("content-type") || "";
  const body = type.includes("json") ? await res.json() : await res.text();
  return { status: res.status, type, body, headers: res.headers };
}
const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("health and templates", async () => {
  const health = await call("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.engines.archify.available, true);
  assert.equal(health.body.library.total, 3);
  const templates = await call("/api/templates");
  assert.deepEqual(templates.body.items.map((t) => t.name), listTemplates().map((t) => t.name));
  assert.ok(templates.body.items.length >= 7);
  const ko = await call("/api/templates/board-ko");
  assert.equal(ko.body.summary.kind, "board");
  assert.equal((await call("/api/templates/nope")).status, 404);
});

test("list, filter and search", async () => {
  const all = await call("/api/diagrams");
  assert.equal(all.body.total, 3);
  const boards = await call("/api/diagrams?kind=board");
  assert.equal(boards.body.total, 2);
  const korean = await call(`/api/diagrams?q=${encodeURIComponent("심판 재결")}`);
  assert.equal(korean.body.total, 1);
  assert.equal(korean.body.items[0].id, "gov");
  assert.ok(korean.body.items[0].matches.length > 0);
  const alias = await call("/api/search?q=agent");
  assert.equal(alias.body.items[0].id, "wf");
});

test("board endpoints: get, svg with ETag, motion, audit, png without rasterizer", async () => {
  const item = await call("/api/diagrams/release");
  assert.equal(item.status, 200);
  assert.equal(item.body.kind, "board");
  assert.deepEqual(item.body.source, generic);
  const svg = await call("/api/diagrams/release/render.svg");
  assert.equal(svg.status, 200);
  assert.match(svg.type, /image\/svg\+xml/);
  assert.match(svg.body, /^<svg/);
  const etag = svg.headers.get("etag");
  assert.ok(etag);
  const cached = await fetch(`${base}/api/diagrams/release/render.svg`, { headers: { "if-none-match": etag } });
  assert.equal(cached.status, 304);
  const govSvg = await call("/api/diagrams/release/render.svg?profile=gov");
  assert.match(govSvg.body, /핵심/);
  const motion = await call("/api/diagrams/release/motion.svg");
  assert.match(motion.body, /<animate/);
  const audit = await call("/api/diagrams/release/audit");
  assert.equal(audit.body.ok, true);
  assert.equal(audit.body.audit.metrics.nodePiercings, 0);
  const source = await call("/api/diagrams/release/source.json?download=1");
  assert.match(source.headers.get("content-disposition"), /attachment/);
  const wrong = await call("/api/diagrams/wf/render.svg");
  assert.equal(wrong.status, 409);
  assert.equal(wrong.body.error.code, "wrong-engine");
  if (!(await call("/api/health")).body.rasterizer) {
    const png = await call("/api/diagrams/release/render.png");
    assert.equal(png.status, 501);
  }
});

test("archify endpoints: html render with ETag and validation receipt", async () => {
  const html = await call("/api/diagrams/wf/render.html");
  assert.equal(html.status, 200);
  assert.match(html.type, /text\/html/);
  assert.match(html.body, /<svg/);
  const etag = html.headers.get("etag");
  const cached = await fetch(`${base}/api/diagrams/wf/render.html`, { headers: { "if-none-match": etag } });
  assert.equal(cached.status, 304);
  const audit = await call("/api/diagrams/wf/audit");
  assert.equal(audit.body.ok, true);
  assert.equal(audit.body.receipt.checks.length, 9);
});

test("preview renders unsaved documents for both engines and reports errors", async () => {
  const board = await call("/api/preview", json({ source: gov }));
  assert.equal(board.body.ok, true);
  assert.match(board.body.svg, /^<svg/);
  assert.equal(board.body.audit.metrics.nodePiercings, 0);
  const broken = structuredClone(gov);
  broken.edges.push({ id: "zz", source: "P01", target: "missing" });
  const bad = await call("/api/preview", json({ source: broken }));
  assert.equal(bad.body.ok, false);
  assert.match(bad.body.errors[0].message, /missing/);
  const archify = await call("/api/preview", json({ source: workflow }));
  assert.equal(archify.body.ok, true);
  assert.match(archify.body.previewUrl, /^\/api\/preview\/[a-f0-9]+\.html$/);
  const page = await call(archify.body.previewUrl);
  assert.equal(page.status, 200);
  assert.match(page.body, /<svg/);
  assert.equal((await call("/api/preview/deadbeef.html")).status, 404);
  const unknown = await call("/api/preview", json({ source: { hello: 1 } }));
  assert.equal(unknown.body.ok, false);
  assert.equal(unknown.body.engine, null);
  const invalidArchify = structuredClone(workflow);
  invalidArchify.nodes[0].colour = "red";
  const diag = await call("/api/preview", json({ source: invalidArchify }));
  assert.equal(diag.body.ok, false);
  assert.ok(diag.body.diagnostics.some((d) => d.code === "schema/additionalProperties"));
  const missing = await call("/api/preview", json({}));
  assert.equal(missing.status, 400);
});

test("validate endpoint runs the thorough Archify receipt", async () => {
  const result = await call("/api/validate", json({ source: workflow, quality: "showcase" }));
  assert.equal(result.body.ok, true);
  assert.equal(result.body.receipt.composition.status, "pass");
  const quick = validateDocument(workflow);
  assert.equal(quick.ok, true);
  const board = await call("/api/validate", json({ source: generic }));
  assert.equal(board.body.audit.score, 0);
});

test("create / update with revisions / conflict / draft / delete / restore", async () => {
  const created = await call("/api/diagrams", json({ source: { ...generic, title: "새 보드" } }));
  assert.equal(created.status, 201);
  assert.equal(created.body.item.id, "새-보드");
  const duplicate = await call("/api/diagrams", json({ id: "새-보드", source: generic }));
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, "exists");
  const invalidId = await call("/api/diagrams", json({ id: "Bad Id", source: generic }));
  assert.equal(invalidId.status, 400);

  const revision = created.body.item.revision;
  const stale = await fetch(`${base}/api/diagrams/새-보드`, { ...json({ source: { ...generic, title: "A" }, revision: "0000000000000000" }), method: "PUT" });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, "conflict");
  const ok = await fetch(`${base}/api/diagrams/새-보드`, { ...json({ source: { ...generic, title: "A" }, revision }), method: "PUT" });
  assert.equal(ok.status, 200);
  const okBody = await ok.json();
  assert.equal(okBody.item.title, "A");

  const broken = structuredClone(generic);
  broken.nodes[0].lane = "Nope";
  const rejected = await fetch(`${base}/api/diagrams/새-보드`, { ...json({ source: broken, revision: okBody.item.revision }), method: "PUT" });
  assert.equal(rejected.status, 422);
  const draft = await fetch(`${base}/api/diagrams/새-보드`, { ...json({ source: broken, revision: okBody.item.revision, allowInvalid: true }), method: "PUT" });
  assert.equal(draft.status, 200);
  assert.equal((await draft.json()).validation.ok, false);

  const dup = await call("/api/diagrams/새-보드/duplicate", json({}));
  assert.equal(dup.status, 201);
  assert.equal(dup.body.item.id, "새-보드-copy");

  const removed = await fetch(`${base}/api/diagrams/새-보드`, { method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.equal((await call("/api/diagrams/새-보드")).status, 404);
  const trash = await call("/api/trash");
  assert.equal(trash.body.items[0].id, "새-보드");
  const restored = await call(`/api/trash/${encodeURIComponent(trash.body.items[0].file)}/restore`, { method: "POST" });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.item.id, "새-보드");
  assert.equal((await call("/api/trash/../x.json/restore", { method: "POST" })).status, 404);
});

test("static UI, security headers, unknown routes and body limits", async () => {
  const index = await call("/");
  assert.equal(index.status, 200);
  assert.match(index.body, /Hansol-100/);
  assert.match(index.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal((await call("/assets/app.js")).status, 200);
  assert.equal((await call("/assets/../package.json")).status, 404);
  assert.equal((await call("/api/nope")).status, 404);
  assert.equal((await call("/api/diagrams/a%2F..%2Fb")).status, 400);
  const method = await fetch(`${base}/api/diagrams/release`, { method: "PATCH" });
  assert.equal(method.status, 405);
  const huge = await call("/api/diagrams", { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(4 * 1024 * 1024 + 10) });
  assert.equal(huge.status, 413);
  const notJson = await call("/api/diagrams", { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" });
  assert.equal(notJson.status, 400);
});
