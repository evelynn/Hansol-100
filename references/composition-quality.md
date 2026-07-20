# Composition quality metrics

`node scripts/board.mjs audit board.json` computes a set of metrics against
the *actual* layout geometry the renderer produces (it reuses
`buildLayout`/`edgeRoute`/`orthogonalSegments` from `scripts/lib/layout.mjs`,
so the numbers match what you'd see in the SVG, not an approximation).

## The metrics

**`nodePiercings`** — the number of times an edge's routed path cuts through
an unrelated node's card (not the edge's own source or target), with a small
3px margin so grazing a border doesn't count. This is the worst readability
sin a diagram can have: because cards are drawn on top of edges (z-order),
a piercing edge visually looks like it originates from or terminates at the
wrong card, or just disappears behind one. **Budget: 0.** Unlike every other
metric, there is no tolerance for piercings — the renderer's gutter router
(routing in-row and return edges through the space between lanes rather than
straight through them) is specifically designed to keep this at zero for
well-formed boards. If you see piercings, it's a signal the board's shape
needs adjusting (see below), not that you should tolerate the render.

**`crossings`** — the number of times two different edges' routed segments
cross each other (one horizontal segment intersecting one vertical segment
from a different edge). Some crossings are unavoidable in a genuinely
tangled process (e.g. two loop-backs that both cross the main flow).
**Budget: ≤ 6.**

**`bendsPerEdgeMax`** — the most turns any single edge's route makes. A
straight or single-bend edge is easiest to trace visually; an edge that
zigzags through many bends to avoid other cards is harder to follow even if
it never pierces anything. **Budget: ≤ 4.**

**`routeStretchMax`** — the worst ratio of an edge's actual routed path
length to the direct (Manhattan) distance between its endpoints. A ratio
near 1.0 means the edge takes something close to the shortest path; a high
ratio means it's taking a long detour to avoid obstacles. The denominator is
floored at one card width so short loop/return edges (whose endpoints are
close together) don't produce misleadingly huge ratios — this metric is
about genuinely over-routed *long* edges. **Budget: ≤ 2.2.**

**`adjustedLabels`** — the number of edge labels the renderer had to nudge
away from their default position to avoid overlapping a card or another
label. A few adjustments are normal on a dense board; many indicates the
board is too crowded for its labels to sit cleanly. **Budget: ≤ 4.**

## The score

`audit` also prints a single `score` (also used internally by `validate`).
Lower is cleaner; 0 is a diagram with no piercings, no crossings, tight
routes, and no adjusted labels. It's a weighted sum where piercings dominate
(20 points each), crossings are worth 3 each, and bends/stretch/labels only
count once they exceed their soft budget. Use the score as a quick
"did my last edit make this better or worse" signal, not an absolute
readability grade — always cross-check `nodePiercings` first, since it's the
one metric this design will not compromise on.

## Fixing violations

- **Piercings:** almost always caused by an edge that has to jump over a
  node it isn't connected to, usually because two unrelated nodes ended up
  adjacent in the same stage, or an edge spans many stages. Reorder stages,
  move the node to a different lane/stage, or route through an intermediate
  node instead of one long edge.
- **Crossings / high stretch / many bends:** usually a sign of too many
  cross-lane edges relative to the number of stages. Consider whether a
  `message` edge is really needed, whether two loop paths can be merged, or
  whether adding an intermediate stage would let edges travel more directly.
- **Adjusted labels:** shorten edge labels, or reduce the number of labeled
  edges in a crowded stage.

Use `validate --strict` to turn budget violations into a hard CI failure;
use plain `audit` while iterating interactively.
