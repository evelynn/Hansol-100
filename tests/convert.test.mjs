// The converter is the synergy between the engines: a board becomes a
// first-class Archify workflow and back. Both directions must produce
// documents that the *target* engine validates — no half-documents.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { boardToWorkflow, workflowToBoard, convertDocument, conversionTargets, resolveOrientation, inferProfile, ConvertError, MAX_WORKFLOW_COLUMNS, MAX_STAGES } from "../scripts/lib/convert.mjs";
import { validateArchify } from "../scripts/lib/archify-engine.mjs";
import { validateBoardDocument } from "../scripts/server/server.mjs";

const generic = JSON.parse(fs.readFileSync("fixtures/generic-sample.json", "utf8"));
const gov = JSON.parse(fs.readFileSync("fixtures/gov-sample.json", "utf8"));
const long = JSON.parse(fs.readFileSync("fixtures/long-sample.json", "utf8"));
const upstream = JSON.parse(fs.readFileSync("engines/archify/examples/agent-tool-call.workflow.json", "utf8"));
delete upstream.meta.output;

const pick = (b) => JSON.stringify([b.lanes, b.stages, b.profile || "default", b.nodes.map((n) => [n.id, n.lane, n.stage, n.label, n.emphasis || "normal", n.note || "", (n.refs || []).map((r) => r.source).join()]), b.edges.map((e) => [e.id, e.source, e.target, e.type || "sequence", e.label || ""])]);

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
  assert.ok(workflow.cards.some((card) => card.items.some((item) => item.includes(gov.nodes[0].label))));
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
  assert.equal(inferProfile(govWorkflow), "gov", "profile is recoverable from the relabelled legend");
  assert.equal(inferProfile(upstream), null);
  const govBack = workflowToBoard(govWorkflow);
  assert.equal(govBack.profile, "gov", "profile inferred without being passed");
  assert.deepEqual(govBack.lanes, gov.lanes);
  assert.deepEqual(govBack.stages, gov.stages);
  assert.deepEqual(govBack.nodes.map((n) => [n.id, n.lane, n.stage, n.label]), gov.nodes.map((n) => [n.id, n.lane, n.stage, n.label]), "shortened labels are restored from cards");
  assert.deepEqual(govBack.nodes.map((n) => n.refs?.[0]?.source || null), gov.nodes.map((n) => n.refs?.[0]?.source || null), "first ref restored as refs[0]");
  assert.deepEqual(govBack.edges.map((e) => [e.id, e.type, e.label || ""]), gov.edges.map((e) => [e.id, e.type || "sequence", e.label || ""]));
  assert.equal(validateBoardDocument(govBack).ok, true);
});

test("7–10 stages: rows orientation (stages become lanes, actors become columns) validates and round-trips losslessly", () => {
  assert.equal(long.stages.length, 10);
  assert.equal(resolveOrientation(long), "rows");
  assert.equal(resolveOrientation(gov), "columns");
  const workflow = boardToWorkflow(long);
  assert.equal(workflow.lanes.length, 10, "one Archify lane per stage");
  assert.equal(workflow.phases.length, long.lanes.length, "one column per actor");
  assert.ok(workflow.nodes.every((n) => n.col >= 0 && n.col <= 5));
  const receipt = validateArchify(workflow);
  assert.equal(receipt.ok, true, JSON.stringify((receipt.diagnostics || []).slice(0, 5), null, 1));
  assert.equal(receipt.composition.summary.errors, 0);
  const info = workflow.cards.find((c) => c.title === "Hansol-100 · conversion");
  assert.ok(info && info.items.includes("orientation: rows"));
  const back = workflowToBoard(workflow);
  assert.equal(pick(back), pick(long), "10-stage round trip is lossless");
  assert.equal(validateBoardDocument(back).ok, true);
});

test("rows orientation can be forced for short boards and groups more than 6 actors into columns", () => {
  const forced = boardToWorkflow(gov, { orientation: "rows" });
  assert.equal(forced.lanes.length, gov.stages.length);
  assert.equal(validateArchify(forced).ok, true);
  assert.equal(pick(workflowToBoard(forced)), pick(gov));

  const manyActors = structuredClone(long);
  manyActors.lanes = [...long.lanes, "감리자", "시공사", "이웃 주민"];
  manyActors.nodes.push({ id: "X1", lane: "감리자", stage: "G9 사후 관리", label: "감리 보고", emphasis: "normal" }, { id: "X2", lane: "시공사", stage: "G8 착공 신고", label: "착공 준비", emphasis: "normal" }, { id: "X3", lane: "이웃 주민", stage: "G5 심의", label: "의견 제출", emphasis: "normal", refs: [{ source: "민원 처리에 관한 법률" }] });
  manyActors.edges.push({ id: "EX1", source: "B16", target: "X2", type: "message" });
  const grouped = boardToWorkflow(manyActors);
  assert.equal(grouped.phases.length, 6, "8 actors share 6 columns");
  assert.ok(grouped.nodes.every((n) => n.tag), "grouped actors are named in the node tag");
  assert.equal(validateArchify(grouped).ok, true, JSON.stringify((validateArchify(grouped).diagnostics || []).slice(0, 3)));
  assert.equal(pick(workflowToBoard(grouped)), pick(manyActors), "grouped actors round-trip via the conversion card");
});

test("errors are explicit: more than 10 stages, forced columns over 6, unsupported target, unknown document", () => {
  const wide = { ...generic, stages: Array.from({ length: MAX_STAGES + 1 }, (_, i) => `S${i}`), nodes: [], edges: [] };
  assert.throws(() => boardToWorkflow(wide), (err) => err instanceof ConvertError && err.code === "too-many-stages");
  const seven = { ...generic, stages: Array.from({ length: MAX_WORKFLOW_COLUMNS + 1 }, (_, i) => `S${i}`), nodes: [], edges: [] };
  assert.throws(() => boardToWorkflow(seven, { orientation: "columns" }), (err) => err.code === "too-many-stages");
  assert.equal(boardToWorkflow(seven).lanes.length, 7, "auto picks rows for 7 stages");
  assert.throws(() => boardToWorkflow(generic, { orientation: "diagonal" }), (err) => err.code === "bad-orientation");
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
    const rows = spawnSync(process.execPath, ["bin/hansol.mjs", "convert", "fixtures/long-sample.json", "--to", "workflow", "--out", path.join(dir, "long.workflow.json"), "--json"], { encoding: "utf8" });
    assert.equal(rows.status, 0, rows.stderr);
    assert.equal(JSON.parse(rows.stdout).orientation, "rows");
    const forced = spawnSync(process.execPath, ["bin/hansol.mjs", "convert", "fixtures/gov-sample.json", "--to", "workflow", "--orientation", "rows", "--out", path.join(dir, "gov-rows.workflow.json"), "--json"], { encoding: "utf8" });
    assert.equal(forced.status, 0, forced.stderr);
    assert.equal(JSON.parse(forced.stdout).orientation, "rows");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
