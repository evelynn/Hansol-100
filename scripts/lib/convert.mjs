// Cross-engine conversion — the synergy layer between the two engines.
//
// A process board (lanes × stages) and an Archify workflow (lanes × columns)
// describe the same shape of information from two angles: the board gives a
// print-quality, government-style SVG with a composition audit; the workflow
// gives an interactive HTML with search, focus, route tracing and validation
// receipts. Converting between them lets one authored process serve both, and
// each result stays a first-class document of its own engine (it validates,
// renders and edits exactly like a hand-written one).
//
//   boardToWorkflow(board)     board-v1  → Archify workflow (schema_version 2)
//   workflowToBoard(workflow)  Archify workflow (v1 or v2) → board-v1
//   convertDocument(doc, to)   dispatch by detected engine
//
// The Archify side has hard layout rules (single-line node text, 0..5 logical
// columns, ≥8px between same-lane nodes). The converter mirrors the compiler's
// own text estimates so the output validates without a repair round, and
// anything it has to shorten is preserved verbatim in `cards`.

import { detectDocument } from "./detect.mjs";
import { getProfile } from "./profiles.mjs";

export class ConvertError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "ConvertError";
    this.code = code;
    if (details) this.details = details;
  }
}

// Archify workflow columns are logical ranks 0..5. Boards with more stages
// are converted in "rows" orientation (stages become Archify lanes, which are
// unbounded); MAX_STAGES is the product limit for that path.
export const MAX_WORKFLOW_COLUMNS = 6;
export const MAX_STAGES = 10;
export const ORIENTATIONS = ["auto", "columns", "rows"];
const CONVERSION_CARD_TITLE = "Hansol-100 · conversion";

// emphasis (board) ↔ component type (Archify). The Archify kinds are a fixed
// vocabulary; legend labels are overridden so the rendered legend reads in
// board terms (Lead / Key / Step / Bottleneck / Loop, or the gov profile's
// Korean badges) without changing the semantic kind.
export const TYPE_BY_EMPHASIS = {
  lead: "frontend",
  key: "backend",
  normal: "external",
  bottleneck: "security",
  loop: "messagebus",
};
export const EMPHASIS_BY_TYPE = {
  frontend: "lead",
  backend: "key",
  external: "normal",
  security: "bottleneck",
  messagebus: "loop",
  database: "normal",
  cloud: "normal",
};

// --- Archify text metrics (mirrors engines/archify/renderers/shared) -------
// Full-width characters (Hangul, CJK, emoji…) count as 2 units, as in
// Archify's textUnits().
const FULLWIDTH_RE = /[ᄀ-ᅟ⺀-꓏ꥠ-ꥼ가-힣豈-﫿︐-︙︰-﹯！-｠￠-￦\u{1F000}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;
const FIT = {
  labelPxPerUnit: 6.8, // compiler: label must satisfy units*6.8 <= width + 6
  labelSlack: 6,
  smallTextPxPerUnit: 6 * 0.6, // sublabel/tag at the 6px legible minimum × widthFactor 0.6
  horizontalPadding: 8,
  minWidth: 92,
  maxWidth: 200, // wider nodes push ranks apart and hurt desktop readability
  maxPhaseUnits: 22,
  maxEdgeLabelUnits: 26,
  nodeHeight: 52,
  nodeHeightWithTag: 68,
  stackGap: 12,
  longReturnSpan: 2, // return edges spanning this many columns backward leave/enter from the top
};

export function textUnits(text) {
  let units = 0;
  for (const char of Array.from(String(text ?? ""))) units += FULLWIDTH_RE.test(char) ? 2 : 1;
  return units;
}

function truncateToUnits(text, maxUnits) {
  const value = String(text ?? "").trim();
  if (textUnits(value) <= maxUnits) return { text: value, truncated: false };
  let out = "";
  let used = 0;
  for (const char of Array.from(value)) {
    const w = FULLWIDTH_RE.test(char) ? 2 : 1;
    if (used + w > maxUnits - 1) break; // leave room for the ellipsis
    out += char;
    used += w;
  }
  return { text: `${out.trimEnd()}…`, truncated: true };
}

const ARCHIFY_ID = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

// Deterministic, collision-free Archify ids from arbitrary board ids/names.
function idAllocator() {
  const used = new Set();
  return (raw, fallbackPrefix) => {
    let candidate = String(raw ?? "")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!candidate || !/^[a-zA-Z]/.test(candidate)) candidate = `${fallbackPrefix}${candidate ? `-${candidate}` : ""}`;
    if (!ARCHIFY_ID.test(candidate)) candidate = fallbackPrefix;
    let unique = candidate;
    for (let n = 2; used.has(unique); n += 1) unique = `${candidate}-${n}`;
    used.add(unique);
    return unique;
  };
}

