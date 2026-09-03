// The built-in validator must agree with the ajv-compiled schema so a Skill
// checkout without `npm install` behaves exactly like a full install.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import { validateBoard, validateBoardBuiltin, VALIDATOR } from "../scripts/lib/validate.mjs";

const fixtures = ["fixtures/generic-sample.json", "fixtures/gov-sample.json"].map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const minimal = {
  schema_version: 1,
  title: "T",
  lanes: ["A"],
  stages: ["S"],
  nodes: [{ id: "n1", lane: "A", stage: "S", label: "x" }],
  edges: [],
};

const cases = [
  ["valid fixtures", fixtures[0], true],
  ["valid gov fixture", fixtures[1], true],
  ["minimal", minimal, true],
  ["missing required", { schema_version: 1, lanes: [], stages: [] }, false],
  ["wrong schema_version", { ...minimal, schema_version: 2 }, false],
  ["empty title", { ...minimal, title: "" }, false],
  ["empty lanes", { ...minimal, lanes: [] }, false],
  ["non-string lane", { ...minimal, lanes: [1] }, false],
  ["bad emphasis", { ...minimal, nodes: [{ ...minimal.nodes[0], emphasis: "explode" }] }, false],
  ["node missing label", { ...minimal, nodes: [{ id: "n1", lane: "A", stage: "S" }] }, false],
  ["refs without source", { ...minimal, nodes: [{ ...minimal.nodes[0], refs: [{ note: "x" }] }] }, false],
  ["bad edge type", { ...minimal, edges: [{ id: "e1", source: "n1", target: "n1", type: "teleport" }] }, false],
  ["edge missing target", { ...minimal, edges: [{ id: "e1", source: "n1" }] }, false],
  ["extra fields allowed", { ...minimal, extra: true, nodes: [{ ...minimal.nodes[0], custom: 1 }] }, true],
  ["not an object", [], false],
];

for (const [name, board, expected] of cases) {
  test(`builtin validator: ${name} → ${expected ? "valid" : "invalid"}`, () => {
    const errors = validateBoardBuiltin(board);
    assert.equal(errors.length === 0, expected, JSON.stringify(errors));
    for (const err of errors) {
      assert.equal(typeof err.instancePath, "string");
      assert.equal(typeof err.message, "string");
    }
  });
  test(`active validator (${VALIDATOR}) agrees: ${name}`, () => {
    assert.equal(validateBoard(board).valid, expected);
  });
}
