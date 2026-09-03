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

// Archify workflow columns are logical ranks 0..5.
export const MAX_WORKFLOW_COLUMNS = 6;

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

export function boardToWorkflow(board, { quality = "standard", animation, preset } = {}) {
  const detected = detectDocument(board);
  if (!detected || detected.engine !== "board") throw new ConvertError("not-a-board", "source is not a board-v1 document");
  if (board.stages.length > MAX_WORKFLOW_COLUMNS) {
    throw new ConvertError(
      "too-many-stages",
      `Archify workflow supports at most ${MAX_WORKFLOW_COLUMNS} columns; this board has ${board.stages.length} stages. Merge adjacent stages first.`,
      { stages: board.stages.length, max: MAX_WORKFLOW_COLUMNS },
    );
  }
  const profile = board.profile || "default";
  const nextId = idAllocator();
  const laneIds = new Map(board.lanes.map((name, i) => [name, nextId(`lane-${i + 1}`, `lane-${i + 1}`)]));
  const stageIndex = new Map(board.stages.map((name, i) => [name, i]));
  const nodeIds = new Map(board.nodes.map((node) => [node.id, nextId(node.id, "n")]));

  const lanes = board.lanes.map((name) => ({ id: laneIds.get(name), label: name }));
  const phaseNotes = [];
  const phases = board.stages.map((name, i) => {
    const fitted = truncateToUnits(name, FIT.maxPhaseUnits);
    if (fitted.truncated) phaseNotes.push(`${fitted.text} = ${name}`);
    return { id: nextId(`phase-${i + 1}`, `phase-${i + 1}`), label: fitted.text, fromCol: i, toCol: i };
  });

  const stepNotes = [];
  const nodes = board.nodes.map((node) => {
    const ref = Array.isArray(node.refs) && node.refs.length ? node.refs[0] : null;
    const fitted = fitNodeText({ label: node.label, sublabel: node.note, tag: ref?.source });
    for (const note of fitted.notes) stepNotes.push(`${nodeIds.get(node.id)} · ${note.field}: ${note.full}`);
    const out = {
      id: nodeIds.get(node.id),
      lane: laneIds.get(node.lane),
      col: stageIndex.get(node.stage),
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

  const colOfNode = new Map(nodes.map((n) => [n.id, n.col]));
  const edgeNotes = [];
  const edges = board.edges.map((edge, i) => {
    const out = { id: nextId(edge.id, `e${i + 1}`), from: nodeIds.get(edge.source), to: nodeIds.get(edge.target) };
    if (edge.label && String(edge.label).trim()) {
      const fitted = truncateToUnits(edge.label, FIT.maxEdgeLabelUnits);
      if (fitted.truncated) edgeNotes.push(`${out.id} · label: ${String(edge.label).trim()}`);
      out.label = fitted.text;
    }
    const type = edge.type || "sequence";
    if (type === "message") {
      out.variant = "dashed";
      out.role = "async";
    } else if (type === "loop") {
      out.variant = "emphasis";
      out.role = "return";
      // Long backward returns are routed above the lanes; automatic routing
      // would otherwise drop them below the lanes and across the legend.
      const span = (colOfNode.get(out.from) ?? 0) - (colOfNode.get(out.to) ?? 0);
      if (span >= FIT.longReturnSpan) {
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
  if (cards.length) workflow.cards = cards;
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
export function inferBoardProfile(workflow) {
  const entries = workflow?.meta?.legend?.entries;
  if (!entries || typeof entries !== "object") return null;
  for (const name of ["gov", "default"]) {
    const status = getProfile(name).status;
    const matches = Object.entries(TYPE_BY_EMPHASIS).every(([emphasis, kind]) => !entries[kind] || entries[kind].label === status[emphasis].label);
    const any = Object.values(TYPE_BY_EMPHASIS).some((kind) => entries[kind]?.label);
    if (matches && any) return name;
  }
  return null;
}

// Full text that boardToWorkflow had to shorten lives in cards as
// "<id> · label|note|ref: <full text>"; read it back.
function restoredText(workflow) {
  const restored = new Map();
  for (const card of Array.isArray(workflow.cards) ? workflow.cards : []) {
    for (const item of Array.isArray(card.items) ? card.items : []) {
      const match = /^(.+?) · (label|note|ref): (.+)$/s.exec(String(item));
      if (!match) continue;
      if (!restored.has(match[1])) restored.set(match[1], {});
      restored.get(match[1])[match[2]] = match[3].trim();
    }
  }
  return restored;
}

export function workflowToBoard(workflow, { profile } = {}) {
  const detected = detectDocument(workflow);
  if (!detected || detected.kind !== "workflow") throw new ConvertError("not-a-workflow", "source is not an Archify workflow document");
  const inferredProfile = inferBoardProfile(workflow);
  const fromBoard = inferredProfile !== null;
  const restored = restoredText(workflow);
  const laneLabels = new Map();
  const seenLabels = new Set();
  for (const lane of workflow.lanes) {
    let label = String(lane.label);
    for (let n = 2; seenLabels.has(label); n += 1) label = `${lane.label} (${n})`;
    seenLabels.add(label);
    laneLabels.set(lane.id, label);
  }
  const { stages, stageOfCol } = stageLabelsFromColumns(workflow);
  const colOf = new Map(workflow.nodes.map((n) => [n.id, n.col]));

  const nodes = workflow.nodes.map((node) => {
    const full = restored.get(node.id) || {};
    const out = {
      id: node.id,
      lane: laneLabels.get(node.lane),
      stage: stageOfCol.get(node.col),
      label: full.label || String(node.label),
      emphasis: EMPHASIS_BY_TYPE[node.type] || "normal",
    };
    const sublabel = full.note || (node.sublabel && String(node.sublabel).trim());
    const tag = full.ref || (node.tag && String(node.tag).trim());
    if (fromBoard) {
      // A converted board carried note → sublabel and refs[0].source → tag.
      if (sublabel) out.note = sublabel;
      if (tag) out.refs = [{ source: tag }];
    } else {
      const note = [sublabel, tag].filter(Boolean).join(" · ");
      if (note) out.note = note;
    }
    return out;
  });
  const edges = workflow.edges.map((edge, i) => {
    const id = edge.id || `e${i + 1}`;
    const out = { id, source: edge.from, target: edge.to };
    const backward = (colOf.get(edge.to) ?? 0) < (colOf.get(edge.from) ?? 0);
    if (edge.role === "return" || edge.role === "error" || backward) out.type = "loop";
    else if (edge.role === "async" || edge.variant === "dashed") out.type = "message";
    else out.type = "sequence";
    const label = restored.get(id)?.label || (edge.label && String(edge.label).trim());
    if (label) out.label = label;
    return out;
  });

  const board = { schema_version: 1, title: String(workflow.meta?.title || "Untitled") };
  if (workflow.meta?.subtitle) board.subtitle = String(workflow.meta.subtitle);
  const resolvedProfile = profile || inferredProfile || "default";
  if (resolvedProfile !== "default") board.profile = resolvedProfile;
  board.lanes = [...laneLabels.values()];
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