function legendEntries(profile) {
  const status = getProfile(profile).status;
  const entries = {};
  for (const [emphasis, kind] of Object.entries(TYPE_BY_EMPHASIS)) entries[kind] = { label: status[emphasis].label };
  return entries;
}

// Fit label / sublabel / tag into one node width the way the compiler checks
// them; shorten text only when the widest allowed node still cannot hold it.
function fitNodeText({ label, sublabel, tag }) {
  const notes = [];
  const maxLabelUnits = Math.floor((FIT.maxWidth + FIT.labelSlack) / FIT.labelPxPerUnit);
  const maxSmallUnits = Math.floor((FIT.maxWidth - FIT.horizontalPadding) / FIT.smallTextPxPerUnit);
  const fittedLabel = truncateToUnits(label, maxLabelUnits);
  if (fittedLabel.truncated) notes.push({ field: "label", full: String(label).trim() });
  const fittedSub = sublabel ? truncateToUnits(sublabel, maxSmallUnits) : null;
  if (fittedSub?.truncated) notes.push({ field: "note", full: String(sublabel).trim() });
  const fittedTag = tag ? truncateToUnits(tag, maxSmallUnits) : null;
  if (fittedTag?.truncated) notes.push({ field: "ref", full: String(tag).trim() });
  const needed = Math.max(
    textUnits(fittedLabel.text) * FIT.labelPxPerUnit - FIT.labelSlack,
    fittedSub ? textUnits(fittedSub.text) * FIT.smallTextPxPerUnit + FIT.horizontalPadding : 0,
    fittedTag ? textUnits(fittedTag.text) * FIT.smallTextPxPerUnit + FIT.horizontalPadding : 0,
  );
  const width = Math.min(FIT.maxWidth, Math.max(FIT.minWidth, Math.ceil(needed) + 8));
  return { label: fittedLabel.text, sublabel: fittedSub?.text, tag: fittedTag?.text, width, notes };
}

// Even partition of actors into at most `groups` columns (rows orientation
// with more than 6 actors). Mirrors the board renderer's own lane grouping
// idea; titles read "A·B" or "A 외 2" / "A +2" using the profile connector.
function groupActors(lanes, groups, groupMore) {
  const count = Math.min(groups, lanes.length);
  const base = Math.floor(lanes.length / count);
  const remainder = lanes.length % count;
  const out = [];
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    const size = base + (i < remainder ? 1 : 0);
    const members = lanes.slice(cursor, cursor + size);
    cursor += size;
    const title = members.length === 1
      ? members[0]
      : members.length === 2
        ? `${members[0]}·${members[1]}`
        : /^[\p{L}]+$/u.test(groupMore) ? `${members[0]} ${groupMore} ${members.length - 1}` : `${members[0]} ${groupMore}${members.length - 1}`;
    out.push({ title, members });
  }
  return out;
}

export function resolveOrientation(board, orientation = "auto") {
  if (!ORIENTATIONS.includes(orientation)) throw new ConvertError("bad-orientation", `orientation must be one of ${ORIENTATIONS.join(", ")}`);
  if (orientation !== "auto") return orientation;
  return board.stages.length <= MAX_WORKFLOW_COLUMNS ? "columns" : "rows";
}

