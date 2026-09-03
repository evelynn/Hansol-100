// Engine detection and document summaries shared by the CLI, the library and
// the web service. Hansol-100 drives two engines from one JSON-first surface:
//
//   board    — korea100studio swimlane process boards (board-v1 → SVG)
//   archify  — Archify typed IR (architecture / workflow / sequence /
//              dataflow / lifecycle → interactive HTML)
//
// Detection is structural, so the same file can flow through `hansol100
// render`, `hansol100 library add`, and the service without the user naming
// the engine.

export const ARCHIFY_TYPES = ["architecture", "workflow", "sequence", "dataflow", "lifecycle"];
export const KINDS = ["board", ...ARCHIFY_TYPES];

export const KIND_LABELS = {
  board: { ko: "프로세스 보드", en: "Process board" },
  architecture: { ko: "아키텍처", en: "Architecture" },
  workflow: { ko: "워크플로", en: "Workflow" },
  sequence: { ko: "시퀀스", en: "Sequence" },
  dataflow: { ko: "데이터 플로", en: "Data flow" },
  lifecycle: { ko: "라이프사이클", en: "Lifecycle" },
};

// Returns { engine, kind } or null when the document matches neither engine.
export function detectDocument(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  if (typeof doc.diagram_type === "string" && ARCHIFY_TYPES.includes(doc.diagram_type)) {
    return { engine: "archify", kind: doc.diagram_type };
  }
  if (
    Array.isArray(doc.lanes) &&
    Array.isArray(doc.stages) &&
    Array.isArray(doc.nodes) &&
    Array.isArray(doc.edges) &&
    typeof doc.title === "string"
  ) {
    return { engine: "board", kind: "board" };
  }
  return null;
}

export function outputFormatFor(engine) {
  return engine === "board" ? "svg" : "html";
}

export function isArchifyKind(kind) {
  return ARCHIFY_TYPES.includes(kind);
}

// Archify semantic/relationship collections per diagram type (mirrors the
// renderer contract documented in engines/archify/schemas/README.md).
const ARCHIFY_COLLECTIONS = {
  architecture: { nodes: "components", edges: "connections", lanes: "boundaries" },
  workflow: { nodes: "nodes", edges: "edges", lanes: "lanes", stages: "phases" },
  sequence: { nodes: "participants", edges: "messages", stages: "segments" },
  dataflow: { nodes: "nodes", edges: "flows", stages: "stages" },
  lifecycle: { nodes: "states", edges: "transitions", lanes: "lanes" },
};

const TEXT_KEYS = new Set(["label", "sublabel", "tag", "title", "note", "description", "items", "subtitle"]);

function labelsOf(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => (typeof item === "string" ? item : item?.label))
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());
}

function collectText(value, out, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (TEXT_KEYS.has(key)) {
        if (typeof item === "string" && item.trim()) out.push(item.trim());
        else if (Array.isArray(item)) {
          for (const s of item) if (typeof s === "string" && s.trim()) out.push(s.trim());
        }
      } else if (typeof item === "object") {
        collectText(item, out, depth + 1);
      }
    }
  }
}

// A compact, engine-neutral description used by library listings and search.
// `text` groups searchable strings by field so search can weight and quote them.
export function summarizeDocument(doc, detected = detectDocument(doc)) {
  if (!detected) return null;
  if (detected.engine === "board") {
    const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
    const edges = Array.isArray(doc.edges) ? doc.edges : [];
    return {
      engine: "board",
      kind: "board",
      title: String(doc.title ?? "").trim() || "(untitled)",
      subtitle: typeof doc.subtitle === "string" ? doc.subtitle.trim() : "",
      profile: typeof doc.profile === "string" && doc.profile ? doc.profile : "default",
      lanes: labelsOf(doc.lanes),
      stages: labelsOf(doc.stages),
      counts: {
        lanes: doc.lanes.length,
        stages: doc.stages.length,
        nodes: nodes.length,
        edges: edges.length,
      },
      text: {
        title: [String(doc.title ?? "")],
        subtitle: doc.subtitle ? [String(doc.subtitle)] : [],
        lanes: labelsOf(doc.lanes),
        stages: labelsOf(doc.stages),
        nodes: nodes.map((n) => n?.label).filter((s) => typeof s === "string" && s.trim()),
        notes: [
          ...nodes.map((n) => n?.note).filter((s) => typeof s === "string" && s.trim()),
          ...nodes.flatMap((n) => (Array.isArray(n?.refs) ? n.refs : []))
            .flatMap((r) => [r?.source, r?.note])
            .filter((s) => typeof s === "string" && s.trim()),
        ],
        edges: edges.map((e) => e?.label).filter((s) => typeof s === "string" && s.trim()),
        ids: [...nodes.map((n) => n?.id), ...edges.map((e) => e?.id)].filter((s) => typeof s === "string"),
      },
    };
  }

  const kind = detected.kind;
  const collections = ARCHIFY_COLLECTIONS[kind];
  const meta = doc.meta && typeof doc.meta === "object" ? doc.meta : {};
  const nodes = Array.isArray(doc[collections.nodes]) ? doc[collections.nodes] : [];
  const edges = Array.isArray(doc[collections.edges]) ? doc[collections.edges] : [];
  const lanes = collections.lanes ? labelsOf(doc[collections.lanes]) : [];
  const stages = collections.stages ? labelsOf(doc[collections.stages]) : [];
  const rest = [];
  collectText(doc.cards, rest);
  return {
    engine: "archify",
    kind,
    title: String(meta.title ?? "").trim() || "(untitled)",
    subtitle: typeof meta.subtitle === "string" ? meta.subtitle.trim() : "",
    profile: typeof meta.visual_preset === "string" ? meta.visual_preset : "classic",
    lanes,
    stages,
    counts: {
      lanes: lanes.length,
      stages: stages.length,
      nodes: nodes.length,
      edges: edges.length,
    },
    text: {
      title: [String(meta.title ?? "")],
      subtitle: meta.subtitle ? [String(meta.subtitle)] : [],
      lanes,
      stages,
      nodes: nodes.flatMap((n) => [n?.label, n?.sublabel, n?.tag]).filter((s) => typeof s === "string" && s.trim()),
      notes: rest,
      edges: edges.map((e) => e?.label).filter((s) => typeof s === "string" && s.trim()),
      ids: [...nodes.map((n) => n?.id), ...edges.map((e) => e?.id)].filter((s) => typeof s === "string"),
    },
  };
}
