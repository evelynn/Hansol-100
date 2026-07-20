import assert from "node:assert/strict";
import test from "node:test";
import { buildProcessEdgeRouteSlots } from "../scripts/lib/layout.mjs";

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
