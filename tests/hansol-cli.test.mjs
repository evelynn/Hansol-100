import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = "bin/hansol.mjs";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hansol-cli-"));

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", ...options });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("--help and --version", () => {
  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: hansol100/);
  assert.match(run([]).stdout, /Usage: hansol100/);
  assert.match(run(["--version"]).stdout.trim(), /^\d+\.\d+\.\d+/);
  assert.equal(run(["frobnicate"]).status, 2);
});

test("detect names the engine for boards and Archify diagrams", () => {
  assert.match(run(["detect", "fixtures/gov-sample.json"]).stdout, /^board\tboard\t/);
  const json = JSON.parse(run(["detect", "engines/archify/examples/agent-tool-call.workflow.json", "--json"]).stdout);
  assert.equal(json.engine, "archify");
  assert.equal(json.kind, "workflow");
  const unknown = run(["detect", "package.json"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /neither a board-v1 board .* nor an Archify diagram/);
});

test("render auto-detects: board → SVG, Archify → delivered HTML", () => {
  const svg = path.join(tmp, "board.svg");
  const board = run(["render", "fixtures/generic-sample.json", "--out", svg, "--json"]);
  assert.equal(board.status, 0, board.stderr);
  const receipt = JSON.parse(board.stdout);
  assert.equal(receipt.engine, "board");
  assert.equal(receipt.audit.metrics.nodePiercings, 0);
  assert.match(fs.readFileSync(svg, "utf8"), /^<svg/);

  const html = path.join(tmp, "workflow.html");
  const archify = run(["render", "engines/archify/examples/agent-tool-call.workflow.json", "--out", html]);
  assert.equal(archify.status, 0, archify.stderr);
  assert.match(archify.stdout, /ok workflow: \d+\/\d+ artifact checks/);
  assert.match(fs.readFileSync(html, "utf8"), /<svg/);
});

test("validate and audit report per engine and fail on invalid boards", () => {
  assert.match(run(["validate", "fixtures/gov-sample.json"]).stdout, /OK: .* valid board/);
  const audit = JSON.parse(run(["audit", "fixtures/gov-sample.json", "--json"]).stdout);
  assert.equal(audit.audit.metrics.nodePiercings, 0);
  const archify = run(["validate", "engines/archify/examples/web-app.architecture.json"]);
  assert.equal(archify.status, 0, archify.stderr);
  assert.match(archify.stdout, /^ok architecture/);

  const bad = path.join(tmp, "bad.json");
  fs.writeFileSync(bad, JSON.stringify({ schema_version: 1, title: "x", lanes: ["A"], stages: ["S"], nodes: [{ id: "n1", lane: "B", stage: "S", label: "l" }], edges: [] }));
  const invalid = run(["validate", bad]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /references lane "B"/);
  const invalidJson = JSON.parse(run(["validate", bad, "--json"]).stdout);
  assert.equal(invalidJson.ok, false);

  const badArchify = path.join(tmp, "bad-archify.json");
  const wf = JSON.parse(fs.readFileSync("engines/archify/examples/agent-tool-call.workflow.json", "utf8"));
  wf.nodes[0].colour = "red";
  fs.writeFileSync(badArchify, JSON.stringify(wf));
  const failed = run(["validate", badArchify]);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /schema\/additionalProperties/);
});

test("board and archify pass through to the underlying CLIs", () => {
  const board = run(["board", "audit", "fixtures/generic-sample.json", "--json"]);
  assert.equal(board.status, 0);
  assert.equal(JSON.parse(board.stdout).metrics.nodePiercings, 0);
  const archify = run(["archify", "guide", "cache miss request path", "--json"]);
  assert.equal(archify.status, 0, archify.stderr);
  assert.ok(JSON.parse(archify.stdout).recommendation || JSON.parse(archify.stdout).type || archify.stdout.length > 0);
});

test("library subcommands manage a JSON store", () => {
  const lib = path.join(tmp, "library");
  const added = run(["library", "add", "fixtures/gov-sample.json", "--library", lib]);
  assert.equal(added.status, 0, added.stderr);
  assert.match(added.stdout, /^행정심판-청구-심리-재결\t/);
  assert.equal(run(["library", "add", "fixtures/generic-sample.json", "--library", lib, "--id", "release"]).status, 0);
  const list = run(["library", "list", "--library", lib]);
  assert.match(list.stdout, /release\s+Process board\s+Software Release Process/);
  assert.match(list.stdout, /2 diagram\(s\)/);
  const search = JSON.parse(run(["library", "search", "심판", "--library", lib, "--json"]).stdout);
  assert.equal(search.total, 1);
  const shown = JSON.parse(run(["library", "show", "release", "--library", lib]).stdout);
  assert.equal(shown.title, "Software Release Process");

  const bad = path.join(tmp, "bad.json");
  assert.equal(run(["library", "add", bad, "--library", lib]).status, 1, "invalid documents are refused without --force");
  assert.equal(run(["library", "add", bad, "--library", lib, "--force", "--id", "draft"]).status, 0);

  const out = path.join(tmp, "export");
  const exported = run(["library", "export", "release", "--library", lib, "--out", out]);
  assert.equal(exported.status, 0, exported.stderr);
  assert.ok(fs.existsSync(path.join(out, "release.svg")));
  assert.ok(fs.existsSync(path.join(out, "release.motion.svg")));

  assert.match(run(["library", "remove", "draft", "--library", lib]).stdout, /moved to .*\.trash/);
  assert.equal(run(["library", "remove", "draft", "--library", lib]).status, 1);
  assert.equal(run(["library", "path", "--library", lib]).stdout.trim(), path.resolve(lib));
  assert.equal(run(["library", "bogus", "--library", lib]).status, 2);
});

test("doctor exits 0 in a complete checkout", () => {
  const doctor = run(["doctor"]);
  assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
  assert.match(doctor.stdout, /Hansol-100 is ready/);
});
