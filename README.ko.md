# Hansol-100 Studio

[English](README.md) · 📖 **한국어**

**프로세스 보드(순서도) + Archify 다이어그램 — 하나의 에이전트 스킬, 하나의 서비스.**

Hansol-100은 두 다이어그램 엔진을 하나의 제품으로 합쳤습니다. **에이전트 스킬**
(Claude Code / Codex가 JSON을 작성)로도, **서비스**(사람이 찾아보고·검색하고·
수정하고·내보내고·공유)로도 동작합니다.

| | 엔진 | 입력 → 출력 |
|---|---|---|
| 🧭 | **프로세스 보드** — [korea100studio](https://github.com/hosungseo/korea100studio) 세로형 swimlane 렌더러 | `board-v1` JSON(레인 × 단계 × 노드 × 연결) → SVG · PNG · 단계 순차 점등 모션 SVG, 구성 품질 감사 포함 |
| 🏗️ | **Archify** — [`engines/archify/`](engines/archify/)에 벤더링된 클린 스킬 패키지 | Archify 타입 JSON(architecture · workflow · sequence · dataflow · lifecycle) → 검증된 인터랙티브 독립 실행 HTML |
| 🌐 | **스튜디오 서비스** — `hansol100 serve` | `library/` 폴더의 JSON 파일 → 검색·뷰어·폼/JSON 편집기·실시간 미리보기·검증·내보내기·휴지통 복원·JSON API를 갖춘 웹 앱 |

**무조건적인 병합이 아닙니다.** 각 엔진은 단독으로도 온전히 동작하고, 합쳐졌을
때는 둘 다 혼자서는 못 하는 일이 생깁니다.

- **독립 동작** — korea100studio CLI는 손대지 않았습니다(`scripts/board.mjs`,
  `korea100studio` bin). Archify는 수정 없는 패키지로 소비되며 어디에 있어도
  됩니다: 벤더링된 복사본, 이미 스킬로 설치해 둔 Archify, 또는 체크아웃
  (`HANSOL_ARCHIFY_ROOT`). Archify가 전혀 없으면 **보드 전용 모드**로
  동작합니다(CLI·라이브러리·서비스 모두 유지). [엔진 독립성](#엔진-독립성) 참고.
- **시너지** — 두 엔진을 위한 하나의 JSON 우선 CLI/API/라이브러리/서비스, 엔진
  중립 `render`/`validate`, 그리고 결과가 대상 엔진 검증을 통과하는 **보드 ⇄
  Archify 워크플로 변환기**. 한 번 작성한 프로세스가 인쇄 품질의 정부 스타일
  보드와 인터랙티브·검증된 Archify 다이어그램 둘 다가 됩니다. [시너지](#시너지) 참고.

합쳐진 제품의 업데이트·수정은 이 저장소에서 합니다. 업스트림 Archify 변경은
명령 하나로 가져옵니다([Archify 엔진 업데이트](#archify-엔진-업데이트) 참고).

## 빠른 시작

```bash
git clone https://github.com/evelynn/Hansol-100.git
cd Hansol-100
npm install                       # 의존성은 ajv 하나뿐, 나머지는 순수 Node ≥ 20
node bin/hansol.mjs doctor        # 두 엔진이 준비됐는지 확인
node bin/hansol.mjs serve --open  # http://127.0.0.1:4100/ 에서 샘플 라이브러리 열기
```

에이전트 스킬로 설치 (Claude Code / Codex가 `SKILL.md`를 인식):

```bash
git clone https://github.com/evelynn/Hansol-100.git ~/.claude/skills/hansol100   # Claude Code
git clone https://github.com/evelynn/Hansol-100.git ~/.agents/skills/hansol100   # Codex
cd ~/.claude/skills/hansol100 && npm install && npm test
```

이후 채팅에서: *“신청인·담당자·결정기관이 관여하는 인허가 절차를 프로세스 보드로
그리고 라이브러리에 넣어줘”* 또는 *“Archify로 이 저장소의 런타임 아키텍처를
그려줘”*. 스킬이 엔진을 고르고 검증·렌더·감사·저장까지 하며, 서비스가 결과를
보여줍니다.

## 통합 CLI (`node bin/hansol.mjs` / `hansol100`)

| 명령 | 동작 |
|---|---|
| `render <file.json> [--out path] [--png] [--profile p] [--quality q] [--json]` | 엔진 자동 감지: 보드 → SVG(+PNG); Archify → 영수증과 함께 원자적 `deliver`로 HTML 생성 |
| `validate <file.json> [--strict] [--json]` | 보드: 스키마 + 참조 + 레이아웃(`--strict`면 예산 위반도 실패); Archify: `validate --json` |
| `audit <file.json> [--json]` | 구성 지표·점수(보드) 또는 Archify 영수증 |
| `detect <file.json> [--json]` | 파일이 어느 엔진/종류인지와 요약 |
| `convert <file.json> --to board\|workflow [--out path] [--orientation auto\|columns\|rows] [--quality q] [--profile p] [--json]` | 보드 ⇄ Archify 워크플로 변환; **최대 10단계**(≤6단계는 단계를 열로, 7–10단계는 단계를 행으로); 결과를 대상 엔진으로 검증(통과 못 하면 exit 1) |
| `board <render\|audit\|validate\|motion\|check> …` | korea100studio CLI(`scripts/board.mjs`) 그대로 전달 |
| `archify <render\|validate\|deliver\|guide\|compare\|…> …` | Archify CLI(`engines/archify/bin/archify.mjs`) 그대로 전달 |
| `library list\|search\|add\|show\|remove\|export\|path` | 서비스 콘텐츠 저장소 관리(`library/`, `--library DIR`, `HANSOL_LIBRARY`) |
| `serve [--port 4100] [--host 127.0.0.1] [--library DIR] [--open]` | 스튜디오 서비스 시작 |
| `doctor` | 환경 점검(Node, 엔진, PNG 래스터라이저, UI, 라이브러리) |

기존 `korea100studio …` bin도 하위 호환을 위해 그대로 남아 있습니다.

## 서비스

`hansol100 serve`는 의존성 없는 Node HTTP 서버입니다(기본 루프백; LAN 공유는
`--host 0.0.0.0` — 인증이 없으므로 팀 내부 도구로 쓰세요).

- **라이브러리** — 실시간 SVG 썸네일 카드, 종류 필터, 정렬, 검색(제목·부제·
  레인·단계·노드 라벨·메모/참조·연결 라벨). 한국어 부분 문자열 검색 지원
  (예: `심판 재결`), 여러 단어는 모두 포함돼야 매칭.
- **뷰어** — 보드는 맞춤/확대 컨트롤과 단계 순차 점등 모션 재생; Archify는
  자체 인터랙티브 뷰어(테마·검색·경로·스토리·내보내기)가 페이지 안에서 동작.
  사이드 패널에 정보, 레인/단계, 구성 지표(보드) 또는 9개 검사 검증 영수증(Archify).
- **편집기** — 보드: 기본 정보·레인·단계·노드·연결 폼(이름 변경 시 참조 자동
  갱신, 노드 삭제 시 연결 자동 정리) *그리고* JSON 탭, 둘 다 실시간 미리보기와
  구성 칩 표시; Archify: JSON 편집 + 실시간 미리보기 + 원할 때 showcase 검증.
  저장(`Ctrl/⌘+S`)은 낙관적 동시성 제어 — 다른 사람이 먼저 저장했으면 거부하고
  덮어쓰기/다시 불러오기를 선택. 유효하지 않은 초안도 의도적으로 저장 가능.
- **새로 만들기 / 가져오기 / 내보내기 / 휴지통** — 두 엔진 템플릿, 붙여넣기·
  파일 가져오기, JSON/SVG/PNG(브라우저 생성)/모션 SVG/HTML 내보내기, 소프트
  삭제와 복원.
- **JSON API** — `/api/diagrams`, `/api/preview`, `/api/validate`, 렌더 엔드포인트
  등([`docs/service.md`](docs/service.md)). 에이전트나 스크립트가 실행 중인
  스튜디오에 결과를 바로 넣을 수 있습니다.

## 엔진

### 프로세스 보드 (`board`)

보드는 [`schemas/board-v1.schema.json`](schemas/board-v1.schema.json)을 따릅니다:
`lanes`(행위자) × `stages`(단계) × `nodes`(`{id, lane, stage, label, emphasis,
note, refs}`) × `edges`(`{id, source, target, type, label}`). 프로필은
`default`(중립 영문)와 `gov`(korea100 한국 정부 룩: 선행/핵심/병목/회귀 배지,
조문 참조) 두 가지. `audit`는 실제 배선 지오메트리를 점수화합니다 —
`nodePiercings`(노드 관통)는 반드시 0, 교차·꺾임·우회율·라벨 조정은 소프트
예산. [`references/authoring.md`](references/authoring.md),
[`references/composition-quality.md`](references/composition-quality.md),
[`references/profiles.md`](references/profiles.md) 참고.

PNG는 `rsvg-convert`, `cairosvg`, 또는 아무 Chrome/Chromium
(`HANSOL_CHROME=/path/to/chrome`)으로 만들며, SVG는 아무것도 필요 없습니다.
웹 UI는 이들 없이도 브라우저에서 PNG를 내보냅니다.

### Archify (`archify`)

`engines/archify/`는 Archify의 클린 스킬 패키지(`archify.zip`과 동일한 파일
집합: 테스트·락파일·개발 도구 없음)에 업스트림 커밋을 기록한 `VENDOR.json`을
더한 것입니다. [`engines/archify/SKILL.md`](engines/archify/SKILL.md)가
설명하는 모든 기능 — `validate`, `deliver`, `preview`, `compare`,
`visual-check`, `guide`, `brands`, `migrate` — 이 그대로 동작합니다. 서비스는
Archify HTML을 요청 시 렌더하고 검증 영수증을 보여주며, CLI의 엔진 중립
`render`/`validate`는 Archify 자체의 `deliver --json` / `validate --json`을 씁니다.

## 엔진 독립성

| 모드 | 방법 | 동작 범위 |
|---|---|---|
| **전체**(기본) | 벤더링된 `engines/archify/` | 전부 |
| **외부 Archify** | `HANSOL_ARCHIFY_ROOT=/path/to/archify`(클린 패키지 또는 체크아웃의 `archify/` 디렉터리); 환경변수가 없고 벤더링 복사본도 없으면 `~/.claude/skills/archify`, `~/.agents/skills/archify`, `~/.config/opencode/skills/archify`, 형제 디렉터리 `../archify/archify`를 자동 탐색 | 전부, 단 *그* Archify로 — 중복 설치 불필요 |
| **보드 전용** | Archify가 어디에도 없음 | 보드·감사·모션·라이브러리·서비스·워크플로→보드 변환; Archify 명령은 명확한 메시지 한 줄로 실패, UI는 “보드 전용 모드” 표시, `doctor`는 선택 엔진으로 보고 |
| **Archify 단독** | Archify 저장소나 `npx skills add tt-a1i/archify`를 기존처럼 사용 | 변화 없음; Archify는 Hansol-100에 의존하지 않음 |

`node bin/hansol.mjs doctor`가 어떤 Archify를 어디서 쓰는지 보여줍니다.

## 시너지

- **두 엔진, 하나의 표면** — `render`/`validate`/`audit`/`detect`가 JSON에서
  엔진을 고르고, 라이브러리·검색·서비스·편집기가 두 종류를 같은 방식으로 다룹니다
  (뷰어·검증은 엔진별).
- **보드 ⇄ Archify 워크플로 변환** — `hansol100 convert`, `/api/convert`,
  뷰어의 “→ Archify 워크플로로 변환 / → 프로세스 보드로 변환” 버튼:
  - **최대 10단계** 보드 지원: 6단계 이하는 단계가 Archify 컬럼, 행위자가 레인이
    되고(고전적 좌→우 워크플로), 7–10단계는 전치되어 단계가 Archify 레인(행, 개수
    제한 없음), 행위자가 컬럼이 됩니다 — 세로형 보드와 같은 읽기 방향. 행위자가
    7명 이상이면 6개 열로 묶고 노드마다 행위자 이름을 표기. `--orientation rows`로
    어떤 보드든 전치 배치를 강제할 수 있습니다(빽빽한 한국어 보드에 더 깔끔한 경우가 많음);
  - 레인 → 레인, 단계 → 페이즈/컬럼, 노드 → 노드(`emphasis`를 Archify
    종류로 매핑하고 범례를 보드 용어 또는 `gov` 프로필의 선행/핵심/병목/회귀로
    재표기), `note`/`refs` → sublabel/tag, 연결 유형 → 역할
    (sequence/message/loop ↔ default/async/return);
  - Archify의 한 줄 텍스트 규칙을 지킵니다(노드 폭 맞춤, 너무 긴 텍스트는 줄이고
    전체 텍스트를 `cards`에 보존), 같은 칸의 노드는 `yOffset`으로 쌓고, 긴 회귀
    연결은 레인 위로 라우팅 — 변환 결과가 그대로 Archify 검증(standard)을 통과;
  - 변환된 문서의 역방향은 무손실입니다(눈에 보이는 “Hansol-100 · conversion”
    카드에 방향·프로필·단계/행위자 순서를 기록하고, 축약된 텍스트는 카드에서
    복원). 손으로 만든 Archify 워크플로도 페이즈·종류·역할로 보드가 됩니다;
  - 변환 결과는 편집기에 초안으로 열리고 원본은 저장 전까지 그대로입니다. 뷰어는
    같은 제목의 다른 형식을 나열해 보드와 인터랙티브 쌍둥이를 한 번에 오갑니다.

## Archify 엔진 업데이트

```bash
node scripts/sync-archify.mjs --from ../archify           # 체크아웃에서 클린 패키지를 스테이징해 engines/archify 갱신, VENDOR.json 기록
node scripts/sync-archify.mjs --from ../archify --check   # engines/archify가 그 체크아웃과 다르면 exit 1
npm test                                                  # 엔진 스모크: doctor, 타입별 검증, 렌더+검사, SKILL 경로 무결성
```

Archify 자체의 `scripts/stage-clean-skill.mjs`를 쓰므로 벤더링된 트리는
Archify 배포본과 바이트 단위로 동일합니다. [`docs/sync-archify.md`](docs/sync-archify.md) 참고.

## 저장소 구조

```
SKILL.md                  통합 스킬 진입점(두 엔진 + 서비스로 라우팅)
bin/hansol.mjs            통합 CLI
scripts/board.mjs         korea100studio CLI(변경 없음)
scripts/lib/              보드 엔진(layout, render, composition, motion, profiles) + 공용 라이브러리
                          (detect, archify-engine, library/search, rasterize)
scripts/server/           서비스: server.mjs(HTTP + API), ui/(바닐라 JS 웹 앱)
scripts/sync-archify.mjs  Archify 벤더링 스크립트
engines/archify/          벤더링된 Archify 스킬 패키지 + VENDOR.json
library/                  서비스 콘텐츠 저장소(샘플 보드 + Archify 다이어그램)
schemas/ templates/ references/ fixtures/   board-v1 계약, 시작 템플릿, 문서
docs/                     아키텍처, 서비스/API, 동기화 절차, 원래 설계 노트
tests/                    node:test 스위트(엔진, CLI, 라이브러리, 서버, 선택적 브라우저)
```

## 테스트

```bash
npm test                                             # 약 110개 테스트, 브라우저 불필요 (보드 전용·외부 Archify 모드 포함)
NODE_PATH=$(npm root -g) node --test tests/ui.browser.test.mjs   # 선택: 전역 Playwright로 실제 브라우저 UI 흐름 검증
```

## 크레딧과 라이선스

- 프로세스 보드 엔진: Hosung Seo의 [korea100studio](https://github.com/hosungseo/korea100studio)(MIT), 이 저장소의 기반 — [`LICENSE`](LICENSE).
- Archify: [tt-a1i/archify](https://github.com/tt-a1i/archify)(MIT; Cocoon AI의 architecture-diagram-generator 기반) — `engines/archify/`에 자체 `LICENSE`와 `THIRD_PARTY_NOTICES.md`와 함께 벤더링.
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) 참고.
