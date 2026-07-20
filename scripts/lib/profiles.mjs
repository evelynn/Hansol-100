export const EMPHASIS_KEYS = ["lead", "key", "bottleneck", "loop", "normal"];

const GOV = {
  status: {
    lead: { label: "선행", fill: "#effaf5", border: "#35a77d", ink: "#123d2e", sub: "#287a5c" },
    key: { label: "핵심", fill: "#087452", border: "#087452", ink: "#ffffff", sub: "#d8f4e8" },
    normal: { label: "후속", fill: "#ffffff", border: "#b9c7bf", ink: "#17231d", sub: "#627169" },
    bottleneck: { label: "병목", fill: "#fff8e8", border: "#d9901a", ink: "#7a4305", sub: "#a96008" },
    loop: { label: "회귀", fill: "#edf4ff", border: "#3478db", ink: "#173f7a", sub: "#316bbd" },
  },
  refsLabel: "조문",
  accent: "#7c3aed",
  titleOverrides: {},
  // Connector used when a lane-group title summarizes more than 2 lanes,
  // e.g. "신청인 외 2". See layout.mjs summarizeGroupTitle.
  groupMore: "외",
  // Renderer chrome text (grid axis labels, legend, footer notes). Kept as
  // profile data (not hardcoded in render-svg.mjs) so the gov profile can
  // reproduce korea100's Korean UI copy while default stays English-neutral.
  // {lanes}/{groups}/{nodes}/{edges} are template placeholders substituted
  // by the renderer.
  labels: {
    stageAxis: "단계 ↓",
    actorAxis: "행위자 묶음 →",
    legendTitle: "읽는 법",
    sequenceLabel: "절차 순서",
    messageLabel: "정보 전달",
    loopLabel: "보완 회귀",
    statsTemplate: "노드 {nodes} · 레인 {lanes} · 게이트 {stages}",
    groupingNoteTemplate:
      "원래 {lanes}개 행위자 레인을 {groups}개 레이아웃 묶음으로 배치했으며, {nodes}개 업무와 {edges}개 연결 관계는 유지했습니다.",
    readingNote: "단계는 위→아래, 행위자 묶음은 좌→우로 읽습니다.",
    sourceNote:
      "출처: 해당 제도의 법률·시행령·시행규칙 기반 모델 · 실제 사건의 진행 상태나 법률 자문을 의미하지 않습니다.",
    // Intentionally blank: the korea100/대한민국 제도 100 project credit is
    // brand-specific, not just a language choice, so it is not reproduced here.
    creditLine: "",
  },
};

const DEFAULT = {
  status: {
    lead: { label: "Lead", fill: "#eef6ff", border: "#3b82f6", ink: "#1e3a5f", sub: "#3563a8" },
    key: { label: "Key", fill: "#1e293b", border: "#1e293b", ink: "#ffffff", sub: "#cbd5e1" },
    normal: { label: "Step", fill: "#ffffff", border: "#cbd5e1", ink: "#1f2937", sub: "#64748b" },
    bottleneck: { label: "Bottleneck", fill: "#fff7ed", border: "#ea9a1a", ink: "#7c4a03", sub: "#a8620a" },
    loop: { label: "Loop", fill: "#eef2ff", border: "#6366f1", ink: "#312e81", sub: "#4f46e5" },
  },
  refsLabel: "Refs",
  accent: "#2563eb",
  titleOverrides: {},
  // Connector used when a lane-group title summarizes more than 2 lanes,
  // e.g. "Requester +2". See layout.mjs summarizeGroupTitle.
  groupMore: "+",
  labels: {
    stageAxis: "Stage ↓",
    actorAxis: "Actor group →",
    legendTitle: "Legend",
    sequenceLabel: "Sequence",
    messageLabel: "Message",
    loopLabel: "Loop",
    statsTemplate: "{nodes} nodes · {lanes} lanes · {stages} stages",
    groupingNoteTemplate:
      "{lanes} actor lanes are arranged into {groups} layout groups; {nodes} tasks and {edges} connections are preserved.",
    readingNote: "Stages read top to bottom; actor groups read left to right.",
    sourceNote:
      "Source: process model derived from the underlying rules. Not legal advice and not an indicator of any real case status.",
    creditLine: "",
  },
};

// Hansol corporate profile: Korean business-process look for internal use.
// Badges read as approval-flow roles (주관/핵심/진행/지연/반려) and all chrome
// text is company-oriented (부서·담당 instead of 행위자, 근거 for internal
// 규정·지침 citations). Blue accent (#0f4c81) for a neutral corporate identity.
const HANSOL = {
  status: {
    lead: { label: "주관", fill: "#eaf3fb", border: "#2b7fc4", ink: "#123a5c", sub: "#2b6ca8" },
    key: { label: "핵심", fill: "#0f4c81", border: "#0f4c81", ink: "#ffffff", sub: "#cfe1f2" },
    normal: { label: "진행", fill: "#ffffff", border: "#c3ccd6", ink: "#1f2937", sub: "#5b6773" },
    bottleneck: { label: "지연", fill: "#fff7ea", border: "#d98a1a", ink: "#7a4605", sub: "#a8620a" },
    loop: { label: "반려", fill: "#fdecec", border: "#d1434b", ink: "#7a1f24", sub: "#b23239" },
  },
  refsLabel: "근거",
  accent: "#0f4c81",
  titleOverrides: {},
  groupMore: "외",
  labels: {
    stageAxis: "단계 ↓",
    actorAxis: "부서·담당 →",
    legendTitle: "읽는 법",
    sequenceLabel: "업무 흐름",
    messageLabel: "정보 공유",
    loopLabel: "반려·재작업",
    statsTemplate: "업무 {nodes} · 부서 {lanes} · 단계 {stages}",
    groupingNoteTemplate:
      "원래 {lanes}개 부서·담당 레인을 {groups}개 레이아웃 묶음으로 배치했으며, {nodes}개 업무와 {edges}개 연결 관계는 유지했습니다.",
    readingNote: "단계는 위→아래, 부서·담당은 좌→우로 읽습니다.",
    sourceNote:
      "한솔 사내 업무 프로세스 모델 · 실제 결재·전결 권한은 사내 규정 및 전결 규정을 따릅니다.",
    creditLine: "",
  },
};

const PROFILES = { default: DEFAULT, gov: GOV, hansol: HANSOL };

export function getProfile(name) {
  return PROFILES[name] ?? DEFAULT;
}
