// The vendored Archify engine must stay a working, zero-install Skill package.
// These checks mirror Archify's own package-smoke gate (doctor, per-type
// validation, render + artifact check, SKILL.md path integrity).
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { archifyInfo, archifyRoot, renderArchifyHtml, runArchify, validateArchify, ARCHIFY_TEMPLATE_FILES, readArchifyTemplate } from "../scripts/lib/archify-engine.mjs";
import { ARCHIFY_TYPES } from "../scripts/lib/detect.mjs";

const root = archifyRoot();

test("engine is present, versioned, and provenance-tracked", () => {
  const info = archifyInfo();
  assert.ok(info.available, `missing ${root}`);
  assert.match(info.version, /^\d+\.\d+\.\d+/);
  assert.ok(info.vendor, "VENDOR.json missing");
  assert.equal(info.vendor.version, info.version);
  assert.match(info.vendor.source.commit, /^[a-f0-9]{7,40}$/);
  for (const forbidden of ["node_modules", "test", "package-lock.json", "scripts/generate-validators.mjs"]) {
    assert.ok(!fs.existsSync(path.join(root, forbidden)), `vendored engine must not contain ${forbidden}`);
  }
  for (const required of ["LICENSE", "THIRD_PARTY_NOTICES.md", "SKILL.md", "skill-release.json", "renderers/shared/generated-validators.mjs"]) {
    assert.ok(fs.existsSync(path.join(root, required)), `vendored engine is missing ${required}`);
  }
});

test("archify doctor reports ready", () => {
  const result = runArchify(["doctor"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Archify is ready/);
});

test("SKILL.md only references paths that exist in the package", () => {
  const skill = fs.readFileSync(path.join(root, "SKILL.md"), "utf8");
  const refs = [...skill.matchAll(/`((?:assets|bin|examples|recipes|references|renderers|schemas|scripts)\/[^`\s]+)`/g)]
    .map((m) => m[1])
    .filter((r) => !/[<>{}*[\]]/.test(r));
  assert.ok(refs.length > 0);
  for (const ref of new Set(refs)) assert.ok(fs.existsSync(path.join(root, ref)), `SKILL.md references missing ${ref}`);
});

for (const type of ARCHIFY_TYPES) {
  test(`${type}: template example validates with the packaged CLI`, () => {
    const doc = readArchifyTemplate(type);
    assert.ok(doc, `no template for ${type} (${ARCHIFY_TEMPLATE_FILES[type]})`);
    const receipt = validateArchify(doc);
    assert.equal(receipt.ok, true, JSON.stringify(receipt.diagnostics || receipt.error));
    assert.equal(receipt.type, type);
    assert.ok(receipt.checks.length >= 4);
  });
}

test("renderArchifyHtml returns standalone HTML and structured failures", () => {
  const workflow = readArchifyTemplate("workflow");
  const ok = renderArchifyHtml(workflow);
  assert.equal(ok.ok, true, ok.error);
  assert.match(ok.html, /<svg/);
  assert.match(ok.html, /<!doctype html>/i);
  const bad = structuredClone(workflow);
  bad.nodes[0].colour = "red";
  const failed = renderArchifyHtml(bad);
  assert.equal(failed.ok, false);
  assert.ok(failed.diagnostics.some((d) => d.code === "schema/additionalProperties"), JSON.stringify(failed.diagnostics));
  assert.throws(() => renderArchifyHtml({ diagram_type: "nope" }), /not an Archify document/);
});

test("deliver through the CLI produces a checked artifact", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hansol-archify-deliver-"));
  try {
    const input = path.join(dir, "arch.json");
    fs.writeFileSync(input, JSON.stringify(readArchifyTemplate("architecture")));
    const output = path.join(dir, "arch.html");
    const result = runArchify(["deliver", "architecture", input, output, "--json"], { cwd: dir });
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.validation.checksPassed, receipt.validation.checkCount);
    assert.ok(fs.existsSync(output));
    const check = runArchify(["check", output], { cwd: dir });
    assert.equal(check.status, 0, check.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
