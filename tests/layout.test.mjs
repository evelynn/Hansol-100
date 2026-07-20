import assert from "node:assert/strict";
import test from "node:test";
import { buildProcessEdgeRouteSlots } from "../scripts/lib/layout.mjs";
import { buildLayout, edgeRoute, orthogonalSegments } from "../scripts/lib/layout.mjs";

test("spreads shared ports and overlapping row channels", () => {
  const edges = [
    { id: "E01", source: "A", target: "B", type: "sequence" },
    { id: "E02", source: "A", target: "C", type: "sequence" },
    { id: "E03", source: "D", target: "E", type: "message" },
  ];
  const positions = new Map([
    ["A", { stageIndex: 0, groupIndex: 2 }],
    ["B", { stageIndex: 3, groupIndex: 0 }],
    ["C", { stageIndex: 3, groupIndex: 0 }],
    ["D", { stageIndex: 0, groupIndex: 0 }],
    ["E", { stageIndex: 0, groupIndex: 2 }],
  ]);
  const slots = buildProcessEdgeRouteSlots(edges, positions);
  assert.notEqual(slots.get("E01").sourcePort, slots.get("E02").sourcePort);
  assert.equal(new Set(edges.map((e) => slots.get(e.id).channel)).size, 3);
});

const board = {
  schema_version: 1, title: "t",
  lanes: ["A", "B"], stages: ["S0", "S1"],
  nodes: [
    { id: "N1", lane: "A", stage: "S0", label: "a" },
    { id: "N2", lane: "B", stage: "S1", label: "b" },
  ],
  edges: [{ id: "E1", source: "N1", target: "N2", type: "sequence" }],
};

test("buildLayout places every node with pixel geometry", () => {
  const ctx = buildLayout(board, {});
  assert.equal(ctx.nodeLayout.size, 2);
  const n1 = ctx.nodeLayout.get("N1");
  assert.ok(n1.width > 0 && n1.height > 0);
});

test("edgeRoute yields an orthogonal path", () => {
  const ctx = buildLayout(board, {});
  const e = board.edges[0];
  const { path } = edgeRoute(e, ctx.nodeLayout.get("N1"), ctx.nodeLayout.get("N2"), ctx);
  assert.match(path, /^M /);
  assert.ok(orthogonalSegments(path).length >= 1);
});
