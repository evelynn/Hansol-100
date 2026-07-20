import assert from "node:assert/strict";
import test from "node:test";
import { getProfile, EMPHASIS_KEYS } from "../scripts/lib/profiles.mjs";

test("default profile covers every emphasis key", () => {
  const p = getProfile("default");
  for (const key of EMPHASIS_KEYS) assert.ok(p.status[key], `missing ${key}`);
});

test("gov profile uses Korean badge labels", () => {
  const p = getProfile("gov");
  assert.equal(p.status.lead.label, "선행");
  assert.equal(p.status.key.label, "핵심");
  assert.equal(p.status.bottleneck.label, "병목");
  assert.equal(p.status.loop.label, "회귀");
});

test("hansol profile uses corporate Korean badge labels", () => {
  const p = getProfile("hansol");
  assert.equal(p.status.lead.label, "주관");
  assert.equal(p.status.key.label, "핵심");
  assert.equal(p.status.normal.label, "진행");
  assert.equal(p.status.bottleneck.label, "지연");
  assert.equal(p.status.loop.label, "반려");
  assert.equal(p.refsLabel, "근거");
});

test("hansol profile covers every emphasis key", () => {
  const p = getProfile("hansol");
  for (const key of EMPHASIS_KEYS) assert.ok(p.status[key], `missing ${key}`);
});

test("unknown profile falls back to default", () => {
  assert.deepEqual(getProfile("nope"), getProfile("default"));
});
