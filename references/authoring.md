# Authoring a board-v1 file

`board-v1` describes a process as a grid: **lanes** (who) × **stages**
(when), populated with **nodes** (actions) connected by **edges**
(relationships). The renderer draws lanes left→right and stages top→bottom.
The full field list and types are in `schemas/board-v1.schema.json`; this
page is about the *mapping* — turning a natural-language description into
those fields.

## Mapping a description onto the schema

| Process concept | board-v1 field | Notes |
|---|---|---|
| Actor, role, department, system | `lanes[]` (string) | One lane per distinct "who". Keep names short — they become column headers. Order matters: put the requester/applicant first, decision-makers last, roughly matching real handoff order. |
| Ordered phase of the process | `stages[]` (string) | One stage per row, in the order the process actually moves through. Prefix with a short code (`G0`, `G1`, ...) if stages need to read as a numbered sequence (the `gov` profile fixture does this). |
| A single actor-action within a phase | `nodes[]` object | One node per (actor, phase, action) triple. `id` must be unique; `lane` and `stage` must match strings in `lanes`/`stages` exactly. `label` is the card text — keep it to a short verb phrase ("Review application", "심리 개시"). Optional `note` adds a longer explanation shown in the card body. |
| How important / what kind of step | `nodes[].emphasis` | One of `lead`, `key`, `bottleneck`, `loop`, `normal`. See below. |
| Citation, legal basis, source | `nodes[].refs[]` | Array of `{ source, note? }`. Use for statute articles, policy documents, or any citation backing the step. Rendered under the `refsLabel` the active profile defines (e.g. "Refs" / "조문"). |
| A transition between actions | `edges[]` object | `id`, `source`, `target` (both must reference real node `id`s), `type`, optional `label`. |

### Choosing `emphasis`

- **`lead`** — the step that starts or drives a phase (the "first mover").
- **`key`** — the decisive/most consequential step in the process.
- **`bottleneck`** — a step known to stall or take disproportionate time.
- **`loop`** — a step that's re-entered from later in the process (rework,
  resubmission, appeal).
- **`normal`** — everything else. This is the default look; use it for
  routine steps that don't need to stand out.

Don't over-mark: a board where every node is `lead` or `key` loses the
signal. Aim for 1-2 `lead`/`key` nodes per stage at most, and reserve
`bottleneck`/`loop` for steps the user actually called out as slow or
recursive.

### Choosing edge `type`

- **`sequence`** — normal forward flow, usually within or between adjacent
  stages. This is the default if `type` is omitted.
- **`message`** — information/handoff passed between lanes without a full
  phase transition (e.g. a notice, a scope brief, a status update).
- **`loop`** — a return path to an earlier node (rework, appeal, retry). Pair
  this with `emphasis: "loop"` on the target node so the loop is visually
  legible from both the edge and the card it lands on.

## Worked example

Source description (2-3 sentences):

> A citizen submits a permit application online. A front-desk clerk checks it
> for completeness — if it's missing documents, it goes back to the citizen
> to fix and resubmit. Once complete, a reviewing officer evaluates the
> application and either approves it (permit issued) or rejects it with
> reasons.

Mapping: lanes = the three actors (`Citizen`, `Clerk`, `Officer`); stages =
the phases the application passes through (`Submit`, `Check`, `Review`,
`Decide`); the "missing documents" path becomes a `loop` edge back to a
`Citizen` node, and the reviewing officer's node is the `key` step since it's
the decisive one.

```json
{
  "schema_version": 1,
  "title": "Permit Application",
  "subtitle": "From online submission to approval or rejection",
  "lanes": ["Citizen", "Clerk", "Officer"],
  "stages": ["Submit", "Check", "Review", "Decide"],
  "nodes": [
    { "id": "n1", "lane": "Citizen", "stage": "Submit", "label": "Submit application online", "emphasis": "lead" },
    { "id": "n2", "lane": "Clerk", "stage": "Check", "label": "Check completeness", "emphasis": "normal" },
    { "id": "n3", "lane": "Citizen", "stage": "Check", "label": "Fix and resubmit", "emphasis": "loop", "note": "Re-entered when the clerk finds missing documents." },
    { "id": "n4", "lane": "Officer", "stage": "Review", "label": "Evaluate application", "emphasis": "key" },
    { "id": "n5", "lane": "Officer", "stage": "Decide", "label": "Issue permit", "emphasis": "lead" },
    { "id": "n6", "lane": "Officer", "stage": "Decide", "label": "Reject with reasons", "emphasis": "bottleneck", "note": "Requires a written rationale before the applicant can appeal." }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "type": "sequence" },
    { "id": "e2", "source": "n2", "target": "n3", "type": "loop", "label": "missing docs" },
    { "id": "e3", "source": "n3", "target": "n2", "type": "sequence", "label": "resubmit" },
    { "id": "e4", "source": "n2", "target": "n4", "type": "sequence", "label": "complete" },
    { "id": "e5", "source": "n4", "target": "n5", "type": "sequence" },
    { "id": "e6", "source": "n4", "target": "n6", "type": "sequence" }
  ]
}
```

Render it and check composition:

```bash
node scripts/board.mjs render permit.json --out permit.svg
node scripts/board.mjs audit permit.json
```

For a larger real-world example with `refs` citations and the `gov` profile,
see `fixtures/gov-sample.json`.
