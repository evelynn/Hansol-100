// The converter is the synergy between the engines: a board becomes a
// first-class Archify workflow and back. Both directions must produce
// documents that the *target* engine validates — no half-documents.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { boardToWorkflow, workflowToBoard, convertDocument, conversionTargets, inferBoardProfile, ConvertError, MAX_WORKFLOW_COLUMNS } from "../scripts/lib/convert.mjs";
import { validateArchify } from "../scripts/lib/archify-engine.mjs";
import { validateBoardDocument } from "../scripts/server/server.mjs";

const generic = JSON.parse(fs.readFileSync("fixtures/generic-sample.json", "utf8"));
const gov = JSON.parse(fs.readFileSync("fixtures/gov-sample.json", "utf8"));
const upstream = JSON.parse(fs.readFileSync("engines/archify/examples/agent-tool-call.workflow.json", "utf8"));
delete upstream.meta.output;

for (const [name, board] of [["generic-sample", generic], ["gov-sample", gov]]) {
  test(`${name}: board → workflow validates with the Archify engine`, () => {
    const workflow = boardToWorkflow(board);
    assert.equal(workflow.schema_version, 2);
    assert.equal(workflow.lanes.length, board.lanes.length);
    assert.equal(workflow.phases.length, board.stages.length);
    assert.equal(workflow.nodes.length, board.nodes.length);
    assert.equal(workflow.edges.length, board.edges.length);
    for (const node of workflow.nodes) assert.match(node.id, /^[a-zA-Z][a-zA-Z0-9_-]*$/);
    const receipt = validateArchify(workflow);
    assert.equal(receipt.ok, true, JSON.stringify((receipt.diagnostics || []).slice(0, 5), null, 1));
    assert.equal(receipt.composition.summary.errors, 0);
  });
}

test("stacked cells get distinct yOffsets (generic) and long labels get fitted widths + cards (gov)", () => {
  const stackedWorkflow = boardToWorkflow(generic);
  const cells = new Map();
  for (const node of stackedWorkflow.nodes) {
    const key = `${node.lane}:${node.col}`;
    cells.set(key, (cells.get(key) || 0) + 1);
  }
  const stacked = [...cells.entries()].filter(([, n]) => n > 1);
  assert.ok(stacked.length > 0, "generic fixture shares lane/stage cells (QA×Test, Release×Ship)");
  for (const [key] of stacked) {
    const [lane, col] = key.split(":");
    const offsets = stackedWorkflow.nodes.filter((n) => n.lane === lane && n.col === Number(col)).map((n) => n.yOffset || 0);
    assert.equal(new Set(offsets).size, offsets.length, `distinct yOffsets in ${key}`);
  }
  assert.ok(stackedWorkflow.nodes.every((n) => !n.label.endsWith("…")), "short English labels are never shortened");
  for (const card of stackedWorkflow.cards || []) assert.ok(card.items.every((item) => !item.includes("· label:")), "only notes may need shortening in the English fixture");

  const workflow = boardToWorkflow(gov);
  assert.ok(workflow.nodes.every((n) => n.width >= 92 && n.width <= 200));
  assert.ok(workflow.nodes.every((n) => n.label.length <= 40), "long Korean labels are shortened to fit one line");
  assert.equal(workflow.meta.legend.entries.backend.label, "핵심", "gov profile legend labels are Korean");
  assert.ok(Array.isArray(workflow.cards) && workflow.cards.length > 0, "full labels preserved in cards when shortened");
  assert.ok(workflow.cards[0].items.some((item) => item.includes(gov.nodes[0].label)));
  const longReturn = workflow.edges.find((e) => e.id === "L14");
  assert.equal(longReturn.fromSide, "top", "long backward returns leave from the top to stay clear of the legend");
});

