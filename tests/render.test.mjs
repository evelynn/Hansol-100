import assert from "node:assert/strict";
import test from "node:test";
import { renderBoardSvg } from "../scripts/lib/render-svg.mjs";

const board = {
  schema_version: 1, title: "Procurement", subtitle: "demo",
  lanes: ["Requester", "Finance"], stages: ["Intake", "Approve"],
  nodes: [
    { id: "N1", lane: "Requester", stage: "Intake", label: "Submit", emphasis: "lead" },
    { id: "N2", lane: "Finance", stage: "Approve", label: "Approve", emphasis: "key" },
  ],
  edges: [{ id: "E1", source: "N1", target: "N2", type: "sequence", label: "route" }],
};

test("renders well-formed SVG containing the title and node labels", () => {
  const svg = renderBoardSvg(board, { profile: "default" });
  assert.match(svg, /^<svg/);
  assert.match(svg, /<\/svg>\s*$/);
  assert.ok(svg.includes("Procurement"));
  assert.ok(svg.includes("Submit") && svg.includes("Approve"));
});

test("gov profile renders Korean badge labels", () => {
  const svg = renderBoardSvg(board, { profile: "gov" });
  assert.ok(svg.includes("선행") || svg.includes("핵심"));
});
