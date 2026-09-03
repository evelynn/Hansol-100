// Each engine must work on its own: the board engine without Archify
// (board-only mode), and Hansol-100 with an Archify that lives elsewhere
// (HANSOL_ARCHIFY_ROOT) instead of the vendored copy.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const generic = JSON.parse(fs.readFileSync("fixtures/generic-sample.json", "utf8"));
const workflow = JSON.parse(fs.readFileSync("engines/archify/examples/agent-tool-call.workflow.json", "utf8"));
delete workflow.meta.output;

function cli(args, env) {
  return spawnSync(process.execPath, ["bin/hansol.mjs", ...args], { encoding: "utf8", env: { ...process.env, ...env } });
}

test("board-only mode (explicitly missing Archify root): boards work, Archify features fail clearly", () => {
  const env = { HANSOL_ARCHIFY_ROOT: path.join(os.tmpdir(), "hansol-no-archify-here") };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hansol-board-only-"));
  try {
    const render = cli(["render", "fixtures/gov-sample.json", "--out", path.join(dir, "gov.svg")], env);
    assert.equal(render.status, 0, render.stderr);
    assert.match(fs.readFileSync(path.join(dir, "gov.svg"), "utf8"), /^<svg/);
    assert.equal(cli(["audit", "fixtures/generic-sample.json"], env).status, 0);
    const wf = path.join(dir, "wf.json");
    fs.writeFileSync(wf, JSON.stringify(workflow));
    const archify = cli(["validate", wf], env);
    assert.notEqual(archify.status, 0);
    assert.match(archify.stderr, /Archify engine not found/);
    const passthrough = cli(["archify", "doctor"], env);
    assert.notEqual(passthrough.status, 0);
    assert.match(passthrough.stderr, /Archify engine not found/);
    const doctor = cli(["doctor"], env);
    assert.equal(doctor.status, 1, "an explicit but broken root is a failure");
    assert.match(doctor.stdout, /has no bin\/archify\.mjs/);
    const lib = cli(["library", "add", "fixtures/generic-sample.json", "--library", path.join(dir, "lib")], env);
    assert.equal(lib.status, 0, lib.stderr);
    const convert = cli(["convert", wf, "--to", "board", "--out", path.join(dir, "board.json")], env);
    assert.equal(convert.status, 0, `workflow → board needs no Archify: ${convert.stderr}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("board-only service: health reports it, board endpoints work, Archify endpoints degrade", async () => {
  const previous = process.env.HANSOL_ARCHIFY_ROOT;
  process.env.HANSOL_ARCHIFY_ROOT = path.join(os.tmpdir(), "hansol-no-archify-here");
  const { createApp } = await import("../scripts/server/server.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hansol-board-only-server-"));
  fs.writeFileSync(path.join(dir, "release.json"), JSON.stringify(generic));
  fs.writeFileSync(path.join(dir, "wf.json"), JSON.stringify(workflow));
  const app = createApp({ libraryDir: dir });
  const { url } = await app.listen(0);
  const base = url.replace(/\/$/, "");
  const post = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.engines.archify.available, false);
    assert.equal(health.engines.archify.source, "env");
    const templates = await (await fetch(`${base}/api/templates`)).json();
    assert.ok(templates.items.every((tpl) => tpl.engine === "board"), "only board templates without Archify");
    assert.equal((await fetch(`${base}/api/diagrams/release/render.svg`)).status, 200);
    const list = await (await fetch(`${base}/api/diagrams`)).json();
    assert.equal(list.total, 2, "Archify documents are still listed");
    const html = await fetch(`${base}/api/diagrams/wf/render.html`);
    assert.equal(html.status, 422);
    assert.match((await html.json()).error.message, /Archify engine not found/);
    const preview = await (await fetch(`${base}/api/preview`, post({ source: workflow }))).json();
    assert.equal(preview.ok, false);
    assert.match(preview.error, /Archify engine not found/);
    const boardPreview = await (await fetch(`${base}/api/preview`, post({ source: generic }))).json();
    assert.equal(boardPreview.ok, true);
    const convert = await (await fetch(`${base}/api/convert`, post({ source: workflow, to: "board" }))).json();
    assert.equal(convert.ok, true, "workflow → board needs no Archify");
    assert.equal(convert.source.schema_version, 1);
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.HANSOL_ARCHIFY_ROOT;
    else process.env.HANSOL_ARCHIFY_ROOT = previous;
  }
});

test("external Archify root: HANSOL_ARCHIFY_ROOT wins over the vendored copy", () => {
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "hansol-external-archify-"));
  try {
    fs.cpSync(path.join("engines", "archify"), path.join(external, "archify"), { recursive: true });
    fs.rmSync(path.join(external, "archify", "VENDOR.json"), { force: true });
    const env = { HANSOL_ARCHIFY_ROOT: path.join(external, "archify") };
    const doctor = cli(["doctor"], env);
    assert.equal(doctor.status, 0, doctor.stdout);
    assert.match(doctor.stdout, /HANSOL_ARCHIFY_ROOT=/);
    const wf = path.join(external, "wf.json");
    fs.writeFileSync(wf, JSON.stringify(workflow));
    const validate = cli(["validate", wf], env);
    assert.equal(validate.status, 0, validate.stderr);
    assert.match(validate.stdout, /^ok workflow/);
    const convert = cli(["convert", "fixtures/generic-sample.json", "--to", "workflow", "--out", path.join(external, "out.json")], env);
    assert.equal(convert.status, 0, convert.stderr);
  } finally {
    fs.rmSync(external, { recursive: true, force: true });
  }
});