test("workflow → board validates with the board engine (upstream example)", () => {
  const board = workflowToBoard(upstream);
  assert.equal(board.schema_version, 1);
  assert.deepEqual(board.stages, ["Intake", "Plan + route", "Execute + report"]);
  assert.equal(board.lanes.length, upstream.lanes.length);
  assert.equal(board.nodes.length, upstream.nodes.length);
  assert.equal(board.edges.length, upstream.edges.length);
  const validation = validateBoardDocument(board);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(validation.audit.metrics.nodePiercings, 0);
  assert.equal(board.edges.find((e) => e.id === "external-reply").type, "loop");
  assert.equal(board.edges.find((e) => e.id === "retry-request").type, "message");
});

test("round trip board → workflow → board keeps structure and semantics", () => {
  for (const board of [generic]) {
    const back = workflowToBoard(boardToWorkflow(board));
    assert.deepEqual(back.lanes, board.lanes);
    assert.deepEqual(back.stages, board.stages);
    assert.deepEqual(back.nodes.map((n) => [n.id, n.lane, n.stage, n.label, n.emphasis || "normal", n.note || ""]), board.nodes.map((n) => [n.id, n.lane, n.stage, n.label, n.emphasis || "normal", n.note || ""]));
    assert.deepEqual(back.edges.map((e) => [e.id, e.source, e.target, e.type || "sequence", e.label || ""]), board.edges.map((e) => [e.id, e.source, e.target, e.type || "sequence", e.label || ""]));
    assert.equal(validateBoardDocument(back).ok, true);
  }
  const govWorkflow = boardToWorkflow(gov);
  assert.equal(inferBoardProfile(govWorkflow), "gov", "profile is recoverable from the relabelled legend");
  assert.equal(inferBoardProfile(upstream), null);
  const govBack = workflowToBoard(govWorkflow);
  assert.equal(govBack.profile, "gov", "profile inferred without being passed");
  assert.deepEqual(govBack.lanes, gov.lanes);
  assert.deepEqual(govBack.stages, gov.stages);
  assert.deepEqual(govBack.nodes.map((n) => [n.id, n.lane, n.stage, n.label]), gov.nodes.map((n) => [n.id, n.lane, n.stage, n.label]), "shortened labels are restored from cards");
  assert.deepEqual(govBack.nodes.map((n) => n.refs?.[0]?.source || null), gov.nodes.map((n) => n.refs?.[0]?.source || null), "first ref restored as refs[0]");
  assert.deepEqual(govBack.edges.map((e) => [e.id, e.type, e.label || ""]), gov.edges.map((e) => [e.id, e.type || "sequence", e.label || ""]));
  assert.equal(validateBoardDocument(govBack).ok, true);
});

test("errors are explicit: too many stages, unsupported target, unknown document", () => {
  const wide = { ...generic, stages: Array.from({ length: MAX_WORKFLOW_COLUMNS + 1 }, (_, i) => `S${i}`), nodes: [], edges: [] };
  assert.throws(() => boardToWorkflow(wide), (err) => err instanceof ConvertError && err.code === "too-many-stages");
  const architecture = JSON.parse(fs.readFileSync("engines/archify/examples/web-app.architecture.json", "utf8"));
  assert.deepEqual(conversionTargets(architecture), []);
  assert.throws(() => convertDocument(architecture, "board"), (err) => err.code === "unsupported");
  assert.throws(() => convertDocument({ x: 1 }, "board"), (err) => err.code === "unknown-document");
  assert.deepEqual(conversionTargets(generic), ["workflow"]);
  assert.deepEqual(conversionTargets(upstream), ["board"]);
});

test("CLI convert writes the target document and reports validation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hansol-convert-"));
  try {
    const out = path.join(dir, "generic.workflow.json");
    const result = spawnSync(process.execPath, ["bin/hansol.mjs", "convert", "fixtures/generic-sample.json", "--to", "workflow", "--out", out, "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.to, "workflow");
    assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).diagram_type, "workflow");
    const back = spawnSync(process.execPath, ["bin/hansol.mjs", "convert", out, "--to", "board", "--out", path.join(dir, "back.json")], { encoding: "utf8" });
    assert.equal(back.status, 0, back.stderr);
    assert.match(back.stdout, /ok workflow → board/);
    const missing = spawnSync(process.execPath, ["bin/hansol.mjs", "convert", "fixtures/generic-sample.json"], { encoding: "utf8" });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /--to is required/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
