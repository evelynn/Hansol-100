import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { validateBoard } from "../scripts/lib/validate.mjs";
import { renderBoardSvg } from "../scripts/lib/render-svg.mjs";
import { computeComposition } from "../scripts/lib/composition.mjs";
import { buildMotionSvg } from "../scripts/lib/motion.mjs";

for (const f of ["generic-sample", "gov-sample"]) {
  test(`${f}: valid, renders, audits, animates`, () => {
    const board = JSON.parse(fs.readFileSync(`fixtures/${f}.json`, "utf8"));
    const profile = board.profile || "default";
    assert.equal(validateBoard(board).valid, true);
    const svg = renderBoardSvg(board, { profile });
    assert.match(svg, /^<svg/);
    const r = computeComposition(board, profile);
    assert.ok(Number.isFinite(r.score));
    const motion = buildMotionSvg(board, { profile });
    assert.match(motion, /<animate/);
  });
}
