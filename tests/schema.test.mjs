import assert from "node:assert/strict";
import test from "node:test";
import { validateBoard } from "../scripts/lib/validate.mjs";

const minimal = {
  schema_version: 1,
  title: "T",
  lanes: ["A", "B"],
  stages: ["S0", "S1"],
  nodes: [
    { id: "N1", lane: "A", stage: "S0", label: "start" },
    { id: "N2", lane: "B", stage: "S1", label: "end" },
  ],
  edges: [{ id: "E1", source: "N1", target: "N2", type: "sequence" }],
};

test("accepts a minimal valid board", () => {
  const { valid, errors } = validateBoard(minimal);
  assert.equal(valid, true, JSON.stringify(errors));
});

test("rejects a board missing required fields", () => {
  const { valid } = validateBoard({ schema_version: 1, lanes: [], stages: [] });
  assert.equal(valid, false);
});

test("rejects an unknown emphasis value", () => {
  const bad = structuredClone(minimal);
  bad.nodes[0].emphasis = "explode";
  const { valid } = validateBoard(bad);
  assert.equal(valid, false);
});
