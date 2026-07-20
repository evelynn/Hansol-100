import assert from "node:assert/strict";
import test from "node:test";
import { computeComposition, compositionScore } from "../scripts/lib/composition.mjs";

const board = {
  schema_version: 1, title: "t",
  lanes: ["A", "B"], stages: ["S0", "S1"],
  nodes: [
    { id: "N1", lane: "A", stage: "S0", label: "a" },
    { id: "N2", lane: "B", stage: "S1", label: "b" },
  ],
  edges: [{ id: "E1", source: "N1", target: "N2", type: "sequence" }],
};

test("computes finite metrics with bounded stretch", () => {
  const r = computeComposition(board, "default");
  assert.ok(Number.isFinite(r.metrics.crossings));
  // For this minimal 2-node board the routed path (border-to-border) is
  // legitimately shorter than the center-to-center Manhattan denominator,
  // so the ratio dips just under 1 — that matches korea100's unmodified
  // metric formula (verified against the source constants). The bound here
  // just guards against non-finite/exploding values, not a >=1 floor.
  assert.ok(r.metrics.routeStretchMax > 0 && r.metrics.routeStretchMax < 10);
});

test("score is monotonic in node-piercings", () => {
  const base = { nodePiercings: 0, crossings: 1, bendsPerEdgeMax: 2, routeStretchMax: 1.1, adjustedLabels: 0 };
  assert.ok(compositionScore({ ...base, nodePiercings: 3 }) > compositionScore(base));
});
