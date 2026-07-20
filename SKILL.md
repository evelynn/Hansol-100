---
name: hansol-process-board
description: >-
  한솔 사내 업무 프로세스(또는 임의의 절차)를 — 자연어 설명, 표, 규정 문서
  어느 것으로 주어지든 — 부서(담당) × 단계 × 업무의 세로형 스윔레인 프로세스
  보드(SVG, 선택적 PNG)로 만들고, 구성 품질을 점검하고, 단계 순서 리빌
  애니메이션을 생성합니다. 사용자가 업무 흐름·결재 절차·승인 프로세스·누가 언제
  무엇을 하는지 시각화하려 할 때 사용하세요. Turn any business process or workflow
  into a vertical swimlane board; use for approval flows, procedures, and
  who-does-what-when. Works in Claude Code and Codex.
---

# 한솔 업무 프로세스 보드 (Hansol Process Board)

세로형 스윔레인 프로세스 보드 렌더러입니다. 레인(열)은 부서·담당, 단계(행)는
위→아래 순서의 국면입니다. 작은 JSON 파일(`board-v1`)을 작성한 뒤 하나의 CLI
(`scripts/board.mjs`)로 렌더링·점검·애니메이션을 모두 처리합니다.

기본 프로파일은 **`hansol`** (한솔 사내용, 한글 배지·범례)입니다. 사용자가
한국 행정 절차를 다룰 때는 `gov`, 중립 영문이 필요하면 `default`를 사용하세요.

## 워크플로

1. **프로세스를 도출한다.** 사용자가 준 것(설명, 표, 규정 문서, 메모)에서 다음을
   식별합니다:
   - **lanes** — 관여하는 부서·담당·역할 (열, 좌→우)
   - **stages** — 프로세스가 지나가는 순서 있는 국면 (행, 위→아래)
   - **nodes** — 한 단계 안의 부서별 업무 하나당 카드 하나 (`lane` × `stage` × `label`)
   - **edges** — 노드 연결: `sequence`(정상 흐름), `message`(부서 간 정보 공유·통보),
     `loop`(반려·재작업·재상신 회귀 경로)

2. **`board-v1` JSON을 작성한다.** `templates/board.template.json` 또는
   `fixtures/hansol-sample.json`에서 시작하세요. 전체 필드 참조:
   `schemas/board-v1.schema.json`. 매핑 지침과 워크드 예제: `references/authoring.md`.
   비개발 담당자용 한글 매뉴얼: `docs/manual/01-업무프로세스-입력-매뉴얼.md`.

3. **렌더링·점검·반복** — 아래 CLI로 `audit`가 node-piercings 0을 보고하고 지표가
   기준 안에 들 때까지 반복합니다.

## 자연어로 입력받을 때 (AI 입력)

사용자가 업무를 말로 설명하거나 규정·업무분장표·회의록을 붙여넣으면, 사용자에게
JSON을 직접 작성하게 하지 말고 **당신(에이전트)이** 워크플로 1~2단계를 수행해
`board-v1` JSON을 만든 뒤 렌더링하세요. 정보가 부족하면(부서 목록, 반려 경로,
어느 단계가 핵심/지연인지 등) 한두 가지만 짚어 되묻습니다. 자세한 대화 패턴과
프롬프트 예시: `docs/manual/02-AI-입력-가이드.md`.

## CLI

모든 명령: `node scripts/board.mjs <command> <board.json> [options]`

```bash
# SVG 렌더링 (기본 프로파일은 보드의 "profile" 필드 → 없으면 default).
# --png 는 librsvg/cairosvg 설치 시 PNG도 생성. --profile 로 프로파일 지정.
node scripts/board.mjs render fixtures/hansol-sample.json --out board.svg
node scripts/board.mjs render fixtures/hansol-sample.json --out board.svg --png --profile hansol

# 구성 품질 지표·점수 출력 (references/composition-quality.md 참고)
node scripts/board.mjs audit fixtures/hansol-sample.json

# 스키마 + 구성 품질 게이트. --strict 시 기준 위반이면 종료코드 1.
node scripts/board.mjs validate fixtures/hansol-sample.json --strict

# 단계 순서 리빌 애니메이션 (자기완결형 애니메이션 SVG)
node scripts/board.mjs motion fixtures/hansol-sample.json --out board.motion.svg

# 파일이 올바른 SVG인지 정합성 점검 (직접 손봤을 때 유용)
node scripts/board.mjs check board.svg
```

`--profile`을 생략하면 보드의 `"profile"` 필드 → `default` 순으로 적용됩니다.

## 검증–렌더 루프

한 번 렌더링하고 멈추지 마세요. `render` 후 `audit`을 실행합니다:

```bash
node scripts/board.mjs audit board.json
```

- **`nodePiercings`는 0이어야 합니다.** 최악의 가독성 문제 — 관련 없는 카드 뒤로
  선이 지나가 z-순서에 가려지는 경우입니다. 거터 라우터가 통상적인 보드에서는 같은
  행/회귀 선을 카드 뒤로 지나가지 않게 유지합니다. 그래도 piercing이 나오면 보통
  같은 레인/단계의 두 노드가 너무 가깝거나 한 선이 여러 단계를 가로지르는 경우이니,
  단계 재배치·노드 분할·중간 노드 경유로 해결하세요.
- **`crossings`, `bendsPerEdgeMax`, `routeStretchMax`, `adjustedLabels`** 는 soft
  기준입니다(`references/composition-quality.md`의 정확한 임계값 참고). 복잡한
  프로세스에서 약간의 crossing은 정상입니다. 반복 위반은 그래프를 단순화하라는
  신호로 보세요(부서 간 선·긴 회귀 줄이기).
- 스크립트/CI에서는 `validate --strict`로 기준 위반 시 빌드를 실패시키고, 반복
  작업 중에는 `audit`을 씁니다.

## 프로파일

- **`hansol`** — 한솔 사내용(기본 권장). 결재 흐름 한글 배지(주관/핵심/진행/지연/반려),
  부서·담당 기준 축·범례, 사내 규정 인용용 `근거` 라벨, 코퍼레이트 블루 강조색.
  일반 사내 업무·승인·구매·기안 프로세스에 사용.
- **`default`** — 중립 영문, 파랑/슬레이트 팔레트. 범용 워크플로용.
- **`gov`** — 한국 행정용: 한글 배지(선행/핵심/후속/병목/회귀), 조문 인용(`refsLabel: "조문"`),
  바이올렛 강조색. 법령 조문을 `refs`로 인용하는 행정·법무 절차에 사용.

배지 매핑, `refs`/`refsLabel` 렌더 방식, 새 프로파일 추가 방법: `references/profiles.md`.

## 참조 파일

- `docs/manual/00-소개.md` — 시스템 개요와 도입 배경.
- `docs/manual/01-업무프로세스-입력-매뉴얼.md` — 담당자용 직접 입력 매뉴얼(한글).
- `docs/manual/02-AI-입력-가이드.md` — AI로 손쉽게 입력하는 방법(권장, 한글).
- `references/authoring.md` — 자연어 프로세스를 board-v1 필드로 매핑하는 원리 + 워크드 예제.
- `references/composition-quality.md` — `audit` 지표의 의미와 기준 임계값.
- `references/profiles.md` — `default`/`gov`/`hansol` 프로파일 상세 및 확장 방법.
- `schemas/board-v1.schema.json` — 권위 있는 JSON 스키마.
- `templates/board.template.json` — 최소 시작 골격.
- `fixtures/hansol-sample.json`, `fixtures/generic-sample.json`, `fixtures/gov-sample.json`
  — 각 프로파일의 완전한 동작 예제.
