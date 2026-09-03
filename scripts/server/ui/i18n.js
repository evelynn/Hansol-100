// UI strings. Korean is the primary language; English is a full mirror.
const DICT = {
  ko: {
    "nav.library": "라이브러리", "nav.new": "새로 만들기 ▾", "nav.import": "가져오기", "nav.trash": "휴지통",
    "kind.board": "프로세스 보드", "kind.architecture": "아키텍처", "kind.workflow": "워크플로", "kind.sequence": "시퀀스", "kind.dataflow": "데이터 플로", "kind.lifecycle": "라이프사이클", "kind.invalid": "손상됨",
    "library.title": "라이브러리", "library.subtitle": "프로세스 보드와 Archify 다이어그램을 검색·열람·편집합니다",
    "library.search": "제목, 레인, 단계, 노드, 메모 검색…", "library.all": "전체", "library.count": "{n}개", "library.matches": "{n}개 일치",
    "library.empty": "아직 다이어그램이 없습니다", "library.emptyHint": "“새로 만들기”로 시작하거나, 스킬(에이전트)이 만든 JSON을 가져오세요.", "library.noResults": "검색 결과가 없습니다",
    "sort.updated": "최근 수정순", "sort.title": "제목순",
    "action.view": "보기", "action.edit": "편집", "action.duplicate": "복제", "action.delete": "삭제", "action.export": "내보내기 ▾", "action.save": "저장", "action.saveAs": "다른 이름으로 저장", "action.revert": "되돌리기", "action.back": "← 라이브러리", "action.restore": "복원", "action.validate": "검증", "action.format": "정렬", "action.open": "열기", "action.openNew": "새 창에서 열기",
    "confirm.delete": "“{title}” 을(를) 휴지통으로 이동할까요?", "confirm.saveInvalid": "유효성 오류가 있습니다. 초안(draft)으로 저장할까요?", "confirm.conflict": "다른 사용자가 이 다이어그램을 먼저 수정했습니다. 내 변경으로 덮어쓸까요?\n(취소하면 최신 버전을 다시 불러옵니다)", "confirm.leave": "저장하지 않은 변경이 있습니다. 이동할까요?", "confirm.revert": "마지막 저장 상태로 되돌릴까요?",
    "toast.saved": "저장했습니다", "toast.deleted": "휴지통으로 이동했습니다", "toast.duplicated": "복제했습니다: {id}", "toast.restored": "복원했습니다: {id}", "toast.error": "오류: {message}", "toast.reloaded": "최신 버전을 불러왔습니다", "toast.exported": "{name} 내보내기 완료",
    "viewer.tab.board": "보드", "viewer.tab.motion": "모션 (단계 순차 재생)",
    "zoom.fitWidth": "너비 맞춤", "zoom.fitPage": "페이지 맞춤", "zoom.actual": "실제 크기",
    "side.info": "정보", "side.quality": "구성 품질", "side.validation": "검증", "side.export": "내보내기", "side.lanes": "레인", "side.stages": "단계",
    "info.id": "ID", "info.kind": "종류", "info.profile": "프로필", "info.lanes": "레인", "info.stages": "단계", "info.nodes": "노드", "info.edges": "연결", "info.updated": "수정", "info.revision": "리비전", "info.bytes": "크기",
    "metric.score": "점수 (낮을수록 깔끔)", "metric.nodePiercings": "노드 관통", "metric.crossings": "교차", "metric.bendsPerEdgeMax": "최대 꺾임", "metric.routeStretchMax": "최대 우회율", "metric.adjustedLabels": "조정된 라벨",
    "quality.clean": "구성 예산 이내입니다", "quality.violations": "예산 위반 {n}건: {list}",
    "validation.run": "Archify 검증 실행", "validation.pass": "통과 ({profile}) · {passed}/{count} 검사 · 구성 오류 {errors}, 경고 {warnings}", "validation.fail": "검증 실패", "validation.running": "검증 중…", "validation.hint": "렌더 + 9개 아티팩트 검사를 문서의 quality_profile(기본 standard, showcase는 더 엄격) 기준으로 실행합니다 (약 1초)",
    "export.json": "JSON (원본)", "export.svg": "SVG", "export.png": "PNG (브라우저 생성, 1800px)", "export.png2x": "PNG 2배 (3600px)", "export.motion": "모션 SVG", "export.html": "HTML (독립 실행 뷰어)",
    "editor.new": "새 다이어그램", "editor.tab.form": "폼", "editor.tab.json": "JSON",
    "editor.status.saved": "저장됨", "editor.status.dirty": "수정됨 · 저장 안 됨", "editor.status.new": "새 문서 · 저장 안 됨", "editor.status.saving": "저장 중…",
    "editor.idLabel": "ID", "editor.idHint": "소문자·숫자·한글·-._ (비우면 제목에서 생성)",
    "editor.preview": "미리보기", "editor.previewValid": "유효", "editor.previewInvalid": "오류 {n}건", "editor.previewPending": "렌더링 중…", "editor.previewIdle": "대기",
    "editor.jsonOnlyHint": "이 종류는 JSON으로 편집합니다. 스키마: engines/archify/schemas/{kind}.schema.json · 검증은 오른쪽 상단 “검증” 버튼", "editor.jsonHint": "JSON을 직접 편집하면 폼과 미리보기가 함께 갱신됩니다",
    "form.basic": "기본 정보", "form.title": "제목", "form.subtitle": "부제", "form.profile": "프로필", "form.profile.default": "default (영문 배지)", "form.profile.gov": "gov (한국어 배지: 선행/핵심/병목/회귀)",
    "form.lanes": "레인 (행위자 · 좌→우)", "form.stages": "단계 (위→아래)", "form.nodes": "노드 (업무)", "form.edges": "연결",
    "form.addLane": "+ 레인", "form.addStage": "+ 단계", "form.addNode": "+ 노드", "form.addEdge": "+ 연결",
    "form.label": "라벨", "form.note": "메모 (카드 하단)", "form.refs": "참조 — 한 줄에 하나: 출처 | 메모", "form.emphasis": "강조", "form.type": "유형", "form.edgeLabel": "연결 라벨",
    "emphasis.lead": "선행 (lead)", "emphasis.key": "핵심 (key)", "emphasis.normal": "일반 (normal)", "emphasis.bottleneck": "병목 (bottleneck)", "emphasis.loop": "회귀 (loop)",
    "edgeType.sequence": "순서 (sequence)", "edgeType.message": "정보 전달 (message)", "edgeType.loop": "회귀 (loop)",
    "form.newLane": "새 레인", "form.newStage": "새 단계", "form.newNode": "새 업무",
    "form.moveUp": "위로", "form.moveDown": "아래로", "form.remove": "삭제", "form.renameHint": "이름을 바꾸면 노드의 참조도 함께 바뀝니다",
    "import.title": "가져오기", "import.subtitle": "스킬(에이전트)이 만든 JSON을 붙여넣거나 파일을 선택하세요. 보드(board-v1)와 Archify 다이어그램을 자동 인식합니다.", "import.placeholder": "{ \"schema_version\": 1, \"title\": \"…\", \"lanes\": [...], ... }", "import.file": "파일 선택", "import.go": "편집기로 열기", "import.invalidJson": "JSON 구문 오류: {message}", "import.unknown": "보드(board-v1)도 Archify 다이어그램도 아닙니다",
    "trash.title": "휴지통", "trash.subtitle": "삭제한 다이어그램은 여기서 복원할 수 있습니다. (파일은 library/.trash 에 보관됩니다)", "trash.empty": "휴지통이 비어 있습니다",
    "new.boards": "프로세스 보드", "new.archify": "Archify 다이어그램",
    "engine.ok": "엔진 준비됨 · Archify {v}", "engine.noArchify": "Archify 엔진 없음", "engine.boardOnly": "보드 전용 모드 (Archify 없음)",
    "action.convertTo.workflow": "→ Archify 워크플로로 변환", "action.convertTo.board": "→ 프로세스 보드로 변환", "convert.hint": "같은 프로세스를 다른 엔진 문서로 만들어 편집기에서 엽니다 (저장 전까지 원본은 그대로)",
    "toast.converted": "변환 완료 — 편집기에서 검토 후 저장하세요", "toast.convertedInvalid": "변환 완료, 검증 오류 {n}건 — 편집기에서 확인하세요", "side.renditions": "다른 형식 (같은 제목)",
    "misc.loading": "불러오는 중…", "misc.notFound": "다이어그램을 찾을 수 없습니다: {id}", "misc.updated": "{when} 수정", "misc.searchHelp": "검색어를 띄어쓰기로 나누면 모두 포함된 항목만 찾습니다 (예: 심판 재결)",
  },
  en: {
    "nav.library": "Library", "nav.new": "New ▾", "nav.import": "Import", "nav.trash": "Trash",
    "kind.board": "Process board", "kind.architecture": "Architecture", "kind.workflow": "Workflow", "kind.sequence": "Sequence", "kind.dataflow": "Data flow", "kind.lifecycle": "Lifecycle", "kind.invalid": "Broken",
    "library.title": "Library", "library.subtitle": "Browse, search and edit process boards and Archify diagrams",
    "library.search": "Search titles, lanes, stages, nodes, notes…", "library.all": "All", "library.count": "{n} diagrams", "library.matches": "{n} matches",
    "library.empty": "No diagrams yet", "library.emptyHint": "Start with “New”, or import JSON authored with the Skill.", "library.noResults": "No results",
    "sort.updated": "Recently updated", "sort.title": "By title",
    "action.view": "View", "action.edit": "Edit", "action.duplicate": "Duplicate", "action.delete": "Delete", "action.export": "Export ▾", "action.save": "Save", "action.saveAs": "Save as", "action.revert": "Revert", "action.back": "← Library", "action.restore": "Restore", "action.validate": "Validate", "action.format": "Format", "action.open": "Open", "action.openNew": "Open in new tab",
    "confirm.delete": "Move “{title}” to trash?", "confirm.saveInvalid": "There are validation errors. Save as a draft anyway?", "confirm.conflict": "Someone else modified this diagram first. Overwrite with your changes?\n(Cancel reloads the latest version)", "confirm.leave": "You have unsaved changes. Leave anyway?", "confirm.revert": "Revert to the last saved state?",
    "toast.saved": "Saved", "toast.deleted": "Moved to trash", "toast.duplicated": "Duplicated: {id}", "toast.restored": "Restored: {id}", "toast.error": "Error: {message}", "toast.reloaded": "Loaded the latest version", "toast.exported": "Exported {name}",
    "viewer.tab.board": "Board", "viewer.tab.motion": "Motion (stage reveal)",
    "zoom.fitWidth": "Fit width", "zoom.fitPage": "Fit page", "zoom.actual": "Actual size",
    "side.info": "Info", "side.quality": "Composition quality", "side.validation": "Validation", "side.export": "Export", "side.lanes": "Lanes", "side.stages": "Stages",
    "info.id": "ID", "info.kind": "Kind", "info.profile": "Profile", "info.lanes": "Lanes", "info.stages": "Stages", "info.nodes": "Nodes", "info.edges": "Edges", "info.updated": "Updated", "info.revision": "Revision", "info.bytes": "Size",
    "metric.score": "Score (lower is cleaner)", "metric.nodePiercings": "Node piercings", "metric.crossings": "Crossings", "metric.bendsPerEdgeMax": "Max bends", "metric.routeStretchMax": "Max stretch", "metric.adjustedLabels": "Adjusted labels",
    "quality.clean": "Within the composition budget", "quality.violations": "{n} budget violations: {list}",
    "validation.run": "Run Archify validation", "validation.pass": "Passed ({profile}) · {passed}/{count} checks · {errors} composition errors, {warnings} warnings", "validation.fail": "Validation failed", "validation.running": "Validating…", "validation.hint": "Renders and runs the 9 artifact checks at the document's quality_profile (standard by default; showcase is stricter) (about 1s)",
    "export.json": "JSON (source)", "export.svg": "SVG", "export.png": "PNG (rendered in browser, 1800px)", "export.png2x": "PNG 2× (3600px)", "export.motion": "Motion SVG", "export.html": "HTML (standalone viewer)",
    "editor.new": "New diagram", "editor.tab.form": "Form", "editor.tab.json": "JSON",
    "editor.status.saved": "Saved", "editor.status.dirty": "Modified · unsaved", "editor.status.new": "New · unsaved", "editor.status.saving": "Saving…",
    "editor.idLabel": "ID", "editor.idHint": "lowercase, digits, Hangul, -._ (blank = from title)",
    "editor.preview": "Preview", "editor.previewValid": "Valid", "editor.previewInvalid": "{n} errors", "editor.previewPending": "Rendering…", "editor.previewIdle": "Idle",
    "editor.jsonOnlyHint": "This kind is edited as JSON. Schema: engines/archify/schemas/{kind}.schema.json · use “Validate” (top right) for the full check", "editor.jsonHint": "Editing the JSON updates the form and the preview",
    "form.basic": "Basics", "form.title": "Title", "form.subtitle": "Subtitle", "form.profile": "Profile", "form.profile.default": "default (English badges)", "form.profile.gov": "gov (Korean badges: 선행/핵심/병목/회귀)",
    "form.lanes": "Lanes (actors · left→right)", "form.stages": "Stages (top→bottom)", "form.nodes": "Nodes (steps)", "form.edges": "Edges",
    "form.addLane": "+ Lane", "form.addStage": "+ Stage", "form.addNode": "+ Node", "form.addEdge": "+ Edge",
    "form.label": "Label", "form.note": "Note (card footer)", "form.refs": "References — one per line: source | note", "form.emphasis": "Emphasis", "form.type": "Type", "form.edgeLabel": "Edge label",
    "emphasis.lead": "Lead", "emphasis.key": "Key", "emphasis.normal": "Normal", "emphasis.bottleneck": "Bottleneck", "emphasis.loop": "Loop",
    "edgeType.sequence": "Sequence", "edgeType.message": "Message", "edgeType.loop": "Loop",
    "form.newLane": "New lane", "form.newStage": "New stage", "form.newNode": "New step",
    "form.moveUp": "Up", "form.moveDown": "Down", "form.remove": "Remove", "form.renameHint": "Renaming updates the nodes that reference it",
    "import.title": "Import", "import.subtitle": "Paste JSON authored by the Skill, or pick a file. Boards (board-v1) and Archify diagrams are detected automatically.", "import.placeholder": "{ \"schema_version\": 1, \"title\": \"…\", \"lanes\": [...], ... }", "import.file": "Choose file", "import.go": "Open in editor", "import.invalidJson": "JSON syntax error: {message}", "import.unknown": "Neither a board-v1 board nor an Archify diagram",
    "trash.title": "Trash", "trash.subtitle": "Deleted diagrams can be restored here. (Files are kept in library/.trash)", "trash.empty": "Trash is empty",
    "new.boards": "Process boards", "new.archify": "Archify diagrams",
    "engine.ok": "Engines ready · Archify {v}", "engine.noArchify": "Archify engine missing", "engine.boardOnly": "Board-only mode (no Archify)",
    "action.convertTo.workflow": "→ Convert to Archify workflow", "action.convertTo.board": "→ Convert to process board", "convert.hint": "Creates the same process as a document of the other engine and opens it in the editor (the original stays untouched until you save)",
    "toast.converted": "Converted — review in the editor, then save", "toast.convertedInvalid": "Converted with {n} validation errors — review in the editor", "side.renditions": "Other renditions (same title)",
    "misc.loading": "Loading…", "misc.notFound": "Diagram not found: {id}", "misc.updated": "updated {when}", "misc.searchHelp": "Separate terms with spaces to require all of them (e.g. cache redis)",
  },
};

const STORAGE_KEY = "hansol.lang";
let lang = "ko";
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  lang = stored === "en" || stored === "ko" ? stored : (navigator.language || "ko").toLowerCase().startsWith("ko") ? "ko" : "en";
} catch {
  lang = "ko";
}

export function getLang() {
  return lang;
}

export function setLang(next) {
  lang = next === "en" ? "en" : "ko";
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage may be unavailable; language still switches for this page
  }
  document.documentElement.lang = lang;
}

export function t(key, vars) {
  let text = DICT[lang][key] ?? DICT.en[key] ?? key;
  if (vars) for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}

export function kindLabel(kind) {
  return t(`kind.${kind || "invalid"}`);
}

export function applyStatic(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.getAttribute("data-i18n"));
}