export function boardToWorkflow(board, { quality = "standard", animation, preset, orientation = "auto" } = {}) {
  const detected = detectDocument(board);
  if (!detected || detected.engine !== "board") throw new ConvertError("not-a-board", "source is not a board-v1 document");
  if (board.stages.length > MAX_STAGES) {
    throw new ConvertError(
      "too-many-stages",
      `Hansol-100 converts boards with up to ${MAX_STAGES} stages; this board has ${board.stages.length}. Merge adjacent stages first.`,
      { stages: board.stages.length, max: MAX_STAGES },
    );
  }
  const mode = resolveOrientation(board, orientation);
  if (mode === "columns" && board.stages.length > MAX_WORKFLOW_COLUMNS) {
    throw new ConvertError(
      "too-many-stages",
      `columns orientation supports at most ${MAX_WORKFLOW_COLUMNS} stages (Archify columns 0..5); this board has ${board.stages.length}. Use orientation "rows" (the default for 7–${MAX_STAGES} stages).`,
      { stages: board.stages.length, max: MAX_WORKFLOW_COLUMNS },
    );
  }
  const profile = board.profile || "default";
  const profileData = getProfile(profile);
  const nextId = idAllocator();
  const stageIndex = new Map(board.stages.map((name, i) => [name, i]));
  const nodeIds = new Map(board.nodes.map((node) => [node.id, nextId(node.id, "n")]));
  const phaseNotes = [];

  // Geometry: which board axis becomes Archify lanes (rows) and which becomes
  // columns. In "columns" mode stages are columns and actors are lanes (the
  // classic left-to-right workflow). In "rows" mode stages are lanes and
  // actors are columns, which reads exactly like the vertical board and lifts
  // the 6-column ceiling to MAX_STAGES.
  let lanes;
  let phases;
  let laneOf; // (node) => archify lane id
  let colOf; // (node) => column index
  let actorGroups = null;
  if (mode === "columns") {
    const laneIds = new Map(board.lanes.map((name, i) => [name, nextId(`lane-${i + 1}`, `lane-${i + 1}`)]));
    lanes = board.lanes.map((name) => ({ id: laneIds.get(name), label: name }));
    phases = board.stages.map((name, i) => {
      const fitted = truncateToUnits(name, FIT.maxPhaseUnits);
      if (fitted.truncated) phaseNotes.push(`${fitted.text} = ${name}`);
      return { id: nextId(`phase-${i + 1}`, `phase-${i + 1}`), label: fitted.text, fromCol: i, toCol: i };
    });
    laneOf = (node) => laneIds.get(node.lane);
    colOf = (node) => stageIndex.get(node.stage);
  } else {
    const stageIds = new Map(board.stages.map((name, i) => [name, nextId(`stage-${i + 1}`, `stage-${i + 1}`)]));
    lanes = board.stages.map((name) => ({ id: stageIds.get(name), label: name }));
    actorGroups = groupActors(board.lanes, MAX_WORKFLOW_COLUMNS, profileData.groupMore || "+");
    const columnOfActor = new Map();
    actorGroups.forEach((group, i) => group.members.forEach((actor) => columnOfActor.set(actor, i)));
    phases = actorGroups.map((group, i) => {
      const fitted = truncateToUnits(group.title, FIT.maxPhaseUnits);
      if (fitted.truncated) phaseNotes.push(`${fitted.text} = ${group.title}`);
      return { id: nextId(`actor-${i + 1}`, `actor-${i + 1}`), label: fitted.text, fromCol: i, toCol: i };
    });
    laneOf = (node) => stageIds.get(node.stage);
    colOf = (node) => columnOfActor.get(node.lane);
  }
  const grouped = Boolean(actorGroups && actorGroups.some((g) => g.members.length > 1));

  const stepNotes = [];
  const nodes = board.nodes.map((node) => {
    const ref = Array.isArray(node.refs) && node.refs.length ? node.refs[0] : null;
    // When actors share a column, the tag names the actor; the ref moves to cards.
    const tag = grouped ? node.lane : ref?.source;
    if (grouped && ref?.source) stepNotes.push(`${nodeIds.get(node.id)} · ref: ${ref.source}`);
    const fitted = fitNodeText({ label: node.label, sublabel: node.note, tag });
    for (const note of fitted.notes) stepNotes.push(`${nodeIds.get(node.id)} · ${note.field}: ${note.full}`);
    const out = {
      id: nodeIds.get(node.id),
      lane: laneOf(node),
      col: colOf(node),
      type: TYPE_BY_EMPHASIS[node.emphasis || "normal"] || "external",
      label: fitted.label,
      width: fitted.width,
    };
    if (fitted.sublabel) out.sublabel = fitted.sublabel;
    if (fitted.tag) out.tag = fitted.tag;
    return out;
  });

  // Nodes sharing a lane × column cell are stacked vertically around the lane
  // centre so the compiler's same-lane clearance rule holds.
  const cells = new Map();
  for (const node of nodes) {
    const key = `${node.lane} ${node.col}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(node);
  }
  for (const group of cells.values()) {
    if (group.length < 2) continue;
    const step = Math.max(...group.map((n) => (n.tag ? FIT.nodeHeightWithTag : FIT.nodeHeight))) + FIT.stackGap;
    group.forEach((node, i) => {
      node.yOffset = Math.round((i - (group.length - 1) / 2) * step);
    });
  }

  const stageOfNode = new Map(board.nodes.map((node) => [nodeIds.get(node.id), stageIndex.get(node.stage)]));
  const edgeNotes = [];
  const edges = board.edges.map((edge, i) => {
    const out = { id: nextId(edge.id, `e${i + 1}`), from: nodeIds.get(edge.source), to: nodeIds.get(edge.target) };
    if (edge.label && String(edge.label).trim()) {
      const fitted = truncateToUnits(edge.label, FIT.maxEdgeLabelUnits);
      if (fitted.truncated) edgeNotes.push(`${edge.id} · ${String(edge.label).trim()}`);
      out.label = fitted.text;
    }
    const type = edge.type || "sequence";
    if (type === "message") {
      out.variant = "dashed";
      out.role = "async";
    } else if (type === "loop") {
      out.variant = "emphasis";
      out.role = "return";
      // Long backward returns in columns mode are routed above the lanes;
      // automatic routing would otherwise drop them below the lanes and
      // across the legend. (In rows mode returns travel upward between lanes,
      // which automatic routing already handles.)
      const span = (stageOfNode.get(out.from) ?? 0) - (stageOfNode.get(out.to) ?? 0);
      if (mode === "columns" && span >= FIT.longReturnSpan) {
        out.fromSide = "top";
        out.toSide = "top";
      }
    } else {
      out.variant = "default";
    }
    return out;
  });

  const meta = { title: String(board.title) };
  if (board.subtitle && String(board.subtitle).trim()) meta.subtitle = String(board.subtitle).trim();
  if (quality) meta.quality_profile = quality;
  if (animation) meta.animation = animation;
  if (preset) meta.visual_preset = preset;
  meta.legend = { mode: "auto", entries: legendEntries(profile) };

  const workflow = { schema_version: 2, diagram_type: "workflow", meta, lanes, phases, nodes, edges };
  const cards = [];
  if (stepNotes.length) cards.push({ dot: "emerald", title: profile === "gov" ? "전체 명칭 (카드 축약분)" : "Full step text (shortened in cards)", items: stepNotes });
  if (phaseNotes.length) cards.push({ dot: "slate", title: profile === "gov" ? "단계 전체 명칭" : "Full stage names", items: phaseNotes });
  if (edgeNotes.length) cards.push({ dot: "violet", title: profile === "gov" ? "연결 라벨 전체" : "Full edge labels", items: edgeNotes });
  // Machine-readable provenance so the reverse conversion is exact. Archify
  // schemas reject unknown meta fields, so this lives in a visible card.
  cards.push({
    dot: "slate",
    title: CONVERSION_CARD_TITLE,
    items: [
      `orientation: ${mode}`,
      `profile: ${profile}`,
      `stages: ${board.stages.join(" | ")}`,
      `actors: ${board.lanes.join(" | ")}`,
      ...(grouped ? [`actor-columns: ${actorGroups.map((g) => g.members.join(" | ")).join(" || ")}`] : []),
    ],
  });
  workflow.cards = cards;
  return workflow;
}

function stageLabelsFromColumns(workflow) {
  const cols = new Set(workflow.nodes.map((n) => n.col));
  const maxCol = Math.max(-1, ...cols);
  const phases = Array.isArray(workflow.phases) ? [...workflow.phases].sort((a, b) => a.fromCol - b.fromCol) : [];
  const stageOfCol = new Map();
  const stages = [];
  const seen = new Set();
  const pushStage = (label) => {
    let unique = label;
    for (let n = 2; seen.has(unique); n += 1) unique = `${label} (${n})`;
    seen.add(unique);
    stages.push(unique);
    return unique;
  };
  for (let col = 0; col <= maxCol; col += 1) {
    if (!cols.has(col)) continue;
    const phase = phases.find((p) => p.fromCol <= col && col <= p.toCol);
    if (phase) {
      const key = `phase:${phase.id}`;
      if (!stageOfCol.has(key)) stageOfCol.set(key, pushStage(phase.label));
      stageOfCol.set(col, stageOfCol.get(key));
    } else {
      stageOfCol.set(col, pushStage(`Step ${col + 1}`));
    }
  }
  return { stages, stageOfCol };
}

// Which board profile produced a workflow's legend labels, if any. A match
// means the workflow came from boardToWorkflow (or was authored to look like
// it), so the reverse conversion can restore board semantics faithfully.
function conversionInfo(workflow) {
  const card = (workflow.cards || []).find((c) => c.title === CONVERSION_CARD_TITLE);
  if (!card) return null;
  const info = {};
  for (const item of card.items || []) {
    const match = /^([a-z-]+): (.*)$/.exec(String(item));
    if (match) info[match[1]] = match[2];
  }
  return info;
}

// Full text the forward conversion had to shorten, keyed by workflow node id.
function restoredText(workflow) {
  const restored = new Map();
  for (const card of workflow.cards || []) {
    if (card.title === CONVERSION_CARD_TITLE) continue;
    for (const item of card.items || []) {
      const match = /^(\S+) · (label|note|ref): (.+)$/.exec(String(item));
      if (!match) continue;
      if (!restored.has(match[1])) restored.set(match[1], {});
      restored.get(match[1])[match[2]] = match[3];
    }
  }
  return restored;
}

// Legend labels are the only trace of the source board profile in a plain
// Archify document; match them against the known profiles.
export function inferProfile(workflow) {
  const entries = workflow.meta?.legend?.entries;
  if (!entries) return null;
  for (const name of ["gov", "default"]) {
    const status = getProfile(name).status;
    const matches = Object.entries(TYPE_BY_EMPHASIS).every(([emphasis, kind]) => !entries[kind]?.label || entries[kind].label === status[emphasis].label);
    if (matches) return name;
  }
  return null;
}

export function workflowToBoard(workflow, { profile } = {}) {
  const detected = detectDocument(workflow);
  if (!detected || detected.kind !== "workflow") throw new ConvertError("not-a-workflow", "source is not an Archify workflow document");
  const info = conversionInfo(workflow);
  const converterOrigin = info !== null;
  const rows = info?.orientation === "rows";
  const resolvedProfile = profile ?? info?.profile ?? inferProfile(workflow) ?? "default";
  const restored = restoredText(workflow);

  const laneLabels = new Map();
  const seenLabels = new Set();
  for (const lane of workflow.lanes) {
    let label = String(lane.label);
    for (let n = 2; seenLabels.has(label); n += 1) label = `${lane.label} (${n})`;
    seenLabels.add(label);
    laneLabels.set(lane.id, label);
  }
  const colOf = new Map(workflow.nodes.map((n) => [n.id, n.col]));

  let stages;
  let actors;
  let stageOfNode;
  let actorOfNode;
  if (rows) {
    // Archify lanes are the board's stages; columns (phases) are actors or actor groups.
    stages = info.stages ? info.stages.split(" | ") : [...laneLabels.values()];
    const laneStage = new Map(workflow.lanes.map((lane, i) => [lane.id, stages[i] ?? laneLabels.get(lane.id)]));
    const grouped = Boolean(info["actor-columns"]);
    actors = info.actors ? info.actors.split(" | ") : null;
    const phases = [...(workflow.phases || [])].sort((a, b) => a.fromCol - b.fromCol);
    const columnActor = (col) => phases.find((p) => p.fromCol <= col && col <= p.toCol)?.label ?? `Actor ${col + 1}`;
    if (!actors) actors = [...new Set(workflow.nodes.map((n) => (grouped ? n.tag : columnActor(n.col))))];
    stageOfNode = (node) => laneStage.get(node.lane);
    actorOfNode = (node) => (grouped ? node.tag || columnActor(node.col) : columnActor(node.col));
  } else {
    const derived = stageLabelsFromColumns(workflow);
    stages = info?.stages ? info.stages.split(" | ") : derived.stages;
    const stageByCol = derived.stageOfCol;
    const derivedToFull = new Map(derived.stages.map((label, i) => [label, stages[i] ?? label]));
    actors = info?.actors ? info.actors.split(" | ") : [...laneLabels.values()];
    const laneActor = new Map(workflow.lanes.map((lane, i) => [lane.id, info?.actors ? actors[i] ?? laneLabels.get(lane.id) : laneLabels.get(lane.id)]));
    stageOfNode = (node) => derivedToFull.get(stageByCol.get(node.col)) ?? stageByCol.get(node.col);
    actorOfNode = (node) => laneActor.get(node.lane);
  }
  const grouped = rows && Boolean(info["actor-columns"]);

  const nodes = workflow.nodes.map((node) => {
    const full = restored.get(node.id) || {};
    const out = {
      id: node.id,
      lane: actorOfNode(node),
      stage: stageOfNode(node),
      label: full.label ?? String(node.label),
      emphasis: EMPHASIS_BY_TYPE[node.type] || "normal",
    };
    const note = full.note ?? node.sublabel;
    if (note && String(note).trim()) out.note = String(note).trim();
    const ref = full.ref ?? (grouped ? undefined : node.tag);
    if (converterOrigin) {
      if (ref && String(ref).trim()) out.refs = [{ source: String(ref).trim() }];
    } else if (node.tag && String(node.tag).trim()) {
      out.note = [out.note, String(node.tag).trim()].filter(Boolean).join(" · ");
    }
    return out;
  });
  const stageIndex = new Map(stages.map((name, i) => [name, i]));
  const stageOfId = new Map(nodes.map((n) => [n.id, stageIndex.get(n.stage) ?? 0]));
  const edges = workflow.edges.map((edge, i) => {
    const out = { id: edge.id || `e${i + 1}`, source: edge.from, target: edge.to };
    // Converter-origin documents encode the board edge type exactly in the
    // role, so invert it verbatim; for hand-written workflows a backward edge
    // is the closest board equivalent of a loop.
    const backward = !converterOrigin && (rows
      ? (stageOfId.get(edge.to) ?? 0) < (stageOfId.get(edge.from) ?? 0)
      : (colOf.get(edge.to) ?? 0) < (colOf.get(edge.from) ?? 0));
    if (edge.role === "return" || edge.role === "error" || backward) out.type = "loop";
    else if (edge.role === "async" || (!converterOrigin && edge.variant === "dashed")) out.type = "message";
    else out.type = "sequence";
    if (edge.label && String(edge.label).trim()) out.label = String(edge.label).trim();
    return out;
  });

  const board = { schema_version: 1, title: String(workflow.meta?.title || "Untitled") };
  if (workflow.meta?.subtitle) board.subtitle = String(workflow.meta.subtitle);
  if (resolvedProfile && resolvedProfile !== "default") board.profile = resolvedProfile;
  board.lanes = actors;
  board.stages = stages.length ? stages : ["Step 1"];
  board.nodes = nodes;
  board.edges = edges;
  return board;
}

export const CONVERSIONS = {
  board: { workflow: boardToWorkflow },
  workflow: { board: workflowToBoard },
};

export function conversionTargets(doc) {
  const detected = detectDocument(doc);
  if (!detected) return [];
  return Object.keys(CONVERSIONS[detected.kind] || {});
}

export function convertDocument(doc, to, options = {}) {
  const detected = detectDocument(doc);
  if (!detected) throw new ConvertError("unknown-document", "document is neither a board-v1 board nor an Archify diagram");
  const convert = CONVERSIONS[detected.kind]?.[to];
  if (!convert) {
    throw new ConvertError("unsupported", `cannot convert ${detected.kind} to ${to}; supported: ${conversionTargets(doc).join(", ") || "none"}`);
  }
  return { from: detected.kind, to, document: convert(doc, options) };
}
